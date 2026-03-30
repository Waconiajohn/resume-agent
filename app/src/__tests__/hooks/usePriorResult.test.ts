// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePriorResult } from '@/hooks/usePriorResult';

const { getSessionMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
    },
  },
}));

describe('usePriorResult', () => {
  beforeEach(() => {
    sessionStorage.clear();
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'token-123' } } });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('fetches the latest report when no session id is provided', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ report: { report_markdown: 'latest report' } }), { status: 200 }),
    );

    const { result } = renderHook(() => usePriorResult<{ report_markdown: string }>({ productSlug: 'thank-you-note' }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.priorResult?.report_markdown).toBe('latest report');
    });

    expect(fetch).toHaveBeenCalledWith('/api/thank-you-note/reports/latest', {
      headers: { Authorization: 'Bearer token-123' },
    });
  });

  it('fetches an exact saved report when a session id is provided', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ report: { report_markdown: 'saved report' } }), { status: 200 }),
    );

    const { result } = renderHook(() =>
      usePriorResult<{ report_markdown: string }>({
        productSlug: 'salary-negotiation',
        sessionId: 'session-abc',
      }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.priorResult?.report_markdown).toBe('saved report');
    });

    expect(fetch).toHaveBeenCalledWith('/api/salary-negotiation/reports/session/session-abc', {
      headers: { Authorization: 'Bearer token-123' },
    });
  });

  it('clears a cached prior result when auth is missing', async () => {
    sessionStorage.setItem(
      'prior_result_thank-you-note_latest',
      JSON.stringify({ report_markdown: 'cached report' }),
    );
    getSessionMock.mockResolvedValue({ data: { session: null } });

    const { result } = renderHook(() =>
      usePriorResult<{ report_markdown: string }>({ productSlug: 'thank-you-note' }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.priorResult).toBeNull();
    });

    expect(sessionStorage.getItem('prior_result_thank-you-note_latest')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('clears cached prior results when the product is feature-disabled', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ feature_disabled: true }), { status: 200 }),
    );

    const { result } = renderHook(() =>
      usePriorResult<{ report_markdown: string }>({ productSlug: 'thank-you-note' }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.priorResult).toBeNull();
    });

    expect(sessionStorage.getItem('prior_result_thank-you-note_latest')).toBeNull();
  });
});
