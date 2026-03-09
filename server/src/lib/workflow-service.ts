/**
 * Workflow Service — Business logic extracted from routes/workflow.ts
 *
 * Contains analytics aggregation, normalization blocks, and gate persistence
 * helpers used by both workflow.ts and product-route-factory.ts.
 */

import { supabaseAdmin } from './supabase.js';
import {
  getResponseQueue,
  parsePendingGatePayload,
  withResponseQueue,
} from './pending-gate-queue.js';
import type { QuestionnaireSubmission } from '../agents/types.js';
import type { CoverageOnlyReadinessCompat, DraftPathDecisionCompatResult } from './draft-readiness-compat.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ResponseStatus = 'answered' | 'skipped' | 'deferred';
export type ImpactBucket = 'high' | 'medium' | 'low' | 'untagged';

export interface QuestionResponseRow {
  question_id: string | null;
  stage: string | null;
  status: string | null;
  impact_tag: string | null;
  response: string | null;
  updated_at: string | null;
}

export interface QuestionReuseSummaryRow {
  payload: unknown;
  version: unknown;
  created_at: unknown;
}

export interface DraftReadinessArtifact {
  payload: unknown;
  version: number | null;
  created_at: string | null;
}

export interface PipelineActivityStatusArtifact {
  payload: unknown;
  version: number | null;
  created_at: string | null;
}

export interface PipelineRuntimeMetricsArtifact {
  payload: unknown;
  version: number | null;
  created_at: string | null;
}

export interface DraftPathDecisionArtifact {
  payload: unknown;
  version: number | null;
  created_at: string | null;
}

export interface SectionsBundleArtifact {
  payload: unknown;
  version: number | null;
  created_at: string | null;
}

export interface BenchmarkEditArtifact {
  payload: unknown;
  version: number | null;
  created_at: string | null;
}

