// Stage 5 — Verify.
// One LLM call reviews the WrittenResume against the StructuredResume and
// Strategy and returns a pass/fail with issues[]. Verify reports; it does
// not repair. Silent patching is forbidden (OPERATING-MANUAL.md).
//
// Implements: docs/v3-rebuild/01-Architecture-Vision.md §Stage 5,
//             docs/v3-rebuild/kickoffs/phase-4-kickoff.md.
//
// Phase 3.5: provider resolution via factory. No direct provider imports.

import type { StreamEvent } from '../../lib/llm-provider.js';
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

  const durationMs = Date.now() - start;

  if (!fullText.trim()) {
    throw new VerifyError(
      `Verify returned empty response (prompt ${promptName}).`,
      { promptName, rawResponse: fullText },
    );
  }

  const cleaned = stripMarkdownJsonFence(fullText.trim());

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(cleaned);
  } catch (err) {
    throw new VerifyError(
      `Verify response is not valid JSON (prompt ${promptName}): ${err instanceof Error ? err.message : String(err)}`,
      { promptName, rawResponse: fullText.slice(0, 500) },
    );
  }

  const result = VerifyResultSchema.safeParse(parsedRaw);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 20)
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`);
    throw new VerifyError(
      `Verify output did not match the VerifyResult schema (prompt ${promptName}). ` +
        `Zod reported ${result.error.issues.length} issue(s): ` +
        issues.join('; '),
      { promptName, rawResponse: fullText.slice(0, 500), validationIssues: result.error.issues },
    );
  }

  const validated = result.data as VerifyResult;

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
    },
  };
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
