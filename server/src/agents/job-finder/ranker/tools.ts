/**
 * Job Finder Ranker — Tool definitions.
 *
 * 4 tools:
 * - score_job_fit: Evaluate each discovered job against platform context
 * - rank_and_narrate: Order by score and write "why this matches" narratives
 * - present_results: Emit results_ready event and prepare the review gate
 * - emit_transparency: Live progress updates
 */

import type { JobFinderTool, RankedMatch, JobEvaluation } from '../types.js';
import { llm, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import { createEmitTransparency } from '../../runtime/shared-tools.js';
import type { JobFinderState, JobFinderSSEEvent } from '../types.js';
import { hasMeaningfulSharedValue } from '../../../contracts/shared-context.js';
import {
  renderBenchmarkCandidateSection,
  renderBenchmarkProfileDirectionSection,
  renderCareerNarrativeSection,
  renderGapAnalysisSection,
  renderIndustryContextSection,
  renderPositioningStrategySection,
} from '../../../contracts/shared-context-prompt.js';

// ─── Tool: score_job_fit ────────────────────────────────────────────

const scoreJobFitTool: JobFinderTool = {
  name: 'score_job_fit',
  description:
    'Evaluate all discovered jobs from pipeline state against the user\'s positioning strategy, ' +
    'benchmark candidate profile, and gap analysis. Produces a fit score (0-100) for each job ' +
    'along with reasoning. Reads jobs from state.search_results. Stores scores in scratchpad as scored_jobs.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const jobs = state.search_results ?? [];

    if (jobs.length === 0) {
      return JSON.stringify({ success: false, error: 'No jobs in state.search_results — run searcher agent first.' });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'ranking',
      message: `Scoring ${jobs.length} jobs against your positioning strategy...`,
    });

    // Build context for scoring
    const sharedContext = state.shared_context;
    const positioningStrategy = hasMeaningfulSharedValue(sharedContext?.positioningStrategy)
      ? sharedContext?.positioningStrategy
      : state.platform_context?.positioning_strategy;
    const benchmarkCandidate = hasMeaningfulSharedValue(sharedContext?.benchmarkCandidate)
      ? sharedContext?.benchmarkCandidate
      : state.platform_context?.benchmark_candidate;
    const gapAnalysis = hasMeaningfulSharedValue(sharedContext?.gapAnalysis)
      ? sharedContext?.gapAnalysis
      : state.platform_context?.gap_analysis;

    const contextParts: string[] = [
      ...renderBenchmarkProfileDirectionSection({
        heading: 'BENCHMARK PROFILE DIRECTION',
        sharedContext,
      }),
      ...renderPositioningStrategySection({
        heading: 'POSITIONING STRATEGY',
        sharedStrategy: sharedContext?.positioningStrategy,
        legacyStrategy: positioningStrategy,
      }),
      ...renderBenchmarkCandidateSection({
        heading: 'BENCHMARK CANDIDATE PROFILE',
        sharedBenchmark: sharedContext?.benchmarkCandidate,
        legacyBenchmark: benchmarkCandidate,
      }),
      ...renderGapAnalysisSection({
        heading: 'GAP ANALYSIS',
        sharedGapAnalysis: sharedContext?.gapAnalysis,
        legacyGapAnalysis: gapAnalysis,
      }),
    ];

    const hasContext = contextParts.length > 0;

    const scoringPrompt = `Evaluate each job opening for fit against this executive candidate.

${hasContext ? contextParts.join('\n\n') : 'No positioning context available — score based on job title and seniority signals only.'}

JOBS TO EVALUATE:
${jobs.map((j, i) => `${i + 1}. "${j.title}" at ${j.company}${j.location ? ` (${j.location})` : ''}${j.salary_range ? ` — ${j.salary_range}` : ''}${j.description_snippet ? `\n   Snippet: ${j.description_snippet.slice(0, 300)}` : ''}`).join('\n')}

Return a JSON array — one object per job, same order as above:
[
  {
    "title": "exact title from input",
    "company": "exact company from input",
    "fit_score": 0-100,
    "positioning_alignment": "1-2 sentences on how this aligns with the positioning strategy",
    "career_trajectory_fit": "1-2 sentences on whether this is a good career trajectory move",
    "seniority_fit": "match" | "over" | "under",
    "fit_reasoning": "2-3 sentences on overall fit",
    "evaluation": {
      "fit_check": {
        "rating": "STRONG_FIT" | "STRETCH" | "MISMATCH",
        "reasoning": "1 sentence on how well the role matches the candidate's profile and seniority"
      },
      "gap_assessment": {
        "summary": "What is missing and can it be bridged? 1-2 sentences.",
        "bridgeable": true | false
      },
      "red_flags": ["posting age concern", "unicorn spec", "unrealistic scope"],
      "verdict": {
        "decision": "APPLY_NOW" | "WORTH_A_CONVERSATION" | "DEPRIORITIZE",
        "reasoning": "1 sentence justification for the verdict"
      }
    },
    "career_level_strategy": {
      "current_level": "candidate's current/most recent title",
      "target_level": "this role's level",
      "move_type": "step_up" | "lateral" | "step_down" | "reset",
      "scope_change": "what changes: budget, team size, complexity, geography",
      "strategic_rationale": "why this move serves the candidate's trajectory"
    },
    "compensation_analysis": {
      "posted_range": "salary range if posted, or null",
      "market_estimate": "estimated market range for this role and company size",
      "vs_current": "premium" | "in_range" | "below_market" | "unknown",
      "level_alignment": "does the comp match the stated seniority?",
      "red_flags": ["comp suggests IC role despite VP title"]
    },
    "personalization_potential": {
      "evidence_alignment_score": 0-100,
      "strongest_evidence_matches": [{"requirement": "JD need", "evidence": "candidate proof", "confidence": "High|Moderate|Low"}],
      "evidence_gaps": [{"requirement": "JD need", "gap_type": "unaddressed|adjacent_proof_only|supportable_inference"}],
      "personalization_narrative": "how to tailor the resume for this specific role"
    },
    "interview_prep_stories": [
      {
        "jd_challenge": "the implicit challenge this role solves",
        "star_setup": {
          "situation": "context from candidate's history",
          "task": "the challenge they faced",
          "action": "what they did",
          "result": "metrics and outcomes"
        },
        "relevance_to_role": "why this story proves readiness"
      }
    ]
  }
]

Scoring guide:
- 90-100: Perfect alignment — role matches positioning strategy exactly, trajectory is clear
- 75-89: Strong fit — aligns well, minor gaps
- 60-74: Moderate fit — some alignment but notable gaps or trajectory concerns
- 45-59: Weak fit — significant misalignment
- Below 45: Poor fit — not recommended
- Score based on the candidate's actual positioning, not just surface-level title matching
- Consider whether this is a "step up", "lateral", or "step down" move
- Executive candidates applying "down" by 1-2 levels is a valid strategy — adjust accordingly

Evaluation guidance:
- fit_check.rating: STRONG_FIT = clear match on level, function, and trajectory; STRETCH = one or two gaps but candidate could make a case; MISMATCH = fundamentally wrong level or function
- gap_assessment: be specific about what is missing (credentials, industry, scope) and whether the candidate's transferable experience makes it bridgeable
- red_flags: flag posting age (>60 days old = likely filled), unicorn specs (10+ unrelated requirements), vague or contradictory job descriptions, signs the role may be filled internally, unrealistic scope for one person. Use an empty array if no flags apply.
- verdict: APPLY_NOW = strong match, invest the energy now; WORTH_A_CONVERSATION = not perfect but worth a recruiter call; DEPRIORITIZE = not worth the time given current priorities

Career-Ops evaluation blocks:
- career_level_strategy: Categorize the move as step_up (title/scope increase), lateral (same level, new domain/industry), step_down (intentional reset to hands-on work), or reset (career pivot). Note scope changes in budget, team, complexity. A step_down can still be a STRONG_FIT if the strategic rationale is clear.
- compensation_analysis: If salary_range is posted, estimate whether it aligns with the seniority level. Flag if comp suggests a different level than the title. Use "unknown" if no data.
- personalization_potential: Score 0-100 based on how many of the role's key requirements the candidate can prove with direct evidence. 80+ = highly personalizable resume. Include the top 2-3 evidence matches and any critical gaps.
- interview_prep_stories: For the top 2-3 implicit challenges in this role, map to the candidate's STAR-ready evidence. Focus on stories with quantified results. These help the candidate prepare before applying.`;

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 8192,
      system: 'You are a career strategist evaluating job fit for senior executives. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: scoringPrompt }],
    });

    let scoredJobs: Array<{
      title: string;
      company: string;
      fit_score: number;
      positioning_alignment: string;
      career_trajectory_fit: string;
      seniority_fit: string;
      fit_reasoning: string;
      evaluation?: JobEvaluation;
      career_level_strategy?: RankedMatch['career_level_strategy'];
      compensation_analysis?: RankedMatch['compensation_analysis'];
      personalization_potential?: RankedMatch['personalization_potential'];
      interview_prep_stories?: RankedMatch['interview_prep_stories'];
    }> = [];

    try {
      const parsed = JSON.parse(repairJSON(response.text) ?? response.text);
      scoredJobs = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // Fallback — assign neutral scores
      scoredJobs = jobs.map((j) => ({
        title: j.title,
        company: j.company,
        fit_score: 50,
        positioning_alignment: 'Unable to assess — positioning context needed',
        career_trajectory_fit: 'Unable to assess',
        seniority_fit: 'match',
        fit_reasoning: 'Scoring failed — manual review recommended',
      }));
    }

    ctx.scratchpad.scored_jobs = scoredJobs;

    const avgScore = Math.round(
      scoredJobs.reduce((s, j) => s + (j.fit_score ?? 50), 0) / (scoredJobs.length || 1),
    );

    ctx.emit({
      type: 'transparency',
      stage: 'ranking',
      message: `Fit scoring complete — ${scoredJobs.length} jobs scored, average fit: ${avgScore}`,
    });

    return JSON.stringify({
      success: true,
      jobs_scored: scoredJobs.length,
      average_fit_score: avgScore,
      top_scorer: [...scoredJobs].sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0))[0]?.company ?? 'N/A',
    });
  },
};

