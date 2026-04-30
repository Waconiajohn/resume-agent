/**
 * Integration tests for the Network Intelligence routes — /api/ni/*
 *
 * Strategy: Mount the ni Hono router in a lightweight test app, mock all
 * external dependencies (auth middleware, feature flag, connections-store,
 * logger, rate-limit middleware), then drive each route via app.request().
 *
 * Tests follow the same vi.hoisted() + vi.mock() pattern used by other route
 * tests in this suite (see resumes-edit.test.ts, pipeline-respond.test.ts).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mock factories ────────────────────────────────────────────────────
// vi.hoisted() ensures these variables exist before the vi.mock() factory
// functions run, avoiding temporal dead zone issues.

const mockDeleteConnectionsByUser = vi.hoisted(() => vi.fn());
const mockInsertConnections = vi.hoisted(() => vi.fn());
const mockGetEnrichedConnectionsByUser = vi.hoisted(() => vi.fn());
const mockGetConnectionCount = vi.hoisted(() => vi.fn());
const mockGetCompanySummary = vi.hoisted(() => vi.fn());
const mockCreateScrapeLogEntry = vi.hoisted(() => vi.fn());
const mockCompleteScrapeLogEntry = vi.hoisted(() => vi.fn());
const mockSupabaseFrom = vi.hoisted(() => vi.fn(() => {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.limit = vi.fn().mockResolvedValue({ data: [], error: null });
  chain.then = undefined;
  return chain;
}));

const mockInsertTargetTitle = vi.hoisted(() => vi.fn());
const mockGetTargetTitlesByUser = vi.hoisted(() => vi.fn());
const mockDeleteTargetTitle = vi.hoisted(() => vi.fn());

const mockInsertJobMatch = vi.hoisted(() => vi.fn());
const mockGetJobMatchesByUser = vi.hoisted(() => vi.fn());
const mockUpdateJobMatchStatus = vi.hoisted(() => vi.fn());
const mockGetBonusSearchCompanies = vi.hoisted(() => vi.fn());

// Feature flag — default ON so most tests exercise real route logic.
// Individual tests can override with mockReturnValue inside the test body.
const mockFF = vi.hoisted(() => ({ FF_NETWORK_INTELLIGENCE: true }));

// ─── Module mocks (must appear before imports) ────────────────────────────────

// Auth middleware — bypasses JWT verification and injects a known user object.
// The ni.ts route reads c.get('user').id, so the mock sets that key directly.
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(
    async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
      c.set('user', { id: 'test-user-id', email: 'test@example.com', accessToken: 'test-token' });
      await next();
    },
  ),
}));

// Feature flags — controlled via the hoisted mockFF object so individual
// tests can toggle FF_NETWORK_INTELLIGENCE without reimporting the module.
vi.mock('../lib/feature-flags.js', () => mockFF);

// Connections store — all exported functions are replaced with vi.fn()
// stubs so tests never touch Supabase.
vi.mock('../lib/ni/connections-store.js', () => ({
  deleteConnectionsByUser: mockDeleteConnectionsByUser,
  insertConnections: mockInsertConnections,
  getEnrichedConnectionsByUser: mockGetEnrichedConnectionsByUser,
  getConnectionCount: mockGetConnectionCount,
  getCompanySummary: mockGetCompanySummary,
  createScrapeLogEntry: mockCreateScrapeLogEntry,
  completeScrapeLogEntry: mockCompleteScrapeLogEntry,
}));

// Target titles store
vi.mock('../lib/ni/target-titles-store.js', () => ({
  insertTargetTitle: mockInsertTargetTitle,
  getTargetTitlesByUser: mockGetTargetTitlesByUser,
  deleteTargetTitle: mockDeleteTargetTitle,
}));

// Job matches store
vi.mock('../lib/ni/job-matches-store.js', () => ({
  insertJobMatch: mockInsertJobMatch,
  getJobMatchesByUser: mockGetJobMatchesByUser,
  updateJobMatchStatus: mockUpdateJobMatchStatus,
}));

vi.mock('../lib/ni/bonus-company-search.js', () => ({
  getBonusSearchCompanies: mockGetBonusSearchCompanies,
}));

// Company normalizer — no-op in route tests (tested separately).
vi.mock('../lib/ni/company-normalizer.js', () => ({
  normalizeCompanyBatch: vi.fn().mockResolvedValue({
    results: [],
    newCompaniesCreated: 0,
    cacheHits: 0,
    llmCallsMade: 0,
  }),
}));

// Boolean search — stub so route tests don't need the LLM provider.
vi.mock('../lib/ni/boolean-search.js', () => ({
  generateBooleanSearch: vi.fn().mockResolvedValue({
    id: 'bs_test_abc123',
    result: {
      linkedin: '"VP Operations" -intern',
      indeed: 'title:("VP Operations")',
      google: 'site:linkedin.com/jobs "VP Operations"',
      extractedTerms: { skills: [], titles: ['VP Operations'], industries: [] },
      generatedAt: '2026-03-07T00:00:00.000Z',
    },
  }),
  getBooleanSearch: vi.fn().mockReturnValue(null),
}));

// Career scraper — stub to avoid fetch calls and supabase in route tests.
vi.mock('../lib/ni/career-scraper.js', () => ({
  scrapeCareerPages: vi.fn().mockResolvedValue({
    companiesScanned: 0,
    jobsFound: 0,
    matchingJobs: 0,
    referralAvailable: 0,
    errors: [],
  }),
}));

// Supabase — stub to prevent missing env var errors in route tests.
vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: mockSupabaseFrom,
  },
}));

// Logger — no-op to keep test output clean.
vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

// Rate-limit middleware — pass through unconditionally in tests.
vi.mock('../middleware/rate-limit.js', () => ({
  rateLimitMiddleware: vi.fn(
    () => async (_c: unknown, next: () => Promise<void>) => {
      await next();
    },
  ),
}));

// ─── Imports (must come AFTER vi.mock() calls) ────────────────────────────────

import { Hono } from 'hono';
import { ni } from '../routes/ni.js';

// ─── Test app factory ─────────────────────────────────────────────────────────

function makeApp() {
  const app = new Hono();
  app.route('/api/ni', ni);
  return app;
}

// ─── CSV fixture helpers ───────────────────────────────────────────────────────

/** Minimal valid LinkedIn-format CSV with one connection row. */
const VALID_CSV = [
  'First Name,Last Name,Email Address,Company,Position,Connected On',
  'Jane,Smith,jane@example.com,Acme Corp,VP Engineering,15 Jan 2023',
].join('\n');

