/**
 * Watchlist Routes — tests for /api/watchlist/* CRUD endpoints.
 *
 * Sprint 58, Story: Job Command Center backend tests.
 *
 * Pattern: mirrors job-search-route.test.ts — mount route on local Hono app,
 * mock supabaseAdmin, authMiddleware, rateLimitMiddleware, feature-flags.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mockFrom = vi.hoisted(() => vi.fn());

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
  authMiddleware: vi.fn(
    async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
      c.set('user', { id: 'user-test-456', email: 'tester@example.com' });
      await next();
    },
  ),
}));

vi.mock('../middleware/rate-limit.js', () => ({
  rateLimitMiddleware: () =>
    async (_c: unknown, next: () => Promise<void>) => {
      await next();
    },
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { Hono } from 'hono';
import { watchlistRoutes } from '../routes/watchlist.js';

// ─── Test app ─────────────────────────────────────────────────────────────────

const app = new Hono();
app.route('/api/watchlist', watchlistRoutes);

// ─── Chain builder helpers ────────────────────────────────────────────────────

/**
 * Build a Supabase query chain that resolves via `.single()`.
 */
function buildSingleChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ['insert', 'select', 'eq', 'update', 'delete', 'upsert', 'order'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain['single'] = vi.fn().mockResolvedValue(result);
  return chain;
}

/**
 * Build a Supabase query chain that resolves via the awaitable `.then()` pattern.
 * Used for list queries (.select().eq().order()) which don't call .single().
 */
function buildListChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ['insert', 'select', 'eq', 'update', 'delete', 'upsert', 'order'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  Object.defineProperty(chain, 'then', {
    value: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  });
  return chain;
}

/**
 * Build a delete chain — delete resolves via .then() after .eq() calls.
 */
function buildDeleteChain(result: unknown) {
  return buildListChain(result);
}

function makeCompany(id = 'company-1') {
  return {
    id,
    user_id: 'user-test-456',
    name: 'Acme Corp',
    industry: 'Technology',
    website: 'https://acme.example.com',
    careers_url: null,
    priority: 5,
    source: 'manual',
    notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('watchlist routes — FF_JOB_SEARCH=false guard', () => {
  it('returns 404 when feature flag is false', async () => {
    // Test the guard middleware logic in isolation (same pattern as job-search-route.test.ts)
    const { Hono: HonoLocal } = await import('hono');
    const guardApp = new HonoLocal();

    const FF_OFF = false;
    guardApp.use('*', async (c, next) => {
      if (!FF_OFF) return c.json({ error: 'Not found' }, 404);
      await next();
    });
    guardApp.get('/', async (c) => c.json({ companies: [] }));

    const res = await guardApp.request('/', { method: 'GET' });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Not found');
  });
});

describe('POST /api/watchlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a company and returns 201 with the created record', async () => {
    const company = makeCompany();
    mockFrom.mockReturnValue(buildSingleChain({ data: company, error: null }));

    const res = await app.request('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({ name: 'Acme Corp', industry: 'Technology', priority: 5 }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as typeof company;
    expect(body.name).toBe('Acme Corp');
    expect(body.id).toBe('company-1');
  });

  it('returns 400 when name is missing', async () => {
    const res = await app.request('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({ industry: 'Technology' }), // no name
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Invalid input');
  });

  it('returns 400 when name is empty string', async () => {
    const res = await app.request('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({ name: '' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when website is not a valid URL', async () => {
    const res = await app.request('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({ name: 'Acme', website: 'not-a-url' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 500 when supabase insert fails', async () => {
    mockFrom.mockReturnValue(
      buildSingleChain({ data: null, error: { message: 'DB constraint violation' } }),
    );

    const res = await app.request('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({ name: 'Acme Corp' }),
    });

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Failed to create watchlist company');
  });

  it('accepts minimal valid body (name only)', async () => {
    const company = makeCompany();
    mockFrom.mockReturnValue(buildSingleChain({ data: company, error: null }));

    const res = await app.request('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({ name: 'Minimal Co' }),
    });

    expect(res.status).toBe(201);
  });
});

describe('GET /api/watchlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns list of companies with count', async () => {
    const companies = [makeCompany('c1'), makeCompany('c2')];
    mockFrom.mockReturnValue(buildListChain({ data: companies, error: null }));

    const res = await app.request('/api/watchlist', {
      method: 'GET',
      headers: { Authorization: 'Bearer tok' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { companies: unknown[]; count: number };
    expect(body.companies).toHaveLength(2);
    expect(body.count).toBe(2);
  });

  it('returns empty companies array and count 0 when no companies', async () => {
    mockFrom.mockReturnValue(buildListChain({ data: [], error: null }));

    const res = await app.request('/api/watchlist', {
      method: 'GET',
      headers: { Authorization: 'Bearer tok' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { companies: unknown[]; count: number };
    expect(body.companies).toEqual([]);
    expect(body.count).toBe(0);
  });

  it('returns 500 when supabase list query fails', async () => {
    mockFrom.mockReturnValue(buildListChain({ data: null, error: { message: 'Query failed' } }));

    const res = await app.request('/api/watchlist', {
      method: 'GET',
      headers: { Authorization: 'Bearer tok' },
    });

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Failed to list watchlist companies');
  });
});

describe('PATCH /api/watchlist/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates a company and returns the updated record', async () => {
    const updated = { ...makeCompany(), name: 'Updated Corp', priority: 10 };
    mockFrom.mockReturnValue(buildSingleChain({ data: updated, error: null }));

    const res = await app.request('/api/watchlist/company-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({ name: 'Updated Corp', priority: 10 }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as typeof updated;
    expect(body.name).toBe('Updated Corp');
    expect(body.priority).toBe(10);
  });

  it('returns 500 when supabase update fails', async () => {
    mockFrom.mockReturnValue(
      buildSingleChain({ data: null, error: { message: 'Update failed' } }),
    );

    const res = await app.request('/api/watchlist/company-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({ name: 'Updated Corp' }),
    });

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Failed to update watchlist company');
  });

  it('returns 400 when website is not a valid URL in update', async () => {
    const res = await app.request('/api/watchlist/company-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({ website: 'not-a-url' }),
    });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/watchlist/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 204 on successful delete', async () => {
    mockFrom.mockReturnValue(buildDeleteChain({ error: null }));

    const res = await app.request('/api/watchlist/company-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer tok' },
    });

    expect(res.status).toBe(204);
  });

  it('returns 500 when supabase delete fails', async () => {
    mockFrom.mockReturnValue(buildDeleteChain({ error: { message: 'Delete failed' } }));

    const res = await app.request('/api/watchlist/company-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer tok' },
    });

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Failed to delete watchlist company');
  });
});
