// Provider factory for v3 stages.
//
// Stages NEVER import AnthropicProvider / VertexProvider / DeepInfraProvider
// / DeepSeekProvider / OpenAIProvider directly. They call getProvider(capability)
// and receive a configured ResolvedProvider that satisfies the capability.
//
// Phase 4.5 — HYBRID production routing:
//   strong-reasoning → vertex (default)   (classify, strategize, verify)
//   fast-writer      → vertex (default)   (write-summary, -accomplishments, -competencies, -custom-section)
//   deep-writer      → openai (default)   (write-position only — Phase 4 cleanup I4 showed GPT-4.1 fixes
//                                          the 1-5-error editorial-synthesis gap that DeepSeek-thinking
//                                          could not close)
//   deep-writer      → vertex (FALLBACK)  (if the OpenAI call fails, the wrapper transparently falls
//                                          back to DeepSeek-thinking — the ONE explicit-fallback in the
//                                          whole system, carved out because write-position is the
//                                          quality-critical path)
//
// Precedence of backend selection (per capability):
//   RESUME_V3_<CAP>_BACKEND  (strongest)
//   RESUME_V3_PROVIDER       (global fallback)
//   built-in default         (vertex for strong-reasoning/fast-writer, openai for deep-writer)
//
// Per-capability backend env vars:
//   RESUME_V3_STRONG_REASONING_BACKEND
//   RESUME_V3_FAST_WRITER_BACKEND
//   RESUME_V3_DEEP_WRITER_BACKEND
//
// Model env vars (also per-backend suffix):
//   RESUME_V3_STRONG_REASONING_MODEL         — used on vertex/anthropic (generic)
//   RESUME_V3_STRONG_REASONING_MODEL_OPENAI  — used on openai (backend-specific)
//   (same pattern for fast-writer / deep-writer)
//
// Providers instantiate lazily (one per capability per process) so constructing
// factory.ts at import time does NOT call Vertex auth.

import {
  AnthropicProvider,
  DeepInfraProvider,
  DeepSeekProvider,
  FailoverProvider,
  OpenAIProvider,
  VertexProvider,
  isRateLimitError,
  type ChatParams,
  type ChatResponse,
  type LLMProvider,
  type StreamEvent,
} from '../../lib/llm-provider.js';
import logger from '../../lib/logger.js';
import { createV3Logger } from '../observability/logger.js';

const log = createV3Logger('providers');

export type Capability = 'strong-reasoning' | 'fast-writer' | 'deep-writer';
export type Backend = 'vertex' | 'openai' | 'anthropic';

export interface ResolvedProvider {
  provider: LLMProvider;
  /** The concrete model name the stage passes in ChatParams.model. */
  model: string;
  /** Capability that was requested — useful for log tagging. */
  capability: Capability;
  /** Configured backend name. */
  backend: Backend;
  /**
   * Extra params the stage should spread into its provider.stream/chat call.
   * Used by deep-writer-on-vertex to request DeepSeek thinking mode.
   */
  extraParams?: { thinking?: boolean };
}

const DEFAULT_VERTEX_MODEL = 'deepseek-ai/deepseek-v3.2-maas';
const DEFAULT_OPUS_MODEL = 'claude-opus-4-7';
const DEFAULT_SONNET_MODEL = 'claude-sonnet-4-6';

// OpenAI defaults (Phase 4.8 update). Project gained GPT-5 family access
// on 2026-04-18. gpt-5.4-mini is the newest reasoning-capable smaller model
// (2026-03) — best fit for resume rewriting's attribution discipline at
// a reasonable price point. gpt-4.1 kept as the non-reasoning baseline
// control. gpt-4.1-mini is denied on this project as of the access probe;
// fall back to gpt-4.1 for fast-writer when routing through OpenAI.
const DEFAULT_OPENAI_STRONG_MODEL = 'gpt-5.4-mini';
const DEFAULT_OPENAI_FAST_MODEL = 'gpt-5.4-mini';
const DEFAULT_OPENAI_DEEP_MODEL = 'gpt-5.4-mini';

