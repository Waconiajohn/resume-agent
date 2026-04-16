/**
 * Resume v2 Orchestrator
 *
 * Thin coordinator. Makes ZERO content decisions.
 * Sequences the 10 agents, passes outputs between them,
 * emits SSE events to the frontend.
 *
 * Flow:
 *   [1, 2] parallel → 3 → 4 → 5 → 6 → [7, 8, 9] parallel → 10
 *
 * Each agent's output streams to the frontend as it completes.
 * Output accumulates — nothing replaces.
 */

import logger from '../../lib/logger.js';
import { MODEL_LIGHT, MODEL_MID, MODEL_PRIMARY, MODEL_PRICING } from '../../lib/model-constants.js';
import { setUsageTrackingContext, startUsageTracking, stopUsageTracking } from '../../lib/llm-provider.js';
import { getRequirementCoachingPolicySnapshot } from '../../contracts/requirement-coaching-policy.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import { runJobIntelligenceWithConfidence } from './job-intelligence/agent.js';
import { runCandidateIntelligence } from './candidate-intelligence/agent.js';
import { runBenchmarkCandidate } from './benchmark-candidate/agent.js';
import { runGapAnalysis } from './gap-analysis/agent.js';
import { runNarrativeStrategy } from './narrative-strategy/agent.js';
import { runResumeWriter } from './resume-writer/agent.js';
import { runTruthVerification } from './truth-verification/agent.js';
import { runATSOptimization } from './ats-optimization/agent.js';
import { runExecutiveTone } from './executive-tone/agent.js';
import { runAssembly } from './assembly/agent.js';
import type {
  V2PipelineState,
  V2PipelineSSEEvent,
  PreScores,
  GapCoachingCard,
  GapAnalysisOutput,
  ApprovedStrategy,
  GapPlacementTarget,
  GapCoachingResponse,
  FeedbackMetadata,
} from './types.js';
import type { CareerProfileV2 } from '../../lib/career-profile-context.js';

const PRE_SCORE_KEYWORD_WEIGHT = 0.35;
const PRE_SCORE_COVERAGE_WEIGHT = 0.65;

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function computeOverallFitScore(keywordMatchScore: number, coverageScore?: number): number {
  if (typeof coverageScore !== 'number') {
    return clampPercent(keywordMatchScore);
  }

  return clampPercent(
    (keywordMatchScore * PRE_SCORE_KEYWORD_WEIGHT) +
    (coverageScore * PRE_SCORE_COVERAGE_WEIGHT),
  );
}

function normalizePreScores(preScores: PreScores): PreScores {
  const keywordMatchScore = clampPercent(preScores.keyword_match_score ?? preScores.ats_match);
  const coverageScore = typeof preScores.job_requirement_coverage_score === 'number'
    ? clampPercent(preScores.job_requirement_coverage_score)
    : undefined;

  return {
    ...preScores,
    ats_match: keywordMatchScore,
    keywords_found: Array.isArray(preScores.keywords_found) ? preScores.keywords_found : [],
    keywords_missing: Array.isArray(preScores.keywords_missing) ? preScores.keywords_missing : [],
    keyword_match_score: keywordMatchScore,
    job_requirement_coverage_score: coverageScore,
    overall_fit_score: clampPercent(
      preScores.overall_fit_score ?? computeOverallFitScore(keywordMatchScore, coverageScore),
    ),
  };
}

function buildKeywordPreScores(jobIntelKeywords: string[], resumeText: string): PreScores {
  const normalizedKeywords = jobIntelKeywords.map((keyword) => keyword.toLowerCase());
  const resumeLower = resumeText.toLowerCase();
  const found = normalizedKeywords.filter((keyword) => resumeLower.includes(keyword));
  const missing = normalizedKeywords.filter((keyword) => !resumeLower.includes(keyword));
  const keywordMatchScore = normalizedKeywords.length > 0
    ? clampPercent((found.length / normalizedKeywords.length) * 100)
    : 0;

  return normalizePreScores({
    ats_match: keywordMatchScore,
    keywords_found: found,
    keywords_missing: missing,
    keyword_match_score: keywordMatchScore,
    overall_fit_score: keywordMatchScore,
  });
}

