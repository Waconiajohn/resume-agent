// Stage 2 — Classify.
// One LLM call turns the plaintext from Stage 1 into a StructuredResume.
// All semantic parsing judgment lives in the prompt at
// server/prompts/classify.v<N>.md. No downstream stage second-guesses this
// output. If classify is wrong, fix the prompt, not downstream code.
//
// Implements: docs/v3-rebuild/01-Architecture-Vision.md §Stage 2,
//             docs/v3-rebuild/kickoffs/phase-3-kickoff.md §2.
//
// Phase 3.5: provider resolution goes through the factory (capability →
// provider/model). No direct provider imports. See
// docs/v3-rebuild/04-Decision-Log.md 2026-04-18 entry on Vertex-DeepSeek.
//
// 2026-04-21 — migrated to the shared structured-llm-call primitive
// (commit 2 of the structured-llm plan).
//
// 2026-04-25 — live VP Ops validation showed classify can emit transient
// malformed JSON after prompt hardening. Classify now uses the primitive's
// default structural retry policy (JSON.parse + Zod schema failure), while
// preserving the ClassifyError type + disableSchemaRetry option for backward
// compatibility. There is still no silent JSON repair or coercion.

import type { ZodIssue } from 'zod';
import { loadPrompt } from '../prompts/loader.js';
import { getProvider } from '../providers/factory.js';
import { createV3Logger } from '../observability/logger.js';
import {
  structuredLlmCall,
  StructuredLlmCallError,
  type StructuralError,
} from '../../lib/structured-llm.js';
import { StructuredResumeSchema } from './schema.js';
import type { ExtractResult, StructuredResume } from '../types.js';

const logger = createV3Logger('classify');

// Soft upper bound on output tokens. StructuredResume for an executive with
// 20 positions × 10 bullets × 200 chars/bullet + contact + education + skills
// is roughly 15-25K tokens of JSON. 32K gives comfortable headroom.
const MAX_OUTPUT_TOKENS = 32_000;

export interface ClassifyOptions {
  /** Prompt variant suffix (e.g. "v1" for classify.v1.md, "v2-test" for classify.v2-test.md). Defaults to "v1". */
  variant?: string;
  /** Optional caller-supplied abort signal. */
  signal?: AbortSignal;
  /**
   * Disable the structural one-shot retry loop. Default: false (retry on).
   * Primarily for tests that mock the LLM and don't want a second call.
   * Originally added 2026-04-20 pm as Fix 5 of "Option 4" — preserved across
   * the 2026-04-21 migration to the shared structured-llm-call primitive.
   */
  disableSchemaRetry?: boolean;
}

export class ClassifyError extends Error {
  constructor(
    message: string,
    public readonly detail?: {
      promptName?: string;
      rawResponse?: string;
      validationIssues?: unknown;
    },
  ) {
    super(message);
    this.name = 'ClassifyError';
  }
}

export interface ClassifyTelemetry {
  promptName: string;
  promptVersion: string;
  model: string;
  capability: string;
  backend: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  /**
   * True iff the one-shot structural retry fired. Retry is a loud, visible
   * recovery mechanism — NOT a silent fallback. If the retry's output also
   * fails validation, classify throws.
   */
  schemaRetryFired: boolean;
}

export interface ClassifyResult {
  resume: StructuredResume;
  telemetry: ClassifyTelemetry;
}

/**
 * Main entry point (pipeline-compatible). Takes the Stage 1 ExtractResult and
 * returns the StructuredResume.
 */
export async function classify(
  extracted: ExtractResult,
  options: ClassifyOptions = {},
): Promise<StructuredResume> {
  const { resume } = await classifyWithTelemetry(extracted, options);
  return resume;
}

/**
 * Variant that returns telemetry alongside the structured resume. Used by
 * scripts/classify-fixtures.mjs to track cost across iterations.
 */