/** CSV that has the right headers but every data row is missing required fields. */
const EMPTY_CONNECTIONS_CSV = [
  'First Name,Last Name,Email Address,Company,Position,Connected On',
  ',,,,',
].join('\n');

/** CSV with headers that do not include required First Name / Last Name / Company. */
const INVALID_HEADERS_CSV = 'foo,bar,baz\nval1,val2,val3';

// ─── Default store mock setup ─────────────────────────────────────────────────

/** Configure the connections-store mocks to succeed for a single import. */
function setupHappyPathStoreMocks() {
  mockCreateScrapeLogEntry.mockResolvedValue('log-id-123');
  mockDeleteConnectionsByUser.mockResolvedValue(true);
  mockInsertConnections.mockResolvedValue(1);
  mockCompleteScrapeLogEntry.mockResolvedValue(undefined);
}

function buildSingleChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'limit']) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockResolvedValue(result);
  return chain;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/ni/csv/parse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset feature flag to enabled before each test.
    mockFF.FF_NETWORK_INTELLIGENCE = true;
  });

  // ── 1. Feature flag disabled returns 404 ───────────────────────────────────

  it('returns 404 when FF_NETWORK_INTELLIGENCE is disabled', async () => {
    mockFF.FF_NETWORK_INTELLIGENCE = false;

    const app = makeApp();
    const res = await app.request('/api/ni/csv/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ csv_text: VALID_CSV }),
    });

    expect(res.status).toBe(404);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBeDefined();
  });

  // ── 2. Missing auth returns 401 ────────────────────────────────────────────

  it('returns 401 when Authorization header is absent', async () => {
    const { authMiddleware } = await import('../middleware/auth.js');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(authMiddleware).mockImplementationOnce(async (c: any) => {
      return c.json({ error: 'Missing or invalid Authorization header' }, 401);
    });

    const app = makeApp();
    const res = await app.request('/api/ni/csv/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv_text: VALID_CSV }),
    });

    expect(res.status).toBe(401);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.error).toBe('string');
  });

  // ── 3. Invalid body (missing csv_text) returns 400 ────────────────────────

  it('returns 400 when csv_text is missing from the request body', async () => {
    const app = makeApp();
    const res = await app.request('/api/ni/csv/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ file_name: 'connections.csv' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBeDefined();
  });

  it('returns 400 when csv_text is an empty string', async () => {
    const app = makeApp();
    const res = await app.request('/api/ni/csv/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ csv_text: '' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBeDefined();
  });

  // ── 4. Valid CSV upload returns 200 with summary ───────────────────────────

  it('returns 200 with a CsvUploadResponse summary on valid input', async () => {
    setupHappyPathStoreMocks();

    const app = makeApp();
    const res = await app.request('/api/ni/csv/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ csv_text: VALID_CSV, file_name: 'connections.csv' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(typeof body.totalRows).toBe('number');
    expect(typeof body.validRows).toBe('number');
    expect(typeof body.skippedRows).toBe('number');
    expect(typeof body.duplicatesRemoved).toBe('number');
    expect(typeof body.uniqueCompanies).toBe('number');
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it('calls deleteConnectionsByUser before insertConnections on valid upload', async () => {
    setupHappyPathStoreMocks();

    const app = makeApp();
    await app.request('/api/ni/csv/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ csv_text: VALID_CSV }),
    });

    expect(mockDeleteConnectionsByUser).toHaveBeenCalledOnce();
    expect(mockDeleteConnectionsByUser).toHaveBeenCalledWith('test-user-id');
    expect(mockInsertConnections).toHaveBeenCalledOnce();
  });

  it('creates and completes a scrape log entry on successful import', async () => {
    setupHappyPathStoreMocks();

    const app = makeApp();
    await app.request('/api/ni/csv/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ csv_text: VALID_CSV, file_name: 'test.csv' }),
    });

    expect(mockCreateScrapeLogEntry).toHaveBeenCalledOnce();
    expect(mockCreateScrapeLogEntry).toHaveBeenCalledWith(
      'test-user-id',
      'csv_import',
      expect.objectContaining({ file_name: 'test.csv' }),
    );
    expect(mockCompleteScrapeLogEntry).toHaveBeenCalledOnce();
    expect(mockCompleteScrapeLogEntry).toHaveBeenCalledWith(
      'log-id-123',
      'completed',
      expect.any(Object),
    );
  });

  it('uses ISO timestamp as batch id when file_name is omitted', async () => {
    setupHappyPathStoreMocks();

    const app = makeApp();
    await app.request('/api/ni/csv/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ csv_text: VALID_CSV }),
    });

    expect(mockInsertConnections).toHaveBeenCalledWith(
      'test-user-id',
      expect.any(Array),
      expect.any(String),
    );
  });

  // ── 5. Empty CSV (no valid connections) returns 400 ───────────────────────

  it('returns 400 when CSV parses to zero valid connections', async () => {
    const app = makeApp();
    const res = await app.request('/api/ni/csv/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ csv_text: EMPTY_CONNECTIONS_CSV }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(false);
    expect(body.validRows).toBe(0);
    expect(mockInsertConnections).not.toHaveBeenCalled();
    expect(mockDeleteConnectionsByUser).not.toHaveBeenCalled();
  });

  it('returns 400 when CSV has unrecognised headers (no valid connections)', async () => {
    const app = makeApp();
    const res = await app.request('/api/ni/csv/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ csv_text: INVALID_HEADERS_CSV }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(false);
  });

  // ── 6. Store failure returns 500 ──────────────────────────────────────────

  it('returns 500 when insertConnections throws', async () => {
    mockCreateScrapeLogEntry.mockResolvedValue('log-id-456');
    mockDeleteConnectionsByUser.mockResolvedValue(true);
    mockInsertConnections.mockRejectedValue(new Error('DB write failed'));
    mockCompleteScrapeLogEntry.mockResolvedValue(undefined);

    const app = makeApp();
    const res = await app.request('/api/ni/csv/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ csv_text: VALID_CSV }),
    });

    expect(res.status).toBe(500);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toMatch(/failed to store connections/i);
  });

  it('marks the scrape log as failed when insertConnections throws', async () => {
    mockCreateScrapeLogEntry.mockResolvedValue('log-id-789');
    mockDeleteConnectionsByUser.mockResolvedValue(true);
    mockInsertConnections.mockRejectedValue(new Error('Timeout'));
    mockCompleteScrapeLogEntry.mockResolvedValue(undefined);

    const app = makeApp();
    await app.request('/api/ni/csv/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ csv_text: VALID_CSV }),
    });

    expect(mockCompleteScrapeLogEntry).toHaveBeenCalledWith(
      'log-id-789',
      'failed',
      expect.any(Object),
      expect.any(String),
    );
  });

  it('returns 500 when deleteConnectionsByUser throws', async () => {
    mockCreateScrapeLogEntry.mockResolvedValue('log-id-del');
    mockDeleteConnectionsByUser.mockRejectedValue(new Error('Delete failed'));
    mockInsertConnections.mockResolvedValue(0);
    mockCompleteScrapeLogEntry.mockResolvedValue(undefined);

    const app = makeApp();
    const res = await app.request('/api/ni/csv/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ csv_text: VALID_CSV }),
    });

    expect(res.status).toBe(500);
  });
});

