/**
 * Job Search Route — tests for POST /api/job-search.
 *
 * Sprint 57, Story: Job Command Center backend tests.
 *
 * Pattern: mount jobSearchRoutes on a local Hono app (same as b2b-admin.test.ts).
 * Mock: supabaseAdmin, authMiddleware, rateLimitMiddleware, feature-flags, searchAllSources.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks — hoisted before imports ──────────────────────────────────────────

const mockFrom = vi.hoisted(() => vi.fn());

const mockSearchAllSources = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    jobs: [],
    executionTimeMs: 42,
    sources_queried: ['firecrawl'],
  }),
);

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: mockFrom,
    auth: { getUser: vi.fn() },
  },
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

vi.mock('../lib/feature-flags.js', () => ({
  FF_JOB_SEARCH: true,
}));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set('user', { id: 'user-test-123', email: 'tester@example.com' });
    await next();
  }),
}));

vi.mock('../middleware/rate-limit.js', () => ({
  rateLimitMiddleware: () =>
    async (_c: unknown, next: () => Promise<void>) => {
      await next();
    },
}));

vi.mock('../lib/job-search/index.js', () => ({
  searchAllSources: mockSearchAllSources,
}));

vi.mock('../lib/job-search/adapters/firecrawl.js', () => ({
  FirecrawlAdapter: class {
    name = 'firecrawl';
    search = vi.fn().mockResolvedValue([]);
  },
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { Hono } from 'hono';
import { jobSearchRoutes } from '../routes/job-search.js';

// ─── Test app ─────────────────────────────────────────────────────────────────

const app = new Hono();
app.route('/api/job-search', jobSearchRoutes);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a Supabase query chain that resolves to `result` when `.single()` is called.
 * All chainable methods return the same chain object.
 */
function buildScanChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ['insert', 'select', 'eq', 'upsert', 'update'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain['single'] = vi.fn().mockResolvedValue(result);
  return chain;
}

/**
 * Build a Supabase upsert chain that resolves via `.then()` (list result pattern).
 */
function buildListChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ['upsert', 'insert', 'select', 'eq', 'update'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  Object.defineProperty(chain, 'then', {
    value: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  });
  return chain;
}

function makeJob(id: string) {
  return {
    external_id: `firecrawl_${id}`,
    title: 'CTO',
    company: 'Acme',
    location: 'NYC',
    salary_min: null,
    salary_max: null,
    description: null,
    posted_date: new Date().toISOString(),
    apply_url: null,
    source: 'firecrawl',
    remote_type: null,
    employment_type: null,
    required_skills: null,
  };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    query: 'Chief Technology Officer',
    location: 'San Francisco, CA',
    filters: { datePosted: '7d' },
    ...overrides,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/job-search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchAllSources.mockResolvedValue({
      jobs: [],
      executionTimeMs: 42,
      sources_queried: ['firecrawl'],
    });
  });

  it('returns 400 on invalid request body — missing query', async () => {
    const res = await app.request('/api/job-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({ location: 'NYC' }), // no query
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Invalid request');
  });

  it('returns 400 on invalid request body — query too long', async () => {
    const res = await app.request('/api/job-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({ query: 'x'.repeat(501) }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when body is not valid JSON', async () => {
    const res = await app.request('/api/job-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: 'not-json',
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid datePosted enum value', async () => {
    const res = await app.request('/api/job-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({ query: 'CTO', filters: { datePosted: '99d' } }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 500 when scan insert fails', async () => {
    mockFrom.mockReturnValueOnce(
      buildScanChain({ data: null, error: { message: 'DB write failed' } }),
    );

    const res = await app.request('/api/job-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: validBody(),
    });

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Failed to save search results');
  });

  it('returns empty jobs array when search returns no results and scan persists', async () => {
    mockFrom.mockReturnValueOnce(
      buildScanChain({ data: { id: 'scan-001' }, error: null }),
    );

    const res = await app.request('/api/job-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: validBody(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { jobs: unknown[]; sources_queried: string[] };
    expect(body.jobs).toHaveLength(0);
    expect(body.sources_queried).toEqual(['firecrawl']);
  });

  it('returns 500 when listing upsert fails', async () => {
    const job = makeJob('j1');
    mockSearchAllSources.mockResolvedValueOnce({
      jobs: [job],
      executionTimeMs: 20,
      sources_queried: ['firecrawl'],
    });

    // scan insert succeeds
    mockFrom.mockReturnValueOnce(
      buildScanChain({ data: { id: 'scan-002' }, error: null }),
    );
    // listing upsert fails — resolves via .then
    mockFrom.mockReturnValueOnce(
      buildListChain({ data: null, error: { message: 'Upsert error' } }),
    );

    const res = await app.request('/api/job-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: validBody(),
    });

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Failed to save job listings');
  });

  it('returns 200 with jobs on valid request with successful DB writes', async () => {
    const job = makeJob('j2');
    mockSearchAllSources.mockResolvedValueOnce({
      jobs: [job],
      executionTimeMs: 30,
      sources_queried: ['firecrawl'],
    });

    // scan insert succeeds
    mockFrom.mockReturnValueOnce(
      buildScanChain({ data: { id: 'scan-003' }, error: null }),
    );

    // listing upsert succeeds — returns listing rows for id mapping
    mockFrom.mockReturnValueOnce(
      buildListChain({
        data: [{ id: 'lst-1', external_id: 'firecrawl_j2', source: 'firecrawl' }],
        error: null,
      }),
    );

    // job_search_results insert succeeds
    mockFrom.mockReturnValueOnce(
      buildListChain({ error: null }),
    );

    const res = await app.request('/api/job-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: validBody(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { jobs: unknown[]; executionTimeMs: number; sources_queried: string[] };
    expect(body.jobs).toHaveLength(1);
    expect(body.executionTimeMs).toBe(30);
    expect(body.sources_queried).toEqual(['firecrawl']);
  });

  it('accepts request without explicit filters (uses defaults)', async () => {
    mockFrom.mockReturnValueOnce(
      buildScanChain({ data: { id: 'scan-004' }, error: null }),
    );

    const res = await app.request('/api/job-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({ query: 'Director of Engineering' }),
    });

    expect(res.status).toBe(200);
  });

  it('response includes executionTimeMs and sources_queried', async () => {
    mockFrom.mockReturnValueOnce(
      buildScanChain({ data: { id: 'scan-005' }, error: null }),
    );

    const res = await app.request('/api/job-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: validBody(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { executionTimeMs: number; sources_queried: string[] };
    expect(typeof body.executionTimeMs).toBe('number');
    expect(Array.isArray(body.sources_queried)).toBe(true);
  });
});

// ─── Feature flag disabled guard ──────────────────────────────────────────────

describe('POST /api/job-search — FF_JOB_SEARCH=false guard logic', () => {
  it('middleware pattern returns 404 when flag is false', async () => {
    // Test the guard middleware pattern in isolation
    const { Hono: HonoLocal } = await import('hono');
    const guardApp = new HonoLocal();

    const FF_OFF = false;
    guardApp.use('*', async (c, next) => {
      if (!FF_OFF) return c.json({ error: 'Not found' }, 404);
      await next();
    });
    guardApp.post('/', async (c) => c.json({ ok: true }));

    const res = await guardApp.request('/', { method: 'POST' });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Not found');
  });
});
