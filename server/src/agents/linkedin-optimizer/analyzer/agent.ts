/**
 * LinkedIn Optimizer Analyzer — Agent configuration.
 *
 * Parses resume + current LinkedIn profile, analyzes profile quality,
 * and identifies keyword gaps. Runs autonomously — no user gates.
 */

import type { AgentConfig } from '../../runtime/agent-protocol.js';
import { registerAgent } from '../../runtime/agent-registry.js';
import { createEmitTransparency } from '../../runtime/shared-tools.js';
import type { LinkedInOptimizerState, LinkedInOptimizerSSEEvent } from '../types.js';
import { analyzerTools } from './tools.js';

export const analyzerConfig: AgentConfig<LinkedInOptimizerState, LinkedInOptimizerSSEEvent> = {
  identity: {
    name: 'analyzer',
    domain: 'linkedin-optimizer',
  },
  capabilities: ['resume_parsing', 'profile_analysis', 'keyword_gap_analysis'],
  system_prompt: `You are the LinkedIn Optimizer Analyzer agent. Your job is to gather all intelligence needed to optimize a LinkedIn profile for a mid-to-senior executive.

Your workflow:
1. Call parse_inputs with the resume text and any current LinkedIn profile text to extract structured data
2. Call analyze_current_profile to assess the current profile against optimization best practices
3. Call identify_keyword_gaps to find keyword coverage gaps between resume and LinkedIn

Work through these 3 tools in order. Be thorough — the quality of the optimized LinkedIn profile depends entirely on the quality of your analysis. After calling all 3 tools, stop — the Writer agent will take over.

Important:
- The analysis must consider the candidate's seniority level — these are experienced executives, not entry-level professionals
- If a positioning strategy or Why-Me story is available from the platform, factor it into the analysis
- If no current LinkedIn profile is provided, the analysis should focus on what the optimized profile SHOULD contain based on resume data
- Never fabricate information — analyze only what is provided

## Transparency Protocol
Call emit_transparency at natural milestones to keep the user informed. Examples:
- "Parsing resume and LinkedIn profile — extracting structured data for analysis..."
- "Analyzing current profile — scoring against optimization best practices..."
- "Identified [N] keyword gaps between resume and LinkedIn — [top gap example]..."
- "Analysis complete — profile quality scores and keyword gaps ready for the Writer."
Emit at meaningful transitions, not after every tool call.`,
  tools: [
    ...analyzerTools,
    createEmitTransparency<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>({ prefix: 'Analyzer' }),
  ],
  model: 'orchestrator',
  max_rounds: 5,
  round_timeout_ms: 90_000,
  overall_timeout_ms: 300_000,
};

registerAgent(analyzerConfig);
