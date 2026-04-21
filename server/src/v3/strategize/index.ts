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
// 2026-04-21 — migrated to the shared structured-llm-call primitive
// (commit 2 of the structured-llm plan). The primitive owns ONLY the
// structural retry (JSON.parse + Zod). The Phase 4.6 attribution retry
// layers OUTSIDE the primitive and passes maxStructuralAttempts=1 so
// stacked retries don't compound LLM call counts — mirrors the
// write/pronoun-retry pattern.

import type { LLMProvider } from '../../lib/llm-provider.js';
import { loadPrompt } from '../prompts/loader.js';
import { getProvider } from '../providers/factory.js';
import { createV3Logger } from '../observability/logger.js';
import {
  structuredLlmCall,
  StructuredLlmCallError,
  type StructuralError,
} from '../lib/structured-llm.js';
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
  /**
   * True iff the primitive's structural retry fired on either the first LLM
   * call or the attribution-retry LLM call. Added 2026-04-21 as part of the
   * strategize migration to the shared structured-llm-call primitive.
   */
  schemaRetryFired: boolean;
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

  // First attempt — primitive handles json-parse + zod-schema retries.
  let firstStructured = await callStrategizeLLM({
    provider,
    model,
    system: prompt.systemMessage,
    userMessage,
    temperature: prompt.temperature,
    signal: options.signal,
    promptName,
    promptVersion: prompt.version,
    // Primitive structural retries allowed on first call.
    maxStructuralAttempts: 2,
  });
  let schemaRetryFired = firstStructured.retryFired;

  let totalInputTokens = firstStructured.usage.input_tokens;
  let totalOutputTokens = firstStructured.usage.output_tokens;
  let parsed: Strategy = firstStructured.parsed;
  let attribution = checkStrategizeAttribution(parsed, resume, jd);
  let attributionRetryFired = false;
  let lastRawForError = '';

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

    // Attribution retry is a SEMANTIC retry — cap primitive structural
    // attempts at 1 so stacked retries don't compound LLM call counts.
    const retryStructured = await callStrategizeLLM({
      provider,
      model,
      system: `${prompt.systemMessage}\n\n---\n\n${retryAddendum}`,
      userMessage,
      temperature: prompt.temperature,
      signal: options.signal,
      promptName,
      promptVersion: prompt.version,
      maxStructuralAttempts: 1,
    });
    totalInputTokens += retryStructured.usage.input_tokens;
    totalOutputTokens += retryStructured.usage.output_tokens;
    if (retryStructured.retryFired) schemaRetryFired = true;

    parsed = retryStructured.parsed;
    attribution = checkStrategizeAttribution(parsed, resume, jd);
    lastRawForError = retryStructured.rawResponse;

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
        .map((f) => {
          const parts = [`  [${f.field}] text="${f.text}"`];
          if (f.missingWords.length > 0) {
            parts.push(`missingWords=[${f.missingWords.slice(0, 6).join(', ')}]`);
          }
          if (f.leakedPhrases.length > 0) {
            parts.push(
              `leakedPhrases=[${f.leakedPhrases.slice(0, 6).map((p) => `"${p}"`).join(', ')}]`,
            );
          }
          return parts.join(' ');
        })
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
          rawResponse: lastRawForError.slice(0, 500),
          attribution,
        },
      );
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
      positioningFrame: parsed.positioningFrame,
      accomplishments: parsed.emphasizedAccomplishments.length,
      objections: parsed.objections.length,
      positionEmphasis: parsed.positionEmphasis.length,
      attributionRetryFired,
      attributionVerifiedCount: attribution.summary.verifiedCount,
      attributionUnverifiedCount: attribution.summary.unverifiedCount,
      schemaRetryFired,
    },
    'strategize complete',
  );

  // Silence unused lint on firstStructured after retry path rebinds parsed.
  void firstStructured;

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
      schemaRetryFired,
    },
  };
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

interface CallStrategizeInput {
  provider: LLMProvider;
  model: string;
  system: string;
  userMessage: string;
  temperature: number;
  signal?: AbortSignal;
  promptName: string;
  promptVersion: string;
  maxStructuralAttempts: 1 | 2;
}

interface CallStrategizeOutput {
  parsed: Strategy;
  usage: { input_tokens: number; output_tokens: number };
  retryFired: boolean;
  rawResponse: string;
}

/**
 * Wrap the primitive so both the first strategize call and the attribution-
 * retry call share the same structural error translation. Converts
 * StructuredLlmCallError → StrategizeError with the phrasing existing
 * catch-sites expect.
 */
