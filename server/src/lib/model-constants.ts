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
  (process.env.ZAI_API_KEY ? 'zai' : 'anthropic');

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

/** Quality writing — llama-3.3-70b-versatile ($0.59/$0.79 per M tokens).
 *  Dense 70B: best writing quality on Groq. Maverick (17Bx128E MoE) tested
 *  but produced fewer sections and weaker content despite lower cost. */
const GROQ_MODEL_PRIMARY = process.env.GROQ_MODEL_PRIMARY ?? 'llama-3.3-70b-versatile';

/** Mid-tier analysis — llama-4-scout ($0.11/$0.34 per M tokens) */
const GROQ_MODEL_MID =
  process.env.GROQ_MODEL_MID ?? 'meta-llama/llama-4-scout-17b-16e-instruct';

/** Main loop orchestrator — llama-3.3-70b-versatile ($0.59/$0.79 per M tokens).
 *  Upgraded from Scout 17B (Preview, tool-calling quirks) to 70B (GA, reliable).
 *  The agent "brain" that decides tool sequencing and generates parameters should be
 *  as capable as the "hands" that write content. At ~$0.23/pipeline this is still
 *  cheaper than Z.AI's ~$0.26/pipeline, with 10x faster execution. */
const GROQ_MODEL_ORCHESTRATOR =
  process.env.GROQ_MODEL_ORCHESTRATOR ?? 'llama-3.3-70b-versatile';

/** Lightweight extraction — llama-3.1-8b ($0.05/$0.08 per M tokens).
 *  8B is fine for non-tool-calling tasks (text extraction, analysis). */
const GROQ_MODEL_LIGHT = process.env.GROQ_MODEL_LIGHT ?? 'llama-3.1-8b-instant';

// ─── Provider-aware model exports ────────────────────────────────────

function selectModel(zai: string, groq: string): string {
  return ACTIVE_PROVIDER === 'groq' ? groq : zai;
}

export const MODEL_PRIMARY = selectModel(ZAI_MODEL_PRIMARY, GROQ_MODEL_PRIMARY);
export const MODEL_MID = selectModel(ZAI_MODEL_MID, GROQ_MODEL_MID);
export const MODEL_ORCHESTRATOR = selectModel(ZAI_MODEL_ORCHESTRATOR, GROQ_MODEL_ORCHESTRATOR);
export const MODEL_LIGHT = selectModel(ZAI_MODEL_LIGHT, GROQ_MODEL_LIGHT);

/**
 * Orchestrator model for agent loops with complex nested tool schemas.
 * With 70B as the orchestrator on Groq, this now maps to the same model as
 * MODEL_ORCHESTRATOR on both providers. Kept for backward compatibility —
 * existing imports still resolve correctly.
 */
export const MODEL_ORCHESTRATOR_COMPLEX = selectModel(
  ZAI_MODEL_ORCHESTRATOR,
  GROQ_MODEL_ORCHESTRATOR,
);

// ─── Model pricing (per million tokens) ──────────────────────────────

export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Z.AI models
  'glm-4.7': { input: 0.60, output: 2.20 },
  'glm-4.5-air': { input: 0.20, output: 1.10 },
  'glm-4.7-flashx': { input: 0.07, output: 0.40 },
  'glm-4.7-flash': { input: 0, output: 0 },
  // Groq models
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
  'meta-llama/llama-4-scout-17b-16e-instruct': { input: 0.11, output: 0.34 },
  'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
  'meta-llama/llama-4-maverick-17b-128e-instruct': { input: 0.50, output: 0.77 },
  'qwen/qwen3-32b': { input: 0.29, output: 0.59 },
  'meta-llama/llama-4-scout-17b-16e-instruct:free': { input: 0, output: 0 },
  'deepseek-r1-distill-llama-70b': { input: 0.75, output: 0.99 },
  'mistral-saba-24b': { input: 0.79, output: 0.79 },
  // Anthropic models for reference
  'claude-sonnet-4-5-20250929': { input: 3.00, output: 15.00 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
};
