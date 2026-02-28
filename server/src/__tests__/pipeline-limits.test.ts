/**
 * Tests for the DB-backed global pipeline limit (Story 7).
 *
 * The POST /api/pipeline/start handler queries `session_locks` and returns
 * 503 when count >= MAX_GLOBAL_PIPELINES (default 10).
 *
 * Strategy: Mock the full dependency tree and exercise the /start handler via
 * a lightweight Hono test harness to verify the capacity check fires correctly.
 *
 * Tests verify:
 *   1. Returns 503 CAPACITY_LIMIT when session_locks count >= MAX_GLOBAL_PIPELINES
 *   2. Allows the pipeline when count is below the limit
 *   3. Fails open (does not 503 for capacity) when session_locks DB query throws
 *   4. Fails open when session_locks query returns a DB error object
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Module mocks — must be hoisted before any module imports ────────────────

const mockFrom = vi.hoisted(() => vi.fn());
const mockRpc = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: mockFrom,
    rpc: mockRpc,
  },
}));

vi.mock('../routes/sessions.js', () => ({
  sseConnections: new Map(),
}));

vi.mock('../agents/coordinator.js', () => ({
  runPipeline: vi.fn().mockResolvedValue({ current_stage: 'complete', revision_count: 0 }),
}));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(
    async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
      c.set('user', { id: 'test-user-id' });
      await next();
    },
  ),
}));

vi.mock('../middleware/rate-limit.js', () => ({
  rateLimitMiddleware: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  }),
}));

// subscriptionGuard is applied to /start — allow all requests through in tests.
vi.mock('../middleware/subscription-guard.js', () => ({
  subscriptionGuard: vi.fn(async (_c: unknown, next: () => Promise<void>) => {
    await next();
  }),
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
  createSessionLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../lib/sentry.js', () => ({
  captureError: vi.fn(),
}));

vi.mock('../lib/llm-provider.js', () => ({
  startUsageTracking: vi.fn().mockReturnValue({ input_tokens: 0, output_tokens: 0 }),
  stopUsageTracking: vi.fn(),
  setUsageTrackingContext: vi.fn(),
  createCombinedAbortSignal: vi.fn().mockReturnValue({
    signal: new AbortController().signal,
    cleanup: vi.fn(),
  }),
}));

vi.mock('../lib/usage-persistence.js', () => ({
  flushUsageToDb: vi.fn().mockResolvedValue(undefined),
  clearUsageWatermark: vi.fn(),
  getFlushWatermarks: vi.fn().mockReturnValue(new Map()),
}));

vi.mock('../lib/workflow-nodes.js', () => ({
  WORKFLOW_NODE_KEYS: [],
  workflowNodeFromStage: vi.fn().mockReturnValue('overview'),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { Hono } from 'hono';
import { pipeline } from '../routes/pipeline.js';

function makeApp() {
  const app = new Hono();
  app.route('/api/pipeline', pipeline);
  return app;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// RFC 4122 compliant UUID
const VALID_SESSION_ID = 'a1b2c3d4-e5f6-1234-89ab-000000000001';

// ─── Mock builder helpers ─────────────────────────────────────────────────────

/**
 * Build a chainable mock for the session_locks capacity check:
 *   .from('session_locks').select(*, { count, head }).gt(col, val) → Promise
 */
function makeSessionLocksChain(opts: {
  count: number | null;
  error?: { message: string } | null;
  throws?: boolean;
}) {
  const result = { count: opts.count, error: opts.error ?? null };
  const gtMock = opts.throws
    ? vi.fn().mockRejectedValue(new Error('DB connection failed'))
    : vi.fn().mockResolvedValue(result);
  const selectMock = vi.fn().mockReturnValue({ gt: gtMock });
  return { select: selectMock, gt: gtMock };
}

/**
 * Build a generic coach_sessions chain that satisfies all the patterns used
 * in the /start handler before and around the capacity check.
 *
 * The trickiest case is hasRunningPipelineCapacity:
 *   let query = supabaseAdmin.from('coach_sessions').select('id')
 *     .eq('pipeline_status', 'running')
 *     .order('updated_at', { ascending: false })
 *     .limit(limit + 1);
 *   if (userId) query = query.eq('user_id', userId);  // chained AFTER limit
 *   const { data, error } = await query;
 *
 * So .limit() must return an object that:
 *   a) Has .eq() (for the optional per-user filter chained after .limit())
 *   b) Is itself awaitable (for the non-user-filtered case)
 *
 * We achieve (b) by attaching `then` to the returned object so it acts as a
 * thenable. We achieve (a) by having .eq() also be a thenable.
 */
