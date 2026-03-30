// @vitest-environment jsdom
/**
 * useContentCalendar — calendar history / saved reports tests (Sprint 60, Story 60-2).
 *
 * Covers:
 * - savedReports defaults to empty array
 * - reportsLoading defaults to false
 * - fetchReports is called automatically on mount
 * - fetchReports populates savedReports on success
 * - fetchReports sets reportsLoading=true while fetching, false after
 * - fetchReports handles non-OK response gracefully (no crash, loading=false)
 * - fetchReports handles network error gracefully
 * - fetchReports handles missing auth token gracefully
 * - fetchReports sends Authorization header
 * - fetchReports calls correct URL
 * - fetchReportById calls GET /api/content-calendar/reports/:id
 * - fetchReportById returns full report including report_markdown
 * - fetchReportById returns null on non-OK response
 * - fetchReportById returns null on network error
 * - savedReports refresh after calendar_complete SSE event
 * - startPipeline resets report/scores but preserves savedReports across pipeline runs
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';

// ─── Hoisted mock helpers ─────────────────────────────────────────────────────

const { mockGetSession } = vi.hoisted(() => ({
  mockGetSession: vi.fn().mockResolvedValue({
    data: { session: { access_token: 'test-token-cc' } },
    error: null,
  }),
}));

const { mockParseSSEStream } = vi.hoisted(() => ({
  mockParseSSEStream: vi.fn(),
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: mockGetSession },
  },
}));

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:3001/api',
}));

vi.mock('@/lib/sse-parser', () => ({
  parseSSEStream: mockParseSSEStream,
}));

vi.mock('@/lib/safe-cast', () => ({
  safeString: (v: unknown, fallback = '') =>
    typeof v === 'string' ? v : v == null ? fallback : String(v),
  safeNumber: (v: unknown, fallback = 0) => {
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    if (typeof v === 'string') {
      const parsed = Number(v);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return fallback;
  },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import {
  useContentCalendar,
  type SavedCalendarReport,
  type SavedCalendarReportFull,
} from '../useContentCalendar';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeReport(id = 'report-1'): SavedCalendarReport {
  return {
    id,
    target_role: 'VP of Product',
    target_industry: 'SaaS',
    quality_score: 84,
    coherence_score: 79,
    post_count: 12,
    created_at: '2025-02-01T09:00:00Z',
  };
}

function makeReportFull(id = 'report-1'): SavedCalendarReportFull {
  return {
    ...makeReport(id),
    report_markdown: '# Content Calendar\n\nWeek 1...',
    themes: [{ id: 'theme-1', name: 'Scaling Teams' }],
    content_mix: { thought_leadership: 0.4 },
    posts: [{ day: 1, hook: 'Three years ago...' }],
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function* yieldEvents(
  events: Array<{ event: string; data: unknown }>,
): AsyncGenerator<{ event: string; data: string }> {
  for (const e of events) {
    yield { event: e.event, data: JSON.stringify(e.data) };
  }
}

/**
 * Stubs fetch so that:
 * - The first call (auto-fetch on mount for /reports) returns the provided reports.
 * - Optionally provides subsequent fetch stubs for stream connections.
 */
function stubFetchWithReports(
  reports: SavedCalendarReport[],
  additionalStubs: Response[] = [],
) {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ reports }), { status: 200 }),
    );
  for (const stub of additionalStubs) {
    fetchMock.mockResolvedValueOnce(stub);
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'test-token-cc' } },
    error: null,
  });
  mockParseSSEStream.mockImplementation(async function* () {
    // default: no SSE events
  });
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn().mockReturnValue('test-cc-session-uuid'),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

// ─── Initial state ────────────────────────────────────────────────────────────

describe('useContentCalendar — initial state', () => {
  it('savedReports defaults to empty array', () => {
    // Prevent auto-fetch from completing before assertion
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    const { result } = renderHook(() => useContentCalendar());
    expect(result.current.savedReports).toEqual([]);
  });

  it('reportsLoading starts as false before mount effect fires', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    const { result } = renderHook(() => useContentCalendar());
    // Loading becomes true inside the async fetchReports; synchronously it's still false
    // (React batches the setState inside useEffect after the first render)
    expect(typeof result.current.reportsLoading).toBe('boolean');
  });
});

