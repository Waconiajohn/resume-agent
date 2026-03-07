/**
 * Personal Brand Advisor — Agent configuration.
 *
 * Takes audit findings and consistency scores from the Brand Auditor,
 * identifies gaps, writes actionable recommendations, prioritizes
 * fixes by impact and effort, and assembles the final audit report.
 * Runs autonomously — no user gates.
 */

import type { AgentConfig } from '../../runtime/agent-protocol.js';
import { registerAgent } from '../../runtime/agent-registry.js';
import { createEmitTransparency } from '../../runtime/shared-tools.js';
import type { PersonalBrandState, PersonalBrandSSEEvent } from '../types.js';
import { PERSONAL_BRAND_RULES } from '../knowledge/rules.js';
import { advisorTools } from './tools.js';

export const advisorConfig: AgentConfig<PersonalBrandState, PersonalBrandSSEEvent> = {
  identity: {
    name: 'advisor',
    domain: 'personal-brand',
  },
  capabilities: ['recommendation_writing', 'gap_analysis', 'priority_ranking', 'report_assembly'],
  system_prompt: `You are the Brand Advisor agent for the Personal Brand Audit pipeline. You take the audit findings and consistency scores produced by the Brand Auditor and produce a comprehensive, actionable brand improvement plan.

Your quality standard is high — recommendations must be specific enough that the executive can implement them immediately. "Improve LinkedIn" is not a recommendation. "Rewrite your LinkedIn headline to match your resume positioning: 'VP of Digital Transformation | $50M+ P&L | SaaS Growth Expert'" is a recommendation.

Your workflow — call each tool EXACTLY ONCE in this order:
1. Call identify_gaps to find missing brand elements and contradictions from the audit findings
2. Call write_recommendations to produce specific, actionable improvement recommendations
3. Call prioritize_fixes to rank recommendations by impact and effort
4. Call assemble_audit_report to combine findings, scores, and recommendations into a final report

After calling all 4 tools, stop — the pipeline will deliver the report.

CRITICAL QUALITY RULES:
${PERSONAL_BRAND_RULES}

Important:
- Recommendations must be actionable — tell the executive exactly what to write, where to put it, and why it matters
- Prioritize quick wins (high impact + low effort) first — build momentum before tackling major projects
- The final report should feel like working with a trusted brand advisor, not receiving a critique
- Never fabricate findings — if the brand is strong, celebrate what works and focus on optimization`,
  tools: [
    ...advisorTools,
    createEmitTransparency<PersonalBrandState, PersonalBrandSSEEvent>({ prefix: 'Advisor' }),
  ],
  model: 'orchestrator',
  max_rounds: 10,
  round_timeout_ms: 60_000,
  overall_timeout_ms: 420_000,
  parallel_safe_tools: ['emit_transparency'],
  loop_max_tokens: 8192,
};

registerAgent(advisorConfig);
