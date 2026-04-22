// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, reportApiError, subscribeApiErrors } from '@/lib/api-fetch';

describe('apiFetch', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('prepends API_BASE to relative paths by default', async () => {
    const mockFetch = vi.fn(async () => new Response('{}', { status: 200 }));
    global.fetch = mockFetch as unknown as typeof fetch;

    await apiFetch('/foo');

    // dev API_BASE = '/api', so the URL should be /api/foo
    expect(mockFetch).toHaveBeenCalledWith('/api/foo', expect.any(Object));
  });

  it('does not prepend when prefixBase is false', async () => {
    const mockFetch = vi.fn(async () => new Response('{}', { status: 200 }));
    global.fetch = mockFetch as unknown as typeof fetch;

    await apiFetch('/foo', { prefixBase: false });

    expect(mockFetch).toHaveBeenCalledWith('/foo', expect.any(Object));
  });

  it('attaches Bearer token when accessToken is given', async () => {
    const mockFetch = vi.fn(async () => new Response('{}', { status: 200 }));
    global.fetch = mockFetch as unknown as typeof fetch;

    await apiFetch('/foo', { accessToken: 'tok123' });

    const call = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
    const headers = call[1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer tok123');
  });

  it('dispatches an api-error event on >=400 when toastOnError is true', async () => {
    const mockFetch = vi.fn(
      async () => new Response(JSON.stringify({ error: 'nope' }), { status: 404 }),
    );
    global.fetch = mockFetch as unknown as typeof fetch;

    const handler = vi.fn();
    const unsubscribe = subscribeApiErrors(handler);

    try {
      await apiFetch('/missing', { toastOnError: true, errorContext: 'Load thing' });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/missing',
          status: 404,
          context: 'Load thing',
          message: 'nope',
        }),
      );
    } finally {
      unsubscribe();
    }
  });

  it('does not dispatch an event when toastOnError is false (default)', async () => {
    const mockFetch = vi.fn(async () => new Response('{}', { status: 500 }));
    global.fetch = mockFetch as unknown as typeof fetch;

    const handler = vi.fn();
    const unsubscribe = subscribeApiErrors(handler);

    try {
      await apiFetch('/oops');
      expect(handler).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it('dispatches an api-error event on network failure', async () => {
    const mockFetch = vi.fn(async () => {
      throw new Error('network down');
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const handler = vi.fn();
    const unsubscribe = subscribeApiErrors(handler);

    try {
      await expect(apiFetch('/anywhere', { toastOnError: true })).rejects.toThrow(
        'network down',
      );
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ status: 0, message: 'network down' }),
      );
    } finally {
      unsubscribe();
    }
  });
});

describe('reportApiError / subscribeApiErrors', () => {
  it('delivers exactly one event per call', () => {
    const handler = vi.fn();
    const unsubscribe = subscribeApiErrors(handler);

    reportApiError({ url: '/x', status: 500 });
    reportApiError({ url: '/y', status: 404 });

    expect(handler).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('unsubscribe stops delivery', () => {
    const handler = vi.fn();
    const unsubscribe = subscribeApiErrors(handler);

    reportApiError({ url: '/x', status: 500 });
    unsubscribe();
    reportApiError({ url: '/y', status: 404 });

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
