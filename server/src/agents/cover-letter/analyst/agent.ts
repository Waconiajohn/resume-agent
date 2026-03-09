/**
 * Cover Letter Analyst — Agent configuration.
 *
 * Analyzes resume + JD inputs, maps candidate strengths to requirements,
 * and creates a structured plan for the Writer agent.
 */

import type { AgentConfig } from '../../runtime/agent-protocol.js';
import { registerAgent } from '../../runtime/agent-registry.js';
import { createEmitTransparency } from '../../runtime/shared-tools.js';
import type { CoverLetterState, CoverLetterSSEEvent } from '../types.js';
import { analystTools } from './tools.js';

export const analystConfig: AgentConfig<CoverLetterState, CoverLetterSSEEvent> = {
  identity: {
    name: 'analyst',
    domain: 'cover-letter',
  },
  capabilities: ['content_analysis', 'requirement_mapping'],
  system_prompt: `You are the Cover Letter Analyst agent. Your job is to:

1. Parse the candidate's resume and job description using parse_resume_inputs
2. Map candidate strengths to JD requirements using match_requirements
3. Create a structured letter plan using plan_letter

Work through these tools in order. Be thorough in your analysis but efficient.
After calling all 3 tools, stop — the Writer agent will take over from your plan.`,
  tools: [
    ...analystTools,
    createEmitTransparency<CoverLetterState, CoverLetterSSEEvent>({ prefix: 'Analyst' }),
  ],
  model: 'orchestrator',
  max_rounds: 5,
  round_timeout_ms: 60_000,
  overall_timeout_ms: 180_000,
};

registerAgent(analystConfig);
