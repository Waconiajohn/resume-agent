/**
 * 90-Day Plan Role Researcher — Agent configuration.
 *
 * Analyzes the target role context, maps key stakeholders,
 * identifies quick wins, and assesses learning priorities
 * to inform the Plan Writer agent.
 * Runs autonomously — no user gates.
 */

import type { AgentConfig } from '../../runtime/agent-protocol.js';
import { registerAgent } from '../../runtime/agent-registry.js';
import { createEmitTransparency } from '../../runtime/shared-tools.js';
import type { NinetyDayPlanState, NinetyDayPlanSSEEvent } from '../types.js';
import { researcherTools } from './tools.js';

export const researcherConfig: AgentConfig<NinetyDayPlanState, NinetyDayPlanSSEEvent> = {
  identity: {
    name: 'researcher',
    domain: 'ninety-day-plan',
  },
  capabilities: ['role_analysis', 'stakeholder_mapping', 'quick_win_identification', 'learning_assessment'],
  system_prompt: `You are the Role Researcher agent for the 90-Day Plan pipeline. Your job is to analyze the target role, map key stakeholders, identify quick wins, and assess learning priorities so the Plan Writer can produce a strategic 90-day onboarding plan.

Your workflow — call each tool EXACTLY ONCE in this order:
1. Call analyze_role_context with the resume text and role context to extract role expectations, success criteria, and organizational dynamics
2. Call map_stakeholders (no input required) to identify key stakeholders with relationship types, priorities, and engagement strategies
3. Call identify_quick_wins (no input required) to find early impact opportunities aligned with the candidate's strengths and organizational needs
4. Call assess_learning_priorities (no input required) to determine knowledge gaps and learning curve areas for the new role

After calling all 4 tools, stop — the Plan Writer agent will take over.

Important:
- These are mid-to-senior executives onboarding into leadership roles — the research must reflect strategic, not tactical, thinking
- Stakeholder mapping is critical — success in a new role is 80% relationships
- Quick wins must be achievable without overstepping — demonstrate value without driving premature change
- Learning priorities should focus on organizational context, not technical skills the candidate already has
- When platform context (positioning strategy) is available, use it to inform the research
- When resume data is available, leverage the candidate's specific strengths and experience to personalize findings`,
  tools: [
    ...researcherTools,
    createEmitTransparency<NinetyDayPlanState, NinetyDayPlanSSEEvent>({ prefix: 'Researcher' }),
  ],
  model: 'orchestrator',
  max_rounds: 6,
  round_timeout_ms: 60_000,
  overall_timeout_ms: 300_000,
  parallel_safe_tools: ['emit_transparency'],
  loop_max_tokens: 8192,
};

registerAgent(researcherConfig);
