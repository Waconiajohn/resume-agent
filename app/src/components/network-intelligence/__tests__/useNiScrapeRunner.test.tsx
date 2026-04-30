// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useNiScrapeRunner } from '../useNiScrapeRunner';

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:3001/api',
}));

describe('useNiScrapeRunner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('returns a helpful error when starting without an access token', async () => {
    const { result } = renderHook(() => useNiScrapeRunner(null));

    let started = true;
    await act(async () => {
      started = await result.current.startScan({
        companyIds: ['company-1'],
        searchContext: 'network_connections',
        emptyMessage: 'No companies available.',
      });
    });

    expect(started).toBe(false);
    expect(result.current.running).toBe(false);
    expect(result.current.error).toBe('Sign in to start company job search.');
  });

  it('stops polling and clears running state when auth disappears mid-scan', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ scrape_log_id: 'scrape-1' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          log: {
            id: 'scrape-1',
            status: 'running',
            output_summary: { companies_scanned: 1 },
            error_message: null,
          },
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(
      ({ token }: { token: string | null }) => useNiScrapeRunner(token),
      { initialProps: { token: 'token-1' as string | null } },
    );

    await act(async () => {
      await result.current.startScan({
        companyIds: ['company-1'],
        searchContext: 'network_connections',
        emptyMessage: 'No companies available.',
      });
    });

    expect(result.current.running).toBe(true);
    // Hook creates a polling interval + a safety timeout = 2 timers
    expect(vi.getTimerCount()).toBe(2);

    await act(async () => {
      rerender({ token: null });
    });

    expect(result.current.running).toBe(false);
    expect(result.current.scrapeLogId).toBeNull();
    expect(result.current.scrapeStatus).toBeNull();
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBe('Sign in again to continue company job search.');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears stale completed scan data when the token changes', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ scrape_log_id: 'scrape-1' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          log: {
            id: 'scrape-1',
            status: 'completed',
            output_summary: {
              companies_scanned: 2,
              jobs_found: 4,
              matching_jobs: 3,
              referral_available: 1,
              error_count: 0,
            },
            error_message: null,
          },
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(
      ({ token }: { token: string | null }) => useNiScrapeRunner(token),
      { initialProps: { token: 'token-1' as string | null } },
    );

    await act(async () => {
      await result.current.startScan({
        companyIds: ['company-1'],
        searchContext: 'network_connections',
        emptyMessage: 'No companies available.',
      });
    });

    expect(result.current.result).toEqual({
      companiesScanned: 2,
      rawJobsFound: 4,
      jobsFound: 4,
      matchingJobs: 3,
      referralAvailable: 1,
      errorCount: 0,
      serperConfigured: null,
    });

    await act(async () => {
      rerender({ token: 'token-2' });
    });

    expect(result.current.scrapeLogId).toBeNull();
    expect(result.current.scrapeStatus).toBeNull();
    expect(result.current.result).toBeNull();
    expect(result.current.running).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sends location, radius, work-mode, and freshness filters when starting a scan', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ scrape_log_id: 'scrape-1' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          log: {
            id: 'scrape-1',
            status: 'completed',
            output_summary: {
              companies_scanned: 1,
              jobs_found: 2,
              matching_jobs: 1,
              referral_available: 0,
              error_count: 0,
            },
            error_message: null,
          },
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useNiScrapeRunner('token-1'));

    await act(async () => {
      await result.current.startScan({
        companyIds: ['company-1'],
        targetTitles: ['VP Operations'],
        searchContext: 'network_connections',
        emptyMessage: 'No companies available.',
        location: 'Dallas, TX',
        radiusMiles: 50,
        remoteOnly: false,
        workModes: ['hybrid'],
        maxDaysOld: 7,
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/ni/scrape/start',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          company_ids: ['company-1'],
          target_titles: ['VP Operations'],
          search_context: 'network_connections',
          location: 'Dallas, TX',
          radius_miles: 50,
          remote_only: false,
          work_modes: ['hybrid'],
          max_days_old: 7,
        }),
      }),
    );
  });

  it('stops polling and surfaces status read failures', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ scrape_log_id: 'scrape-1' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Could not load company job search status.' }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useNiScrapeRunner('token-1'));

    await act(async () => {
      await result.current.startScan({
        companyIds: ['company-1'],
        searchContext: 'network_connections',
        emptyMessage: 'No companies available.',
      });
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.running).toBe(false);
    expect(result.current.error).toBe('Could not load company job search status.');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('can send a 30-day freshness window', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ scrape_log_id: 'scrape-1' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          log: {
            id: 'scrape-1',
            status: 'completed',
            output_summary: { companies_scanned: 1 },
            error_message: null,
          },
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useNiScrapeRunner('token-1'));

    await act(async () => {
      await result.current.startScan({
        companyIds: ['company-1'],
        searchContext: 'network_connections',
        emptyMessage: 'No companies available.',
        maxDaysOld: 30,
      });
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual(
      expect.objectContaining({ max_days_old: 30 }),
    );
  });
});
