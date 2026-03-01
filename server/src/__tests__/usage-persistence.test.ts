/**
 * Tests for server/src/lib/usage-persistence.ts
 *
 * Covers:
 *   1. flushUsageToDb skips when delta is zero
 *   2. flushUsageToDb writes correct delta values on first flush
 *   3. Multiple flushes accumulate correctly (watermark advances per success)
 *   4. Final flush captures remaining data
 *   5. Watermark does not advance on DB error (retry on next flush)
 *   6. clearUsageWatermark removes the watermark entry
 *   7. RPC increment_user_usage is called with correct params
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Supabase mock — must be hoisted before any module imports ───────────────

const mockRpc = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    rpc: mockRpc,
  },
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

import {
  flushUsageToDb,
  clearUsageWatermark,
  getFlushWatermarks,
} from '../lib/usage-persistence.js';

describe('flushUsageToDb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset watermarks between tests by clearing all known sessions.
    for (const key of getFlushWatermarks().keys()) {
      clearUsageWatermark(key);
    }
  });

  it('skips rpc when both deltas are zero', async () => {
    mockRpc.mockResolvedValue({ error: null });

    await flushUsageToDb('session-1', 'user-1', { input_tokens: 0, output_tokens: 0 });

    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('writes correct delta on first flush (watermark starts at zero)', async () => {
    mockRpc.mockResolvedValue({ error: null });

    await flushUsageToDb('session-2', 'user-2', { input_tokens: 500, output_tokens: 200 });

    expect(mockRpc).toHaveBeenCalledOnce();
    expect(mockRpc).toHaveBeenCalledWith('increment_user_usage', expect.objectContaining({
      p_user_id: 'user-2',
      p_input_tokens: 500,
      p_output_tokens: 200,
      p_sessions: 0,
      p_cost: 0,
    }));
  });

  it('advances watermark and only sends delta on subsequent flush', async () => {
    mockRpc.mockResolvedValue({ error: null });

    // First flush: 500 input, 200 output
    await flushUsageToDb('session-3', 'user-3', { input_tokens: 500, output_tokens: 200 });

    // Second flush: 800 input, 350 output — delta should be 300 / 150
    await flushUsageToDb('session-3', 'user-3', { input_tokens: 800, output_tokens: 350 });

    expect(mockRpc).toHaveBeenCalledTimes(2);

    const secondCall = mockRpc.mock.calls[1] as [string, Record<string, unknown>];
    expect(secondCall[1].p_input_tokens).toBe(300);
    expect(secondCall[1].p_output_tokens).toBe(150);
  });

  it('does not advance watermark when rpc returns an error', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'db error' } });

    await flushUsageToDb('session-4', 'user-4', { input_tokens: 100, output_tokens: 50 });

    // Watermark should still be at zero — retry the same delta next time.
    const watermarks = getFlushWatermarks();
    const wm = watermarks.get('session-4');
    expect(wm).toBeUndefined();
  });

  it('captures remaining delta in a final flush after incremental flushes', async () => {
    mockRpc.mockResolvedValue({ error: null });

    // Simulate two periodic flushes during the session.
    await flushUsageToDb('session-5', 'user-5', { input_tokens: 1000, output_tokens: 400 });
    await flushUsageToDb('session-5', 'user-5', { input_tokens: 2000, output_tokens: 800 });

    // Simulate final flush with additional tokens accumulated since last flush.
    await flushUsageToDb('session-5', 'user-5', { input_tokens: 2500, output_tokens: 950 });

    expect(mockRpc).toHaveBeenCalledTimes(3);

    const thirdCall = mockRpc.mock.calls[2] as [string, Record<string, unknown>];
    // Delta: 2500 - 2000 = 500 input, 950 - 800 = 150 output
    expect(thirdCall[1].p_input_tokens).toBe(500);
    expect(thirdCall[1].p_output_tokens).toBe(150);
  });

  it('includes billing period in RPC params', async () => {
    mockRpc.mockResolvedValue({ error: null });

    await flushUsageToDb('session-period', 'user-period', { input_tokens: 100, output_tokens: 50 });

    const call = mockRpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(call[1].p_period_start).toBeDefined();
    expect(call[1].p_period_end).toBeDefined();
    // period_start should be an ISO date string
    expect(typeof call[1].p_period_start).toBe('string');
    expect(typeof call[1].p_period_end).toBe('string');
  });
});

describe('clearUsageWatermark', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of getFlushWatermarks().keys()) {
      clearUsageWatermark(key);
    }
  });

  it('removes the watermark entry for the given session', async () => {
    mockRpc.mockResolvedValue({ error: null });

    await flushUsageToDb('session-clear', 'user-clear', { input_tokens: 100, output_tokens: 50 });

    // Watermark should exist after a successful flush.
    expect(getFlushWatermarks().has('session-clear')).toBe(true);

    clearUsageWatermark('session-clear');

    expect(getFlushWatermarks().has('session-clear')).toBe(false);
  });

  it('is safe to call for a session that has no watermark', () => {
    // Should not throw.
    expect(() => clearUsageWatermark('nonexistent-session')).not.toThrow();
  });
});
