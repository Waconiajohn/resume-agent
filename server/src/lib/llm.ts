import { LLMProvider, AnthropicProvider, ZAIProvider, GroqProvider, DeepSeekProvider, DeepInfraProvider, OpenAIProvider, VertexProvider, getVertexAccessToken, FailoverProvider, isRateLimitError } from './llm-provider.js';
import type { ChatParams, ChatResponse, StreamEvent } from './llm-provider.js';
import logger from './logger.js';
import { MODEL as ANTHROPIC_MODEL, MAX_TOKENS as ANTHROPIC_MAX_TOKENS } from './anthropic.js';
import {
  ACTIVE_PROVIDER,
  MODEL_PRIMARY,
  MODEL_MID,
  MODEL_ORCHESTRATOR,
  MODEL_ORCHESTRATOR_COMPLEX,
  MODEL_LIGHT,
  MODEL_PRICING,
  RESUME_V2_WRITER_MODEL,
  RESUME_V2_WRITER_PROVIDER,
} from './model-constants.js';
import { agentRegistry } from '../agents/runtime/agent-registry.js';

// Re-export model constants so existing imports of llm.ts continue to work.
export {
  MODEL_PRIMARY,
  MODEL_MID,
  MODEL_ORCHESTRATOR,
  MODEL_ORCHESTRATOR_COMPLEX,
  MODEL_LIGHT,
  MODEL_PRICING,
};

export const MAX_TOKENS = parseInt(process.env.MAX_TOKENS ?? '8192', 10);

// ─── Tier → model mapping ────────────────────────────────────────────

type ModelTier = 'primary' | 'mid' | 'orchestrator' | 'light';

const TIER_TO_MODEL: Record<ModelTier, string> = {
  primary: MODEL_PRIMARY,
  mid: MODEL_MID,
  orchestrator: MODEL_ORCHESTRATOR,
  light: MODEL_LIGHT,
};

/**
 * Resolve a model tier to its concrete model string.
 */
export function getModelForTier(tier: ModelTier): string {
  return TIER_TO_MODEL[tier];
}

/** Minimal interface for registry lookup (avoids circular import of full AgentRegistry). */
export interface ToolRegistryLike {
  list(): Array<{ tools: Array<{ name: string; model_tier?: ModelTier }> }>;
  listByDomain(d: string): Array<{ tools: Array<{ name: string; model_tier?: ModelTier }> }>;
}

/**
 * Resolve the model for a tool by checking the agent registry first,
 * then falling back to MODEL_ORCHESTRATOR.
 *
 * Queries all registered agents for a tool with the given name and reads
 * its `model_tier` field. Optionally scoped to a specific domain.
 *
 * @param registry - Optional registry override (for testing). Uses the singleton by default.
 */
export function resolveToolModel(toolName: string, domain?: string, registry?: ToolRegistryLike): string {
  const reg = registry ?? agentRegistry;
  if (reg) {
    try {
      const agents = domain ? reg.listByDomain(domain) : reg.list();
      for (const agent of agents) {
        for (const tool of agent.tools) {
          if (tool.name === toolName && tool.model_tier) {
            return getModelForTier(tool.model_tier);
          }
        }
      }
    } catch {
      // Registry error — fall through to MODEL_ORCHESTRATOR
    }
  }

  return MODEL_ORCHESTRATOR;
}

/** No-op kept for test compatibility — registry is no longer lazily cached. */
export function _resetRegistryCache(): void {
  // Registry is imported directly; no cache to reset.
}

/**
 * Get the appropriate model for a tool invocation.
 * Delegates to resolveToolModel (registry lookup, falls back to MODEL_ORCHESTRATOR).
 */
export function getModelForTool(toolName: string): string {
  return resolveToolModel(toolName);
}

// ─── Provider factory ────────────────────────────────────────────────

