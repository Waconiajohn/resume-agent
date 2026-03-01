/**
 * Craftsman Agent — Configuration
 *
 * The Craftsman is the second of 3 agents in the multi-agent resume system.
 * It receives the Strategist's blueprint + evidence library, writes each
 * section, self-reviews against the quality checklist and anti-pattern list
 * before showing anything to the user, and iterates on user feedback until
 * every section is approved.
 *
 * Agent identity: craftsman / resume
 * Model: MODEL_ORCHESTRATOR (main loop coordination)
 * Tools: 8 (write, self-review, revise, keyword-check, anti-pattern-check,
 *           evidence-integrity, present-to-user, transparency)
 */

import { MODEL_ORCHESTRATOR } from '../../lib/llm.js';
import type { ResumeAgentConfig } from '../types.js';
import { agentRegistry } from '../runtime/agent-registry.js';
import type { AgentConfig } from '../runtime/agent-protocol.js';
import { CRAFTSMAN_SYSTEM_PROMPT } from './prompts.js';
import { craftsmanTools } from './tools.js';

export const craftsmanConfig: ResumeAgentConfig = {
  identity: {
    name: 'craftsman',
    domain: 'resume',
  },

  system_prompt: CRAFTSMAN_SYSTEM_PROMPT,

  tools: craftsmanTools,

  /**
   * Main loop uses MODEL_ORCHESTRATOR — coordination logic between tools.
   * Each tool routes to the appropriate cost tier internally:
   *   - write_section / revise_section → MODEL_PRIMARY (via runSectionWriter/runSectionRevision)
   *   - self_review_section → MODEL_MID
   *   - check_evidence_integrity → MODEL_LIGHT
   *   - check_keyword_coverage / check_anti_patterns → no LLM
   *   - present_to_user / emit_transparency → no LLM
   */
  model: MODEL_ORCHESTRATOR,

  /**
   * 15 rounds gives the Craftsman enough headroom for a realistic session:
   * Per section: ~5 rounds (write + self-review + anti-patterns + keywords + present)
   * Plus revision cycles when user requests changes or self-review fails.
   * A typical 5-section resume uses ~10-12 rounds.
   */
  max_rounds: 15,

  /** 3 minutes per round — section writing (MODEL_PRIMARY) can be slow */
  round_timeout_ms: 180_000,

  /** 15 minutes total — covers writing all sections with revision cycles */
  overall_timeout_ms: 900_000,

  /**
   * Tools safe to run concurrently. check_keyword_coverage and check_anti_patterns
   * are pure string-matching (no LLM, no state mutation). emit_transparency is fire-and-forget.
   */
  parallel_safe_tools: ['check_keyword_coverage', 'check_anti_patterns', 'emit_transparency'],

  /** Craftsman loop is coordination; individual tools handle their own token limits */
  loop_max_tokens: 2048,
};

// Type erasure cast is required because AgentConfig is generic and the registry
// stores the base form. The registry is used only for side-effect registration
// and identity lookup; the full typed config is used directly by the coordinator.
agentRegistry.register(craftsmanConfig as unknown as AgentConfig);
