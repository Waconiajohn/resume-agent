// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act, cleanup } from '@testing-library/react';

const {
  mockGetSession,
  mockOnAuthStateChange,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
    },
  },
}));

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:3001/api',
}));

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

import { useLinkedInProfile } from '../useLinkedInProfile';

describe('useLinkedInProfile auth boundaries', () => {
  let authListener: ((event: string, session: { access_token?: string | null; user?: { id: string } | null } | null) => void) | null = null;

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    authListener = null;
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockOnAuthStateChange.mockImplementation((callback) => {
      authListener = callback;
      return {
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      };
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('does not load a legacy anonymous draft into a signed-in user profile', async () => {
    localStorageMock.setItem(
      'careeriq_linkedin_profile',
      JSON.stringify({
        headline: 'Legacy headline',
        about: 'Legacy about',
      }),
    );
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-a',
          user: { id: 'user-a' },
        },
      },
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ linkedin_profile: null }), { status: 200 }),
    );

    const { result } = renderHook(() => useLinkedInProfile());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.profile).toEqual({ headline: '', about: '' });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('loads a user-scoped draft and backfills the server when no profile exists yet', async () => {
    localStorageMock.setItem(
      'careeriq_linkedin_profile:user-a',
      JSON.stringify({
        headline: 'Scoped headline',
        about: 'Scoped about',
      }),
    );
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-a',
          user: { id: 'user-a' },
        },
      },
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ linkedin_profile: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const { result } = renderHook(() => useLinkedInProfile());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.profile).toEqual({
      headline: 'Scoped headline',
      about: 'Scoped about',
    });
    expect(vi.mocked(fetch)).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/api/platform-context/linkedin-profile',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          headline: 'Scoped headline',
          about: 'Scoped about',
        }),
      }),
    );
  });

  it('switches scoped drafts cleanly when auth changes between users', async () => {
    localStorageMock.setItem(
      'careeriq_linkedin_profile:user-a',
      JSON.stringify({
        headline: 'Headline A',
        about: '',
      }),
    );
    localStorageMock.setItem(
      'careeriq_linkedin_profile:user-b',
      JSON.stringify({
        headline: 'Headline B',
        about: '',
      }),
    );
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-a',
          user: { id: 'user-a' },
        },
      },
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ linkedin_profile: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ linkedin_profile: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const { result } = renderHook(() => useLinkedInProfile());
    await waitFor(() => expect(result.current.profile.headline).toBe('Headline A'));

    act(() => {
      authListener?.('SIGNED_IN', {
        access_token: 'token-b',
        user: { id: 'user-b' },
      });
    });

    await waitFor(() => expect(result.current.profile.headline).toBe('Headline B'));
  });

  it('falls back to the anonymous scoped draft on sign-out', async () => {
    localStorageMock.setItem(
      'careeriq_linkedin_profile:user-a',
      JSON.stringify({
        headline: 'Headline A',
        about: '',
      }),
    );
    localStorageMock.setItem(
      'careeriq_linkedin_profile:anon',
      JSON.stringify({
        headline: 'Anonymous headline',
        about: '',
      }),
    );
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-a',
          user: { id: 'user-a' },
        },
      },
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ linkedin_profile: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const { result } = renderHook(() => useLinkedInProfile());
    await waitFor(() => expect(result.current.profile.headline).toBe('Headline A'));

    act(() => {
      authListener?.('SIGNED_OUT', null);
    });

    await waitFor(() => expect(result.current.profile.headline).toBe('Anonymous headline'));
  });
});
