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
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  sessionStorage.clear();
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'test-token' } },
    error: null,
  });
});

afterEach(() => {
  sessionStorage.clear();
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

  it('error is null on mount', () => {
    const { result } = renderHook(() => useRadarSearch());
    expect(result.current.error).toBeNull();
  });

  it('exposes search as a function', () => {
    const { result } = renderHook(() => useRadarSearch());
    expect(typeof result.current.search).toBe('function');
  });

  it('exposes dismissJob as a function', () => {
    const { result } = renderHook(() => useRadarSearch());
    expect(typeof result.current.dismissJob).toBe('function');
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
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    const { result } = renderHook(() => useRadarSearch());

    await act(async () => {
      await result.current.search('CTO', 'NYC');
    });

    expect(result.current.error).toBe('Not authenticated');
    expect(result.current.jobs).toEqual([]);
  });

  it('sanitizes malformed search results before storing jobs', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        scan_id: 42,
        jobs: [
          {
            external_id: 'jsearch_good',
            title: 'Director of Operations',
            company: 'Acme Corp',
            location: 123,
            salary_min: '180000',
            salary_max: 'bad',
            description: null,
            posted_date: '2026-03-21',
            apply_url: '/apply',
            source: 'linkedin',
            remote_type: 'remote',
            employment_type: 'full-time',
            required_skills: ['Operations', 4, ''],
            match_score: '91',
            network_contacts: [
              { id: 'c1', name: 'Pat Doe', title: 'VP Ops', company: 'Acme Corp' },
              { id: '', name: 'Broken', company: 'Acme Corp' },
            ],
          },
          {
            external_id: '',
            title: 'Broken Job',
            company: 'Missing ID',
            source: 'linkedin',
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useRadarSearch());

    await act(async () => {
      await result.current.search('Operations', 'Remote');
    });

    expect(result.current.jobs).toHaveLength(1);
    expect(result.current.jobs[0]).toMatchObject({
      external_id: 'jsearch_good',
      location: '123',
      salary_min: 180000,
      salary_max: null,
      required_skills: ['Operations'],
      match_score: 91,
    });
    expect(result.current.jobs[0].network_contacts).toEqual([
      { id: 'c1', name: 'Pat Doe', title: 'VP Ops', company: 'Acme Corp' },
    ]);
  });

  it('keeps jobs visible but surfaces enrichment failures', async () => {
    const jobs = [makeJob('j1')];
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeSearchResponse(jobs),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Could not load network contacts.' }),
      }) as unknown as typeof fetch;

    const { result } = renderHook(() => useRadarSearch());

    await act(async () => {
      await result.current.search('VP Engineering', 'San Francisco');
    });

    expect(result.current.jobs).toHaveLength(1);
    expect(result.current.error).toBe('Could not load network contacts.');
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

describe('useRadarSearch — reset()', () => {
  it('clears jobs, loading, and error', async () => {
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
      result.current.reset();
    });

    expect(result.current.jobs).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
