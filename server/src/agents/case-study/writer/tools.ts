/**
 * Case Study Writer — Tool definitions.
 *
 * 4 tools:
 * - write_case_study: Write a full STAR/CAR case study for an achievement
 * - add_metrics_visualization: Enhance metrics with before/after and context
 * - quality_review: Score against the self-review checklist
 * - assemble_portfolio: Assemble all case studies into a portfolio document
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type {
  CaseStudyState,
  CaseStudySSEEvent,
  CaseStudy,
  Achievement,
} from '../types.js';
import { CASE_STUDY_RULES } from '../knowledge/rules.js';
import { llm, MODEL_PRIMARY, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';

type WriterTool = AgentTool<CaseStudyState, CaseStudySSEEvent>;

// ─── Helpers ───────────────────────────────────────────────────────

function buildStateContext(state: CaseStudyState): string {
  const parts: string[] = [];

  // Target context
  if (state.target_context) {
    parts.push('## Target Context');
    parts.push(`Target Role: ${state.target_context.target_role}`);
    parts.push(`Industry: ${state.target_context.target_industry}`);
    parts.push(`Seniority: ${state.target_context.target_seniority}`);
  }

  // Resume data
  if (state.resume_data) {
    const rd = state.resume_data;
    parts.push('\n## Candidate');
    parts.push(`Name: ${rd.name}`);
    parts.push(`Current Title: ${rd.current_title}`);
    parts.push(`Summary: ${rd.career_summary}`);
    if (rd.key_skills?.length > 0) parts.push(`Key Skills: ${rd.key_skills.join(', ')}`);
  }

  // Platform context
  if (state.platform_context?.positioning_strategy) {
    parts.push('\n## Positioning Strategy');
    parts.push(JSON.stringify(state.platform_context.positioning_strategy, null, 2));
  }

  return parts.join('\n');
}

function findAchievement(state: CaseStudyState, achievementId: string): Achievement | undefined {
  return (
    state.selected_achievements?.find((a) => a.id === achievementId) ??
    state.achievements?.find((a) => a.id === achievementId)
  );
}

function findCaseStudy(scratchpad: Record<string, unknown>, achievementId: string): CaseStudy | undefined {
  const studies = scratchpad.case_studies as CaseStudy[] | undefined;
  return studies?.find((cs) => cs.achievement_id === achievementId);
}

function updateCaseStudy(scratchpad: Record<string, unknown>, state: CaseStudyState, updated: CaseStudy): void {
  const scratchpadStudies = scratchpad.case_studies as CaseStudy[];
  const scratchpadIdx = scratchpadStudies.findIndex((cs) => cs.achievement_id === updated.achievement_id);
  if (scratchpadIdx >= 0) scratchpadStudies[scratchpadIdx] = updated;

  const stateIdx = state.case_studies.findIndex((cs) => cs.achievement_id === updated.achievement_id);
  if (stateIdx >= 0) state.case_studies[stateIdx] = updated;
}

// ─── Tool: write_case_study ───────────────────────────────────────

const writeCaseStudyTool: WriterTool = {
  name: 'write_case_study',
  description:
    'Write a complete consulting-grade case study for the specified achievement. Includes executive summary, ' +
    'situation, approach, results with metrics, and transferable lessons. Target 500-800 words.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {
      achievement_id: {
        type: 'string',
        description: 'The ID of the achievement to write a case study for',
      },
    },
    required: ['achievement_id'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;
    const achievementId = String(input.achievement_id ?? '');
    const stateContext = buildStateContext(state);

    const achievement = findAchievement(state, achievementId);
    if (!achievement) {
      return JSON.stringify({
        success: false,
        error: `Achievement not found: ${achievementId}`,
      });
    }

    const achievementContext = `
## Achievement to Write About
Title: ${achievement.title}
Company: ${achievement.company}
Role: ${achievement.role}
Impact Score: ${achievement.impact_score}/100
Impact Category: ${achievement.impact_category}
Situation: ${achievement.situation}
Approach: ${achievement.approach}
Results: ${achievement.results}
Metrics: ${achievement.metrics.map((m) => `${m.label}: ${m.value} (${m.context})`).join('\n  ')}
Transferable Lessons: ${achievement.transferable_lessons.join('; ')}
Tags: ${achievement.tags.join(', ')}`;

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 4096,
      system: `You are an elite executive case study writer. You produce consulting-grade case studies that prove capability through evidence, not claims. Every case study follows the STAR/CAR framework (Situation, Task/Challenge, Action/Approach, Results) and reads like a McKinsey engagement summary.

${CASE_STUDY_RULES}

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Write a complete case study (500-800 words) for this achievement.

${stateContext}
${achievementContext}

REQUIREMENTS:
- Title: compelling headline that signals business impact
- Executive Summary: 2-3 sentences capturing the what, how, and outcome
- Situation: context, stakes, and constraints — make the reader feel the pressure
- Approach: specific decisions, strategy, and actions taken — show strategic thinking
- Results: quantified outcomes with metrics, context, and business impact
- Lessons: transferable insights that demonstrate pattern recognition
- Target 500-800 words for the body (excluding title and summary)
- Consulting-grade tone: authoritative, evidence-driven, outcome-focused
- Never fabricate metrics or outcomes not present in the source achievement

Return JSON:
{
  "title": "compelling case study headline",
  "executive_summary": "2-3 sentence summary",
  "situation": "context and stakes (100-150 words)",
  "approach": "strategy and actions (150-250 words)",
  "results": "outcomes and impact (150-200 words)",
  "metrics": [{ "label": "metric name", "value": "metric value", "context": "why this matters" }],
  "lessons": "transferable insights (50-100 words)"
}`,
      }],
    });

    let result;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      result = {
        title: achievement.title,
        executive_summary: response.text.trim().slice(0, 500),
        situation: achievement.situation,
        approach: achievement.approach,
        results: achievement.results,
        metrics: achievement.metrics,
        lessons: achievement.transferable_lessons.join('. '),
      };
    }

    const bodyText = [
      String(result.situation ?? ''),
      String(result.approach ?? ''),
      String(result.results ?? ''),
      String(result.lessons ?? ''),
    ].join(' ');
    const wordCount = bodyText.split(/\s+/).filter(Boolean).length;

    const caseStudy: CaseStudy = {
      achievement_id: achievementId,
      title: String(result.title ?? achievement.title),
      executive_summary: String(result.executive_summary ?? ''),
      situation: String(result.situation ?? ''),
      approach: String(result.approach ?? ''),
      results: String(result.results ?? ''),
      metrics: Array.isArray(result.metrics)
        ? result.metrics.map((m: Record<string, unknown>) => ({
            label: String(m.label ?? ''),
            value: String(m.value ?? ''),
            context: String(m.context ?? ''),
          }))
        : achievement.metrics,
      lessons: String(result.lessons ?? ''),
      word_count: wordCount,
      quality_score: 0,
      narrative_clarity: 0,
      metric_specificity: 0,
      strategic_framing: 0,
    };

    // Append to case_studies array on scratchpad
    if (!Array.isArray(scratchpad.case_studies)) {
      scratchpad.case_studies = [];
    }
    (scratchpad.case_studies as CaseStudy[]).push(caseStudy);

    // Update state
    if (!state.case_studies) {
      state.case_studies = [];
    }
    state.case_studies.push(caseStudy);

    ctx.emit({
      type: 'case_study_drafted',
      title: caseStudy.title,
      word_count: wordCount,
    });

    return JSON.stringify({
      success: true,
      achievement_id: achievementId,
      title: caseStudy.title,
      word_count: wordCount,
      metric_count: caseStudy.metrics.length,
    });
  },
};

// ─── Tool: add_metrics_visualization ──────────────────────────────

const addMetricsVisualizationTool: WriterTool = {
  name: 'add_metrics_visualization',
  description:
    'Enhance a case study\'s metrics with before/after comparisons, industry benchmarks, ' +
    'and contextual framing to maximize impact.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      achievement_id: {
        type: 'string',
        description: 'The ID of the achievement whose case study metrics to enhance',
      },
    },
    required: ['achievement_id'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;
    const achievementId = String(input.achievement_id ?? '');

    const caseStudy = findCaseStudy(scratchpad, achievementId);
    if (!caseStudy) {
      return JSON.stringify({
        success: false,
        error: `Case study not found for achievement: ${achievementId}`,
      });
    }

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 2048,
      system: `You are an executive case study editor specializing in metrics presentation. You enhance raw metrics with before/after comparisons, industry context, and compelling framing that maximizes impact for executive audiences.

${CASE_STUDY_RULES}

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Enhance the metrics section of this case study with before/after comparisons, industry benchmarks, and contextual framing.

## Case Study: ${caseStudy.title}
Results: ${caseStudy.results}
Current Metrics:
${caseStudy.metrics.map((m) => `- ${m.label}: ${m.value} (${m.context})`).join('\n')}

REQUIREMENTS:
- For each metric, add before/after comparison where possible
- Add industry benchmark context (e.g., "vs. industry average of X%")
- Frame each metric to highlight magnitude of impact
- Add 1-2 additional derived metrics if they strengthen the narrative (e.g., ROI, payback period)
- Do NOT fabricate numbers — enhance framing of existing data
- Keep the same metric labels but enrich the value and context fields

Return JSON:
{
  "metrics": [{ "label": "metric name", "value": "enhanced metric value with before/after", "context": "enriched context with benchmarks" }],
  "enhanced_results": "updated results section with richer metric presentation (150-200 words)"
}`,
      }],
    });

    let result;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      return JSON.stringify({
        success: false,
        error: 'Failed to parse enhanced metrics response',
      });
    }

    const updatedStudy: CaseStudy = {
      ...caseStudy,
      metrics: Array.isArray(result.metrics)
        ? result.metrics.map((m: Record<string, unknown>) => ({
            label: String(m.label ?? ''),
            value: String(m.value ?? ''),
            context: String(m.context ?? ''),
          }))
        : caseStudy.metrics,
      results: result.enhanced_results ? String(result.enhanced_results) : caseStudy.results,
    };

    updateCaseStudy(scratchpad, state, updatedStudy);

    return JSON.stringify({
      success: true,
      achievement_id: achievementId,
      metric_count: updatedStudy.metrics.length,
      results_updated: !!result.enhanced_results,
    });
  },
};

// ─── Tool: quality_review ─────────────────────────────────────────

const qualityReviewTool: WriterTool = {
  name: 'quality_review',
  description:
    'Quality review a case study against the STAR/CAR checklist, scoring narrative clarity, ' +
    'metric specificity, strategic framing, and consulting-grade presentation.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      achievement_id: {
        type: 'string',
        description: 'The ID of the achievement whose case study to review',
      },
    },
    required: ['achievement_id'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;
    const achievementId = String(input.achievement_id ?? '');

    const caseStudy = findCaseStudy(scratchpad, achievementId);
    if (!caseStudy) {
      return JSON.stringify({
        success: false,
        error: `Case study not found for achievement: ${achievementId}`,
      });
    }

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 2048,
      system: `You are a senior case study reviewer. You evaluate consulting-grade case studies against a strict quality checklist covering narrative clarity, metric specificity, strategic framing, and overall presentation quality.

${CASE_STUDY_RULES}

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Review this case study against the STAR/CAR quality checklist.

## Case Study: ${caseStudy.title}
Executive Summary: ${caseStudy.executive_summary}
Situation: ${caseStudy.situation}
Approach: ${caseStudy.approach}
Results: ${caseStudy.results}
Metrics: ${caseStudy.metrics.map((m) => `- ${m.label}: ${m.value} (${m.context})`).join('\n')}
Lessons: ${caseStudy.lessons}
Word Count: ${caseStudy.word_count}

SCORING CRITERIA (0-100 each):
1. **Narrative Clarity**: Is the story arc clear? Does situation→approach→results flow logically? Is the executive summary compelling?
2. **Metric Specificity**: Are metrics concrete, contextual, and credible? Do they include before/after or benchmarks?
3. **Strategic Framing**: Does the approach section showcase strategic thinking, not just task completion? Are decisions and trade-offs visible?
4. **Overall Quality Score**: Weighted average considering consulting-grade presentation, word count target (500-800), and evidence integrity.

Return JSON:
{
  "narrative_clarity": 85,
  "metric_specificity": 78,
  "strategic_framing": 82,
  "quality_score": 82,
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"]
}`,
      }],
    });

    let result;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      result = {
        narrative_clarity: 70,
        metric_specificity: 70,
        strategic_framing: 70,
        quality_score: 70,
        strengths: [],
        improvements: ['Unable to parse review — defaulting scores'],
      };
    }

    const scores = {
      narrative_clarity: Math.max(0, Math.min(100, Number(result.narrative_clarity) || 70)),
      metric_specificity: Math.max(0, Math.min(100, Number(result.metric_specificity) || 70)),
      strategic_framing: Math.max(0, Math.min(100, Number(result.strategic_framing) || 70)),
      quality_score: Math.max(0, Math.min(100, Number(result.quality_score) || 70)),
    };

    const updatedStudy: CaseStudy = {
      ...caseStudy,
      narrative_clarity: scores.narrative_clarity,
      metric_specificity: scores.metric_specificity,
      strategic_framing: scores.strategic_framing,
      quality_score: scores.quality_score,
    };

    updateCaseStudy(scratchpad, state, updatedStudy);

    ctx.emit({
      type: 'case_study_complete',
      title: caseStudy.title,
      quality_score: scores.quality_score,
    });

    return JSON.stringify({
      success: true,
      achievement_id: achievementId,
      title: caseStudy.title,
      ...scores,
      strengths: Array.isArray(result.strengths) ? result.strengths.map(String) : [],
      improvements: Array.isArray(result.improvements) ? result.improvements.map(String) : [],
    });
  },
};

// ─── Tool: assemble_portfolio ─────────────────────────────────────

const assemblePortfolioTool: WriterTool = {
  name: 'assemble_portfolio',
  description:
    'Assemble all case studies into a cohesive portfolio document with overview, ' +
    'individual studies, and cross-cutting themes analysis.',
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
      stage: 'assemble_portfolio',
      message: 'Assembling case study portfolio...',
    });

    const caseStudies = scratchpad.case_studies as CaseStudy[] | undefined;
    if (!caseStudies || caseStudies.length === 0) {
      return JSON.stringify({
        success: false,
        error: 'No case studies to assemble — write case studies first',
      });
    }

    // Generate cross-cutting themes via LLM
    const themesResponse = await llm.chat({
      model: MODEL_MID,
      max_tokens: 2048,
      system: `You are an executive portfolio analyst. You identify cross-cutting themes and patterns across a collection of case studies to create a compelling portfolio narrative.

${CASE_STUDY_RULES}

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Analyze these case studies and identify cross-cutting themes.

${caseStudies.map((cs, i) => `## Case Study ${i + 1}: ${cs.title}
Summary: ${cs.executive_summary}
Results: ${cs.results}
Lessons: ${cs.lessons}`).join('\n\n')}

REQUIREMENTS:
- Identify 3-5 cross-cutting themes that emerge across multiple case studies
- For each theme, explain how it manifests across different case studies
- Write a portfolio overview paragraph (100-150 words) that ties everything together
- Frame themes around the candidate's consistent strategic capabilities

Return JSON:
{
  "portfolio_overview": "100-150 word overview paragraph",
  "themes": [
    {
      "theme": "theme name",
      "description": "how this theme manifests across case studies",
      "case_studies": ["title 1", "title 2"]
    }
  ]
}`,
      }],
    });

    let themesResult;
    try {
      themesResult = JSON.parse(repairJSON(themesResponse.text) ?? themesResponse.text);
    } catch {
      themesResult = {
        portfolio_overview: 'A collection of executive case studies demonstrating consistent leadership impact.',
        themes: [],
      };
    }

    // ── Assemble markdown report ──
    const reportParts: string[] = [];

    // Header
    const candidateName = state.resume_data?.name ?? 'Executive';
    reportParts.push(`# ${candidateName} — Case Study Portfolio`);
    reportParts.push('');

    // Portfolio overview
    reportParts.push('## Portfolio Overview');
    reportParts.push('');
    reportParts.push(String(themesResult.portfolio_overview ?? ''));
    reportParts.push('');

    // Individual case studies
    reportParts.push('---');
    reportParts.push('');
    for (let i = 0; i < caseStudies.length; i++) {
      const cs = caseStudies[i];
      reportParts.push(`## Case Study ${i + 1}: ${cs.title}`);
      reportParts.push('');
      reportParts.push(`*${cs.executive_summary}*`);
      reportParts.push('');
      reportParts.push('### Situation');
      reportParts.push('');
      reportParts.push(cs.situation);
      reportParts.push('');
      reportParts.push('### Approach');
      reportParts.push('');
      reportParts.push(cs.approach);
      reportParts.push('');
      reportParts.push('### Results');
      reportParts.push('');
      reportParts.push(cs.results);
      reportParts.push('');

      if (cs.metrics.length > 0) {
        reportParts.push('| Metric | Value | Context |');
        reportParts.push('|--------|-------|---------|');
        for (const m of cs.metrics) {
          reportParts.push(`| ${m.label} | ${m.value} | ${m.context} |`);
        }
        reportParts.push('');
      }

      reportParts.push('### Transferable Lessons');
      reportParts.push('');
      reportParts.push(cs.lessons);
      reportParts.push('');

      if (cs.quality_score > 0) {
        reportParts.push(`*Quality Score: ${cs.quality_score}/100 | Narrative: ${cs.narrative_clarity} | Metrics: ${cs.metric_specificity} | Strategy: ${cs.strategic_framing}*`);
        reportParts.push('');
      }

      reportParts.push('---');
      reportParts.push('');
    }

    // Cross-cutting themes
    const themes = Array.isArray(themesResult.themes) ? themesResult.themes : [];
    if (themes.length > 0) {
      reportParts.push('## Cross-Cutting Themes');
      reportParts.push('');
      for (const theme of themes) {
        reportParts.push(`### ${String(theme.theme ?? 'Theme')}`);
        reportParts.push('');
        reportParts.push(String(theme.description ?? ''));
        reportParts.push('');
        const linkedStudies = Array.isArray(theme.case_studies) ? theme.case_studies.map(String) : [];
        if (linkedStudies.length > 0) {
          reportParts.push(`*Demonstrated in: ${linkedStudies.join(', ')}*`);
          reportParts.push('');
        }
      }
    }

    const report = reportParts.join('\n');

    // ── Quality scoring ──
    const avgQuality = caseStudies.length > 0
      ? Math.round(caseStudies.reduce((sum, cs) => sum + cs.quality_score, 0) / caseStudies.length)
      : 0;

    let qualityScore = avgQuality;
    if (caseStudies.length < 3) qualityScore -= 10;
    if (themes.length === 0) qualityScore -= 10;
    if (!themesResult.portfolio_overview || String(themesResult.portfolio_overview).length < 50) qualityScore -= 5;
    qualityScore = Math.max(0, Math.min(100, qualityScore));

    scratchpad.final_report = report;
    scratchpad.quality_score = qualityScore;
    state.final_report = report;
    state.quality_score = qualityScore;

    ctx.emit({
      type: 'transparency',
      stage: 'assemble_portfolio',
      message: `Portfolio assembled — ${caseStudies.length} case studies, ${themes.length} themes, quality: ${qualityScore}/100`,
    });

    return JSON.stringify({
      success: true,
      report_length: report.length,
      case_study_count: caseStudies.length,
      theme_count: themes.length,
      quality_score: qualityScore,
    });
  },
};

// ─── Exports ───────────────────────────────────────────────────────

export const writerTools: WriterTool[] = [
  writeCaseStudyTool,
  addMetricsVisualizationTool,
  qualityReviewTool,
  assemblePortfolioTool,
];
