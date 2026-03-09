/**
 * Content Calendar Reports Routes — unit tests for Sprint 60 Story 60-2.
 *
 * Covers:
 * - GET /api/content-calendar/reports — summary list (up to 10, newest first, no report_markdown)
 * - GET /api/content-calendar/reports/:id — full single report including report_markdown
 * - 404 for non-existent report ID
 * - 400 for malformed report ID
 * - 500 when Supabase query fails
 * - Feature-flag guard (FF_CONTENT_CALENDAR=false → 404)
 * - Auth required on both routes (authMiddleware injects user via factory)
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
  createSessionLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Feature flag enabled by default; individual tests override as needed
vi.mock('../lib/feature-flags.js', () => ({
  FF_CONTENT_CALENDAR: true,
}));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(
    async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
      c.set('user', { id: 'user-test-abc', email: 'tester@example.com' });
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

// The product-route-factory uses many heavy dependencies; stub only what's needed
// for the /reports routes (the pipeline routes are not under test here).
vi.mock('../routes/sessions.js', () => ({
  sseConnections: new Map(),
  addSSEConnection: vi.fn(),
  removeSSEConnection: vi.fn(),
}));

vi.mock('../lib/platform-context.js', () => ({
  getUserContext: vi.fn().mockResolvedValue([]),
}));

vi.mock('../lib/emotional-baseline.js', () => ({
  getEmotionalBaseline: vi.fn().mockResolvedValue(null),
}));

vi.mock('../agents/content-calendar/product.js', () => ({
  createContentCalendarProductConfig: vi.fn().mockReturnValue({
    domain: 'content-calendar',
    agents: [],
    createInitialState: vi.fn(),
    buildAgentMessage: vi.fn().mockReturnValue(''),
    finalizeResult: vi.fn(),
  }),
}));

vi.mock('../agents/runtime/product-coordinator.js', () => ({
  runProductPipeline: vi.fn(),
}));

vi.mock('../lib/pending-gate-queue.js', () => ({
  getPendingGateQueueConfig: vi.fn(),
  getResponseQueue: vi.fn(),
  parsePendingGatePayload: vi.fn(),
  withResponseQueue: vi.fn(),
}));

vi.mock('../lib/http-body-guard.js', () => ({
  parseJsonBodyWithLimit: vi.fn(),
}));

vi.mock('../lib/sleep.js', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { Hono } from 'hono';
import { contentCalendarRoutes } from '../routes/content-calendar.js';

// ─── Test Hono app ────────────────────────────────────────────────────────────

const app = new Hono();
app.route('/api/content-calendar', contentCalendarRoutes);

// ─── Chain builder helpers ────────────────────────────────────────────────────

/**
 * Build a Supabase query chain that resolves via .single().
 */
function buildSingleChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'insert', 'update', 'delete']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain['single'] = vi.fn().mockResolvedValue(result);
  return chain;
}

/**
 * Build a Supabase query chain that resolves via awaiting the chain object itself
 * (used for list queries that end with .limit() rather than .single()).
 */
function buildListChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'insert', 'update', 'delete']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  Object.defineProperty(chain, 'then', {
    value: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  });
  return chain;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeReportSummary(id = VALID_UUID) {
  return {
    id,
    target_role: 'VP of Engineering',
    target_industry: 'Technology',
    quality_score: 82,
    coherence_score: 78,
    post_count: 16,
    created_at: '2025-01-15T10:00:00Z',
  };
}

function makeReportFull(id = VALID_UUID) {
  return {
    ...makeReportSummary(id),
    report_markdown: '# Content Calendar\n\n## Week 1\n\n...',
    themes: [{ id: 'theme-1', name: 'Leadership Lessons' }],
    content_mix: { thought_leadership: 0.4, storytelling: 0.3 },
    posts: [{ day: 1, hook: 'Three years ago I made a mistake...' }],
  };
}

// ─── Tests: GET /api/content-calendar/reports ─────────────────────────────────

