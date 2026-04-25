/**
 * Phase 5 — application-timeline bulk endpoint tests.
 *
 * Verifies the GET /timeline/all handler:
 *   - Filters terminal stages (offer / closed_won / closed_lost) out of the
 *     payload regardless of the underlying SELECT order.
 *   - Returns a payload shape compatible with the per-pursuit endpoint.
 *   - Honors the 50-row cap server-side via a `.limit(50)` clause on the
 *     applications query.
 *   - Auth-checks via the parent middleware (mocked here to a fixed user).
 *
 * Implementation note — supabase-js chains are stubbed with a per-table
 * dispatcher that returns either a thenable (for `await` chains) or a chain
 * object. The actual route runs ~9 round-trips; we only care that the
 * response shape and filtering are correct.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: { from: mockFrom, auth: { getUser: vi.fn() } },
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set('user', { id: 'user-bulk', email: 'b@example.com' });
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

interface ChainResult<T = unknown> {
  data: T;
  error: { message: string } | null;
  count?: number;
}

/**
 * Builds a chainable mock that resolves to the given result when awaited.
 * Each method on the chain returns the chain itself, except `single` /
 * `maybeSingle` which terminate. The chain is also a thenable so `await`
 * resolves it directly (used for `.in().order()` patterns).
 */
function buildChain<T>(result: ChainResult<T>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  const passthrough = ['select', 'eq', 'in', 'gte', 'order', 'is', 'not', 'limit'];
  for (const m of passthrough) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.single = vi.fn().mockResolvedValue(result);
  chain.then = (resolve: (v: ChainResult<T>) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

describe('GET /api/job-applications/timeline/all', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
  });

  it('filters terminal stages out of the response', async () => {
    // Apps query returns 3 rows — one each in researching / applied / offer.
    const apps = [
      { id: '11111111-1111-4111-8111-111111111111', stage: 'researching', title: 'Director', company: 'Acme', stage_history: null, created_at: '2026-04-20T00:00:00Z', applied_date: null },
      { id: '22222222-2222-4222-8222-222222222222', stage: 'applied', title: 'VP', company: 'Beta', stage_history: null, created_at: '2026-04-21T00:00:00Z', applied_date: '2026-04-21' },
      { id: '33333333-3333-4333-8333-333333333333', stage: 'offer', title: 'Head', company: 'Gamma', stage_history: null, created_at: '2026-04-22T00:00:00Z', applied_date: null },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === 'job_applications') return buildChain({ data: apps, error: null });
      // All other tables return empty rows for this scenario.
      return buildChain({ data: [], error: null });
    });

    const res = await app.request('/job-applications/timeline/all');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.pursuits)).toBe(true);
    // Two non-terminal entries; offer dropped.
    expect(body.pursuits).toHaveLength(2);
    const stages = body.pursuits.map((p: { application: { stage: string } }) => p.application.stage);
    expect(stages).toContain('researching');
    expect(stages).toContain('applied');
    expect(stages).not.toContain('offer');
  });

  it('returns empty pursuits when the user has no applications', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'job_applications') return buildChain({ data: [], error: null });
      return buildChain({ data: [], error: null });
    });

    const res = await app.request('/job-applications/timeline/all');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pursuits).toEqual([]);
  });

  it('caps the underlying applications query at 50 rows', async () => {
    const limitSpy = vi.fn();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'job_applications') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chain: any = {};
        const passthrough = ['select', 'eq', 'in', 'gte', 'order', 'is', 'not'];
        for (const m of passthrough) chain[m] = vi.fn().mockReturnValue(chain);
        chain.limit = limitSpy.mockReturnValue(chain);
        chain.then = (resolve: (v: ChainResult<unknown>) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve);
        return chain;
      }
      return buildChain({ data: [], error: null });
    });

    await app.request('/job-applications/timeline/all');
    expect(limitSpy).toHaveBeenCalledWith(50);
  });

  it('returns 500 on apps-query database error', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'job_applications') return buildChain({ data: null, error: { message: 'kaboom' } });
      return buildChain({ data: [], error: null });
    });

    const res = await app.request('/job-applications/timeline/all');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('shapes each pursuit with the canonical timeline payload keys', async () => {
    const apps = [
      { id: '11111111-1111-4111-8111-111111111111', stage: 'researching', title: 'Director', company: 'Acme', stage_history: null, created_at: '2026-04-20T00:00:00Z', applied_date: null },
    ];
    mockFrom.mockImplementation((table: string) => {
      if (table === 'job_applications') return buildChain({ data: apps, error: null });
      return buildChain({ data: [], error: null });
    });

    const res = await app.request('/job-applications/timeline/all');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pursuits).toHaveLength(1);
    const pursuit = body.pursuits[0];
    expect(pursuit).toHaveProperty('application');
    expect(pursuit).toHaveProperty('resume');
    expect(pursuit).toHaveProperty('cover_letter');
    expect(pursuit).toHaveProperty('interview_prep');
    expect(pursuit).toHaveProperty('thank_you');
    expect(pursuit).toHaveProperty('follow_up');
    expect(pursuit).toHaveProperty('networking_messages');
    expect(pursuit).toHaveProperty('events');
    expect(pursuit).toHaveProperty('referral_bonus');
  });
});
