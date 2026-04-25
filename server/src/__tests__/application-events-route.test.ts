/**
 * Phase 1 (pursuit timeline) — application_events route tests.
 *
 * Covers:
 *  - POST happy path for each event type
 *  - Zod discriminated union: invalid metadata shape rejected
 *  - Top-level type vs metadata.type mismatch rejected
 *  - Idempotency split: 5min for applied, 60s for the others
 *  - Forward-date guard on interview_happened
 *  - Past-date allowed (back-fill) for interview_happened
 *  - Ownership: 404 when application doesn't belong to user
 *  - GET returns the user's events sorted desc
 *  - RLS happens server-side: GET filters by user_id
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: { from: mockFrom, auth: { getUser: vi.fn() } },
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

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set('user', { id: 'user-abc', email: 'u@example.com' });
    await next();
  }),
}));

vi.mock('../middleware/rate-limit.js', () => ({
  rateLimitMiddleware: () => async (_c: unknown, next: () => Promise<void>) => { await next(); },
}));

import { Hono } from 'hono';
import { jobApplicationsRoutes } from '../routes/job-applications.js';

const app = new Hono();
app.route('/job-applications', jobApplicationsRoutes);

const APP_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_APP_ID = '22222222-2222-4222-8222-222222222222';

// ─── Chain helpers ────────────────────────────────────────────────────

interface OwnershipChain {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
}

function buildOwnershipChain(found: boolean): OwnershipChain {
  const chain: Partial<OwnershipChain> = {};
  chain.select = vi.fn().mockImplementation(() => chain);
  chain.eq = vi.fn().mockImplementation(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(
    found ? { data: { id: APP_ID }, error: null } : { data: null, error: null },
  );
  return chain as OwnershipChain;
}

interface IdempotencyChain {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
}

function buildIdempotencyChain(existingRow: Record<string, unknown> | null): IdempotencyChain {
  const chain: Partial<IdempotencyChain> = {};
  chain.select = vi.fn().mockImplementation(() => chain);
  chain.eq = vi.fn().mockImplementation(() => chain);
  chain.gte = vi.fn().mockImplementation(() => chain);
  chain.order = vi.fn().mockImplementation(() => chain);
  chain.limit = vi.fn().mockImplementation(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: existingRow, error: null });
  return chain as IdempotencyChain;
}

interface InsertChain {
  insert: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  _payload?: Record<string, unknown>;
}

function buildInsertChain(returned: Record<string, unknown>): InsertChain {
  const chain: Partial<InsertChain> = {};
  chain.insert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
    (chain as InsertChain)._payload = payload;
    return chain;
  });
  chain.select = vi.fn().mockImplementation(() => chain);
  chain.single = vi.fn().mockResolvedValue({ data: returned, error: null });
  return chain as InsertChain;
}

interface ListChain {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  // promise resolves to data
  then: (cb: (val: { data: unknown; error: unknown }) => unknown) => Promise<unknown>;
}

function buildListChain(rows: unknown[]): ListChain {
  const result = { data: rows, error: null };
  const chain: Partial<ListChain> & { _calls?: string[] } = { _calls: [] };
  chain.select = vi.fn().mockImplementation(() => chain);
  chain.eq = vi.fn().mockImplementation(() => chain);
  chain.order = vi.fn().mockImplementation(() => Promise.resolve(result));
  return chain as ListChain;
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('POST /api/job-applications/:id/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
  });

  it('rejects invalid application id (non-uuid)', async () => {
    const res = await app.request(`/job-applications/not-a-uuid/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'applied', metadata: { type: 'applied', applied_via: 'manual' } }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects when metadata is missing', async () => {
    const res = await app.request(`/job-applications/${APP_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'applied' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects when applied_via is missing on applied metadata', async () => {
    const res = await app.request(`/job-applications/${APP_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'applied',
        metadata: { type: 'applied' },
      }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects when top-level type does not match metadata.type', async () => {
    const res = await app.request(`/job-applications/${APP_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'applied',
        metadata: { type: 'interview_happened', interview_date: '2026-04-22', interview_type: 'video' },
      }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects when application does not belong to the user (404)', async () => {
    mockFrom
      .mockReturnValueOnce(buildOwnershipChain(false));
    const res = await app.request(`/job-applications/${OTHER_APP_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'applied',
        metadata: { type: 'applied', applied_via: 'manual' },
      }),
    });
    expect(res.status).toBe(404);
  });

  it('rejects forward-dated interview_happened occurred_at', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res = await app.request(`/job-applications/${APP_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'interview_happened',
        occurred_at: future,
        metadata: { type: 'interview_happened', interview_date: '2026-04-22', interview_type: 'video' },
      }),
    });
    expect(res.status).toBe(400);
  });

  it('accepts back-dated interview_happened occurred_at (past)', async () => {
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const inserted = {
      id: 'evt-1', user_id: 'user-abc', job_application_id: APP_ID,
      type: 'interview_happened', occurred_at: past,
      metadata: { type: 'interview_happened', interview_date: '2026-04-22', interview_type: 'video' },
      created_at: new Date().toISOString(),
    };
    mockFrom
      .mockReturnValueOnce(buildOwnershipChain(true))
      .mockReturnValueOnce(buildIdempotencyChain(null))
      .mockReturnValueOnce(buildInsertChain(inserted));

    const res = await app.request(`/job-applications/${APP_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'interview_happened',
        occurred_at: past,
        metadata: { type: 'interview_happened', interview_date: '2026-04-22', interview_type: 'video' },
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.event.type).toBe('interview_happened');
    expect(body.deduplicated).toBe(false);
  });

  it('inserts a fresh applied event when no recent duplicate exists', async () => {
    const inserted = {
      id: 'evt-2', user_id: 'user-abc', job_application_id: APP_ID,
      type: 'applied', occurred_at: new Date().toISOString(),
      metadata: { type: 'applied', applied_via: 'manual' },
      created_at: new Date().toISOString(),
    };
    const insertChain = buildInsertChain(inserted);
    mockFrom
      .mockReturnValueOnce(buildOwnershipChain(true))
      .mockReturnValueOnce(buildIdempotencyChain(null))
      .mockReturnValueOnce(insertChain);

    const res = await app.request(`/job-applications/${APP_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'applied',
        metadata: { type: 'applied', applied_via: 'manual', resume_session_id: '33333333-3333-4333-8333-333333333333' },
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.event.type).toBe('applied');
    expect(body.deduplicated).toBe(false);
    expect(insertChain._payload).toMatchObject({
      user_id: 'user-abc',
      job_application_id: APP_ID,
      type: 'applied',
      metadata: expect.objectContaining({ applied_via: 'manual' }),
    });
  });

  it('returns the existing event on idempotent applied within 5 min window', async () => {
    const existing = {
      id: 'evt-existing', user_id: 'user-abc', job_application_id: APP_ID,
      type: 'applied', occurred_at: new Date().toISOString(),
      metadata: { type: 'applied', applied_via: 'manual' },
      created_at: new Date().toISOString(),
    };
    mockFrom
      .mockReturnValueOnce(buildOwnershipChain(true))
      .mockReturnValueOnce(buildIdempotencyChain(existing));

    const res = await app.request(`/job-applications/${APP_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'applied',
        metadata: { type: 'applied', applied_via: 'extension' },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deduplicated).toBe(true);
    expect(body.event.id).toBe('evt-existing');
  });

  it('uses a 5min window for applied (vs 60s for interview_happened)', async () => {
    // Verify the gte() filter window passed to the idempotency check.
    const idempChain = buildIdempotencyChain(null);
    const insertChain = buildInsertChain({
      id: 'evt-x', user_id: 'user-abc', job_application_id: APP_ID,
      type: 'applied', occurred_at: new Date().toISOString(),
      metadata: { type: 'applied', applied_via: 'manual' },
      created_at: new Date().toISOString(),
    });
    mockFrom
      .mockReturnValueOnce(buildOwnershipChain(true))
      .mockReturnValueOnce(idempChain)
      .mockReturnValueOnce(insertChain);

    const before = Date.now();
    await app.request(`/job-applications/${APP_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'applied',
        metadata: { type: 'applied', applied_via: 'manual' },
      }),
    });
    const after = Date.now();

    // The gte() arg should be roughly (now - 5 minutes).
    const gteCalls = idempChain.gte.mock.calls;
    expect(gteCalls.length).toBeGreaterThan(0);
    const lastGteArg = gteCalls[gteCalls.length - 1][1] as string;
    const sinceMs = Date.parse(lastGteArg);
    expect(sinceMs).toBeGreaterThanOrEqual(before - 5 * 60 * 1000 - 100);
    expect(sinceMs).toBeLessThanOrEqual(after - 5 * 60 * 1000 + 100);
  });

  it('uses a 60s window for interview_happened', async () => {
    const idempChain = buildIdempotencyChain(null);
    const insertChain = buildInsertChain({
      id: 'evt-y', user_id: 'user-abc', job_application_id: APP_ID,
      type: 'interview_happened', occurred_at: new Date().toISOString(),
      metadata: { type: 'interview_happened', interview_date: '2026-04-22', interview_type: 'video' },
      created_at: new Date().toISOString(),
    });
    mockFrom
      .mockReturnValueOnce(buildOwnershipChain(true))
      .mockReturnValueOnce(idempChain)
      .mockReturnValueOnce(insertChain);

    const before = Date.now();
    await app.request(`/job-applications/${APP_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'interview_happened',
        metadata: { type: 'interview_happened', interview_date: '2026-04-22', interview_type: 'video' },
      }),
    });
    const after = Date.now();

    const gteCalls = idempChain.gte.mock.calls;
    const lastGteArg = gteCalls[gteCalls.length - 1][1] as string;
    const sinceMs = Date.parse(lastGteArg);
    expect(sinceMs).toBeGreaterThanOrEqual(before - 60_000 - 100);
    expect(sinceMs).toBeLessThanOrEqual(after - 60_000 + 100);
  });

  it('accepts offer_received with optional metadata', async () => {
    const inserted = {
      id: 'evt-3', user_id: 'user-abc', job_application_id: APP_ID,
      type: 'offer_received', occurred_at: new Date().toISOString(),
      metadata: { type: 'offer_received', amount: 200000, currency: 'USD' },
      created_at: new Date().toISOString(),
    };
    mockFrom
      .mockReturnValueOnce(buildOwnershipChain(true))
      .mockReturnValueOnce(buildIdempotencyChain(null))
      .mockReturnValueOnce(buildInsertChain(inserted));

    const res = await app.request(`/job-applications/${APP_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'offer_received',
        metadata: { type: 'offer_received', amount: 200000, currency: 'USD' },
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.event.type).toBe('offer_received');
  });
});

describe('POST interview_scheduled — Phase 3', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
  });

  it('accepts a future-dated interview_scheduled event', async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const inserted = {
      id: 'evt-sched-1', user_id: 'user-abc', job_application_id: APP_ID,
      type: 'interview_scheduled', occurred_at: new Date().toISOString(),
      metadata: { type: 'interview_scheduled', scheduled_date: future, interview_type: 'video' },
      created_at: new Date().toISOString(),
    };
    mockFrom
      .mockReturnValueOnce(buildOwnershipChain(true))
      .mockReturnValueOnce(buildIdempotencyChain(null))
      .mockReturnValueOnce(buildInsertChain(inserted));

    const res = await app.request(`/job-applications/${APP_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'interview_scheduled',
        metadata: {
          type: 'interview_scheduled',
          scheduled_date: future,
          interview_type: 'video',
          round: 'First round',
        },
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.event.type).toBe('interview_scheduled');
    expect(body.deduplicated).toBe(false);
  });

  it('idempotency dedups on (app, type, scheduled_date)', async () => {
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const existing = {
      id: 'evt-sched-existing', user_id: 'user-abc', job_application_id: APP_ID,
      type: 'interview_scheduled', occurred_at: new Date().toISOString(),
      metadata: { type: 'interview_scheduled', scheduled_date: future, interview_type: 'phone' },
      created_at: new Date().toISOString(),
    };
    const idemChain = buildIdempotencyChain(existing);
    mockFrom
      .mockReturnValueOnce(buildOwnershipChain(true))
      .mockReturnValueOnce(idemChain);

    const res = await app.request(`/job-applications/${APP_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'interview_scheduled',
        metadata: {
          type: 'interview_scheduled',
          scheduled_date: future,
          interview_type: 'phone',
        },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deduplicated).toBe(true);
    // The dedup chain must have been keyed on metadata->>scheduled_date so
    // multi-round interviews remain distinct.
    const eqArgs = idemChain.eq.mock.calls.map((c) => c[0]);
    expect(eqArgs).toContain('metadata->>scheduled_date');
  });

  it('rejects when interview_type is missing on metadata', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res = await app.request(`/job-applications/${APP_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'interview_scheduled',
        metadata: { type: 'interview_scheduled', scheduled_date: future },
      }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects when scheduled_date is not an ISO datetime', async () => {
    const res = await app.request(`/job-applications/${APP_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'interview_scheduled',
        metadata: {
          type: 'interview_scheduled',
          scheduled_date: 'not-a-date',
          interview_type: 'video',
        },
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/job-applications/:id/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
  });

  it('rejects non-uuid id', async () => {
    const res = await app.request(`/job-applications/not-a-uuid/events`);
    expect(res.status).toBe(400);
  });

  it('returns events filtered by user_id (RLS-equivalent)', async () => {
    const rows = [
      { id: 'evt-1', user_id: 'user-abc', job_application_id: APP_ID, type: 'applied', occurred_at: '2026-04-22T00:00:00Z', metadata: { type: 'applied', applied_via: 'manual' }, created_at: '2026-04-22T00:00:00Z' },
    ];
    const listChain = buildListChain(rows);
    mockFrom.mockReturnValueOnce(listChain);

    const res = await app.request(`/job-applications/${APP_ID}/events`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toHaveLength(1);
    expect(body.count).toBe(1);

    // The .eq() chain must filter by user_id AND job_application_id — proves
    // the RLS-equivalent server-side guard is in place.
    const eqCalls = listChain.eq.mock.calls.map((c) => c[0]);
    expect(eqCalls).toContain('user_id');
    expect(eqCalls).toContain('job_application_id');
  });

  it('returns empty list with count 0 when no events exist', async () => {
    mockFrom.mockReturnValueOnce(buildListChain([]));
    const res = await app.request(`/job-applications/${APP_ID}/events`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toEqual([]);
    expect(body.count).toBe(0);
  });
});
