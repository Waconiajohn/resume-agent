import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../lib/supabase.js', () => {
  const limit = vi.fn(async () => ({ error: null }));
  const select = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ select }));
  return {
    supabaseAdmin: {
      from,
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: new Error('not used') })),
      },
    },
  };
});

import { app } from '../index.js';

describe('operational endpoints', () => {
  beforeEach(() => {
    process.env.ZAI_API_KEY = 'test-key';
    process.env.NODE_ENV = 'test';
  });

  it('returns no-store and security headers on /health', async () => {
    const res = await app.request('http://test/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('strict-transport-security')).toBeNull();
  });

  it('returns structured readiness payload on /ready', async () => {
    const res = await app.request('http://test/ready');
    expect([200, 503]).toContain(res.status);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json() as { ready: boolean; db_ok: boolean; llm_key_ok: boolean };
    expect(typeof body.ready).toBe('boolean');
    expect(typeof body.db_ok).toBe('boolean');
    expect(typeof body.llm_key_ok).toBe('boolean');
  });

  it('returns no-store on /metrics', async () => {
    const res = await app.request('http://test/metrics');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects malformed session ids on SSE endpoint before auth checks', async () => {
    const res = await app.request('http://test/api/sessions/not-a-uuid/sse');
    expect(res.status).toBe(400);
  });
});
