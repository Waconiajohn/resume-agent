/**
 * SSE event factories matching the wire protocol in sse-parser.ts.
 * Format: `event: {name}\ndata: {json}\n\n`
 */

export interface SSEEvent {
  event: string;
  data: unknown;
}

/** Encode a single SSE event to wire format */
export function encodeSSEEvent(e: SSEEvent): string {
  return `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`;
}

/** Build a complete SSE response body from an array of events */
export function buildSSEBody(events: SSEEvent[]): string {
  return events.map(encodeSSEEvent).join('');
}

/** Connected event — triggers setConnected(true) in useAgent */
export function connectedEvent(): SSEEvent {
  return { event: 'connected', data: {} };
}

/** Stage start event */
export function stageStartEvent(stage: string, message: string): SSEEvent {
  return { event: 'stage_start', data: { stage, message } };
}

/** Stage complete event */
export function stageCompleteEvent(stage: string): SSEEvent {
  return { event: 'stage_complete', data: { stage } };
}

export function draftReadinessUpdateEvent(payload: {
  stage?: string;
  workflow_mode?: 'fast_draft' | 'balanced' | 'deep_dive';
  evidence_count: number;
  minimum_evidence_target: number;
  coverage_score: number;
  coverage_threshold: number;
  ready: boolean;
  note?: string;
}): SSEEvent {
  return {
    event: 'draft_readiness_update',
    data: {
      stage: payload.stage ?? 'gap_analysis',
      workflow_mode: payload.workflow_mode ?? 'balanced',
      ...payload,
    },
  };
}

export function workflowReplanRequestedEvent(payload: {
  benchmark_edit_version?: number;
  requires_restart?: boolean;
  current_stage?: string;
  stale_nodes?: string[];
  message?: string;
} = {}): SSEEvent {
  return {
    event: 'workflow_replan_requested',
    data: {
      reason: 'benchmark_assumptions_updated',
      benchmark_edit_version: payload.benchmark_edit_version ?? 1,
      rebuild_from_stage: 'gap_analysis',
      requires_restart: payload.requires_restart ?? false,
      current_stage: payload.current_stage ?? 'section_review',
      stale_nodes: payload.stale_nodes ?? ['gaps', 'questions', 'blueprint', 'sections', 'quality', 'export'],
      ...(payload.message ? { message: payload.message } : {}),
    },
  };
}

export function workflowReplanStartedEvent(payload: {
  benchmark_edit_version?: number;
  current_stage?: string;
  phase?: 'apply_benchmark_overrides' | 'refresh_gap_analysis' | 'rebuild_blueprint';
  message?: string;
} = {}): SSEEvent {
  return {
    event: 'workflow_replan_started',
    data: {
      reason: 'benchmark_assumptions_updated',
      benchmark_edit_version: payload.benchmark_edit_version ?? 1,
      rebuild_from_stage: 'gap_analysis',
      current_stage: payload.current_stage ?? 'architect',
      phase: payload.phase ?? 'refresh_gap_analysis',
      ...(payload.message ? { message: payload.message } : {}),
    },
  };
}

/**
 * section_context event — MUST arrive before section_draft.
 * Stored in sectionContextRef and merged when section_draft fires.
 */
export function sectionContextEvent(payload: {
  section: string;
  context_version: number;
  suggestions?: unknown[];
  evidence?: unknown[];
  keywords?: unknown[];
  gap_mappings?: unknown[];
  blueprint_slice?: Record<string, unknown>;
  section_order?: string[];
  sections_approved?: string[];
  review_strategy?: 'per_section' | 'bundled';
  review_required_sections?: string[];
  auto_approved_sections?: string[];
  current_review_bundle_key?: 'headline' | 'core_experience' | 'supporting';
  review_bundles?: Array<{
    key: 'headline' | 'core_experience' | 'supporting';
    label: string;
    total_sections: number;
    review_required: number;
    reviewed_required: number;
    status: 'pending' | 'in_progress' | 'complete' | 'auto_approved';
  }>;
  generated_at?: string;
}): SSEEvent {
  return {
    event: 'section_context',
    data: {
      generated_at: new Date().toISOString(),
      ...payload,
    },
  };
}

/**
 * section_draft event — triggers panelType='section_review' and renders SectionWorkbench.
 * Merges in whatever context was stored in sectionContextRef.
 */
export function sectionDraftEvent(payload: {
  section: string;
  content: string;
  review_token?: string;
}): SSEEvent {
  return { event: 'section_draft', data: payload };
}

/** pipeline_complete event */
export function pipelineCompleteEvent(): SSEEvent {
  return { event: 'pipeline_complete', data: {} };
}
