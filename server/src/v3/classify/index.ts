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
// Contract:
// - Prompt is loaded from server/prompts/ via the v3 prompt loader.
// - LLM provider is resolved via getProvider('strong-reasoning').
// - Response body is parsed as JSON; parse failure throws ClassifyError.
// - Parsed JSON is validated against StructuredResumeSchema (zod); schema
//   failure throws ClassifyError with the validation issues attached.
// - NO silent repair. No JSON-fixer. No fallback to regex. No guardrails.
//   OPERATING-MANUAL.md "No silent fallbacks": errors propagate visibly.

import type { LLMProvider, StreamEvent } from '../../lib/llm-provider.js';
import type { ZodError } from 'zod';
import { loadPrompt } from '../prompts/loader.js';
import { getProvider } from '../providers/factory.js';
import { createV3Logger } from '../observability/logger.js';
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
   * Disable the schema-failure one-shot retry loop. Default: false (retry on).
   * Primarily for tests that mock the LLM and don't want a second call.
   * Added 2026-04-20 pm as Fix 5 of "Option 4" — see
   * docs/v3-rebuild/reports/all-openai-19-fixture-validation-v2.md for the
   * gpt-5.4-mini schema-compliance regression class that motivated the retry.
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
   * True iff the one-shot schema-failure retry fired (first attempt produced
   * output that failed Zod validation; second attempt was made with the Zod
   * errors fed back as a system-message addendum). Retry is a loud, visible
   * recovery mechanism — NOT a silent fallback. If the retry's output also
   * fails validation, classify throws (same behavior as the pre-Fix-5 code).
   * Added 2026-04-20 pm.
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
  const start = Date.now();

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

  // First attempt.
  const firstCall = await streamClassify({
    provider,
    model,
    system: prompt.systemMessage,
    userMessage,
    temperature: prompt.temperature,
    signal: options.signal,
    promptName,
    promptVersion: prompt.version,
    backend,
  });

  let totalInputTokens = firstCall.usage.input_tokens;
  let totalOutputTokens = firstCall.usage.output_tokens;

  // Parse and validate the first attempt. JSON-parse errors throw
  // immediately (no retry path — a response that isn't JSON at all is an
  // LLM-side structural failure, not a schema-compliance one). Zod
  // validation failures trigger one retry with the validation errors fed
  // back as system-message context; this is the Fix 5 class added
  // 2026-04-20 pm. See docs/v3-rebuild/reports/all-openai-19-fixture-
  // validation-v2.md for the joel-hough regression that motivated this.
  const firstParsed = parseJsonOrThrow(firstCall.cleaned, promptName);
  const firstValidation = StructuredResumeSchema.safeParse(firstParsed);

  let validated: StructuredResume;
  let schemaRetryFired = false;

  if (firstValidation.success) {
    validated = firstValidation.data as StructuredResume;
  } else if (options.disableSchemaRetry) {
    // Tests / caller opted out of retry. Preserve pre-Fix-5 loud behavior.
    throwSchemaError(firstValidation.error, promptName, firstCall.cleaned);
    return undefined as never;
  } else {
    schemaRetryFired = true;
    const retryAddendum = buildSchemaRetryAddendum(firstValidation.error);
    logger.info(
      {
        promptName,
        model,
        backend,
        firstIssueCount: firstValidation.error.issues.length,
        firstIssuePaths: firstValidation.error.issues
          .slice(0, 5)
          .map((i) => i.path.join('.') || '<root>'),
      },
      'classify schema retry triggered',
    );

    const retryCall = await streamClassify({
      provider,
      model,
      system: `${prompt.systemMessage}\n\n---\n\n${retryAddendum}`,
      userMessage,
      temperature: prompt.temperature,
      signal: options.signal,
      promptName,
      promptVersion: prompt.version,
      backend,
    });
    totalInputTokens += retryCall.usage.input_tokens;
    totalOutputTokens += retryCall.usage.output_tokens;

    const retryParsed = parseJsonOrThrow(retryCall.cleaned, promptName);
    const retryValidation = StructuredResumeSchema.safeParse(retryParsed);

    if (retryValidation.success) {
      validated = retryValidation.data as StructuredResume;
      logger.info(
        { promptName, model, backend },
        'classify schema retry succeeded',
      );
    } else {
      // Both attempts failed validation. Throw with detail from both so the
      // operator can see the failure pattern and decide whether the prompt
      // needs further tightening.
      throwBothAttemptsFailed(
        firstValidation.error,
        retryValidation.error,
        promptName,
        firstCall.cleaned,
        retryCall.cleaned,
      );
      return undefined as never;
    }
  }

  const durationMs = Date.now() - start;

  logger.info(
    {
      promptName,
      promptVersion: prompt.version,
      model,
      backend,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      durationMs,
      schemaRetryFired,
      positions: validated.positions.length,
      education: validated.education.length,
      certifications: validated.certifications.length,
      careerGaps: validated.careerGaps.length,
      crossRoleHighlights: validated.crossRoleHighlights.length,
      customSections: validated.customSections.length,
      flags: validated.flags.length,
      overallConfidence: validated.overallConfidence,
    },
    'classify complete',
  );

  return {
    resume: validated,
    telemetry: {
      promptName,
      promptVersion: prompt.version,
      model,
      capability: prompt.capability,
      backend,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      durationMs,
      schemaRetryFired,
    },
  };
}