async function callStrategizeLLM(input: CallStrategizeInput): Promise<CallStrategizeOutput> {
  try {
    const result = await structuredLlmCall<Strategy>({
      provider: input.provider,
      model: input.model,
      system: input.system,
      userMessage: input.userMessage,
      temperature: input.temperature,
      maxTokens: MAX_OUTPUT_TOKENS,
      signal: input.signal,
      schema: StrategySchema,
      maxStructuralAttempts: input.maxStructuralAttempts,
      buildRetryAddendum: buildStrategizeStructuralRetryAddendum,
      stage: 'strategize',
      promptName: input.promptName,
      promptVersion: input.promptVersion,
    });
    return {
      parsed: result.parsed,
      usage: result.usage,
      retryFired: result.retryFired,
      rawResponse: '',
    };
  } catch (err) {
    if (err instanceof StructuredLlmCallError) {
      throw wrapAsStrategizeError(err, input.promptName, input.promptVersion);
    }
    throw err;
  }
}

function buildStrategizeStructuralRetryAddendum(error: StructuralError): string {
  if (error.kind === 'json-parse') {
    return [
      `RETRY: Your previous response was not valid JSON — the parser reported: ${error.message}.`,
      '',
      'Return ONLY the complete Strategy JSON object. No prose. No markdown fences. Every string properly quoted; every bracket/brace balanced.',
    ].join('\n');
  }
  const issues = error.issues
    .slice(0, 20)
    .map((i) => `  • ${i.path.map((p) => String(p)).join('.') || '<root>'}: ${i.message}`);
  return [
    'RETRY: Your previous response failed Strategy schema validation. The schema reported:',
    '',
    issues.join('\n'),
    '',
    'Return the full Strategy JSON with these fields corrected. Preserve unflagged content verbatim. Return ONLY the JSON — no prose, no markdown fences.',
  ].join('\n');
}

function wrapAsStrategizeError(
  err: StructuredLlmCallError,
  promptName: string,
  promptVersion: string,
): StrategizeError {
  const { firstError, retryError, rawFirst, rawRetry } = err.detail;
  const rawResponse = (rawRetry ?? rawFirst).slice(0, 500);
  const validationIssues =
    firstError.kind === 'zod-schema'
      ? firstError.issues
      : retryError && retryError.kind === 'zod-schema'
        ? retryError.issues
        : undefined;

  if (!retryError) {
    if (firstError.kind === 'json-parse') {
      return new StrategizeError(
        `Strategize response is not valid JSON (prompt ${promptName} v${promptVersion}): ${firstError.message}`,
        { promptName, rawResponse },
      );
    }
    const issues = firstError.issues
      .slice(0, 20)
      .map((i) => `${i.path.map((p) => String(p)).join('.') || '<root>'}: ${i.message}`);
    return new StrategizeError(
      `Strategize output did not match the Strategy schema (prompt ${promptName} v${promptVersion}). ` +
        `Zod reported ${firstError.issues.length} issue(s): ` +
        issues.join('; ') +
        (firstError.issues.length > 20 ? '; ...(more)' : ''),
      { promptName, rawResponse, validationIssues },
    );
  }

  const fmt = (e: StructuralError): string =>
    e.kind === 'json-parse'
      ? `JSON parse: ${e.message}`
      : `Zod (${e.issues.length} issues): ` +
        e.issues
          .slice(0, 6)
          .map((i) => `${i.path.map((p) => String(p)).join('.') || '<root>'}: ${i.message}`)
          .join('; ');
  return new StrategizeError(
    `Strategize output failed on BOTH the first attempt AND the retry (prompt ${promptName} v${promptVersion}). ` +
      `First attempt: ${fmt(firstError)}. Retry: ${fmt(retryError)}. ` +
      `Fix: strengthen the prompt for the repeated failure pattern or investigate provider health.`,
    { promptName, rawResponse, validationIssues },
  );
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
    lines.push('Flagged fields (content not grounded in the candidate\'s source resume):');
    for (const f of unverifiedFields) {
      lines.push(`  [${f.field}]`);
      lines.push(`    current value: "${f.text}"`);
      if (f.missingWords.length > 0) {
        lines.push(
          `    words not in source: ${f.missingWords.map((w) => `"${w}"`).join(', ')}`,
        );
      }
      if (f.leakedPhrases.length > 0) {
        lines.push(
          `    JD-vocabulary phrase leaks (phrase appears in JD but NOT in candidate's source): ${f.leakedPhrases.map((p) => `"${p}"`).join(', ')}`,
        );
        lines.push(
          `    (these bigrams/trigrams are lifted from the JD's role-title or framing language and cannot be emitted unless the candidate literally held that role or used that framing in source)`,
        );
      }
      lines.push(
        `    (fix: replace flagged content with phrases the source supports, or drop the qualifier entirely and surface the strategic tension in 'notes')`,
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
