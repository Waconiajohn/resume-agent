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
import { runJobIntelligence } from './job-intelligence/agent.js';
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
  GapStrategy,
  PreScores,
  GapCoachingCard,
  GapAnalysisOutput,
} from './types.js';
import type { CareerProfileV2 } from '../../lib/career-profile-context.js';

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
  approved_strategies?: Array<{ requirement: string; strategy: GapStrategy }>;
  /** Additional context from user */
  user_context?: string;
  /** User responses to gap coaching cards (from gate) */
  gap_coaching_responses?: Array<{ requirement: string; action: 'approve' | 'context' | 'skip'; user_context?: string }>;
  /** Pre-computed baseline scores (passed on re-run) */
  pre_scores?: PreScores;
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

    const [jobIntel, candidateIntel] = await Promise.all([
      runJobIntelligence({ job_description: options.job_description }, signal),
      runCandidateIntelligence({ resume_text: options.resume_text }, signal),
    ]);

    state.job_intelligence = jobIntel;
    state.candidate_intelligence = candidateIntel;

    emit({ type: 'job_intelligence', data: jobIntel });
    emit({ type: 'candidate_intelligence', data: candidateIntel });

    // ─── Pre-scores: baseline ATS match on original resume ─────────
    if (!options.pre_scores) {
      const jdKeywords = jobIntel.language_keywords.map(k => k.toLowerCase());
      const resumeLower = options.resume_text.toLowerCase();
      const found = jdKeywords.filter(k => resumeLower.includes(k));
      const missing = jdKeywords.filter(k => !resumeLower.includes(k));
      const preScores: PreScores = {
        ats_match: jdKeywords.length > 0 ? Math.round((found.length / jdKeywords.length) * 100) : 0,
        keywords_found: found,
        keywords_missing: missing,
      };
      state.pre_scores = preScores;
      emit({ type: 'pre_scores', data: preScores });
    } else {
      state.pre_scores = options.pre_scores;
    }

    // Agent 3 depends on Agent 1
    const benchmark = await runBenchmarkCandidate({ job_intelligence: jobIntel }, signal, { session_id: options.session_id });
    state.benchmark_candidate = benchmark;

    emit({ type: 'benchmark_candidate', data: benchmark });
    emit({ type: 'stage_complete', stage: 'analysis', message: 'Analysis complete', duration_ms: Date.now() - analysisStart });

    // ─── Stage 2: Strategy (Agents 4 & 5 sequential) ─────────────────
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
    emit({ type: 'gap_analysis', data: gapAnalysis });

    // ─── Gap Coaching: build coaching cards from pending strategies ──
    // Always emit cards when strategies are present — including on "Add Context" re-runs.
    // The previously_approved flag lets the frontend indicate which strategies were
    // already approved so the user knows they can confirm quickly.
    if (gapAnalysis.pending_strategies.length > 0) {
      const coachingCards: GapCoachingCard[] = gapAnalysis.pending_strategies.map(ps => {
        // Find the matching requirement for classification/importance
        const req = gapAnalysis.requirements.find(r => r.requirement === ps.requirement);
        const previouslyApproved = options.gap_coaching_responses?.find(
          r => r.requirement === ps.requirement && r.action === 'approve',
        );
        return {
          requirement: ps.requirement,
          importance: req?.importance ?? 'important',
          classification: req?.classification ?? 'partial',
          ai_reasoning: ps.strategy.ai_reasoning ?? `I found adjacent experience that could work for "${ps.requirement}": ${ps.strategy.real_experience}`,
          proposed_strategy: ps.strategy.positioning,
          inferred_metric: ps.strategy.inferred_metric,
          inference_rationale: ps.strategy.inference_rationale,
          evidence_found: req?.evidence ?? [],
          previously_approved: !!previouslyApproved,
          interview_questions: ps.strategy.interview_questions,
        };
      });
      emit({ type: 'gap_coaching', data: coachingCards });
    }

    // Determine the effective approved strategies for downstream agents.
    //
    // Three cases:
    // 1. "Add Context" re-run — caller passes previously approved strategies via options.approved_strategies.
    // 2. Gap coaching responses — user approved/skipped/provided context for each strategy.
    // 3. First run — pending_strategies are implicitly approved by default.
    let allApproved: Array<{ requirement: string; strategy: GapStrategy }>;

    if (state.approved_strategies.length > 0) {
      // Case 1: Re-run with pre-approved strategies
      allApproved = state.approved_strategies;
    } else if (options.gap_coaching_responses && options.gap_coaching_responses.length > 0) {
      // Case 2: User responded to gap coaching
      state.gap_coaching_responses = options.gap_coaching_responses;
      allApproved = [];
      for (const response of options.gap_coaching_responses) {
        const ps = gapAnalysis.pending_strategies.find(s => s.requirement === response.requirement);
        if (!ps) continue;

        if (response.action === 'approve') {
          allApproved.push(ps);
        } else if (response.action === 'context' && response.user_context) {
          // User provided additional context — enrich the strategy
          allApproved.push({
            requirement: ps.requirement,
            strategy: {
              ...ps.strategy,
              real_experience: `${ps.strategy.real_experience}. Additional context from candidate: ${response.user_context}`,
            },
          });
        }
        // 'skip' — not included in allApproved
      }
    } else {
      // Case 3: First run — implicit approval
      allApproved = gapAnalysis.pending_strategies;
    }

    const narrative = await runNarrativeStrategy({
      gap_analysis: gapAnalysis,
      candidate: candidateIntel,
      job_intelligence: jobIntel,
      career_profile: options.career_profile,
      approved_strategies: allApproved,
      benchmark_differentiators: benchmark.differentiators,
    }, signal);

    state.narrative_strategy = narrative;
    emit({ type: 'narrative_strategy', data: narrative });
    emit({ type: 'stage_complete', stage: 'strategy', message: 'Positioning strategy complete', duration_ms: Date.now() - strategyStart });

    // ─── Stage 3: Writing (Agent 6) ──────────────────────────────────
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
        original_resume: options.resume_text,
        candidate: candidateIntel,
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
    });
    state.final_resume = assembled;

    emit({ type: 'assembly_complete', data: assembled });
    emit({ type: 'stage_complete', stage: 'assembly', message: 'Assembly complete', duration_ms: Date.now() - assemblyStart });

    // ─── Complete ────────────────────────────────────────────────────
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