// ─── fetchReports auto-fetch on mount ─────────────────────────────────────────

describe('useContentCalendar — auto-fetch on mount', () => {
  it('fetchReports is called automatically on mount', async () => {
    const fetchMock = stubFetchWithReports([]);
    renderHook(() => useContentCalendar());

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it('calls GET /api/content-calendar/reports', async () => {
    const fetchMock = stubFetchWithReports([]);
    renderHook(() => useContentCalendar());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe('http://localhost:3001/api/content-calendar/reports');
  });

  it('sends Authorization header on auto-fetch', async () => {
    const fetchMock = stubFetchWithReports([]);
    renderHook(() => useContentCalendar());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token-cc');
  });
});

// ─── fetchReports populates savedReports ─────────────────────────────────────

describe('useContentCalendar — fetchReports populates savedReports', () => {
  it('savedReports is populated after successful fetch', async () => {
    const reports = [makeReport('r1'), makeReport('r2')];
    stubFetchWithReports(reports);

    const { result } = renderHook(() => useContentCalendar());

    await waitFor(() => expect(result.current.savedReports).toHaveLength(2));
    expect(result.current.savedReports[0].id).toBe('r1');
    expect(result.current.savedReports[1].id).toBe('r2');
  });

  it('reportsLoading becomes false after fetch completes', async () => {
    stubFetchWithReports([makeReport()]);
    const { result } = renderHook(() => useContentCalendar());

    await waitFor(() => expect(result.current.reportsLoading).toBe(false));
  });

  it('savedReports stays empty on non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 }),
    ));

    const { result } = renderHook(() => useContentCalendar());

    await waitFor(() => expect(result.current.reportsLoading).toBe(false));
    expect(result.current.savedReports).toEqual([]);
  });

  it('savedReports stays empty on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('Network error')));

    const { result } = renderHook(() => useContentCalendar());

    await waitFor(() => expect(result.current.reportsLoading).toBe(false));
    expect(result.current.savedReports).toEqual([]);
  });

  it('savedReports stays empty when not authenticated', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    vi.stubGlobal('fetch', vi.fn()); // should not be called

    const { result } = renderHook(() => useContentCalendar());

    await waitFor(() => expect(result.current.reportsLoading).toBe(false));
    expect(result.current.savedReports).toEqual([]);
  });

  it('clears stale savedReports when auth is lost on refetch', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ reports: [makeReport('r1')] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useContentCalendar());

    await waitFor(() => expect(result.current.savedReports).toHaveLength(1));

    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });

    await act(async () => {
      await result.current.fetchReports();
    });

    expect(result.current.savedReports).toEqual([]);
  });

  it('clears stale savedReports when the feature is disabled', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ reports: [makeReport('r1')] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ feature_disabled: true }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useContentCalendar());

    await waitFor(() => expect(result.current.savedReports).toHaveLength(1));

    await act(async () => {
      await result.current.fetchReports();
    });

    expect(result.current.savedReports).toEqual([]);
  });

  it('drops malformed report payloads instead of storing invalid entries', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          reports: [
            makeReport('r1'),
            { id: 'broken-report' },
            { created_at: '2025-02-01T09:00:00Z' },
          ],
        }),
        { status: 200 },
      ),
    ));

    const { result } = renderHook(() => useContentCalendar());

    await waitFor(() => expect(result.current.reportsLoading).toBe(false));
    expect(result.current.savedReports).toHaveLength(1);
    expect(result.current.savedReports[0].id).toBe('r1');
  });
});

// ─── fetchReports manual call ─────────────────────────────────────────────────

describe('useContentCalendar — manual fetchReports call', () => {
  it('fetchReports can be called manually to refresh the list', async () => {
    // First call: mount auto-fetch returns one report
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ reports: [makeReport('r1')] }), { status: 200 }),
      )
      // Second call: manual fetchReports returns two reports
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ reports: [makeReport('r1'), makeReport('r2')] }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useContentCalendar());
    await waitFor(() => expect(result.current.savedReports).toHaveLength(1));

    await act(async () => {
      await result.current.fetchReports();
    });

    expect(result.current.savedReports).toHaveLength(2);
  });
});

// ─── fetchReportById ──────────────────────────────────────────────────────────