// ─── Tool: rank_and_narrate ─────────────────────────────────────────

const rankAndNarrateTool: JobFinderTool = {
  name: 'rank_and_narrate',
  description:
    'Order all jobs by fit score and write a personalized "why this matches" narrative for each top result. ' +
    'Call after score_job_fit. Stores the final ranked list in scratchpad as ranked_results.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      max_results: {
        type: 'number',
        description: 'Maximum number of ranked results to include. Default: 10.',
      },
    },
    required: [],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const jobs = state.search_results ?? [];
    const scoredJobs = (ctx.scratchpad.scored_jobs as Array<{
      title: string;
      company: string;
      fit_score: number;
      positioning_alignment: string;
      career_trajectory_fit: string;
      seniority_fit: string;
      fit_reasoning: string;
      evaluation?: JobEvaluation;
    }> | undefined) ?? [];

    if (scoredJobs.length === 0) {
      return JSON.stringify({ success: false, error: 'No scored jobs found — call score_job_fit first.' });
    }

    const maxResults = typeof input.max_results === 'number' ? Math.min(input.max_results, 50) : 10;

    ctx.emit({
      type: 'transparency',
      stage: 'ranking',
      message: `Writing personalized narratives for top ${maxResults} matches...`,
    });

    // Sort by fit_score descending
    const sortedScores = [...scoredJobs].sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0));
    const topScores = sortedScores.slice(0, maxResults);

    // Merge score data with discovery data (title+company match)
    const careerNarrative = hasMeaningfulSharedValue(state.shared_context?.careerNarrative)
      ? state.shared_context?.careerNarrative
      : state.platform_context?.career_narrative;
    const industryResearch = hasMeaningfulSharedValue(state.shared_context?.industryContext)
      ? state.shared_context?.industryContext
      : state.platform_context?.industry_research;

    const narrativeContextSections = [
      ...renderCareerNarrativeSection({
        heading: 'CANDIDATE CAREER NARRATIVE',
        sharedNarrative: state.shared_context?.careerNarrative,
        legacyNarrative: careerNarrative,
      }),
      ...renderIndustryContextSection({
        heading: 'INDUSTRY RESEARCH',
        sharedIndustry: state.shared_context?.industryContext,
        legacyIndustry: industryResearch,
      }),
    ];
    const narrativeContext = narrativeContextSections.length > 0
      ? `${narrativeContextSections.join('\n')}\n`
      : '';

    const narrativePrompt = `Write compelling, specific "why this matches" narratives for these job opportunities.

${narrativeContext}JOBS (ordered by fit score):
${topScores.map((j, i) => `${i + 1}. "${j.title}" at ${j.company}
   Fit Score: ${j.fit_score}/100
   Positioning Alignment: ${j.positioning_alignment}
   Career Trajectory: ${j.career_trajectory_fit}
   Seniority: ${j.seniority_fit}`).join('\n\n')}

Return a JSON array — same order, one object per job:
[
  {
    "title": "exact title",
    "company": "exact company",
    "fit_narrative": "2-3 sentences on why this specific role is a strong match for THIS candidate. Reference their actual experience, positioning, and the role's requirements. Be specific — no generic language."
  }
]

Rules:
- Narratives must be specific and personalized — not generic templates
- Reference actual positioning strategy elements when available
- If fit_score < 60, still write an honest narrative that acknowledges the gaps
- Never fabricate requirements or qualifications not in context`;

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 4096,
      system: 'You are a career strategist writing personalized job match narratives for executives. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: narrativePrompt }],
    });

    let narratives: Array<{ title: string; company: string; fit_narrative: string }> = [];
    try {
      const parsed = JSON.parse(repairJSON(response.text) ?? response.text);
      narratives = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      narratives = topScores.map((j) => ({
        title: j.title,
        company: j.company,
        fit_narrative: j.fit_reasoning ?? 'See fit analysis for details.',
      }));
    }

    // Build final RankedMatch objects
    const rankedResults: RankedMatch[] = topScores.map((scored) => {
      const discoveredJob = jobs.find(
        (j) => j.title.toLowerCase() === scored.title.toLowerCase() &&
              j.company.toLowerCase() === scored.company.toLowerCase(),
      ) ?? { title: scored.title, company: scored.company, source: 'career_page' as const };

      const narrative = narratives.find(
        (n) => n.title.toLowerCase() === scored.title.toLowerCase() &&
               n.company.toLowerCase() === scored.company.toLowerCase(),
      );

      return {
        ...discoveredJob,
        fit_score: scored.fit_score ?? 50,
        fit_narrative: narrative?.fit_narrative ?? scored.fit_reasoning ?? '',
        positioning_alignment: scored.positioning_alignment ?? '',
        career_trajectory_fit: scored.career_trajectory_fit ?? '',
        seniority_fit: scored.seniority_fit ?? 'match',
        ...(scored.evaluation !== undefined ? { evaluation: scored.evaluation } : {}),
        ...((scored as Record<string, unknown>).career_level_strategy !== undefined ? { career_level_strategy: (scored as Record<string, unknown>).career_level_strategy as RankedMatch['career_level_strategy'] } : {}),
        ...((scored as Record<string, unknown>).compensation_analysis !== undefined ? { compensation_analysis: (scored as Record<string, unknown>).compensation_analysis as RankedMatch['compensation_analysis'] } : {}),
        ...((scored as Record<string, unknown>).personalization_potential !== undefined ? { personalization_potential: (scored as Record<string, unknown>).personalization_potential as RankedMatch['personalization_potential'] } : {}),
        ...((scored as Record<string, unknown>).interview_prep_stories !== undefined ? { interview_prep_stories: (scored as Record<string, unknown>).interview_prep_stories as RankedMatch['interview_prep_stories'] } : {}),
      };
    });

    ctx.scratchpad.ranked_results = rankedResults;

    // Emit match_found events for top results
    for (const match of rankedResults.slice(0, 5)) {
      ctx.emit({
        type: 'match_found',
        title: match.title,
        company: match.company,
        source: match.source,
        match_score: match.fit_score,
      });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'ranking',
      message: `Ranking complete — top match: "${rankedResults[0]?.title ?? 'N/A'}" at ${rankedResults[0]?.company ?? 'N/A'} (${rankedResults[0]?.fit_score ?? 0}/100)`,
    });

    return JSON.stringify({
      success: true,
      ranked_count: rankedResults.length,
      top_match: rankedResults[0]
        ? { title: rankedResults[0].title, company: rankedResults[0].company, fit_score: rankedResults[0].fit_score }
        : null,
    });
  },
};

