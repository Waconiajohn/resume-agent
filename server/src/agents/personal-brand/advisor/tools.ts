/**
 * Personal Brand Advisor — Tool definitions.
 *
 * 4 tools:
 * - identify_gaps: Find missing brand elements and contradictions
 * - write_recommendations: Write specific, actionable improvement recommendations
 * - prioritize_fixes: Rank recommendations by impact and effort
 * - assemble_audit_report: Combine findings, scores, and recommendations into final report
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type {
  PersonalBrandState,
  PersonalBrandSSEEvent,
  AuditFinding,
  BrandRecommendation,
  BrandSource,
  ConsistencyScores,
} from '../types.js';
import { PERSONAL_BRAND_RULES } from '../knowledge/rules.js';
import { llm, MODEL_PRIMARY, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';

type AdvisorTool = AgentTool<PersonalBrandState, PersonalBrandSSEEvent>;

// ─── Helpers ──────────────────────────────────────────────────────────

function buildStateContext(state: PersonalBrandState): string {
  const parts: string[] = [];

  // Target context
  if (state.target_context) {
    parts.push('## Target Context');
    parts.push(`Target Role: ${state.target_context.target_role}`);
    parts.push(`Industry: ${state.target_context.target_industry}`);
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

  // Consistency scores
  if (state.consistency_scores) {
    const cs = state.consistency_scores;
    parts.push('\n## Consistency Scores');
    parts.push(`Overall: ${cs.overall}/100`);
    parts.push(`Messaging: ${cs.messaging}/100`);
    parts.push(`Value Proposition: ${cs.value_proposition}/100`);
    parts.push(`Tone & Voice: ${cs.tone_voice}/100`);
    parts.push(`Audience Alignment: ${cs.audience_alignment}/100`);
    parts.push(`Visual Identity: ${cs.visual_identity}/100`);
  }

  return parts.join('\n');
}

function parseBrandSource(val: unknown): BrandSource {
  const s = String(val ?? '').toLowerCase();
  const valid: BrandSource[] = ['resume', 'linkedin', 'bio', 'website', 'portfolio'];
  return valid.includes(s as BrandSource) ? (s as BrandSource) : 'resume';
}

function parseEffortImpact(val: unknown): 'low' | 'medium' | 'high' {
  const s = String(val ?? '').toLowerCase();
  const valid = ['low', 'medium', 'high'];
  return valid.includes(s) ? (s as 'low' | 'medium' | 'high') : 'medium';
}

// ─── Tool: identify_gaps ──────────────────────────────────────────

const identifyGapsTool: AdvisorTool = {
  name: 'identify_gaps',
  description:
    'Find missing brand elements and contradictions from audit findings. Synthesize patterns across individual findings.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;

    if (!state.audit_findings || state.audit_findings.length === 0) {
      return JSON.stringify({
        success: false,
        error: 'No audit findings available. The Brand Auditor must run first.',
      });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'identify_gaps',
      message: `Analyzing ${state.audit_findings.length} findings for gaps and patterns...`,
    });

    const stateContext = buildStateContext(state);

    const prompt = `Analyze these audit findings to identify overarching gaps, patterns, and contradictions in the executive's personal brand.

${PERSONAL_BRAND_RULES}

${stateContext}

AUDIT FINDINGS (${state.audit_findings.length} total):
${state.audit_findings.map((f) => `[${f.id}] [${f.severity}] [${f.source}] ${f.title}
  Category: ${f.category}
  Description: ${f.description}
  Affected: ${f.affected_elements.join(', ')}
  Recommendation: ${f.recommendation}`).join('\n\n')}

BRAND SOURCES ANALYZED:
${state.brand_sources.map((s) => `- ${s.source}: ${s.content.length} characters`).join('\n')}

Return JSON:
{
  "gap_patterns": [
    {
      "pattern": "Name of the overarching gap pattern",
      "description": "What this pattern means for the brand",
      "related_findings": ["finding_id_1", "finding_id_2"],
      "severity": "critical | high | medium | low",
      "root_cause": "Why this gap exists"
    }
  ],
  "contradictions": [
    {
      "element": "What is contradictory",
      "source_a": "resume",
      "source_b": "linkedin",
      "description": "How the sources contradict each other"
    }
  ],
  "missing_elements": [
    {
      "element": "What is missing",
      "expected_on": ["resume", "linkedin"],
      "importance": "Why this matters for the brand"
    }
  ],
  "brand_strengths": ["What the brand does well — always include these"]
}

Rules:
- Look for patterns across multiple findings, not just individual issues
- Identify contradictions between sources specifically
- Note what is missing that should be present for an executive at this level
- Always identify strengths — even a weak brand has some things going for it`;

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 4096,
      system:
        'You are a brand strategist who identifies patterns and gaps in executive personal brands. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: prompt }],
    });

    let result: Record<string, unknown>;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      result = { gap_patterns: [], contradictions: [], missing_elements: [], brand_strengths: [] };
    }

    scratchpad.gap_analysis = result;

    const gapCount = Array.isArray(result.gap_patterns) ? result.gap_patterns.length : 0;
    const contradictionCount = Array.isArray(result.contradictions) ? result.contradictions.length : 0;

    ctx.emit({
      type: 'transparency',
      stage: 'identify_gaps',
      message: `Gap analysis complete — ${gapCount} patterns, ${contradictionCount} contradictions identified`,
    });

    return JSON.stringify({
      success: true,
      gap_patterns: gapCount,
      contradictions: contradictionCount,
      missing_elements: Array.isArray(result.missing_elements) ? result.missing_elements.length : 0,
      brand_strengths: Array.isArray(result.brand_strengths) ? result.brand_strengths.length : 0,
    });
  },
};

// ─── Tool: write_recommendations ──────────────────────────────────

const writeRecommendationsTool: AdvisorTool = {
  name: 'write_recommendations',
  description:
    'Write specific, actionable improvement recommendations based on audit findings and gap analysis.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;

    const gapAnalysis = scratchpad.gap_analysis as Record<string, unknown> | undefined;
    if (!gapAnalysis) {
      return JSON.stringify({
        success: false,
        error: 'Gap analysis not available. Call identify_gaps first.',
      });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'write_recommendations',
      message: 'Writing actionable brand improvement recommendations...',
    });

    const stateContext = buildStateContext(state);

    const prompt = `Write specific, actionable recommendations to improve this executive's personal brand. Each recommendation must tell the executive exactly what to do.

${PERSONAL_BRAND_RULES}

${stateContext}

AUDIT FINDINGS:
${state.audit_findings.map((f) => `- [${f.severity}] [${f.source}] ${f.title}: ${f.description}`).join('\n')}

GAP ANALYSIS:
- Patterns: ${JSON.stringify(gapAnalysis.gap_patterns ?? [])}
- Contradictions: ${JSON.stringify(gapAnalysis.contradictions ?? [])}
- Missing Elements: ${JSON.stringify(gapAnalysis.missing_elements ?? [])}
- Brand Strengths: ${JSON.stringify(gapAnalysis.brand_strengths ?? [])}

Return JSON array of recommendations:
[
  {
    "priority": 1,
    "category": "Category name (e.g., Messaging Alignment, Value Proposition, Executive Presence)",
    "title": "Short action-oriented headline",
    "description": "Detailed, specific recommendation. Tell the executive EXACTLY what to write/change/add and where. Include example text when possible.",
    "effort": "low | medium | high",
    "impact": "low | medium | high",
    "affected_sources": ["resume", "linkedin"]
  }
]

Rules:
- Every recommendation must be specific enough to implement immediately
- Include example text or copy where possible ("Change your headline from X to Y")
- Assign preliminary priority numbers (1 = most important) — these will be refined by prioritize_fixes
- Effort: low = under 30 minutes, medium = 1-3 hours, high = half day or more
- Impact: based on how much this change improves the overall brand
- Aim for 5-10 recommendations — quality over quantity
- Address the most critical findings and gaps first
- Build on brand strengths, don't just fix weaknesses`;

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 8192,
      system:
        'You are an executive brand advisor who writes specific, actionable recommendations for personal brand improvement. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: prompt }],
    });

    interface RawRecommendation {
      priority?: number;
      category?: string;
      title?: string;
      description?: string;
      effort?: string;
      impact?: string;
      affected_sources?: string[];
    }

    let recommendations: BrandRecommendation[];
    try {
      const parsed = JSON.parse(repairJSON(response.text) ?? response.text);
      const items: RawRecommendation[] = Array.isArray(parsed) ? parsed : [parsed];
      recommendations = items.map((r, idx) => ({
        priority: Number(r.priority) || idx + 1,
        category: String(r.category ?? 'General'),
        title: String(r.title ?? ''),
        description: String(r.description ?? ''),
        effort: parseEffortImpact(r.effort),
        impact: parseEffortImpact(r.impact),
        affected_sources: Array.isArray(r.affected_sources)
          ? r.affected_sources.map((s: unknown) => parseBrandSource(s))
          : [] as BrandSource[],
      }));
    } catch {
      recommendations = [];
    }

    scratchpad.recommendations = recommendations;
    state.recommendations = recommendations;

    ctx.emit({
      type: 'transparency',
      stage: 'write_recommendations',
      message: `Wrote ${recommendations.length} actionable recommendations`,
    });

    return JSON.stringify({
      success: true,
      recommendation_count: recommendations.length,
      categories: [...new Set(recommendations.map((r) => r.category))],
    });
  },
};

// ─── Tool: prioritize_fixes ──────────────────────────────────────

const prioritizeFixesTool: AdvisorTool = {
  name: 'prioritize_fixes',
  description:
    'Rank recommendations by impact and effort, ensuring quick wins are surfaced first.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;

    const recommendations = scratchpad.recommendations as BrandRecommendation[] | undefined;
    if (!recommendations || recommendations.length === 0) {
      return JSON.stringify({
        success: false,
        error: 'No recommendations available. Call write_recommendations first.',
      });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'prioritize_fixes',
      message: `Prioritizing ${recommendations.length} recommendations by impact and effort...`,
    });

    const prompt = `Re-prioritize these brand improvement recommendations. Quick wins (high impact + low effort) go first, then high-impact items, then optimizations.

${PERSONAL_BRAND_RULES}

CURRENT RECOMMENDATIONS:
${recommendations.map((r, i) => `${i + 1}. [${r.effort} effort, ${r.impact} impact] "${r.title}" — ${r.description.slice(0, 200)}`).join('\n\n')}

Return JSON — an array of recommendation indices (0-based) in the optimal execution order:
{
  "priority_order": [2, 0, 4, 1, 3],
  "rationale": "Brief explanation of the prioritization logic",
  "quick_wins": [2, 0],
  "dependencies": [
    { "recommendation": 3, "depends_on": 0, "reason": "Why this dependency exists" }
  ]
}

Rules:
- Quick wins (high impact + low effort) always come first
- Critical fixes (factual errors, contradictions) before optimizations
- Note dependencies — some recommendations enable others
- Group related recommendations when the order doesn't matter`;

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 2048,
      system:
        'You are a strategic advisor who optimizes the execution order of improvement recommendations. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: prompt }],
    });

    let result: Record<string, unknown>;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      result = {};
    }

    // Apply new priority order
    const priorityOrder = Array.isArray(result.priority_order) ? result.priority_order : [];
    if (priorityOrder.length > 0) {
      const reordered: BrandRecommendation[] = [];
      for (let i = 0; i < priorityOrder.length; i++) {
        const idx = Number(priorityOrder[i]);
        if (idx >= 0 && idx < recommendations.length) {
          const rec = { ...recommendations[idx], priority: i + 1 };
          reordered.push(rec);
        }
      }
      // Add any recommendations not in the priority order
      for (let i = 0; i < recommendations.length; i++) {
        if (!priorityOrder.includes(i)) {
          reordered.push({ ...recommendations[i], priority: reordered.length + 1 });
        }
      }
      scratchpad.recommendations = reordered;
      state.recommendations = reordered;
    }

    const topPriority = state.recommendations.length > 0 ? state.recommendations[0].title : '';

    ctx.emit({
      type: 'recommendations_ready',
      recommendation_count: state.recommendations.length,
      top_priority: topPriority,
    });

    ctx.emit({
      type: 'transparency',
      stage: 'prioritize_fixes',
      message: `Prioritization complete — top priority: "${topPriority}"`,
    });

    return JSON.stringify({
      success: true,
      recommendation_count: state.recommendations.length,
      top_priority: topPriority,
      quick_wins: Array.isArray(result.quick_wins) ? result.quick_wins.length : 0,
    });
  },
};

// ─── Tool: assemble_audit_report ──────────────────────────────────

const assembleAuditReportTool: AdvisorTool = {
  name: 'assemble_audit_report',
  description:
    'Combine findings, consistency scores, and recommendations into a comprehensive final audit report.',
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
      stage: 'assemble_audit_report',
      message: 'Assembling final brand audit report...',
    });

    const recommendations = state.recommendations;
    const findings = state.audit_findings;
    const scores = state.consistency_scores;
    const gapAnalysis = scratchpad.gap_analysis as Record<string, unknown> | undefined;

    if (!findings || findings.length === 0) {
      return JSON.stringify({
        success: false,
        error: 'No findings to assemble — audit must complete first',
      });
    }

    // Generate executive summary via LLM
    const summaryResponse = await llm.chat({
      model: MODEL_MID,
      max_tokens: 2048,
      system: `You are an executive brand advisor writing a professional audit summary. Return ONLY valid JSON.

${PERSONAL_BRAND_RULES}`,
      messages: [{
        role: 'user',
        content: `Write an executive summary for this brand audit report.

CANDIDATE: ${state.resume_data?.name ?? 'Executive'} — ${state.resume_data?.current_title ?? 'Professional'}
SOURCES ANALYZED: ${state.brand_sources.map((s) => s.source).join(', ')}
FINDINGS: ${findings.length} total (${findings.filter((f) => f.severity === 'critical').length} critical, ${findings.filter((f) => f.severity === 'high').length} high)
OVERALL CONSISTENCY: ${scores?.overall ?? 'N/A'}/100
RECOMMENDATIONS: ${recommendations.length}
${gapAnalysis?.brand_strengths ? `STRENGTHS: ${JSON.stringify(gapAnalysis.brand_strengths)}` : ''}

Return JSON:
{
  "executive_summary": "3-5 sentence overview of the brand audit results, key findings, and top recommendations",
  "overall_assessment": "One sentence assessment: is the brand strong, needs work, or needs significant overhaul?"
}`,
      }],
    });

    let summaryResult: Record<string, unknown>;
    try {
      summaryResult = JSON.parse(repairJSON(summaryResponse.text) ?? summaryResponse.text);
    } catch {
      summaryResult = {
        executive_summary: 'Brand audit complete. See findings and recommendations below.',
        overall_assessment: 'Review findings for details.',
      };
    }

    // ── Assemble markdown report ──
    const reportParts: string[] = [];
    const candidateName = state.resume_data?.name ?? 'Executive';

    // Header
    reportParts.push(`# ${candidateName} — Personal Brand Audit Report`);
    reportParts.push('');

    // Executive summary
    reportParts.push('## Executive Summary');
    reportParts.push('');
    reportParts.push(String(summaryResult.executive_summary ?? ''));
    reportParts.push('');
    reportParts.push(`**Overall Assessment:** ${String(summaryResult.overall_assessment ?? '')}`);
    reportParts.push('');

    // Sources analyzed
    reportParts.push('## Sources Analyzed');
    reportParts.push('');
    for (const source of state.brand_sources) {
      reportParts.push(`- **${source.source.charAt(0).toUpperCase() + source.source.slice(1)}** (${source.content.length.toLocaleString()} characters)`);
    }
    reportParts.push('');

    // Consistency scores
    if (scores) {
      reportParts.push('---');
      reportParts.push('');
      reportParts.push('## Consistency Scores');
      reportParts.push('');
      reportParts.push('| Dimension | Score | Rating |');
      reportParts.push('|-----------|-------|--------|');
      const scoreEntries: Array<[string, number]> = [
        ['Overall', scores.overall],
        ['Messaging', scores.messaging],
        ['Value Proposition', scores.value_proposition],
        ['Tone & Voice', scores.tone_voice],
        ['Audience Alignment', scores.audience_alignment],
        ['Visual Identity', scores.visual_identity],
      ];
      for (const [label, score] of scoreEntries) {
        const rating = score >= 80 ? 'Strong' : score >= 60 ? 'Adequate' : score >= 40 ? 'Needs Work' : 'Critical';
        reportParts.push(`| ${label} | ${score}/100 | ${rating} |`);
      }
      reportParts.push('');
    }

    // Findings by severity
    reportParts.push('---');
    reportParts.push('');
    reportParts.push('## Audit Findings');
    reportParts.push('');

    const severityOrder: Array<'critical' | 'high' | 'medium' | 'low'> = ['critical', 'high', 'medium', 'low'];
    for (const severity of severityOrder) {
      const severityFindings = findings.filter((f) => f.severity === severity);
      if (severityFindings.length === 0) continue;

      const severityLabel = severity.charAt(0).toUpperCase() + severity.slice(1);
      reportParts.push(`### ${severityLabel} (${severityFindings.length})`);
      reportParts.push('');

      for (const finding of severityFindings) {
        reportParts.push(`#### ${finding.title}`);
        reportParts.push('');
        reportParts.push(`**Source:** ${finding.source} | **Category:** ${finding.category.replace(/_/g, ' ')}`);
        reportParts.push('');
        reportParts.push(finding.description);
        reportParts.push('');
        if (finding.affected_elements.length > 0) {
          reportParts.push(`**Affected:** ${finding.affected_elements.join(', ')}`);
          reportParts.push('');
        }
        reportParts.push(`> **Recommendation:** ${finding.recommendation}`);
        reportParts.push('');
      }
    }

    // Recommendations
    if (recommendations.length > 0) {
      reportParts.push('---');
      reportParts.push('');
      reportParts.push('## Recommendations (Prioritized)');
      reportParts.push('');

      for (const rec of recommendations) {
        reportParts.push(`### ${rec.priority}. ${rec.title}`);
        reportParts.push('');
        reportParts.push(`**Category:** ${rec.category} | **Effort:** ${rec.effort} | **Impact:** ${rec.impact}`);
        reportParts.push('');
        reportParts.push(rec.description);
        reportParts.push('');
        if (rec.affected_sources.length > 0) {
          reportParts.push(`**Affects:** ${rec.affected_sources.join(', ')}`);
          reportParts.push('');
        }
      }
    }

    // Brand strengths
    const brandStrengths = gapAnalysis?.brand_strengths;
    if (Array.isArray(brandStrengths) && brandStrengths.length > 0) {
      reportParts.push('---');
      reportParts.push('');
      reportParts.push('## Brand Strengths');
      reportParts.push('');
      for (const strength of brandStrengths) {
        reportParts.push(`- ${String(strength)}`);
      }
      reportParts.push('');
    }

    const report = reportParts.join('\n');

    // ── Quality scoring ──
    let qualityScore = scores?.overall ?? 50;
    if (recommendations.length === 0) qualityScore -= 10;
    if (!summaryResult.executive_summary || String(summaryResult.executive_summary).length < 50) qualityScore -= 5;
    if (findings.length > 0 && recommendations.length >= 3) qualityScore += 5;
    qualityScore = Math.max(0, Math.min(100, qualityScore));

    scratchpad.final_report = report;
    scratchpad.quality_score = qualityScore;
    state.final_report = report;
    state.quality_score = qualityScore;

    ctx.emit({
      type: 'transparency',
      stage: 'assemble_audit_report',
      message: `Report assembled — ${findings.length} findings, ${recommendations.length} recommendations, quality: ${qualityScore}/100`,
    });

    return JSON.stringify({
      success: true,
      report_length: report.length,
      finding_count: findings.length,
      recommendation_count: recommendations.length,
      quality_score: qualityScore,
    });
  },
};

// ─── Exports ──────────────────────────────────────────────────────

export const advisorTools: AdvisorTool[] = [
  identifyGapsTool,
  writeRecommendationsTool,
  prioritizeFixesTool,
  assembleAuditReportTool,
];
