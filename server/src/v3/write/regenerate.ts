// Phase 4 — per-bullet / per-position regenerate helpers.
//
// Called from POST /api/v3-pipeline/regenerate. Two entrypoints:
//
// - regeneratePosition(): rewrites ONE position by reusing write-position.v1.
//   Optional `weightOverride` lets the user try a different positionEmphasis
//   weight without mutating the strategy object (we patch it into a shallow
//   copy just for this call).
//
// - regenerateBullet(): rewrites ONE bullet via a new write-bullet.v1 prompt.
//   Source bullet text + position context + optional user guidance. The
//   prompt is scoped tight — same faithfulness rules as write-position,
//   output is a single Bullet.
//
// Neither helper touches session state or accounting; the route handler owns
// usage tracking via AsyncLocalStorage (see v3-pipeline.ts).
//
// 2026-04-21 — migrated to the shared structured-llm-call primitive
// (commit 2 of the structured-llm plan). All three entrypoints (position,
// bullet, summary) now gain the one-shot JSON/Zod retry coverage that
// write/index.ts's runSection has. Error path preserves the prior plain
// Error type so existing catch-sites continue to work.

import type { ZodSchema } from 'zod';
import { loadPrompt } from '../prompts/loader.js';
import { getProvider } from '../providers/factory.js';
import { createV3Logger } from '../observability/logger.js';
import {
  structuredLlmCall,
  StructuredLlmCallError,
  type StructuralError,
} from '../lib/structured-llm.js';
import {
  WrittenPositionSchema,
  WrittenSingleBulletSchema,
  WrittenSummarySchema,
} from './schema.js';
import type {
  Bullet,
  Position,
  Strategy,
  StructuredResume,
  WrittenPosition,
} from '../types.js';

const logger = createV3Logger('write', { module: 'regenerate' });
const MAX_OUTPUT_TOKENS = 8_000;

// ─── Position regenerate ──────────────────────────────────────────────────

export interface RegeneratePositionOptions {
  /** Optional weight override — "primary" | "secondary" | "brief". Merged into
   *  a shallow copy of strategy.positionEmphasis so the prompt sees the new
   *  weight without mutating caller state. */
  weightOverride?: 'primary' | 'secondary' | 'brief';
  variant?: string;
  signal?: AbortSignal;
}

export async function regeneratePosition(
  resume: StructuredResume,
  strategy: Strategy,
  positionIndex: number,
  options: RegeneratePositionOptions = {},
): Promise<{ position: WrittenPosition; telemetry: RegenerateTelemetry }> {
  const position: Position | undefined = resume.positions[positionIndex];
  if (!position) {
    throw new Error(`regeneratePosition: positionIndex ${positionIndex} out of range`);
  }
  const variant = options.variant ?? 'v1';

  // Apply weight override into a shallow copy. If no emphasis row exists for
  // this position, add one so the prompt's Rule 1 resolves the weight cleanly.
  const effectiveStrategy: Strategy = options.weightOverride
    ? patchStrategyWeight(strategy, positionIndex, options.weightOverride)
    : strategy;

  const promptName = `write-position.${variant}`;
  const prompt = loadPrompt(promptName);
  const replacements = {
    strategy_json: JSON.stringify(effectiveStrategy, null, 2),
    resume_json: JSON.stringify(resume, null, 2),
    position_json: JSON.stringify(position, null, 2),
    position_index: String(positionIndex),
  };

  logger.info(
    {
      promptName,
      positionIndex,
      weightOverride: options.weightOverride ?? null,
    },
    'regeneratePosition start',
  );

  const { result, telemetry } = await runRegenerate({
    label: `regeneratePosition[${positionIndex}]`,
    promptName,
    prompt,
    replacements,
    schema: WrittenPositionSchema,
    signal: options.signal,
    extractResult: (parsed) => parsed,
  });
  return { position: result, telemetry };
}

// ─── Bullet regenerate ────────────────────────────────────────────────────

export interface RegenerateBulletOptions {
  /** Free-form user hint ("shorter", "add metrics", etc). Empty string = no guidance. */
  guidance?: string;
  variant?: string;
  signal?: AbortSignal;
}

