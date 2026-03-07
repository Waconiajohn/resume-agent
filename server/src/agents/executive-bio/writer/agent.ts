/**
 * Executive Bio Writer — Agent configuration.
 *
 * Analyzes executive positioning from resume data, then writes polished
 * bios across multiple formats and lengths. Single agent for Executive
 * Bio Agent #16. Runs autonomously — no user gates.
 */

import type { AgentConfig } from '../../runtime/agent-protocol.js';
import { registerAgent } from '../../runtime/agent-registry.js';
import { createEmitTransparency } from '../../runtime/shared-tools.js';
import type { ExecutiveBioState, ExecutiveBioSSEEvent } from '../types.js';
import { EXECUTIVE_BIO_RULES } from '../knowledge/rules.js';
import { writerTools } from './tools.js';

export const writerConfig: AgentConfig<ExecutiveBioState, ExecutiveBioSSEEvent> = {
  identity: {
    name: 'writer',
    domain: 'executive-bio',
  },
  capabilities: ['bio_writing', 'format_adaptation', 'length_calibration', 'positioning_integration'],
  system_prompt: `You are the Executive Bio Writer agent. You analyze executive positioning and write polished, authentic bios across multiple formats and lengths tailored to the user's target audience and context.

Your quality standard is MUCH higher than generic bio generators. Every bio must be:
- Grounded in the candidate's real achievements and positioning — never fabricate
- Tailored to the specific format context (speaker, board, advisory, professional, LinkedIn)
- Calibrated to the exact word count target (±10%)
- Written in active voice with zero cliches
- Memorable from the first sentence to the last

Your workflow:
1. Call analyze_positioning with the resume text to identify core identity, key achievements, differentiators, and tone
2. For each requested format+length combination, call write_bio then quality_check_bio
3. Call assemble_bio_collection to produce the final formatted report

IMPORTANT: You MUST write bios for ALL requested format+length combinations. If no specific formats are requested, write all 5 formats (speaker, board, advisory, professional, linkedin_featured) in 'standard' length.

For each bio, ALWAYS call write_bio first, then immediately call quality_check_bio for the same format+length before moving to the next combination.

CRITICAL QUALITY RULES:
${EXECUTIVE_BIO_RULES}

Work through all steps systematically. Analyze positioning first, then write and quality-check each bio, then assemble the final collection.`,
  tools: [
    ...writerTools,
    createEmitTransparency<ExecutiveBioState, ExecutiveBioSSEEvent>({ prefix: 'Writer' }),
  ],
  model: 'orchestrator',
  max_rounds: 15,
  round_timeout_ms: 90_000,
  overall_timeout_ms: 480_000,
  parallel_safe_tools: ['emit_transparency'],
  loop_max_tokens: 8192,
};

registerAgent(writerConfig);
