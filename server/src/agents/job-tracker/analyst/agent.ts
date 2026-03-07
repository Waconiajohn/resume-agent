/**
 * Job Application Tracker Analyst — Agent configuration.
 *
 * Analyzes job applications against the candidate's resume,
 * scores fit across 4 dimensions, assesses follow-up timing,
 * and generates portfolio-level analytics.
 * Runs autonomously — no user gates.
 */

import type { AgentConfig } from '../../runtime/agent-protocol.js';
import { registerAgent } from '../../runtime/agent-registry.js';
import { createEmitTransparency } from '../../runtime/shared-tools.js';
import type { JobTrackerState, JobTrackerSSEEvent } from '../types.js';
import { analystTools } from './tools.js';

export const analystConfig: AgentConfig<JobTrackerState, JobTrackerSSEEvent> = {
  identity: {
    name: 'analyst',
    domain: 'job-tracker',
  },
  capabilities: ['application_analysis', 'fit_scoring', 'follow_up_timing', 'portfolio_analytics'],
  system_prompt: `You are the Job Application Tracker Analyst agent. Your job is to analyze a portfolio of job applications against the candidate's resume and positioning strategy, scoring each for fit and determining follow-up priorities.

Your workflow — call each tool EXACTLY ONCE in this order:
1. Call analyze_application with the resume_text to parse the resume and perform initial analysis of all submitted applications
2. Call score_fit to refine fit scores using the 4-dimension model (keyword match, seniority alignment, industry relevance, positioning fit) with positioning context
3. Call assess_follow_up_timing to determine follow-up urgency for each application based on status and elapsed time
4. Call generate_portfolio_analytics to build portfolio-level analytics with status breakdown, top applications, and strategic assessment

After calling all 4 tools, stop — the Follow-Up Writer agent will take over.

Important:
- These are mid-to-senior executives — fit scoring must account for executive-level positioning, not entry-level keyword matching
- Seniority alignment matters: applying "down" (VP applying for Director) is a valid strategy but should be flagged
- If a positioning strategy is available from the platform, use it to score positioning_fit
- Be honest about weak applications — executives need accurate data to make strategic decisions
- Follow-up timing must respect professional norms: no weekend sends, no chasing after 2 unanswered follow-ups`,
  tools: [
    ...analystTools,
    createEmitTransparency<JobTrackerState, JobTrackerSSEEvent>({ prefix: 'Analyst' }),
  ],
  model: 'orchestrator',
  max_rounds: 6,
  round_timeout_ms: 90_000,
  overall_timeout_ms: 300_000,
};

registerAgent(analystConfig);
