/**
 * Workflow Persistence Helpers — shared by event middleware and route hooks.
 *
 * Provides best-effort DB persistence for workflow node statuses and artifacts.
 * "Best effort" means failures are logged but never thrown, so callers can
 * fire-and-forget without blocking the pipeline.
 */

import { supabaseAdmin } from './supabase.js';
import logger from './logger.js';
import { WORKFLOW_NODE_KEYS, type WorkflowNodeKey, type WorkflowNodeStatus } from './workflow-nodes.js';

// ─── Core helpers (async, may throw) ─────────────────────────────────

async function upsertWorkflowNodeStatus(
  sessionId: string,
  nodeKey: WorkflowNodeKey,
  status: WorkflowNodeStatus,
  meta?: Record<string, unknown>,
  activeVersion?: number | null,
): Promise<void> {
  const payload: Record<string, unknown> = {
    session_id: sessionId,
    node_key: nodeKey,
    status,
    updated_at: new Date().toISOString(),
  };
  if (typeof activeVersion === 'number') payload.active_version = activeVersion;
  if (meta) payload.meta = meta;

  const { error } = await supabaseAdmin
    .from('session_workflow_nodes')
    .upsert(payload, { onConflict: 'session_id,node_key' });
  if (error) {
    logger.warn(
      { session_id: sessionId, node_key: nodeKey, status, error: error.message },
      'Failed to upsert workflow node status',
    );
  }
}

async function persistWorkflowArtifact(
  sessionId: string,
  nodeKey: WorkflowNodeKey,
  artifactType: string,
  payload: unknown,
  createdBy = 'pipeline',
): Promise<void> {
  const { data, error } = await supabaseAdmin.rpc('next_artifact_version', {
    p_session_id: sessionId,
    p_node_key: nodeKey,
    p_artifact_type: artifactType,
    p_payload: payload,
    p_created_by: createdBy,
  });
  if (error) {
    logger.warn(
      { session_id: sessionId, node_key: nodeKey, artifact_type: artifactType, error: error.message },
      'Failed to persist workflow artifact',
    );
    return;
  }
  const version = typeof data === 'number' ? data : 1;
  await upsertWorkflowNodeStatus(sessionId, nodeKey, 'complete', undefined, version);
}

// ─── Best-effort wrappers (fire-and-forget) ──────────────────────────

export function persistWorkflowArtifactBestEffort(
  sessionId: string,
  nodeKey: WorkflowNodeKey,
  artifactType: string,
  payload: unknown,
  createdBy = 'pipeline',
): void {
  persistWorkflowArtifact(sessionId, nodeKey, artifactType, payload, createdBy).catch((err: unknown) => {
    logger.warn(
      { session_id: sessionId, node_key: nodeKey, artifact_type: artifactType, err },
      'persistWorkflowArtifact failed',
    );
  });
}

export function upsertWorkflowNodeStatusBestEffort(
  sessionId: string,
  nodeKey: WorkflowNodeKey,
  status: WorkflowNodeStatus,
  meta?: Record<string, unknown>,
): void {
  upsertWorkflowNodeStatus(sessionId, nodeKey, status, meta).catch((err: unknown) => {
    logger.warn(
      { session_id: sessionId, node_key: nodeKey, status, err },
      'upsertWorkflowNodeStatus failed',
    );
  });
}

export function resetWorkflowNodesForNewRunBestEffort(sessionId: string): void {
  (async () => {
    const now = new Date().toISOString();
    const rows = WORKFLOW_NODE_KEYS.map((nodeKey) => ({
      session_id: sessionId,
      node_key: nodeKey,
      status: nodeKey === 'overview' ? 'in_progress' : 'locked',
      active_version: null,
      updated_at: now,
      meta: null,
    }));
    const { error } = await supabaseAdmin
      .from('session_workflow_nodes')
      .upsert(rows, { onConflict: 'session_id,node_key' });
    if (error) {
      logger.warn({ session_id: sessionId, error: error.message }, 'Failed to reset workflow nodes for new run');
    }
  })().catch((err: unknown) => {
    logger.warn({ session_id: sessionId, err }, 'resetWorkflowNodesForNewRunBestEffort failed');
  });
}