// 2026-04-20: flipped to all-OpenAI after a 3-fixture validation showed
// (a) a 3–4× wall-clock speedup end-to-end on GPT-5.4-mini and
// (b) the one quality regression was GPT-5.4-mini inventing industry
//     framing ("GTM", "wholesale") at strategize on a cross-domain JD.
//
// The original hybrid treated that second point as a shipping blocker and
// kept strong-reasoning on Vertex DeepSeek. Product reframe (2026-04-20)
// decided minor framing-vocabulary drift is reviewable by the user in the
// Review panel, not a hard-fail condition. See
// docs/v3-rebuild/reports/model-validation/all-openai-vs-hybrid.md.
//
// The prior Vertex hybrid is still selectable per-capability via env
// overrides (RESUME_V3_STRONG_REASONING_BACKEND=vertex etc.).
const DEFAULT_CAPABILITY_BACKEND: Record<Capability, Backend> = {
  'strong-reasoning': 'openai',
  'fast-writer': 'openai',
  'deep-writer': 'openai',
};

/** Capabilities that enable DeepSeek thinking mode when on the Vertex backend. */
const THINKING_CAPABILITIES: Capability[] = ['deep-writer'];

// -----------------------------------------------------------------------------
// Lazy instantiation — providers are built on first getProvider() call and
// cached per capability for the process lifetime.
// -----------------------------------------------------------------------------

const cache = new Map<Capability, ResolvedProvider>();

export function getProvider(capability: Capability): ResolvedProvider {
  const existing = cache.get(capability);
  if (existing) return existing;

  const backend = resolveBackend(capability);
  const resolved = buildResolved(capability, backend);

  log.info(
    {
      capability,
      backend: resolved.backend,
      model: resolved.model,
      provider: resolved.provider.name,
    },
    'provider factory: resolved capability to provider',
  );

  cache.set(capability, resolved);
  return resolved;
}

/** Reset the cache. Intended for tests; production should not need this. */
export function _resetProviderCache(): void {
  cache.clear();
}

/**
 * Resolve the backend for a given capability per the precedence contract:
 *   RESUME_V3_<CAP>_BACKEND  >  RESUME_V3_PROVIDER  >  DEFAULT_CAPABILITY_BACKEND
 */
export function resolveBackend(capability: Capability): Backend {
  const perCap = process.env[capabilityToBackendEnv(capability)];
  if (perCap) {
    return assertBackend(perCap, capabilityToBackendEnv(capability));
  }
  const global = process.env.RESUME_V3_PROVIDER;
  if (global) {
    return assertBackend(global, 'RESUME_V3_PROVIDER');
  }
  return DEFAULT_CAPABILITY_BACKEND[capability];
}

function assertBackend(value: string, sourceName: string): Backend {
  const normalized = value.toLowerCase();
  if (normalized === 'vertex' || normalized === 'openai' || normalized === 'anthropic') {
    return normalized;
  }
  throw new Error(
    `v3 provider factory: unknown backend "${value}" in ${sourceName}. ` +
      `Expected one of: vertex, openai, anthropic.`,
  );
}

function capabilityToBackendEnv(capability: Capability): string {
  switch (capability) {
    case 'strong-reasoning':
      return 'RESUME_V3_STRONG_REASONING_BACKEND';
    case 'fast-writer':
      return 'RESUME_V3_FAST_WRITER_BACKEND';
    case 'deep-writer':
      return 'RESUME_V3_DEEP_WRITER_BACKEND';
  }
}

function capabilityToModelEnv(capability: Capability): string {
  switch (capability) {
    case 'strong-reasoning':
      return 'RESUME_V3_STRONG_REASONING_MODEL';
    case 'fast-writer':
      return 'RESUME_V3_FAST_WRITER_MODEL';
    case 'deep-writer':
      return 'RESUME_V3_DEEP_WRITER_MODEL';
  }
}

