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

// ─── Tool → model mapping ────────────────────────────────────────────
// Only entries used by the current pipeline agents are kept here.

const TOOL_MODEL_MAP: Record<string, string> = {
  // Quality writing → MODEL_PRIMARY (glm-4.7)
  generate_section: MODEL_PRIMARY,

  // Mid-tier analysis → MODEL_MID (glm-4.5-air)
  classify_fit: MODEL_MID,
  build_benchmark: MODEL_MID,

  // Lightweight extraction → MODEL_LIGHT (glm-4.7-flash, FREE)
  analyze_jd: MODEL_LIGHT,
  research_company: MODEL_LIGHT,
  research_industry: MODEL_LIGHT,
};

/**
 * Get the appropriate model for a tool invocation.
 * Falls back to MODEL_ORCHESTRATOR for unknown tools.
 */
export function getModelForTool(toolName: string): string {
  return TOOL_MODEL_MAP[toolName] ?? MODEL_ORCHESTRATOR;
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
