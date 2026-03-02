import { LLMProvider, AnthropicProvider, ZAIProvider } from './llm-provider.js';
import { MODEL as ANTHROPIC_MODEL, MAX_TOKENS as ANTHROPIC_MAX_TOKENS } from './anthropic.js';

// ─── ZAI model constants ─────────────────────────────────────────────

/** Quality writing — glm-4.7 ($0.60/$2.20 per M tokens) */
export const MODEL_PRIMARY = process.env.ZAI_MODEL_PRIMARY ?? 'glm-4.7';

/** Mid-tier analysis — glm-4.5-air ($0.20/$1.10 per M tokens) */
export const MODEL_MID = process.env.ZAI_MODEL_MID ?? 'glm-4.5-air';

/** Main loop orchestrator — glm-4.7-flashx ($0.07/$0.40 per M tokens) */
export const MODEL_ORCHESTRATOR = process.env.ZAI_MODEL_ORCHESTRATOR ?? 'glm-4.7-flashx';

/** Lightweight extraction — glm-4.7-flash (FREE) */
export const MODEL_LIGHT = process.env.ZAI_MODEL_LIGHT ?? 'glm-4.7-flash';

export const MAX_TOKENS = parseInt(process.env.MAX_TOKENS ?? '8192', 10);

// ─── Model pricing (per million tokens) ──────────────────────────────

export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'glm-4.7': { input: 0.60, output: 2.20 },
  'glm-4.5-air': { input: 0.20, output: 1.10 },
  'glm-4.7-flashx': { input: 0.07, output: 0.40 },
  'glm-4.7-flash': { input: 0, output: 0 },
  // Anthropic models for reference
  'claude-sonnet-4-5-20250929': { input: 3.00, output: 15.00 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
};

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

/** Lazily cached registry reference (populated on first resolveToolModel call). */
let _registryRef: ToolRegistryLike | null | undefined;

function getRegistry(): ToolRegistryLike | null {
  if (_registryRef !== undefined) return _registryRef;
  try {
    // Lazy require to avoid circular dependency (agent tools import llm.ts for model constants)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../agents/runtime/agent-registry.js') as { agentRegistry: ToolRegistryLike };
    _registryRef = mod.agentRegistry;
  } catch {
    _registryRef = null;
  }
  return _registryRef;
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
  const reg = registry ?? getRegistry();
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

/** Reset the cached registry reference (for testing). */
export function _resetRegistryCache(): void {
  _registryRef = undefined;
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
  // Primary default is Z.AI. Anthropic is optional fallback.
  const configuredProvider = process.env.LLM_PROVIDER?.toLowerCase();
  const providerName = configuredProvider === 'zai' || configuredProvider === 'anthropic'
    ? configuredProvider
    : (process.env.ZAI_API_KEY ? 'zai' : 'anthropic');

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
 * For ZAI this is MODEL_ORCHESTRATOR; for Anthropic it's the existing MODEL.
 */
export function getDefaultModel(): string {
  if (llm.name === 'zai') {
    return MODEL_ORCHESTRATOR;
  }
  return ANTHROPIC_MODEL;
}

/**
 * Get MAX_TOKENS for the active provider.
 */
export function getMaxTokens(): number {
  if (llm.name === 'zai') {
    return MAX_TOKENS;
  }
  return ANTHROPIC_MAX_TOKENS;
}