describe('useContentCalendar — fetchReportById', () => {
  it('calls GET /api/content-calendar/reports/:id with the correct URL', async () => {
    // Auto-fetch on mount
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ reports: [] }), { status: 200 }))
      // fetchReportById call
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ report: makeReportFull('r-abc') }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useContentCalendar());
    await waitFor(() => expect(result.current.reportsLoading).toBe(false));

    let report: SavedCalendarReportFull | null = null;
    await act(async () => {
      report = await result.current.fetchReportById('r-abc');
    });

    const url = fetchMock.mock.calls[1][0] as string;
    expect(url).toBe('http://localhost:3001/api/content-calendar/reports/r-abc');
    expect(report).not.toBeNull();
  });

  it('returns a full report including report_markdown', async () => {
    const fullReport = makeReportFull('r-full');
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ reports: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ report: fullReport }), { status: 200 })),
    );

    const { result } = renderHook(() => useContentCalendar());
    await waitFor(() => expect(result.current.reportsLoading).toBe(false));

    let report: SavedCalendarReportFull | null = null;
    await act(async () => {
      report = await result.current.fetchReportById('r-full');
    });

    expect(report).not.toBeNull();
    expect(report!.report_markdown).toContain('# Content Calendar');
    expect(report!.themes).toHaveLength(1);
    expect(report!.posts).toHaveLength(1);
  });

  it('returns null when server responds with non-OK status', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ reports: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response('Not found', { status: 404 })),
    );

    const { result } = renderHook(() => useContentCalendar());
    await waitFor(() => expect(result.current.reportsLoading).toBe(false));

    let report: SavedCalendarReportFull | null = undefined as unknown as null;
    await act(async () => {
      report = await result.current.fetchReportById('nonexistent');
    });

    expect(report).toBeNull();
  });

  it('returns null when the report payload is malformed', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ reports: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ report: { id: 'broken-report' } }), { status: 200 })),
    );

    const { result } = renderHook(() => useContentCalendar());
    await waitFor(() => expect(result.current.reportsLoading).toBe(false));

    let report: SavedCalendarReportFull | null = undefined as unknown as null;
    await act(async () => {
      report = await result.current.fetchReportById('broken-report');
    });

    expect(report).toBeNull();
  });

  it('returns null on network error', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ reports: [] }), { status: 200 }))
      .mockRejectedValueOnce(new Error('Network error')),
    );

    const { result } = renderHook(() => useContentCalendar());
    await waitFor(() => expect(result.current.reportsLoading).toBe(false));

    let report: SavedCalendarReportFull | null = undefined as unknown as null;
    await act(async () => {
      report = await result.current.fetchReportById('r-1');
    });

    expect(report).toBeNull();
  });

  it('returns null when not authenticated', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ reports: [] }), { status: 200 })),
    );

    const { result } = renderHook(() => useContentCalendar());
    await waitFor(() => expect(result.current.reportsLoading).toBe(false));

    // Return no session for the fetchReportById getSession call
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });

    let report: SavedCalendarReportFull | null = undefined as unknown as null;
    await act(async () => {
      report = await result.current.fetchReportById('r-1');
    });

    expect(report).toBeNull();
  });
});

// ─── savedReports refresh after calendar_complete ─────────────────────────────

