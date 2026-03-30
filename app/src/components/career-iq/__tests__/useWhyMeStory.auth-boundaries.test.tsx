// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act, cleanup } from '@testing-library/react';

const {
  mockGetUser,
  mockMaybeSingle,
  mockUpsert,
  mockOnAuthStateChange,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockMaybeSingle: vi.fn(),
  mockUpsert: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: mockGetUser,
      onAuthStateChange: mockOnAuthStateChange,
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: mockMaybeSingle,
        }),
      }),
      upsert: mockUpsert,
    }),
  },
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

import { useWhyMeStory } from '../useWhyMeStory';

describe('useWhyMeStory auth boundaries', () => {
  let authListener: ((event: string, session: { user?: { id: string } | null } | null) => void) | null = null;

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockUpsert.mockResolvedValue({ error: null });
    authListener = null;
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
  });

  afterEach(() => cleanup());

  it('does not import a legacy anonymous draft into a signed-in account', async () => {
    localStorageMock.setItem(
      'careeriq_why_me_story',
      JSON.stringify({
        colleaguesCameForWhat: 'Legacy anonymous story',
        knownForWhat: 'Legacy proof',
        whyNotMe: 'Legacy fit',
      }),
    );
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-a' } } });

    const { result } = renderHook(() => useWhyMeStory());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.story).toEqual({
      colleaguesCameForWhat: '',
      knownForWhat: '',
      whyNotMe: '',
    });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('loads and backfills a user-scoped draft for the same signed-in user', async () => {
    localStorageMock.setItem(
      'careeriq_why_me_story:user-a',
      JSON.stringify({
        colleaguesCameForWhat: 'Scoped story',
        knownForWhat: 'Scoped proof',
        whyNotMe: 'Scoped fit',
      }),
    );
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-a' } } });

    const { result } = renderHook(() => useWhyMeStory());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.story.colleaguesCameForWhat).toBe('Scoped story');
    expect(mockUpsert).toHaveBeenCalledWith(
      {
        user_id: 'user-a',
        colleagues_came_for_what: 'Scoped story',
        known_for_what: 'Scoped proof',
        why_not_me: 'Scoped fit',
      },
      { onConflict: 'user_id' },
    );
  });

  it('switches drafts cleanly when auth changes between users', async () => {
    localStorageMock.setItem(
      'careeriq_why_me_story:user-a',
      JSON.stringify({
        colleaguesCameForWhat: 'User A story',
        knownForWhat: '',
        whyNotMe: '',
      }),
    );
    localStorageMock.setItem(
      'careeriq_why_me_story:user-b',
      JSON.stringify({
        colleaguesCameForWhat: 'User B story',
        knownForWhat: '',
        whyNotMe: '',
      }),
    );
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-a' } } });

    const { result } = renderHook(() => useWhyMeStory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.story.colleaguesCameForWhat).toBe('User A story');

    act(() => {
      authListener?.('SIGNED_IN', { user: { id: 'user-b' } });
    });

    await waitFor(() => expect(result.current.story.colleaguesCameForWhat).toBe('User B story'));
  });

  it('falls back to the anonymous scoped draft on sign-out', async () => {
    localStorageMock.setItem(
      'careeriq_why_me_story:user-a',
      JSON.stringify({
        colleaguesCameForWhat: 'User A story',
        knownForWhat: '',
        whyNotMe: '',
      }),
    );
    localStorageMock.setItem(
      'careeriq_why_me_story:anon',
      JSON.stringify({
        colleaguesCameForWhat: 'Anonymous story',
        knownForWhat: '',
        whyNotMe: '',
      }),
    );
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-a' } } });

    const { result } = renderHook(() => useWhyMeStory());
    await waitFor(() => expect(result.current.story.colleaguesCameForWhat).toBe('User A story'));

    act(() => {
      authListener?.('SIGNED_OUT', null);
    });

    await waitFor(() => expect(result.current.story.colleaguesCameForWhat).toBe('Anonymous story'));
  });
});