// ─── GET /api/ni/connections ───────────────────────────────────────────────────

describe('GET /api/ni/connections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFF.FF_NETWORK_INTELLIGENCE = true;
  });

  it('returns 200 with enriched connections', async () => {
    mockGetEnrichedConnectionsByUser.mockResolvedValue([
      {
        id: 'conn-1',
        user_id: 'test-user-id',
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'jane@example.com',
        company_raw: 'Acme',
        company_id: null,
        company_display_name: 'Acme Corporation',
        position: 'VP Engineering',
        connected_on: '2023-01-15T00:00:00.000Z',
        import_batch: 'batch-1',
        metadata: {},
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);

    const app = makeApp();
    const res = await app.request('/api/ni/connections', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(Array.isArray(body.connections)).toBe(true);
    const connections = body.connections as unknown[];
    expect(connections).toHaveLength(1);
  });

  it('returns 200 with an empty array when user has no connections', async () => {
    mockGetEnrichedConnectionsByUser.mockResolvedValue([]);

    const app = makeApp();
    const res = await app.request('/api/ni/connections', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.connections).toEqual([]);
  });

  it('passes default limit=100 and offset=0 when query params are absent', async () => {
    mockGetEnrichedConnectionsByUser.mockResolvedValue([]);

    const app = makeApp();
    await app.request('/api/ni/connections', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(mockGetEnrichedConnectionsByUser).toHaveBeenCalledWith('test-user-id', 100, 0);
  });

  it('passes custom limit and offset from query params', async () => {
    mockGetEnrichedConnectionsByUser.mockResolvedValue([]);

    const app = makeApp();
    await app.request('/api/ni/connections?limit=25&offset=50', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(mockGetEnrichedConnectionsByUser).toHaveBeenCalledWith('test-user-id', 25, 50);
  });

  it('clamps limit to 500 even if a larger value is supplied', async () => {
    mockGetEnrichedConnectionsByUser.mockResolvedValue([]);

    const app = makeApp();
    await app.request('/api/ni/connections?limit=9999', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(mockGetEnrichedConnectionsByUser).toHaveBeenCalledWith('test-user-id', 500, 0);
  });

  it('returns 404 when feature flag is disabled', async () => {
    mockFF.FF_NETWORK_INTELLIGENCE = false;

    const app = makeApp();
    const res = await app.request('/api/ni/connections', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(res.status).toBe(404);
  });
});

// ─── GET /api/ni/connections/count ──────────────────────────────────────────────

describe('GET /api/ni/connections/count', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFF.FF_NETWORK_INTELLIGENCE = true;
  });

  it('returns 200 with count', async () => {
    mockGetConnectionCount.mockResolvedValue(42);

    const app = makeApp();
    const res = await app.request('/api/ni/connections/count', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.count).toBe(42);
  });

  it('returns 0 when user has no connections', async () => {
    mockGetConnectionCount.mockResolvedValue(0);

    const app = makeApp();
    const res = await app.request('/api/ni/connections/count', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.count).toBe(0);
  });

  it('returns 404 when feature flag is disabled', async () => {
    mockFF.FF_NETWORK_INTELLIGENCE = false;

    const app = makeApp();
    const res = await app.request('/api/ni/connections/count', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(res.status).toBe(404);
  });
});

// ─── GET /api/ni/connections/companies ──────────────────────────────────────────

describe('GET /api/ni/connections/companies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFF.FF_NETWORK_INTELLIGENCE = true;
  });

  it('returns 200 with company summaries', async () => {
    mockGetCompanySummary.mockResolvedValue([
      {
        companyRaw: 'Google',
        companyDisplayName: 'Google LLC',
        companyId: 'company-1',
        connectionCount: 12,
        topPositions: ['Software Engineer', 'Product Manager'],
      },
    ]);

    const app = makeApp();
    const res = await app.request('/api/ni/connections/companies', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(Array.isArray(body.companies)).toBe(true);
    const companies = body.companies as Array<Record<string, unknown>>;
    expect(companies).toHaveLength(1);
    expect(companies[0].connectionCount).toBe(12);
  });

  it('returns empty array when no connections', async () => {
    mockGetCompanySummary.mockResolvedValue([]);

    const app = makeApp();
    const res = await app.request('/api/ni/connections/companies', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.companies).toEqual([]);
  });

  it('returns 404 when feature flag is disabled', async () => {
    mockFF.FF_NETWORK_INTELLIGENCE = false;

    const app = makeApp();
    const res = await app.request('/api/ni/connections/companies', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(res.status).toBe(404);
  });
});

// ─── Target Titles Routes ─────────────────────────────────────────────────────

describe('GET /api/ni/target-titles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFF.FF_NETWORK_INTELLIGENCE = true;
  });

  it('returns 200 with titles array', async () => {
    mockGetTargetTitlesByUser.mockResolvedValue([
      { id: 'tt-1', user_id: 'test-user-id', title: 'VP Engineering', priority: 1, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ]);

    const app = makeApp();
    const res = await app.request('/api/ni/target-titles', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(Array.isArray(body.titles)).toBe(true);
  });

  it('returns 404 when feature flag is disabled', async () => {
    mockFF.FF_NETWORK_INTELLIGENCE = false;

    const app = makeApp();
    const res = await app.request('/api/ni/target-titles', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(res.status).toBe(404);
  });
});

describe('POST /api/ni/target-titles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFF.FF_NETWORK_INTELLIGENCE = true;
  });

  it('returns 201 with created title', async () => {
    mockInsertTargetTitle.mockResolvedValue({
      id: 'tt-new',
      user_id: 'test-user-id',
      title: 'CTO',
      priority: 1,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    });

    const app = makeApp();
    const res = await app.request('/api/ni/target-titles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ title: 'CTO' }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body.title).toBeDefined();
  });

  it('returns 400 when title is empty', async () => {
    const app = makeApp();
    const res = await app.request('/api/ni/target-titles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ title: '' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when title exceeds 200 chars', async () => {
    const app = makeApp();
    const res = await app.request('/api/ni/target-titles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ title: 'x'.repeat(201) }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 500 when store returns null', async () => {
    mockInsertTargetTitle.mockResolvedValue(null);

    const app = makeApp();
    const res = await app.request('/api/ni/target-titles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ title: 'CTO' }),
    });

    expect(res.status).toBe(500);
  });
});

describe('DELETE /api/ni/target-titles/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFF.FF_NETWORK_INTELLIGENCE = true;
  });

  it('returns 200 when title is deleted', async () => {
    mockDeleteTargetTitle.mockResolvedValue(true);

    const app = makeApp();
    const res = await app.request('/api/ni/target-titles/tt-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(res.status).toBe(200);
    expect(mockDeleteTargetTitle).toHaveBeenCalledWith('test-user-id', 'tt-1');
  });

  it('returns 404 when title not found', async () => {
    mockDeleteTargetTitle.mockResolvedValue(false);

    const app = makeApp();
    const res = await app.request('/api/ni/target-titles/nonexistent', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(res.status).toBe(404);
  });
});

// ─── Job Matches Routes ───────────────────────────────────────────────────────

describe('GET /api/ni/matches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFF.FF_NETWORK_INTELLIGENCE = true;
  });

  it('returns 200 with matches array', async () => {
    mockGetJobMatchesByUser.mockResolvedValue([
      {
        id: 'match-1',
        user_id: 'test-user-id',
        company_id: 'company-1',
        title: 'Senior Engineer',
        url: null,
        location: 'Remote',
        salary_range: null,
        description_snippet: null,
        match_score: 85,
        referral_available: true,
        connection_count: 3,
        status: 'new',
        scraped_at: null,
        metadata: {},
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const app = makeApp();
    const res = await app.request('/api/ni/matches', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(Array.isArray(body.matches)).toBe(true);
    expect((body.matches as unknown[]).length).toBe(1);
  });

  it('passes status filter when provided', async () => {
    mockGetJobMatchesByUser.mockResolvedValue([]);

    const app = makeApp();
    await app.request('/api/ni/matches?status=applied&limit=10&offset=5', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(mockGetJobMatchesByUser).toHaveBeenCalledWith(
      'test-user-id',
      { status: 'applied', limit: 10, offset: 5 },
    );
  });

  it('returns empty array when no matches', async () => {
    mockGetJobMatchesByUser.mockResolvedValue([]);

    const app = makeApp();
    const res = await app.request('/api/ni/matches', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.matches).toEqual([]);
  });

  it('returns 404 when feature flag is disabled', async () => {
    mockFF.FF_NETWORK_INTELLIGENCE = false;

    const app = makeApp();
    const res = await app.request('/api/ni/matches', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(res.status).toBe(404);
  });
});

describe('GET /api/ni/bonus-companies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFF.FF_NETWORK_INTELLIGENCE = true;
  });

  it('returns bonus-search companies using the requested threshold', async () => {
    mockGetBonusSearchCompanies.mockResolvedValue([
      {
        company_id: 'company-1',
        company_name: 'Acme Corp',
        domain: 'acme.com',
        headquarters: 'Chicago, IL',
        industry: 'Manufacturing',
        bonus_display: '$5,000-$15,000',
        bonus_currency: 'USD',
        bonus_amount_min: 5000,
        bonus_amount_max: 15000,
        confidence: 'high',
        program_url: 'https://example.com/acme',
      },
    ]);

    const app = makeApp();
    const res = await app.request('/api/ni/bonus-companies?min_bonus=1000&limit=25', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(res.status).toBe(200);
    expect(mockGetBonusSearchCompanies).toHaveBeenCalledWith({ minBonus: 1000, limit: 25 });
    const body = await res.json() as Record<string, unknown>;
    expect(Array.isArray(body.companies)).toBe(true);
    expect(body.min_bonus).toBe(1000);
  });
});

describe('GET /api/ni/scrape/status/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFF.FF_NETWORK_INTELLIGENCE = true;
  });

  it('returns 404 when the scrape log does not exist for the user', async () => {
    mockSupabaseFrom.mockReturnValueOnce(
      buildSingleChain({ data: null, error: { code: 'PGRST116', message: 'no rows returned' } }),
    );

    const app = makeApp();
    const res = await app.request('/api/ni/scrape/status/log-missing', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(res.status).toBe(404);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('Company job search not found');
  });

  it('returns 500 when scrape log lookup fails', async () => {
    mockSupabaseFrom.mockReturnValueOnce(
      buildSingleChain({ data: null, error: { code: '42501', message: 'permission denied for table scrape_log' } }),
    );

    const app = makeApp();
    const res = await app.request('/api/ni/scrape/status/log-db-error', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(res.status).toBe(500);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('Failed to fetch company job search status');
  });
});

describe('POST /api/ni/matches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFF.FF_NETWORK_INTELLIGENCE = true;
  });

  it('returns 201 with created match', async () => {
    mockInsertJobMatch.mockResolvedValue({
      id: 'match-new',
      user_id: 'test-user-id',
      company_id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Staff Engineer',
      status: 'new',
      referral_available: false,
      connection_count: 0,
    });

    const app = makeApp();
    const res = await app.request('/api/ni/matches', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({
        company_id: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Staff Engineer',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body.match).toBeDefined();
  });

  it('returns 400 when company_id is not a UUID', async () => {
    const app = makeApp();
    const res = await app.request('/api/ni/matches', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ company_id: 'not-a-uuid', title: 'Engineer' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when title is missing', async () => {
    const app = makeApp();
    const res = await app.request('/api/ni/matches', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ company_id: '550e8400-e29b-41d4-a716-446655440000' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 500 when store returns null', async () => {
    mockInsertJobMatch.mockResolvedValue(null);

    const app = makeApp();
    const res = await app.request('/api/ni/matches', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({
        company_id: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Engineer',
      }),
    });

    expect(res.status).toBe(500);
  });
});

describe('PATCH /api/ni/matches/:id/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFF.FF_NETWORK_INTELLIGENCE = true;
  });

  it('returns 200 when status is updated', async () => {
    mockUpdateJobMatchStatus.mockResolvedValue(true);

    const app = makeApp();
    const res = await app.request('/api/ni/matches/match-1/status', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ status: 'applied' }),
    });

    expect(res.status).toBe(200);
    expect(mockUpdateJobMatchStatus).toHaveBeenCalledWith('test-user-id', 'match-1', 'applied');
  });

  it('returns 404 when match not found', async () => {
    mockUpdateJobMatchStatus.mockResolvedValue(false);

    const app = makeApp();
    const res = await app.request('/api/ni/matches/nonexistent/status', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ status: 'applied' }),
    });

    expect(res.status).toBe(404);
  });

  it('returns 400 when status is invalid', async () => {
    const app = makeApp();
    const res = await app.request('/api/ni/matches/match-1/status', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ status: 'invalid_status' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 404 when feature flag is disabled', async () => {
    mockFF.FF_NETWORK_INTELLIGENCE = false;

    const app = makeApp();
    const res = await app.request('/api/ni/matches/match-1/status', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ status: 'applied' }),
    });

    expect(res.status).toBe(404);
  });
});
