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
import { STALE_PIPELINE_MS } from './pipeline.js';

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

  const [{ data: nodeRows }, { data: artifactRows }] = await Promise.all([
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

const benchmarkAssumptionsSchema = z.object({
  assumptions: z.record(z.string().max(200), z.unknown()).refine(
    (v) => Object.keys(v).length <= 50,
    'Too many assumption keys (max 50)',
  ),
  note: z.string().max(1000).optional(),
});

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

  const staleNodes = ['gaps', 'questions', 'blueprint', 'sections', 'quality', 'export'];
  await supabaseAdmin
    .from('session_workflow_nodes')
    .upsert(
      staleNodes.map((nodeKey) => ({
        session_id: sessionId,
        node_key: nodeKey,
        status: 'stale',
        updated_at: new Date().toISOString(),
        meta: { reason: 'benchmark_assumptions_updated' },
      })),
      { onConflict: 'session_id,node_key' },
    );

  return c.json({ status: 'ok', node_key: 'benchmark', version, marked_stale: staleNodes });
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
