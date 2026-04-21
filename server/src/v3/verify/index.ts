// Stage 5 — Verify.
// One LLM call reviews the WrittenResume against the StructuredResume and
// Strategy and returns a pass/fail with issues[]. Verify reports; it does
// not repair. Silent patching is forbidden (OPERATING-MANUAL.md).
//
// Implements: docs/v3-rebuild/01-Architecture-Vision.md §Stage 5,
//             docs/v3-rebuild/kickoffs/phase-4-kickoff.md.
//
// Phase 3.5: provider resolution via factory. No direct provider imports.
//
// 2026-04-21 — migrated to the shared structured-llm-call primitive
// (commit 2 of the structured-llm plan). Verify retries on BOTH JSON-parse
// and Zod-schema failure (that's the pre-migration Fix 8 policy). The
// VerifyError type + disableJsonRetry option are preserved. Mechanical
// attribution + intra-resume consistency checks + translate sidecar all
// run around the primitive, unchanged.

import { loadPrompt } from '../prompts/loader.js';
import { getProvider } from '../providers/factory.js';
import { createV3Logger } from '../observability/logger.js';
import {
  structuredLlmCall,
  StructuredLlmCallError,
  type StructuralError,
} from '../lib/structured-llm.js';
import { VerifyResultSchema } from './schema.js';
import { checkAttributionMechanically } from './attribution.js';
import { checkIntraResumeConsistency } from './consistency.js';
import { translateVerifyIssues, type TranslateTelemetry } from './translate.js';
import type {
  Strategy,
  StructuredResume,
  VerifyResult,
  WrittenResume,
} from '../types.js';

const logger = createV3Logger('verify');
const MAX_OUTPUT_TOKENS = 8_000;

export interface VerifyOptions {
  variant?: string;
  signal?: AbortSignal;
  /**
   * Disable the one-shot JSON/schema retry loop. Default: false (retry on).
   * Primarily for tests that mock the LLM and don't want a second call.
   * Originally added 2026-04-20 pm as Fix 8 of "Option 4"; preserved across
   * the 2026-04-21 migration to the shared structured-llm-call primitive.
   */
  disableJsonRetry?: boolean;
}

export class VerifyError extends Error {
  constructor(
    message: string,
    public readonly detail?: {
      promptName?: string;
      rawResponse?: string;
      validationIssues?: unknown;
    },
  ) {
    super(message);
    this.name = 'VerifyError';
  }
}

export interface VerifyTelemetry {
  promptName: string;
  promptVersion: string;
  model: string;
  capability: string;
  backend: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  /** Post-verify translation telemetry (user-facing message rewrite). */
  translate?: TranslateTelemetry;
  /**
   * True iff the one-shot JSON/schema-failure retry fired. Retry is a loud,
   * visible recovery mechanism — NOT a silent fallback. If the retry's
   * output also fails, verify throws.
   */
  jsonRetryFired: boolean;
}

export interface VerifyResultWithTelemetry {
  result: VerifyResult;
  telemetry: VerifyTelemetry;
}

export async function verify(
  resume: WrittenResume,
  source: StructuredResume,
  strategy: Strategy,
  options: VerifyOptions = {},
): Promise<VerifyResult> {
  const { result } = await verifyWithTelemetry(resume, source, strategy, options);
  return result;
}