// -----------------------------------------------------------------------------
// Streaming + retry helpers
// -----------------------------------------------------------------------------

interface StreamClassifyInput {
  provider: LLMProvider;
  model: string;
  system: string;
  userMessage: string;
  temperature?: number;
  signal?: AbortSignal;
  promptName: string;
  promptVersion: string;
  backend: string;
}

interface StreamClassifyOutput {
  /** Raw response text (with markdown fence already stripped). */
  cleaned: string;
  usage: { input_tokens: number; output_tokens: number };
}

/**
 * Stream one classify LLM call and return the fence-stripped text plus
 * token usage. Empty-response check is enforced here so both the initial
 * attempt and the retry attempt get the same loud failure on empty output.
 */
async function streamClassify(input: StreamClassifyInput): Promise<StreamClassifyOutput> {
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
    if (e.type === 'text') {
      fullText += e.text;
    } else if (e.type === 'done') {
      usage = e.usage;
    }
  }

  if (!fullText || fullText.trim().length === 0) {
    throw new ClassifyError(
      `Classify returned empty response from ${input.model} via ${input.backend} (prompt ${input.promptName} v${input.promptVersion}). ` +
        `The model emitted zero text content. This is an LLM-side failure — retry or check provider health.`,
      { promptName: input.promptName, rawResponse: fullText },
    );
  }

  return {
    cleaned: stripMarkdownJsonFence(fullText.trim()),
    usage,
  };
}

/**
 * Build the system-message addendum for a classify schema retry. The model
 * sees the full list of Zod validation paths + messages so it can fix each
 * one specifically without re-validating unflagged content.
 */
function buildSchemaRetryAddendum(error: ZodError): string {
  const issues = error.issues.slice(0, 20).map((i) => {
    const path = i.path.map((p) => String(p)).join('.');
    return `  • ${path || '<root>'}: ${i.message}`;
  });
  const more = error.issues.length > 20 ? `\n  • ...(${error.issues.length - 20} more)` : '';

  return [
    'RETRY: Your previous response failed StructuredResume schema validation. The schema reported the following issues:',
    '',
    issues.join('\n') + more,
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

function throwSchemaError(
  error: ZodError,
  promptName: string,
  rawResponse: string,
): void {
  const issues = error.issues
    .slice(0, 20)
    .map((i) => `${i.path.map((p) => String(p)).join('.') || '<root>'}: ${i.message}`);
  throw new ClassifyError(
    `Classify output did not match the StructuredResume schema (prompt ${promptName}). ` +
      `Zod reported ${error.issues.length} issue(s): ` +
      issues.join('; ') +
      (error.issues.length > 20 ? '; ...(more)' : '') +
      `. Fix: update the prompt's schema section or the prompt's hard rules to prevent this shape. ` +
      `Do NOT add a JSON-repair guardrail in code.`,
    {
      promptName,
      rawResponse: rawResponse.slice(0, 500),
      validationIssues: error.issues,
    },
  );
}

function throwBothAttemptsFailed(
  first: ZodError,
  second: ZodError,
  promptName: string,
  firstRaw: string,
  secondRaw: string,
): void {
  const fmt = (err: ZodError) =>
    err.issues
      .slice(0, 10)
      .map((i) => `${i.path.map((p) => String(p)).join('.') || '<root>'}: ${i.message}`)
      .join('; ');
  throw new ClassifyError(
    `Classify schema validation failed on BOTH the first attempt AND the retry (prompt ${promptName}). ` +
      `This indicates a systemic prompt/model compliance issue, not a one-off flake. ` +
      `First attempt (${first.issues.length} issues): ${fmt(first)}. ` +
      `Retry (${second.issues.length} issues): ${fmt(second)}. ` +
      `Fix: strengthen the prompt for the repeated failure pattern, or investigate whether the source resume has a pathological shape.`,
    {
      promptName,
      rawResponse: secondRaw.slice(0, 500),
      validationIssues: [...first.issues, ...second.issues],
    },
  );
}

// -----------------------------------------------------------------------------
// Parsing & validation (mechanical; loud on failure)
// -----------------------------------------------------------------------------

function stripMarkdownJsonFence(input: string): string {
  const s = input.trim();
  const fenceStart = /^```(?:json|JSON)?\s*\n/;
  const fenceEnd = /\n```\s*$/;
  if (fenceStart.test(s) && fenceEnd.test(s)) {
    return s.replace(fenceStart, '').replace(fenceEnd, '').trim();
  }
  return s;
}

function parseJsonOrThrow(raw: string, promptName: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new ClassifyError(
      `Classify response is not valid JSON (prompt ${promptName}). ` +
        `The model emitted content that JSON.parse rejected: ${
          err instanceof Error ? err.message : String(err)
        }. ` +
        `First 500 chars of the response are in the error detail. ` +
        `Fix: strengthen the prompt's "JSON only, no prose" requirement.`,
      {
        promptName,
        rawResponse: raw.slice(0, 500),
      },
    );
  }
}

// validateOrThrow removed 2026-04-20 pm — superseded by Fix 5's inline
// safeParse + retry flow in classifyWithTelemetry. The failure-path branches
// now live in throwSchemaError (single-attempt fail; used via disableSchemaRetry)
// and throwBothAttemptsFailed (both-attempt fail; the loud post-retry throw).