function enrichPreScoresWithGapAnalysis(preScores: PreScores, gapAnalysis: GapAnalysisOutput): PreScores {
  const requirementCoverageScore = gapAnalysis.score_breakdown?.job_description.coverage_score;
  if (typeof requirementCoverageScore !== 'number') {
    return normalizePreScores(preScores);
  }

  return normalizePreScores({
    ...preScores,
    job_requirement_coverage_score: requirementCoverageScore,
    overall_fit_score: undefined,
  });
}

function preScoresEqual(a: PreScores | undefined, b: PreScores): boolean {
  if (!a) {
    return false;
  }

  return a.ats_match === b.ats_match
    && a.keyword_match_score === b.keyword_match_score
    && a.job_requirement_coverage_score === b.job_requirement_coverage_score
    && a.overall_fit_score === b.overall_fit_score
    && JSON.stringify(a.keywords_found) === JSON.stringify(b.keywords_found)
    && JSON.stringify(a.keywords_missing) === JSON.stringify(b.keywords_missing);
}

export type EmitFn = (event: V2PipelineSSEEvent) => void;

export interface RunPipelineOptions {
  resume_text: string;
  job_description: string;
  session_id: string;
  user_id: string;
  emit: EmitFn;
  signal?: AbortSignal;
  career_profile?: CareerProfileV2;
  /** Pre-approved strategies (from "Add Context" re-run) */
  approved_strategies?: ApprovedStrategy[];
  /** Additional context from user */
  user_context?: string;
  /** User responses to gap coaching cards (from gate) */
  gap_coaching_responses?: Array<{
    requirement: string;
    action: 'approve' | 'context' | 'skip';
    user_context?: string;
    target_section?: GapPlacementTarget;
    target_company?: string;
  }>;
  /** Pre-computed baseline scores (passed on re-run) */
  pre_scores?: PreScores;
  /** Pre-loaded interview evidence lines from master resume (avoids extra DB query) */
  interview_evidence_lines?: string[];
}

/**
 * Normalize resume text that may have lost line breaks from PDF paste.
 * Adds line breaks before bullet markers, role headers, and company names.
 */
function normalizeResumeText(text: string): string {
  if (!text) return text;
  // If the text already has reasonable line structure, skip normalization
  const lineCount = (text.match(/\n/g) || []).length;
  if (lineCount > 10) return text;

  let normalized = text;
  // Add newlines before bullet markers (●, •, ■, ▪, ◆)
  normalized = normalized.replace(/([^\n])\s*(●|•|■|▪|◆)/g, '$1\n$2');
  // Add newlines before date patterns like "Jan 2024" or "2024 –" that signal new roles
  normalized = normalized.replace(/([.!?])\s+((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})/g, '$1\n\n$2');
  // Add newlines before ALL-CAPS company names (3+ consecutive uppercase words)
  normalized = normalized.replace(/([.!?\n])\s*([A-Z][A-Z\s&]+(?:,\s*(?:Inc|LLC|Corp|Ltd|Co))?)(\s*[|,])/g, '$1\n\n$2$3');
  // Collapse runs of 3+ spaces into newlines (common in PDF extraction)
  normalized = normalized.replace(/\s{3,}/g, '\n');
  // Remove excessive blank lines
  normalized = normalized.replace(/\n{4,}/g, '\n\n\n');

  return normalized.trim();
}

/**
 * Load interview-sourced evidence from the user's master resume (if one exists).
 * Returns enriched resume text with evidence appended, or the original text if
 * no master resume or no interview evidence is found.
 *
 * When `preloadedLines` is provided (pre-fetched at the route level in parallel
 * with other setup work), the DB query is skipped entirely.
 */
