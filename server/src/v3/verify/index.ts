// Stage 5 — Verify.
// One LLM call reviews the WrittenResume against the StructuredResume and
// Strategy and returns a pass/fail with issues[]. Verify reports; it does
// not repair. Silent patching is forbidden (OPERATING-MANUAL.md).
//
// Implements: docs/v3-rebuild/01-Architecture-Vision.md §Stage 5,
//             docs/v3-rebuild/kickoffs/phase-4-kickoff.md.
//
// Phase 3.5: provider resolution via factory. No direct provider imports.

import type { LLMProvider, StreamEvent } from '../../lib/llm-provider.js';
import type { ZodError } from 'zod';
import { loadPrompt } from '../prompts/loader.js';
import { getProvider } from '../providers/factory.js';
import { createV3Logger } from '../observability/logger.js';
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
   * Added 2026-04-20 pm as Fix 8 of "Option 4" — see
   * docs/v3-rebuild/reports/all-openai-19-fixture-validation-v3.md for the
   * gpt-5.4-mini verify-stage truncation regression (fixture-07 diana-downs).
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
   * True iff the one-shot JSON/schema-failure retry fired (first attempt
   * produced output that failed JSON.parse or Zod validation; second
   * attempt was made with the error fed back as system-message addendum).
   * Retry is a loud, visible recovery mechanism — NOT a silent fallback.
   * If the retry's output also fails, verify throws. Added 2026-04-20 pm.
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

  const firstCall = await streamVerify({
    provider,
    model,
    system: prompt.systemMessage,
    userMessage,
    temperature: prompt.temperature,
    signal: options.signal,
    promptName,
  });

  let totalInputTokens = firstCall.usage.input_tokens;
  let totalOutputTokens = firstCall.usage.output_tokens;

  // Parse + validate the first attempt. On JSON.parse failure or Zod
  // validation failure, fire ONE retry with the error fed back as a
  // system-message addendum. If the retry also fails, throw.
  // Added 2026-04-20 pm (Fix 8 of Option 4). See
  // docs/v3-rebuild/reports/all-openai-19-fixture-validation-v3.md for
  // the fixture-07 diana-downs truncation regression that motivated this.
  const firstResult = tryParseAndValidateVerify(firstCall.cleaned);

  let validated: VerifyResult;
  let jsonRetryFired = false;

  if (firstResult.ok) {
    validated = firstResult.data;
  } else if (options.disableJsonRetry) {
    throwVerifyFailure(firstResult.error, promptName, firstCall.cleaned);
    return undefined as never;
  } else {
    jsonRetryFired = true;
    const retryAddendum = buildJsonRetryAddendum(firstResult.error);
    logger.info(
      {
        promptName,
        model,
        backend,
        firstErrorKind: firstResult.error.kind,
      },
      'verify JSON/schema retry triggered',
    );
    const retryCall = await streamVerify({
      provider,
      model,
      system: `${prompt.systemMessage}\n\n---\n\n${retryAddendum}`,
      userMessage,
      temperature: prompt.temperature,
      signal: options.signal,
      promptName,
    });
    totalInputTokens += retryCall.usage.input_tokens;
    totalOutputTokens += retryCall.usage.output_tokens;

    const retryResult = tryParseAndValidateVerify(retryCall.cleaned);
    if (retryResult.ok) {
      validated = retryResult.data;
      logger.info(
        { promptName, model, backend },
        'verify JSON/schema retry succeeded',
      );
    } else {
      throwBothVerifyAttemptsFailed(
        firstResult.error,
        retryResult.error,
        promptName,
        firstCall.cleaned,
        retryCall.cleaned,
      );
      return undefined as never;
    }
  }
  const durationMs = Date.now() - start;
  const usage = { input_tokens: totalInputTokens, output_tokens: totalOutputTokens };

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
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      durationMs,
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
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      durationMs,
      translate: translateResult.telemetry,
      jsonRetryFired,
    },
  };
}

// -----------------------------------------------------------------------------
// Streaming + retry helpers (Fix 8, 2026-04-20 pm)
// -----------------------------------------------------------------------------

interface StreamVerifyInput {
  provider: LLMProvider;
  model: string;
  system: string;
  userMessage: string;
  temperature?: number;
  signal?: AbortSignal;
  promptName: string;
}

interface StreamVerifyOutput {
  cleaned: string;
  usage: { input_tokens: number; output_tokens: number };
}

/**
 * Stream one verify LLM call, fence-strip, and enforce non-empty output.
 * Empty-response is thrown as a VerifyError (NOT retryable — that's an
 * LLM-side drop, not a parse issue).
 */
