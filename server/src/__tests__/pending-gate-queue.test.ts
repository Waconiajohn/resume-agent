import { describe, expect, it } from 'vitest';
import {
  getPendingGateQueueConfig,
  getResponseQueue,
  parsePendingGatePayload,
  withResponseQueue,
} from '../lib/pending-gate-queue.js';

describe('pending gate queue helpers', () => {
  it('parses non-object payloads as empty', () => {
    expect(parsePendingGatePayload(null)).toEqual({});
    expect(parsePendingGatePayload([])).toEqual({});
    expect(parsePendingGatePayload('x')).toEqual({});
  });

  it('folds legacy buffered fields into response queue', () => {
    const queue = getResponseQueue({
      buffered_gate: 'gate_a',
      buffered_response: { ok: true },
      buffered_at: '2026-02-20T00:00:00.000Z',
    });
    expect(queue).toHaveLength(1);
    expect(queue[0].gate).toBe('gate_a');
  });

  it('strips legacy fields when writing response_queue payload', () => {
    const payload = withResponseQueue(
      {
        buffered_gate: 'legacy',
        buffered_response: 'x',
        buffered_at: '2026-02-20T00:00:00.000Z',
      },
      [{ gate: 'g1', response: { answer: 1 }, responded_at: '2026-02-20T00:01:00.000Z' }],
    );
    expect(payload.buffered_gate).toBeUndefined();
    expect(payload.buffered_response).toBeUndefined();
    expect(payload.buffered_at).toBeUndefined();
    expect(payload.response_queue).toHaveLength(1);
  });

  it('enforces queue count and total byte budget', () => {
    const cfg = getPendingGateQueueConfig();
    const queue = getResponseQueue({
      response_queue: Array.from({ length: 60 }).map((_, i) => ({
        gate: `gate_${i}`,
        response: 'x'.repeat(80_000),
        responded_at: `2026-02-20T00:${String(i % 60).padStart(2, '0')}:00.000Z`,
      })),
    });
    expect(queue.length).toBeLessThanOrEqual(cfg.max_buffered_responses);
    const bytes = Buffer.byteLength(JSON.stringify(queue), 'utf8');
    expect(bytes).toBeLessThanOrEqual(cfg.max_buffered_responses_total_bytes);
  });

  it('truncates oversized string response items', () => {
    const cfg = getPendingGateQueueConfig();
    const queue = getResponseQueue({
      response_queue: [{
        gate: 'gate_big',
        response: 'x'.repeat(cfg.max_buffered_response_item_bytes * 2),
        responded_at: '2026-02-20T00:00:00.000Z',
      }],
    });
    expect(queue).toHaveLength(1);
    expect(typeof queue[0].response).toBe('string');
    expect((queue[0].response as string).includes('[truncated for size]')).toBe(true);
  });
});
