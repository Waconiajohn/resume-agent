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
} from './types.js';

export type EmitFn = (event: V2PipelineSSEEvent) => void;

export interface RunPipelineOptions {
  resume_text: string;
  job_description: string;
  session_id: string;
  user_id: string;
  emit: EmitFn;
  signal?: AbortSignal;
  /** Pre-approved strategies (from "Add Context" re-run) */
  approved_strategies?: Array<{ requirement: string; strategy: GapStrategy }>;
  /** Additional context from user */
  user_context?: string;
}

export async function runV2Pipeline(options: RunPipelineOptions): Promise<V2PipelineState> {
  const { emit, signal } = options;
  const state: V2PipelineState = {
    session_id: options.session_id,
    user_id: options.user_id,
    current_stage: 'intake',
    resume_text: options.resume_text,
    job_description: options.job_description,
    user_context: options.user_context,
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

    // Agent 3 depends on Agent 1
    const benchmark = await runBenchmarkCandidate({ job_intelligence: jobIntel }, signal);
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
      user_context: options.user_context,
    }, signal);

    state.gap_analysis = gapAnalysis;
    emit({ type: 'gap_analysis', data: gapAnalysis });

    // Determine the effective approved strategies for downstream agents.
    //
    // Two cases:
    // 1. "Add Context" re-run — the caller passes previously approved strategies
    //    via options.approved_strategies. Those are the authoritative source.
    //    Do NOT append pending_strategies on top; those are new and unreviewed.
    //
    // 2. First run — the user has not yet had a chance to explicitly approve or
    //    reject strategies (the UI gate fires AFTER this pipeline returns). In
    //    this case pending_strategies are implicitly approved because the user
    //    saw them and did not reject any — treat them as approved by default.
    //    This is the implicit approval pattern, not a force-set loop.
    const allApproved =
      state.approved_strategies.length > 0
        ? state.approved_strategies
        : gapAnalysis.pending_strategies;

    const narrative = await runNarrativeStrategy({
      gap_analysis: gapAnalysis,
      candidate: candidateIntel,
      job_intelligence: jobIntel,
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

    const assembled = runAssembly({ draft, truth_verification: truth, ats_optimization: ats, executive_tone: tone });
    state.final_resume = assembled;

    emit({ type: 'assembly_complete', data: assembled });
    emit({ type: 'stage_complete', stage: 'assembly', message: 'Assembly complete', duration_ms: Date.now() - assemblyStart });

    // ─── Complete ────────────────────────────────────────────────────
    state.current_stage = 'complete';
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
    const stage = state.current_stage;
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ session_id: options.session_id, stage, error: message }, 'Resume v2 pipeline error');
    emit({ type: 'pipeline_error', stage, error: message });
    throw error;
  }
}