async function enrichResumeWithMasterEvidence(
  userId: string,
  resumeText: string,
  preloadedLines?: string[],
): Promise<string> {
  try {
    let evidenceLines: string[];

    if (preloadedLines !== undefined) {
      // Use caller-supplied evidence — no DB query needed
      evidenceLines = preloadedLines;
    } else {
      // Fallback: load from DB (backward-compatible path)
      const { data: resume } = await supabaseAdmin
        .from('master_resumes')
        .select('evidence_items, experience')
        .eq('user_id', userId)
        .eq('is_default', true)
        .limit(1)
        .maybeSingle();

      if (!resume) return resumeText;

      const evidenceItems = Array.isArray(resume.evidence_items) ? resume.evidence_items : [];
      const interviewEvidence = evidenceItems.filter(
        (e: Record<string, unknown>) => e.source === 'interview' && typeof e.text === 'string',
      );

      if (interviewEvidence.length === 0) return resumeText;

      // Cap evidence to avoid runaway context size
      const MAX_EVIDENCE_ITEMS = 20;
      const MAX_EVIDENCE_CHARS = 4000;
      let cappedEvidence = interviewEvidence.slice(0, MAX_EVIDENCE_ITEMS);
      let totalChars = 0;
      cappedEvidence = cappedEvidence.filter((item) => {
        const text = typeof item.text === 'string' ? item.text : '';
        totalChars += text.length;
        return totalChars <= MAX_EVIDENCE_CHARS;
      });

      if (cappedEvidence.length < interviewEvidence.length) {
        logger.info(
          { userId, total: interviewEvidence.length, used: cappedEvidence.length },
          'Master resume evidence capped for context window',
        );
      }

      evidenceLines = cappedEvidence.map((item) => {
        const category = typeof item.category === 'string' ? item.category : 'interview_response';
        return `[${category}]: ${item.text as string}`;
      });
    }

    if (evidenceLines.length === 0) return resumeText;

    const lines = [
      '',
      '---',
      'INTERNAL REFERENCE ONLY — DO NOT INCLUDE IN RESUME OUTPUT',
      'The following evidence was provided by the candidate during their career profile interview.',
      'Use this evidence to strengthen experience bullet points. DO NOT copy this section into the resume.',
      'This section must NEVER appear in any resume section, summary, or output.',
      '',
      ...evidenceLines.flatMap((line) => [line, '']),
    ];

    return resumeText + '\n' + lines.join('\n');
  } catch (err) {
    logger.warn(
      { userId, error: err instanceof Error ? err.message : String(err) },
      'Failed to load master resume evidence — proceeding with original resume text',
    );
    return resumeText;
  }
}

