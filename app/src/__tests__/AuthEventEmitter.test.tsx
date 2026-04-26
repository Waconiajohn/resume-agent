// @vitest-environment jsdom
/**
 * AuthEventEmitter — translates onAuthStateChange events into POSTs
 * to /api/auth/events. Skips TOKEN_REFRESHED (noisy), coalesces back-
 * to-back duplicates inside 5s, and falls back to getSession() for
 * the access token when needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

const onAuthStateChange = vi.hoisted(() => vi.fn());
const getSession = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { onAuthStateChange, getSession } },
}));

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:3001/api',
}));

import { AuthEventEmitter } from '@/components/AuthEventEmitter';

let cb: ((event: string, session: { access_token?: string } | null) => void) | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  onAuthStateChange.mockImplementation((fn: typeof cb) => {
    cb = fn;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  getSession.mockResolvedValue({ data: { session: { access_token: 'tok-fallback' } } });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  cb = null;
});

describe('AuthEventEmitter', () => {
  it('POSTs signed_in on SIGNED_IN with the session token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<AuthEventEmitter />);
    await act(async () => {
      cb?.('SIGNED_IN', { access_token: 'tok-1' });
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/api/auth/events');
    expect(JSON.parse(init.body)).toEqual({ event_type: 'signed_in' });
    expect(init.headers.Authorization).toBe('Bearer tok-1');
  });

  it('does not POST TOKEN_REFRESHED', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<AuthEventEmitter />);
    await act(async () => {
      cb?.('TOKEN_REFRESHED', { access_token: 'tok-1' });
      await Promise.resolve();
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('coalesces duplicate SIGNED_IN inside 5s', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<AuthEventEmitter />);
    await act(async () => {
      cb?.('SIGNED_IN', { access_token: 'tok-1' });
      await Promise.resolve();
      cb?.('SIGNED_IN', { access_token: 'tok-1' });
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