async function streamVerify(input: StreamVerifyInput): Promise<StreamVerifyOutput> {
  let fullText = '';
  let usage = { input_tokens: 0, output_tokens: 0 };
  for await (const event of input.provider.stream({
    model: input.model,
    system: input.system,
    messages: [{ role: 'user', content: input.userMessage }],
    max_tokens: MAX_OUTPUT_TOKENS,
    temperature: input.temperature,
    signal: input.signal,
  })) {
    const e = event as StreamEvent;
    if (e.type === 'text') fullText += e.text;
    else if (e.type === 'done') usage = e.usage;
  }
  if (!fullText.trim()) {
    throw new VerifyError(
      `Verify returned empty response (prompt ${input.promptName}).`,
      { promptName: input.promptName, rawResponse: fullText },
    );
  }
  return { cleaned: stripMarkdownJsonFence(fullText.trim()), usage };
}

type VerifyParseError =
  | { kind: 'json'; message: string }
  | { kind: 'schema'; zod: ZodError };

function tryParseAndValidateVerify(
  cleaned: string,
): { ok: true; data: VerifyResult } | { ok: false; error: VerifyParseError } {
  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(cleaned);
  } catch (err) {
    return {
      ok: false,
      error: { kind: 'json', message: err instanceof Error ? err.message : String(err) },
    };
  }
  const result = VerifyResultSchema.safeParse(parsedRaw);
  if (!result.success) {
    return { ok: false, error: { kind: 'schema', zod: result.error } };
  }
  return { ok: true, data: result.data as VerifyResult };
}

/**
 * Retry addendum appended to the system message. The model sees the
 * specific failure (JSON-parse vs Zod schema) plus the usual "return
 * ONLY the JSON" reminder.
 */
function buildJsonRetryAddendum(error: VerifyParseError): string {
  if (error.kind === 'json') {
    return [
      'RETRY: Your previous response was not valid JSON. The JSON parser reported:',
      `  ${error.message}`,
      '',
      'Likely causes: the response was truncated (check that you closed every string and bracket), an unescaped quote appeared inside a string value, or prose/markdown was emitted alongside the JSON.',
      '',
      'Return ONLY the complete VerifyResult JSON object. No prose, no markdown fences, no partial output. Every string is properly quoted and terminated; every bracket/brace is balanced.',
    ].join('\n');
  }
  const issues = error.zod.issues
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

function throwVerifyFailure(
  error: VerifyParseError,
  promptName: string,
  rawResponse: string,
): void {
  if (error.kind === 'json') {
    throw new VerifyError(
      `Verify response is not valid JSON (prompt ${promptName}): ${error.message}`,
      { promptName, rawResponse: rawResponse.slice(0, 500) },
    );
  }
  const issues = error.zod.issues
    .slice(0, 20)
    .map((i) => `${i.path.map((p) => String(p)).join('.') || '<root>'}: ${i.message}`);
  throw new VerifyError(
    `Verify output did not match the VerifyResult schema (prompt ${promptName}). ` +
      `Zod reported ${error.zod.issues.length} issue(s): ` +
      issues.join('; '),
    { promptName, rawResponse: rawResponse.slice(0, 500), validationIssues: error.zod.issues },
  );
}

function throwBothVerifyAttemptsFailed(
  first: VerifyParseError,
  second: VerifyParseError,
  promptName: string,
  firstRaw: string,
  secondRaw: string,
): void {
  const fmt = (e: VerifyParseError): string =>
    e.kind === 'json'
      ? `JSON parse: ${e.message}`
      : `Zod (${e.zod.issues.length} issues): ` +
        e.zod.issues
          .slice(0, 6)
          .map((i) => `${i.path.map((p) => String(p)).join('.') || '<root>'}: ${i.message}`)
          .join('; ');
  throw new VerifyError(
    `Verify output failed on BOTH the first attempt AND the retry (prompt ${promptName}). ` +
      `This indicates a systemic model-compliance issue, not a one-off flake. ` +
      `First attempt: ${fmt(first)}. ` +
      `Retry: ${fmt(second)}. ` +
      `Fix: strengthen the verify prompt, raise max_tokens if truncation, or investigate provider health.`,
    {
      promptName,
      rawResponse: secondRaw.slice(0, 500),
      validationIssues:
        first.kind === 'schema' && second.kind === 'schema'
          ? [...first.zod.issues, ...second.zod.issues]
          : undefined,
    },
  );
}

function stripMarkdownJsonFence(input: string): string {
  const s = input.trim();
  const fenceStart = /^```(?:json|JSON)?\s*\n/;
  const fenceEnd = /\n```\s*$/;
  if (fenceStart.test(s) && fenceEnd.test(s)) {
    return s.replace(fenceStart, '').replace(fenceEnd, '').trim();
  }
  return s;
}
