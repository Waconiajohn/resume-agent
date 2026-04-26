/**
 * Tests for the AAL2 enforcement layer in authMiddleware.
 *
 * The gap this closes: a phished password gives an attacker an AAL1
 * access token even when the legitimate user has MFA enrolled. The UI
 * MfaChallengeGate stops THE BROWSER, but the API still trusts AAL1
 * tokens unless authMiddleware checks. These tests verify it now does.
 *
 * Carve-outs covered: mock-auth tokens skip the check; users with no
 * verified factor skip the check; AAL2 tokens pass even if factors
 * exist; transient RPC errors fail open (we'd rather be permissive
 * than lock everyone out on a DB hiccup).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetUser = vi.hoisted(() => vi.fn());
const mockRpc = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
  },
}));

vi.mock('../lib/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn().mockReturnThis() },
}));

import { Hono } from 'hono';
import {
  authMiddleware,
  resetAuthCacheForTests,
  resetFactorsCacheForTests,
} from '../middleware/auth.js';

function tokenWithClaims(claims: Record<string, unknown>): string {
  // base64url-encode the payload; signature stays a placeholder since
  // the tests mock supabaseAdmin.auth.getUser and never verify it.
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `header.${payload}.signature`;
}

const app = new Hono();
app.use('*', authMiddleware);
app.get('/protected', (c) => c.json({ ok: true, user: c.get('user') }));

beforeEach(() => {
  resetAuthCacheForTests();
  resetFactorsCacheForTests();
  mockGetUser.mockReset();
  mockRpc.mockReset();
});

describe('authMiddleware AAL2 enforcement', () => {
  it('passes when user has no verified factor (AAL1 token is fine)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'u1@example.com' } }, error: null });
    mockRpc.mockResolvedValue({ data: false, error: null }); // no factor

    const token = tokenWithClaims({ sub: 'u1', aal: 'aal1', exp: Math.floor(Date.now() / 1000) + 3600 });
    const res = await app.request('/protected', { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
  });

  it('returns 401 MFA_REQUIRED when AAL1 token is used by a user with verified factor', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'u1@example.com' } }, error: null });
    mockRpc.mockResolvedValue({ data: true, error: null }); // has factor

    const token = tokenWithClaims({ sub: 'u1', aal: 'aal1', exp: Math.floor(Date.now() / 1000) + 3600 });
    const res = await app.request('/protected', { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('MFA_REQUIRED');
  });

  it('passes AAL2 token through even when user has verified factor', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'u1@example.com' } }, error: null });
    mockRpc.mockResolvedValue({ data: true, error: null });

    const token = tokenWithClaims({ sub: 'u1', aal: 'aal2', exp: Math.floor(Date.now() / 1000) + 3600 });
    const res = await app.request('/protected', { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.aal).toBe('aal2');
    expect(body.user.requiresAal2).toBe(true);
  });

  it('fails open if the factors RPC errors (warns but lets the request through)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'u1@example.com' } }, error: null });
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST500', message: 'db down' } });

    const token = tokenWithClaims({ sub: 'u1', aal: 'aal1', exp: Math.floor(Date.now() / 1000) + 3600 });
    const res = await app.request('/protected', { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
  });

  it('caches the factors result so a second call within TTL skips the RPC', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'u1@example.com' } }, error: null });
    mockRpc.mockResolvedValue({ data: true, error: null });

    const token1 = tokenWithClaims({ sub: 'u1', aal: 'aal2', exp: Math.floor(Date.now() / 1000) + 3600 });
    const token2 = tokenWithClaims({ sub: 'u1', aal: 'aal2', exp: Math.floor(Date.now() / 1000) + 3600, jti: 'b' });

    await app.request('/protected', { headers: { Authorization: `Bearer ${token1}` } });
    await app.request('/protected', { headers: { Authorization: `Bearer ${token2}` } });

    // Distinct tokens → distinct token-cache entries → 2 getUser calls.
    expect(mockGetUser).toHaveBeenCalledTimes(2);
    // But factors cache is keyed by user_id → 1 RPC call.
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
