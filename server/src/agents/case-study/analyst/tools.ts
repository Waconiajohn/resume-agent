/**
 * Case Study Achievement Analyst — Tool definitions.
 *
 * 4 tools:
 * - parse_achievements: Parse resume to extract all achievements with company context
 * - score_impact: Score each achievement by business impact and select top 3-5
 * - extract_narrative_elements: Extract full STAR/CAR narrative elements for selected achievements
 * - identify_metrics: Identify and validate specific, quantifiable metrics
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type {
  CaseStudyState,
  CaseStudySSEEvent,
  Achievement,
  ImpactCategory,
} from '../types.js';
import { CASE_STUDY_RULES } from '../knowledge/rules.js';
import { llm, MODEL_MID, MODEL_LIGHT } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import { renderEvidenceInventorySection } from '../../../contracts/shared-context-prompt.js';

type CaseStudyTool = AgentTool<CaseStudyState, CaseStudySSEEvent>;

// ─── Tool: parse_achievements ─────────────────────────────────────

const parseAchievementsTool: CaseStudyTool = {
  name: 'parse_achievements',
  description:
    'Parse the resume to extract all significant achievements with their company context, role, and initial descriptions.',
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
        stage: 'parse_achievements',
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

    // ─── Extract achievements ─────────────────────────────────────
    ctx.emit({
      type: 'transparency',
      stage: 'parse_achievements',
      message: `Extracting achievements for ${state.resume_data?.name ?? 'candidate'}...`,
    });

    const extractPrompt = `Extract ALL significant achievements from this resume. Each achievement should be a distinct accomplishment with measurable or demonstrable impact.

${CASE_STUDY_RULES}

CANDIDATE PROFILE:
- Name: ${state.resume_data?.name ?? 'Unknown'}
- Current Title: ${state.resume_data?.current_title ?? 'Unknown'}
- Career Summary: ${state.resume_data?.career_summary ?? 'Not available'}

WORK HISTORY:
${state.resume_data?.work_history?.map((w) => `${w.title} at ${w.company} (${w.duration})\n  Highlights: ${w.highlights?.join(' | ') || 'None listed'}`).join('\n') || 'Not available'}

KEY ACHIEVEMENTS:
${state.resume_data?.key_achievements?.join('\n') || 'None listed'}

RESUME TEXT:
${resumeText}

Return JSON array of achievements:
[
  {
    "id": "ach_1",
    "title": "Brief headline of the achievement",
    "company": "Company where it happened",
    "role": "Role held at the time",
    "description": "2-3 sentence description of what was accomplished and its significance"
  }
]

Rules:
- Extract EVERY achievement, even small ones — scoring and selection happen later
- Each achievement must be a specific, concrete accomplishment — not a job responsibility
- The title should be compelling and action-oriented
- Include the company and role context for each achievement
- Look for achievements in bullet points, summaries, and between the lines of role descriptions
- Typical executives have 8-20 extractable achievements across their career`;

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 8192,
      system:
        'You are an executive achievement analyst who extracts concrete accomplishments from resumes. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: extractPrompt }],
    });

    interface RawAchievement {
      id?: string;
      title?: string;
      company?: string;
      role?: string;
      description?: string;
    }

    let achievements: Array<{ id: string; title: string; company: string; role: string; description: string }>;
    try {
      const parsed = JSON.parse(repairJSON(response.text) ?? response.text);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      achievements = items.map((item: RawAchievement, idx: number) => ({
        id: item.id ?? `ach_${idx + 1}`,
        title: item.title ?? '',
        company: item.company ?? '',
        role: item.role ?? '',
        description: item.description ?? '',
      }));
    } catch {
      achievements = [];
    }

    scratchpad.achievements = achievements;

    ctx.emit({
      type: 'transparency',
      stage: 'parse_achievements',
      message: `Extracted ${achievements.length} achievements from resume`,
    });

    return JSON.stringify({
      success: true,
      achievement_count: achievements.length,
      companies: [...new Set(achievements.map((a) => a.company))],
    });
  },
};

// ─── Tool: score_impact ───────────────────────────────────────────

const scoreImpactTool: CaseStudyTool = {
  name: 'score_impact',
  description:
    'Score each achievement by business impact and select the top 3-5 for case study development. Categorize by impact type.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;

    const achievements = scratchpad.achievements as Array<{
      id: string;
      title: string;
      company: string;
      role: string;
      description: string;
    }> | undefined;

    if (!achievements || achievements.length === 0) {
      return JSON.stringify({
        success: false,
        error: 'No achievements available. Call parse_achievements first.',
      });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'score_impact',
      message: `Scoring ${achievements.length} achievements by business impact...`,
    });

    const scorePrompt = `Score each achievement by business impact and categorize it. Select the top 3-5 achievements for case study development.

${CASE_STUDY_RULES}

ACHIEVEMENTS TO SCORE:
${achievements.map((a, i) => `${i + 1}. [${a.id}] "${a.title}" at ${a.company} (${a.role})\n   ${a.description}`).join('\n\n')}

${state.target_context ? `TARGET CONTEXT:\n- Role: ${state.target_context.target_role}\n- Industry: ${state.target_context.target_industry}\n- Seniority: ${state.target_context.target_seniority}` : ''}

Return JSON:
{
  "scored": [
    {
      "id": "ach_1",
      "impact_score": 85,
      "impact_category": "revenue" | "cost_savings" | "efficiency" | "growth" | "transformation" | "risk_mitigation",
      "scoring_rationale": "Why this score — what makes this achievement impactful or not"
    }
  ],
  "selected_ids": ["ach_1", "ach_3", "ach_7"]
}

Rules:
- Score 0-100 based on: scale of impact, measurability, strategic significance, transferability
- Select 3-5 achievements with the highest impact scores
- Prefer diversity of impact categories when scores are close
- If targeting a specific role/industry, weight relevance to that context
- Scoring must be honest — not every achievement is a 90+
- Categories: revenue (direct revenue impact), cost_savings (reduced costs), efficiency (improved processes/speed), growth (scaled teams/markets), transformation (organizational change), risk_mitigation (prevented losses/compliance)`;

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 4096,
      system:
        'You are a business impact analyst who evaluates executive achievements. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: scorePrompt }],
    });

    interface ScoredItem {
      id?: string;
      impact_score?: number;
      impact_category?: string;
      scoring_rationale?: string;
    }

    let selectedAchievements: Achievement[];
    try {
      const parsed = JSON.parse(repairJSON(response.text) ?? response.text);
      const scoredItems: ScoredItem[] = Array.isArray(parsed.scored) ? parsed.scored : [];
      const selectedIds: string[] = Array.isArray(parsed.selected_ids) ? parsed.selected_ids : [];

      // Build a map of scores by achievement id
      const scoreMap = new Map<string, ScoredItem>();
      for (const item of scoredItems) {
        if (item.id) scoreMap.set(item.id, item);
      }

      // Build full Achievement objects for selected items
      selectedAchievements = selectedIds
        .map((id: string) => {
          const original = achievements.find((a) => a.id === id);
          const scored = scoreMap.get(id);
          if (!original) return null;
          return {
            id: original.id,
            title: original.title,
            company: original.company,
            role: original.role,
            impact_score: Number(scored?.impact_score) || 0,
            impact_category: parseImpactCategory(scored?.impact_category),
            situation: '',
            approach: '',
            results: '',
            metrics: [] as Achievement['metrics'],
            transferable_lessons: [] as string[],
            tags: [] as string[],
          };
        })
        .filter((a): a is Achievement => a !== null);
    } catch {
      // Fallback: take first 3 achievements with default scores
      selectedAchievements = achievements.slice(0, 3).map((a) => ({
        id: a.id,
        title: a.title,
        company: a.company,
        role: a.role,
        impact_score: 50,
        impact_category: 'transformation' as ImpactCategory,
        situation: '',
        approach: '',
        results: '',
        metrics: [],
        transferable_lessons: [],
        tags: [],
      }));
    }

    state.selected_achievements = selectedAchievements;
    scratchpad.selected_achievements = selectedAchievements;

    // Emit SSE event for each selected achievement
    for (const achievement of selectedAchievements) {
      ctx.emit({
        type: 'achievement_selected',
        title: achievement.title,
        company: achievement.company,
        impact_score: achievement.impact_score,
        impact_category: achievement.impact_category,
      });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'score_impact',
      message: `Selected ${selectedAchievements.length} top achievements for case study development`,
    });

    return JSON.stringify({
      success: true,
      total_scored: achievements.length,
      selected_count: selectedAchievements.length,
      selected: selectedAchievements.map((a) => ({
        id: a.id,
        title: a.title,
        impact_score: a.impact_score,
        impact_category: a.impact_category,
      })),
    });
  },
};

// ─── Tool: extract_narrative_elements ─────────────────────────────

const extractNarrativeElementsTool: CaseStudyTool = {
  name: 'extract_narrative_elements',
  description:
    'Extract full narrative elements (situation, approach, results, lessons) for each selected achievement using the STAR/CAR framework.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;

    const selected = scratchpad.selected_achievements as Achievement[] | undefined;

    if (!selected || selected.length === 0) {
      return JSON.stringify({
        success: false,
        error: 'No selected achievements available. Call score_impact first.',
      });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'extract_narrative_elements',
      message: `Extracting STAR/CAR narrative elements for ${selected.length} achievements...`,
    });

    const resumeData = scratchpad.resume_data as CaseStudyState['resume_data'];
    const achievements = scratchpad.achievements as Array<{
      id: string;
      title: string;
      company: string;
      role: string;
      description: string;
    }>;

    const narrativePrompt = `Extract rich narrative elements for each selected achievement using the STAR/CAR framework.

${CASE_STUDY_RULES}

CANDIDATE CONTEXT:
- Name: ${resumeData?.name ?? 'Unknown'}
- Current Title: ${resumeData?.current_title ?? 'Unknown'}
- Career Summary: ${resumeData?.career_summary ?? 'Not available'}

ALL ACHIEVEMENTS (for cross-reference context):
${achievements?.map((a) => `- [${a.id}] "${a.title}" at ${a.company}: ${a.description}`).join('\n') || 'None'}

SELECTED ACHIEVEMENTS TO EXPAND:
${selected.map((a) => `- [${a.id}] "${a.title}" at ${a.company} (${a.role}) — Impact: ${a.impact_category}, Score: ${a.impact_score}`).join('\n')}

${renderEvidenceInventorySection({
  heading: 'EVIDENCE FROM RESUME PIPELINE',
  sharedInventory: state.shared_context?.evidenceInventory,
  legacyEvidence: state.platform_context?.evidence_items,
  maxItems: 15,
}).join('\n')}

For each selected achievement, return:
[
  {
    "id": "ach_1",
    "situation": "3-5 sentences: Context, stakes, constraints, and why this mattered. What was the business problem or opportunity? What was at risk?",
    "situation_is_inferred": false,
    "approach": "3-5 sentences: What the executive specifically did. Decisions made, strategies employed, teams led, resources mobilized. Focus on leadership and strategic thinking.",
    "approach_is_inferred": false,
    "results": "3-5 sentences: Quantified outcomes and business impact. Revenue generated, costs saved, efficiency gained, risks mitigated. Connect results to the situation.",
    "results_is_inferred": false,
    "transferable_lessons": ["Lesson 1 that applies beyond this specific company", "Lesson 2"],
    "tags": ["leadership", "strategy", "relevant_tag"]
  }
]

Rules:
- Situation must set stakes — make the reader understand why this mattered
- Approach must highlight strategic thinking, not just tasks performed
- Results must be specific and quantified wherever possible — even estimates are better than vague claims
- Transferable lessons should demonstrate patterns of excellence, not company-specific knowledge
- Tags should enable categorization and filtering (leadership, strategy, innovation, operations, etc.)
- For each field (situation, approach, results), set the corresponding is_inferred flag to true if you filled in details not explicitly stated in the user's achievement data. Set is_inferred to false only when the content directly comes from the user's input.`;

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 8192,
      system:
        'You are an executive narrative analyst who constructs compelling achievement stories using the STAR/CAR framework. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: narrativePrompt }],
    });

    interface NarrativeItem {
      id?: string;
      situation?: string;
      situation_is_inferred?: boolean;
      approach?: string;
      approach_is_inferred?: boolean;
      results?: string;
      results_is_inferred?: boolean;
      transferable_lessons?: string[];
      tags?: string[];
    }

    const inferredFields: Array<{ achievement: string; field: string }> = [];

    try {
      const parsed = JSON.parse(repairJSON(response.text) ?? response.text);
      const items: NarrativeItem[] = Array.isArray(parsed) ? parsed : [parsed];

      // Update selected achievements with narrative data
      for (const item of items) {
        const achievement = selected.find((a) => a.id === (item.id ?? ''));
        if (achievement) {
          achievement.situation = (item.situation ?? '');
          achievement.situation_is_inferred = item.situation_is_inferred === true;
          achievement.approach = (item.approach ?? '');
          achievement.approach_is_inferred = item.approach_is_inferred === true;
          achievement.results = (item.results ?? '');
          achievement.results_is_inferred = item.results_is_inferred === true;
          achievement.transferable_lessons = Array.isArray(item.transferable_lessons)
            ? item.transferable_lessons.map(String)
            : [];
          achievement.tags = Array.isArray(item.tags) ? item.tags.map(String) : [];

          // Track inferred fields for transparency reporting
          if (item.situation_is_inferred === true) {
            inferredFields.push({ achievement: achievement.title, field: 'situation' });
          }
          if (item.approach_is_inferred === true) {
            inferredFields.push({ achievement: achievement.title, field: 'approach' });
          }
          if (item.results_is_inferred === true) {
            inferredFields.push({ achievement: achievement.title, field: 'results' });
          }
        }
      }
    } catch {
      // Leave narrative fields empty — identify_metrics can still run
    }

    // Emit transparency event for any inferred narrative elements
    if (inferredFields.length > 0) {
      const summary = inferredFields
        .map((f) => `"${f.field}" for "${f.achievement}"`)
        .join(', ');
      ctx.emit({
        type: 'transparency',
        stage: 'extract_narrative_elements',
        message: `AI-inferred details (not explicitly stated in your input): ${summary}. These are marked for your verification.`,
      });
    }

    state.selected_achievements = selected;
    scratchpad.selected_achievements = selected;

    const withNarrative = selected.filter((a) => a.situation.length > 0).length;

    ctx.emit({
      type: 'transparency',
      stage: 'extract_narrative_elements',
      message: `Narrative extraction complete — ${withNarrative}/${selected.length} achievements enriched with STAR/CAR elements`,
    });

    return JSON.stringify({
      success: true,
      enriched_count: withNarrative,
      total_selected: selected.length,
      achievements: selected.map((a) => ({
        id: a.id,
        title: a.title,
        has_situation: a.situation.length > 0,
        has_approach: a.approach.length > 0,
        has_results: a.results.length > 0,
        lesson_count: a.transferable_lessons.length,
      })),
    });
  },
};

// ─── Tool: identify_metrics ───────────────────────────────────────

const identifyMetricsTool: CaseStudyTool = {
  name: 'identify_metrics',
  description:
    'Identify and validate specific, quantifiable metrics for each selected achievement. Ensure every result has at least one concrete metric.',
  model_tier: 'light',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;

    const selected = scratchpad.selected_achievements as Achievement[] | undefined;

    if (!selected || selected.length === 0) {
      return JSON.stringify({
        success: false,
        error: 'No selected achievements available. Call score_impact first.',
      });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'identify_metrics',
      message: `Identifying and validating metrics for ${selected.length} achievements...`,
    });

    const metricsPrompt = `Extract and validate specific, quantifiable metrics for each selected achievement.

${CASE_STUDY_RULES}

SELECTED ACHIEVEMENTS:
${selected.map((a) => `[${a.id}] "${a.title}" at ${a.company} (${a.role})
  Category: ${a.impact_category}
  Situation: ${a.situation || 'Not yet extracted'}
  Approach: ${a.approach || 'Not yet extracted'}
  Results: ${a.results || 'Not yet extracted'}`).join('\n\n')}

For each achievement, return:
[
  {
    "id": "ach_1",
    "metrics": [
      {
        "label": "Revenue Growth",
        "value": "$2.4M ARR increase",
        "context": "Year-over-year growth from $8M to $10.4M in the enterprise segment"
      }
    ]
  }
]

Rules:
- Every achievement MUST have at least one concrete metric
- Metrics must be specific: "$2.4M" not "significant revenue increase"
- Include context that makes the metric meaningful (timeframe, baseline, scope)
- Acceptable metric types: revenue ($), cost savings ($), percentage improvements (%), time reductions, team/headcount scale, customer/user counts, process improvements
- If exact numbers are not available for a metric, set the value to 'USER_INPUT_NEEDED' and include a 'context' field explaining what metric is needed. Do NOT estimate or fabricate numbers.
- Label should be a short category name, value should be the specific metric, context should explain why it matters
- Aim for 2-4 metrics per achievement — quality over quantity`;

    const response = await llm.chat({
      model: MODEL_LIGHT,
      max_tokens: 4096,
      system:
        'You are a business metrics analyst who identifies and validates quantifiable impact metrics. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: metricsPrompt }],
    });

    interface MetricItem {
      id?: string;
      metrics?: Array<{ label?: string; value?: string; context?: string }>;
    }

    try {
      const parsed = JSON.parse(repairJSON(response.text) ?? response.text);
      const items: MetricItem[] = Array.isArray(parsed) ? parsed : [parsed];

      for (const item of items) {
        const achievement = selected.find((a) => a.id === (item.id ?? ''));
        if (achievement && Array.isArray(item.metrics)) {
          achievement.metrics = item.metrics.map((m) => ({
            label: (m.label ?? ''),
            value: (m.value ?? ''),
            context: (m.context ?? ''),
          }));
        }
      }
    } catch {
      // Leave metrics arrays empty if parsing fails
    }

    state.selected_achievements = selected;
    state.achievements = scratchpad.achievements as Achievement[] | undefined;
    scratchpad.selected_achievements = selected;

    const totalMetrics = selected.reduce((sum, a) => sum + a.metrics.length, 0);
    const withMetrics = selected.filter((a) => a.metrics.length > 0).length;

    // Flag any metrics that require user input instead of AI estimates
    const missingMetrics = selected.flatMap((a) =>
      a.metrics
        .filter((m) => m.value === 'USER_INPUT_NEEDED')
        .map((m) => ({ achievement: a.title, label: m.label, context: m.context })),
    );

    if (missingMetrics.length > 0) {
      ctx.emit({
        type: 'transparency',
        stage: 'identify_metrics',
        message: `${missingMetrics.length} metric(s) need your input: ${missingMetrics.map((m) => `"${m.label}" for "${m.achievement}"`).join(', ')}. These cannot be estimated — please provide the actual figures.`,
      });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'identify_metrics',
      message: `Metric identification complete — ${totalMetrics} metrics across ${withMetrics}/${selected.length} achievements`,
    });

    return JSON.stringify({
      success: true,
      total_metrics: totalMetrics,
      achievements_with_metrics: withMetrics,
      total_selected: selected.length,
      breakdown: selected.map((a) => ({
        id: a.id,
        title: a.title,
        metric_count: a.metrics.length,
      })),
    });
  },
};

// ─── Helpers ────────────────────────────────────────────────────────

function parseImpactCategory(val: unknown): ImpactCategory {
  const s = String(val ?? '').toLowerCase();
  const valid: ImpactCategory[] = [
    'revenue',
    'cost_savings',
    'efficiency',
    'growth',
    'transformation',
    'risk_mitigation',
  ];
  return valid.includes(s as ImpactCategory) ? (s as ImpactCategory) : 'transformation';
}

// ─── Exports ────────────────────────────────────────────────────────

export const analystTools: AgentTool<CaseStudyState, CaseStudySSEEvent>[] = [
  parseAchievementsTool,
  scoreImpactTool,
  extractNarrativeElementsTool,
  identifyMetricsTool,
];
