/**
 * Model constants — provider-aware model identifiers and pricing.
 *
 * Extracted from llm.ts to break the circular dependency:
 *   agent tools → llm.ts (model constants) → agent-registry → agent tools
 *
 * This file has NO dependency on agent-registry or any agent module.
 * Import model constants from here instead of from llm.ts.
 */

// ─── Detect active provider ───────────────────────────────────────────

export const ACTIVE_PROVIDER =
  process.env.LLM_PROVIDER?.toLowerCase() ??
  (process.env.DEEPSEEK_API_KEY ? 'deepseek' : process.env.ZAI_API_KEY ? 'zai' : 'anthropic');

// ─── ZAI model constants ─────────────────────────────────────────────

/** Quality writing — glm-4.7 ($0.60/$2.20 per M tokens) */
const ZAI_MODEL_PRIMARY = process.env.ZAI_MODEL_PRIMARY ?? 'glm-4.7';

/** Mid-tier analysis — glm-4.5-air ($0.20/$1.10 per M tokens) */
const ZAI_MODEL_MID = process.env.ZAI_MODEL_MID ?? 'glm-4.5-air';

/** Main loop orchestrator — glm-4.7-flashx ($0.07/$0.40 per M tokens) */
const ZAI_MODEL_ORCHESTRATOR = process.env.ZAI_MODEL_ORCHESTRATOR ?? 'glm-4.7-flashx';

/** Lightweight extraction — glm-4.7-flash (FREE) */
const ZAI_MODEL_LIGHT = process.env.ZAI_MODEL_LIGHT ?? 'glm-4.7-flash';

// ─── Groq model constants ────────────────────────────────────────────

/** Quality writing — qwen/qwen3-32b ($0.29/$0.59 per M tokens).
 *  Dense 32B with native thinking mode. All 32B params active per token —
 *  better instruction following than GPT-OSS 120B (sparse MoE, only 5.1B active).
 *  GPT-OSS had known Groq issues: tool calls ignored, reasoning token leakage,
 *  Harmony format incompatibility. Qwen3 is stable, proven, cheaper. */
const GROQ_MODEL_PRIMARY = process.env.GROQ_MODEL_PRIMARY ?? 'qwen/qwen3-32b';

/** Mid-tier analysis — llama-4-scout ($0.11/$0.34 per M tokens).
 *  Scout is now GA (April 2026) with stable tool-calling. Fast (460 tps),
 *  good for gap analysis, candidate intelligence, and mid-tier reasoning. */
const GROQ_MODEL_MID =
  process.env.GROQ_MODEL_MID ?? 'meta-llama/llama-4-scout-17b-16e-instruct';

/** Main loop orchestrator — llama-4-scout ($0.11/$0.34 per M tokens).
 *  Same model as MID. Scout's tool-calling is now production-stable (GA).
 *  57% cheaper than the 70B it replaced with comparable orchestration quality. */
const GROQ_MODEL_ORCHESTRATOR =
  process.env.GROQ_MODEL_ORCHESTRATOR ?? 'meta-llama/llama-4-scout-17b-16e-instruct';

/** Lightweight extraction — llama-3.1-8b ($0.05/$0.08 per M tokens).
 *  8B is fine for non-tool-calling tasks (text extraction, analysis). */
const GROQ_MODEL_LIGHT = process.env.GROQ_MODEL_LIGHT ?? 'llama-3.1-8b-instant';

// ─── DeepSeek model constants ───────────────────────────────────────

/** DeepSeek V3 (671B MoE, 37B activated) — $0.14/$0.28 per M tokens.
 *  Single model for all tiers; routing is simpler since there's only one. */
const DEEPSEEK_MODEL_PRIMARY = process.env.DEEPSEEK_MODEL_PRIMARY ?? 'deepseek-chat';
const DEEPSEEK_MODEL_MID = process.env.DEEPSEEK_MODEL_MID ?? 'deepseek-chat';
const DEEPSEEK_MODEL_ORCHESTRATOR = process.env.DEEPSEEK_MODEL_ORCHESTRATOR ?? 'deepseek-chat';
const DEEPSEEK_MODEL_LIGHT = process.env.DEEPSEEK_MODEL_LIGHT ?? 'deepseek-chat';

