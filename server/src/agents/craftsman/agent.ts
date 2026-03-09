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
import { registerAgent } from '../runtime/agent-registry.js';
import { CRAFTSMAN_SYSTEM_PROMPT } from './prompts.js';
import { craftsmanTools } from './tools.js';
import { RESUME_COMPACTION_HINTS, buildResumeScratchpadSummary } from '../resume/compaction.js';

export const craftsmanConfig: ResumeAgentConfig = {
  identity: {
    name: 'craftsman',
    domain: 'resume',
  },

  system_prompt: CRAFTSMAN_SYSTEM_PROMPT,

  tools: craftsmanTools,

  capabilities: ['content_creation', 'self_review', 'section_writing', 'revision'],

  /**
   * Main loop uses MODEL_ORCHESTRATOR — llama-3.3-70b-versatile on Groq (GA, reliable
   * tool calling), glm-4.7-flashx on Z.AI. The agent "brain" deciding tool sequencing
   * should be as capable as the "hands" writing content.
   *
   * Each tool routes to the appropriate cost tier internally:
   *   - write_section / revise_section → MODEL_PRIMARY (via runSectionWriter/runSectionRevision)
   *   - self_review_section → MODEL_MID
   *   - check_evidence_integrity → MODEL_LIGHT
   *   - check_keyword_coverage / check_anti_patterns → no LLM
   *   - present_to_user / emit_transparency → no LLM
   */
  model: MODEL_ORCHESTRATOR,

  /**
   * Per section: ~5-7 rounds (write + self-review + anti-patterns + keywords + present + transparency).
   * On providers that disable parallel tool calls (Groq), each tool is its own round.
   * A 5-section resume (summary + accomplishments + experience + skills + education)
   * needs 25-35 rounds. 40 provides headroom for revision cycles.
   */
  max_rounds: 40,

  /** 60s per round — Groq 70B responds in <5s. Generous for section writing (MODEL_PRIMARY). */
  round_timeout_ms: 60_000,

  /** 10 min total — Craftsman has user gates (section approvals) that add wall-clock time. */
  overall_timeout_ms: 600_000,

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

  /** Resume-specific entity names and patterns for compaction summarisation. */
  compactionHints: RESUME_COMPACTION_HINTS,

  /** Resume-aware scratchpad status summary (sections + approved state). */
  scratchpadSummaryHook: buildResumeScratchpadSummary,
};

registerAgent(craftsmanConfig);