export async function regenerateBullet(
  resume: StructuredResume,
  strategy: Strategy,
  positionIndex: number,
  bulletIndex: number,
  options: RegenerateBulletOptions = {},
): Promise<{ bullet: Bullet; telemetry: RegenerateTelemetry }> {
  const position = resume.positions[positionIndex];
  if (!position) {
    throw new Error(`regenerateBullet: positionIndex ${positionIndex} out of range`);
  }
  const sourceBullet = position.bullets[bulletIndex];
  if (!sourceBullet) {
    throw new Error(
      `regenerateBullet: bulletIndex ${bulletIndex} out of range for position ${positionIndex}`,
    );
  }

  const variant = options.variant ?? 'v1';
  const promptName = `write-bullet.${variant}`;
  const prompt = loadPrompt(promptName);

  // Position context for the prompt: title, company, scope, dates — enough
  // for the model to judge role-level context without dumping every sibling
  // bullet (we're not merging across siblings for single-bullet regen).
  const positionContext = {
    positionIndex,
    title: position.title,
    company: position.company,
    dates: position.dates,
    scope: position.scope ?? null,
  };

  const replacements = {
    position_context_json: JSON.stringify(positionContext, null, 2),
    strategy_json: JSON.stringify(strategy, null, 2),
    source_bullet_json: JSON.stringify(sourceBullet, null, 2),
    source_bullet_index: String(bulletIndex),
    guidance: options.guidance?.trim() ? options.guidance.trim() : '(none — standard rewrite)',
  };

  logger.info(
    {
      promptName,
      positionIndex,
      bulletIndex,
      hasGuidance: Boolean(options.guidance?.trim()),
    },
    'regenerateBullet start',
  );

  const { result, telemetry } = await runRegenerate({
    label: `regenerateBullet[${positionIndex},${bulletIndex}]`,
    promptName,
    prompt,
    replacements,
    schema: WrittenSingleBulletSchema,
    signal: options.signal,
    extractResult: (parsed) => parsed.bullet,
  });
  return { bullet: result, telemetry };
}

// ─── Summary regenerate ──────────────────────────────────────────────────

export interface RegenerateSummaryOptions {
  /** Free-form user hint ("shorter", "lead with the outcome"). Optional. */
  guidance?: string;
  variant?: string;
  signal?: AbortSignal;
}

export async function regenerateSummary(
  resume: StructuredResume,
  strategy: Strategy,
  options: RegenerateSummaryOptions = {},
): Promise<{ summary: string; telemetry: RegenerateTelemetry }> {
  const variant = options.variant ?? 'v1';
  const promptName = `write-summary.${variant}`;
  const prompt = loadPrompt(promptName);

  // Guidance is appended to the user message AFTER standard template sub —
  // keep it out of the prompt file to preserve template invariants / fixtures.
  const replacements = {
    strategy_json: JSON.stringify(strategy, null, 2),
    resume_json: JSON.stringify(resume, null, 2),
  };

  const hint = options.guidance?.trim();
  const userMessageSuffix = hint
    ? [
        '',
        '',
        '## User guidance',
        '',
        hint,
        '',
        'Factor this hint into your rewrite; never invent claims to satisfy it.',
      ].join('\n')
    : '';

  logger.info(
    {
      promptName,
      hasGuidance: Boolean(hint),
    },
    'regenerateSummary start',
  );

  const { result, telemetry } = await runRegenerate({
    label: 'regenerateSummary',
    promptName,
    prompt,
    replacements,
    schema: WrittenSummarySchema,
    signal: options.signal,
    extractResult: (parsed) => parsed.summary,
    userMessageSuffix,
  });
  return { summary: result, telemetry };
}

// ─── Shared core ──────────────────────────────────────────────────────────

export interface RegenerateTelemetry {
  promptName: string;
  promptVersion: string;
  model: string;
  backend: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  /**
   * True iff the structural-retry primitive fired a retry (first LLM call
   * produced output that failed JSON.parse or Zod validation; second call
   * succeeded). Added 2026-04-21 as part of regenerate's migration to the
   * shared structured-llm-call primitive.
   */
  schemaRetryFired: boolean;
}

interface RunRegenerateInput<TParsed, TOut> {
  label: string;
  promptName: string;
  prompt: ReturnType<typeof loadPrompt>;
  replacements: Record<string, string>;
  schema: ZodSchema<TParsed>;
  signal?: AbortSignal;
  extractResult: (parsed: TParsed) => TOut;
  userMessageSuffix?: string;
}

