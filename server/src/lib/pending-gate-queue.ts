import { parsePositiveInt } from './http-body-guard.js';

export type BufferedResponseItem = {
  gate: string;
  response: unknown;
  responded_at: string;
};

export type PendingGatePayload = {
  created_at?: string;
  gate?: string;
  response?: unknown;
  response_gate?: string;
  responded_at?: string;
  response_queue?: BufferedResponseItem[];
  // Legacy single-buffer fields (kept for migration compatibility)
  buffered_gate?: string;
  buffered_response?: unknown;
  buffered_at?: string;
};

const MAX_BUFFERED_RESPONSES = parsePositiveInt(process.env.MAX_BUFFERED_RESPONSES, 25);
const MAX_BUFFERED_RESPONSE_ITEM_BYTES = parsePositiveInt(process.env.MAX_BUFFERED_RESPONSE_ITEM_BYTES, 100_000);
const MAX_BUFFERED_RESPONSES_TOTAL_BYTES = parsePositiveInt(process.env.MAX_BUFFERED_RESPONSES_TOTAL_BYTES, 300_000);

function jsonByteLength(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function truncateResponseForQueue(response: unknown): unknown {
  if (jsonByteLength(response) <= MAX_BUFFERED_RESPONSE_ITEM_BYTES) return response;

  if (typeof response === 'string') {
    const limit = Math.max(64, Math.floor(MAX_BUFFERED_RESPONSE_ITEM_BYTES * 0.75));
    const truncated = response.slice(0, limit);
    return `${truncated}...[truncated for size]`;
  }

  return {
    truncated: true,
    reason: 'buffered_response_too_large',
    max_bytes: MAX_BUFFERED_RESPONSE_ITEM_BYTES,
    original_type: Array.isArray(response) ? 'array' : typeof response,
  };
}

function normalizeQueue(queue: BufferedResponseItem[]): BufferedResponseItem[] {
  const normalized = queue
    .slice(-MAX_BUFFERED_RESPONSES)
    .map((item) => ({
      gate: String(item.gate ?? '').slice(0, 100),
      responded_at: String(item.responded_at ?? '').slice(0, 64) || new Date().toISOString(),
      response: truncateResponseForQueue(item.response),
    }))
    .filter((item) => item.gate.length > 0);

  while (normalized.length > 1 && jsonByteLength(normalized) > MAX_BUFFERED_RESPONSES_TOTAL_BYTES) {
    normalized.shift();
  }

  if (normalized.length === 1 && jsonByteLength(normalized) > MAX_BUFFERED_RESPONSES_TOTAL_BYTES) {
    normalized[0] = {
      ...normalized[0],
      response: {
        truncated: true,
        reason: 'response_queue_budget_exceeded',
        max_total_bytes: MAX_BUFFERED_RESPONSES_TOTAL_BYTES,
      },
    };
  }

  return normalized;
}

export function parsePendingGatePayload(raw: unknown): PendingGatePayload {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as PendingGatePayload;
}

export function getResponseQueue(payload: PendingGatePayload): BufferedResponseItem[] {
  const queue = Array.isArray(payload.response_queue)
    ? payload.response_queue.filter((item) =>
      item
      && typeof item === 'object'
      && typeof (item as { gate?: unknown }).gate === 'string'
      && 'response' in (item as Record<string, unknown>)
      && typeof (item as { responded_at?: unknown }).responded_at === 'string')
    : [];

  // Backward compatibility: fold old single buffered fields into the queue.
  // Delete legacy fields immediately after migration so repeated calls to
  // getResponseQueue() on the same payload object do not re-add the entry.
  if (payload.buffered_gate && 'buffered_response' in payload) {
    queue.push({
      gate: payload.buffered_gate,
      response: payload.buffered_response,
      responded_at: payload.buffered_at ?? new Date().toISOString(),
    });
    delete (payload as Record<string, unknown>).buffered_gate;
    delete (payload as Record<string, unknown>).buffered_response;
    delete (payload as Record<string, unknown>).buffered_at;
  }

  return normalizeQueue(queue);
}

export function withResponseQueue(payload: PendingGatePayload, queue: BufferedResponseItem[]): PendingGatePayload {
  const normalized = {
    ...payload,
    response_queue: normalizeQueue(queue),
  };
  delete normalized.buffered_gate;
  delete normalized.buffered_response;
  delete normalized.buffered_at;
  return normalized;
}

export function getPendingGateQueueConfig() {
  return {
    max_buffered_responses: MAX_BUFFERED_RESPONSES,
    max_buffered_response_item_bytes: MAX_BUFFERED_RESPONSE_ITEM_BYTES,
    max_buffered_responses_total_bytes: MAX_BUFFERED_RESPONSES_TOTAL_BYTES,
  };
}
