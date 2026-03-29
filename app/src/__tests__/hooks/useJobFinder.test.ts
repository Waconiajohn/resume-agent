/**
 * useJobFinder — Hook tests.
 *
 * Validates SSE event handling, state transitions, gate flow, and lifecycle.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useJobFinder } from '@/hooks/useJobFinder';
import type { RankedMatch } from '@/hooks/useJobFinder';

// ─── Mocks ──────────────────────────────────────────────────────────

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

vi.mock('@/lib/sse-parser', () => ({
  parseSSEStream: vi.fn(),
}));

// ─── Helpers ────────────────────────────────────────────────────────

function makeEvent(type: string, data: Record<string, unknown>) {
  return { event: type, data: JSON.stringify(data) };
}

async function* makeSSEStream(events: { event: string; data: string }[]) {
  for (const evt of events) {
    yield evt;
  }
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('useJobFinder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' });
  });

  it('starts with correct initial state', () => {
    const { result } = renderHook(() => useJobFinder());
    expect(result.current.status).toBe('idle');
    expect(result.current.matches).toEqual([]);
    expect(result.current.gateData).toBeNull();
    expect(result.current.activityMessages).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('exposes all required methods', () => {
    const { result } = renderHook(() => useJobFinder());
    expect(typeof result.current.startSearch).toBe('function');
    expect(typeof result.current.respondToGate).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });

  it('reset clears state back to idle', () => {
    const { result } = renderHook(() => useJobFinder());
    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBe('idle');
    expect(result.current.matches).toEqual([]);
    expect(result.current.gateData).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.activityMessages).toEqual([]);
  });

  it('startSearch calls /job-finder/start endpoint with session_id', async () => {
    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue(makeSSEStream([]));

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({
        ok: true,
        body: {},
      });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useJobFinder());

    await act(async () => {
      await result.current.startSearch();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/job-finder/start',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ session_id: 'test-uuid' }),
      }),
    );
  });

  it('startSearch returns false when not authenticated', async () => {
    const { supabase } = await import('@/lib/supabase');
    (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { session: null },
    });

    const { result } = renderHook(() => useJobFinder());

    let success = true;
    await act(async () => {
      success = await result.current.startSearch();
    });

    expect(success).toBe(false);
    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('authenticated');
  });

  it('startSearch returns false on HTTP error from start endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: () => Promise.resolve('Service Unavailable'),
      }),
    );

    const { result } = renderHook(() => useJobFinder());

    let success = true;
    await act(async () => {
      success = await result.current.startSearch();
    });

    expect(success).toBe(false);
    expect(result.current.status).toBe('error');
  });

  it('startSearch returns false when already running', async () => {
    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue(makeSSEStream([]));

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, body: {} });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useJobFinder());

    // Start once
    await act(async () => {
      await result.current.startSearch();
    });

    // Try to start again — should be blocked
    let secondSuccess = true;
    await act(async () => {
      secondSuccess = await result.current.startSearch();
    });

    expect(secondSuccess).toBe(false);
  });

  it('handles results_ready SSE event and stores matches', async () => {
    const matches: RankedMatch[] = [
      {
        id: 'm1',
        title: 'VP Operations',
        company: 'Acme Corp',
        fit_score: 92,
        why_match: 'Strong turnaround experience match.',
      },
      {
        id: 'm2',
        title: 'COO',
        company: 'Beta Inc',
        fit_score: 85,
        why_match: 'Operational scale alignment.',
      },
    ];

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSSEStream([makeEvent('results_ready', { matches })]),
    );

    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true, body: {} }),
    );

    const { result } = renderHook(() => useJobFinder());

    await act(async () => {
      await result.current.startSearch();
    });

    expect(result.current.matches).toHaveLength(2);
    expect(result.current.matches[0].title).toBe('VP Operations');
    expect(result.current.matches[0].fit_score).toBe(92);
  });

  it('handles search_progress SSE event and records activity', async () => {
    const searches = [
      { platform: 'LinkedIn', query: '"VP Operations" OR "COO"' },
      { platform: 'Indeed', query: 'title:(VP OR Director)' },
    ];

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSSEStream([makeEvent('search_progress', { searches, message: 'Building search strings...' })]),
    );

    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true, body: {} }),
    );

    const { result } = renderHook(() => useJobFinder());

    await act(async () => {
      await result.current.startSearch();
    });

    expect(result.current.activityMessages.some((m) => m.message === 'Building search strings...')).toBe(true);
  });

  it('handles pipeline_gate SSE event — sets status to gate', async () => {
    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSSEStream([
        makeEvent('pipeline_gate', { topics: ['supply chain', 'operations'], results: { count: 6 } }),
      ]),
    );

    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true, body: {} }),
    );

    const { result } = renderHook(() => useJobFinder());

    await act(async () => {
      await result.current.startSearch();
    });

    expect(result.current.status).toBe('gate');
    expect(result.current.gateData).not.toBeNull();
    expect(result.current.gateData?.topics).toEqual(['supply chain', 'operations']);
  });

  it('handles job_finder_complete SSE event — sets status to complete', async () => {
    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSSEStream([makeEvent('job_finder_complete', { session_id: 'test-uuid' })]),
    );

    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true, body: {} }),
    );

    const { result } = renderHook(() => useJobFinder());

    await act(async () => {
      await result.current.startSearch();
    });

    expect(result.current.status).toBe('complete');
  });

  it('handles pipeline_error SSE event — sets status to error', async () => {
    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSSEStream([makeEvent('pipeline_error', { error: 'Search service unavailable' })]),
    );

    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true, body: {} }),
    );

    const { result } = renderHook(() => useJobFinder());

    await act(async () => {
      await result.current.startSearch();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Search service unavailable');
  });

  it('handles stage_start and transparency events — adds activity messages', async () => {
    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSSEStream([
        makeEvent('stage_start', { stage: 'search', message: 'Starting job search...' }),
        makeEvent('transparency', { stage: 'search', message: 'Querying 3 job boards...' }),
        makeEvent('stage_complete', { stage: 'search', message: 'Search complete.' }),
      ]),
    );

    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true, body: {} }),
    );

    const { result } = renderHook(() => useJobFinder());

    await act(async () => {
      await result.current.startSearch();
    });

    expect(result.current.activityMessages).toHaveLength(3);
    expect(result.current.activityMessages[0].message).toBe('Starting job search...');
    expect(result.current.activityMessages[1].message).toBe('Querying 3 job boards...');
    expect(result.current.activityMessages[2].message).toBe('Search complete.');
  });

  it('respondToGate returns false when no active session', async () => {
    const { result } = renderHook(() => useJobFinder());

    let success = true;
    await act(async () => {
      success = await result.current.respondToGate({ approved: true });
    });

    expect(success).toBe(false);
  });

  it('handles SSE event data shape for results_ready', () => {
    const event = makeEvent('results_ready', {
      matches: [
        { id: '1', title: 'VP Ops', company: 'Acme', fit_score: 88, why_match: 'Strong fit' },
      ],
    });
    const parsed = JSON.parse(event.data);
    expect(parsed.matches).toHaveLength(1);
    expect(parsed.matches[0].fit_score).toBe(88);
  });

  it('handles SSE event data shape for search_progress', () => {
    const event = makeEvent('search_progress', {
      searches: [{ platform: 'LinkedIn', query: '"VP Operations"' }],
      message: 'Generated 1 search string',
    });
    const parsed = JSON.parse(event.data);
    expect(parsed.searches).toHaveLength(1);
    expect(parsed.message).toContain('1 search string');
  });
});