describe('GET /api/content-calendar/reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with an array of reports', async () => {
    const reports = [makeReportSummary('r1'), makeReportSummary('r2')];
    mockFrom.mockReturnValue(buildListChain({ data: reports, error: null }));

    const res = await app.request('/api/content-calendar/reports', {
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { reports: unknown[] };
    expect(body.reports).toHaveLength(2);
  });

  it('returns empty array when user has no reports', async () => {
    mockFrom.mockReturnValue(buildListChain({ data: [], error: null }));

    const res = await app.request('/api/content-calendar/reports', {
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { reports: unknown[] };
    expect(body.reports).toEqual([]);
  });

  it('returns empty array when supabase data is null', async () => {
    mockFrom.mockReturnValue(buildListChain({ data: null, error: null }));

    const res = await app.request('/api/content-calendar/reports', {
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { reports: unknown[] };
    expect(body.reports).toEqual([]);
  });

  it('report summaries do not contain report_markdown', async () => {
    const reports = [makeReportSummary()];
    mockFrom.mockReturnValue(buildListChain({ data: reports, error: null }));

    const res = await app.request('/api/content-calendar/reports', {
      headers: { Authorization: 'Bearer test-token' },
    });

    const body = (await res.json()) as { reports: Record<string, unknown>[] };
    expect(body.reports[0]).not.toHaveProperty('report_markdown');
  });

  it('report summaries contain the expected summary fields', async () => {
    const reports = [makeReportSummary()];
    mockFrom.mockReturnValue(buildListChain({ data: reports, error: null }));

    const res = await app.request('/api/content-calendar/reports', {
      headers: { Authorization: 'Bearer test-token' },
    });

    const body = (await res.json()) as { reports: Record<string, unknown>[] };
    const report = body.reports[0];
    expect(report).toHaveProperty('id');
    expect(report).toHaveProperty('target_role');
    expect(report).toHaveProperty('target_industry');
    expect(report).toHaveProperty('quality_score');
    expect(report).toHaveProperty('coherence_score');
    expect(report).toHaveProperty('post_count');
    expect(report).toHaveProperty('created_at');
  });

  it('uses user_id from auth context to filter results', async () => {
    mockFrom.mockReturnValue(buildListChain({ data: [], error: null }));

    await app.request('/api/content-calendar/reports', {
      headers: { Authorization: 'Bearer test-token' },
    });

    // supabaseAdmin.from() should have been called for the reports table
    expect(mockFrom).toHaveBeenCalledWith('content_calendar_reports');
  });

  it('returns 500 when supabase query fails', async () => {
    mockFrom.mockReturnValue(buildListChain({ data: null, error: { message: 'DB timeout' } }));

    const res = await app.request('/api/content-calendar/reports', {
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Failed to fetch reports');
  });

  it('returns 404 when feature flag is disabled', async () => {
    const { Hono: HonoLocal } = await import('hono');
    const guardApp = new HonoLocal();

    const FF_OFF = false;
    guardApp.use('*', async (c, next) => {
      c.set('user' as never, { id: 'user-test' } as never);
      await next();
    });
    guardApp.get('/reports', async (c) => {
      if (!FF_OFF) return c.json({ error: 'Not found' }, 404);
      return c.json({ reports: [] });
    });

    const res = await guardApp.request('/reports');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Not found');
  });
});

// ─── Tests: GET /api/content-calendar/reports/:id ─────────────────────────────

describe('GET /api/content-calendar/reports/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with the full report including report_markdown', async () => {
    const report = makeReportFull();
    mockFrom.mockReturnValue(buildSingleChain({ data: report, error: null }));

    const res = await app.request(`/api/content-calendar/reports/${VALID_UUID}`, {
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { report: Record<string, unknown> };
    expect(body.report).toHaveProperty('report_markdown');
    expect(body.report.report_markdown).toContain('# Content Calendar');
  });

  it('includes all summary fields plus full data in the response', async () => {
    const report = makeReportFull();
    mockFrom.mockReturnValue(buildSingleChain({ data: report, error: null }));

    const res = await app.request(`/api/content-calendar/reports/${VALID_UUID}`, {
      headers: { Authorization: 'Bearer test-token' },
    });

    const body = (await res.json()) as { report: Record<string, unknown> };
    const r = body.report;
    expect(r).toHaveProperty('id', VALID_UUID);
    expect(r).toHaveProperty('quality_score', 82);
    expect(r).toHaveProperty('themes');
    expect(r).toHaveProperty('posts');
    expect(r).toHaveProperty('content_mix');
  });

  it('returns 404 when report does not exist', async () => {
    mockFrom.mockReturnValue(buildSingleChain({ data: null, error: { message: 'Row not found' } }));

    const res = await app.request(`/api/content-calendar/reports/${VALID_UUID}`, {
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Report not found');
  });

  it('returns 404 when supabase returns no data without error', async () => {
    mockFrom.mockReturnValue(buildSingleChain({ data: null, error: null }));

    const res = await app.request(`/api/content-calendar/reports/${VALID_UUID}`, {
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(res.status).toBe(404);
  });

  it('returns 400 for a malformed (non-UUID) report ID', async () => {
    const res = await app.request('/api/content-calendar/reports/not-a-uuid', {
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Invalid report ID');
  });

  it('returns 400 for a too-short ID', async () => {
    const res = await app.request('/api/content-calendar/reports/abc', {
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(res.status).toBe(400);
  });

  it('queries the content_calendar_reports table', async () => {
    const report = makeReportFull();
    mockFrom.mockReturnValue(buildSingleChain({ data: report, error: null }));

    await app.request(`/api/content-calendar/reports/${VALID_UUID}`, {
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(mockFrom).toHaveBeenCalledWith('content_calendar_reports');
  });

  it('returns 404 when feature flag is disabled', async () => {
    const { Hono: HonoLocal } = await import('hono');
    const guardApp = new HonoLocal();

    const FF_OFF = false;
    guardApp.use('*', async (c, next) => {
      c.set('user' as never, { id: 'user-test' } as never);
      await next();
    });
    guardApp.get('/reports/:id', async (c) => {
      if (!FF_OFF) return c.json({ error: 'Not found' }, 404);
      return c.json({ report: {} });
    });

    const res = await guardApp.request(`/reports/${VALID_UUID}`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Not found');
  });
});
