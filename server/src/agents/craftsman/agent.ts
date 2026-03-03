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

import { MODEL_ORCHESTRATOR_COMPLEX } from '../../lib/llm.js';
import type { ResumeAgentConfig } from '../types.js';
import { registerAgent } from '../runtime/agent-registry.js';
import { CRAFTSMAN_SYSTEM_PROMPT } from './prompts.js';
import { craftsmanTools } from './tools.js';

export const craftsmanConfig: ResumeAgentConfig = {
  identity: {
    name: 'craftsman',
    domain: 'resume',
  },

  system_prompt: CRAFTSMAN_SYSTEM_PROMPT,

  tools: craftsmanTools,

  capabilities: ['content_creation', 'self_review', 'section_writing', 'revision'],

  /**
   * Main loop uses MODEL_ORCHESTRATOR_COMPLEX — coordination logic between tools.
   * On Groq, the 8B orchestrator model can't generate complex nested tool call
   * parameters (write_section has nested objects). Uses Scout (MID) on Groq,
   * falls back to cheap flashx on Z.AI.
   *
   * Each tool routes to the appropriate cost tier internally:
   *   - write_section / revise_section → MODEL_PRIMARY (via runSectionWriter/runSectionRevision)
   *   - self_review_section → MODEL_MID
   *   - check_evidence_integrity → MODEL_LIGHT
   *   - check_keyword_coverage / check_anti_patterns → no LLM
   *   - present_to_user / emit_transparency → no LLM
   */
  model: MODEL_ORCHESTRATOR_COMPLEX,

  /**
   * Per section: ~5-7 rounds (write + self-review + anti-patterns + keywords + present + transparency).
   * On providers that disable parallel tool calls (Groq), each tool is its own round.
   * A 5-section resume (summary + accomplishments + experience + skills + education)
   * needs 25-35 rounds. 40 provides headroom for revision cycles.
   */
  max_rounds: 40,

  /** 3 minutes per round — section writing (MODEL_PRIMARY) can be slow */
  round_timeout_ms: 180_000,

  /** 15 minutes total — covers writing all sections with revision cycles */
  overall_timeout_ms: 900_000,

  /**
   * Tools safe to run concurrently. check_keyword_coverage and check_anti_patterns
   * are pure string-matching (no LLM, no state mutation). emit_transparency is fire-and-forget.
   */
  parallel_safe_tools: ['check_keyword_coverage', 'check_anti_patterns', 'emit_transparency'],

  /**
   * Craftsman loop max tokens. write_section tool calls pass the full blueprint_slice
   * (evidence allocations for all positions) as a parameter — a 5-position resume's
   * experience section can easily need 4000+ tokens for the tool call alone.
   * 8192 prevents output truncation on Groq.
   */
  loop_max_tokens: 8192,
};

registerAgent(craftsmanConfig);