// ─── Tool: present_results ──────────────────────────────────────────

const presentResultsTool: JobFinderTool = {
  name: 'present_results',
  description:
    'Emit the results_ready event and update pipeline state with ranked_results from scratchpad. ' +
    'Call this as the final step before the review gate.',
  model_tier: 'light',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const rankedResults = (ctx.scratchpad.ranked_results as RankedMatch[] | undefined) ?? [];

    if (rankedResults.length === 0) {
      return JSON.stringify({ success: false, error: 'No ranked results to present — call rank_and_narrate first.' });
    }

    // Persist to pipeline state
    ctx.updateState({ ranked_results: rankedResults });

    const topScore = rankedResults[0]?.fit_score ?? 0;

    ctx.emit({
      type: 'results_ready',
      total_matches: rankedResults.length,
      top_fit_score: topScore,
      matches: rankedResults,
    });

    ctx.emit({
      type: 'transparency',
      stage: 'ranking',
      message: `${rankedResults.length} ranked matches ready for your review. Top fit: ${topScore}/100.`,
    });

    return JSON.stringify({
      success: true,
      results_presented: rankedResults.length,
      top_fit_score: topScore,
    });
  },
};

// ─── Exports ────────────────────────────────────────────────────────

export const rankerTools: JobFinderTool[] = [
  scoreJobFitTool,
  rankAndNarrateTool,
  presentResultsTool,
  createEmitTransparency<JobFinderState, JobFinderSSEEvent>({ prefix: 'Ranker: ' }),
];
