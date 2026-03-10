import { LLMProvider, AnthropicProvider, ZAIProvider, GroqProvider } from './llm-provider.js';
import { MODEL as ANTHROPIC_MODEL, MAX_TOKENS as ANTHROPIC_MAX_TOKENS } from './anthropic.js';
import {
  ACTIVE_PROVIDER,
  MODEL_PRIMARY,
  MODEL_MID,
  MODEL_ORCHESTRATOR,
  MODEL_ORCHESTRATOR_COMPLEX,
  MODEL_LIGHT,
  MODEL_PRICING,
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

function createProvider(): LLMProvider {
  const providerName = ACTIVE_PROVIDER;

  if (providerName === 'groq') {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY environment variable is required when LLM_PROVIDER=groq');
    }
    const baseUrl = process.env.GROQ_BASE_URL;
    return new GroqProvider({ apiKey, ...(baseUrl && { baseUrl }) });
  }

  if (providerName === 'zai') {
    const apiKey = process.env.ZAI_API_KEY;
    if (!apiKey) {
      throw new Error('ZAI_API_KEY environment variable is required when LLM_PROVIDER=zai');
    }
    const baseUrl = process.env.ZAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4';
    return new ZAIProvider({ apiKey, baseUrl });
  }

  // Optional fallback: Anthropic (lazy-initializes client on first use).
  return new AnthropicProvider();
}

/** Active LLM provider instance based on LLM_PROVIDER env var */
export const llm: LLMProvider = createProvider();

/**
 * Get the default model for the active provider.
 * For ZAI/Groq this is MODEL_ORCHESTRATOR; for Anthropic it's the existing MODEL.
 */
export function getDefaultModel(): string {
  if (llm.name === 'zai' || llm.name === 'groq') {
    return MODEL_ORCHESTRATOR;
  }
  return ANTHROPIC_MODEL;
}

/**
 * Get MAX_TOKENS for the active provider.
 */
export function getMaxTokens(): number {
  if (llm.name === 'zai' || llm.name === 'groq') {
    return MAX_TOKENS;
  }
  return ANTHROPIC_MAX_TOKENS;
}
