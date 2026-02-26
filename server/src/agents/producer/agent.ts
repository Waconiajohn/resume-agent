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

import { MODEL_ORCHESTRATOR } from '../../lib/llm.js';
import { PRODUCER_SYSTEM_PROMPT } from './prompts.js';
import { producerTools } from './tools.js';
import type { AgentConfig } from '../runtime/agent-protocol.js';

export const producerConfig: AgentConfig = {
  identity: {
    name: 'producer',
    domain: 'resume',
  },
  system_prompt: PRODUCER_SYSTEM_PROMPT,
  tools: producerTools,
  model: MODEL_ORCHESTRATOR,
  max_rounds: 8,
  round_timeout_ms: 120_000,   // 2 min per round
  overall_timeout_ms: 600_000, // 10 min total
};
