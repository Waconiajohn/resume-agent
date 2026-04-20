// Stage 3 — Strategize.
// One LLM call takes a StructuredResume + JobDescription and returns a
// Strategy document. Stage 4 executes the strategy; the strategy itself
// is strategic judgment centralized in a single LLM call.
//
// Implements: docs/v3-rebuild/01-Architecture-Vision.md §Stage 3,
//             docs/v3-rebuild/kickoffs/phase-4-kickoff.md.
//
// Phase 3.5: provider resolution goes through the factory. No direct
// provider imports. See docs/v3-rebuild/04-Decision-Log.md 2026-04-18.
//
// Phase 4.6: mechanical attribution check runs AFTER the LLM call.
// If any emphasizedAccomplishments.summary contains claim tokens not
// found in source, strategize retries ONCE with the offending phrases
// fed back as structured retry context. This prevents DeepSeek
// strategize from embellishing summaries that OpenAI write-position
// would faithfully inherit as fabrications (Phase 4.5 regression).
// Retry is explicit and visible; second-attempt failure surfaces loudly.
//
// Contract: stream + accumulate + parse + zod validate + attribution
// check + optional retry + loud throw.

import type { StreamEvent } from '../../lib/llm-provider.js';
import { loadPrompt } from '../prompts/loader.js';
import { getProvider } from '../providers/factory.js';
import { createV3Logger } from '../observability/logger.js';
import { StrategySchema } from './schema.js';
import {
  checkStrategizeAttribution,
  type StrategizeAttributionResult,
} from '../verify/attribution.js';
import type { JobDescription, Strategy, StructuredResume } from '../types.js';

const logger = createV3Logger('strategize');
const MAX_OUTPUT_TOKENS = 16_000;

export interface StrategizeOptions {
  variant?: string;
  signal?: AbortSignal;
  /**
   * Disable the Phase 4.6 attribution-retry loop. Default: false (retry on).
   * Primarily for tests that mock the LLM and don't want a second call.
   */
  disableAttributionRetry?: boolean;
}

export class StrategizeError extends Error {
  constructor(
    message: string,
    public readonly detail?: {
      promptName?: string;
      rawResponse?: string;
      validationIssues?: unknown;
      attribution?: StrategizeAttributionResult;
    },
  ) {
    super(message);
    this.name = 'StrategizeError';
  }
}

export interface StrategizeTelemetry {
  promptName: string;
  promptVersion: string;
  model: string;
  capability: string;
  backend: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  /** Phase 4.6: whether the attribution retry fired (true means second call was made). */
  attributionRetryFired: boolean;
  /** Phase 4.6: attribution pre-check result on the final accepted strategy. */
  attribution: StrategizeAttributionResult;
}

export interface StrategizeResult {
  strategy: Strategy;
  telemetry: StrategizeTelemetry;
}

export async function strategize(
  resume: StructuredResume,
  jd: JobDescription,
  options: StrategizeOptions = {},
): Promise<Strategy> {
  const { strategy } = await strategizeWithTelemetry(resume, jd, options);
  return strategy;
}

export async function strategizeWithTelemetry(
  resume: StructuredResume,
  jd: JobDescription,
  options: StrategizeOptions = {},
): Promise<StrategizeResult> {
  const variant = options.variant ?? 'v1';
  const promptName = `strategize.${variant}`;
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
      resumeCrossRoleHighlights: resume.crossRoleHighlights.length,
      resumeCustomSections: resume.customSections.length,
      jdChars: jd.text.length,
    },
    'strategize start',
  );

  // First attempt.
  let firstCall = await runLLM({
    provider,
    model,
    system: prompt.systemMessage,
    userMessage,
    temperature: prompt.temperature,
    signal: options.signal,
  });

  let totalInputTokens = firstCall.usage.input_tokens;
  let totalOutputTokens = firstCall.usage.output_tokens;

  let parsed = parseAndValidate(firstCall.text, promptName);
  let attribution = checkStrategizeAttribution(parsed, resume);
  let attributionRetryFired = false;

  // Phase 4.6 + Fix 3 (2026-04-19) — if the mechanical attribution check flags
  // unsourced tokens in summaries OR unsourced content words in
  // positioningFrame / targetDisciplinePhrase, retry once with the offending
  // phrases fed back as structured context.
  const needsRetry =
    attribution.summary.unverifiedCount > 0 ||
    attribution.summary.fieldsUnverifiedCount > 0;
  if (!options.disableAttributionRetry && needsRetry) {
    const unverifiedSummaries = attribution.summaries.filter((s) => !s.verified);
    const unverifiedFields = attribution.fields.filter((f) => !f.verified);
    logger.info(
      {
        promptName,
        unverifiedSummaryCount: attribution.summary.unverifiedCount,
        unverifiedFieldCount: attribution.summary.fieldsUnverifiedCount,
        totalMissingTokens: attribution.summary.totalMissingTokens,
        firstSummaryMissing: unverifiedSummaries[0]?.missingTokens.slice(0, 5),
        firstFieldMissing: unverifiedFields[0]
          ? `${unverifiedFields[0].field}: ${unverifiedFields[0].missingWords.slice(0, 5).join(', ')}`
          : null,
      },
      'strategize attribution retry triggered',
    );
    attributionRetryFired = true;

    const retryAddendum = buildAttributionRetryAddendum(
      unverifiedSummaries,
      unverifiedFields,
    );
    const retryCall = await runLLM({
      provider,
      model,
      system: `${prompt.systemMessage}\n\n---\n\n${retryAddendum}`,
      userMessage,
      temperature: prompt.temperature,
      signal: options.signal,
    });
    totalInputTokens += retryCall.usage.input_tokens;
    totalOutputTokens += retryCall.usage.output_tokens;

    parsed = parseAndValidate(retryCall.text, promptName);
    attribution = checkStrategizeAttribution(parsed, resume);

    const stillFailing =
      attribution.summary.unverifiedCount > 0 ||
      attribution.summary.fieldsUnverifiedCount > 0;
    if (stillFailing) {
      // Second attempt also failed attribution — surface loudly with detail.
      const failingSummaries = attribution.summaries.filter((s) => !s.verified);
      const failingFields = attribution.fields.filter((f) => !f.verified);
      const summaryDetail = failingSummaries
        .map(
          (s) =>
            `  [${s.summaryIndex}] pos=${s.positionIndex} text="${s.text.slice(0, 120)}" missing=[${s.missingTokens.slice(0, 6).join('; ')}]`,
        )
        .join('\n');
      const fieldDetail = failingFields
        .map(
          (f) =>
            `  [${f.field}] text="${f.text}" missingWords=[${f.missingWords.slice(0, 6).join(', ')}]`,
        )
        .join('\n');
      throw new StrategizeError(
        `Strategize attribution check failed on retry from ${model} via ${backend} (prompt ${promptName} v${prompt.version}). ` +
          `${attribution.summary.unverifiedCount} summaries and ${attribution.summary.fieldsUnverifiedCount} fields contain claims not found in the source resume:\n` +
          (summaryDetail ? `${summaryDetail}\n` : '') +
          (fieldDetail ? `${fieldDetail}\n` : '') +
          `Fix: tighten the strategize prompt (server/prompts/strategize.v${prompt.version}.md) ` +
          `to prevent the model from emitting phrases not present in source. Do NOT add a silent repair step here.`,
        {
          promptName,
          rawResponse: retryCall.text.slice(0, 500),
          attribution,
        },
      );
    }

    firstCall = retryCall; // keep last-known-good text for logging
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
      positioningFrame: parsed.positioningFrame,
      accomplishments: parsed.emphasizedAccomplishments.length,
      objections: parsed.objections.length,
      positionEmphasis: parsed.positionEmphasis.length,
      attributionRetryFired,
      attributionVerifiedCount: attribution.summary.verifiedCount,
      attributionUnverifiedCount: attribution.summary.unverifiedCount,
    },
    'strategize complete',
  );

  return {
    strategy: parsed,
    telemetry: {
      promptName,
      promptVersion: prompt.version,
      model,
      capability: prompt.capability,
      backend,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      durationMs,
      attributionRetryFired,
      attribution,
    },
  };
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

