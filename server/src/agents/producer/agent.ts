/**
 * Producer Agent — Configuration
 *
 * The Producer is the third agent in the multi-agent resume system.
 * It owns document production and quality assurance:
 *
 * - Runs after the Craftsman (receives polished section content)
 * - Selects the correct executive template
 * - Verifies cross-section consistency
 * - Checks blueprint compliance
 * - Runs ATS compliance (rule-based, no LLM)
 * - Checks for AI-generated patterns (humanize_check)
 * - Runs full adversarial review (6-dimension quality scoring)
 * - Routes targeted revision requests back to the Craftsman
 *
 * Model: MODEL_ORCHESTRATOR (main loop is coordination, not creative writing)
 * Max rounds: 8 (template + 5 checks + triage + emit)
 */

import { MODEL_ORCHESTRATOR_COMPLEX } from '../../lib/llm.js';
import { PRODUCER_SYSTEM_PROMPT } from './prompts.js';
import { producerTools } from './tools.js';
import type { ResumeAgentConfig } from '../types.js';
import { registerAgent } from '../runtime/agent-registry.js';

export const producerConfig: ResumeAgentConfig = {
  identity: {
    name: 'producer',
    domain: 'resume',
  },
  system_prompt: PRODUCER_SYSTEM_PROMPT,
  tools: producerTools,
  capabilities: ['quality_review', 'document_production', 'ats_compliance', 'template_selection'],
  /**
   * Uses MODEL_ORCHESTRATOR_COMPLEX — Producer tools have complex nested schemas
   * (adversarial_review, check_blueprint_compliance, etc.) that require a model
   * stronger than Groq's 8B for reliable tool calling.
   */
  model: MODEL_ORCHESTRATOR_COMPLEX,
  /**
   * Max LLM round-trips. Producer calls ~7-9 tools sequentially:
   * 1 select_template + 3 structural checks + 3 content checks + 1-2 triage/emit.
   * On providers that disable parallel tool calls (Groq), each tool is its own round.
   * Large resumes (5+ positions) may need extra rounds due to tool call recoveries
   * and revision requests — 20 provides safe headroom.
   */
  max_rounds: 20,
  round_timeout_ms: 120_000,   // 2 min per round
  overall_timeout_ms: 600_000, // 10 min total

  /**
   * All Producer tools are independent LLM calls or read-only checks — safe to run in parallel.
   * The Producer's checks don't mutate shared state; they only read the assembled resume and emit scores.
   * On providers supporting parallel tool calls, the runtime executes these concurrently.
   */
  parallel_safe_tools: [
    'verify_cross_section_consistency',
    'check_blueprint_compliance',
    'ats_compliance_check',
    'humanize_check',
    'check_narrative_coherence',
    'adversarial_review',
    'emit_transparency',
  ],

  /**
   * Producer tools pass large payloads (assembled_resume, blueprint, evidence_library)
   * as parameters. adversarial_review alone can be 3-4K tokens. 8192 prevents truncation.
   */
  loop_max_tokens: 8192,
};

registerAgent(producerConfig);