export async function runV2Pipeline(options: RunPipelineOptions): Promise<V2PipelineState> {
  const { emit, signal } = options;
  const usageAcc = startUsageTracking(options.session_id, options.user_id);
  setUsageTrackingContext(options.session_id);
  const state: V2PipelineState = {
    session_id: options.session_id,
    user_id: options.user_id,
    current_stage: 'intake',
    resume_text: options.resume_text,
    job_description: options.job_description,
    user_context: options.user_context,
    career_profile: options.career_profile,
    approved_strategies: options.approved_strategies ?? [],
    token_usage: { input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0 },
  };

  const startTime = Date.now();

  try {
    // ─── Stage 1: Analysis (Agents 1 & 2 in parallel, then Agent 3) ──
    signal?.throwIfAborted();
    state.current_stage = 'analysis';
    emit({ type: 'stage_start', stage: 'analysis', message: "Analyzing the job and your background..." });

    const analysisStart = Date.now();

    // Normalize resume text — PDF pastes often strip all line breaks, producing a wall
    // of text that the parsing agents can't structure. Add breaks before bullets and roles.
    const normalizedResumeText = normalizeResumeText(options.resume_text);

    // Enrich resume text with interview evidence from master resume (if available).
    // When the route pre-loads evidence in parallel, options.interview_evidence_lines
    // is provided and the DB query inside the function is skipped.
    const enrichedResumeText = await enrichResumeWithMasterEvidence(
      options.user_id,
      normalizedResumeText,
      options.interview_evidence_lines,
    );

    const [jobIntelResult, candidateIntel] = await Promise.all([
      runJobIntelligenceWithConfidence({ job_description: options.job_description }, signal),
      runCandidateIntelligence({ resume_text: normalizedResumeText }, signal),
    ]);

    const jobIntel = jobIntelResult.output;
    const jiConfidence = jobIntelResult.confidence;

    // Log confidence report for observability
    const lowConfidenceFields = Object.entries(jiConfidence)
      .filter(([, f]) => f.confidence === 'low')
      .map(([key]) => key);
    if (lowConfidenceFields.length > 0) {
      logger.warn(
        { lowConfidenceFields, sessionId: options.session_id },
        'Job Intelligence: low-confidence fields after extraction (may affect downstream quality)',
      );
      emit({
        type: 'transparency',
        stage: 'analysis',
        message: `Job description format is unusual — some fields may have reduced accuracy: ${lowConfidenceFields.join(', ')}.`,
      });
    } else {
      logger.info({ sessionId: options.session_id }, 'Job Intelligence: all tracked fields high/medium confidence');
    }

    state.job_intelligence = jobIntel;
    state.candidate_intelligence = candidateIntel;
    state.role_profile = jobIntel.role_profile;

    emit({ type: 'job_intelligence', data: jobIntel });
    emit({ type: 'candidate_intelligence', data: candidateIntel });

    // ─── Pre-scores: baseline ATS match on original resume ─────────
    if (!options.pre_scores) {
      const preScores = buildKeywordPreScores(jobIntel.language_keywords, options.resume_text);
      state.pre_scores = preScores;
      emit({ type: 'pre_scores', data: preScores });
    } else {
      state.pre_scores = normalizePreScores(options.pre_scores);
    }

    // Agent 3 depends on Agents 1 and 2
    const benchmark = await runBenchmarkCandidate({ job_intelligence: jobIntel, candidate: candidateIntel }, signal, { session_id: options.session_id });
    state.benchmark_candidate = benchmark;

    emit({ type: 'benchmark_candidate', data: benchmark });
    emit({ type: 'stage_complete', stage: 'analysis', message: 'Analysis complete', duration_ms: Date.now() - analysisStart });

    // ─── Stage 2: Strategy (Agent 4 — requirement workbench) ─────────
    signal?.throwIfAborted();
    state.current_stage = 'strategy';
    emit({ type: 'stage_start', stage: 'strategy', message: "Building your positioning strategy..." });

    const strategyStart = Date.now();

    const gapAnalysis = await runGapAnalysis({
      candidate: candidateIntel,
      benchmark,
      job_intelligence: jobIntel,
      career_profile: options.career_profile,
      user_context: options.user_context,
    }, signal);

    state.gap_analysis = gapAnalysis;
    state.requirement_work_items = gapAnalysis.requirement_work_items;
    emit({ type: 'gap_analysis', data: gapAnalysis });
    if (gapAnalysis.requirement_work_items) {
      emit({ type: 'requirement_work_items', data: gapAnalysis.requirement_work_items });
    }

    if (!options.pre_scores && state.pre_scores) {
      const enrichedPreScores = enrichPreScoresWithGapAnalysis(state.pre_scores, gapAnalysis);
      if (!preScoresEqual(state.pre_scores, enrichedPreScores)) {
        state.pre_scores = enrichedPreScores;
        emit({ type: 'pre_scores', data: enrichedPreScores });
      }
    }

    emit({ type: 'stage_complete', stage: 'strategy', message: 'Requirement map complete', duration_ms: Date.now() - strategyStart });

    // ─── Stage 3: Clarification (questions + positioning lock) ───────
    signal?.throwIfAborted();
    state.current_stage = 'clarification';
    emit({ type: 'stage_start', stage: 'clarification', message: "Surfacing the missing proof and best follow-up questions..." });

    const clarificationStart = Date.now();

    // Always emit cards when strategies are present — including on "Add Context" re-runs.
    // The previously_approved flag lets the frontend indicate which strategies were
    // already approved so the user knows they can confirm quickly.
    if (gapAnalysis.pending_strategies.length > 0) {
      const coachingCards: GapCoachingCard[] = gapAnalysis.pending_strategies.map(ps => {
        const req = gapAnalysis.requirements.find(r => r.requirement === ps.requirement);
        const workItem = gapAnalysis.requirement_work_items?.find((item) => item.requirement === ps.requirement);
        const previouslyApproved = options.gap_coaching_responses?.find(
          r => r.requirement === ps.requirement && r.action === 'approve',
        );
        return {
          requirement: ps.requirement,
          work_item_id: workItem?.id,
          importance: req?.importance ?? 'important',
          classification: req?.classification ?? 'partial',
          ai_reasoning: ps.strategy.ai_reasoning ?? `I found adjacent experience that could work for "${ps.requirement}": ${ps.strategy.real_experience}`,
          proposed_strategy: ps.strategy.positioning,
          inferred_metric: ps.strategy.inferred_metric,
          inference_rationale: ps.strategy.inference_rationale,
          evidence_found: req?.evidence ?? [],
          previously_approved: !!previouslyApproved,
          interview_questions: ps.strategy.interview_questions,
          source_evidence: req?.source_evidence,
          source: req?.source,
          alternative_bullets: ps.strategy.alternative_bullets,
          coaching_policy: ps.strategy.coaching_policy ?? getRequirementCoachingPolicySnapshot(ps.requirement),
        };
      });
      emit({ type: 'gap_coaching', data: coachingCards });
    }

    // ─── Clarification Gate ───────────────────────────────────────────
    // Determine the effective approved strategies for downstream agents.
    //
    // Four cases:
    // 1. "Add Context" re-run — caller passes previously approved strategies via options.approved_strategies.
    // 2. Gap coaching responses supplied at call time (legacy re-run path).
    // 3. Non-strong gaps present AND no pre-supplied responses → emit informational coaching questions.
    // 4. No gaps → implicit approval of all pending strategies.
    let allApproved: ApprovedStrategy[];

    if (state.approved_strategies.length > 0) {
      // Case 1: Re-run with pre-approved strategies
      allApproved = state.approved_strategies;
    } else if (options.gap_coaching_responses && options.gap_coaching_responses.length > 0) {
      // Case 2: Responses supplied at call time — apply them directly
      state.gap_coaching_responses = options.gap_coaching_responses;
      allApproved = buildApprovedStrategies(options.gap_coaching_responses, gapAnalysis);
    } else if (gapAnalysis.pending_strategies.length > 0) {
      // Case 3: Non-strong gaps present — wait for user responses.
      // The gap_coaching cards were already emitted above. Now we pause
      // the pipeline and wait for the user to respond via POST /respond-gaps.
      const importanceOrder: Record<string, number> = {
        must_have: 0,
        critical: 0,
        important: 1,
        nice_to_have: 2,
        supporting: 2,
      };

      const rankedGaps = gapAnalysis.pending_strategies
        .map(ps => {
          const req = gapAnalysis.requirements.find(r => r.requirement === ps.requirement);
          return { ps, req };
        })
        .filter(({ req }) => req && req.classification !== 'strong')
        .sort((a, b) => {
          const aOrder = importanceOrder[a.req?.importance ?? 'supporting'] ?? 2;
          const bOrder = importanceOrder[b.req?.importance ?? 'supporting'] ?? 2;
          return aOrder - bOrder;
        })
        .slice(0, 8);

      if (rankedGaps.length > 0) {
        emit({
          type: 'gap_questions',
          data: {
            questions: rankedGaps.map(({ ps, req }) => ({
              id: ps.requirement,
              work_item_id: gapAnalysis.requirement_work_items?.find((item) => item.requirement === ps.requirement)?.id,
              requirement: ps.requirement,
              importance: (req?.importance === 'must_have' ? 'critical' : req?.importance === 'nice_to_have' ? 'supporting' : 'important'),
              classification: (req?.classification ?? 'partial') as 'partial' | 'missing',
              question: ps.strategy.interview_questions?.[0]?.question ?? `Can you provide evidence for: ${ps.requirement}?`,
              context: ps.strategy.ai_reasoning ?? `Your background may have relevant experience for "${ps.requirement}".`,
              currentEvidence: req?.evidence ?? [],
              informational_only: false,
            })),
          },
        });
      }

      // Auto-approve all pending strategies — gap analysis is informational, not blocking
      allApproved = gapAnalysis.pending_strategies.map(ps => ({
        requirement: ps.requirement,
        strategy: ps.strategy,
      }));
    } else {
      // Case 4: No pending strategies
      allApproved = [];
    }

    const narrative = await runNarrativeStrategy({
      gap_analysis: gapAnalysis,
      candidate: candidateIntel,
      job_intelligence: jobIntel,
      career_profile: options.career_profile,
      approved_strategies: allApproved,
      benchmark_differentiators: benchmark.differentiators,
      benchmark_positioning_frame: benchmark.positioning_frame,
      benchmark_hiring_manager_objections: benchmark.hiring_manager_objections,
    }, signal);

    state.narrative_strategy = narrative;
    emit({ type: 'narrative_strategy', data: narrative });
    emit({ type: 'stage_complete', stage: 'clarification', message: 'Clarification pass complete', duration_ms: Date.now() - clarificationStart });

    // ─── Stage 4: Writing (Agent 6) ──────────────────────────────────
    signal?.throwIfAborted();
    state.current_stage = 'writing';
    emit({ type: 'stage_start', stage: 'writing', message: "Writing your resume..." });

    const writingStart = Date.now();

    const draft = await runResumeWriter({
      job_intelligence: jobIntel,
      candidate: candidateIntel,
      benchmark,
      gap_analysis: gapAnalysis,
      narrative,
      career_profile: options.career_profile,
      approved_strategies: allApproved,
      technologies: candidateIntel.technologies,
      industry_depth: candidateIntel.industry_depth,
      operational_scale: candidateIntel.operational_scale,
    }, signal);

    state.resume_draft = draft;
    emit({ type: 'resume_draft', data: draft });
    emit({ type: 'stage_complete', stage: 'writing', message: 'Resume draft complete', duration_ms: Date.now() - writingStart });

    // ─── Stage 4: Verification (Agents 7, 8, 9 in parallel) ─────────
    signal?.throwIfAborted();
    state.current_stage = 'verification';
    emit({ type: 'stage_start', stage: 'verification', message: "Verifying accuracy, ATS compliance, and tone..." });

    const verificationStart = Date.now();

    const [truth, ats, tone] = await Promise.all([
      runTruthVerification({
        draft,
        original_resume: enrichedResumeText,
        candidate: candidateIntel,
        benchmark_direct_matches: benchmark.direct_matches,
      }, signal),
      runATSOptimization({
        draft,
        job_intelligence: jobIntel,
      }, signal),
      runExecutiveTone({ draft }, signal),
    ]);

    state.truth_verification = truth;
    state.ats_optimization = ats;
    state.executive_tone = tone;

    emit({ type: 'verification_complete', data: { truth, ats, tone } });
    emit({ type: 'stage_complete', stage: 'verification', message: 'Verification complete', duration_ms: Date.now() - verificationStart });

    // ─── Stage 5: Assembly (Agent 10 — deterministic) ────────────────
    signal?.throwIfAborted();
    state.current_stage = 'assembly';
    emit({ type: 'stage_start', stage: 'assembly', message: "Assembling final resume..." });

    const assemblyStart = Date.now();

    const assembled = runAssembly({
      draft,
      truth_verification: truth,
      ats_optimization: ats,
      executive_tone: tone,
      gap_analysis: gapAnalysis,
      pre_scores: state.pre_scores,
      job_intelligence: jobIntel,
      candidate_raw_text: options.resume_text,
      approved_strategies: allApproved,
    });
    state.final_resume = assembled;

    emit({ type: 'assembly_complete', data: assembled });

    if (assembled.hiring_manager_scan) {
      emit({ type: 'hiring_manager_scan', data: assembled.hiring_manager_scan });
    }

    emit({ type: 'stage_complete', stage: 'assembly', message: 'Assembly complete', duration_ms: Date.now() - assemblyStart });

    // ─── Complete ────────────────────────────────────────────────────

    // Populate feedback loop instrumentation metadata before marking complete.
    // Downstream consumers (route, Apply flow) attach this to job_matches.metadata
    // so future queries can correlate resume framings with callbacks.
    const feedbackMetadata: FeedbackMetadata = {
      resume_session_id: options.session_id,
    };
    if (jobIntel.role_profile) {
      feedbackMetadata.role_profile = jobIntel.role_profile;
    }
    if (benchmark.positioning_frame) {
      feedbackMetadata.positioning_frame = benchmark.positioning_frame;
    }
    if (Array.isArray(benchmark.hiring_manager_objections) && benchmark.hiring_manager_objections.length > 0) {
      feedbackMetadata.hiring_manager_objections = benchmark.hiring_manager_objections.map(
        (o) => o.objection,
      );
    }
    state.feedback_metadata = feedbackMetadata;

    state.current_stage = 'complete';
    state.token_usage = {
      input_tokens: usageAcc.input_tokens,
      output_tokens: usageAcc.output_tokens,
      estimated_cost_usd: calculateEstimatedCost(usageAcc),
    };
    emit({ type: 'pipeline_complete', session_id: options.session_id });

    const totalMs = Date.now() - startTime;
    logger.info({
      session_id: options.session_id,
      duration_ms: totalMs,
      ats_score: assembled.scores.ats_match,
      truth_score: assembled.scores.truth,
      tone_score: assembled.scores.tone,
    }, 'Resume v2 pipeline complete');

    return state;

  } catch (error) {
    state.token_usage = {
      input_tokens: usageAcc.input_tokens,
      output_tokens: usageAcc.output_tokens,
      estimated_cost_usd: calculateEstimatedCost(usageAcc),
    };
    const stage = state.current_stage;
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ session_id: options.session_id, stage, error: message }, 'Resume v2 pipeline error');
    emit({ type: 'pipeline_error', stage, error: message });
    throw error;
  } finally {
    stopUsageTracking(options.session_id);
  }
}