interface LLMCallInput {
  provider: ReturnType<typeof getProvider>['provider'];
  model: string;
  system: string;
  userMessage: string;
  temperature: number;
  signal?: AbortSignal;
}

interface LLMCallOutput {
  text: string;
  usage: { input_tokens: number; output_tokens: number };
}

async function runLLM(input: LLMCallInput): Promise<LLMCallOutput> {
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
    throw new StrategizeError(
      `Strategize returned empty response from ${input.model}.`,
    );
  }
  return { text: fullText, usage };
}

function parseAndValidate(rawText: string, promptName: string): Strategy {
  const cleaned = stripMarkdownJsonFence(rawText.trim());
  const parsed = parseJsonOrThrow(cleaned, promptName);
  return validateOrThrow(parsed, promptName, cleaned);
}

/**
 * Build the system-prompt addendum for the attribution retry. Lists each
 * unverified summary's missing tokens AND each unverified field's missing
 * content words so the model can rewrite specifically.
 */
function buildAttributionRetryAddendum(
  unverifiedSummaries: StrategizeAttributionResult['summaries'],
  unverifiedFields: StrategizeAttributionResult['fields'],
): string {
  const lines: string[] = [
    "RETRY: Your previous response contained phrases not present in the candidate's source resume. Rewrite the flagged content using ONLY phrases whose content words appear somewhere in the source resume (titles, bullets, scope fields, discipline, crossRoleHighlights). Keep unflagged content verbatim.",
  ];
  if (unverifiedFields.length > 0) {
    lines.push('');
    lines.push('Flagged fields (content words not found in source — drop or replace):');
    for (const f of unverifiedFields) {
      lines.push(`  [${f.field}]`);
      lines.push(`    current value: "${f.text}"`);
      lines.push(
        `    words not in source: ${f.missingWords.map((w) => `"${w}"`).join(', ')}`,
      );
      lines.push(
        `    (fix: replace industry/discipline qualifier with one the source supports, or drop the qualifier entirely and use a more generic frame)`,
      );
    }
  }
  if (unverifiedSummaries.length > 0) {
    lines.push('');
    lines.push('Flagged summaries (phrases not in source):');
    for (const s of unverifiedSummaries) {
      lines.push(`  [${s.summaryIndex}] positionIndex=${s.positionIndex}`);
      lines.push(`    current summary: "${s.text}"`);
      lines.push(
        `    phrases not in source (rewrite or remove these): ${s.missingTokens.map((t) => `"${t}"`).join(', ')}`,
      );
    }
  }
  lines.push('');
  lines.push(
    'Return the full Strategy JSON. Change only the flagged content; preserve unflagged fields verbatim.',
  );
  return lines.join('\n');
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
    throw new StrategizeError(
      `Strategize response is not valid JSON (prompt ${promptName}): ${err instanceof Error ? err.message : String(err)}`,
      { promptName, rawResponse: raw.slice(0, 500) },
    );
  }
}

function validateOrThrow(parsed: unknown, promptName: string, rawResponse: string): Strategy {
  const result = StrategySchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 20)
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`);
    throw new StrategizeError(
      `Strategize output did not match the Strategy schema (prompt ${promptName}). ` +
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
  return result.data as Strategy;
}
