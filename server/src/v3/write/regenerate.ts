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

import type { StreamEvent } from '../../lib/llm-provider.js';
import { loadPrompt } from '../prompts/loader.js';
import { getProvider } from '../providers/factory.js';
import { createV3Logger } from '../observability/logger.js';
import { WrittenPositionSchema, WrittenSingleBulletSchema } from './schema.js';
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

  let userMessage = prompt.userMessageTemplate;
  for (const [k, v] of Object.entries(replacements)) {
    userMessage = userMessage.replaceAll(`{{${k}}}`, v);
  }

  const start = Date.now();
  const { provider, model, backend, extraParams } = getProvider(prompt.capability);
  const maxTokens = extraParams?.thinking === true ? MAX_OUTPUT_TOKENS * 2 : MAX_OUTPUT_TOKENS;

  logger.info(
    { promptName, model, backend, positionIndex, weightOverride: options.weightOverride ?? null },
    'regeneratePosition start',
  );

  let fullText = '';
  let usage = { input_tokens: 0, output_tokens: 0 };
  for await (const event of provider.stream({
    model,
    system: prompt.systemMessage,
    messages: [{ role: 'user', content: userMessage }],
    max_tokens: maxTokens,
    temperature: prompt.temperature,
    ...(extraParams?.thinking === true && { thinking: true }),
    signal: options.signal,
  })) {
    const e = event as StreamEvent;
    if (e.type === 'text') fullText += e.text;
    else if (e.type === 'done') usage = e.usage;
  }

  const durationMs = Date.now() - start;
  const cleaned = stripJsonFence(fullText.trim());
  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `regeneratePosition: invalid JSON from ${promptName}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const result = WrittenPositionSchema.safeParse(parsedRaw);
  if (!result.success) {
    throw new Error(
      `regeneratePosition: schema mismatch — ${result.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }

  logger.info(
    { promptName, positionIndex, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, durationMs },
    'regeneratePosition complete',
  );

  return {
    position: result.data,
    telemetry: {
      promptName,
      promptVersion: prompt.version,
      model,
      backend,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      durationMs,
    },
  };
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

  let userMessage = prompt.userMessageTemplate;
  for (const [k, v] of Object.entries(replacements)) {
    userMessage = userMessage.replaceAll(`{{${k}}}`, v);
  }

  const start = Date.now();
  const { provider, model, backend, extraParams } = getProvider(prompt.capability);
  const maxTokens = extraParams?.thinking === true ? MAX_OUTPUT_TOKENS * 2 : MAX_OUTPUT_TOKENS;

  logger.info(
    { promptName, model, backend, positionIndex, bulletIndex, hasGuidance: Boolean(options.guidance?.trim()) },
    'regenerateBullet start',
  );

  let fullText = '';
  let usage = { input_tokens: 0, output_tokens: 0 };
  for await (const event of provider.stream({
    model,
    system: prompt.systemMessage,
    messages: [{ role: 'user', content: userMessage }],
    max_tokens: maxTokens,
    temperature: prompt.temperature,
    ...(extraParams?.thinking === true && { thinking: true }),
    signal: options.signal,
  })) {
    const e = event as StreamEvent;
    if (e.type === 'text') fullText += e.text;
    else if (e.type === 'done') usage = e.usage;
  }

  const durationMs = Date.now() - start;
  const cleaned = stripJsonFence(fullText.trim());
  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `regenerateBullet: invalid JSON from ${promptName}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const result = WrittenSingleBulletSchema.safeParse(parsedRaw);
  if (!result.success) {
    throw new Error(
      `regenerateBullet: schema mismatch — ${result.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }

  logger.info(
    { promptName, positionIndex, bulletIndex, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, durationMs },
    'regenerateBullet complete',
  );

  return {
    bullet: result.data.bullet,
    telemetry: {
      promptName,
      promptVersion: prompt.version,
      model,
      backend,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      durationMs,
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

export interface RegenerateTelemetry {
  promptName: string;
  promptVersion: string;
  model: string;
  backend: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
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

function stripJsonFence(s: string): string {
  const t = s.trim();
  const start = /^```(?:json|JSON)?\s*\n/;
  const end = /\n```\s*$/;
  if (start.test(t) && end.test(t)) return t.replace(start, '').replace(end, '').trim();
  return t;
}
