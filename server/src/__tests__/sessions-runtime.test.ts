import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase.js', () => {
  return {
    supabaseAdmin: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: null, error: null })),
            })),
            single: vi.fn(async () => ({ data: null, error: null })),
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
          limit: vi.fn(async () => ({ data: null, error: null })),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      })),
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: new Error('not used') })),
      },
      rpc: vi.fn(async () => ({ data: { allowed: true }, error: null })),
    },
  };
});

import {
  getSessionRouteStats,
  resetSessionRouteStateForTests,
  sessionRouteTestUtils,
} from '../routes/sessions.js';

function makeEmitter() {
  return (() => {
    // no-op
  }) as unknown as (event: unknown) => void;
}

describe('sessions route runtime guards', () => {
  beforeEach(() => {
    resetSessionRouteStateForTests();
  });

  it('does not decrement SSE counters when removing an unknown emitter', () => {
    const liveEmitter = makeEmitter();
    const unknownEmitter = makeEmitter();

    sessionRouteTestUtils.addSSEConnection('session-1', 'user-1', liveEmitter as never);
    sessionRouteTestUtils.removeSSEConnection('session-1', 'user-1', unknownEmitter as never);

    const stats = getSessionRouteStats();
    expect(stats.active_sse_sessions).toBe(1);
    expect(stats.total_sse_emitters).toBe(1);
    expect(stats.sse_users_tracked).toBe(1);
  });

  it('does not underflow SSE counters when removing the same emitter twice', () => {
    const emitter = makeEmitter();

    sessionRouteTestUtils.addSSEConnection('session-2', 'user-2', emitter as never);
    sessionRouteTestUtils.removeSSEConnection('session-2', 'user-2', emitter as never);
    sessionRouteTestUtils.removeSSEConnection('session-2', 'user-2', emitter as never);

    const stats = getSessionRouteStats();
    expect(stats.active_sse_sessions).toBe(0);
    expect(stats.total_sse_emitters).toBe(0);
    expect(stats.sse_users_tracked).toBe(0);
  });

  it('truncates restored message content to the configured cap', () => {
    const raw = 'x'.repeat(5000);
    const truncated = sessionRouteTestUtils.truncateRestoreText(raw);
    expect(truncated.length).toBeLessThanOrEqual(4003); // 4k + ellipsis
    expect(truncated.endsWith('...')).toBe(true);
  });
});