function buildApprovedStrategies(
  responses: Array<{
    requirement: string;
    action: 'approve' | 'context' | 'skip';
    user_context?: string;
    target_section?: GapPlacementTarget;
    target_company?: string;
  }>,
  gapAnalysis: GapAnalysisOutput,
): ApprovedStrategy[] {
  const approved: ApprovedStrategy[] = [];
  for (const response of responses) {
    const ps = gapAnalysis.pending_strategies.find(s => s.requirement === response.requirement);
    if (!ps) continue;

    if (response.action === 'approve') {
      approved.push({
        ...ps,
        strategy: {
          ...ps.strategy,
          // If the user selected an alternative bullet or wrote their own answer, capture it
          // as verified evidence. This is the user's own words and carries the highest trust
          // level for the resume writer. Do NOT substitute it directly into positioning —
          // the writer decides how to incorporate it.
          ...(response.user_context
            ? { verified_user_evidence: response.user_context }
            : {}),
        },
        target_section: response.target_section,
        target_company: response.target_company,
      });
    } else if (response.action === 'context' && response.user_context) {
      approved.push({
        requirement: ps.requirement,
        strategy: {
          ...ps.strategy,
          // Preserve original real_experience intact. Store the user's answer separately
          // so the writer can distinguish what was on the resume vs what the user confirmed.
          verified_user_evidence: response.user_context,
        },
        target_section: response.target_section,
        target_company: response.target_company,
      });
    }
    // 'skip' — excluded from approved list
  }
  return approved;
}

function calculateEstimatedCost(usage: { input_tokens: number; output_tokens: number }): number {
  const lightPrice = MODEL_PRICING[MODEL_LIGHT] ?? { input: 0, output: 0 };
  const midPrice = MODEL_PRICING[MODEL_MID] ?? { input: 0, output: 0 };
  const primaryPrice = MODEL_PRICING[MODEL_PRIMARY] ?? { input: 0, output: 0 };

  const blendedInput = lightPrice.input * 0.5 + midPrice.input * 0.3 + primaryPrice.input * 0.2;
  const blendedOutput = lightPrice.output * 0.5 + midPrice.output * 0.3 + primaryPrice.output * 0.2;

  return Number(
    (
      (usage.input_tokens / 1_000_000) * blendedInput +
      (usage.output_tokens / 1_000_000) * blendedOutput
    ).toFixed(4),
  );
}
