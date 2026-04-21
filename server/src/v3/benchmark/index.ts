// Stage 3b — Benchmark.
//
// One LLM call takes a StructuredResume + JobDescription and returns a
// BenchmarkProfile describing what a strong candidate for the role looks like
// and how this specific candidate stacks up.
//
// Runs between classify and strategize. Strategize consumes this alongside
// the StructuredResume + JD so it can anti-calibrate against poorly-written
// JDs instead of slavishly matching JD phrasing.
//
// 2026-04-21 — migrated to the shared structured-llm-call primitive
// (commit 2 of the structured-llm plan). Benchmark previously had NO retry
// coverage — now it inherits the one-shot JSON/Zod retry with benchmark-
// specific addendum. The wrapping BenchmarkError type is preserved so
// existing catch-sites continue to work.

import { loadPrompt } from '../prompts/loader.js';
import { getProvider } from '../providers/factory.js';
import { createV3Logger } from '../observability/logger.js';
import {
  structuredLlmCall,
  StructuredLlmCallError,
  type StructuralError,
} from '../lib/structured-llm.js';
import { BenchmarkProfileSchema } from './schema.js';
import type { BenchmarkProfile, JobDescription, StructuredResume } from '../types.js';

const logger = createV3Logger('benchmark');
const MAX_OUTPUT_TOKENS = 8_000;

export interface BenchmarkOptions {
  variant?: string;
  signal?: AbortSignal;
}

export class BenchmarkError extends Error {
  constructor(
    message: string,
    public readonly detail?: {
      promptName?: string;
      rawResponse?: string;
      validationIssues?: unknown;
    },
  ) {
    super(message);
    this.name = 'BenchmarkError';
  }
}

export interface BenchmarkTelemetry {
  promptName: string;
  promptVersion: string;
  model: string;
  capability: string;
  backend: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  /**
   * True iff the structural-retry primitive fired a retry (first LLM call
   * produced output that failed JSON.parse or Zod validation; second call
   * succeeded). Added 2026-04-21 as part of benchmark's migration to the
   * shared structured-llm-call primitive.
   */
  schemaRetryFired: boolean;
}

export interface BenchmarkResult {
  benchmark: BenchmarkProfile;
  telemetry: BenchmarkTelemetry;
}

export async function benchmark(
  resume: StructuredResume,
  jd: JobDescription,
  options: BenchmarkOptions = {},
): Promise<BenchmarkProfile> {
  const { benchmark } = await benchmarkWithTelemetry(resume, jd, options);
  return benchmark;
}

export async function benchmarkWithTelemetry(
  resume: StructuredResume,
  jd: JobDescription,
  options: BenchmarkOptions = {},
): Promise<BenchmarkResult> {
  const variant = options.variant ?? 'v1';
  const promptName = `benchmark.${variant}`;
  const prompt = loadPrompt(promptName);

  const userMessage = prompt.userMessageTemplate
    .replaceAll('{{jd_text}}', jd.text)
    .replaceAll('{{resume_json}}', JSON.stringify(resume, null, 2));

  const { provider, model, backend } = getProvider(prompt.capability);

  logger.info(
    {
      promptName,
      promptVersion: prompt.version,
      capability: prompt.capability,
      model,
      backend,
      resumePositions: resume.positions.length,
      jdChars: jd.text.length,
      jdTitle: jd.title,
      jdCompany: jd.company,
    },
    'benchmark start',
  );

  try {
    const result = await structuredLlmCall<BenchmarkProfile>({
      provider,
      model,
      system: prompt.systemMessage,
      userMessage,
      temperature: prompt.temperature,
      maxTokens: MAX_OUTPUT_TOKENS,
      signal: options.signal,
      schema: BenchmarkProfileSchema,
      buildRetryAddendum: buildBenchmarkRetryAddendum,
      stage: 'benchmark',
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
        directMatches: result.parsed.directMatches.length,
        gaps: result.parsed.gapAssessment.length,
        objections: result.parsed.hiringManagerObjections.length,
      },
      'benchmark complete',
    );

    return {
      benchmark: result.parsed,
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
      throw wrapAsBenchmarkError(err, promptName, prompt.version);
    }
    throw err;
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function buildBenchmarkRetryAddendum(error: StructuralError): string {
  if (error.kind === 'json-parse') {
    return [
      `RETRY: Your previous response was not valid JSON — the parser reported: ${error.message}.`,
      '',
      'Likely causes: response truncated (unclosed string or bracket), unescaped quote inside a string, or prose/markdown alongside the JSON.',
      '',
      'Return ONLY the complete BenchmarkProfile JSON object. No prose. No markdown fences. Every string properly quoted; every bracket/brace balanced.',
    ].join('\n');
  }
  const issues = error.issues
    .slice(0, 20)
    .map((i) => `  • ${i.path.map((p) => String(p)).join('.') || '<root>'}: ${i.message}`);
  return [
    'RETRY: Your previous response failed BenchmarkProfile schema validation. The schema reported:',
    '',
    issues.join('\n'),
    '',
    'Return the full BenchmarkProfile JSON with these fields corrected. Preserve unflagged content verbatim. Common fixes:',
    '  • `directMatches` requires at least 1 entry and each `strength` is "strong" | "moderate" | "tangential".',
    '  • `gapAssessment` severities are "critical" | "manageable" | "minor" only.',
    '  • All required fields must be present; arrays may be empty only when the schema permits.',
    '',
    'Return ONLY the JSON — no prose, no markdown fences.',
  ].join('\n');
}

function wrapAsBenchmarkError(
  err: StructuredLlmCallError,
  promptName: string,
  promptVersion: string,
): BenchmarkError {
  const firstSummary = summarizeStructuralError(err.detail.firstError);
  const retrySummary = err.detail.retryError
    ? ` | retry: ${summarizeStructuralError(err.detail.retryError)}`
    : '';
  const rawResponse = (err.detail.rawRetry ?? err.detail.rawFirst).slice(0, 500);
  const validationIssues =
    err.detail.firstError.kind === 'zod-schema' ? err.detail.firstError.issues : undefined;
  return new BenchmarkError(
    `Benchmark failed on ${err.detail.retryError ? 'BOTH the first attempt AND the retry' : 'the first attempt'} ` +
      `(prompt ${promptName} v${promptVersion}). First: ${firstSummary}${retrySummary}. ` +
      `Fix: strengthen the prompt for the failure pattern, investigate provider health, or widen the schema if the emitted shape is semantically valid.`,
    { promptName, rawResponse, validationIssues },
  );
}

function summarizeStructuralError(err: StructuralError): string {
  if (err.kind === 'json-parse') return `JSON parse: ${err.message}`;
  const head = err.issues
    .slice(0, 5)
    .map((i) => `${i.path.map((p) => String(p)).join('.') || '<root>'}: ${i.message}`)
    .join('; ');
  const more = err.issues.length > 5 ? `; ...(${err.issues.length - 5} more)` : '';
  return `Zod (${err.issues.length} issue(s)): ${head}${more}`;
}
