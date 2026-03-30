// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePlatformContextSummary } from '@/hooks/usePlatformContextSummary';

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

describe('usePlatformContextSummary', () => {
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

  it('fetches and caches context summary items when authenticated', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({
        types: [{ context_type: 'linkedin', source_product: 'linkedin-studio', updated_at: '2026-03-29T00:00:00Z' }],
      }), { status: 200 }),
    );

    const { result } = renderHook(() => usePlatformContextSummary());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.items).toHaveLength(1);
    });

    expect(sessionStorage.getItem('platform_context_summary')).not.toBeNull();
  });

  it('clears cached context summary items when auth is missing', async () => {
    sessionStorage.setItem(
      'platform_context_summary',
      JSON.stringify([{ context_type: 'resume', source_product: 'resume-builder', updated_at: '2026-03-29T00:00:00Z' }]),
    );
    getSessionMock.mockResolvedValue({ data: { session: null } });

    const { result } = renderHook(() => usePlatformContextSummary());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.items).toEqual([]);
    });

    expect(sessionStorage.getItem('platform_context_summary')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('clears cached context summary items when the feature is disabled', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ feature_disabled: true }), { status: 200 }),
    );

    const { result } = renderHook(() => usePlatformContextSummary());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.items).toEqual([]);
    });

    expect(sessionStorage.getItem('platform_context_summary')).toBeNull();
  });
});