export async function classifyWithTelemetry(
  extracted: ExtractResult,
  options: ClassifyOptions = {},
): Promise<ClassifyResult> {
  const variant = options.variant ?? 'v1';
  const promptName = `classify.${variant}`;
  const prompt = loadPrompt(promptName);

  const userMessage = prompt.userMessageTemplate.replaceAll(
    '{{resume_text}}',
    extracted.plaintext,
  );

  const { provider, model, backend } = getProvider(prompt.capability);

  logger.info(
    {
      promptName,
      promptVersion: prompt.version,
      capability: prompt.capability,
      model,
      backend,
      temperature: prompt.temperature,
      inputChars: extracted.plaintext.length,
    },
    'classify start',
  );

  try {
    const result = await structuredLlmCall<StructuredResume>({
      provider,
      model,
      system: prompt.systemMessage,
      userMessage,
      temperature: prompt.temperature ?? 0.2,
      maxTokens: MAX_OUTPUT_TOKENS,
      signal: options.signal,
      schema: StructuredResumeSchema,
      maxStructuralAttempts: options.disableSchemaRetry ? 1 : 2,
      buildRetryAddendum: buildClassifyRetryAddendum,
      stage: 'classify',
      promptName,
      promptVersion: prompt.version,
    });

    logger.info(
      {
        promptName,
        promptVersion: prompt.version,
        model,
        backend,
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
        durationMs: result.durationMs,
        schemaRetryFired: result.retryFired,
        positions: result.parsed.positions.length,
        education: result.parsed.education.length,
        certifications: result.parsed.certifications.length,
        careerGaps: result.parsed.careerGaps.length,
        crossRoleHighlights: result.parsed.crossRoleHighlights.length,
        customSections: result.parsed.customSections.length,
        flags: result.parsed.flags.length,
        overallConfidence: result.parsed.overallConfidence,
      },
      'classify complete',
    );

    return {
      resume: result.parsed,
      telemetry: {
        promptName,
        promptVersion: prompt.version,
        model,
        capability: prompt.capability,
        backend,
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
        durationMs: result.durationMs,
        schemaRetryFired: result.retryFired,
      },
    };
  } catch (err) {
    if (err instanceof StructuredLlmCallError) {
      throw wrapAsClassifyError(err, promptName, prompt.version);
    }
    throw err;
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Build the system-message addendum for a classify schema retry. The model
 * sees the full list of Zod validation paths + messages so it can fix each
 * one specifically without re-validating unflagged content.
 */
function buildClassifyRetryAddendum(error: StructuralError): string {
  if (error.kind === 'json-parse') {
    return [
      `RETRY: Your previous response was not valid JSON — the parser reported: ${error.message}.`,
      '',
      'Return ONLY the complete StructuredResume JSON object. No prose. No markdown fences.',
    ].join('\n');
  }
  return buildZodRetryAddendum(error.issues);
}

function buildZodRetryAddendum(issues: ReadonlyArray<ZodIssue>): string {
  const head = issues.slice(0, 20).map((i) => {
    const path = i.path.map((p) => String(p)).join('.');
    return `  • ${path || '<root>'}: ${i.message}`;
  });
  const more = issues.length > 20 ? `\n  • ...(${issues.length - 20} more)` : '';

  return [
    'RETRY: Your previous response failed StructuredResume schema validation. The schema reported the following issues:',
    '',
    head.join('\n') + more,
    '',
    'Return the full StructuredResume JSON with these fields corrected. Preserve all other content verbatim. Common fixes:',
    '  • Every `confidence` field is a number between 0.0 and 1.0 — NOT a boolean, NOT a string, NOT null.',
    '  • Every position needs a `dates` object. When the source has no date range, emit `dates: { start: null, end: null, raw: "<section label>" }` — do not omit the field.',
    '  • Required arrays may be empty but must be present: `education`, `certifications`, `skills`, `careerGaps`, `crossRoleHighlights`, `customSections`, `flags`.',
    '  • `null` vs missing field matters — optional nullable fields may be null; required fields must be present with the correct type.',
    '',
    'Return ONLY the JSON — no prose, no markdown fences.',
  ].join('\n');
}

/**
 * Translate a StructuredLlmCallError into the ClassifyError shape existing
 * catch-sites (and tests) expect. Single-attempt schema failure
 * (disableSchemaRetry path) yields the "did not match the StructuredResume
 * schema" message. Two-attempt failure yields the "structural validation
 * failed on BOTH" message.
 */
function wrapAsClassifyError(
  err: StructuredLlmCallError,
  promptName: string,
  promptVersion: string,
): ClassifyError {
  const { firstError, retryError, rawFirst, rawRetry } = err.detail;
  const rawResponse = (rawRetry ?? rawFirst).slice(0, 500);

  if (!retryError) {
    // Single attempt only (disableSchemaRetry=true, or empty-response).
    if (firstError.kind === 'json-parse') {
      return new ClassifyError(
        `Classify response is not valid JSON (prompt ${promptName} v${promptVersion}): ${firstError.message}. ` +
          `Fix: strengthen the prompt's "JSON only, no prose" requirement.`,
        { promptName, rawResponse },
      );
    }
    const issueSummary = firstError.issues
      .slice(0, 20)
      .map((i) => `${i.path.map((p) => String(p)).join('.') || '<root>'}: ${i.message}`);
    return new ClassifyError(
      `Classify output did not match the StructuredResume schema (prompt ${promptName} v${promptVersion}). ` +
        `Zod reported ${firstError.issues.length} issue(s): ` +
        issueSummary.join('; ') +
        (firstError.issues.length > 20 ? '; ...(more)' : '') +
        `. Fix: update the prompt's schema section or the prompt's hard rules to prevent this shape. ` +
        `Do NOT add a JSON-repair guardrail in code.`,
      { promptName, rawResponse, validationIssues: firstError.issues },
    );
  }

  // Two attempts, both failed.
  const firstSummary = summarizeError(firstError);
  const retrySummary = summarizeError(retryError);
  const firstCount = firstError.kind === 'zod-schema' ? firstError.issues.length : 1;
  const retryCount = retryError.kind === 'zod-schema' ? retryError.issues.length : 1;
  const validationIssues =
    firstError.kind === 'zod-schema' && retryError.kind === 'zod-schema'
      ? [...firstError.issues, ...retryError.issues]
      : undefined;

  return new ClassifyError(
    `Classify structural validation failed on BOTH the first attempt AND the retry (prompt ${promptName} v${promptVersion}). ` +
      `This indicates a systemic prompt/model compliance issue, not a one-off flake. ` +
      `First attempt (${firstCount} issues): ${firstSummary}. ` +
      `Retry (${retryCount} issues): ${retrySummary}. ` +
      `Fix: strengthen the prompt for the repeated failure pattern, or investigate whether the source resume has a pathological shape.`,
    { promptName, rawResponse, validationIssues },
  );
}

function summarizeError(err: StructuralError): string {
  if (err.kind === 'json-parse') return `JSON parse: ${err.message}`;
  return err.issues
    .slice(0, 10)
    .map((i) => `${i.path.map((p) => String(p)).join('.') || '<root>'}: ${i.message}`)
    .join('; ');
}
