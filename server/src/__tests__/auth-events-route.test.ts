/**
 * Tests for the auth-events route — POST and GET /api/auth/events.
 *
 * Validates the body schema, captures IP/user-agent, scopes reads to the
 * caller, and surfaces Supabase errors as 500 (rather than silently
 * absorbing them via `?? []`).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: { from: mockFrom },
}));

vi.mock('../lib/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set('user', { id: 'user-abc', email: 'u@example.com', accessToken: 't' });
    await next();
  }),
}));

vi.mock('../middleware/rate-limit.js', () => ({
  rateLimitMiddleware: () => async (_c: unknown, next: () => Promise<void>) => { await next(); },
}));

import { Hono } from 'hono';
import { authEventsRoutes } from '../routes/auth-events.js';

const app = new Hono();
app.route('/auth/events', authEventsRoutes);

function buildInsertChain(error: { message: string; code?: string } | null = null) {
  return { insert: vi.fn().mockResolvedValue({ data: null, error }) };
}

function buildSelectChain(rows: unknown[] | null, error: { message: string; code?: string } | null = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: rows, error }),
  };
  return chain;
}

describe('POST /api/auth/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
  });

  it('records a signed_in event with metadata', async () => {
    const insertChain = buildInsertChain();
    mockFrom.mockReturnValueOnce(insertChain);

    const res = await app.request('/auth/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'Vitest/1.0' },
      body: JSON.stringify({ event_type: 'signed_in', metadata: { method: 'password' } }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recorded).toBe(true);
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-abc',
        event_type: 'signed_in',
        user_agent: 'Vitest/1.0',
        metadata: { method: 'password' },
      }),
    );
  });

  it('rejects unknown event types', async () => {
    const res = await app.request('/auth/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event_type: 'logged_in' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects oversized metadata', async () => {
    const huge = { junk: 'x'.repeat(3000) };
    const res = await app.request('/auth/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event_type: 'signed_in', metadata: huge }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 500 when Supabase insert fails', async () => {
    mockFrom.mockReturnValueOnce(buildInsertChain({ message: 'db down', code: 'PGRST500' }));
    const res = await app.request('/auth/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event_type: 'signed_in' }),
    });
    expect(res.status).toBe(500);
  });

  it('honors x-forwarded-for only when TRUST_PROXY=true', async () => {
    process.env.TRUST_PROXY = 'true';
    const insertChain = buildInsertChain();
    mockFrom.mockReturnValueOnce(insertChain);

    await app.request('/auth/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
      body: JSON.stringify({ event_type: 'signed_in' }),
    });

    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ ip_address: '203.0.113.5' }),
    );
    delete process.env.TRUST_PROXY;
  });

  it('drops x-forwarded-for when TRUST_PROXY is unset', async () => {
    delete process.env.TRUST_PROXY;
    const insertChain = buildInsertChain();
    mockFrom.mockReturnValueOnce(insertChain);

    await app.request('/auth/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.5' },
      body: JSON.stringify({ event_type: 'signed_in' }),
    });

    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ ip_address: null }),
    );
  });
});

describe('GET /api/auth/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
  });

  it('returns the caller\'s events sorted desc', async () => {
    const rows = [
      { id: 'e1', event_type: 'signed_in', occurred_at: '2026-04-26T10:00:00Z', ip_address: null, user_agent: null, metadata: null },
      { id: 'e2', event_type: 'signed_out', occurred_at: '2026-04-26T09:00:00Z', ip_address: null, user_agent: null, metadata: null },
    ];
    const chain = buildSelectChain(rows);
    mockFrom.mockReturnValueOnce(chain);

    const res = await app.request('/auth/events?limit=20');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toHaveLength(2);
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-abc');
    expect(chain.order).toHaveBeenCalledWith('occurred_at', { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(20);
  });

  it('clamps limit to 200', async () => {
    const chain = buildSelectChain([]);
    mockFrom.mockReturnValueOnce(chain);
    await app.request('/auth/events?limit=10000');
    expect(chain.limit).toHaveBeenCalledWith(200);
  });

  it('returns 500 when Supabase select fails', async () => {
    mockFrom.mockReturnValueOnce(buildSelectChain(null, { message: 'rls denied', code: 'PGRST301' }));
    const res = await app.request('/auth/events');
    expect(res.status).toBe(500);
  });
});
