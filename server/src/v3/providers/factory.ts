// Provider factory for v3 stages.
//
// Stages NEVER import AnthropicProvider / VertexProvider / DeepInfraProvider
// / DeepSeekProvider directly. They call getProvider(capability) and receive
// a configured LLMProvider-compatible object that satisfies the capability.
//
// Capabilities map to concrete models per environment. Production runs on
// Vertex-hosted DeepSeek; development may override to Anthropic for
// comparison. See docs/v3-rebuild/04-Decision-Log.md 2026-04-18 entry on
// "Production routes through Vertex-hosted DeepSeek, not Anthropic models".
//
// Env vars (all optional):
//   RESUME_V3_PROVIDER         vertex (default) | anthropic
//   RESUME_V3_STRONG_REASONING_MODEL
//     - vertex default:    deepseek-ai/deepseek-v3.2-maas
//     - anthropic default: claude-opus-4-7
//   RESUME_V3_FAST_WRITER_MODEL
//     - vertex default:    deepseek-ai/deepseek-v3.2-maas
//     - anthropic default: claude-sonnet-4-6
//
// Providers instantiate lazily (one per capability per process) so that
// constructing `factory.ts` at import time does NOT call Vertex auth.

import {
  AnthropicProvider,
  DeepInfraProvider,
  DeepSeekProvider,
  FailoverProvider,
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

export interface ResolvedProvider {
  provider: LLMProvider;
  /** The concrete model name the stage passes in ChatParams.model. */
  model: string;
  /** Capability that was requested — useful for log tagging. */
  capability: Capability;
  /** Configured backend name: 'vertex' | 'anthropic'. */
  backend: string;
  /**
   * Extra params the stage should spread into its provider.stream/chat call.
   * Currently used by deep-writer to request DeepSeek thinking mode.
   */
  extraParams?: { thinking?: boolean };
}

const DEFAULT_BACKEND = 'vertex';
const DEFAULT_VERTEX_MODEL = 'deepseek-ai/deepseek-v3.2-maas';
const DEFAULT_OPUS_MODEL = 'claude-opus-4-7';
const DEFAULT_SONNET_MODEL = 'claude-sonnet-4-6';

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

  const backend = (process.env.RESUME_V3_PROVIDER ?? DEFAULT_BACKEND).toLowerCase();
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

function buildResolved(capability: Capability, backend: string): ResolvedProvider {
  if (backend === 'vertex') {
    return buildVertexResolved(capability);
  }
  if (backend === 'anthropic') {
    return buildAnthropicResolved(capability);
  }
  throw new Error(
    `v3 provider factory: unknown RESUME_V3_PROVIDER "${backend}". ` +
      `Expected one of: vertex, anthropic.`,
  );
}

function buildVertexResolved(capability: Capability): ResolvedProvider {
  const project = process.env.VERTEX_PROJECT ?? process.env.GCP_PROJECT;
  if (!project) {
    throw new Error(
      'v3 provider factory: VERTEX_PROJECT (or GCP_PROJECT) env var is required when RESUME_V3_PROVIDER=vertex (the default).',
    );
  }

  const region = process.env.VERTEX_REGION ?? 'global';
  const vertex = new VertexProvider({
    project,
    region,
    accessToken: process.env.VERTEX_ACCESS_TOKEN ?? '',
  });

  // Failover chain mirrors v2's writerLlm (see server/src/lib/llm.ts):
  //   RateLimitFailoverProvider(Vertex) → DeepInfra → DeepSeek direct
  // Outer failover on 5xx/timeouts (FailoverProvider), inner layer on 429s
  // (RateLimitFailover).
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
  } else if (deepseekApiKey) {
    // Skip — DeepSeek is already the 429-failover inside primary
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

  // Dev-only Anthropic defaults: deep-writer maps to Opus as the closest
  // analog to DeepSeek-thinking for debug runs.
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

// -----------------------------------------------------------------------------
// RateLimitFailoverProvider (v3-local copy; identical shape to v2's)
// -----------------------------------------------------------------------------
// v2's class is file-private in server/src/lib/llm.ts. v3 needs the same
// semantics (switch providers + models on a single 429) inside the factory
// without importing from v2's agent code. We port the class here rather than
// extract to /lib/ to avoid touching v2's file.

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
// Wraps an upstream provider. When stages set response_format: json_object,
// this wrapper:
//   1. Strips markdown code fences (```json ... ```) from the response text
//      before returning — mechanical operation, belongs in code.
//   2. If JSON.parse of the cleaned text fails, retries once with the parser
//      error fed back into the system message. Retry is visible in logs.
// Ordinary (non-JSON) calls pass through unchanged.
//
// The retry only fires on chat() paths with response_format set. stream()
// pass-through matches the upstream provider; stage code that uses streaming
// is responsible for its own fence handling (v3 classify uses streaming at
// 32K max_tokens and does its own fence strip via stripMarkdownJsonFence).

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

    // First attempt failed — retry with the parser error in the system prompt.
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

    // Second attempt also failed — fail loudly with both attempts in the error.
    throw new Error(
      `DefensiveJsonProvider: JSON parse failed on retry from ${this.inner.name}. ` +
        `First attempt error: ${parseError}. ` +
        `Second attempt error: ${captureParseError(secondCleaned)}. ` +
        `First-attempt head: ${first.text.slice(0, 300)}. ` +
        `Second-attempt head: ${second.text.slice(0, 300)}.`,
    );
  }

  async *stream(params: ChatParams): AsyncIterable<StreamEvent> {
    // Pass-through with mechanical fence-strip at the end would require
    // buffering the entire stream; stage code (classify) already does its own
    // fence-strip on the accumulated text. Keep stream transparent.
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
