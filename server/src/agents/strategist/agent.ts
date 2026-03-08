/**
 * Strategist Agent — Configuration
 *
 * Wires together the system prompt and tools into an AgentConfig that
 * the agent loop can execute. The Strategist drives the entire intelligence
 * phase: intake → research → interview → gap analysis → blueprint.
 *
 * Handed off to the Craftsman when design_blueprint completes successfully.
 */

import { registerAgent } from '../runtime/agent-registry.js';
import { MODEL_ORCHESTRATOR } from '../../lib/llm.js';
import type { ResumeAgentConfig } from '../types.js';
import { STRATEGIST_SYSTEM_PROMPT } from './prompts.js';
import { strategistTools } from './tools.js';

export const strategistConfig: ResumeAgentConfig = {
  identity: {
    name: 'strategist',
    domain: 'resume',
  },

  system_prompt: STRATEGIST_SYSTEM_PROMPT,

  tools: strategistTools,

  capabilities: ['research', 'positioning', 'interview', 'gap_analysis', 'blueprint_design'],

  /**
   * Model for the Strategist's main LLM loop (tool selection + reasoning).
   * On Groq: llama-3.3-70b-versatile (GA, reliable tool calling).
   * On Z.AI: glm-4.7-flashx (cheap, fast).
   * Individual tools override this with their own model_tier when they make
   * downstream LLM calls (e.g., design_blueprint uses MODEL_PRIMARY).
   */
  model: MODEL_ORCHESTRATOR,

  /**
   * Max LLM round-trips. Each round may call 1+ tools.
   * Breakdown estimate:
   *  1 round  — parse_resume + emit_transparency
   *  1 round  — analyze_jd + research_company (may be combined)
   *  1 round  — build_benchmark
   *  5-8 rounds — interview_candidate_batch (batched question rounds)
   *  1 round  — classify_fit
   *  1 round  — design_blueprint
   * = ~12-15 rounds typical, 20 as safe ceiling
   */
  max_rounds: 20,

  /**
   * Timeout per individual LLM round (ms).
   * Groq 70B responds in <5s typically. 60s is generous but catches real failures.
   * Z.AI fallback may need the full minute on slow days.
   */
  round_timeout_ms: 60_000,

  /**
   * Timeout for the entire Strategist invocation (ms).
   * Full strategy phase (parse + research + 10 interview Qs + gap + blueprint):
   * Groq completes in ~30s. 5 min provides safe headroom including user gates.
   */
  overall_timeout_ms: 300_000,

  /** emit_transparency has no side-effects on other tools — safe to run in parallel */
  parallel_safe_tools: ['emit_transparency'],

  /**
   * Strategist loop is coordination logic, but tool_call inputs can be large
   * (evidence summaries, positioning data). Keep generous to avoid truncation.
   */
  loop_max_tokens: 8192,
};

registerAgent(strategistConfig);
