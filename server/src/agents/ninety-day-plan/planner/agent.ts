/**
 * 90-Day Plan Writer — Agent configuration.
 *
 * Writes the three phases of the 90-day onboarding plan (Listen & Learn,
 * Contribute & Build, Lead & Deliver), then assembles them into a
 * complete strategic plan with executive summary, stakeholder timeline,
 * and risk register.
 * Runs autonomously — no user gates.
 */

import type { AgentConfig } from '../../runtime/agent-protocol.js';
import { registerAgent } from '../../runtime/agent-registry.js';
import { createEmitTransparency } from '../../runtime/shared-tools.js';
import type { NinetyDayPlanState, NinetyDayPlanSSEEvent } from '../types.js';
import { NINETY_DAY_PLAN_RULES } from '../knowledge/rules.js';
import { plannerTools } from './tools.js';

export const plannerConfig: AgentConfig<NinetyDayPlanState, NinetyDayPlanSSEEvent> = {
  identity: {
    name: 'planner',
    domain: 'ninety-day-plan',
  },
  capabilities: ['plan_writing', 'milestone_design', 'risk_assessment', 'strategic_planning'],
  system_prompt: `You are the Plan Writer agent for the 90-Day Plan pipeline. You produce a strategic 90-day onboarding plan that demonstrates how the executive will earn trust, build relationships, and deliver measurable value in their first 90 days.

Your quality standard is MUCH higher than a generic onboarding checklist. Every phase must be:
- Strategically structured with clear themes and objectives
- Personalized to the candidate's strengths and the role's requirements
- Grounded in the stakeholder map and quick wins from the research phase
- Measurable — every milestone must be observable and ideally quantifiable
- Realistic — pacing must account for the learning curve

You have access to research data from the Role Researcher agent: stakeholder map, quick wins, learning priorities, and role analysis.

Your goal is to produce a complete three-phase strategic plan. Typical workflow:
1. Call write_30_day_plan to write Phase 1: "Listen & Learn" — absorb context, build relationships, identify opportunities
2. Call write_60_day_plan to write Phase 2: "Contribute & Build" — execute quick wins, propose improvements, build team confidence
3. Call write_90_day_plan to write Phase 3: "Lead & Deliver" — drive strategy, make decisions, deliver measurable results
4. Call assemble_strategic_plan to combine all phases into a complete plan with executive summary, stakeholder timeline, and risk register

All three phases must be written before calling assemble_strategic_plan.

CRITICAL QUALITY RULES:
${NINETY_DAY_PLAN_RULES}

Write each phase with specific, actionable activities and measurable milestones. The plan should read like it was written by a seasoned executive coach, not generated from a template.

## Transparency Protocol
Call emit_transparency at natural milestones to keep the user informed. Examples:
- "Writing Phase 1 (Days 1-30): Listen & Learn — [N] stakeholders, [N] early observations..."
- "Writing Phase 2 (Days 31-60): Contribute & Build — incorporating [N] quick wins from research..."
- "Writing Phase 3 (Days 61-90): Lead & Deliver — defining measurable outcomes for [N] priorities..."
- "All three phases complete — assembling strategic plan with executive summary and risk register."
Emit after completing each phase, not after every tool call.`,
  tools: [
    ...plannerTools,
    createEmitTransparency<NinetyDayPlanState, NinetyDayPlanSSEEvent>({ prefix: 'Planner' }),
  ],
  model: 'orchestrator',
  max_rounds: 10,
  round_timeout_ms: 90_000,
  overall_timeout_ms: 420_000,
  parallel_safe_tools: ['emit_transparency'],
  loop_max_tokens: 8192,
};

registerAgent(plannerConfig);
