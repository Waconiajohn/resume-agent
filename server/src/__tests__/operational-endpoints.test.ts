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
    process.env.SERPAPI_API_KEY = 'test-serpapi-key';
    process.env.SERPER_API_KEY = 'test-serper-key';
    delete process.env.FIRECRAWL_API_KEY;
    delete process.env.BILLING_REQUIRED;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
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
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json() as {
      ready: boolean;
      db_ok: boolean;
      llm_key_ok: boolean;
      feature_dependencies_ok: boolean;
      feature_dependencies: Record<string, { enabled: boolean; ok: boolean; requires: string[] }>;
    };
    expect(body.ready).toBe(true);
    expect(body.db_ok).toBe(true);
    expect(body.llm_key_ok).toBe(true);
    expect(body.feature_dependencies_ok).toBe(true);
    expect(body.feature_dependencies.job_search).toMatchObject({
      enabled: true,
      ok: true,
      requires: ['SERPAPI_API_KEY'],
    });
    expect(body.feature_dependencies.network_intelligence).toMatchObject({
      enabled: true,
      ok: true,
      requires: ['SERPAPI_API_KEY'],
    });
    expect(body.feature_dependencies.job_finder).toMatchObject({
      enabled: true,
      ok: true,
      requires: ['SERPER_API_KEY'],
    });
  });

  it('fails readiness when structured listings are missing for launched job surfaces', async () => {
    delete process.env.SERPAPI_API_KEY;
    process.env.SERPER_API_KEY = 'test-serper-key';

    const res = await app.request('http://test/ready');

    expect(res.status).toBe(503);
    const body = await res.json() as {
      ready: boolean;
      feature_dependencies_ok: boolean;
      feature_dependencies: Record<string, { ok: boolean; requires: string[] }>;
    };
    expect(body.ready).toBe(false);
    expect(body.feature_dependencies_ok).toBe(false);
    expect(body.feature_dependencies.job_search).toMatchObject({
      ok: false,
      requires: ['SERPAPI_API_KEY'],
    });
    expect(body.feature_dependencies.network_intelligence).toMatchObject({
      ok: false,
      requires: ['SERPAPI_API_KEY'],
    });
    expect(body.feature_dependencies.job_finder).toMatchObject({
      ok: true,
      requires: ['SERPER_API_KEY'],
    });
  });

  it('fails readiness when the enabled legacy Job Finder search key is missing', async () => {
    process.env.SERPAPI_API_KEY = 'test-serpapi-key';
    delete process.env.SERPER_API_KEY;

    const res = await app.request('http://test/ready');

    expect(res.status).toBe(503);
    const body = await res.json() as {
      ready: boolean;
      feature_dependencies_ok: boolean;
      feature_dependencies: Record<string, { ok: boolean; requires: string[] }>;
    };
    expect(body.ready).toBe(false);
    expect(body.feature_dependencies_ok).toBe(false);
    expect(body.feature_dependencies.job_search).toMatchObject({
      ok: true,
      requires: ['SERPAPI_API_KEY'],
    });
    expect(body.feature_dependencies.network_intelligence).toMatchObject({
      ok: true,
      requires: ['SERPAPI_API_KEY'],
    });
    expect(body.feature_dependencies.job_finder).toMatchObject({
      ok: false,
      requires: ['SERPER_API_KEY'],
    });
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