/** Build a single named provider. Throws if the required API key is missing. */
function buildProvider(name: string): LLMProvider {
  if (name === 'groq') {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY environment variable is required when LLM_PROVIDER=groq');
    }
    const baseUrl = process.env.GROQ_BASE_URL;
    return new GroqProvider({ apiKey, ...(baseUrl && { baseUrl }) });
  }

  if (name === 'deepseek') {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error('DEEPSEEK_API_KEY environment variable is required when LLM_PROVIDER=deepseek');
    }
    const baseUrl = process.env.DEEPSEEK_BASE_URL;
    return new DeepSeekProvider({ apiKey, ...(baseUrl && { baseUrl }) });
  }

  if (name === 'deepinfra') {
    const apiKey = process.env.DEEPINFRA_API_KEY;
    if (!apiKey) {
      throw new Error('DEEPINFRA_API_KEY environment variable is required when LLM_PROVIDER=deepinfra');
    }
    const baseUrl = process.env.DEEPINFRA_BASE_URL;
    return new DeepInfraProvider({ apiKey, ...(baseUrl && { baseUrl }) });
  }

  if (name === 'vertex') {
    const project = process.env.VERTEX_PROJECT ?? process.env.GCP_PROJECT;
    if (!project) {
      throw new Error('VERTEX_PROJECT or GCP_PROJECT environment variable is required when using vertex provider');
    }
    // Token will be refreshed lazily; for now use a placeholder that triggers refresh
    const token = process.env.VERTEX_ACCESS_TOKEN ?? '';
    const region = process.env.VERTEX_REGION ?? 'global';  // DeepSeek V3.2 is global-only on Vertex
    return new VertexProvider({ project, region, accessToken: token });
  }

  if (name === 'zai') {
    const apiKey = process.env.ZAI_API_KEY;
    if (!apiKey) {
      throw new Error('ZAI_API_KEY environment variable is required when LLM_PROVIDER=zai');
    }
    const baseUrl = process.env.ZAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4';
    return new ZAIProvider({ apiKey, baseUrl });
  }

  if (name === 'openai') {
    // Env var name in this repo's .env is `OpenAI_API_KEY` (mixed case); accept
    // the standard `OPENAI_API_KEY` too for portability. Matches the v3
    // provider factory pattern at server/src/v3/providers/factory.ts.
    const apiKey = process.env.OPENAI_API_KEY ?? process.env.OpenAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY (or OpenAI_API_KEY) environment variable is required when using openai provider');
    }
    const baseUrl = process.env.OPENAI_BASE_URL;
    return new OpenAIProvider({ apiKey, ...(baseUrl && { baseUrl }) });
  }

  // Anthropic is the ultimate fallback — lazy-initializes its client on first use.
  return new AnthropicProvider();
}

/**
 * Choose the best available fallback provider for `primaryName`.
 * Priority order: groq → zai → deepseek → anthropic (skip the primary).
 * Returns null if no fallback API key is configured.
 */
function chooseFallbackProvider(primaryName: string): LLMProvider | null {
  const candidates: Array<{ name: string; key: string | undefined }> = [
    { name: 'groq',      key: process.env.GROQ_API_KEY },
    { name: 'deepinfra', key: process.env.DEEPINFRA_API_KEY },
    { name: 'zai',       key: process.env.ZAI_API_KEY },
    { name: 'deepseek',  key: process.env.DEEPSEEK_API_KEY },
  ];

  for (const candidate of candidates) {
    if (candidate.name === primaryName) continue;
    if (!candidate.key) continue;
    try {
      return buildProvider(candidate.name);
    } catch {
      // Should not happen since we checked the key, but guard just in case.
    }
  }

  // Anthropic doesn't require an env key check here (SDK handles it lazily),
  // but only use it as fallback if ANTHROPIC_API_KEY is set.
  if (primaryName !== 'anthropic' && process.env.ANTHROPIC_API_KEY) {
    return new AnthropicProvider();
  }

  return null;
}

function createProvider(): LLMProvider {
  const providerName = ACTIVE_PROVIDER;
  const primary = buildProvider(providerName);
  const fallback = chooseFallbackProvider(providerName);

  if (fallback) {
    logger.info(
      { primary: primary.name, fallback: fallback.name },
      'LLM failover: configured with primary and fallback provider',
    );
  } else {
    logger.info(
      { primary: primary.name },
      'LLM failover: no fallback provider configured — failover disabled',
    );
  }

  return new FailoverProvider(primary, fallback);
}

/** Active LLM provider — wraps a FailoverProvider that auto-switches on repeated failures */
export const llm: LLMProvider = createProvider();

// ─── Rate-limit failover provider ───────────────────────────────────
// Catches 429 errors on the primary and immediately retries with an
// alternate provider + model. Unlike FailoverProvider (which tracks
// consecutive 5xx failures), this switches on a single 429.

class RateLimitFailoverProvider implements LLMProvider {
  get name(): string { return this.primary.name; }

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
          { primary: this.primary.name, fallback: this.fallbackProvider.name, fallbackModel: this.fallbackModel },
          'Rate limited (429) on writer primary — falling back to alternate provider',
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
          { primary: this.primary.name, fallback: this.fallbackProvider.name, fallbackModel: this.fallbackModel },
          'Rate limited (429) on writer primary stream — falling back to alternate provider',
        );
        yield* this.fallbackProvider.stream({ ...params, model: this.fallbackModel });
        return;
      }
      throw err;
    }
  }
}

