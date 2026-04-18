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

import type { StreamEvent } from '../../lib/llm-provider.js';
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

  // Streaming is used for classify because max_tokens at 32K exceeds the
  // Anthropic SDK's 10-minute non-streaming safety threshold and works well
  // on Vertex-hosted DeepSeek for long outputs.
  let fullText = '';
  let usage = { input_tokens: 0, output_tokens: 0 };
  for await (const event of provider.stream({
    model,
    system: prompt.systemMessage,
    messages: [{ role: 'user', content: userMessage }],
    max_tokens: MAX_OUTPUT_TOKENS,
    temperature: prompt.temperature,
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
      `Classify returned empty response from ${model} via ${backend} (prompt ${promptName} v${prompt.version}). ` +
        `The model emitted zero text content. This is an LLM-side failure — retry or check provider health.`,
      { promptName, rawResponse: fullText },
    );
  }

  // Mechanical fence strip before JSON.parse. DeepSeek-on-Vertex sometimes
  // wraps output in markdown fences even when the prompt forbids them; this
  // is a syntactic preprocessing step, not semantic repair.
  const cleaned = stripMarkdownJsonFence(fullText.trim());

  const parsed = parseJsonOrThrow(cleaned, promptName);
  const validated = validateOrThrow(parsed, promptName, cleaned);

  logger.info(
    {
      promptName,
      promptVersion: prompt.version,
      model,
      backend,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      durationMs,
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
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      durationMs,
    },
  };
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

function validateOrThrow(
  parsed: unknown,
  promptName: string,
  rawResponse: string,
): StructuredResume {
  const result = StructuredResumeSchema.safeParse(parsed);
  if (!result.success) {
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
  return result.data as StructuredResume;
}