function buildResolved(capability: Capability, backend: Backend): ResolvedProvider {
  // deep-writer on openai gets wrapped with a Vertex-thinking fallback.
  // Every other combination is a direct provider.
  if (capability === 'deep-writer' && backend === 'openai') {
    return buildDeepWriterHybrid();
  }
  if (backend === 'vertex') {
    return buildVertexResolved(capability);
  }
  if (backend === 'anthropic') {
    return buildAnthropicResolved(capability);
  }
  if (backend === 'openai') {
    return buildOpenAIResolved(capability);
  }
  // Exhaustiveness guard — TypeScript should have caught this.
  throw new Error(`v3 provider factory: unhandled backend "${backend}"`);
}

// -----------------------------------------------------------------------------
// Per-backend builders
// -----------------------------------------------------------------------------

function buildVertexResolved(capability: Capability): ResolvedProvider {
  const project = process.env.VERTEX_PROJECT ?? process.env.GCP_PROJECT;
  if (!project) {
    throw new Error(
      'v3 provider factory: VERTEX_PROJECT (or GCP_PROJECT) env var is required when capability resolves to vertex backend.',
    );
  }

  const region = process.env.VERTEX_REGION ?? 'global';
  const vertex = new VertexProvider({
    project,
    region,
    accessToken: process.env.VERTEX_ACCESS_TOKEN ?? '',
  });

  // Failover chain mirrors v2's writerLlm:
  //   RateLimitFailoverProvider(Vertex) → DeepInfra → DeepSeek direct
  let primary: LLMProvider = vertex;
  const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
  if (deepseekApiKey) {
    primary = new RateLimitFailoverProvider(
      primary,
      new DeepSeekProvider({ apiKey: deepseekApiKey }),
      'deepseek-chat',
    );
  }

  let fallback: LLMProvider | null = null;
  if (process.env.DEEPINFRA_API_KEY) {
    fallback = new DeepInfraProvider({ apiKey: process.env.DEEPINFRA_API_KEY });
  }

  const wrapped = fallback ? new FailoverProvider(primary, fallback) : primary;
  const defensive = new DefensiveJsonProvider(wrapped);

  const modelKey = capabilityToModelEnv(capability);
  const model = process.env[modelKey] ?? DEFAULT_VERTEX_MODEL;
  const extraParams = THINKING_CAPABILITIES.includes(capability) ? { thinking: true } : undefined;

  return { provider: defensive, model, capability, backend: 'vertex', extraParams };
}

function buildAnthropicResolved(capability: Capability): ResolvedProvider {
  const anthropic = new AnthropicProvider();
  const defensive = new DefensiveJsonProvider(anthropic);

  const defaultModel =
    capability === 'strong-reasoning'
      ? DEFAULT_OPUS_MODEL
      : capability === 'deep-writer'
        ? DEFAULT_OPUS_MODEL
        : DEFAULT_SONNET_MODEL;
  const modelKey = capabilityToModelEnv(capability);
  const model = process.env[modelKey] ?? defaultModel;

  return { provider: defensive, model, capability, backend: 'anthropic' };
}

function buildOpenAIResolved(capability: Capability): ResolvedProvider {
  // Env var name is `OpenAI_API_KEY` in this repo's .env (mixed case); also
  // accept `OPENAI_API_KEY` for tolerance of the standard convention.
  const apiKey = process.env.OpenAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'v3 provider factory: OpenAI_API_KEY (or OPENAI_API_KEY) env var is required when capability resolves to openai backend.',
    );
  }
  const openai = new OpenAIProvider({ apiKey });
  const defensive = new DefensiveJsonProvider(openai);

  const defaultModel =
    capability === 'fast-writer'
      ? DEFAULT_OPENAI_FAST_MODEL
      : capability === 'deep-writer'
        ? DEFAULT_OPENAI_DEEP_MODEL
        : DEFAULT_OPENAI_STRONG_MODEL;

  // Per-backend model env overrides, so the operator can use different models
  // on OpenAI than on vertex without conflict.
  const overrideKey = `${capabilityToModelEnv(capability)}_OPENAI`;
  const model = process.env[overrideKey] ?? process.env[capabilityToModelEnv(capability)] ?? defaultModel;

  return { provider: defensive, model, capability, backend: 'openai' };
}