export interface WorkflowPreferencesArtifact {
  payload: unknown;
  version: number | null;
  created_at: string | null;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

// ─── Analytics aggregation ────────────────────────────────────────────────────

export function questionnaireAnalytics(questionResponseRows: QuestionResponseRow[]): {
  total: number;
  answered: number;
  skipped: number;
  deferred: number;
  by_impact: Record<ImpactBucket, { total: number; answered: number; skipped: number; deferred: number }>;
  latest_activity_at: string | null;
} {
  const rows = questionResponseRows.filter((row) => {
    const qid = typeof row.question_id === 'string' ? row.question_id : '';
    return qid.includes(':');
  });
  const baseCounts = { total: 0, answered: 0, skipped: 0, deferred: 0 };
  const byImpact: Record<ImpactBucket, { total: number; answered: number; skipped: number; deferred: number }> = {
    high: { total: 0, answered: 0, skipped: 0, deferred: 0 },
    medium: { total: 0, answered: 0, skipped: 0, deferred: 0 },
    low: { total: 0, answered: 0, skipped: 0, deferred: 0 },
    untagged: { total: 0, answered: 0, skipped: 0, deferred: 0 },
  };
  let latestActivityAt: string | null = null;

  for (const row of rows) {
    const status: ResponseStatus = row.status === 'skipped' || row.status === 'deferred' ? row.status : 'answered';
    const impactKey: ImpactBucket = row.impact_tag === 'high' || row.impact_tag === 'medium' || row.impact_tag === 'low'
      ? row.impact_tag
      : 'untagged';
    baseCounts.total += 1;
    baseCounts[status] += 1;
    byImpact[impactKey].total += 1;
    byImpact[impactKey][status] += 1;
    if (typeof row.updated_at === 'string' && (!latestActivityAt || row.updated_at > latestActivityAt)) latestActivityAt = row.updated_at;
  }

  return {
    ...baseCounts,
    by_impact: byImpact,
    latest_activity_at: latestActivityAt,
  };
}

export function questionResponseHistory(questionResponseRows: QuestionResponseRow[]): Array<{
  questionnaire_id: string;
  question_id: string;
  stage: string;
  status: 'answered' | 'skipped' | 'deferred';
  impact_tag: 'high' | 'medium' | 'low' | null;
  payoff_hint: string | null;
  updated_at: string | null;
}> {
  return questionResponseRows
    .filter((row) => typeof row.question_id === 'string' && (row.question_id as string).includes(':'))
    .map((row) => {
      const rawQuestionId = row.question_id as string;
      const [questionnaireId, ...questionIdParts] = rawQuestionId.split(':');
      const questionId = questionIdParts.join(':');
      const payload = asRecord(row.response);
      return {
        questionnaire_id: questionnaireId,
        question_id: questionId || rawQuestionId,
        stage: typeof row.stage === 'string' ? row.stage : 'unknown',
        status: (row.status === 'skipped' || row.status === 'deferred' ? row.status : 'answered') as 'answered' | 'skipped' | 'deferred',
        impact_tag: (row.impact_tag === 'high' || row.impact_tag === 'medium' || row.impact_tag === 'low'
          ? row.impact_tag
          : null) as 'high' | 'medium' | 'low' | null,
        payoff_hint: typeof payload?.payoff_hint === 'string' ? payload.payoff_hint : null,
        updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
      };
    })
    .filter((row) => Boolean(row.payoff_hint))
    .slice(0, 12);
}

export function questionReuseSummaries(questionReuseSummaryRows: QuestionReuseSummaryRow[]): Array<{
  stage: 'gap_analysis' | 'positioning';
  questionnaire_kind: 'gap_analysis_quiz' | 'positioning_batch';
  skipped_count: number;
  matched_by_topic_count: number;
  matched_by_payoff_count: number;
  prior_answered_count: number;
  prior_deferred_count: number;
  benchmark_edit_version: number | null;
  sample_topics: string[];
  sample_payoffs: string[];
  message: string | null;
  version: number | null;
  created_at: string | null;
}> {
  return questionReuseSummaryRows
    .map((row) => {
      const payload = asRecord(row.payload);
      if (!payload) return null;
      const sampleTopics = Array.isArray(payload.sample_topics)
        ? payload.sample_topics
            .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
            .map((v) => v.trim())
            .slice(0, 8)
        : [];
      const samplePayoffs = Array.isArray(payload.sample_payoffs)
        ? payload.sample_payoffs
            .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
            .map((v) => v.trim())
            .slice(0, 6)
        : [];
      return {
        stage: (payload.stage === 'gap_analysis' ? 'gap_analysis' : 'positioning') as 'gap_analysis' | 'positioning',
        questionnaire_kind: (payload.questionnaire_kind === 'gap_analysis_quiz'
          ? 'gap_analysis_quiz'
          : 'positioning_batch') as 'gap_analysis_quiz' | 'positioning_batch',
        skipped_count: typeof payload.skipped_count === 'number' ? Math.max(0, payload.skipped_count) : 0,
        matched_by_topic_count: typeof payload.matched_by_topic_count === 'number'
          ? Math.max(0, payload.matched_by_topic_count)
          : 0,
        matched_by_payoff_count: typeof payload.matched_by_payoff_count === 'number'
          ? Math.max(0, payload.matched_by_payoff_count)
          : 0,
        prior_answered_count: typeof payload.prior_answered_count === 'number'
          ? Math.max(0, payload.prior_answered_count)
          : 0,
        prior_deferred_count: typeof payload.prior_deferred_count === 'number'
          ? Math.max(0, payload.prior_deferred_count)
          : 0,
        benchmark_edit_version: typeof payload.benchmark_edit_version === 'number'
          ? payload.benchmark_edit_version
          : null,
        sample_topics: sampleTopics,
        sample_payoffs: samplePayoffs,
        message: typeof payload.message === 'string' ? payload.message : null,
        version: typeof row.version === 'number' ? row.version : null,
        created_at: typeof row.created_at === 'string' ? row.created_at : null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
}

export function questionReuseMetrics(summaries: ReturnType<typeof questionReuseSummaries>): {
  total_skipped: number;
  by_stage: Record<'positioning' | 'gap_analysis', { events: number; skipped_count: number }>;
  matched_by_topic_count: number;
  matched_by_payoff_count: number;
  prior_answered_count: number;
  prior_deferred_count: number;
  latest_created_at: string | null;
} {
  const byStage = {
    positioning: { events: 0, skipped_count: 0 },
    gap_analysis: { events: 0, skipped_count: 0 },
  };
  let totalSkipped = 0;
  let totalByTopic = 0;
  let totalByPayoff = 0;
  let totalPriorAnswered = 0;
  let totalPriorDeferred = 0;
  for (const row of summaries) {
    const stageKey: keyof typeof byStage = row.stage === 'gap_analysis' ? 'gap_analysis' : 'positioning';
    byStage[stageKey].events += 1;
    byStage[stageKey].skipped_count += row.skipped_count;
    totalSkipped += row.skipped_count;
    totalByTopic += row.matched_by_topic_count;
    totalByPayoff += row.matched_by_payoff_count;
    totalPriorAnswered += row.prior_answered_count;
    totalPriorDeferred += row.prior_deferred_count;
  }
  return {
    total_skipped: totalSkipped,
    by_stage: byStage,
    matched_by_topic_count: totalByTopic,
    matched_by_payoff_count: totalByPayoff,
    prior_answered_count: totalPriorAnswered,
    prior_deferred_count: totalPriorDeferred,
    latest_created_at: summaries[0]?.created_at ?? null,
  };
}

// ─── Normalization blocks ─────────────────────────────────────────────────────

// These are imported by workflow.ts from draft-readiness-compat.ts — kept there.
// The normalization functions below are the inline IIFE blocks from workflow.ts,
// exposed as pure functions so they can be unit-tested and reused.

export function normalizeDraftReadiness(
  draftReadinessRow: DraftReadinessArtifact | null | undefined,
  helpers: {
    normalizeCoverageOnlyReadiness: (payload: Record<string, unknown>) => CoverageOnlyReadinessCompat;
  },
): Record<string, unknown> | null {
  const payload = asRecord(draftReadinessRow?.payload);
  if (!payload) return null;
  const readinessCompat = helpers.normalizeCoverageOnlyReadiness(payload);
  const gapBreakdown = asRecord(payload.gap_breakdown);
  const evidenceQuality = asRecord(payload.evidence_quality);
  const highImpactRemaining = Array.isArray(payload.high_impact_remaining)
    ? payload.high_impact_remaining
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
        .map((item) => ({
          requirement: typeof item.requirement === 'string' ? item.requirement : '',
          classification: item.classification === 'partial' ? 'partial' : 'gap',
          priority:
            item.priority === 'must_have' || item.priority === 'implicit' || item.priority === 'nice_to_have'
              ? item.priority
              : 'nice_to_have',
          evidence_count: typeof item.evidence_count === 'number' ? item.evidence_count : 0,
        }))
        .filter((item) => item.requirement.length > 0)
    : [];
  return {
    evidence_count: typeof payload.evidence_count === 'number' ? payload.evidence_count : 0,
    minimum_evidence_target: typeof payload.minimum_evidence_target === 'number' ? payload.minimum_evidence_target : 0,
    coverage_score: typeof payload.coverage_score === 'number' ? payload.coverage_score : 0,
    coverage_threshold: typeof payload.coverage_threshold === 'number' ? payload.coverage_threshold : 0,
    ready: readinessCompat.ready,
    remaining_evidence_needed: typeof payload.remaining_evidence_needed === 'number'
      ? payload.remaining_evidence_needed
      : undefined,
    remaining_coverage_needed: typeof readinessCompat.remainingCoverageNeeded === 'number'
      ? readinessCompat.remainingCoverageNeeded
      : (typeof payload.remaining_coverage_needed === 'number' ? payload.remaining_coverage_needed : undefined),
    blocking_reasons: readinessCompat.blockingReasons.length > 0 ? readinessCompat.blockingReasons : undefined,
    gap_breakdown: gapBreakdown
      ? {
          total: typeof gapBreakdown.total === 'number' ? gapBreakdown.total : 0,
          strong: typeof gapBreakdown.strong === 'number' ? gapBreakdown.strong : 0,
          partial: typeof gapBreakdown.partial === 'number' ? gapBreakdown.partial : 0,
          gap: typeof gapBreakdown.gap === 'number' ? gapBreakdown.gap : 0,
        }
      : undefined,
    evidence_quality: evidenceQuality
      ? {
          user_validated_count: typeof evidenceQuality.user_validated_count === 'number' ? evidenceQuality.user_validated_count : 0,
          metrics_defensible_count: typeof evidenceQuality.metrics_defensible_count === 'number' ? evidenceQuality.metrics_defensible_count : 0,
          mapped_requirement_evidence_count: typeof evidenceQuality.mapped_requirement_evidence_count === 'number' ? evidenceQuality.mapped_requirement_evidence_count : 0,
        }
      : undefined,
    high_impact_remaining: highImpactRemaining.length > 0 ? highImpactRemaining : undefined,
    suggested_question_count: typeof payload.suggested_question_count === 'number'
      ? payload.suggested_question_count
      : undefined,
    workflow_mode: payload.workflow_mode === 'fast_draft' || payload.workflow_mode === 'deep_dive'
      ? payload.workflow_mode
      : 'balanced',
    stage: typeof payload.stage === 'string' ? payload.stage : 'gap_analysis',
    note: typeof payload.note === 'string' ? payload.note : undefined,
    version: typeof draftReadinessRow?.version === 'number' ? draftReadinessRow.version : null,
    created_at: draftReadinessRow?.created_at ?? null,
  };
}

export function normalizePipelineActivityStatus(
  pipelineActivityStatusRow: PipelineActivityStatusArtifact | null | undefined,
): Record<string, unknown> | null {
  const payload = asRecord(pipelineActivityStatusRow?.payload);
  if (!payload) return null;
  const processingState = typeof payload.processing_state === 'string' ? payload.processing_state : null;
  const currentActivitySource = typeof payload.current_activity_source === 'string' ? payload.current_activity_source : null;
  return {
    processing_state:
      processingState === 'processing'
      || processingState === 'waiting_for_input'
      || processingState === 'reconnecting'
      || processingState === 'stalled_suspected'
      || processingState === 'idle'
      || processingState === 'complete'
      || processingState === 'error'
        ? processingState
        : 'idle',
    stage: typeof payload.stage === 'string' ? payload.stage : null,
    stage_started_at: typeof payload.stage_started_at === 'string' ? payload.stage_started_at : null,
    last_progress_at: typeof payload.last_progress_at === 'string' ? payload.last_progress_at : null,
    last_heartbeat_at: typeof payload.last_heartbeat_at === 'string' ? payload.last_heartbeat_at : null,
    last_backend_activity_at: typeof payload.last_backend_activity_at === 'string' ? payload.last_backend_activity_at : null,
    last_stage_duration_ms: typeof payload.last_stage_duration_ms === 'number'
      ? Math.max(0, payload.last_stage_duration_ms)
      : null,
    current_activity_message: typeof payload.current_activity_message === 'string' ? payload.current_activity_message : null,
    current_activity_source:
      currentActivitySource === 'stage_start'
      || currentActivitySource === 'stage_complete'
      || currentActivitySource === 'transparency'
      || currentActivitySource === 'gate'
      || currentActivitySource === 'poll'
      || currentActivitySource === 'restore'
      || currentActivitySource === 'system'
        ? currentActivitySource
        : null,
    expected_next_action: typeof payload.expected_next_action === 'string' ? payload.expected_next_action : null,
    version: typeof pipelineActivityStatusRow?.version === 'number' ? pipelineActivityStatusRow.version : null,
    created_at: pipelineActivityStatusRow?.created_at ?? null,
  };
}

export function normalizeRuntimeMetrics(
  pipelineRuntimeMetricsRow: PipelineRuntimeMetricsArtifact | null | undefined,
): Record<string, unknown> | null {
  const payload = asRecord(pipelineRuntimeMetricsRow?.payload);
  if (!payload) return null;
  const stageDurationsRaw = asRecord(payload.stage_durations_ms);
  const stageDurations: Record<string, number> = {};
  if (stageDurationsRaw) {
    for (const [key, value] of Object.entries(stageDurationsRaw)) {
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        stageDurations[key] = Math.round(value);
      }
    }
  }
  return {
    run_started_at: typeof payload.run_started_at === 'string' ? payload.run_started_at : null,
    first_progress_at: typeof payload.first_progress_at === 'string' ? payload.first_progress_at : null,
    first_progress_event_type: typeof payload.first_progress_event_type === 'string' ? payload.first_progress_event_type : null,
    first_progress_delay_ms: typeof payload.first_progress_delay_ms === 'number' && Number.isFinite(payload.first_progress_delay_ms)
      ? Math.max(0, Math.round(payload.first_progress_delay_ms))
      : null,
    first_action_ready_at: typeof payload.first_action_ready_at === 'string' ? payload.first_action_ready_at : null,
    first_action_ready_event_type: typeof payload.first_action_ready_event_type === 'string' ? payload.first_action_ready_event_type : null,
    first_action_ready_delay_ms: typeof payload.first_action_ready_delay_ms === 'number' && Number.isFinite(payload.first_action_ready_delay_ms)
      ? Math.max(0, Math.round(payload.first_action_ready_delay_ms))
      : null,
    latest_event_at: typeof payload.latest_event_at === 'string' ? payload.latest_event_at : null,
    latest_event_type: typeof payload.latest_event_type === 'string' ? payload.latest_event_type : null,
    stage_durations_ms: stageDurations,
    version: typeof pipelineRuntimeMetricsRow?.version === 'number' ? pipelineRuntimeMetricsRow.version : null,
    created_at: pipelineRuntimeMetricsRow?.created_at ?? null,
  };
}

export function normalizeDraftPathDecision(
  draftPathDecisionRow: DraftPathDecisionArtifact | null | undefined,
  helpers: {
    normalizeDraftPathDecisionCompat: (payload: Record<string, unknown>) => DraftPathDecisionCompatResult;
    buildCoverageOnlyDraftPathDecisionMessage: (opts: {
      workflowMode: 'fast_draft' | 'balanced' | 'deep_dive';
      coverageScore?: number;
      coverageThreshold?: number;
      ready: boolean;
      proceedingReason: DraftPathDecisionCompatResult['proceedingReason'];
      remainingCoverageNeeded?: number;
      topRemainingRequirement?: string | null;
    }) => string;
  },
): Record<string, unknown> | null {
  const payload = asRecord(draftPathDecisionRow?.payload);
  if (!payload) return null;
  const pathDecisionCompat = helpers.normalizeDraftPathDecisionCompat(payload);
  const topRemaining = asRecord(payload.top_remaining);
  const normalizedWorkflowMode = payload.workflow_mode === 'fast_draft' || payload.workflow_mode === 'deep_dive'
    ? payload.workflow_mode
    : 'balanced';
  const topRemainingRequirement = topRemaining && typeof topRemaining.requirement === 'string'
    ? topRemaining.requirement
    : null;
  const normalizedMessage = pathDecisionCompat.shouldRewriteMessage
    ? helpers.buildCoverageOnlyDraftPathDecisionMessage({
        workflowMode: normalizedWorkflowMode as 'fast_draft' | 'balanced' | 'deep_dive',
        coverageScore: typeof payload.coverage_score === 'number' ? payload.coverage_score : undefined,
        coverageThreshold: typeof payload.coverage_threshold === 'number' ? payload.coverage_threshold : undefined,
        ready: pathDecisionCompat.ready,
        proceedingReason: pathDecisionCompat.proceedingReason,
        remainingCoverageNeeded: pathDecisionCompat.remainingCoverageNeeded,
        topRemainingRequirement,
      })
    : (typeof payload.message === 'string' ? payload.message : '');
  return {
    stage: typeof payload.stage === 'string' ? payload.stage : 'gap_analysis',
    workflow_mode: normalizedWorkflowMode,
    ready: pathDecisionCompat.ready,
    proceeding_reason: pathDecisionCompat.proceedingReason,
    blocking_reasons: pathDecisionCompat.blockingReasons.length > 0 ? pathDecisionCompat.blockingReasons : undefined,
    remaining_evidence_needed: typeof payload.remaining_evidence_needed === 'number'
      ? payload.remaining_evidence_needed
      : undefined,
    remaining_coverage_needed: typeof pathDecisionCompat.remainingCoverageNeeded === 'number'
      ? pathDecisionCompat.remainingCoverageNeeded
      : (typeof payload.remaining_coverage_needed === 'number' ? payload.remaining_coverage_needed : undefined),
    top_remaining: topRemaining
      ? {
          requirement: typeof topRemaining.requirement === 'string' ? topRemaining.requirement : '',
          classification: topRemaining.classification === 'partial' ? 'partial' : 'gap',
          priority:
            topRemaining.priority === 'must_have' || topRemaining.priority === 'implicit' || topRemaining.priority === 'nice_to_have'
              ? topRemaining.priority
              : 'nice_to_have',
          evidence_count: typeof topRemaining.evidence_count === 'number' ? topRemaining.evidence_count : 0,
        }
      : undefined,
    message: normalizedMessage,
    version: typeof draftPathDecisionRow?.version === 'number' ? draftPathDecisionRow.version : null,
    created_at: draftPathDecisionRow?.created_at ?? null,
  };
}

export function normalizeSectionsBundleReview(
  sectionsBundleRow: SectionsBundleArtifact | null | undefined,
): Record<string, unknown> | null {
  const payload = asRecord(sectionsBundleRow?.payload);
  if (!payload) return null;
  const bundlesRaw = Array.isArray(payload.bundles) ? payload.bundles : [];
  return {
    review_strategy: payload.review_strategy === 'bundled' ? 'bundled' : 'per_section',
    current_review_bundle_key:
      payload.current_review_bundle_key === 'headline'
      || payload.current_review_bundle_key === 'core_experience'
      || payload.current_review_bundle_key === 'supporting'
        ? payload.current_review_bundle_key
        : null,
    total_bundles: typeof payload.total_bundles === 'number' ? payload.total_bundles : 0,
    completed_bundles: typeof payload.completed_bundles === 'number' ? payload.completed_bundles : 0,
    bundles: bundlesRaw
      .filter((b): b is Record<string, unknown> => Boolean(b) && typeof b === 'object')
      .map((b) => ({
        key:
          b.key === 'headline' || b.key === 'core_experience' || b.key === 'supporting'
            ? b.key
            : 'supporting',
        label: typeof b.label === 'string' ? b.label : 'Bundle',
        total_sections: typeof b.total_sections === 'number' ? b.total_sections : 0,
        review_required: typeof b.review_required === 'number' ? b.review_required : 0,
        reviewed_required: typeof b.reviewed_required === 'number' ? b.reviewed_required : 0,
        status:
          b.status === 'in_progress' || b.status === 'complete' || b.status === 'auto_approved'
            ? b.status
            : 'pending',
      })),
    version: typeof sectionsBundleRow?.version === 'number' ? sectionsBundleRow.version : null,
    created_at: sectionsBundleRow?.created_at ?? null,
  };
}

export function normalizeBenchmarkEdit(
  benchmarkEditRow: BenchmarkEditArtifact | null | undefined,
): Record<string, unknown> | null {
  const payload = asRecord(benchmarkEditRow?.payload);
  if (!payload) return null;
  const assumptions = asRecord(payload.assumptions);
  const assumptionKeys = assumptions ? Object.keys(assumptions).slice(0, 50) : [];
  return {
    version: typeof benchmarkEditRow?.version === 'number' ? benchmarkEditRow.version : null,
    created_at: benchmarkEditRow?.created_at ?? null,
    edited_at: typeof payload.edited_at === 'string' ? payload.edited_at : (benchmarkEditRow?.created_at ?? null),
    note: typeof payload.note === 'string' ? payload.note : null,
    assumption_key_count: assumptionKeys.length,
    assumption_keys: assumptionKeys,
  };
}

export function normalizeWorkflowPreferences(
  workflowPreferencesRow: WorkflowPreferencesArtifact | null | undefined,
  pipelineStartRequestRow: { payload: unknown; created_at: string | null } | null | undefined,
): Record<string, unknown> {
  const prefsPayload = asRecord(workflowPreferencesRow?.payload);
  const startPayload = asRecord(pipelineStartRequestRow?.payload);
  const workflowMode = (prefsPayload?.workflow_mode === 'fast_draft'
    || prefsPayload?.workflow_mode === 'deep_dive'
    || prefsPayload?.workflow_mode === 'balanced')
    ? prefsPayload.workflow_mode
    : (
        startPayload?.workflow_mode === 'fast_draft'
        || startPayload?.workflow_mode === 'deep_dive'
        || startPayload?.workflow_mode === 'balanced'
          ? startPayload.workflow_mode
          : 'balanced'
      );
  const minimumEvidenceTarget = typeof prefsPayload?.minimum_evidence_target === 'number'
    ? prefsPayload.minimum_evidence_target
    : (typeof startPayload?.minimum_evidence_target === 'number'
        ? startPayload.minimum_evidence_target
        : null);
  return {
    workflow_mode: workflowMode,
    minimum_evidence_target: minimumEvidenceTarget,
    source: prefsPayload ? 'workflow_preferences' : (startPayload ? 'pipeline_start_request' : 'default'),
    version: typeof workflowPreferencesRow?.version === 'number' ? workflowPreferencesRow.version : null,
    created_at: workflowPreferencesRow?.created_at ?? pipelineStartRequestRow?.created_at ?? null,
  };
}

// ─── Gate persistence ─────────────────────────────────────────────────────────

/**
 * Persists a gate response directly (if the session is waiting on that gate)
 * or buffers it in the response queue (if no gate is currently pending or the
 * gate names don't match).
 *
 * Used by workflow.ts (generate-draft-now). Note: product-route-factory.ts
 * has its own inline gate-persistence logic.
 */
export async function persistPendingOrBufferedGateResponse(
  sessionId: string,
  pendingGate: string | null,
  pendingGateData: unknown,
  gate: string,
  response: unknown,
): Promise<{ status: 'sent' | 'buffered'; gate: string }> {
  const existingPayload = parsePendingGatePayload(pendingGateData);
  if (pendingGate && pendingGate === gate) {
    const payload = {
      ...existingPayload,
      gate: pendingGate,
      response,
      response_gate: pendingGate,
      responded_at: new Date().toISOString(),
    };
    const { error } = await supabaseAdmin
      .from('coach_sessions')
      .update({ pending_gate_data: payload })
      .eq('id', sessionId)
      .eq('pending_gate', pendingGate);
    if (error) throw new Error(error.message);
    return { status: 'sent' as const, gate: pendingGate };
  }

  const queue = getResponseQueue(existingPayload).filter((item) => item.gate !== gate);
  queue.push({
    gate,
    response,
    responded_at: new Date().toISOString(),
  });
  const payload = withResponseQueue(existingPayload, queue);
  const { error } = await supabaseAdmin
    .from('coach_sessions')
    .update({ pending_gate_data: payload })
    .eq('id', sessionId);
  if (error) throw new Error(error.message);
  return { status: 'buffered' as const, gate };
}

// ─── Draft-now helpers ────────────────────────────────────────────────────────

export function buildSkippedQuestionnaireSubmission(
  payload: unknown,
  gate: string,
): QuestionnaireSubmission | null {
  const event = asRecord(payload);
  const questionnaireId = gate.startsWith('questionnaire_')
    ? gate.slice('questionnaire_'.length)
    : '';
  if (!event) return null;
  const eventQuestionnaireId = typeof event.questionnaire_id === 'string' ? event.questionnaire_id : '';
  if (!eventQuestionnaireId || (questionnaireId && questionnaireId !== eventQuestionnaireId)) return null;
  const questions = Array.isArray(event.questions)
    ? event.questions.filter((q: unknown): q is Record<string, unknown> => Boolean(q) && typeof q === 'object')
    : [];
  return {
    questionnaire_id: eventQuestionnaireId,
    schema_version: typeof event.schema_version === 'number' ? event.schema_version : 1,
    stage: typeof event.stage === 'string' ? event.stage : 'unknown',
    responses: questions
      .map((q: Record<string, unknown>) => (typeof q.id === 'string'
        ? {
            question_id: q.id,
            selected_option_ids: [] as string[],
            skipped: true,
          }
        : null))
      .filter((
        r: { question_id: string; selected_option_ids: string[]; skipped: boolean } | null,
      ): r is { question_id: string; selected_option_ids: string[]; skipped: boolean } => Boolean(r)),
    submitted_at: new Date().toISOString(),
    generated_by: 'generate_draft_now',
  };
}

export async function persistDraftNowRequest(
  sessionId: string,
  stage: string | null | undefined,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('session_question_responses')
    .upsert({
      session_id: sessionId,
      question_id: '__generate_draft_now__',
      stage: stage ?? 'unknown',
      status: 'answered',
      response: {
        requested: true,
        requested_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'session_id,question_id' });
  if (error) throw new Error(error.message);
}
