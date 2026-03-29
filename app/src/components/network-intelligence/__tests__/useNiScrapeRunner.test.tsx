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
    expect(result.current.error).toBe('Sign in to start a company scan.');
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
    expect(vi.getTimerCount()).toBe(1);

    await act(async () => {
      rerender({ token: null });
    });

    expect(result.current.running).toBe(false);
    expect(result.current.error).toBe('Sign in again to continue scanning.');
    expect(vi.getTimerCount()).toBe(0);
  });
});