/**
 * Build the deep-writer hybrid: OpenAI primary with DeepSeek-thinking-on-Vertex
 * as explicit fallback. Used only when deep-writer resolves to openai backend.
 */
function buildDeepWriterHybrid(): ResolvedProvider {
  const primary = buildOpenAIResolved('deep-writer');
  // Fallback: resolve deep-writer as if backend were vertex (thinking mode on).
  let fallback: ResolvedProvider | null = null;
  try {
    fallback = buildVertexResolved('deep-writer');
  } catch (err) {
    // If vertex is also not configured, we have no fallback — log and proceed.
    // Primary (OpenAI) must work; if it doesn't, we fail loudly at request time.
    logger.warn(
      {
        capability: 'deep-writer',
        primary: 'openai',
        error: err instanceof Error ? err.message : String(err),
      },
      'deep-writer hybrid: Vertex fallback unavailable; OpenAI must succeed or stage will fail',
    );
  }

  const wrapper = new DeepWriterFallbackProvider(primary, fallback);

  // The ResolvedProvider surface reflects the PRIMARY backend. Stages see
  // "backend: openai" and do not pass thinking: true. The wrapper handles
  // thinking internally on the fallback path.
  return {
    provider: wrapper,
    model: primary.model,
    capability: 'deep-writer',
    backend: 'openai',
    extraParams: undefined,
  };
}

// -----------------------------------------------------------------------------
// DeepWriterFallbackProvider — OpenAI primary with Vertex-thinking fallback
// -----------------------------------------------------------------------------
//
// Per the Phase 4.5 task spec: "The OpenAI fallback on deep-writer failure is
// the ONE explicit-fallback in the whole system. All other failures surface
// loudly. This is an exception carved out specifically because write-position
// on OpenAI is the quality-critical path and a degraded-but-working fallback
// serves users better than an outage."
//
// Behavior:
//   - Try OpenAI with the caller's params.
//   - On failure (non-abort), log at WARN with the reason, retry on Vertex
//     with DeepSeek-thinking mode enabled.
//   - If Vertex also fails, propagate the Vertex error (so the caller sees
//     the true blocker, not the primary OpenAI error).
//
// AbortError (user cancellation) bypasses the fallback — we do not retry a
// cancelled stream.

class DeepWriterFallbackProvider implements LLMProvider {
  constructor(
    private readonly primary: ResolvedProvider,
    private readonly fallback: ResolvedProvider | null,
  ) {}

  get name(): string {
    return this.primary.provider.name;
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    try {
      return await this.primary.provider.chat(this.primaryParams(params));
    } catch (err) {
      if (isAbort(err)) throw err;
      if (!this.fallback) throw err;
      logger.warn(
        {
          capability: 'deep-writer',
          primary: this.primary.backend,
          fallback: this.fallback.backend,
          error: err instanceof Error ? err.message : String(err),
        },
        'deep-writer fallback: primary call failed, retrying on fallback backend',
      );
      return this.fallback.provider.chat(this.fallbackParams(params));
    }
  }

  async *stream(params: ChatParams): AsyncIterable<StreamEvent> {
    try {
      yield* this.primary.provider.stream(this.primaryParams(params));
      return;
    } catch (err) {
      if (isAbort(err)) throw err;
      if (!this.fallback) throw err;
      logger.warn(
        {
          capability: 'deep-writer',
          primary: this.primary.backend,
          fallback: this.fallback.backend,
          error: err instanceof Error ? err.message : String(err),
        },
        'deep-writer fallback: primary stream failed, retrying on fallback backend',
      );
    }
    // Fallback path — Vertex with thinking mode.
    yield* this.fallback!.provider.stream(this.fallbackParams(params));
  }

