/**
 * Tests for /api/auth/sessions — list, revoke one, sign-out-others.
 *
 * Verifies the current-session marker, refusal to revoke the current
 * session, 404 when revoke RPC reports false, and 500 propagation when
 * Supabase returns an error.
 *
 * The routes use a service-role client + caller-id-arg RPCs (see
 * migration 20260426000003), so the tests stub `supabaseAdmin.rpc` and
 * inject a fake JWT whose payload contains a session_id claim.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRpc = vi.hoisted(() => vi.fn());
const tokenHolder = vi.hoisted(() => ({ token: '' }));

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: { rpc: mockRpc },
}));

vi.mock('../lib/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set('user', { id: 'user-abc', email: 'u@example.com', accessToken: tokenHolder.token });
    await next();
  }),
}));

vi.mock('../middleware/rate-limit.js', () => ({
  rateLimitMiddleware: () => async (_c: unknown, next: () => Promise<void>) => { await next(); },
}));

function tokenWithClaims(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `header.${payload}.signature`;
}

const DEFAULT_TOKEN = tokenWithClaims({ sub: 'user-abc', session_id: 'sess-current' });

import { Hono } from 'hono';
import { authSessionsRoutes } from '../routes/auth-sessions.js';

const app = new Hono();
app.route('/auth/sessions', authSessionsRoutes);

describe('GET /api/auth/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockReset();
    tokenHolder.token = DEFAULT_TOKEN;
  });

  it('lists sessions and marks the current one', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        { id: 'sess-current', user_agent: 'Chrome', ip: '203.0.113.5', aal: 'aal1', created_at: '2026-04-26T08:00:00Z', updated_at: '2026-04-26T10:00:00Z', not_after: '2026-04-27T08:00:00Z' },
        { id: 'sess-other', user_agent: 'iPhone Safari', ip: '198.51.100.10', aal: 'aal1', created_at: '2026-04-25T08:00:00Z', updated_at: '2026-04-25T10:00:00Z', not_after: '2026-04-26T08:00:00Z' },
      ],
      error: null,
    });

    const res = await app.request('/auth/sessions');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.current_session_id).toBe('sess-current');
    expect(body.sessions).toHaveLength(2);
    expect(body.sessions[0]).toEqual(expect.objectContaining({ id: 'sess-current', current: true }));
    expect(body.sessions[1]).toEqual(expect.objectContaining({ id: 'sess-other', current: false }));
    expect(mockRpc).toHaveBeenCalledWith('rpc_list_user_sessions', { caller_user_id: 'user-abc' });
  });

  it('returns 500 when the list RPC errors', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST500', message: 'db down' } });
    const res = await app.request('/auth/sessions');
    expect(res.status).toBe(500);
  });
});

describe('DELETE /api/auth/sessions/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockReset();
    tokenHolder.token = DEFAULT_TOKEN;
  });

  it('revokes a non-current session', async () => {
    mockRpc.mockResolvedValueOnce({ data: true, error: null });
    const res = await app.request('/auth/sessions/11111111-1111-4111-8111-111111111111', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revoked: true });
    expect(mockRpc).toHaveBeenCalledWith('rpc_revoke_user_session', {
      caller_user_id: 'user-abc',
      target_session_id: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('refuses to revoke the current session', async () => {
    const currentUuid = '99999999-9999-4999-8999-999999999999';
    tokenHolder.token = tokenWithClaims({ sub: 'user-abc', session_id: currentUuid });

    const res = await app.request(`/auth/sessions/${currentUuid}`, { method: 'DELETE' });
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid uuid', async () => {
    const res = await app.request('/auth/sessions/not-a-uuid', { method: 'DELETE' });
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns 404 when the RPC reports no row deleted', async () => {
    mockRpc.mockResolvedValueOnce({ data: false, error: null });
    const res = await app.request('/auth/sessions/22222222-2222-4222-8222-222222222222', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('returns 500 when the revoke RPC errors', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST500', message: 'db down' } });
    const res = await app.request('/auth/sessions/33333333-3333-4333-8333-333333333333', { method: 'DELETE' });
    expect(res.status).toBe(500);
  });
});

describe('POST /api/auth/sessions/sign-out-others', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockReset();
    tokenHolder.token = DEFAULT_TOKEN;
  });

  it('returns the count of revoked sessions', async () => {
    mockRpc.mockResolvedValueOnce({ data: 3, error: null });
    const res = await app.request('/auth/sessions/sign-out-others', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revoked: 3 });
    expect(mockRpc).toHaveBeenCalledWith('rpc_revoke_other_user_sessions', {
      caller_user_id: 'user-abc',
      current_session_id: 'sess-current',
    });
  });

  it('returns 400 when the JWT has no session_id', async () => {
    tokenHolder.token = tokenWithClaims({ sub: 'user-abc' });
    const res = await app.request('/auth/sessions/sign-out-others', { method: 'POST' });
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns 500 when the bulk RPC errors', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST500', message: 'db down' } });
    const res = await app.request('/auth/sessions/sign-out-others', { method: 'POST' });
    expect(res.status).toBe(500);
  });
});