export async function verifyWithTelemetry(
  written: WrittenResume,
  source: StructuredResume,
  strategy: Strategy,
  options: VerifyOptions = {},
): Promise<VerifyResultWithTelemetry> {
  const variant = options.variant ?? 'v1';
  const promptName = `verify.${variant}`;
  const prompt = loadPrompt(promptName);

  // Mechanical attribution pre-check (Phase 4 Intervention 2). For each
  // is_new:true bullet, extract claim tokens (dollar figures, percentages,
  // number+unit phrases, proper nouns, acronyms) and check whether each
  // appears as a substring in the source position's haystack. Results
  // inlined into the verify prompt as structured evidence; the verify LLM
  // uses this to focus attention on real attribution failures.
  const attribution = checkAttributionMechanically(written, source);

  const userMessage = prompt.userMessageTemplate
    .replaceAll('{{strategy_json}}', JSON.stringify(strategy, null, 2))
    .replaceAll('{{resume_json}}', JSON.stringify(source, null, 2))
    .replaceAll('{{written_json}}', JSON.stringify(written, null, 2))
    .replaceAll('{{attribution_json}}', JSON.stringify(attribution, null, 2));

  const { provider, model, backend } = getProvider(prompt.capability);
  const start = Date.now();

  logger.info(
    {
      promptName,
      promptVersion: prompt.version,
      capability: prompt.capability,
      model,
      backend,
      sourcePositions: source.positions.length,
      writtenPositions: written.positions.length,
      writtenCustomSections: written.customSections.length,
      attributionBullets: attribution.summary.totalBullets,
      attributionVerified: attribution.summary.verifiedCount,
      attributionUnverified: attribution.summary.unverifiedCount,
      attributionMissingTokens: attribution.summary.totalMissingTokens,
    },
    'verify start',
  );

  let validated: VerifyResult;
  let jsonRetryFired = false;
  let inputTokens: number;
  let outputTokens: number;

  try {
    const llmResult = await structuredLlmCall<VerifyResult>({
      provider,
      model,
      system: prompt.systemMessage,
      userMessage,
      temperature: prompt.temperature ?? 0.1,
      maxTokens: MAX_OUTPUT_TOKENS,
      signal: options.signal,
      schema: VerifyResultSchema,
      // Retry on BOTH json-parse and zod-schema (the Fix 8 policy).
      maxStructuralAttempts: options.disableJsonRetry ? 1 : 2,
      buildRetryAddendum: buildVerifyRetryAddendum,
      stage: 'verify',
      promptName,
      promptVersion: prompt.version,
    });

    validated = llmResult.parsed;
    jsonRetryFired = llmResult.retryFired;
    inputTokens = llmResult.usage.input_tokens;
    outputTokens = llmResult.usage.output_tokens;

    if (jsonRetryFired) {
      logger.info(
        { promptName, model, backend, retryReason: llmResult.retryReason },
        'verify JSON/schema retry succeeded',
      );
    }
  } catch (err) {
    if (err instanceof StructuredLlmCallError) {
      throw wrapAsVerifyError(err, promptName, prompt.version);
    }
    throw err;
  }
  // Mechanical intra-resume consistency check (2026-04-19). Adds errors
  // for number+noun contradictions in summary + selectedAccomplishments
  // that the verify LLM doesn't catch because its checks are all
  // source-to-rewrite, never within-rewrite. Motivating case: fixture-12
  // joel-hough summary says "three facilities" while an accomplishment
  // says "four distribution centers" — same canonical noun, different
  // numbers, a hiring-manager-visible tell.
  const consistencyIssues = checkIntraResumeConsistency(written);
  if (consistencyIssues.length > 0) {
    for (const issue of consistencyIssues) {
      validated.issues.push(issue);
      if (issue.severity === 'error') validated.passed = false;
    }
  }

  const durationMs = Date.now() - start;
  logger.info(
    {
      promptName,
      promptVersion: prompt.version,
      model,
      backend,
      passed: validated.passed,
      errors: validated.issues.filter((i) => i.severity === 'error').length,
      warnings: validated.issues.filter((i) => i.severity === 'warning').length,
      consistencyIssues: consistencyIssues.length,
      inputTokens,
      outputTokens,
      durationMs,
      jsonRetryFired,
    },
    'verify complete',
  );

  // Sidecar: translate verify messages into user-facing prose + filter
  // internal-QA noise. Non-fatal — on any failure, we return raw issues and
  // the frontend falls back to the raw text treatment.
  const translateResult = await translateVerifyIssues(
    validated.issues,
    source,
    { signal: options.signal },
  );
  if (translateResult.translated) {
    validated.translated = translateResult.translated;
  }

  return {
    result: validated,
    telemetry: {
      promptName,
      promptVersion: prompt.version,
      model,
      capability: prompt.capability,
      backend,
      inputTokens,
      outputTokens,
      durationMs,
      translate: translateResult.telemetry,
      jsonRetryFired,
    },
  };
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Verify retry addendum. Phrasing is preserved from the Fix 8 implementation
 * so downstream tests that assert on keyword presence ("not valid JSON" /
 * "schema validation") keep passing.
 */
function buildVerifyRetryAddendum(error: StructuralError): string {
  if (error.kind === 'json-parse') {
    return [
      'RETRY: Your previous response was not valid JSON. The JSON parser reported:',
      `  ${error.message}`,
      '',
      'Likely causes: the response was truncated (check that you closed every string and bracket), an unescaped quote appeared inside a string value, or prose/markdown was emitted alongside the JSON.',
      '',
      'Return ONLY the complete VerifyResult JSON object. No prose, no markdown fences, no partial output. Every string is properly quoted and terminated; every bracket/brace is balanced.',
    ].join('\n');
  }
  const issues = error.issues
    .slice(0, 20)
    .map((i) => `  • ${i.path.map((p) => String(p)).join('.') || '<root>'}: ${i.message}`);
  return [
    'RETRY: Your previous response failed VerifyResult schema validation. The schema reported:',
    '',
    issues.join('\n'),
    '',
    'Return the full VerifyResult JSON with these fields corrected. Preserve unflagged content verbatim. Return ONLY the JSON — no prose, no markdown fences.',
  ].join('\n');
}

/**
 * Translate a StructuredLlmCallError into the VerifyError shape existing
 * catch-sites (and tests) expect. Single-attempt failure yields the
 * "not valid JSON" or "did not match the VerifyResult schema" message.
 * Two-attempt failure yields the "failed on BOTH" message.
 */
function wrapAsVerifyError(
  err: StructuredLlmCallError,
  promptName: string,
  promptVersion: string,
): VerifyError {
  const { firstError, retryError, rawFirst, rawRetry } = err.detail;
  const rawResponse = (rawRetry ?? rawFirst).slice(0, 500);

  if (!retryError) {
    // Single attempt only (disableJsonRetry=true, or empty-response).
    if (firstError.kind === 'json-parse') {
      return new VerifyError(
        `Verify response is not valid JSON (prompt ${promptName} v${promptVersion}): ${firstError.message}`,
        { promptName, rawResponse },
      );
    }
    const issues = firstError.issues
      .slice(0, 20)
      .map((i) => `${i.path.map((p) => String(p)).join('.') || '<root>'}: ${i.message}`);
    return new VerifyError(
      `Verify output did not match the VerifyResult schema (prompt ${promptName} v${promptVersion}). ` +
        `Zod reported ${firstError.issues.length} issue(s): ` +
        issues.join('; '),
      { promptName, rawResponse, validationIssues: firstError.issues },
    );
  }

  // Both attempts failed.
  const fmt = (e: StructuralError): string =>
    e.kind === 'json-parse'
      ? `JSON parse: ${e.message}`
      : `Zod (${e.issues.length} issues): ` +
        e.issues
          .slice(0, 6)
          .map((i) => `${i.path.map((p) => String(p)).join('.') || '<root>'}: ${i.message}`)
          .join('; ');
  const validationIssues =
    firstError.kind === 'zod-schema' && retryError.kind === 'zod-schema'
      ? [...firstError.issues, ...retryError.issues]
      : undefined;
  return new VerifyError(
    `Verify output failed on BOTH the first attempt AND the retry (prompt ${promptName} v${promptVersion}). ` +
      `This indicates a systemic model-compliance issue, not a one-off flake. ` +
      `First attempt: ${fmt(firstError)}. ` +
      `Retry: ${fmt(retryError)}. ` +
      `Fix: strengthen the verify prompt, raise max_tokens if truncation, or investigate provider health.`,
    { promptName, rawResponse, validationIssues },
  );
}
