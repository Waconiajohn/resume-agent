/**
 * Phase 2.3c — Scoped tests for the offer_enabled field on the
 * PATCH /job-applications/:id endpoint. Mirror of Phase 2.3b's
 * job-applications-interview-prep.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks (hoisted) ─────────────────────────────────────────────────────────

const mockMaybeSingle = vi.hoisted(() => vi.fn());
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

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(
    async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
      c.set('user', { id: 'user-abc', email: 'user@example.com' });
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

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import { Hono } from 'hono';
import { jobApplicationsRoutes } from '../routes/job-applications.js';

const app = new Hono();
app.route('/job-applications', jobApplicationsRoutes);

// ─── Supabase chain helper ───────────────────────────────────────────────────

interface StubChain {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  _updatePayload?: Record<string, unknown>;
}

function buildUpdateChain(terminalResult: { data: unknown; error: null | { message: string } }) {
  const chain: Partial<StubChain> = {};
  chain.select = vi.fn().mockImplementation(() => chain);
  chain.eq = vi.fn().mockImplementation(() => chain);
  chain.update = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
    (chain as StubChain)._updatePayload = payload;
    return chain;
  });
  chain.maybeSingle = vi.fn().mockResolvedValue(terminalResult);
  return chain as StubChain;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PATCH /job-applications/:id — offer_enabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMaybeSingle.mockReset();
  });

  it('accepts offer_enabled: true and persists it', async () => {
    const updated = {
      id: 'app-1',
      user_id: 'user-abc',
      title: 'VP Engineering',
      company: 'Acme',
      stage: 'interviewing',
      offer_enabled: true,
      stage_history: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const chain = buildUpdateChain({ data: updated, error: null });
    mockFrom.mockReturnValue(chain);

    const res = await app.request('/job-applications/app-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offer_enabled: true }),
    });

    expect(res.status).toBe(200);
    expect(chain._updatePayload).toMatchObject({ offer_enabled: true });
    const body = await res.json();
    expect(body.offer_enabled).toBe(true);
  });

  it('accepts offer_enabled: false and persists it', async () => {
    const updated = {
      id: 'app-1',
      user_id: 'user-abc',
      title: 'VP Engineering',
      company: 'Acme',
      stage: 'offer',
      offer_enabled: false,
      stage_history: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const chain = buildUpdateChain({ data: updated, error: null });
    mockFrom.mockReturnValue(chain);

    const res = await app.request('/job-applications/app-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offer_enabled: false }),
    });

    expect(res.status).toBe(200);
    expect(chain._updatePayload).toMatchObject({ offer_enabled: false });
    const body = await res.json();
    expect(body.offer_enabled).toBe(false);
  });

  it('accepts offer_enabled: null to reset to the stage-derived default', async () => {
    const updated = {
      id: 'app-1',
      user_id: 'user-abc',
      title: 'VP Engineering',
      company: 'Acme',
      stage: 'offer',
      offer_enabled: null,
      stage_history: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const chain = buildUpdateChain({ data: updated, error: null });
    mockFrom.mockReturnValue(chain);

    const res = await app.request('/job-applications/app-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offer_enabled: null }),
    });

    expect(res.status).toBe(200);
    expect(chain._updatePayload).toMatchObject({ offer_enabled: null });
    const body = await res.json();
    expect(body.offer_enabled).toBeNull();
  });

  it('rejects a malformed offer_enabled value (non-boolean string)', async () => {
    const res = await app.request('/job-applications/app-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offer_enabled: 'yes' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid input');
  });
});
