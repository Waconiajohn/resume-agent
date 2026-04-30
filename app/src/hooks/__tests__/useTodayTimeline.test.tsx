// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTodayTimeline } from '../useTodayTimeline';

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:3001/api',
}));

const mockGetSession = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
    },
  },
}));

describe('useTodayTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
    });
  });

  it('surfaces API error payloads from the Today endpoint', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Timeline aggregation failed.' }), { status: 500 }),
    );

    const { result } = renderHook(() => useTodayTimeline());

    await waitFor(() => expect(result.current.error).toBe('Timeline aggregation failed.'));

    expect(result.current.pursuits).toEqual([]);
    expect(result.current.totalCount).toBe(0);
  });

  it('clears pursuits and reports authentication failures', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } });

    const { result } = renderHook(() => useTodayTimeline());

    await waitFor(() => expect(result.current.error).toBe('Not authenticated'));

    expect(fetch).not.toHaveBeenCalled();
    expect(result.current.pursuits).toEqual([]);
  });
});
