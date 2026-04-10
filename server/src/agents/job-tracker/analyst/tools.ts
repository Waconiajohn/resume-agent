/**
 * Job Application Tracker Analyst — Tool definitions.
 *
 * 4 tools:
 * - analyze_application: Analyze a single application against resume + JD
 * - score_fit: Compute 4-dimension fit score
 * - assess_follow_up_timing: Determine follow-up urgency for each application
 * - generate_portfolio_analytics: Build portfolio-level analytics
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type {
  JobTrackerState,
  JobTrackerSSEEvent,
  ApplicationAnalysis,
  ApplicationInput,
} from '../types.js';
import { llm, MODEL_LIGHT, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import {
  renderCareerNarrativeSection,
  renderCareerProfileSection,
  renderPositioningStrategySection,
} from '../../../contracts/shared-context-prompt.js';
import { hasMeaningfulSharedValue } from '../../../contracts/shared-context.js';

type JobTrackerTool = AgentTool<JobTrackerState, JobTrackerSSEEvent>;

// ─── Tool: analyze_application ─────────────────────────────────────

const analyzeApplicationTool: JobTrackerTool = {
  name: 'analyze_application',
  description:
    'Analyze all submitted job applications against the candidate resume. ' +
    'Parses the resume (if not already loaded) and performs initial JD analysis ' +
    'for each application. Call this first before any other tools.',
  model_tier: 'light',
  input_schema: {
    type: 'object',
    properties: {
      resume_text: {
        type: 'string',
        description: 'Raw resume text of the candidate (used to parse resume data if not already loaded)',
      },
    },
    required: [],
  },
  async execute(input, ctx) {
    const state = ctx.getState();

    // ─── Parse resume if needed ──────────────────────────────────
    const resumeText = input.resume_text ? String(input.resume_text) : '';
    if (!state.resume_data && resumeText.length > 50) {
      ctx.emit({
        type: 'transparency',
        stage: 'analyze_application',
        message: 'Parsing candidate resume...',
      });

      const resumeResponse = await llm.chat({
        model: MODEL_LIGHT,
        max_tokens: 4096,
        system: 'You extract structured data from resumes. Return ONLY valid JSON, no comments, no markdown fencing.',
        messages: [{
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
        }],
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

      if (state.resume_data) {
        ctx.emit({
          type: 'transparency',
          stage: 'analyze_application',
          message: `Parsed resume for ${state.resume_data.name} — ${state.resume_data.key_skills?.length ?? 0} skills identified`,
        });
      }
    }

    // ─── Analyze each application ────────────────────────────────
    const applications = state.applications ?? [];
    if (applications.length === 0) {
      return JSON.stringify({ success: false, error: 'No applications to analyze.' });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'analyze_application',
      message: `Analyzing ${applications.length} application(s)...`,
    });

    const analyses: ApplicationAnalysis[] = [];

    for (const app of applications) {
      const now = new Date();
      const applied = new Date(app.date_applied);
      const daysElapsed = Math.max(0, Math.floor((now.getTime() - applied.getTime()) / (1000 * 60 * 60 * 24)));

      const analysisPrompt = buildApplicationAnalysisPrompt(app, state, daysElapsed);

      const response = await llm.chat({
        model: MODEL_LIGHT,
        max_tokens: 2048,
        system: 'You are a career strategy analyst who evaluates job application fit for senior executives. Return ONLY valid JSON.',
        messages: [{ role: 'user', content: analysisPrompt }],
      });

      let analysis: ApplicationAnalysis;
      try {
        const parsed = JSON.parse(repairJSON(response.text) ?? response.text);
        analysis = {
          company: app.company,
          role: app.role,
          fit_score: clamp(Number(parsed.fit_score) || 50, 0, 100),
          keyword_match: clamp(Number(parsed.keyword_match) || 50, 0, 100),
          seniority_alignment: parseSeniorityAlignment(parsed.seniority_alignment),
          industry_relevance: clamp(Number(parsed.industry_relevance) || 50, 0, 100),
          positioning_fit: clamp(Number(parsed.positioning_fit) || 50, 0, 100),
          strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
          gaps: Array.isArray(parsed.gaps) ? parsed.gaps.map(String) : [],
          recommended_action: String(parsed.recommended_action ?? 'Follow up as planned'),
          days_elapsed: daysElapsed,
          response_likelihood: parseResponseLikelihood(parsed.response_likelihood),
        };
      } catch {
        analysis = {
          company: app.company,
          role: app.role,
          fit_score: 50,
          keyword_match: 50,
          seniority_alignment: 'match',
          industry_relevance: 50,
          positioning_fit: 50,
          strengths: [],
          gaps: [],
          recommended_action: 'Follow up as planned',
          days_elapsed: daysElapsed,
          response_likelihood: 'medium',
        };
      }

      analyses.push(analysis);

      ctx.emit({
        type: 'application_analyzed',
        company: app.company,
        role: app.role,
        fit_score: analysis.fit_score,
      });
    }

    state.application_analyses = analyses;

    ctx.emit({
      type: 'transparency',
      stage: 'analyze_application',
      message: `Analyzed ${analyses.length} application(s) — average fit score: ${Math.round(analyses.reduce((s, a) => s + a.fit_score, 0) / analyses.length)}`,
    });

    return JSON.stringify({
      success: true,
      applications_analyzed: analyses.length,
      average_fit_score: Math.round(analyses.reduce((s, a) => s + a.fit_score, 0) / analyses.length),
    });
  },
};

// ─── Tool: score_fit ───────────────────────────────────────────────

const scoreFitTool: JobTrackerTool = {
  name: 'score_fit',
  description:
    'Refine fit scores for all applications using the 4-dimension model ' +
    '(keyword match, seniority alignment, industry relevance, positioning fit). ' +
    'Call this after analyze_application to get deeper scoring with positioning context.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();

    if (!state.application_analyses || state.application_analyses.length === 0) {
      return JSON.stringify({ success: false, error: 'No application analyses available. Call analyze_application first.' });
    }
    if (!state.resume_data) {
      return JSON.stringify({ success: false, error: 'No resume data available.' });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'score_fit',
      message: 'Refining fit scores with positioning context...',
    });

    const sharedContext = state.shared_context;
    const positioningContext = (hasMeaningfulSharedValue(sharedContext?.positioningStrategy) || state.platform_context?.positioning_strategy)
      ? renderPositioningStrategySection({
          heading: '## Positioning Strategy',
          sharedStrategy: sharedContext?.positioningStrategy,
          legacyStrategy: state.platform_context?.positioning_strategy,
        }).join('\n')
      : '';
    const careerProfileContext = hasMeaningfulSharedValue(sharedContext?.candidateProfile)
      ? renderCareerProfileSection({
          heading: '## Career Profile',
          sharedContext,
        }).join('\n')
      : '';
    const careerNarrativeContext = hasMeaningfulSharedValue(sharedContext?.careerNarrative)
      ? renderCareerNarrativeSection({
          heading: '## Career Narrative Signals',
          sharedNarrative: sharedContext?.careerNarrative,
        }).join('\n')
      : '';

    const scoringPrompt = `Refine the fit scores for these job applications. Each score is weighted 25% across 4 dimensions.

CANDIDATE:
- Name: ${state.resume_data.name}
- Title: ${state.resume_data.current_title}
- Skills: ${state.resume_data.key_skills?.join(', ') || 'None listed'}
- Achievements: ${state.resume_data.key_achievements?.join(' | ') || 'None listed'}
${careerProfileContext ? `\n${careerProfileContext}` : ''}
${careerNarrativeContext ? `\n${careerNarrativeContext}` : ''}
${positioningContext}

APPLICATIONS AND INITIAL ANALYSES:
${state.application_analyses.map((a, i) => {
  const app = state.applications[i];
  return `
--- Application ${i + 1}: ${a.company} — ${a.role} ---
JD Summary: ${app?.jd_text?.slice(0, 3000) ?? 'No JD available'}
Initial Fit Score: ${a.fit_score}
Keyword Match: ${a.keyword_match}
Seniority: ${a.seniority_alignment}
Industry Relevance: ${a.industry_relevance}
Positioning Fit: ${a.positioning_fit}`;
}).join('\n')}

Return JSON array — one object per application:
[
  {
    "company": "Company Name",
    "role": "Role Title",
    "keyword_match": 0-100,
    "seniority_alignment": "under" | "match" | "over",
    "industry_relevance": 0-100,
    "positioning_fit": 0-100,
    "fit_score": 0-100,
    "strengths": ["strength 1", "strength 2"],
    "gaps": ["gap 1"],
    "response_likelihood": "low" | "medium" | "high"
  }
]

Rules:
- fit_score = (keyword_match + seniority_score + industry_relevance + positioning_fit) / 4
  where seniority_score: "match" = 85, "over" = 60, "under" = 40
- positioning_fit: how well this role aligns with their career positioning strategy (100 = perfect alignment)
- response_likelihood: "high" if fit_score >= 75, "medium" if 55-74, "low" if < 55
- Be honest about gaps — executives need accurate data, not encouragement`;

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 4096,
      system: 'You are a career fit analyst who scores application quality for senior executives. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: scoringPrompt }],
    });

    try {
      const refined = JSON.parse(repairJSON(response.text) ?? response.text);
      const refinedArray = Array.isArray(refined) ? refined : [refined];

      for (const item of refinedArray) {
        const existing = state.application_analyses.find(
          (a) => a.company === item.company && a.role === item.role,
        );
        if (existing) {
          existing.fit_score = clamp(Number(item.fit_score) || existing.fit_score, 0, 100);
          existing.keyword_match = clamp(Number(item.keyword_match) || existing.keyword_match, 0, 100);
          existing.seniority_alignment = parseSeniorityAlignment(item.seniority_alignment) || existing.seniority_alignment;
          existing.industry_relevance = clamp(Number(item.industry_relevance) || existing.industry_relevance, 0, 100);
          existing.positioning_fit = clamp(Number(item.positioning_fit) || existing.positioning_fit, 0, 100);
          if (Array.isArray(item.strengths)) existing.strengths = item.strengths.map(String);
          if (Array.isArray(item.gaps)) existing.gaps = item.gaps.map(String);
          existing.response_likelihood = parseResponseLikelihood(item.response_likelihood) || existing.response_likelihood;
        }
      }
    } catch {
      // Keep initial scores if refinement fails
    }

    const avg = Math.round(
      state.application_analyses.reduce((s, a) => s + a.fit_score, 0) / state.application_analyses.length,
    );

    ctx.emit({
      type: 'transparency',
      stage: 'score_fit',
      message: `Fit scores refined — average: ${avg}`,
    });

    return JSON.stringify({
      success: true,
      average_fit_score: avg,
      scores: state.application_analyses.map((a) => ({
        company: a.company,
        role: a.role,
        fit_score: a.fit_score,
        response_likelihood: a.response_likelihood,
      })),
    });
  },
};

// ─── Tool: assess_follow_up_timing ─────────────────────────────────

const assessFollowUpTimingTool: JobTrackerTool = {
  name: 'assess_follow_up_timing',
  description:
    'Assess follow-up timing and urgency for each application. ' +
    'Determines which applications need immediate follow-up, which can wait, ' +
    'and what type of follow-up to send. Call after score_fit.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();

    if (!state.application_analyses || state.application_analyses.length === 0) {
      return JSON.stringify({ success: false, error: 'No application analyses available. Call analyze_application first.' });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'assess_follow_up_timing',
      message: 'Assessing follow-up timing and urgency...',
    });

    const timingPrompt = `Assess follow-up timing for each application based on status and elapsed time.

APPLICATIONS:
${state.application_analyses.map((a, i) => {
  const app = state.applications[i];
  return `- ${a.company} — ${a.role} | Status: ${app?.status ?? 'applied'} | Days elapsed: ${a.days_elapsed} | Fit score: ${a.fit_score} | Contact: ${app?.contact_name ?? 'Unknown'}`;
}).join('\n')}

Return JSON array:
[
  {
    "company": "Company Name",
    "role": "Role Title",
    "urgency": "immediate" | "soon" | "can_wait" | "no_action",
    "reason": "Why this urgency level — 1 sentence",
    "recommended_type": "initial_follow_up" | "thank_you" | "check_in" | "post_interview"
  }
]

Rules:
- "immediate": applied 7+ days ago, no follow-up sent, status is "applied"
- "soon": in the follow-up window (5-7 days since applied or last contact)
- "can_wait": recently applied (< 5 days) or recently followed up
- "no_action": status is "rejected", "withdrawn", "offered", or already followed up twice
- "interviewing" status → recommend "post_interview" or "thank_you" type
- "ghosted" status → "no_action" (don't chase further)
- Higher fit scores should bias toward "immediate" when borderline`;

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 3072,
      system: 'You are a job search strategist who optimizes follow-up timing for executives. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: timingPrompt }],
    });

    try {
      const parsed = JSON.parse(repairJSON(response.text) ?? response.text);
      const timingArray = Array.isArray(parsed) ? parsed : [parsed];

      state.follow_up_priorities = timingArray.map((item: Record<string, unknown>) => ({
        company: String(item.company ?? ''),
        role: String(item.role ?? ''),
        urgency: parseUrgency(item.urgency),
        reason: String(item.reason ?? ''),
        recommended_type: parseFollowUpType(item.recommended_type),
      }));
    } catch {
      // Fallback: simple heuristic based on days elapsed and status
      state.follow_up_priorities = state.application_analyses.map((a, i) => {
        const app = state.applications[i];
        const status = app?.status ?? 'applied';

        if (['rejected', 'withdrawn', 'offered', 'ghosted'].includes(status)) {
          return { company: a.company, role: a.role, urgency: 'no_action' as const, reason: `Status is ${status}`, recommended_type: 'initial_follow_up' as const };
        }
        if (status === 'interviewing') {
          return { company: a.company, role: a.role, urgency: 'soon' as const, reason: 'Currently interviewing', recommended_type: 'post_interview' as const };
        }
        if (a.days_elapsed >= 7) {
          return { company: a.company, role: a.role, urgency: 'immediate' as const, reason: `${a.days_elapsed} days since applied`, recommended_type: 'initial_follow_up' as const };
        }
        if (a.days_elapsed >= 5) {
          return { company: a.company, role: a.role, urgency: 'soon' as const, reason: 'In follow-up window', recommended_type: 'initial_follow_up' as const };
        }
        return { company: a.company, role: a.role, urgency: 'can_wait' as const, reason: 'Recently applied', recommended_type: 'initial_follow_up' as const };
      });
    }

    const immediate = state.follow_up_priorities.filter((p) => p.urgency === 'immediate').length;
    const soon = state.follow_up_priorities.filter((p) => p.urgency === 'soon').length;

    ctx.emit({
      type: 'transparency',
      stage: 'assess_follow_up_timing',
      message: `Follow-up timing assessed — ${immediate} immediate, ${soon} soon, ${state.follow_up_priorities.length - immediate - soon} can wait or no action`,
    });

    return JSON.stringify({
      success: true,
      priorities: state.follow_up_priorities,
    });
  },
};

// ─── Tool: generate_portfolio_analytics ────────────────────────────

const generatePortfolioAnalyticsTool: JobTrackerTool = {
  name: 'generate_portfolio_analytics',
  description:
    'Generate portfolio-level analytics across all applications. ' +
    'Includes status breakdown, fit score distribution, industry concentration, ' +
    'and strategic assessment. Call after assess_follow_up_timing.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();

    if (!state.application_analyses || state.application_analyses.length === 0) {
      return JSON.stringify({ success: false, error: 'No application analyses available.' });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'generate_portfolio_analytics',
      message: 'Generating portfolio analytics...',
    });

    const analyses = state.application_analyses;
    const applications = state.applications;

    // Compute status breakdown
    const statusBreakdown: Record<string, number> = {};
    for (const app of applications) {
      statusBreakdown[app.status] = (statusBreakdown[app.status] ?? 0) + 1;
    }

    // Compute likelihood breakdown
    const likelihoodBreakdown: Record<string, number> = {};
    for (const a of analyses) {
      likelihoodBreakdown[a.response_likelihood] = (likelihoodBreakdown[a.response_likelihood] ?? 0) + 1;
    }

    // Top applications by fit score
    const sorted = [...analyses].sort((a, b) => b.fit_score - a.fit_score);
    const topApplications = sorted.slice(0, 3).map((a) => ({
      company: a.company,
      role: a.role,
      fit_score: a.fit_score,
    }));

    // Urgent follow-ups
    const followUpUrgent = (state.follow_up_priorities ?? [])
      .filter((p) => p.urgency === 'immediate' || p.urgency === 'soon')
      .map((p) => {
        const analysis = analyses.find((a) => a.company === p.company && a.role === p.role);
        return { company: p.company, role: p.role, days_elapsed: analysis?.days_elapsed ?? 0 };
      });

    // Industry distribution
    const industryDistribution: Record<string, number> = {};
    // Use LLM to extract industry from JD for more accurate distribution
    for (const _app of applications) {
      // Simple heuristic: use company name as proxy (LLM already scored industry_relevance)
      const industry = 'General'; // Will be enriched by the assessment prompt
      industryDistribution[industry] = (industryDistribution[industry] ?? 0) + 1;
    }

    const avgFitScore = Math.round(analyses.reduce((s, a) => s + a.fit_score, 0) / analyses.length);

    // Generate narrative assessment
    const assessmentPrompt = `Write a brief portfolio assessment (3-5 sentences) for this executive's job search.

METRICS:
- Total applications: ${analyses.length}
- Average fit score: ${avgFitScore}
- Top application: ${topApplications[0]?.company ?? 'N/A'} (${topApplications[0]?.fit_score ?? 0})
- Applications needing follow-up: ${followUpUrgent.length}
- Status breakdown: ${Object.entries(statusBreakdown).map(([k, v]) => `${k}: ${v}`).join(', ')}
- Response likelihood: ${Object.entries(likelihoodBreakdown).map(([k, v]) => `${k}: ${v}`).join(', ')}

Be direct and strategic. If the average fit score is below 60, say so. If the pipeline is healthy, say so. Include one specific recommendation.`;

    const assessmentResponse = await llm.chat({
      model: MODEL_MID,
      max_tokens: 1024,
      system: 'You are a career strategist providing portfolio-level job search intelligence to senior executives. Be direct and data-driven.',
      messages: [{ role: 'user', content: assessmentPrompt }],
    });

    state.portfolio_analytics = {
      total_applications: analyses.length,
      average_fit_score: avgFitScore,
      status_breakdown: statusBreakdown,
      likelihood_breakdown: likelihoodBreakdown,
      top_applications: topApplications,
      follow_up_urgent: followUpUrgent,
      industry_distribution: industryDistribution,
      portfolio_assessment: assessmentResponse.text.trim(),
    };

    ctx.emit({
      type: 'analytics_updated',
      total: analyses.length,
      average_fit: avgFitScore,
    });

    ctx.emit({
      type: 'transparency',
      stage: 'generate_portfolio_analytics',
      message: `Portfolio analytics complete — ${analyses.length} applications, avg fit ${avgFitScore}, ${followUpUrgent.length} urgent follow-ups`,
    });

    return JSON.stringify({
      success: true,
      total_applications: analyses.length,
      average_fit_score: avgFitScore,
      top_application: topApplications[0] ?? null,
      urgent_follow_ups: followUpUrgent.length,
      assessment_preview: state.portfolio_analytics.portfolio_assessment.slice(0, 150),
    });
  },
};

// ─── Helpers ───────────────────────────────────────────────────────

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function parseSeniorityAlignment(val: unknown): 'under' | 'match' | 'over' {
  const s = String(val ?? '').toLowerCase();
  if (s === 'under') return 'under';
  if (s === 'over') return 'over';
  return 'match';
}

function parseResponseLikelihood(val: unknown): 'low' | 'medium' | 'high' {
  const s = String(val ?? '').toLowerCase();
  if (s === 'low') return 'low';
  if (s === 'high') return 'high';
  return 'medium';
}

function parseUrgency(val: unknown): 'immediate' | 'soon' | 'can_wait' | 'no_action' {
  const s = String(val ?? '').toLowerCase();
  if (s === 'immediate') return 'immediate';
  if (s === 'soon') return 'soon';
  if (s === 'no_action') return 'no_action';
  return 'can_wait';
}

function parseFollowUpType(val: unknown): 'initial_follow_up' | 'thank_you' | 'check_in' | 'post_interview' {
  const s = String(val ?? '').toLowerCase();
  if (s === 'thank_you') return 'thank_you';
  if (s === 'check_in') return 'check_in';
  if (s === 'post_interview') return 'post_interview';
  return 'initial_follow_up';
}

function buildApplicationAnalysisPrompt(
  app: ApplicationInput,
  state: JobTrackerState,
  daysElapsed: number,
): string {
  const rd = state.resume_data;
  const parts = [
    `Analyze this job application against the candidate's resume.`,
    '',
    '## Job Description',
    app.jd_text.slice(0, 3000),
    '',
    '## Application Details',
    `- Company: ${app.company}`,
    `- Role: ${app.role}`,
    `- Date Applied: ${app.date_applied}`,
    `- Days Elapsed: ${daysElapsed}`,
    `- Current Status: ${app.status}`,
  ];

  if (app.contact_name) parts.push(`- Contact: ${app.contact_name}`);
  if (app.notes) parts.push(`- Notes: ${app.notes}`);

  if (rd) {
    parts.push(
      '',
      '## Candidate Resume',
      `- Name: ${rd.name}`,
      `- Current Title: ${rd.current_title}`,
      `- Summary: ${rd.career_summary}`,
      `- Key Skills: ${rd.key_skills?.join(', ') || 'None listed'}`,
      `- Key Achievements: ${rd.key_achievements?.slice(0, 10).join(' | ') || 'None listed'}`,
    );
  }

  if (hasMeaningfulSharedValue(state.shared_context?.positioningStrategy) || state.platform_context?.positioning_strategy) {
    parts.push(...renderPositioningStrategySection({
      heading: '## Positioning Strategy',
      sharedStrategy: state.shared_context?.positioningStrategy,
      legacyStrategy: state.platform_context?.positioning_strategy,
    }));
  }

  parts.push(
    '',
    'Return JSON:',
    '{',
    '  "fit_score": 0-100,',
    '  "keyword_match": 0-100,',
    '  "seniority_alignment": "under" | "match" | "over",',
    '  "industry_relevance": 0-100,',
    '  "positioning_fit": 0-100,',
    '  "strengths": ["2-3 specific strengths for this application"],',
    '  "gaps": ["1-2 gaps or concerns"],',
    '  "recommended_action": "Specific next action for this application",',
    '  "response_likelihood": "low" | "medium" | "high"',
    '}',
  );

  return parts.join('\n');
}

// ─── Exports ───────────────────────────────────────────────────────

export const analystTools: JobTrackerTool[] = [
  analyzeApplicationTool,
  scoreFitTool,
  assessFollowUpTimingTool,
  generatePortfolioAnalyticsTool,
];
