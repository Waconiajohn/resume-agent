import { Hono } from 'hono';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { parseJsonBodyWithLimit } from '../lib/http-body-guard.js';
import {
  getResponseQueue,
  parsePendingGatePayload,
  withResponseQueue,
} from '../lib/pending-gate-queue.js';
import { sseConnections } from './sessions.js';
import type { QuestionnaireSubmission } from '../agents/types.js';
import {
  WORKFLOW_NODE_KEYS,
  type WorkflowNodeKey,
  type WorkflowNodeStatus,
  isWorkflowNodeKey,
  workflowNodeFromStage,
} from '../lib/workflow-nodes.js';
import { STALE_PIPELINE_MS, pipeline as pipelineRouter } from './pipeline.js';

const workflow = new Hono();
workflow.use('*', authMiddleware);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

const MAX_WORKFLOW_MUTATION_BODY_BYTES = 180_000;

function phaseToWorkflowNode(phase: string | null | undefined): WorkflowNodeKey {
  return workflowNodeFromStage(phase ?? '');
}

function normalizeNodeStatus(status: unknown): WorkflowNodeStatus {
  return status === 'locked'
    || status === 'ready'
    || status === 'in_progress'
    || status === 'blocked'
    || status === 'complete'
    || status === 'stale'
    ? status
    : 'locked';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

async function insertArtifact(
  sessionId: string, nodeKey: WorkflowNodeKey, artifactType: string,
  payload: unknown, createdBy = 'user', nodeStatus: WorkflowNodeStatus = 'complete',
) {
  const { data, error } = await supabaseAdmin.rpc('next_artifact_version', {
    p_session_id: sessionId,
    p_node_key: nodeKey,
    p_artifact_type: artifactType,
    p_payload: payload,
    p_created_by: createdBy,
  });
  if (error) throw new Error(error.message);
  const version = typeof data === 'number' ? data : 1;
  await supabaseAdmin
    .from('session_workflow_nodes')
    .upsert({
      session_id: sessionId,
      node_key: nodeKey,
      status: nodeStatus,
      active_version: version,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'session_id,node_key' });
  return version;
}

async function requireOwnedSession(sessionId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from('coach_sessions')
    .select('id, pipeline_stage, pipeline_status, pending_gate, pending_gate_data, updated_at, last_panel_type, last_panel_data')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();
  if (error || !data) return null;
  return data;
}

async function getLatestPipelineStartRequestArtifact(sessionId: string) {
  const { data, error } = await supabaseAdmin
    .from('session_workflow_artifacts')
    .select('payload, version, created_at')
    .eq('session_id', sessionId)
    .eq('node_key', 'overview')
    .eq('artifact_type', 'pipeline_start_request')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

async function persistPendingOrBufferedGateResponse(
  sessionId: string,
  pendingGate: string | null,
  pendingGateData: unknown,
  gate: string,
  response: unknown,
) {
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

function buildSkippedQuestionnaireSubmission(payload: unknown, gate: string): QuestionnaireSubmission | null {
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

async function persistDraftNowRequest(sessionId: string, stage: string | null | undefined) {
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

workflow.get('/:sessionId', rateLimitMiddleware(120, 60_000), async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');
  if (!isValidUuid(sessionId)) return c.json({ error: 'Invalid session id' }, 400);
  const session = await requireOwnedSession(sessionId, user.id);
  if (!session) return c.json({ error: 'Session not found' }, 404);

  const [
    { data: nodeRows },
    { data: artifactRows },
    { data: questionResponseRows },
    { data: questionReuseSummaryRows },
    { data: draftReadinessRow },
    { data: draftPathDecisionRow },
    { data: replanStatusRow },
    { data: sectionsBundleRow },
    { data: benchmarkEditRow },
    { data: workflowPreferencesRow },
    { data: pipelineStartRequestRow },
  ] = await Promise.all([
    supabaseAdmin
      .from('session_workflow_nodes')
      .select('node_key, status, active_version, meta, updated_at')
      .eq('session_id', sessionId)
      .order('updated_at', { ascending: false }),
    supabaseAdmin
      .from('session_workflow_artifacts')
      .select('id, node_key, artifact_type, version, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(200),
    supabaseAdmin
      .from('session_question_responses')
      .select('question_id, stage, status, impact_tag, response, updated_at')
      .eq('session_id', sessionId)
      .order('updated_at', { ascending: false })
      .limit(500),
    supabaseAdmin
      .from('session_workflow_artifacts')
      .select('payload, version, created_at')
      .eq('session_id', sessionId)
      .eq('node_key', 'questions')
      .eq('artifact_type', 'questionnaire_reuse_summary')
      .order('created_at', { ascending: false })
      .limit(12),
    supabaseAdmin
      .from('session_workflow_artifacts')
      .select('payload, version, created_at')
      .eq('session_id', sessionId)
      .eq('node_key', 'overview')
      .eq('artifact_type', 'draft_readiness')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('session_workflow_artifacts')
      .select('payload, version, created_at')
      .eq('session_id', sessionId)
      .eq('node_key', 'overview')
      .eq('artifact_type', 'draft_path_decision')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('session_workflow_artifacts')
      .select('payload, version, created_at')
      .eq('session_id', sessionId)
      .eq('node_key', 'overview')
      .eq('artifact_type', 'workflow_replan_status')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('session_workflow_artifacts')
      .select('payload, version, created_at')
      .eq('session_id', sessionId)
      .eq('node_key', 'sections')
      .eq('artifact_type', 'sections_bundle_review_status')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('session_workflow_artifacts')
      .select('payload, version, created_at')
      .eq('session_id', sessionId)
      .eq('node_key', 'benchmark')
      .eq('artifact_type', 'benchmark_assumptions_edit')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('session_workflow_artifacts')
      .select('payload, version, created_at')
      .eq('session_id', sessionId)
      .eq('node_key', 'overview')
      .eq('artifact_type', 'workflow_preferences')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('session_workflow_artifacts')
      .select('payload, version, created_at')
      .eq('session_id', sessionId)
      .eq('node_key', 'overview')
      .eq('artifact_type', 'pipeline_start_request')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const activeNode = phaseToWorkflowNode(session.pipeline_stage as string | null | undefined);
  const nodeMap = new Map<string, {
    node_key: string;
    status: string;
    active_version: number | null;
    meta: Record<string, unknown> | null;
    updated_at: string;
  }>();

  for (const row of (nodeRows ?? [])) {
    nodeMap.set(row.node_key, {
      node_key: row.node_key,
      status: row.status,
      active_version: row.active_version ?? null,
      meta: (row.meta as Record<string, unknown> | null) ?? null,
      updated_at: row.updated_at,
    });
  }

  const nodes = WORKFLOW_NODE_KEYS.map((nodeKey) => {
    const row = nodeMap.get(nodeKey);
    let status = normalizeNodeStatus(row?.status);
    if (!row) {
      status = nodeKey === activeNode
        ? (session.pending_gate ? 'blocked' : (session.pipeline_status === 'running' ? 'in_progress' : 'ready'))
        : (WORKFLOW_NODE_KEYS.indexOf(nodeKey) <= WORKFLOW_NODE_KEYS.indexOf(activeNode) ? 'ready' : 'locked');
      if (session.pipeline_status === 'complete' && nodeKey === 'export') status = 'complete';
    }
    if (nodeKey === activeNode && session.pending_gate && session.pipeline_status === 'running') {
      status = 'blocked';
    }
    return {
      node_key: nodeKey,
      status,
      active_version: row?.active_version ?? null,
      updated_at: row?.updated_at ?? session.updated_at,
      meta: row?.meta ?? null,
      blocking_state: (() => {
        const meta = asRecord(row?.meta);
        if (
          status === 'stale'
          && meta?.reason === 'benchmark_assumptions_updated'
          && meta?.requires_restart === true
        ) {
          return 'rebuild_required';
        }
        return null;
      })(),
    };
  });

  const latestByNodeType = new Map<string, { id: string; node_key: string; artifact_type: string; version: number; created_at: string }>();
  for (const row of (artifactRows ?? [])) {
    const key = `${row.node_key}:${row.artifact_type}`;
    if (!latestByNodeType.has(key)) {
      latestByNodeType.set(key, {
        id: row.id,
        node_key: row.node_key,
        artifact_type: row.artifact_type,
        version: row.version,
        created_at: row.created_at,
      });
    }
  }

  const replanStaleNodes = nodes.filter((node) => {
    const meta = asRecord(node.meta);
    return node.status === 'stale' && meta?.reason === 'benchmark_assumptions_updated';
  });
  const replanMeta = replanStaleNodes.length > 0 ? asRecord(replanStaleNodes[0]?.meta) : null;
  const questionnaireAnalytics = (() => {
    type ResponseStatus = 'answered' | 'skipped' | 'deferred';
    type ImpactBucket = 'high' | 'medium' | 'low' | 'untagged';
    const rows = (questionResponseRows ?? []).filter((row) => {
      const qid = typeof row.question_id === 'string' ? row.question_id : '';
      return qid.includes(':');
    });
    const baseCounts = { total: 0, answered: 0, skipped: 0, deferred: 0 };
    const byImpact = {
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
      if (!latestActivityAt && typeof row.updated_at === 'string') latestActivityAt = row.updated_at;
    }

    return {
      ...baseCounts,
      by_impact: byImpact,
      latest_activity_at: latestActivityAt,
    };
  })();
  const questionResponseHistory = (() => {
    return (questionResponseRows ?? [])
      .filter((row) => typeof row.question_id === 'string' && row.question_id.includes(':'))
      .map((row) => {
        const rawQuestionId = row.question_id as string;
        const [questionnaireId, ...questionIdParts] = rawQuestionId.split(':');
        const questionId = questionIdParts.join(':');
        const payload = asRecord(row.response);
        return {
          questionnaire_id: questionnaireId,
          question_id: questionId || rawQuestionId,
          stage: typeof row.stage === 'string' ? row.stage : 'unknown',
          status: row.status === 'skipped' || row.status === 'deferred' ? row.status : 'answered',
          impact_tag: row.impact_tag === 'high' || row.impact_tag === 'medium' || row.impact_tag === 'low'
            ? row.impact_tag
            : null,
          payoff_hint: typeof payload?.payoff_hint === 'string' ? payload.payoff_hint : null,
          updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
        };
      })
      .filter((row) => Boolean(row.payoff_hint))
      .slice(0, 12);
  })();
  const questionReuseSummaries = (() => {
    return (questionReuseSummaryRows ?? [])
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
          stage: payload.stage === 'gap_analysis' ? 'gap_analysis' : 'positioning',
          questionnaire_kind: payload.questionnaire_kind === 'gap_analysis_quiz'
            ? 'gap_analysis_quiz'
            : 'positioning_batch',
          skipped_count: typeof payload.skipped_count === 'number' ? Math.max(0, payload.skipped_count) : 0,
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
  })();

  return c.json({
    session: {
      id: session.id,
      pipeline_stage: session.pipeline_stage,
      pipeline_status: session.pipeline_status,
      pending_gate: session.pending_gate,
      updated_at: session.updated_at,
      active_node: activeNode,
      last_panel_type: session.last_panel_type,
    },
    nodes,
    latest_artifacts: Array.from(latestByNodeType.values()),
    question_response_metrics: questionnaireAnalytics,
    question_response_history: questionResponseHistory,
    question_reuse_summaries: questionReuseSummaries,
    replan: replanStaleNodes.length > 0 ? {
      pending: true,
      reason: 'benchmark_assumptions_updated',
      stale_nodes: replanStaleNodes.map((node) => node.node_key),
      requires_restart: replanMeta?.requires_restart === true,
      rebuild_from_stage: typeof replanMeta?.rebuild_from_stage === 'string' ? replanMeta.rebuild_from_stage : null,
      benchmark_edit_version: typeof replanMeta?.benchmark_assumptions_version === 'number'
        ? replanMeta.benchmark_assumptions_version
        : null,
      current_stage: session.pipeline_stage ?? null,
    } : null,
    draft_readiness: (() => {
      const payload = asRecord(draftReadinessRow?.payload);
      if (!payload) return null;
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
      const blockingReasons = Array.isArray(payload.blocking_reasons)
        ? payload.blocking_reasons.filter((reason): reason is 'evidence_target' | 'coverage_threshold' => (
          reason === 'evidence_target' || reason === 'coverage_threshold'
        ))
        : [];
      return {
        evidence_count: typeof payload.evidence_count === 'number' ? payload.evidence_count : 0,
        minimum_evidence_target: typeof payload.minimum_evidence_target === 'number' ? payload.minimum_evidence_target : 0,
        coverage_score: typeof payload.coverage_score === 'number' ? payload.coverage_score : 0,
        coverage_threshold: typeof payload.coverage_threshold === 'number' ? payload.coverage_threshold : 0,
        ready: payload.ready === true,
        remaining_evidence_needed: typeof payload.remaining_evidence_needed === 'number'
          ? payload.remaining_evidence_needed
          : undefined,
        remaining_coverage_needed: typeof payload.remaining_coverage_needed === 'number'
          ? payload.remaining_coverage_needed
          : undefined,
        blocking_reasons: blockingReasons.length > 0 ? blockingReasons : undefined,
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
    })(),
    draft_path_decision: (() => {
      const payload = asRecord(draftPathDecisionRow?.payload);
      if (!payload) return null;
      const blockingReasons = Array.isArray(payload.blocking_reasons)
        ? payload.blocking_reasons.filter((reason): reason is 'evidence_target' | 'coverage_threshold' => (
          reason === 'evidence_target' || reason === 'coverage_threshold'
        ))
        : [];
      const topRemaining = asRecord(payload.top_remaining);
      return {
        stage: payload.stage === 'gap_analysis' ? 'gap_analysis' : 'gap_analysis',
        workflow_mode: payload.workflow_mode === 'fast_draft' || payload.workflow_mode === 'deep_dive'
          ? payload.workflow_mode
          : 'balanced',
        ready: payload.ready === true,
        proceeding_reason: payload.proceeding_reason === 'readiness_met' ? 'readiness_met' : 'momentum_mode',
        blocking_reasons: blockingReasons.length > 0 ? blockingReasons : undefined,
        remaining_evidence_needed: typeof payload.remaining_evidence_needed === 'number'
          ? payload.remaining_evidence_needed
          : undefined,
        remaining_coverage_needed: typeof payload.remaining_coverage_needed === 'number'
          ? payload.remaining_coverage_needed
          : undefined,
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
        message: typeof payload.message === 'string' ? payload.message : '',
        version: typeof draftPathDecisionRow?.version === 'number' ? draftPathDecisionRow.version : null,
        created_at: draftPathDecisionRow?.created_at ?? null,
      };
    })(),
    sections_bundle_review: (() => {
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
    })(),
    benchmark_edit: (() => {
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
    })(),
    workflow_preferences: (() => {
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
    })(),
    replan_status: (() => {
      const payload = asRecord(replanStatusRow?.payload);
      if (!payload) return null;
      const type = typeof payload.type === 'string' ? payload.type : '';
      const state = type === 'workflow_replan_started'
        ? 'in_progress'
        : type === 'workflow_replan_completed'
          ? 'completed'
          : type === 'workflow_replan_requested'
            ? 'requested'
            : null;
      if (!state) return null;
      const currentStage = typeof payload.current_stage === 'string' ? payload.current_stage : null;
      if (!currentStage) return null;
      return {
        state,
        reason: payload.reason === 'benchmark_assumptions_updated' ? payload.reason : 'benchmark_assumptions_updated',
        benchmark_edit_version: typeof payload.benchmark_edit_version === 'number' ? payload.benchmark_edit_version : 0,
        rebuild_from_stage: 'gap_analysis',
        requires_restart: payload.requires_restart === true,
        current_stage: currentStage,
        phase: payload.phase === 'apply_benchmark_overrides' || payload.phase === 'refresh_gap_analysis' || payload.phase === 'rebuild_blueprint'
          ? payload.phase
          : undefined,
        rebuilt_through_stage: payload.rebuilt_through_stage === 'research'
          || payload.rebuilt_through_stage === 'gap_analysis'
          || payload.rebuilt_through_stage === 'architect'
          ? payload.rebuilt_through_stage
          : undefined,
        stale_nodes: Array.isArray(payload.stale_nodes)
          ? payload.stale_nodes.filter((n: unknown) => typeof n === 'string').slice(0, 8)
          : undefined,
        message: typeof payload.message === 'string' ? payload.message : undefined,
        updated_at: replanStatusRow?.created_at ?? new Date().toISOString(),
        version: typeof replanStatusRow?.version === 'number' ? replanStatusRow.version : null,
        created_at: replanStatusRow?.created_at ?? null,
      };
    })(),
  });
});

workflow.get('/:sessionId/restart-inputs', rateLimitMiddleware(60, 60_000), async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');
  if (!isValidUuid(sessionId)) return c.json({ error: 'Invalid session id' }, 400);

  const session = await requireOwnedSession(sessionId, user.id);
  if (!session) return c.json({ error: 'Session not found' }, 404);

  let artifact: Awaited<ReturnType<typeof getLatestPipelineStartRequestArtifact>>;
  try {
    artifact = await getLatestPipelineStartRequestArtifact(sessionId);
  } catch {
    return c.json({ error: 'Failed to load restart inputs' }, 500);
  }
  const payload = asRecord(artifact?.payload);
  if (!payload) {
    return c.json({ error: 'No restart inputs are available for this session yet.' }, 404);
  }

  const rawResumeText = typeof payload.raw_resume_text === 'string' ? payload.raw_resume_text : '';
  const jobDescription = typeof payload.job_description_resolved === 'string'
    ? payload.job_description_resolved
    : (typeof payload.job_description_input === 'string' ? payload.job_description_input : '');
  const companyName = typeof payload.company_name === 'string' ? payload.company_name : '';
  if (!rawResumeText || !jobDescription || !companyName) {
    return c.json({ error: 'Stored restart inputs are incomplete for this session.' }, 409);
  }

  return c.json({
    session_id: sessionId,
    version: artifact?.version ?? null,
    created_at: artifact?.created_at ?? null,
    inputs: {
      raw_resume_text: rawResumeText,
      job_description: jobDescription,
      company_name: companyName,
      workflow_mode: payload.workflow_mode === 'fast_draft' || payload.workflow_mode === 'deep_dive'
        ? payload.workflow_mode
        : 'balanced',
      minimum_evidence_target: typeof payload.minimum_evidence_target === 'number'
        ? payload.minimum_evidence_target
        : null,
      resume_priority: typeof payload.resume_priority === 'string' ? payload.resume_priority : null,
      seniority_delta: typeof payload.seniority_delta === 'string' ? payload.seniority_delta : null,
    },
  });
});

workflow.post('/:sessionId/restart', rateLimitMiddleware(20, 60_000), async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');
  if (!isValidUuid(sessionId)) return c.json({ error: 'Invalid session id' }, 400);

  const session = await requireOwnedSession(sessionId, user.id);
  if (!session) return c.json({ error: 'Session not found' }, 404);

  let artifact: Awaited<ReturnType<typeof getLatestPipelineStartRequestArtifact>>;
  try {
    artifact = await getLatestPipelineStartRequestArtifact(sessionId);
  } catch {
    return c.json({ error: 'Failed to load restart inputs' }, 500);
  }
  const payload = asRecord(artifact?.payload);
  if (!payload) {
    return c.json({ error: 'No restart inputs are available for this session yet.' }, 404);
  }

  const rawResumeText = typeof payload.raw_resume_text === 'string' ? payload.raw_resume_text : '';
  const jobDescription = typeof payload.job_description_resolved === 'string'
    ? payload.job_description_resolved
    : (typeof payload.job_description_input === 'string' ? payload.job_description_input : '');
  const companyName = typeof payload.company_name === 'string' ? payload.company_name : '';
  if (!rawResumeText || !jobDescription || !companyName) {
    return c.json({ error: 'Stored restart inputs are incomplete for this session.' }, 409);
  }

  const startBody = {
    session_id: sessionId,
    raw_resume_text: rawResumeText,
    job_description: jobDescription,
    company_name: companyName,
    workflow_mode: payload.workflow_mode === 'fast_draft' || payload.workflow_mode === 'deep_dive'
      ? payload.workflow_mode
      : 'balanced',
    minimum_evidence_target: typeof payload.minimum_evidence_target === 'number'
      ? payload.minimum_evidence_target
      : undefined,
    resume_priority: typeof payload.resume_priority === 'string' ? payload.resume_priority : undefined,
    seniority_delta: typeof payload.seniority_delta === 'string' ? payload.seniority_delta : undefined,
  };

  const authHeader = c.req.header('Authorization');
  const proxyRequest = new Request('http://internal/pipeline/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify(startBody),
  });

  let proxyResponse: Response;
  try {
    proxyResponse = await pipelineRouter.fetch(proxyRequest);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to restart pipeline';
    return c.json({ error: message }, 500);
  }

  const proxyData = await proxyResponse.json().catch(() => ({} as { error?: string; status?: string }));
  if (!proxyResponse.ok) {
    const body = {
      ...(proxyData && typeof proxyData === 'object' ? proxyData : {}),
      restart_source: 'server_artifact',
    };
    return new Response(JSON.stringify(body), {
      status: proxyResponse.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return c.json({
    ...(proxyData && typeof proxyData === 'object' ? proxyData : {}),
    restart_source: 'server_artifact',
    restarted_from_artifact_version: artifact?.version ?? null,
    restart_inputs_created_at: artifact?.created_at ?? null,
  });
});

workflow.get('/:sessionId/node/:nodeKey', rateLimitMiddleware(240, 60_000), async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');
  const nodeKey = c.req.param('nodeKey');
  if (!isValidUuid(sessionId)) return c.json({ error: 'Invalid session id' }, 400);
  if (!isWorkflowNodeKey(nodeKey)) return c.json({ error: 'Invalid workflow node' }, 400);

  const session = await requireOwnedSession(sessionId, user.id);
  if (!session) return c.json({ error: 'Session not found' }, 404);

  const { data: artifacts, error } = await supabaseAdmin
    .from('session_workflow_artifacts')
    .select('id, node_key, artifact_type, version, payload, created_by, created_at')
    .eq('session_id', sessionId)
    .eq('node_key', nodeKey)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return c.json({ error: 'Failed to load workflow artifacts' }, 500);

  return c.json({
    session_id: sessionId,
    node_key: nodeKey,
    artifacts: artifacts ?? [],
  });
});

workflow.get('/:sessionId/node/:nodeKey/history', rateLimitMiddleware(240, 60_000), async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');
  const nodeKey = c.req.param('nodeKey');
  if (!isValidUuid(sessionId)) return c.json({ error: 'Invalid session id' }, 400);
  if (!isWorkflowNodeKey(nodeKey)) return c.json({ error: 'Invalid workflow node' }, 400);

  const session = await requireOwnedSession(sessionId, user.id);
  if (!session) return c.json({ error: 'Session not found' }, 404);

  const { data: artifacts, error } = await supabaseAdmin
    .from('session_workflow_artifacts')
    .select('id, node_key, artifact_type, version, created_by, created_at')
    .eq('session_id', sessionId)
    .eq('node_key', nodeKey)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return c.json({ error: 'Failed to load workflow artifact history' }, 500);

  return c.json({
    session_id: sessionId,
    node_key: nodeKey,
    history: artifacts ?? [],
  });
});

const deferQuestionSchema = z.object({
  question_id: z.string().min(1).max(200),
  stage: z.string().min(1).max(100).optional(),
  reason: z.string().max(500).optional(),
});

workflow.post('/:sessionId/questions/defer', rateLimitMiddleware(60, 60_000), async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');
  if (!isValidUuid(sessionId)) return c.json({ error: 'Invalid session id' }, 400);
  const session = await requireOwnedSession(sessionId, user.id);
  if (!session) return c.json({ error: 'Session not found' }, 404);

  const parsedBody = await parseJsonBodyWithLimit(c, MAX_WORKFLOW_MUTATION_BODY_BYTES);
  if (!parsedBody.ok) return parsedBody.response;
  const parsed = deferQuestionSchema.safeParse(parsedBody.data);
  if (!parsed.success) return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400);

  const stage = parsed.data.stage ?? (session.pipeline_stage as string | null | undefined) ?? 'unknown';
  const { error } = await supabaseAdmin
    .from('session_question_responses')
    .upsert({
      session_id: sessionId,
      question_id: parsed.data.question_id,
      stage,
      status: 'deferred',
      response: { reason: parsed.data.reason ?? null },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'session_id,question_id' });
  if (error) return c.json({ error: 'Failed to defer question' }, 500);

  return c.json({ status: 'deferred', question_id: parsed.data.question_id });
});

const batchSubmitSchema = z.object({
  responses: z.array(z.object({
    question_id: z.string().min(1).max(200),
    stage: z.string().min(1).max(100).optional(),
    status: z.enum(['answered', 'skipped', 'deferred']).optional(),
    response: z.unknown().optional().refine(
      (v) => v === undefined || JSON.stringify(v).length <= 50_000,
      'Response payload too large (50KB limit)',
    ),
    impact_tag: z.string().max(100).optional(),
  })).min(1).max(100),
});

const workflowPreferencesSchema = z.object({
  workflow_mode: z.enum(['fast_draft', 'balanced', 'deep_dive']).optional(),
  minimum_evidence_target: z.number().int().min(3).max(20).optional(),
}).refine(
  (v) => v.workflow_mode !== undefined || v.minimum_evidence_target !== undefined,
  'Provide at least one preference to update',
);

workflow.post('/:sessionId/questions/batch-submit', rateLimitMiddleware(30, 60_000), async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');
  if (!isValidUuid(sessionId)) return c.json({ error: 'Invalid session id' }, 400);
  const session = await requireOwnedSession(sessionId, user.id);
  if (!session) return c.json({ error: 'Session not found' }, 404);

  const parsedBody = await parseJsonBodyWithLimit(c, MAX_WORKFLOW_MUTATION_BODY_BYTES);
  if (!parsedBody.ok) return parsedBody.response;
  const parsed = batchSubmitSchema.safeParse(parsedBody.data);
  if (!parsed.success) return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400);

  const stageFallback = (session.pipeline_stage as string | null | undefined) ?? 'unknown';
  const rows = parsed.data.responses.map((r) => ({
    session_id: sessionId,
    question_id: r.question_id,
    stage: r.stage ?? stageFallback,
    status: r.status ?? 'answered',
    response: r.response ?? null,
    impact_tag: r.impact_tag ?? null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabaseAdmin
    .from('session_question_responses')
    .upsert(rows, { onConflict: 'session_id,question_id' });
  if (error) return c.json({ error: 'Failed to save question responses' }, 500);

  return c.json({ status: 'ok', count: rows.length });
});

workflow.post('/:sessionId/preferences', rateLimitMiddleware(40, 60_000), async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');
  if (!isValidUuid(sessionId)) return c.json({ error: 'Invalid session id' }, 400);
  const session = await requireOwnedSession(sessionId, user.id);
  if (!session) return c.json({ error: 'Session not found' }, 404);

  const parsedBody = await parseJsonBodyWithLimit(c, MAX_WORKFLOW_MUTATION_BODY_BYTES);
  if (!parsedBody.ok) return parsedBody.response;
  const parsed = workflowPreferencesSchema.safeParse(parsedBody.data);
  if (!parsed.success) return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400);

  const nextPreferences = {
    ...(parsed.data.workflow_mode ? { workflow_mode: parsed.data.workflow_mode } : {}),
    ...(typeof parsed.data.minimum_evidence_target === 'number'
      ? { minimum_evidence_target: parsed.data.minimum_evidence_target }
      : {}),
    updated_at: new Date().toISOString(),
  };

  let version = 0;
  try {
    version = await insertArtifact(sessionId, 'overview', 'workflow_preferences', nextPreferences, 'user', 'in_progress');
  } catch {
    return c.json({ error: 'Failed to persist workflow preferences' }, 500);
  }

  await supabaseAdmin
    .from('session_workflow_nodes')
    .upsert({
      session_id: sessionId,
      node_key: 'overview',
      status: 'in_progress',
      updated_at: new Date().toISOString(),
      meta: {
        workflow_preferences_version: version,
        workflow_mode: nextPreferences.workflow_mode ?? null,
        minimum_evidence_target: nextPreferences.minimum_evidence_target ?? null,
      },
    }, { onConflict: 'session_id,node_key' });

  const emitters = sseConnections.get(sessionId);
  if (emitters && session.pipeline_status === 'running') {
    for (const emitter of emitters) {
      try {
        emitter({
          type: 'transparency',
          stage: (typeof session.pipeline_stage === 'string' ? session.pipeline_stage : 'positioning') as
            | 'intake'
            | 'positioning'
            | 'research'
            | 'gap_analysis'
            | 'architect'
            | 'architect_review'
            | 'section_writing'
            | 'section_review'
            | 'quality_review'
            | 'revision'
            | 'complete',
          message: 'Updated workflow preferences were saved. The current run will apply them at the next safe checkpoint.',
        });
      } catch {
        // connection may be closed
      }
    }
  }

  return c.json({
    status: 'ok',
    version,
    preferences: nextPreferences,
    applies_to_current_run: session.pipeline_status === 'running',
    apply_mode: session.pipeline_status === 'running' ? 'next_safe_checkpoint' : 'next_run',
  });
});

const benchmarkAssumptionsSchema = z.object({
  assumptions: z.record(z.string().max(200), z.unknown()).refine(
    (v) => Object.keys(v).length <= 50,
    'Too many assumption keys (max 50)',
  ),
  note: z.string().max(1000).optional(),
  confirm_rebuild: z.boolean().optional(),
});

const BENCHMARK_REBUILD_CONFIRMATION_STAGES = new Set([
  'section_writing',
  'section_review',
  'quality_review',
  'revision',
  'complete',
]);

workflow.post('/:sessionId/benchmark/assumptions', rateLimitMiddleware(20, 60_000), async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');
  if (!isValidUuid(sessionId)) return c.json({ error: 'Invalid session id' }, 400);
  const session = await requireOwnedSession(sessionId, user.id);
  if (!session) return c.json({ error: 'Session not found' }, 404);

  const parsedBody = await parseJsonBodyWithLimit(c, MAX_WORKFLOW_MUTATION_BODY_BYTES);
  if (!parsedBody.ok) return parsedBody.response;
  const parsed = benchmarkAssumptionsSchema.safeParse(parsedBody.data);
  if (!parsed.success) return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400);

  const currentStage = typeof session.pipeline_stage === 'string' ? session.pipeline_stage : null;
  const lateStageEdit = currentStage ? BENCHMARK_REBUILD_CONFIRMATION_STAGES.has(currentStage) : false;
  if (lateStageEdit && parsed.data.confirm_rebuild !== true) {
    return c.json({
      error: 'Changing the benchmark after section writing starts requires a rebuild of downstream work.',
      code: 'BENCHMARK_REBUILD_CONFIRM_REQUIRED',
      current_stage: currentStage,
      rebuild_from_stage: 'gap_analysis',
      message: 'This will regenerate gap analysis, blueprint, sections, quality review, and export outputs using the updated benchmark.',
    }, 409);
  }

  let version = 0;
  try {
    version = await insertArtifact(sessionId, 'benchmark', 'benchmark_assumptions_edit', {
      assumptions: parsed.data.assumptions,
      note: parsed.data.note ?? null,
      edited_at: new Date().toISOString(),
    });
  } catch {
    return c.json({ error: 'Failed to persist benchmark assumptions' }, 500);
  }

  void insertArtifact(sessionId, 'overview', 'workflow_replan_status', {
    type: 'workflow_replan_requested',
    reason: 'benchmark_assumptions_updated',
    benchmark_edit_version: version,
    rebuild_from_stage: 'gap_analysis',
    requires_restart: lateStageEdit && session.pipeline_status === 'running',
    current_stage: (typeof session.pipeline_stage === 'string' ? session.pipeline_stage : 'research'),
    stale_nodes: ['gaps', 'questions', 'blueprint', 'sections', 'quality', 'export'],
    message: lateStageEdit
      ? 'Benchmark assumptions were updated after section writing started. Restart is required to rebuild downstream work consistently.'
      : 'Benchmark assumptions were updated. The current run will replan downstream work at the next safe checkpoint.',
    requested_at: new Date().toISOString(),
  }, 'system', 'in_progress').catch(() => {
    // best effort: summary can still infer from stale nodes
  });

  const staleNodes = ['gaps', 'questions', 'blueprint', 'sections', 'quality', 'export'];
  await supabaseAdmin
    .from('session_workflow_nodes')
    .upsert(
      staleNodes.map((nodeKey) => ({
        session_id: sessionId,
        node_key: nodeKey,
        status: 'stale',
        updated_at: new Date().toISOString(),
        meta: {
          reason: 'benchmark_assumptions_updated',
          benchmark_assumptions_version: version,
          requires_restart: lateStageEdit && session.pipeline_status === 'running',
          rebuild_from_stage: 'gap_analysis',
        },
      })),
      { onConflict: 'session_id,node_key' },
    );

  const emitters = sseConnections.get(sessionId);
  if (emitters && session.pipeline_status === 'running') {
    for (const emitter of emitters) {
      try {
        emitter({
          type: 'workflow_replan_requested',
          reason: 'benchmark_assumptions_updated',
          benchmark_edit_version: version,
          rebuild_from_stage: 'gap_analysis',
          requires_restart: lateStageEdit,
          current_stage: (typeof session.pipeline_stage === 'string'
            ? session.pipeline_stage
            : 'research') as
            | 'intake'
            | 'positioning'
            | 'research'
            | 'gap_analysis'
            | 'architect'
            | 'architect_review'
            | 'section_writing'
            | 'section_review'
            | 'quality_review'
            | 'revision'
            | 'complete',
          stale_nodes: ['gaps', 'questions', 'blueprint', 'sections', 'quality', 'export'],
          message: lateStageEdit
            ? 'Benchmark assumptions were updated after section writing started. Restart is required to rebuild downstream work consistently.'
            : 'Benchmark assumptions were updated. The current run will replan downstream work at the next safe checkpoint.',
        });
        emitter({
          type: 'transparency',
          stage: 'research',
          message: lateStageEdit
            ? 'Benchmark assumptions updated after section writing started. Downstream work was marked stale; restart the pipeline to rebuild consistently from gap analysis.'
            : 'Benchmark assumptions updated. The current run will apply the revised benchmark at the next safe checkpoint and regenerate downstream analysis.',
        });
      } catch {
        // connection may be closed
      }
    }
  }

  return c.json({
    status: 'ok',
    node_key: 'benchmark',
    version,
    marked_stale: staleNodes,
    applies_to_current_run: session.pipeline_status === 'running' && !lateStageEdit,
    apply_mode: lateStageEdit ? 'restart_required' : 'next_safe_checkpoint',
    requires_restart: lateStageEdit && session.pipeline_status === 'running',
    rebuild_confirmed: lateStageEdit && parsed.data.confirm_rebuild === true,
    rebuild_from_stage: lateStageEdit ? 'gap_analysis' : null,
  });
});

workflow.post('/:sessionId/generate-draft-now', rateLimitMiddleware(20, 60_000), async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');
  if (!isValidUuid(sessionId)) return c.json({ error: 'Invalid session id' }, 400);
  const session = await requireOwnedSession(sessionId, user.id);
  if (!session) return c.json({ error: 'Session not found' }, 404);

  try {
    await persistDraftNowRequest(sessionId, session.pipeline_stage as string | null | undefined);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to persist draft-now request' }, 500);
  }

  if (session.pipeline_status !== 'running') {
    return c.json({
      status: 'queued',
      message: 'Draft-now preference saved for this session. Start or resume the pipeline to apply it.',
      pipeline_stage: session.pipeline_stage,
      pending_gate: session.pending_gate,
    });
  }

  const updatedAtMs = Date.parse(session.updated_at ?? '');
  if (Number.isFinite(updatedAtMs) && (Date.now() - updatedAtMs > STALE_PIPELINE_MS)) {
    return c.json({
      error: 'Pipeline appears stale. Please restart before using draft-now.',
      code: 'STALE_PIPELINE',
    }, 409);
  }

  const pendingGate = typeof session.pending_gate === 'string' ? session.pending_gate : null;
  if (!pendingGate) {
    return c.json({
      status: 'queued',
      message: 'Draft-now request saved. The pipeline will use it at the next question checkpoint.',
      pipeline_stage: session.pipeline_stage,
      pending_gate: null,
    });
  }

  let responseToGate: unknown = null;
  let autoHandled = false;

  if (pendingGate.startsWith('positioning_q_')) {
    responseToGate = {
      answer: '',
      deferred: true,
      draft_now: true,
      status: 'deferred',
    };
    autoHandled = true;
  } else if (pendingGate.startsWith('questionnaire_')) {
    let submission = buildSkippedQuestionnaireSubmission(session.last_panel_data, pendingGate);
    if (!submission) {
      const { data: artifacts } = await supabaseAdmin
        .from('session_workflow_artifacts')
        .select('payload, created_at')
        .eq('session_id', sessionId)
        .eq('node_key', 'questions')
        .eq('artifact_type', 'questionnaire')
        .order('created_at', { ascending: false })
        .limit(10);
      for (const artifact of artifacts ?? []) {
        submission = buildSkippedQuestionnaireSubmission(artifact.payload, pendingGate);
        if (submission) break;
      }
    }
    if (!submission) {
      const questionnaireId = pendingGate.startsWith('questionnaire_')
        ? pendingGate.slice('questionnaire_'.length)
        : pendingGate;
      submission = {
        questionnaire_id: questionnaireId,
        schema_version: 1,
        stage: (session.pipeline_stage as string) ?? 'unknown',
        responses: [],
        submitted_at: new Date().toISOString(),
        generated_by: 'generate_draft_now_fallback',
      };
    }
    responseToGate = submission;
    autoHandled = true;
  } else if (pendingGate === 'architect_review') {
    responseToGate = true;
    autoHandled = true;
  } else if (pendingGate.startsWith('section_review_')) {
    const sectionName = pendingGate.slice('section_review_'.length);
    const emitters = sseConnections.get(sessionId);
    if (emitters) {
      for (const emitter of emitters) {
        try {
          emitter({ type: 'transparency', stage: 'section_review', message: `Draft-now auto-approved section "${sectionName}" without user review` });
        } catch { /* closed */ }
      }
    }
    responseToGate = true;
    autoHandled = true;
  } else if (pendingGate === 'positioning_profile_choice') {
    responseToGate = 'fresh';
    autoHandled = true;
  }

  if (!autoHandled) {
    return c.json({
      status: 'queued',
      message: `Draft-now request saved, but current gate '${pendingGate}' was left for manual review.`,
      pipeline_stage: session.pipeline_stage,
      pending_gate: pendingGate,
      auto_responded: false,
    });
  }

  try {
    const gateResult = await persistPendingOrBufferedGateResponse(
      sessionId,
      pendingGate,
      session.pending_gate_data,
      pendingGate,
      responseToGate,
    );
    return c.json({
      status: gateResult.status,
      message: 'Draft-now requested. The current gate was answered automatically to continue pipeline progress.',
      pipeline_stage: session.pipeline_stage,
      pending_gate: pendingGate,
      auto_responded: true,
    });
  } catch (err) {
    return c.json({
      error: err instanceof Error ? err.message : 'Failed to submit draft-now gate response',
      pending_gate: pendingGate,
    }, 500);
  }
});

export { workflow };
