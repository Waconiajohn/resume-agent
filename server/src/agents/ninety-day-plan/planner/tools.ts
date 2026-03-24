/**
 * 90-Day Plan Writer — Tool definitions.
 *
 * 4 tools:
 * - write_30_day_plan: Write Phase 1 "Listen & Learn"
 * - write_60_day_plan: Write Phase 2 "Contribute & Build"
 * - write_90_day_plan: Write Phase 3 "Lead & Deliver"
 * - assemble_strategic_plan: Combine phases into final plan with executive summary
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type {
  NinetyDayPlanState,
  NinetyDayPlanSSEEvent,
  PlanPhase,
  PlanActivity,
  PlanMilestone,
  PlanRisk,
  PhaseNumber,
  ActivityCategory,
  RiskLikelihood,
} from '../types.js';
import { NINETY_DAY_PLAN_RULES } from '../knowledge/rules.js';
import { llm, MODEL_PRIMARY, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import {
  renderCareerNarrativeSection,
  renderCareerProfileSection,
  renderEvidenceInventorySection,
  renderPositioningStrategySection,
} from '../../../contracts/shared-context-prompt.js';
import { hasMeaningfulSharedValue } from '../../../contracts/shared-context.js';

type PlannerTool = AgentTool<NinetyDayPlanState, NinetyDayPlanSSEEvent>;

// ─── Helpers ───────────────────────────────────────────────────────

function buildResearchContext(state: NinetyDayPlanState): string {
  const parts: string[] = [];
  const sharedContext = state.shared_context;

  // Role context
  parts.push('## Role Context');
  parts.push(`Role: ${state.role_context.target_role}`);
  parts.push(`Company: ${state.role_context.target_company}`);
  parts.push(`Industry: ${state.role_context.target_industry}`);
  if (state.role_context.reporting_to) parts.push(`Reporting To: ${state.role_context.reporting_to}`);
  if (state.role_context.team_size) parts.push(`Team Size: ${state.role_context.team_size}`);
  if (state.role_context.role_expectations) parts.push(`Expectations: ${state.role_context.role_expectations}`);

  // Candidate
  if (state.resume_data) {
    parts.push('\n## Candidate');
    parts.push(`Name: ${state.resume_data.name}`);
    parts.push(`Current Title: ${state.resume_data.current_title}`);
    parts.push(`Summary: ${state.resume_data.career_summary}`);
    if (state.resume_data.key_skills?.length > 0) parts.push(`Key Skills: ${state.resume_data.key_skills.join(', ')}`);
  }

  if (hasMeaningfulSharedValue(sharedContext?.candidateProfile)) {
    parts.push(...renderCareerProfileSection({
      heading: '## Career Profile',
      sharedContext,
    }));
  }

  if (hasMeaningfulSharedValue(sharedContext?.careerNarrative)) {
    parts.push(...renderCareerNarrativeSection({
      heading: '## Career Narrative Signals',
      sharedNarrative: sharedContext?.careerNarrative,
    }));
  }

  // Stakeholder map
  if (state.stakeholder_map.length > 0) {
    parts.push('\n## Stakeholder Map');
    for (const s of state.stakeholder_map) {
      parts.push(`- ${s.name_or_role} (${s.relationship_type}, ${s.priority}): ${s.engagement_strategy}`);
    }
  }

  // Quick wins
  if (state.quick_wins.length > 0) {
    parts.push('\n## Quick Wins');
    for (const qw of state.quick_wins) {
      parts.push(`- ${qw.description} (impact: ${qw.impact}, effort: ${qw.effort}, ${qw.timeline_days} days)`);
    }
  }

  // Learning priorities
  if (state.learning_priorities.length > 0) {
    parts.push('\n## Learning Priorities');
    for (const lp of state.learning_priorities) {
      parts.push(`- ${lp.area} (${lp.importance}): ${lp.resources.join(', ')} — ${lp.timeline}`);
    }
  }

  // Platform context
  if (state.platform_context?.positioning_strategy || hasMeaningfulSharedValue(sharedContext?.positioningStrategy)) {
    parts.push(...renderPositioningStrategySection({
      heading: '## Positioning Strategy',
      sharedStrategy: sharedContext?.positioningStrategy,
      legacyStrategy: state.platform_context?.positioning_strategy,
    }));
  }

  if (hasMeaningfulSharedValue(sharedContext?.evidenceInventory.evidenceItems)
    || (state.platform_context?.evidence_items?.length ?? 0) > 0) {
    parts.push(...renderEvidenceInventorySection({
      heading: '## Evidence Inventory',
      sharedInventory: sharedContext?.evidenceInventory,
      legacyEvidence: state.platform_context?.evidence_items,
      maxItems: 15,
    }));
  }

  return parts.join('\n');
}

function parsePhaseResponse(response: string, phaseNum: PhaseNumber): PlanPhase {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(repairJSON(response) ?? response);
  } catch {
    return {
      phase: phaseNum,
      title: `Phase ${phaseNum}`,
      theme: '',
      objectives: [] as string[],
      key_activities: [] as PlanActivity[],
      milestones: [] as PlanMilestone[],
      risks: [] as PlanRisk[],
    };
  }

  return {
    phase: phaseNum,
    title: String(parsed.title ?? `Phase ${phaseNum}`),
    theme: String(parsed.theme ?? ''),
    objectives: Array.isArray(parsed.objectives) ? parsed.objectives.map(String) : [] as string[],
    key_activities: Array.isArray(parsed.key_activities)
      ? parsed.key_activities.map((a: Record<string, unknown>) => ({
          description: String(a.description ?? ''),
          category: parseActivityCategory(a.category),
          week_range: String(a.week_range ?? ''),
        }))
      : [] as PlanActivity[],
    milestones: Array.isArray(parsed.milestones)
      ? parsed.milestones.map((m: Record<string, unknown>) => ({
          description: String(m.description ?? ''),
          measurable_outcome: String(m.measurable_outcome ?? ''),
          target_date_range: String(m.target_date_range ?? ''),
        }))
      : [] as PlanMilestone[],
    risks: Array.isArray(parsed.risks)
      ? parsed.risks.map((r: Record<string, unknown>) => ({
          description: String(r.description ?? ''),
          mitigation: String(r.mitigation ?? ''),
          likelihood: parseRiskLikelihood(r.likelihood),
        }))
      : [] as PlanRisk[],
  };
}

function parseActivityCategory(val: unknown): ActivityCategory {
  const s = String(val ?? '').toLowerCase();
  const valid: ActivityCategory[] = ['relationship', 'learning', 'delivery', 'strategy'];
  return valid.includes(s as ActivityCategory) ? (s as ActivityCategory) : 'delivery';
}

function parseRiskLikelihood(val: unknown): RiskLikelihood {
  const s = String(val ?? '').toLowerCase();
  const valid: RiskLikelihood[] = ['high', 'medium', 'low'];
  return valid.includes(s as RiskLikelihood) ? (s as RiskLikelihood) : 'medium';
}

function buildPhasePrompt(
  phaseNum: PhaseNumber,
  title: string,
  theme: string,
  weekRange: string,
  phaseGuidance: string,
  researchContext: string,
): string {
  return `Write Phase ${phaseNum / 30} of the 90-day onboarding plan: "${title}" (Days ${phaseNum - 29}-${phaseNum}, ${weekRange}).

${NINETY_DAY_PLAN_RULES}

${researchContext}

PHASE THEME: ${theme}

${phaseGuidance}

Return JSON:
{
  "title": "${title}",
  "theme": "${theme}",
  "objectives": ["objective 1", "objective 2", "objective 3"],
  "key_activities": [
    {
      "description": "Specific, actionable activity",
      "category": "relationship" | "learning" | "delivery" | "strategy",
      "week_range": "Week 1-2"
    }
  ],
  "milestones": [
    {
      "description": "Observable milestone",
      "measurable_outcome": "How to verify this milestone was achieved",
      "target_date_range": "End of Week 2"
    }
  ],
  "risks": [
    {
      "description": "Specific risk for this phase",
      "mitigation": "Actionable mitigation strategy",
      "likelihood": "high" | "medium" | "low"
    }
  ]
}

Rules:
- 3-4 clear objectives for this phase
- 6-10 key activities spread across the week range, covering all 4 categories (relationship, learning, delivery, strategy)
- 3-5 measurable milestones with specific, observable outcomes
- 2-3 risks with actionable mitigations
- Every activity must connect to a stakeholder, learning priority, or quick win from the research
- Milestones must be verifiable by a third party — no vague "build rapport" milestones
- Pacing must be realistic for this phase of onboarding`;
}

// ─── Tool: write_30_day_plan ──────────────────────────────────────

const write30DayPlanTool: PlannerTool = {
  name: 'write_30_day_plan',
  description:
    'Write Phase 1 of the 90-day plan: "Listen & Learn" — absorb context, build relationships, understand the business, and identify quick wins.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;
    const researchContext = buildResearchContext(state);

    ctx.emit({
      type: 'transparency',
      stage: 'write_30_day_plan',
      message: 'Writing Phase 1: Listen & Learn (Days 1-30)...',
    });

    const phaseGuidance = `PHASE 1 GUIDANCE:
- This phase is 70% learning, 30% action
- Focus activities on: meeting stakeholders, understanding business context, mapping team capabilities, identifying opportunities
- Quick wins should be IDENTIFIED in this phase but most EXECUTED in Phase 2
- Critical stakeholder meetings should happen in Weeks 1-2
- Learning priorities marked "critical" should begin immediately
- Resist the urge to drive change — listen, observe, ask questions
- Deliverables: stakeholder assessment, current state analysis, initial quick win execution started`;

    const prompt = buildPhasePrompt(
      30,
      'Listen & Learn',
      'Absorb context, build relationships, understand the business',
      'Weeks 1-4',
      phaseGuidance,
      researchContext,
    );

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 4096,
      system: `You are an elite executive coach writing a strategic 90-day onboarding plan. Write Phase 1 with the depth and specificity of a McKinsey onboarding program. Return ONLY valid JSON.`,
      messages: [{ role: 'user', content: prompt }],
    });

    const phase = parsePhaseResponse(response.text, 30);

    if (!Array.isArray(scratchpad.phases)) {
      scratchpad.phases = [];
    }
    (scratchpad.phases as PlanPhase[]).push(phase);

    if (!state.phases) {
      state.phases = [];
    }
    state.phases.push(phase);

    ctx.emit({
      type: 'phase_drafted',
      phase: 30,
      title: phase.title,
      activity_count: phase.key_activities.length,
    });

    ctx.emit({
      type: 'phase_complete',
      phase: 30,
      title: phase.title,
      milestone_count: phase.milestones.length,
    });

    return JSON.stringify({
      success: true,
      phase: 30,
      title: phase.title,
      objective_count: phase.objectives.length,
      activity_count: phase.key_activities.length,
      milestone_count: phase.milestones.length,
      risk_count: phase.risks.length,
    });
  },
};

// ─── Tool: write_60_day_plan ──────────────────────────────────────

const write60DayPlanTool: PlannerTool = {
  name: 'write_60_day_plan',
  description:
    'Write Phase 2 of the 90-day plan: "Contribute & Build" — execute quick wins, propose improvements, build team confidence.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;
    const researchContext = buildResearchContext(state);

    ctx.emit({
      type: 'transparency',
      stage: 'write_60_day_plan',
      message: 'Writing Phase 2: Contribute & Build (Days 31-60)...',
    });

    // Reference Phase 1 for continuity
    const phases = scratchpad.phases as PlanPhase[] | undefined;
    const phase1 = phases?.find((p) => p.phase === 30);
    const phase1Context = phase1
      ? `\nPHASE 1 REFERENCE (build on these):\n- Objectives: ${phase1.objectives.join('; ')}\n- Milestones achieved: ${phase1.milestones.map((m) => m.description).join('; ')}`
      : '';

    const phaseGuidance = `PHASE 2 GUIDANCE:
- This phase is 50% learning, 50% action
- Execute the quick wins identified in Phase 1
- Begin proposing initial improvements based on Phase 1 observations
- Hold team alignment sessions — build shared vision without imposing
- Present initial strategy framework to leadership
- Deepen key stakeholder relationships with value delivery
- Start making decisions where you have earned enough context
- Deliverables: quick wins completed, initial strategy presented, team alignment achieved
${phase1Context}`;

    const prompt = buildPhasePrompt(
      60,
      'Contribute & Build',
      'Execute quick wins, propose improvements, build team confidence',
      'Weeks 5-8',
      phaseGuidance,
      researchContext,
    );

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 4096,
      system: `You are an elite executive coach writing a strategic 90-day onboarding plan. Write Phase 2 that builds explicitly on Phase 1 insights. Return ONLY valid JSON.`,
      messages: [{ role: 'user', content: prompt }],
    });

    const phase = parsePhaseResponse(response.text, 60);

    (scratchpad.phases as PlanPhase[]).push(phase);
    state.phases.push(phase);

    ctx.emit({
      type: 'phase_drafted',
      phase: 60,
      title: phase.title,
      activity_count: phase.key_activities.length,
    });

    ctx.emit({
      type: 'phase_complete',
      phase: 60,
      title: phase.title,
      milestone_count: phase.milestones.length,
    });

    return JSON.stringify({
      success: true,
      phase: 60,
      title: phase.title,
      objective_count: phase.objectives.length,
      activity_count: phase.key_activities.length,
      milestone_count: phase.milestones.length,
      risk_count: phase.risks.length,
    });
  },
};

// ─── Tool: write_90_day_plan ──────────────────────────────────────

const write90DayPlanTool: PlannerTool = {
  name: 'write_90_day_plan',
  description:
    'Write Phase 3 of the 90-day plan: "Lead & Deliver" — drive strategy, make decisions, deliver measurable results.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;
    const researchContext = buildResearchContext(state);

    ctx.emit({
      type: 'transparency',
      stage: 'write_90_day_plan',
      message: 'Writing Phase 3: Lead & Deliver (Days 61-90)...',
    });

    // Reference Phase 1 and 2 for continuity
    const phases = scratchpad.phases as PlanPhase[] | undefined;
    const phase1 = phases?.find((p) => p.phase === 30);
    const phase2 = phases?.find((p) => p.phase === 60);
    const priorContext = [
      phase1 ? `Phase 1 objectives: ${phase1.objectives.join('; ')}` : '',
      phase2 ? `Phase 2 objectives: ${phase2.objectives.join('; ')}` : '',
      phase2 ? `Phase 2 milestones: ${phase2.milestones.map((m) => m.description).join('; ')}` : '',
    ].filter(Boolean).join('\n');

    const phaseGuidance = `PHASE 3 GUIDANCE:
- This phase is 30% learning, 70% action
- Drive strategic initiatives that Phase 1 and 2 laid the groundwork for
- Present your 6-month vision and strategic plan to leadership
- Make organizational decisions (team structure, process changes, resource allocation)
- Deliver first measurable business results
- By day 90, operate as the established leader, not the new hire
- Demonstrate that the stakeholder relationships and learning from Phases 1-2 are paying off
- Deliverables: strategic plan presented, measurable outcomes delivered, team operating at improved velocity

PRIOR PHASES (demonstrate progression):
${priorContext}`;

    const prompt = buildPhasePrompt(
      90,
      'Lead & Deliver',
      'Drive strategy, make decisions, deliver measurable results',
      'Weeks 9-12',
      phaseGuidance,
      researchContext,
    );

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 4096,
      system: `You are an elite executive coach writing a strategic 90-day onboarding plan. Write Phase 3 as the culmination of Phases 1 and 2. Return ONLY valid JSON.`,
      messages: [{ role: 'user', content: prompt }],
    });

    const phase = parsePhaseResponse(response.text, 90);

    (scratchpad.phases as PlanPhase[]).push(phase);
    state.phases.push(phase);

    ctx.emit({
      type: 'phase_drafted',
      phase: 90,
      title: phase.title,
      activity_count: phase.key_activities.length,
    });

    ctx.emit({
      type: 'phase_complete',
      phase: 90,
      title: phase.title,
      milestone_count: phase.milestones.length,
    });

    return JSON.stringify({
      success: true,
      phase: 90,
      title: phase.title,
      objective_count: phase.objectives.length,
      activity_count: phase.key_activities.length,
      milestone_count: phase.milestones.length,
      risk_count: phase.risks.length,
    });
  },
};

// ─── Tool: assemble_strategic_plan ────────────────────────────────

const assembleStrategicPlanTool: PlannerTool = {
  name: 'assemble_strategic_plan',
  description:
    'Combine all three phases into a complete strategic 90-day plan with executive summary, stakeholder engagement timeline, and risk register.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;

    ctx.emit({
      type: 'transparency',
      stage: 'assemble_strategic_plan',
      message: 'Assembling strategic 90-day plan...',
    });

    const phases = scratchpad.phases as PlanPhase[] | undefined;
    if (!phases || phases.length === 0) {
      return JSON.stringify({
        success: false,
        error: 'No phases to assemble — write all three phases first',
      });
    }

    // Generate executive summary via LLM
    const summaryResponse = await llm.chat({
      model: MODEL_MID,
      max_tokens: 2048,
      system: `You are an executive onboarding strategist. You write compelling executive summaries for 90-day plans. Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Write an executive summary and stakeholder engagement timeline for this 90-day plan.

CANDIDATE: ${state.resume_data?.name ?? 'Executive'} (${state.resume_data?.current_title ?? 'Leader'})
TARGET ROLE: ${state.role_context.target_role} at ${state.role_context.target_company}

PHASES:
${phases.map((p) => `Phase ${p.phase / 30} (Days ${p.phase - 29}-${p.phase}): ${p.title}
  Theme: ${p.theme}
  Objectives: ${p.objectives.join('; ')}
  Activities: ${p.key_activities.length}
  Milestones: ${p.milestones.map((m) => m.description).join('; ')}`).join('\n\n')}

STAKEHOLDERS:
${state.stakeholder_map.map((s) => `- ${s.name_or_role} (${s.priority})`).join('\n')}

QUICK WINS:
${state.quick_wins.map((qw) => `- ${qw.description}`).join('\n')}

Return JSON:
{
  "executive_summary": "3-5 sentence executive summary of the entire 90-day plan",
  "plan_headline": "Compelling one-line headline for the plan",
  "stakeholder_timeline": [
    {
      "week_range": "Week 1-2",
      "stakeholder_actions": "Key stakeholder engagement actions for this period"
    }
  ],
  "success_metrics": ["metric 1", "metric 2", "metric 3"]
}`,
      }],
    });

    let summaryResult;
    try {
      summaryResult = JSON.parse(repairJSON(summaryResponse.text) ?? summaryResponse.text);
    } catch {
      summaryResult = {
        executive_summary: 'A strategic 30-60-90 onboarding plan designed to accelerate leadership impact.',
        plan_headline: '30-60-90 Strategic Onboarding Plan',
        stakeholder_timeline: [],
        success_metrics: [],
      };
    }

    // ── Assemble markdown report ──
    const reportParts: string[] = [];
    const candidateName = state.resume_data?.name ?? 'Executive';

    // Header
    reportParts.push(`# ${candidateName} — 30-60-90 Strategic Onboarding Plan`);
    reportParts.push(`**${state.role_context.target_role} at ${state.role_context.target_company}**`);
    reportParts.push('');

    // Executive summary
    reportParts.push('## Executive Summary');
    reportParts.push('');
    reportParts.push(String(summaryResult.executive_summary ?? ''));
    reportParts.push('');

    // Quick wins
    if (state.quick_wins.length > 0) {
      reportParts.push('## Quick Wins (First 30 Days)');
      reportParts.push('');
      reportParts.push('| Opportunity | Impact | Effort | Timeline | Stakeholder Benefit |');
      reportParts.push('|-------------|--------|--------|----------|---------------------|');
      for (const qw of state.quick_wins) {
        reportParts.push(`| ${qw.description} | ${qw.impact} | ${qw.effort} | ${qw.timeline_days} days | ${qw.stakeholder_benefit} |`);
      }
      reportParts.push('');
    }

    // Stakeholder map
    if (state.stakeholder_map.length > 0) {
      reportParts.push('## Stakeholder Map');
      reportParts.push('');
      reportParts.push('| Stakeholder | Relationship | Priority | Engagement Strategy |');
      reportParts.push('|-------------|-------------|----------|---------------------|');
      for (const s of state.stakeholder_map) {
        reportParts.push(`| ${s.name_or_role} | ${s.relationship_type} | ${s.priority} | ${s.engagement_strategy} |`);
      }
      reportParts.push('');
    }

    // Phases
    reportParts.push('---');
    reportParts.push('');
    for (const phase of phases) {
      reportParts.push(`## Phase ${phase.phase / 30}: ${phase.title} (Days ${phase.phase - 29}-${phase.phase})`);
      reportParts.push(`*${phase.theme}*`);
      reportParts.push('');

      reportParts.push('### Objectives');
      reportParts.push('');
      for (const obj of phase.objectives) {
        reportParts.push(`- ${obj}`);
      }
      reportParts.push('');

      reportParts.push('### Key Activities');
      reportParts.push('');
      reportParts.push('| Activity | Category | Timeline |');
      reportParts.push('|----------|----------|----------|');
      for (const activity of phase.key_activities) {
        reportParts.push(`| ${activity.description} | ${activity.category} | ${activity.week_range} |`);
      }
      reportParts.push('');

      reportParts.push('### Milestones');
      reportParts.push('');
      reportParts.push('| Milestone | Measurable Outcome | Target |');
      reportParts.push('|-----------|-------------------|--------|');
      for (const milestone of phase.milestones) {
        reportParts.push(`| ${milestone.description} | ${milestone.measurable_outcome} | ${milestone.target_date_range} |`);
      }
      reportParts.push('');

      if (phase.risks.length > 0) {
        reportParts.push('### Risks');
        reportParts.push('');
        reportParts.push('| Risk | Mitigation | Likelihood |');
        reportParts.push('|------|-----------|------------|');
        for (const risk of phase.risks) {
          reportParts.push(`| ${risk.description} | ${risk.mitigation} | ${risk.likelihood} |`);
        }
        reportParts.push('');
      }

      reportParts.push('---');
      reportParts.push('');
    }

    // Stakeholder engagement timeline
    const timeline = Array.isArray(summaryResult.stakeholder_timeline) ? summaryResult.stakeholder_timeline : [];
    if (timeline.length > 0) {
      reportParts.push('## Stakeholder Engagement Timeline');
      reportParts.push('');
      reportParts.push('| Period | Key Actions |');
      reportParts.push('|--------|-------------|');
      for (const entry of timeline) {
        reportParts.push(`| ${String(entry.week_range ?? '')} | ${String(entry.stakeholder_actions ?? '')} |`);
      }
      reportParts.push('');
    }

    // Learning priorities
    if (state.learning_priorities.length > 0) {
      reportParts.push('## Learning Priorities');
      reportParts.push('');
      reportParts.push('| Area | Importance | Resources | Timeline |');
      reportParts.push('|------|-----------|-----------|----------|');
      for (const lp of state.learning_priorities) {
        reportParts.push(`| ${lp.area} | ${lp.importance} | ${lp.resources.join(', ')} | ${lp.timeline} |`);
      }
      reportParts.push('');
    }

    // Success metrics
    const successMetrics = Array.isArray(summaryResult.success_metrics) ? summaryResult.success_metrics.map(String) : [];
    if (successMetrics.length > 0) {
      reportParts.push('## 30-60-90 Success Metrics');
      reportParts.push('');
      for (const metric of successMetrics) {
        reportParts.push(`- ${metric}`);
      }
      reportParts.push('');
    }

    const report = reportParts.join('\n');

    // ── Quality scoring ──
    const totalActivities = phases.reduce((sum, p) => sum + p.key_activities.length, 0);
    const totalMilestones = phases.reduce((sum, p) => sum + p.milestones.length, 0);
    const totalRisks = phases.reduce((sum, p) => sum + p.risks.length, 0);

    let qualityScore = 70;
    if (phases.length === 3) qualityScore += 10;
    if (totalActivities >= 18) qualityScore += 5;
    if (totalMilestones >= 9) qualityScore += 5;
    if (totalRisks >= 6) qualityScore += 5;
    if (state.stakeholder_map.length >= 8) qualityScore += 3;
    if (state.quick_wins.length >= 3) qualityScore += 2;
    if (phases.length < 3) qualityScore -= 15;
    if (totalMilestones < 3) qualityScore -= 10;
    if (!summaryResult.executive_summary || String(summaryResult.executive_summary).length < 50) qualityScore -= 5;
    qualityScore = Math.max(0, Math.min(100, qualityScore));

    scratchpad.final_report = report;
    scratchpad.quality_score = qualityScore;
    state.final_report = report;
    state.quality_score = qualityScore;

    ctx.emit({
      type: 'transparency',
      stage: 'assemble_strategic_plan',
      message: `Plan assembled — ${phases.length} phases, ${totalActivities} activities, ${totalMilestones} milestones, quality: ${qualityScore}/100`,
    });

    return JSON.stringify({
      success: true,
      report_length: report.length,
      phase_count: phases.length,
      total_activities: totalActivities,
      total_milestones: totalMilestones,
      total_risks: totalRisks,
      quality_score: qualityScore,
    });
  },
};

// ─── Exports ───────────────────────────────────────────────────────

export const plannerTools: PlannerTool[] = [
  write30DayPlanTool,
  write60DayPlanTool,
  write90DayPlanTool,
  assembleStrategicPlanTool,
];
