// Stage 2 — Classify.
// One LLM call turns the plaintext from Stage 1 into a StructuredResume.
// All semantic parsing judgment lives in the prompt at
// server/prompts/classify.v<N>.md. No downstream stage second-guesses this
// output. If classify is wrong, fix the prompt, not downstream code.
//
// Implements: docs/v3-rebuild/01-Architecture-Vision.md §Stage 2,
//             docs/v3-rebuild/kickoffs/phase-3-kickoff.md §2.
//
// Contract:
// - Prompt is loaded from server/prompts/ via the v3 prompt loader.
// - LLM call goes through server/src/lib/llm-provider.ts (AnthropicProvider).
// - Response body is parsed as JSON; parse failure throws ClassifyError.
// - Parsed JSON is validated against StructuredResumeSchema (zod); schema
//   failure throws ClassifyError with the validation issues attached.
// - NO silent repair. No JSON-fixer. No fallback to regex. No guardrails.
//   OPERATING-MANUAL.md "No silent fallbacks": errors propagate visibly.

import { AnthropicProvider, type StreamEvent } from '../../lib/llm-provider.js';
import { loadPrompt } from '../prompts/loader.js';
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
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

export interface ClassifyResult {
  resume: StructuredResume;
  telemetry: ClassifyTelemetry;
}

/**
 * Main entry point (pipeline-compatible). Takes the Stage 1 ExtractResult and
 * returns the StructuredResume. This signature matches what runPipeline() calls
 * today; downstream stages consume the StructuredResume directly.
 *
 * Production path uses this — it discards the telemetry. The fixture runner
 * uses `classifyWithTelemetry` to capture tokens/cost for the eval report.
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

  const provider = new AnthropicProvider();
  const start = Date.now();

  logger.info(
    {
      promptName,
      promptVersion: prompt.version,
      model: prompt.model,
      temperature: prompt.temperature,
      inputChars: extracted.plaintext.length,
    },
    'classify start',
  );

  // Use streaming — max_tokens at 32K exceeds the SDK's 10-minute non-streaming
  // safety threshold. Streaming also gives us incremental token accounting
  // and survives the longest-running fixture.
  //
  // Temperature note: Claude Opus 4.7 does not accept the `temperature`
  // parameter (Anthropic API returns
  //   "temperature is deprecated for this model").
  // The prompt YAML's `temperature: 0.2` is kept as documentation of intent;
  // the actual call omits the parameter. If a later variant uses a model that
  // still honors temperature, wire it through here.
  let fullText = '';
  let usage = { input_tokens: 0, output_tokens: 0 };
  for await (const event of provider.stream({
    model: prompt.model,
    system: prompt.systemMessage,
    messages: [{ role: 'user', content: userMessage }],
    max_tokens: MAX_OUTPUT_TOKENS,
    signal: options.signal,
  })) {
    const e = event as StreamEvent;
    if (e.type === 'text') {
      fullText += e.text;
    } else if (e.type === 'done') {
      usage = e.usage;
    }
  }

  const durationMs = Date.now() - start;

  if (!fullText || fullText.trim().length === 0) {
    throw new ClassifyError(
      `Classify returned empty response from ${prompt.model} (prompt ${promptName} v${prompt.version}). ` +
        `The model emitted zero text content. This is an LLM-side failure — retry or check provider health.`,
      { promptName, rawResponse: fullText },
    );
  }

  const parsed = parseJsonOrThrow(fullText, promptName);
  const validated = validateOrThrow(parsed, promptName, fullText);

  logger.info(
    {
      promptName,
      promptVersion: prompt.version,
      model: prompt.model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      durationMs,
      positions: validated.positions.length,
      education: validated.education.length,
      certifications: validated.certifications.length,
      careerGaps: validated.careerGaps.length,
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
      model: prompt.model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      durationMs,
    },
  };
}

// -----------------------------------------------------------------------------
// Parsing & validation (mechanical; loud on failure)
// -----------------------------------------------------------------------------

function parseJsonOrThrow(raw: string, promptName: string): unknown {
  // Strip any leading/trailing whitespace. Do NOT strip markdown fences —
  // the prompt explicitly forbids them, and if they appear we want the
  // failure to be visible rather than papered over.
  const trimmed = raw.trim();

  try {
    return JSON.parse(trimmed);
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
        rawResponse: trimmed.slice(0, 500),
      },
    );
  }
}

function validateOrThrow(
  parsed: unknown,
  promptName: string,
  rawResponse: string,
): StructuredResume {
  const result = StructuredResumeSchema.safeParse(parsed);
  if (!result.success) {
    // Compress zod issues into a readable list for the error message.
    const issues = result.error.issues
      .slice(0, 20)
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`);
    throw new ClassifyError(
      `Classify output did not match the StructuredResume schema (prompt ${promptName}). ` +
        `Zod reported ${result.error.issues.length} issue(s): ` +
        issues.join('; ') +
        (result.error.issues.length > 20 ? '; ...(more)' : '') +
        `. Fix: update the prompt's schema section or the prompt's hard rules to prevent this shape. ` +
        `Do NOT add a JSON-repair guardrail in code.`,
      {
        promptName,
        rawResponse: rawResponse.slice(0, 500),
        validationIssues: result.error.issues,
      },
    );
  }
  // zod's infer produces a structurally-compatible shape; the StructuredResume
  // type in types.ts uses the same field names. Cast is safe.
  return result.data as StructuredResume;
}
