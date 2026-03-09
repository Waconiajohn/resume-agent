// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useRadarSearch } from '../useRadarSearch';
import type { RadarJob } from '../useRadarSearch';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const { mockGetSession } = vi.hoisted(() => ({
  mockGetSession: vi.fn().mockResolvedValue({
    data: { session: { access_token: 'test-token' } },
    error: null,
  }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
    },
  },
}));

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:3001/api',
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeJob(id: string, overrides: Partial<RadarJob> = {}): RadarJob {
  return {
    external_id: `jsearch_${id}`,
    title: 'VP of Engineering',
    company: 'Acme Corp',
    location: 'San Francisco, CA',
    salary_min: null,
    salary_max: null,
    description: 'Lead engineering teams.',
    posted_date: new Date().toISOString(),
    apply_url: null,
    source: 'jsearch',
    remote_type: null,
    employment_type: null,
    required_skills: null,
    match_score: null,
    ...overrides,
  };
}

function makeSearchResponse(jobs: RadarJob[] = []) {
  return {
    scan_id: 'scan-test-001',
    jobs,
    sources_queried: ['jsearch', 'adzuna'],
    execution_time_ms: 420,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'test-token' } },
    error: null,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useRadarSearch — initial state', () => {
  it('jobs is empty array on mount', () => {
    const { result } = renderHook(() => useRadarSearch());
    expect(result.current.jobs).toEqual([]);
  });

  it('loading is false on mount', () => {
    const { result } = renderHook(() => useRadarSearch());
    expect(result.current.loading).toBe(false);
  });

  it('scoring is false on mount', () => {
    const { result } = renderHook(() => useRadarSearch());
    expect(result.current.scoring).toBe(false);
  });

  it('error is null on mount', () => {
    const { result } = renderHook(() => useRadarSearch());
    expect(result.current.error).toBeNull();
  });

  it('lastScanId is null on mount', () => {
    const { result } = renderHook(() => useRadarSearch());
    expect(result.current.lastScanId).toBeNull();
  });

  it('exposes search as a function', () => {
    const { result } = renderHook(() => useRadarSearch());
    expect(typeof result.current.search).toBe('function');
  });

  it('exposes dismissJob as a function', () => {
    const { result } = renderHook(() => useRadarSearch());
    expect(typeof result.current.dismissJob).toBe('function');
  });

  it('exposes promoteJob as a function', () => {
    const { result } = renderHook(() => useRadarSearch());
    expect(typeof result.current.promoteJob).toBe('function');
  });
});

describe('useRadarSearch — search()', () => {
  it('stores search results in jobs state', async () => {
    const jobs = [makeJob('j1'), makeJob('j2')];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeSearchResponse(jobs),
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useRadarSearch());

    await act(async () => {
      await result.current.search('VP Engineering', 'San Francisco');
    });

    expect(result.current.jobs).toHaveLength(2);
    expect(result.current.jobs[0].external_id).toBe('jsearch_j1');
  });

  it('stores scan_id after successful search', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeSearchResponse([]),
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useRadarSearch());

    await act(async () => {
      await result.current.search('CTO', 'Remote');
    });

    expect(result.current.lastScanId).toBe('scan-test-001');
  });

  it('sets loading to false after search completes', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeSearchResponse([]),
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useRadarSearch());

    await act(async () => {
      await result.current.search('CTO', 'NYC');
    });

    expect(result.current.loading).toBe(false);
  });

  it('sets error when fetch returns non-ok status', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service unavailable',
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useRadarSearch());

    await act(async () => {
      await result.current.search('CTO', 'NYC');
    });

    expect(result.current.error).toContain('503');
    expect(result.current.loading).toBe(false);
  });

  it('sets error when fetch throws (network failure)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as unknown as typeof fetch;

    const { result } = renderHook(() => useRadarSearch());

    await act(async () => {
      await result.current.search('CTO', 'NYC');
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.loading).toBe(false);
  });

  it('sets error when not authenticated (no session)', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });

    const { result } = renderHook(() => useRadarSearch());

    await act(async () => {
      await result.current.search('CTO', 'NYC');
    });

    expect(result.current.error).toBe('Not authenticated');
  });
});

describe('useRadarSearch — scoreResults()', () => {
  it('updates match scores on existing jobs', async () => {
    const jobs = [makeJob('j1'), makeJob('j2')];

    // Call sequence: search → enrichment (NI contacts) → score
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeSearchResponse(jobs),
      })
      // Enrichment call (NI contacts) — return empty
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ scan_id: 'scan-test-001', results: [] }),
      })
      // Score call
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobs: [
            { external_id: 'jsearch_j1', match_score: 90 },
            { external_id: 'jsearch_j2', match_score: 72 },
          ],
        }),
      }) as unknown as typeof fetch;

    const { result } = renderHook(() => useRadarSearch());

    // Search first to populate lastScanId
    await act(async () => {
      await result.current.search('VP Engineering', 'SF');
    });

    // Score the results
    await act(async () => {
      await result.current.scoreResults();
    });

    expect(result.current.jobs[0].match_score).toBe(90);
    expect(result.current.jobs[1].match_score).toBe(72);
    expect(result.current.scoring).toBe(false);
  });

  it('does nothing when lastScanId is null', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const { result } = renderHook(() => useRadarSearch());

    await act(async () => {
      await result.current.scoreResults();
    });

    // fetch should not have been called (no scan to score)
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.scoring).toBe(false);
  });
});

describe('useRadarSearch — dismissJob()', () => {
  it('removes a job from the jobs list by external_id', async () => {
    const jobs = [makeJob('j1'), makeJob('j2'), makeJob('j3')];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeSearchResponse(jobs),
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useRadarSearch());

    await act(async () => {
      await result.current.search('CTO', 'NYC');
    });

    act(() => {
      result.current.dismissJob('jsearch_j2');
    });

    expect(result.current.jobs).toHaveLength(2);
    expect(result.current.jobs.find((j) => j.external_id === 'jsearch_j2')).toBeUndefined();
  });

  it('does nothing when the external_id does not exist', async () => {
    const jobs = [makeJob('j1')];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeSearchResponse(jobs),
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useRadarSearch());

    await act(async () => {
      await result.current.search('CTO', 'NYC');
    });

    act(() => {
      result.current.dismissJob('nonexistent_id');
    });

    expect(result.current.jobs).toHaveLength(1);
  });
});

describe('useRadarSearch — promoteJob()', () => {
  it('returns the job data passed to it', () => {
    const { result } = renderHook(() => useRadarSearch());
    const job = makeJob('j1');

    const promoted = result.current.promoteJob(job);

    expect(promoted).toEqual(job);
    expect(promoted.external_id).toBe('jsearch_j1');
  });
});
