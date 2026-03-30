/**
 * useMomentum — Hook tests.
 *
 * Validates initial fetch, logActivity, dismissNudge, and error states.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  },
}));

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:3001/api',
}));

import { useMomentum } from '@/hooks/useMomentum';
import type { MomentumSummary, CoachingNudge } from '@/hooks/useMomentum';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MOCK_SUMMARY: MomentumSummary = {
  current_streak: 5,
  longest_streak: 10,
  total_activities: 42,
  this_week_activities: 7,
  recent_wins: [
    { id: 'w1', activity_type: 'resume_completed', metadata: {}, created_at: '2026-03-07T10:00:00Z' },
    { id: 'w2', activity_type: 'job_applied', metadata: {}, created_at: '2026-03-06T10:00:00Z' },
  ],
};

const MOCK_NUDGES: CoachingNudge[] = [
  {
    id: 'n1',
    user_id: 'test-user',
    trigger_type: 'inactivity',
    message: "It's been a few days — even 15 minutes of focused effort keeps momentum alive.",
    coaching_tone: 'warm',
    dismissed: false,
    created_at: '2026-03-07T09:00:00Z',
  },
  {
    id: 'n2',
    user_id: 'test-user',
    trigger_type: 'milestone',
    message: "You've applied to 10 roles — that's real momentum. Keep going.",
    coaching_tone: 'celebratory',
    dismissed: false,
    created_at: '2026-03-07T08:00:00Z',
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFetchSuccess(summaryData: unknown, nudgesData: unknown) {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes('/momentum/nudges') && !url.includes('dismiss')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ nudges: nudgesData }), text: () => Promise.resolve('') });
    }
    if (url.includes('/momentum/summary')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(summaryData), text: () => Promise.resolve('') });
    }
    // log, check-stalls, dismiss
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ nudges: [] }), text: () => Promise.resolve('') });
  });
}

function makeFetchFailSummary() {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes('/momentum/summary')) {
      return Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('Server error') });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]), text: () => Promise.resolve('') });
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('fetch', makeFetchSuccess(MOCK_SUMMARY, MOCK_NUDGES));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useMomentum', () => {
  it('starts with null summary, empty nudges, and loading=true then resolves', async () => {
    const { result } = renderHook(() => useMomentum());

    // Initially loading
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.summary).not.toBeNull();
    expect(result.current.nudges).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it('fetches summary and nudges in parallel on mount', async () => {
    const fetchMock = makeFetchSuccess(MOCK_SUMMARY, MOCK_NUDGES);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMomentum());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.summary?.current_streak).toBe(5);
    expect(result.current.summary?.longest_streak).toBe(10);
    expect(result.current.summary?.total_activities).toBe(42);
    expect(result.current.nudges).toHaveLength(2);
    expect(result.current.nudges[0].trigger_type).toBe('inactivity');
  });

  it('refresh re-fetches both endpoints', async () => {
    const fetchMock = makeFetchSuccess(MOCK_SUMMARY, MOCK_NUDGES);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMomentum());

    await waitFor(() => expect(result.current.loading).toBe(false));

    const callsBefore = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.length;

    await act(async () => {
      await result.current.refresh();
    });

    const callsAfter = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(callsAfter).toBeGreaterThan(callsBefore);
  });

  it('logActivity POSTs to /momentum/log then refreshes', async () => {
    const fetchMock = makeFetchSuccess(MOCK_SUMMARY, MOCK_NUDGES);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMomentum());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.logActivity('job_applied', 'app-123', { company: 'Acme' });
    });

    const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
    const logCall = calls.find(([url]) => url.includes('/momentum/log'));
    expect(logCall).toBeDefined();
    expect(logCall![1].method).toBe('POST');
    const body = JSON.parse(logCall![1].body as string) as Record<string, unknown>;
    expect(body.activity_type).toBe('job_applied');
    expect(body.related_id).toBe('app-123');
  });

  it('dismissNudge removes nudge optimistically from local state', async () => {
    const fetchMock = makeFetchSuccess(MOCK_SUMMARY, MOCK_NUDGES);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMomentum());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.nudges).toHaveLength(2);

    await act(async () => {
      await result.current.dismissNudge('n1');
    });

    expect(result.current.nudges).toHaveLength(1);
    expect(result.current.nudges.find((n) => n.id === 'n1')).toBeUndefined();
  });

  it('dismissNudge PATCHes the correct endpoint', async () => {
    const fetchMock = makeFetchSuccess(MOCK_SUMMARY, MOCK_NUDGES);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMomentum());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.dismissNudge('n2');
    });

    const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
    const dismissCall = calls.find(([url]) => url.includes('/momentum/nudges/n2/dismiss'));
    expect(dismissCall).toBeDefined();
    expect(dismissCall![1].method).toBe('PATCH');
  });

  it('sets error state when summary fetch fails', async () => {
    vi.stubGlobal('fetch', makeFetchFailSummary());

    const { result } = renderHook(() => useMomentum());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).not.toBeNull();
    expect(result.current.error).toContain('500');
    expect(result.current.summary).toBeNull();
  });

  it('sets error when not authenticated', async () => {
    const { supabase } = await import('@/lib/supabase');
    (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { session: null },
    });

    const { result } = renderHook(() => useMomentum());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Not authenticated');
    expect(result.current.summary).toBeNull();
    expect(result.current.nudges).toEqual([]);
  });

  it('clears stale summary and nudges when auth is lost on refresh', async () => {
    const { supabase } = await import('@/lib/supabase');
    const fetchMock = makeFetchSuccess(MOCK_SUMMARY, MOCK_NUDGES);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMomentum());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.summary?.current_streak).toBe(5);
    expect(result.current.nudges).toHaveLength(2);

    (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { session: null },
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBe('Not authenticated');
    expect(result.current.summary).toBeNull();
    expect(result.current.nudges).toEqual([]);
  });

  it('clears stale summary and nudges when the feature is disabled', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_SUMMARY), text: () => Promise.resolve('') }))
      .mockImplementationOnce(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({ nudges: MOCK_NUDGES }), text: () => Promise.resolve('') }))
      .mockImplementationOnce(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({ feature_disabled: true }), text: () => Promise.resolve('') }))
      .mockImplementationOnce(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({ nudges: MOCK_NUDGES }), text: () => Promise.resolve('') }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMomentum());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.summary).not.toBeNull();
    expect(result.current.nudges).toHaveLength(2);

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.summary).toBeNull();
    expect(result.current.nudges).toEqual([]);
  });

  it('checkStalls POSTs to /momentum/check-stalls', async () => {
    const fetchMock = makeFetchSuccess(MOCK_SUMMARY, MOCK_NUDGES);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMomentum());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.checkStalls();
    });

    const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
    const stallCall = calls.find(([url]) => url.includes('/momentum/check-stalls'));
    expect(stallCall).toBeDefined();
    expect(stallCall![1].method).toBe('POST');
  });
});
