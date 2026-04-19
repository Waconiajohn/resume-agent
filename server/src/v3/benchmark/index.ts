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
// Shape parallels strategize/index.ts: load prompt → get provider → stream →
// parse → zod validate → loud throw. No attribution retry (benchmark emits
// reference judgment, not claims that trace back to source bullets).

import type { StreamEvent } from '../../lib/llm-provider.js';
import { loadPrompt } from '../prompts/loader.js';
import { getProvider } from '../providers/factory.js';
import { createV3Logger } from '../observability/logger.js';
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
  const start = Date.now();

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
    if (e.type === 'text') fullText += e.text;
    else if (e.type === 'done') usage = e.usage;
  }

  if (!fullText.trim()) {
    throw new BenchmarkError(`Benchmark returned empty response from ${model}.`, { promptName });
  }

  const parsed = parseAndValidate(fullText, promptName);

  const durationMs = Date.now() - start;

  logger.info(
    {
      promptName,
      promptVersion: prompt.version,
      model,
      backend,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      durationMs,
      directMatches: parsed.directMatches.length,
      gaps: parsed.gapAssessment.length,
      objections: parsed.hiringManagerObjections.length,
    },
    'benchmark complete',
  );

  return {
    benchmark: parsed,
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
// Helpers
// -----------------------------------------------------------------------------

function parseAndValidate(rawText: string, promptName: string): BenchmarkProfile {
  const cleaned = stripMarkdownJsonFence(rawText.trim());
  const parsed = parseJsonOrThrow(cleaned, promptName);
  return validateOrThrow(parsed, promptName, cleaned);
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

function parseJsonOrThrow(raw: string, promptName: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new BenchmarkError(
      `Benchmark response is not valid JSON (prompt ${promptName}): ${err instanceof Error ? err.message : String(err)}`,
      { promptName, rawResponse: raw.slice(0, 500) },
    );
  }
}

function validateOrThrow(parsed: unknown, promptName: string, rawResponse: string): BenchmarkProfile {
  const result = BenchmarkProfileSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 20)
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`);
    throw new BenchmarkError(
      `Benchmark output did not match the BenchmarkProfile schema (prompt ${promptName}). ` +
        `Zod reported ${result.error.issues.length} issue(s): ` +
        issues.join('; ') +
        (result.error.issues.length > 20 ? '; ...(more)' : ''),
      {
        promptName,
        rawResponse: rawResponse.slice(0, 500),
        validationIssues: result.error.issues,
      },
    );
  }
  return result.data as BenchmarkProfile;
}
