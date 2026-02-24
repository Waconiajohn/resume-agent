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
