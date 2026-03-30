/**
 * useCoachRecommendation — Hook tests.
 *
 * Validates sessionStorage caching, API fetch behaviour, 404 graceful
 * fallback, and clearCoachRecommendationCache utility.
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
        data: { session: { access_token: 'test-token', user: { id: 'user-1' } } },
      }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:3001/api',
}));

// ─── sessionStorage mock ─────────────────────────────────────────────────────

const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    get length() { return Object.keys(store).length; },
    getItem: vi.fn((_key: string): string | null => store[_key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock });

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import {
  useCoachRecommendation,
  clearCoachRecommendationCache,
  type CoachRecommendation,
} from '@/hooks/useCoachRecommendation';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MOCK_RECOMMENDATION: CoachRecommendation = {
  action: 'Complete your resume summary section.',
  product: 'resume',
  room: 'resume',
  urgency: 'immediate',
  phase: 'resume_ready',
  phase_label: 'Resume Complete',
  rationale: 'Your resume is 80% complete — one section away from your first apply-ready draft.',
};

const CACHE_KEY = 'coach_recommendation:user-1';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useCoachRecommendation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorageMock.clear();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns cached data immediately on mount before background refresh completes', async () => {
    // Pre-populate cache
    sessionStorageMock.getItem.mockReturnValue(JSON.stringify(MOCK_RECOMMENDATION));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(MOCK_RECOMMENDATION),
    }));

    const { result } = renderHook(() => useCoachRecommendation());

    await waitFor(() => expect(result.current.recommendation).not.toBeNull());
    expect(result.current.recommendation).not.toBeNull();
    expect(result.current.recommendation?.action).toBe('Complete your resume summary section.');
    expect(result.current.loading).toBe(false);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });

  it('fetches from API when no cache exists and stores the result', async () => {
    sessionStorageMock.getItem.mockReturnValue(null);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(MOCK_RECOMMENDATION),
    }));

    const { result } = renderHook(() => useCoachRecommendation());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.recommendation).not.toBeNull();
    expect(result.current.recommendation?.phase_label).toBe('Resume Complete');
    expect(result.current.error).toBeNull();

    // Verify the API was called with the bearer token
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/coach/recommend',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    );

    // Verify the result was written to cache
    expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
      CACHE_KEY,
      JSON.stringify(MOCK_RECOMMENDATION),
    );
  });

  it('returns null recommendation when API returns 404 (feature flag off)', async () => {
    sessionStorageMock.getItem.mockReturnValue(null);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }));

    const { result } = renderHook(() => useCoachRecommendation());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.recommendation).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('sets error state when API returns a non-404 failure', async () => {
    sessionStorageMock.getItem.mockReturnValue(null);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }));

    const { result } = renderHook(() => useCoachRecommendation());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.recommendation).toBeNull();
    expect(result.current.error).toMatch(/500/);
  });

  it('clears cached recommendation when auth is missing', async () => {
    sessionStorageMock.getItem.mockReturnValue(JSON.stringify(MOCK_RECOMMENDATION));

    const { supabase } = await import('@/lib/supabase');
    (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { session: null },
    });

    const { result } = renderHook(() => useCoachRecommendation());

    await waitFor(() => expect(result.current.recommendation).toBeNull());

    expect(result.current.error).toBeNull();
    expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('coach_recommendation:anon');
  });

  it('clears cached recommendation when feature_disabled is returned', async () => {
    sessionStorageMock.getItem.mockReturnValue(JSON.stringify(MOCK_RECOMMENDATION));

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ feature_disabled: true }),
    }));

    const { result } = renderHook(() => useCoachRecommendation());

    await waitFor(() => expect(result.current.recommendation).toBeNull());

    expect(result.current.error).toBeNull();
    expect(sessionStorageMock.removeItem).toHaveBeenCalledWith(CACHE_KEY);
  });

  it('clearCoachRecommendationCache removes the sessionStorage entry', () => {
    sessionStorageMock.setItem(CACHE_KEY, JSON.stringify(MOCK_RECOMMENDATION));

    act(() => {
      clearCoachRecommendationCache();
    });

    expect(sessionStorageMock.removeItem).toHaveBeenCalledWith(CACHE_KEY);
  });
});