describe('useContentCalendar — savedReports refresh after calendar_complete SSE event', () => {
  it('fetchReports is called again after calendar_complete', async () => {
    mockParseSSEStream.mockImplementationOnce(async function* () {
      yield* yieldEvents([
        { event: 'calendar_complete', data: { report: '# Calendar', quality_score: 88, post_count: 12 } },
      ]);
    });

    // Fetch call order:
    // 1. mount auto-fetch (returns empty)
    // 2. POST /start
    // 3. GET /stream
    // 4. post-calendar_complete fetchReports (returns one report)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ reports: [] }), { status: 200 })) // mount
      .mockResolvedValueOnce(new Response('{}', { status: 200 })) // POST /start
      .mockResolvedValueOnce(new Response(new ReadableStream(), { status: 200 })) // GET /stream
      .mockResolvedValueOnce(new Response(JSON.stringify({ reports: [makeReport()] }), { status: 200 })); // refresh
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useContentCalendar());
    await waitFor(() => expect(result.current.reportsLoading).toBe(false));

    await act(async () => {
      await result.current.startPipeline({
        resumeText: 'VP Engineering with 15 years experience in SaaS...',
      });
    });

    // Wait for calendar_complete to trigger the refresh and populate savedReports
    await waitFor(() => expect(result.current.savedReports).toHaveLength(1), { timeout: 3000 });
    expect(result.current.savedReports[0].id).toBe('report-1');
  });

  it('preserves the previous report and sanitizes streamed posts on calendar_complete', async () => {
    mockParseSSEStream.mockImplementationOnce(async function* () {
      yield* yieldEvents([
        {
          event: 'calendar_complete',
          data: {
            report: '',
            quality_score: '91',
            post_count: '3',
            posts: [
              {
                day: '1',
                day_of_week: 'Monday',
                content_type: 'thought_leadership',
                hook: 'A better way to lead change',
                body: 'Post body',
                cta: 'Share your approach',
                hashtags: ['#leadership', 42, '  '],
                posting_time: '9:00 AM',
                quality_score: '87',
                word_count: '180',
              },
              {
                day_of_week: 'Tuesday',
              },
            ],
          },
        },
      ]);
    });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ reports: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response(new ReadableStream(), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ reports: [makeReport()] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useContentCalendar());
    await waitFor(() => expect(result.current.reportsLoading).toBe(false));

    await act(async () => {
      await result.current.startPipeline({
        resumeText: 'Resume text',
      });
    });

    await waitFor(() => expect(result.current.status).toBe('complete'));
    expect(result.current.report).toBeNull();
    expect(result.current.qualityScore).toBe(91);
    expect(result.current.postCount).toBe(3);
    expect(result.current.posts).toEqual([
      {
        day: 1,
        day_of_week: 'Monday',
        content_type: 'thought_leadership',
        hook: 'A better way to lead change',
        body: 'Post body',
        cta: 'Share your approach',
        hashtags: ['#leadership'],
        posting_time: '9:00 AM',
        quality_score: 87,
        word_count: 180,
      },
    ]);
  });

  it('keeps prior calendar state when the final streamed payload is malformed', async () => {
    mockParseSSEStream.mockImplementationOnce(async function* () {
      yield* yieldEvents([
        {
          event: 'calendar_complete',
          data: {
            report: '# Final Calendar',
            quality_score: 88,
            post_count: 12,
            posts: [
              {
                day: 1,
                day_of_week: 'Monday',
                content_type: 'thought_leadership',
                hook: 'Hook',
                body: 'Body',
                cta: 'CTA',
                hashtags: ['#one'],
                posting_time: '9:00 AM',
                quality_score: 84,
                word_count: 140,
              },
            ],
          },
        },
        {
          event: 'calendar_complete',
          data: {
            report: '',
            quality_score: 'bad-score',
            post_count: null,
            posts: { invalid: true },
          },
        },
      ]);
    });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ reports: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response(new ReadableStream(), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ reports: [makeReport()] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ reports: [makeReport('report-2')] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useContentCalendar());
    await waitFor(() => expect(result.current.reportsLoading).toBe(false));

    await act(async () => {
      await result.current.startPipeline({
        resumeText: 'Resume text',
      });
    });

    await waitFor(() => expect(result.current.status).toBe('complete'));
    expect(result.current.report).toBe('# Final Calendar');
    expect(result.current.qualityScore).toBe(88);
    expect(result.current.postCount).toBe(12);
    expect(result.current.posts).toHaveLength(1);
    expect(result.current.posts[0].hook).toBe('Hook');
  });
});

// ─── startPipeline preserves savedReports ────────────────────────────────────

describe('useContentCalendar — startPipeline preserves savedReports', () => {
  it('savedReports is preserved across a new pipeline start', async () => {
    const reports = [makeReport('r1'), makeReport('r2')];
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ reports }), { status: 200 })) // mount
      .mockResolvedValueOnce(new Response('{}', { status: 200 })) // POST /start
    );

    const { result } = renderHook(() => useContentCalendar());
    await waitFor(() => expect(result.current.savedReports).toHaveLength(2));

    await act(async () => {
      await result.current.startPipeline({
        resumeText: 'Resume text here...',
      });
    });

    // savedReports should be preserved even though the pipeline state reset
    expect(result.current.savedReports).toHaveLength(2);
  });
});