// ─── Feature-scoped provider: High-quality writing ──────────────────
// DeepSeek V3.2 via Vertex/DeepInfra produces dramatically better writing
// than Groq (6.7/10 vs 5.2/10 on resume, similar gaps on other products).
// This provider is used by ALL writer agents across the platform for
// high-trust prose generation. The global `llm` stays on Groq for fast
// agent-loop orchestration and tool-calling.
// Falls back to the global provider if DeepSeek key is not available.
//
// When Vertex is primary, wraps with RateLimitFailoverProvider so 429s
// automatically fall back to DeepSeek direct (different quota pool).

export const writerLlm: LLMProvider = (() => {
  const resumeProvider = RESUME_V2_WRITER_PROVIDER;
  if (resumeProvider === ACTIVE_PROVIDER) return llm;
  try {
    let primary: LLMProvider = buildProvider(resumeProvider);

    // Vertex 429 failover: wrap with DeepSeek direct as rate-limit backup
    if (resumeProvider === 'vertex' && process.env.DEEPSEEK_API_KEY) {
      const deepseekFallback = buildProvider('deepseek');
      primary = new RateLimitFailoverProvider(primary, deepseekFallback, 'deepseek-chat');
      logger.info(
        { primary: 'vertex', rateLimitFallback: 'deepseek' },
        'Writer LLM: Vertex with DeepSeek direct fallback on 429',
      );
    }

    return new FailoverProvider(primary, llm);
  } catch {
    return llm;
  }
})();

/** @deprecated Use writerLlm instead */
export const resumeV2Llm = writerLlm;

// ─── Feature-scoped provider: Cover-letter writer trial ─────────────
// 2026-04-21 — foundation for bringing gpt-5.4-mini to non-v3 products.
// The handoff at memory/handoff-2026-04-20-v3-and-gpt54mini-rollout.md
// says cover-letter is the natural first non-v3 product for the trial
// (small, 2-agent pipeline, low blast radius).
//
// Not yet used by cover-letter tools — this export exists so the trial
// can flip `COVER_LETTER_WRITER_PROVIDER=openai` + supply OPENAI_API_KEY
// to switch cover-letter off Groq without touching tool code twice.
//
// When the env vars are unset or the provider throws at construction,
// falls back to the global `llm` (Groq Qwen3 today). This preserves
// current behavior until the trial starts.
//
// The trial itself (wiring + 10-fixture comparison + go/no-go) is a
// separate piece of work — see docs/cover-letter-gpt54mini-trial.md.

export const coverLetterWriterLlm: LLMProvider = (() => {
  const providerName = process.env.COVER_LETTER_WRITER_PROVIDER;
  if (!providerName || providerName === ACTIVE_PROVIDER) return llm;
  try {
    const primary = buildProvider(providerName);
    logger.info(
      { provider: providerName, fallback: ACTIVE_PROVIDER },
      'Cover letter writer LLM: feature-scoped provider',
    );
    return new FailoverProvider(primary, llm);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), requested: providerName },
      'Cover letter writer LLM: feature-scoped provider construction failed, falling back to global llm',
    );
    return llm;
  }
})();

/**
 * Get the default model for the configured primary provider.
 * For ZAI/Groq this is MODEL_ORCHESTRATOR; for Anthropic it's the existing MODEL.
 * Keyed off ACTIVE_PROVIDER (startup config) rather than llm.name (which is
 * dynamic when failover is active) so model IDs always match the primary config.
 */
export function getDefaultModel(): string {
  if (ACTIVE_PROVIDER === 'zai' || ACTIVE_PROVIDER === 'groq' || ACTIVE_PROVIDER === 'deepseek' || ACTIVE_PROVIDER === 'deepinfra' || ACTIVE_PROVIDER === 'vertex') {
    return MODEL_ORCHESTRATOR;
  }
  return ANTHROPIC_MODEL;
}

/**
 * Get MAX_TOKENS for the configured primary provider.
 */
export function getMaxTokens(): number {
  if (ACTIVE_PROVIDER === 'zai' || ACTIVE_PROVIDER === 'groq' || ACTIVE_PROVIDER === 'deepseek' || ACTIVE_PROVIDER === 'deepinfra' || ACTIVE_PROVIDER === 'vertex') {
    return MAX_TOKENS;
  }
  return ANTHROPIC_MAX_TOKENS;
}
