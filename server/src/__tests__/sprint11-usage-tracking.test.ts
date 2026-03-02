/**
 * Sprint 11, Story 6: Improve Usage Tracking Clarity
 *
 * Covers:
 *   1. recordUsage always logs a warning when no accumulator exists (regardless of map size)
 *   2. recordUsage includes sessionId, usage, and activeAccumulatorCount in the log payload
 *   3. recordUsage does not modify any accumulator when no accumulator is found
 *   4. recordUsage correctly accumulates when a valid accumulator exists
 *   5. Warning fires with no active accumulators (size === 0)
 *   6. Warning fires with multiple active accumulators (size > 1, old guard would have suppressed)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Logger mock — must be hoisted before any module imports ─────────────────

const mockWarn = vi.hoisted(() => vi.fn());

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: mockWarn,
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

// Mock usage-persistence to avoid real DB calls from startUsageTracking intervals.
vi.mock('../lib/usage-persistence.js', () => ({
  flushUsageToDb: vi.fn().mockResolvedValue(undefined),
  clearUsageWatermark: vi.fn(),
}));

import {
  recordUsage,
  startUsageTracking,
  stopUsageTracking,
} from '../lib/llm-provider.js';

describe('recordUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when no accumulator exists for the given sessionId', () => {
    it('logs a warning when there are zero active accumulators', () => {
      // No sessions registered — size is 0.
      recordUsage({ input_tokens: 100, output_tokens: 50 }, 'unknown-session');

      expect(mockWarn).toHaveBeenCalledOnce();
      const [payload, message] = mockWarn.mock.calls[0] as [Record<string, unknown>, string];
      expect(message).toBe('recordUsage: no accumulator found for session, dropping usage to avoid misattribution');
      expect(payload.sessionId).toBe('unknown-session');
      expect(payload.usage).toEqual({ input_tokens: 100, output_tokens: 50 });
      expect(payload.activeAccumulatorCount).toBe(0);
    });

    it('logs a warning when there are multiple active accumulators (old guard suppressed this)', () => {
      // Register two sessions to put the map size above 1.
      // Previously, the size === 1 guard would suppress the warning in this case.
      startUsageTracking('session-a');
      startUsageTracking('session-b');

      try {
        recordUsage({ input_tokens: 200, output_tokens: 80 }, 'session-not-registered');

        expect(mockWarn).toHaveBeenCalledOnce();
        const [payload] = mockWarn.mock.calls[0] as [Record<string, unknown>, string];
        expect(payload.sessionId).toBe('session-not-registered');
        expect(payload.activeAccumulatorCount).toBe(2);
      } finally {
        stopUsageTracking('session-a');
        stopUsageTracking('session-b');
      }
    });

    it('logs a warning when sessionId is undefined', () => {
      // No sessionId provided and no AsyncLocalStorage context active.
      recordUsage({ input_tokens: 10, output_tokens: 5 });

      expect(mockWarn).toHaveBeenCalledOnce();
      const [payload] = mockWarn.mock.calls[0] as [Record<string, unknown>, string];
      expect(payload.sessionId).toBeUndefined();
      expect(payload.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
      expect(payload.activeAccumulatorCount).toBe(0);
    });

    it('does not modify any registered accumulator when usage is dropped', () => {
      const acc = startUsageTracking('session-c');

      try {
        // Call with a different sessionId that has no accumulator.
        recordUsage({ input_tokens: 999, output_tokens: 999 }, 'session-not-registered');

        // The registered accumulator for session-c must be untouched.
        expect(acc.input_tokens).toBe(0);
        expect(acc.output_tokens).toBe(0);
      } finally {
        stopUsageTracking('session-c');
      }
    });
  });

  describe('when a valid accumulator exists', () => {
    it('accumulates tokens and does not log a warning', () => {
      const acc = startUsageTracking('session-d');

      try {
        recordUsage({ input_tokens: 300, output_tokens: 120 }, 'session-d');

        expect(acc.input_tokens).toBe(300);
        expect(acc.output_tokens).toBe(120);
        expect(mockWarn).not.toHaveBeenCalled();
      } finally {
        stopUsageTracking('session-d');
      }
    });

    it('accumulates tokens across multiple calls', () => {
      const acc = startUsageTracking('session-e');

      try {
        recordUsage({ input_tokens: 100, output_tokens: 40 }, 'session-e');
        recordUsage({ input_tokens: 200, output_tokens: 60 }, 'session-e');

        expect(acc.input_tokens).toBe(300);
        expect(acc.output_tokens).toBe(100);
        expect(mockWarn).not.toHaveBeenCalled();
      } finally {
        stopUsageTracking('session-e');
      }
    });
  });
});
