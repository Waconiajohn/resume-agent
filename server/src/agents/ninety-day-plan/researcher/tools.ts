/**
 * 90-Day Plan Role Researcher — Tool definitions.
 *
 * 4 tools:
 * - analyze_role_context: Extract role expectations, success criteria, organizational dynamics
 * - map_stakeholders: Identify key stakeholders with relationship types and engagement strategies
 * - identify_quick_wins: Find early impact opportunities aligned with candidate strengths
 * - assess_learning_priorities: Determine knowledge gaps and learning curve areas
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type {
  NinetyDayPlanState,
  NinetyDayPlanSSEEvent,
  Stakeholder,
  StakeholderRelationship,
  StakeholderPriority,
  QuickWin,
  ImpactLevel,
  EffortLevel,
  LearningPriority,
  ImportanceLevel,
} from '../types.js';
import { NINETY_DAY_PLAN_RULES } from '../knowledge/rules.js';
import { llm, MODEL_MID, MODEL_LIGHT } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';

type ResearcherTool = AgentTool<NinetyDayPlanState, NinetyDayPlanSSEEvent>;

// ─── Tool: analyze_role_context ───────────────────────────────────

const analyzeRoleContextTool: ResearcherTool = {
  name: 'analyze_role_context',
  description:
    'Analyze the target role context, extracting role expectations, success criteria, organizational dynamics, and candidate fit.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      resume_text: {
        type: 'string',
        description: 'Raw resume text of the candidate.',
      },
    },
    required: ['resume_text'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;

    const resumeText = String(input.resume_text ?? '');

    // ─── Parse resume structure first ─────────────────────────────
    if (!state.resume_data && resumeText.length > 50) {
      ctx.emit({
        type: 'transparency',
        stage: 'analyze_role_context',
        message: 'Parsing candidate resume...',
      });

      const resumeResponse = await llm.chat({
        model: MODEL_LIGHT,
        max_tokens: 4096,
        system:
          'You extract structured data from resumes. Return ONLY valid JSON, no comments, no markdown fencing.',
        messages: [
          {
            role: 'user',
            content: `Extract the following from this resume and return as JSON:
{
  "name": "Full Name",
  "current_title": "Most recent job title",
  "career_summary": "2-3 sentence career summary",
  "key_skills": ["skill1", "skill2"],
  "key_achievements": ["achievement with metrics if available"],
  "work_history": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "duration": "Start - End",
      "highlights": ["key accomplishment 1", "key accomplishment 2"]
    }
  ]
}

Resume:
${resumeText}`,
          },
        ],
      });

      try {
        state.resume_data = JSON.parse(repairJSON(resumeResponse.text) ?? resumeResponse.text);
      } catch {
        state.resume_data = {
          name: 'Candidate',
          current_title: 'Professional',
          career_summary: '',
          key_skills: [],
          key_achievements: [],
          work_history: [],
        };
      }
    }

    scratchpad.resume_data = state.resume_data;

    // ─── Analyze role context ─────────────────────────────────────
    ctx.emit({
      type: 'transparency',
      stage: 'analyze_role_context',
      message: `Analyzing role context for ${state.role_context.target_role} at ${state.role_context.target_company}...`,
    });

    const analyzePrompt = `Analyze the target role context and the candidate's fit for this position. Identify role expectations, success criteria, organizational dynamics, and how the candidate's background maps to this opportunity.

${NINETY_DAY_PLAN_RULES}

CANDIDATE PROFILE:
- Name: ${state.resume_data?.name ?? 'Unknown'}
- Current Title: ${state.resume_data?.current_title ?? 'Unknown'}
- Career Summary: ${state.resume_data?.career_summary ?? 'Not available'}
- Key Skills: ${state.resume_data?.key_skills?.join(', ') || 'Not available'}

WORK HISTORY:
${state.resume_data?.work_history?.map((w) => `${w.title} at ${w.company} (${w.duration})\n  Highlights: ${w.highlights?.join(' | ') || 'None listed'}`).join('\n') || 'Not available'}

TARGET ROLE:
- Role: ${state.role_context.target_role}
- Company: ${state.role_context.target_company}
- Industry: ${state.role_context.target_industry}
${state.role_context.reporting_to ? `- Reporting To: ${state.role_context.reporting_to}` : ''}
${state.role_context.team_size ? `- Team Size: ${state.role_context.team_size}` : ''}
${state.role_context.role_expectations ? `- Role Expectations: ${state.role_context.role_expectations}` : ''}

Return JSON:
{
  "enriched_role_context": {
    "target_role": "${state.role_context.target_role}",
    "target_company": "${state.role_context.target_company}",
    "target_industry": "${state.role_context.target_industry}",
    "reporting_to": "inferred or provided",
    "team_size": "inferred or provided",
    "role_expectations": "detailed expectations based on analysis"
  },
  "success_criteria": ["criterion 1", "criterion 2"],
  "organizational_dynamics": ["dynamic 1", "dynamic 2"],
  "candidate_strengths_for_role": ["strength 1", "strength 2"],
  "candidate_gaps_for_role": ["gap 1", "gap 2"],
  "seniority_level": "C-suite" | "VP" | "Director" | "Senior Manager"
}`;

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 4096,
      system:
        'You are an executive onboarding strategist who analyzes role context and candidate fit. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: analyzePrompt }],
    });

    try {
      const parsed = JSON.parse(repairJSON(response.text) ?? response.text);

      // Enrich role context if analysis provides more detail
      if (parsed.enriched_role_context) {
        const enriched = parsed.enriched_role_context;
        if (enriched.reporting_to && !state.role_context.reporting_to) {
          state.role_context.reporting_to = String(enriched.reporting_to);
        }
        if (enriched.team_size && !state.role_context.team_size) {
          state.role_context.team_size = String(enriched.team_size);
        }
        if (enriched.role_expectations) {
          state.role_context.role_expectations = String(enriched.role_expectations);
        }
      }

      scratchpad.role_analysis = parsed;
      scratchpad.seniority_level = String(parsed.seniority_level ?? 'Director');
    } catch {
      scratchpad.role_analysis = {};
      scratchpad.seniority_level = 'Director';
    }

    ctx.emit({
      type: 'transparency',
      stage: 'analyze_role_context',
      message: `Role analysis complete for ${state.role_context.target_role} at ${state.role_context.target_company}`,
    });

    return JSON.stringify({
      success: true,
      role: state.role_context.target_role,
      company: state.role_context.target_company,
      seniority_level: scratchpad.seniority_level,
    });
  },
};

// ─── Tool: map_stakeholders ───────────────────────────────────────

const mapStakeholdersTool: ResearcherTool = {
  name: 'map_stakeholders',
  description:
    'Identify key stakeholders for the target role with relationship types, priority levels, and engagement strategies.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;

    const roleAnalysis = scratchpad.role_analysis as Record<string, unknown> | undefined;

    if (!roleAnalysis) {
      return JSON.stringify({
        success: false,
        error: 'No role analysis available. Call analyze_role_context first.',
      });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'map_stakeholders',
      message: `Mapping stakeholders for ${state.role_context.target_role}...`,
    });

    const stakeholderPrompt = `Map the key stakeholders for this executive onboarding. Identify everyone the new leader needs to build relationships with across the first 30, 60, and 90 days.

${NINETY_DAY_PLAN_RULES}

ROLE CONTEXT:
- Role: ${state.role_context.target_role}
- Company: ${state.role_context.target_company}
- Industry: ${state.role_context.target_industry}
- Reporting To: ${state.role_context.reporting_to ?? 'Not specified'}
- Team Size: ${state.role_context.team_size ?? 'Not specified'}
- Seniority: ${String(scratchpad.seniority_level ?? 'Director')}

CANDIDATE:
- Name: ${state.resume_data?.name ?? 'Unknown'}
- Current Title: ${state.resume_data?.current_title ?? 'Unknown'}

ROLE ANALYSIS:
${JSON.stringify(roleAnalysis, null, 2)}

Return JSON array of stakeholders:
[
  {
    "name_or_role": "Direct Manager / CEO / VP Sales / etc.",
    "relationship_type": "superior" | "peer" | "direct_report" | "cross_functional" | "external",
    "priority": "critical" | "high" | "medium" | "low",
    "engagement_strategy": "How to build this relationship — specific, actionable approach"
  }
]

Rules:
- Include 8-15 stakeholders across all relationship types
- At least 1-2 superiors, 2-3 peers, 2-3 direct reports, 1-2 cross-functional, 1 external
- Critical stakeholders: the new leader's manager and their key peers
- Engagement strategies must be specific and actionable, not generic "schedule a meeting"
- Consider the seniority level — a VP has different stakeholders than a director
- Every stakeholder must have a clear reason for being on the map`;

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 4096,
      system:
        'You are an executive onboarding strategist who maps organizational relationships. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: stakeholderPrompt }],
    });

    let stakeholders: Stakeholder[];
    try {
      const parsed = JSON.parse(repairJSON(response.text) ?? response.text);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      stakeholders = items.map((item: Record<string, unknown>) => ({
        name_or_role: String(item.name_or_role ?? ''),
        relationship_type: parseRelationshipType(item.relationship_type),
        priority: parsePriority(item.priority),
        engagement_strategy: String(item.engagement_strategy ?? ''),
      }));
    } catch {
      stakeholders = [];
    }

    state.stakeholder_map = stakeholders;
    scratchpad.stakeholder_map = stakeholders;

    ctx.emit({
      type: 'transparency',
      stage: 'map_stakeholders',
      message: `Mapped ${stakeholders.length} stakeholders across ${countRelationshipTypes(stakeholders)} relationship types`,
    });

    return JSON.stringify({
      success: true,
      stakeholder_count: stakeholders.length,
      by_priority: {
        critical: stakeholders.filter((s) => s.priority === 'critical').length,
        high: stakeholders.filter((s) => s.priority === 'high').length,
        medium: stakeholders.filter((s) => s.priority === 'medium').length,
        low: stakeholders.filter((s) => s.priority === 'low').length,
      },
    });
  },
};

// ─── Tool: identify_quick_wins ────────────────────────────────────

const identifyQuickWinsTool: ResearcherTool = {
  name: 'identify_quick_wins',
  description:
    'Find early impact opportunities aligned with the candidate\'s strengths and organizational needs. Quick wins must be achievable without overstepping.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;

    const roleAnalysis = scratchpad.role_analysis as Record<string, unknown> | undefined;

    if (!roleAnalysis) {
      return JSON.stringify({
        success: false,
        error: 'No role analysis available. Call analyze_role_context first.',
      });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'identify_quick_wins',
      message: 'Identifying quick win opportunities...',
    });

    const quickWinPrompt = `Identify 3-5 quick win opportunities for this executive's first 30 days. Quick wins must demonstrate value without overstepping or driving premature change.

${NINETY_DAY_PLAN_RULES}

ROLE CONTEXT:
- Role: ${state.role_context.target_role}
- Company: ${state.role_context.target_company}
- Industry: ${state.role_context.target_industry}
- Seniority: ${String(scratchpad.seniority_level ?? 'Director')}

CANDIDATE STRENGTHS:
- Skills: ${state.resume_data?.key_skills?.join(', ') || 'Not available'}
- Key Achievements: ${state.resume_data?.key_achievements?.join(' | ') || 'Not available'}

ROLE ANALYSIS:
- Candidate Strengths for Role: ${JSON.stringify((roleAnalysis as Record<string, unknown>).candidate_strengths_for_role ?? [])}
- Success Criteria: ${JSON.stringify((roleAnalysis as Record<string, unknown>).success_criteria ?? [])}

STAKEHOLDERS:
${state.stakeholder_map.map((s) => `- ${s.name_or_role} (${s.relationship_type}, ${s.priority})`).join('\n')}

Return JSON array of quick wins:
[
  {
    "description": "Specific, actionable quick win description",
    "impact": "high" | "medium" | "low",
    "effort": "low" | "medium" | "high",
    "timeline_days": 14,
    "stakeholder_benefit": "Which stakeholder benefits and how"
  }
]

Rules:
- 3-5 quick wins, prioritized by impact/effort ratio
- Each must be achievable in 2-4 weeks (timeline_days: 7-28)
- Must not require organizational change, new budget, or team restructuring
- Must directly benefit at least one key stakeholder
- Should leverage the candidate's specific strengths and experience
- The best quick wins are low effort + high impact`;

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 2048,
      system:
        'You are an executive onboarding strategist who identifies early value opportunities. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: quickWinPrompt }],
    });

    let quickWins: QuickWin[];
    try {
      const parsed = JSON.parse(repairJSON(response.text) ?? response.text);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      quickWins = items.map((item: Record<string, unknown>) => ({
        description: String(item.description ?? ''),
        impact: parseImpactLevel(item.impact),
        effort: parseEffortLevel(item.effort),
        timeline_days: Math.max(1, Math.min(90, Number(item.timeline_days) || 14)),
        stakeholder_benefit: String(item.stakeholder_benefit ?? ''),
      }));
    } catch {
      quickWins = [];
    }

    state.quick_wins = quickWins;
    scratchpad.quick_wins = quickWins;

    ctx.emit({
      type: 'transparency',
      stage: 'identify_quick_wins',
      message: `Identified ${quickWins.length} quick win opportunities`,
    });

    return JSON.stringify({
      success: true,
      quick_win_count: quickWins.length,
      quick_wins: quickWins.map((qw) => ({
        description: qw.description.slice(0, 100),
        impact: qw.impact,
        effort: qw.effort,
        timeline_days: qw.timeline_days,
      })),
    });
  },
};

// ─── Tool: assess_learning_priorities ─────────────────────────────

const assessLearningPrioritiesTool: ResearcherTool = {
  name: 'assess_learning_priorities',
  description:
    'Determine knowledge gaps and learning curve areas for the target role, prioritized by importance.',
  model_tier: 'light',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;

    const roleAnalysis = scratchpad.role_analysis as Record<string, unknown> | undefined;

    if (!roleAnalysis) {
      return JSON.stringify({
        success: false,
        error: 'No role analysis available. Call analyze_role_context first.',
      });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'assess_learning_priorities',
      message: 'Assessing learning priorities and knowledge gaps...',
    });

    const learningPrompt = `Assess the learning priorities for this executive onboarding. Focus on organizational context and domain knowledge, not technical skills the candidate already has.

${NINETY_DAY_PLAN_RULES}

ROLE CONTEXT:
- Role: ${state.role_context.target_role}
- Company: ${state.role_context.target_company}
- Industry: ${state.role_context.target_industry}
- Seniority: ${String(scratchpad.seniority_level ?? 'Director')}

CANDIDATE:
- Current Skills: ${state.resume_data?.key_skills?.join(', ') || 'Not available'}
- Career Summary: ${state.resume_data?.career_summary ?? 'Not available'}

ROLE ANALYSIS:
- Candidate Gaps: ${JSON.stringify((roleAnalysis as Record<string, unknown>).candidate_gaps_for_role ?? [])}
- Organizational Dynamics: ${JSON.stringify((roleAnalysis as Record<string, unknown>).organizational_dynamics ?? [])}

Return JSON array of learning priorities:
[
  {
    "area": "Specific knowledge area to learn",
    "importance": "critical" | "high" | "medium",
    "resources": ["source 1", "source 2"],
    "timeline": "Week 1-2" or "Days 1-30" etc.
  }
]

Rules:
- 5-8 learning priorities, ordered by importance
- Focus on: organizational culture, industry context, team dynamics, business model, competitive landscape
- Resources should be specific: "1:1 with CFO," "Q3 board deck review," "competitor analysis report"
- Timeline should match the 3-phase structure (most critical learning in Phase 1)
- Do NOT include skills the candidate already has — focus on new-context knowledge`;

    const response = await llm.chat({
      model: MODEL_LIGHT,
      max_tokens: 2048,
      system:
        'You are an executive onboarding strategist who assesses learning curves and knowledge gaps. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: learningPrompt }],
    });

    let learningPriorities: LearningPriority[];
    try {
      const parsed = JSON.parse(repairJSON(response.text) ?? response.text);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      learningPriorities = items.map((item: Record<string, unknown>) => ({
        area: String(item.area ?? ''),
        importance: parseImportanceLevel(item.importance),
        resources: Array.isArray(item.resources) ? item.resources.map(String) : [] as string[],
        timeline: String(item.timeline ?? ''),
      }));
    } catch {
      learningPriorities = [];
    }

    state.learning_priorities = learningPriorities;
    scratchpad.learning_priorities = learningPriorities;

    // Emit research_complete event
    ctx.emit({
      type: 'research_complete',
      stakeholder_count: state.stakeholder_map.length,
      quick_win_count: state.quick_wins.length,
      learning_priority_count: learningPriorities.length,
    });

    ctx.emit({
      type: 'transparency',
      stage: 'assess_learning_priorities',
      message: `Learning assessment complete — ${learningPriorities.length} priorities identified`,
    });

    return JSON.stringify({
      success: true,
      learning_priority_count: learningPriorities.length,
      by_importance: {
        critical: learningPriorities.filter((lp) => lp.importance === 'critical').length,
        high: learningPriorities.filter((lp) => lp.importance === 'high').length,
        medium: learningPriorities.filter((lp) => lp.importance === 'medium').length,
      },
    });
  },
};

// ─── Helpers ────────────────────────────────────────────────────────

function parseRelationshipType(val: unknown): StakeholderRelationship {
  const s = String(val ?? '').toLowerCase();
  const valid: StakeholderRelationship[] = [
    'direct_report',
    'peer',
    'superior',
    'cross_functional',
    'external',
  ];
  return valid.includes(s as StakeholderRelationship) ? (s as StakeholderRelationship) : 'peer';
}

function parsePriority(val: unknown): StakeholderPriority {
  const s = String(val ?? '').toLowerCase();
  const valid: StakeholderPriority[] = ['critical', 'high', 'medium', 'low'];
  return valid.includes(s as StakeholderPriority) ? (s as StakeholderPriority) : 'medium';
}

function parseImpactLevel(val: unknown): ImpactLevel {
  const s = String(val ?? '').toLowerCase();
  const valid: ImpactLevel[] = ['high', 'medium', 'low'];
  return valid.includes(s as ImpactLevel) ? (s as ImpactLevel) : 'medium';
}

function parseEffortLevel(val: unknown): EffortLevel {
  const s = String(val ?? '').toLowerCase();
  const valid: EffortLevel[] = ['low', 'medium', 'high'];
  return valid.includes(s as EffortLevel) ? (s as EffortLevel) : 'medium';
}

function parseImportanceLevel(val: unknown): ImportanceLevel {
  const s = String(val ?? '').toLowerCase();
  const valid: ImportanceLevel[] = ['critical', 'high', 'medium'];
  return valid.includes(s as ImportanceLevel) ? (s as ImportanceLevel) : 'medium';
}

function countRelationshipTypes(stakeholders: Stakeholder[]): number {
  const types = new Set(stakeholders.map((s) => s.relationship_type));
  return types.size;
}

// ─── Exports ────────────────────────────────────────────────────────

export const researcherTools: AgentTool<NinetyDayPlanState, NinetyDayPlanSSEEvent>[] = [
  analyzeRoleContextTool,
  mapStakeholdersTool,
  identifyQuickWinsTool,
  assessLearningPrioritiesTool,
];