// ─── Provider-aware model exports ────────────────────────────────────

function selectModel(zai: string, groq: string, deepseek?: string): string {
  if (ACTIVE_PROVIDER === 'deepseek') return deepseek ?? zai;
  return ACTIVE_PROVIDER === 'groq' ? groq : zai;
}

export const MODEL_PRIMARY = selectModel(ZAI_MODEL_PRIMARY, GROQ_MODEL_PRIMARY, DEEPSEEK_MODEL_PRIMARY);
export const MODEL_MID = selectModel(ZAI_MODEL_MID, GROQ_MODEL_MID, DEEPSEEK_MODEL_MID);
export const MODEL_ORCHESTRATOR = selectModel(ZAI_MODEL_ORCHESTRATOR, GROQ_MODEL_ORCHESTRATOR, DEEPSEEK_MODEL_ORCHESTRATOR);
export const MODEL_LIGHT = selectModel(ZAI_MODEL_LIGHT, GROQ_MODEL_LIGHT, DEEPSEEK_MODEL_LIGHT);

// ─── Feature-scoped model overrides ─────────────────────────────────
// Resume V2 writing scored 7.0/10 with DeepSeek vs 5.2/10 with Groq.
// This override lets Resume V2 use DeepSeek for high-trust writing
// while the rest of the app stays on the global provider (Groq).
// Prefers DeepInfra (US-hosted DeepSeek, lower latency) when available.
// Other products should be tested independently before switching.

const DEEPINFRA_MODEL = 'deepseek-ai/DeepSeek-V3.2';

export const RESUME_V2_WRITER_MODEL = process.env.RESUME_V2_WRITER_MODEL
  ?? (process.env.DEEPINFRA_API_KEY ? DEEPINFRA_MODEL : DEEPSEEK_MODEL_PRIMARY);

export const RESUME_V2_WRITER_PROVIDER = process.env.RESUME_V2_WRITER_PROVIDER
  ?? (process.env.DEEPINFRA_API_KEY ? 'deepinfra' : 'deepseek');

/**
 * Orchestrator model for agent loops with complex nested tool schemas.
 * With 70B as the orchestrator on Groq, this now maps to the same model as
 * MODEL_ORCHESTRATOR on both providers. Kept for backward compatibility —
 * existing imports still resolve correctly.
 */
export const MODEL_ORCHESTRATOR_COMPLEX = selectModel(
  ZAI_MODEL_ORCHESTRATOR,
  GROQ_MODEL_ORCHESTRATOR,
  DEEPSEEK_MODEL_ORCHESTRATOR,
);

// ─── Model pricing (per million tokens) ──────────────────────────────

export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Z.AI models
  'glm-5.1': { input: 1.40, output: 4.40 },
  'glm-5': { input: 1.00, output: 3.20 },
  'glm-4.7': { input: 0.60, output: 2.20 },
  'glm-4.5-air': { input: 0.20, output: 1.10 },
  'glm-4.7-flashx': { input: 0.07, output: 0.40 },
  'glm-4.7-flash': { input: 0, output: 0 },
  // Groq models
  'openai/gpt-oss-120b': { input: 0.15, output: 0.60 },
  'qwen/qwen3-32b': { input: 0.29, output: 0.59 },
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
  'meta-llama/llama-4-scout-17b-16e-instruct': { input: 0.11, output: 0.34 },
  'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
  'openai/gpt-oss-20b': { input: 0.075, output: 0.30 },
  'meta-llama/llama-4-scout-17b-16e-instruct:free': { input: 0, output: 0 },
  'deepseek-r1-distill-llama-70b': { input: 0.75, output: 0.99 },
  // DeepSeek models (direct API)
  'deepseek-chat': { input: 0.14, output: 0.28 },
  // DeepInfra (US-hosted DeepSeek — lower latency, slightly higher cost)
  'deepseek-ai/DeepSeek-V3.2': { input: 0.26, output: 0.38 },
  'deepseek-ai/DeepSeek-V3': { input: 0.26, output: 0.38 },
  'mistral-saba-24b': { input: 0.79, output: 0.79 },
  // Anthropic models for reference
  'claude-sonnet-4-5-20250929': { input: 3.00, output: 15.00 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
};
