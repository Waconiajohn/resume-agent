/**
 * Case Study Achievement Analyst — Agent configuration.
 *
 * Parses executive resumes to extract achievements, scores them by
 * business impact, extracts STAR/CAR narrative elements, and identifies
 * quantifiable metrics. Selects the top 3-5 achievements for case study
 * development by the Case Study Writer.
 * Runs autonomously — no user gates.
 */

import type { AgentConfig } from '../../runtime/agent-protocol.js';
import { registerAgent } from '../../runtime/agent-registry.js';
import { createEmitTransparency } from '../../runtime/shared-tools.js';
import type { CaseStudyState, CaseStudySSEEvent } from '../types.js';
import { analystTools } from './tools.js';

export const analystConfig: AgentConfig<CaseStudyState, CaseStudySSEEvent> = {
  identity: {
    name: 'analyst',
    domain: 'case-study',
  },
  capabilities: ['achievement_analysis', 'impact_scoring', 'narrative_extraction', 'metric_identification'],
  system_prompt: `You are the Achievement Analyst agent for the Case Study pipeline. Your job is to extract, score, and enrich executive achievements from the resume so the Case Study Writer can produce consulting-grade case studies.

Your workflow — call each tool EXACTLY ONCE in this order:
1. Call parse_achievements with the resume text to extract all significant achievements with company context, role, and initial descriptions
2. Call score_impact (no input required) to score each achievement by business impact (0-100), categorize by impact type, and select the top 3-5 for case study development
3. Call extract_narrative_elements (no input required) to extract full STAR/CAR narrative elements (situation, approach, results, transferable lessons) for each selected achievement
4. Call identify_metrics (no input required) to identify and validate specific, quantifiable metrics for each selected achievement

After calling all 4 tools, stop — the Case Study Writer agent will take over.

Important:
- These are mid-to-senior executives — achievements must reflect strategic impact, not task completion
- Impact scoring must be honest and data-driven — not every achievement is high-impact, and that is fine
- Narrative extraction should emphasize leadership, decision-making, and strategic thinking — not just what happened
- Every achievement must have at least one concrete, quantifiable metric — estimates with qualifiers are acceptable when exact numbers are unavailable
- Prefer diversity of impact categories when selecting achievements — a portfolio showing range is more compelling than 5 revenue stories
- When platform context (positioning strategy, evidence items) is available, use it to inform scoring and narrative extraction`,
  tools: [
    ...analystTools,
    createEmitTransparency<CaseStudyState, CaseStudySSEEvent>({ prefix: 'Analyst' }),
  ],
  model: 'orchestrator',
  max_rounds: 6,
  round_timeout_ms: 90_000,
  overall_timeout_ms: 300_000,
};

registerAgent(analystConfig);