  private primaryParams(params: ChatParams): ChatParams {
    // Strip thinking flag for OpenAI (it's a DeepSeek-specific kwarg).
    const { thinking: _thinking, ...rest } = params;
    return { ...rest, model: this.primary.model };
  }

  private fallbackParams(params: ChatParams): ChatParams {
    // Apply the fallback's model and thinking flag (Vertex-thinking path).
    return {
      ...params,
      model: this.fallback!.model,
      ...(this.fallback!.extraParams?.thinking && { thinking: true }),
    };
  }
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message));
}

// -----------------------------------------------------------------------------
// RateLimitFailoverProvider (v3-local copy; identical shape to v2's)
// -----------------------------------------------------------------------------

class RateLimitFailoverProvider implements LLMProvider {
  get name(): string {
    return this.primary.name;
  }

  constructor(
    private readonly primary: LLMProvider,
    private readonly fallbackProvider: LLMProvider,
    private readonly fallbackModel: string,
  ) {}

  async chat(params: ChatParams): Promise<ChatResponse> {
    try {
      return await this.primary.chat(params);
    } catch (err) {
      if (isRateLimitError(err)) {
        logger.warn(
          {
            primary: this.primary.name,
            fallback: this.fallbackProvider.name,
            fallbackModel: this.fallbackModel,
          },
          'v3 rate-limit failover: 429 on primary, switching to fallback provider',
        );
        return this.fallbackProvider.chat({ ...params, model: this.fallbackModel });
      }
      throw err;
    }
  }

  async *stream(params: ChatParams): AsyncIterable<StreamEvent> {
    try {
      yield* this.primary.stream(params);
    } catch (err) {
      if (isRateLimitError(err)) {
        logger.warn(
          {
            primary: this.primary.name,
            fallback: this.fallbackProvider.name,
            fallbackModel: this.fallbackModel,
          },
          'v3 rate-limit failover: 429 on primary stream, switching to fallback provider',
        );
        yield* this.fallbackProvider.stream({
          ...params,
          model: this.fallbackModel,
        });
        return;
      }
      throw err;
    }
  }
}

// -----------------------------------------------------------------------------
// DefensiveJsonProvider — mechanical fence stripping + one-retry JSON handling
// -----------------------------------------------------------------------------

export class DefensiveJsonProvider implements LLMProvider {
  constructor(private readonly inner: LLMProvider) {}

  get name(): string {
    return this.inner.name;
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const wantsJson = params.response_format?.type === 'json_object';

    const first = await this.inner.chat(params);
    if (!wantsJson) return first;

    const cleaned = stripMarkdownJsonFence(first.text);
    if (tryParseJson(cleaned)) {
      return { ...first, text: cleaned };
    }

    const parseError = captureParseError(cleaned);
    log.info(
      {
        provider: this.inner.name,
        reason: parseError,
      },
      'JSON parse retry triggered',
    );

    const retryParams: ChatParams = {
      ...params,
      system:
        `${params.system}\n\n` +
        `---\n` +
        `RETRY: Your previous response could not be parsed as JSON. ` +
        `The parser error was: ${parseError}. ` +
        `Return ONLY the JSON object, no prose, no markdown fences. ` +
        `Ensure the response is valid JSON on the first attempt.`,
    };

    const second = await this.inner.chat(retryParams);
    const secondCleaned = stripMarkdownJsonFence(second.text);
    if (tryParseJson(secondCleaned)) {
      return { ...second, text: secondCleaned };
    }

    throw new Error(
      `DefensiveJsonProvider: JSON parse failed on retry from ${this.inner.name}. ` +
        `First attempt error: ${parseError}. ` +
        `Second attempt error: ${captureParseError(secondCleaned)}. ` +
        `First-attempt head: ${first.text.slice(0, 300)}. ` +
        `Second-attempt head: ${second.text.slice(0, 300)}.`,
    );
  }

  async *stream(params: ChatParams): AsyncIterable<StreamEvent> {
    yield* this.inner.stream(params);
  }
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

function tryParseJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function captureParseError(text: string): string {
  try {
    JSON.parse(text);
    return 'no error';
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
