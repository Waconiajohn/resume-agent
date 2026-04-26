// @vitest-environment jsdom
/**
 * useAuth — sessionDegraded flag transitions.
 *
 * The flag flips true when supabase.auth.refreshSession() returns an error
 * during the proactive interval refresh. The flag clears when the auth
 * client emits TOKEN_REFRESHED, when the user signs out, or when a
 * subsequent refresh succeeds.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const refreshSession = vi.hoisted(() => vi.fn());
const getSession = vi.hoisted(() => vi.fn());
const onAuthStateChange = vi.hoisted(() => vi.fn());
const signOutMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession,
      onAuthStateChange,
      refreshSession,
      signOut: signOutMock,
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signInWithOAuth: vi.fn(),
      updateUser: vi.fn(),
    },
  },
}));

import { useAuth } from '@/hooks/useAuth';

let lastAuthCallback: ((event: string, session: unknown) => void) | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  refreshSession.mockReset();
  getSession.mockReset();
  signOutMock.mockReset();
  onAuthStateChange.mockReset();

  getSession.mockResolvedValue({ data: { session: null } });
  onAuthStateChange.mockImplementation((cb: typeof lastAuthCallback) => {
    lastAuthCallback = cb;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
});

afterEach(() => {
  vi.useRealTimers();
  lastAuthCallback = null;
});

describe('useAuth — sessionDegraded', () => {
  it('starts as false', async () => {
    const { result } = renderHook(() => useAuth());
    await act(async () => { await Promise.resolve(); });
    expect(result.current.sessionDegraded).toBe(false);
  });

  it('flips true when interval refreshSession returns an error', async () => {
    refreshSession.mockResolvedValue({ data: null, error: { message: 'refresh_token_not_found' } });
    const { result } = renderHook(() => useAuth());
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      vi.advanceTimersByTime(45 * 60 * 1000);
      // Drain the awaited refreshSession promise inside the interval.
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.sessionDegraded).toBe(true);
  });

  it('clears the flag on TOKEN_REFRESHED', async () => {
    refreshSession.mockResolvedValue({ data: null, error: { message: 'fail' } });
    const { result } = renderHook(() => useAuth());
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      vi.advanceTimersByTime(45 * 60 * 1000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.sessionDegraded).toBe(true);

    act(() => {
      lastAuthCallback?.('TOKEN_REFRESHED', { user: { id: 'u1' } });
    });
    expect(result.current.sessionDegraded).toBe(false);
  });

  it('clears via clearSessionDegraded()', async () => {
    refreshSession.mockResolvedValue({ data: null, error: { message: 'fail' } });
    const { result } = renderHook(() => useAuth());
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      vi.advanceTimersByTime(45 * 60 * 1000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.sessionDegraded).toBe(true);

    act(() => result.current.clearSessionDegraded());
    expect(result.current.sessionDegraded).toBe(false);
  });
});