function makeCoachSessionsChain(sessionRow?: Record<string, unknown>) {
  const row = sessionRow ?? {
    id: VALID_SESSION_ID,
    user_id: 'test-user-id',
    status: 'active',
    pipeline_status: 'idle',
    updated_at: new Date(Date.now() - 1000).toISOString(),
    master_resume_id: null,
  };

  const emptyDataResult = { data: [], error: null };
  const noErrorResult = { error: null };

  // Helper: make a thenable that also exposes query-builder methods.
  function makeThenable(result: unknown, extraMethods?: Record<string, unknown>) {
    const obj: Record<string, unknown> = {
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
      catch: (reject: (e: unknown) => unknown) => Promise.resolve(result).catch(reject),
      ...extraMethods,
    };
    return obj;
  }

  const singleMock = vi.fn().mockResolvedValue({ data: row, error: null });
  const maybeSingleMock = vi.fn().mockResolvedValue({ data: null, error: null });

  // .limit().eq() must be awaitable and resolve to empty data
  const limitEqMock = vi.fn().mockReturnValue(makeThenable(emptyDataResult));

  // .limit() must be awaitable AND have .eq()
  const limitMock = vi.fn().mockReturnValue(
    makeThenable(emptyDataResult, { eq: limitEqMock }),
  );

  // .order() chains into .limit()
  const orderMock = vi.fn().mockReturnValue({ limit: limitMock });

  // .lt() chains into .order() (used in stale scan)
  const ltMock = vi.fn().mockReturnValue({ order: orderMock });

  // .in() chains (used in stale update)
  const inEqMock = vi.fn().mockReturnValue(makeThenable(noErrorResult));
  const inMock = vi.fn().mockReturnValue({ eq: inEqMock });

  // Deep eq for update chains
  const deepEq3 = vi.fn().mockReturnValue(makeThenable(noErrorResult));
  const deepEq2 = vi.fn().mockReturnValue({
    eq: deepEq3,
    ...makeThenable(noErrorResult),
  });
  const deepEq1 = vi.fn().mockReturnValue({
    eq: deepEq2,
    single: singleMock,
    maybeSingle: maybeSingleMock,
    order: orderMock,
    limit: limitMock,
    lt: ltMock,
    in: inMock,
    ...makeThenable(noErrorResult),
  });

  // eq() — top-level
  const eqMock = vi.fn().mockReturnValue({
    single: singleMock,
    maybeSingle: maybeSingleMock,
    eq: deepEq1,
    order: orderMock,
    limit: limitMock,
    lt: ltMock,
    in: inMock,
    ...makeThenable(emptyDataResult),
  });

  return {
    select: vi.fn().mockReturnValue({ eq: eqMock, order: orderMock, limit: limitMock }),
    update: vi.fn().mockReturnValue({ eq: eqMock, in: inMock }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    eq: eqMock,
  };
}

/**
 * Wire all mockFrom calls for the full /start handler path.
 */
function setupMocks(sessionLocksOpts: Parameters<typeof makeSessionLocksChain>[0]) {
  const sessionLocks = makeSessionLocksChain(sessionLocksOpts);

  mockFrom.mockImplementation((table: string) => {
    switch (table) {
      case 'session_locks':
        return sessionLocks;
      default:
        // coach_sessions, master_resumes, session_workflow_nodes, user_subscriptions, etc.
        return makeCoachSessionsChain();
    }
  });

  // claim_pipeline_slot — return a truthy value so the pipeline starts.
  mockRpc.mockResolvedValue({ data: { id: VALID_SESSION_ID }, error: null });
}

// ─── Request factory ──────────────────────────────────────────────────────────

function buildStartRequest() {
  return new Request('http://localhost/api/pipeline/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: VALID_SESSION_ID,
      raw_resume_text: 'A'.repeat(60),
      job_description: 'B'.repeat(60),
      company_name: 'Acme Corp',
    }),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DB-backed global pipeline limits (Story 7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MAX_GLOBAL_PIPELINES;
  });

  it('returns 503 CAPACITY_LIMIT when session_locks count >= MAX_GLOBAL_PIPELINES (default 10)', async () => {
    // DEFAULT: MAX_GLOBAL_PIPELINES = 10; count = 10 triggers the limit.
    setupMocks({ count: 10 });

    const app = makeApp();
    const res = await app.fetch(buildStartRequest());
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(503);
    expect(body.code).toBe('CAPACITY_LIMIT');
    expect(typeof body.error).toBe('string');
  });

  it('does not return CAPACITY_LIMIT when session_locks count is below the limit', async () => {
    // count = 5 < 10 (default) — capacity check must pass.
    setupMocks({ count: 5 });

    const app = makeApp();
    const res = await app.fetch(buildStartRequest());

    // A 503 with CAPACITY_LIMIT must not appear.
    if (res.status === 503) {
      const body = await res.json() as Record<string, unknown>;
      expect(body.code).not.toBe('CAPACITY_LIMIT');
    } else {
      // Any other status is fine for this test (e.g. 200/started or other DB errors)
      expect(res.status).not.toBe(503);
    }
  });

  it('fails open when session_locks DB query throws — does not return CAPACITY_LIMIT', async () => {
    setupMocks({ count: 0, throws: true });

    const app = makeApp();
    const res = await app.fetch(buildStartRequest());

    // The capacity check must not re-throw or return CAPACITY_LIMIT.
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      // Non-JSON response is acceptable here — the key is that CAPACITY_LIMIT was not returned.
    }
    expect(body.code).not.toBe('CAPACITY_LIMIT');
  });

  it('fails open when session_locks query returns a DB error object', async () => {
    setupMocks({
      count: null,
      error: { message: 'relation "session_locks" does not exist' },
    });

    const app = makeApp();
    const res = await app.fetch(buildStartRequest());

    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      // Non-JSON response is fine.
    }
    expect(body.code).not.toBe('CAPACITY_LIMIT');
  });
});