async function runRegenerate<TParsed, TOut>(
  input: RunRegenerateInput<TParsed, TOut>,
): Promise<{ result: TOut; telemetry: RegenerateTelemetry }> {
  let userMessage = input.prompt.userMessageTemplate;
  for (const [k, v] of Object.entries(input.replacements)) {
    userMessage = userMessage.replaceAll(`{{${k}}}`, v);
  }
  if (input.userMessageSuffix) userMessage += input.userMessageSuffix;

  const { provider, model, backend, extraParams } = getProvider(input.prompt.capability);
  const maxTokens =
    extraParams?.thinking === true ? MAX_OUTPUT_TOKENS * 2 : MAX_OUTPUT_TOKENS;

  try {
    const result = await structuredLlmCall<TParsed>({
      provider,
      model,
      system: input.prompt.systemMessage,
      userMessage,
      temperature: input.prompt.temperature ?? 0.4,
      maxTokens,
      signal: input.signal,
      thinking: extraParams?.thinking === true,
      schema: input.schema,
      buildRetryAddendum: (err) => buildRegenerateRetryAddendum(input.label, err),
      stage: `regenerate:${input.label}`,
      promptName: input.promptName,
      promptVersion: input.prompt.version,
    });

    logger.info(
      {
        promptName: input.promptName,
        label: input.label,
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
        durationMs: result.durationMs,
        schemaRetryFired: result.retryFired,
      },
      'regenerate complete',
    );

    return {
      result: input.extractResult(result.parsed),
      telemetry: {
        promptName: input.promptName,
        promptVersion: input.prompt.version,
        model,
        backend,
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
        durationMs: result.durationMs,
        schemaRetryFired: result.retryFired,
      },
    };
  } catch (err) {
    if (err instanceof StructuredLlmCallError) {
      throw wrapAsRegenerateError(err, input.label, input.promptName, input.prompt.version);
    }
    throw err;
  }
}

function buildRegenerateRetryAddendum(label: string, error: StructuralError): string {
  if (error.kind === 'json-parse') {
    return [
      `RETRY: Your previous response was not valid JSON — the parser reported: ${error.message}.`,
      '',
      'Return ONLY the complete JSON object matching the schema the prompt describes. No prose. No markdown fences. Every string properly quoted; every bracket/brace balanced.',
    ].join('\n');
  }
  const issues = error.issues
    .slice(0, 20)
    .map((i) => `  • ${i.path.map((p) => String(p)).join('.') || '<root>'}: ${i.message}`);
  return [
    `RETRY (${label}): Your previous response failed schema validation. The schema reported:`,
    '',
    issues.join('\n'),
    '',
    'Return the full JSON with these fields corrected. Preserve all other content verbatim. Common fixes:',
    '  • `confidence` fields are numbers between 0.0 and 1.0 — NOT booleans, NOT strings, NOT null.',
    '  • `is_new` and `evidence_found` are booleans — true or false, NOT strings.',
    '  • Required arrays may be empty but must be present.',
    '',
    'Return ONLY the JSON — no prose, no markdown fences.',
  ].join('\n');
}

function wrapAsRegenerateError(
  err: StructuredLlmCallError,
  label: string,
  promptName: string,
  promptVersion: string,
): Error {
  const { firstError, retryError } = err.detail;
  const firstSummary = summarizeStructural(firstError);
  const retrySummary = retryError ? ` | retry: ${summarizeStructural(retryError)}` : '';
  return new Error(
    `${label}: failed on ${retryError ? 'BOTH the first attempt AND the retry' : 'the first attempt'} ` +
      `(prompt ${promptName} v${promptVersion}). First: ${firstSummary}${retrySummary}. ` +
      `Fix: strengthen the prompt or investigate provider health.`,
  );
}

function summarizeStructural(err: StructuralError): string {
  if (err.kind === 'json-parse') return `JSON parse: ${err.message}`;
  const head = err.issues
    .slice(0, 5)
    .map((i) => `${i.path.map((p) => String(p)).join('.') || '<root>'}: ${i.message}`)
    .join('; ');
  const more = err.issues.length > 5 ? `; ...(${err.issues.length - 5} more)` : '';
  return `Zod (${err.issues.length} issue(s)): ${head}${more}`;
}

function patchStrategyWeight(
  strategy: Strategy,
  positionIndex: number,
  weight: 'primary' | 'secondary' | 'brief',
): Strategy {
  const existing = strategy.positionEmphasis.find((p) => p.positionIndex === positionIndex);
  const nextEmphasis = existing
    ? strategy.positionEmphasis.map((p) =>
        p.positionIndex === positionIndex ? { ...p, weight } : p,
      )
    : [
        ...strategy.positionEmphasis,
        // rationale is required by the type; we supply a brief placeholder
        // since the user's manual override is itself the rationale.
        { positionIndex, weight, rationale: 'user override' },
      ];
  return { ...strategy, positionEmphasis: nextEmphasis };
}
