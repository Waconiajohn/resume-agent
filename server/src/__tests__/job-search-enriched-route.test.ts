/**
 * Job Search Enriched Routes — tests for GET /enriched/:scanId and GET /scans/latest
 *
 * Sprint 59, Story: Job Command Center — NI enrichment endpoints.
 *
 * Pattern: mount jobSearchRoutes on a local Hono app.
 * Mock: supabaseAdmin, authMiddleware, rateLimitMiddleware, feature-flags,
 *       crossReferenceWithNetwork, searchAllSources.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks — hoisted before imports ──────────────────────────────────────────

const mockFrom = vi.hoisted(() => vi.fn());

const mockCrossReferenceWithNetwork = vi.hoisted(() => vi.fn().mockResolvedValue(new Map()));

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
  searchAllSources: vi.fn().mockResolvedValue({
    jobs: [],
    executionTimeMs: 42,
    sources_queried: ['firecrawl'],
  }),
}));

vi.mock('../lib/job-search/adapters/firecrawl.js', () => ({
  FirecrawlAdapter: class {
    name = 'firecrawl';
    search = vi.fn().mockResolvedValue([]);
  },
}));

vi.mock('../lib/job-search/ai-matcher.js', () => ({
  matchJobsToProfile: vi.fn().mockResolvedValue([]),
}));

vi.mock('../lib/job-search/ni-crossref.js', () => ({
  crossReferenceWithNetwork: mockCrossReferenceWithNetwork,
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { Hono } from 'hono';
import { jobSearchRoutes } from '../routes/job-search.js';

// ─── Test app ─────────────────────────────────────────────────────────────────

const app = new Hono();
app.route('/api/job-search', jobSearchRoutes);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSingleChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ['insert', 'select', 'eq', 'upsert', 'update', 'order', 'limit', 'is'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain['single'] = vi.fn().mockResolvedValue(result);
  return chain;
}

function buildListChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ['select', 'eq', 'neq', 'or', 'gt', 'in', 'order', 'limit', 'is', 'insert', 'upsert', 'update'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  Object.defineProperty(chain, 'then', {
    value: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  });
  return chain;
}

function makeListing(externalId: string, company = 'Acme Corp') {
  return {
    id: `lst-${externalId}`,
    external_id: externalId,
    source: 'firecrawl',
    title: 'CTO',
    company,
    location: 'NYC',
    salary_min: null,
    salary_max: null,
    description: null,
    posted_date: new Date().toISOString(),
    apply_url: null,
    remote_type: null,
    employment_type: null,
    required_skills: null,
  };
}

function makeResultRow(externalId: string, company = 'Acme Corp') {
  return {
    id: `res-${externalId}`,
    scan_id: 'scan-abc',
    listing_id: `lst-${externalId}`,
    user_id: 'user-test-123',
    status: 'new',
    match_score: 85,
    first_seen_at: new Date().toISOString(), // already seen — avoids fire-and-forget marking call
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    job_listings: makeListing(externalId, company),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockCrossReferenceWithNetwork.mockResolvedValue(new Map());
});

describe('GET /api/job-search/enriched/:scanId', () => {
  it('returns 404 when scan does not belong to this user', async () => {
    mockFrom.mockReturnValueOnce(
      buildSingleChain({ data: null, error: { message: 'not found' } }),
    );

    const res = await app.request('/api/job-search/enriched/scan-wrong-user', {
      headers: { Authorization: 'Bearer tok' },
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Scan not found');
  });

  it('returns results with network_contacts field on each row', async () => {
    const contact = { id: 'c-1', name: 'Jane Smith', title: 'VP Eng', company: 'Acme Corp' };
    const contactMap = new Map([['ext-1', [contact]]]);
    mockCrossReferenceWithNetwork.mockResolvedValueOnce(contactMap);

    // scan ownership check
    mockFrom.mockReturnValueOnce(
      buildSingleChain({ data: { id: 'scan-abc' }, error: null }),
    );
    // results query
    mockFrom.mockReturnValueOnce(
      buildListChain({ data: [makeResultRow('ext-1')], error: null }),
    );

    const res = await app.request('/api/job-search/enriched/scan-abc', {
      headers: { Authorization: 'Bearer tok' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { scan_id: string; results: Array<{ network_contacts: unknown[] }> };
    expect(body.scan_id).toBe('scan-abc');
    expect(body.results).toHaveLength(1);
    expect(body.results[0].network_contacts).toHaveLength(1);
    expect((body.results[0].network_contacts[0] as { name: string }).name).toBe('Jane Smith');
  });

  it('returns empty network_contacts array when no contacts match', async () => {
    mockFrom.mockReturnValueOnce(
      buildSingleChain({ data: { id: 'scan-abc' }, error: null }),
    );
    mockFrom.mockReturnValueOnce(
      buildListChain({ data: [makeResultRow('ext-no-match', 'Unknown Corp')], error: null }),
    );

    const res = await app.request('/api/job-search/enriched/scan-abc', {
      headers: { Authorization: 'Bearer tok' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Array<{ network_contacts: unknown[] }> };
    expect(body.results[0].network_contacts).toEqual([]);
  });

  it('returns empty results array when scan has no job results', async () => {
    mockFrom.mockReturnValueOnce(
      buildSingleChain({ data: { id: 'scan-abc' }, error: null }),
    );
    mockFrom.mockReturnValueOnce(
      buildListChain({ data: [], error: null }),
    );

    const res = await app.request('/api/job-search/enriched/scan-abc', {
      headers: { Authorization: 'Bearer tok' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { scan_id: string; results: unknown[] };
    expect(body.results).toHaveLength(0);
  });
});

describe('GET /api/job-search/scans/latest', () => {
  it('returns contact data when include_contacts=true', async () => {
    const contact = { id: 'c-1', name: 'Bob Jones', title: 'Director', company: 'Acme Corp' };
    const contactMap = new Map([['ext-1', [contact]]]);
    mockCrossReferenceWithNetwork.mockResolvedValueOnce(contactMap);

    // latest scan
    mockFrom.mockReturnValueOnce(
      buildSingleChain({ data: { id: 'scan-latest', query: 'CTO', created_at: new Date().toISOString() }, error: null }),
    );
    // results
    mockFrom.mockReturnValueOnce(
      buildListChain({ data: [makeResultRow('ext-1')], error: null }),
    );

    const res = await app.request('/api/job-search/scans/latest?include_contacts=true', {
      headers: { Authorization: 'Bearer tok' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Array<{ network_contacts: unknown[] }> };
    expect(body.results[0].network_contacts).toHaveLength(1);
    expect(mockCrossReferenceWithNetwork).toHaveBeenCalledOnce();
  });

  it('returns no network_contacts field when include_contacts is omitted', async () => {
    // latest scan
    mockFrom.mockReturnValueOnce(
      buildSingleChain({ data: { id: 'scan-latest', query: 'CTO', created_at: new Date().toISOString() }, error: null }),
    );
    // results
    mockFrom.mockReturnValueOnce(
      buildListChain({ data: [makeResultRow('ext-1')], error: null }),
    );

    const res = await app.request('/api/job-search/scans/latest', {
      headers: { Authorization: 'Bearer tok' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Array<Record<string, unknown>> };
    expect(body.results[0].network_contacts).toBeUndefined();
    expect(mockCrossReferenceWithNetwork).not.toHaveBeenCalled();
  });

  it('requires a known posted_date inside the stored scan freshness window', async () => {
    // latest scan
    mockFrom.mockReturnValueOnce(
      buildSingleChain({
        data: {
          id: 'scan-latest',
          query: 'CTO',
          created_at: new Date().toISOString(),
          filters: { datePosted: '14d' },
        },
        error: null,
      }),
    );
    // results
    const resultsChain = buildListChain({ data: [makeResultRow('ext-1')], error: null });
    mockFrom.mockReturnValueOnce(resultsChain);

    const res = await app.request('/api/job-search/scans/latest', {
      headers: { Authorization: 'Bearer tok' },
    });

    expect(res.status).toBe(200);
    expect(resultsChain['gt']).toHaveBeenCalledWith(
      'job_listings.posted_date',
      expect.any(String),
    );
    const threshold = Date.parse((resultsChain['gt'] as ReturnType<typeof vi.fn>).mock.calls[0][1]);
    expect(Math.abs(threshold - (Date.now() - 14 * 24 * 60 * 60 * 1000))).toBeLessThan(10_000);
  });

  it('returns empty state when user has no scans', async () => {
    mockFrom.mockReturnValueOnce(
      buildSingleChain({ data: null, error: { message: 'no rows' } }),
    );

    const res = await app.request('/api/job-search/scans/latest', {
      headers: { Authorization: 'Bearer tok' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { scan: null; results: unknown[] };
    expect(body.scan).toBeNull();
    expect(body.results).toEqual([]);
  });
});
