/**
 * Strategist Agent — Configuration
 *
 * Wires together the system prompt and tools into an AgentConfig that
 * the agent loop can execute. The Strategist drives the entire intelligence
 * phase: intake → research → interview → gap analysis → blueprint.
 *
 * Handed off to the Craftsman when design_blueprint completes successfully.
 */

import { agentRegistry } from '../runtime/agent-registry.js';
import { MODEL_ORCHESTRATOR } from '../../lib/llm.js';
import type { ResumeAgentConfig } from '../types.js';
import type { AgentConfig } from '../runtime/agent-protocol.js';
import { STRATEGIST_SYSTEM_PROMPT } from './prompts.js';
import { strategistTools } from './tools.js';

export const strategistConfig: ResumeAgentConfig = {
  identity: {
    name: 'strategist',
    domain: 'resume',
  },

  system_prompt: STRATEGIST_SYSTEM_PROMPT,

  tools: strategistTools,

  /**
   * Model for the Strategist's main LLM loop (tool selection + reasoning).
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
   *  5-8 rounds — interview_candidate (one per question)
   *  1 round  — classify_fit
   *  1 round  — design_blueprint
   * = ~12-15 rounds typical, 20 as safe ceiling
   */
  max_rounds: 20,

  /**
   * Timeout per individual LLM round (ms).
   * Z.AI can take 1-5 min per call. Set to 3 min to match existing pipeline timeout.
   */
  round_timeout_ms: 180_000,

  /**
   * Timeout for the entire Strategist invocation (ms).
   * Full strategy phase (parse + research + 10 interview Qs + gap + blueprint):
   * 15 min is generous but necessary for slow Z.AI days.
   */
  overall_timeout_ms: 900_000,

  /** emit_transparency has no side-effects on other tools — safe to run in parallel */
  parallel_safe_tools: ['emit_transparency'],

  /** Strategist loop is coordination logic; rarely exceeds 500 output tokens */
  loop_max_tokens: 4096,
};

// Type erasure cast is required because AgentConfig is generic and the registry
// stores the base form. The registry is used only for side-effect registration
// and identity lookup; the full typed config is used directly by the coordinator.
agentRegistry.register(strategistConfig as unknown as AgentConfig);
