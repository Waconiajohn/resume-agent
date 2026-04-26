/**
 * Tests for DELETE /api/account.
 *
 * Order matters: cancel Stripe sub → delete auth user. If Stripe fails we
 * abort before touching auth (so the user isn't left billable for a deleted
 * account). The CASCADE migration handles public-schema cleanup.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.hoisted(() => vi.fn());
const mockDeleteUser = vi.hoisted(() => vi.fn());
const mockRpc = vi.hoisted(() => vi.fn());
const mockStripeCancel = vi.hoisted(() => vi.fn());
const mockStripeRef = vi.hoisted(() => ({ value: null as { subscriptions: { cancel: typeof mockStripeCancel } } | null }));

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: mockFrom,
    rpc: mockRpc,
    auth: { admin: { deleteUser: mockDeleteUser } },
  },
}));

vi.mock('../lib/stripe.js', () => ({
  get stripe() { return mockStripeRef.value; },
  STRIPE_WEBHOOK_SECRET: 'test-secret',
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
import { accountRoutes } from '../routes/account.js';

const app = new Hono();
app.route('/account', accountRoutes);

function buildSubLookup(row: { stripe_subscription_id: string | null; status: string | null } | null, error: { message: string } | null = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error }),
  };
  return chain;
}

/**
 * Helper — every test makes a DELETE with a password body, since
 * Sprint B.1 requires password re-auth on destructive ops.
 */
async function deleteAccount(password = 'correct-horse-battery') {
  return app.request('/account', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
}

describe('DELETE /api/account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
    mockDeleteUser.mockReset();
    mockStripeCancel.mockReset();
    mockRpc.mockReset();
    mockStripeRef.value = null;
    // Default: password verification succeeds. Tests that need it to
    // fail override per-call.
    mockRpc.mockResolvedValue({ data: true, error: null });
  });

  it('rejects 401 when password is incorrect', async () => {
    mockRpc.mockResolvedValueOnce({ data: false, error: null });
    const res = await deleteAccount('wrong-password');
    expect(res.status).toBe(401);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('rejects 400 when no password supplied', async () => {
    const res = await app.request('/account', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('deletes the auth user when no Stripe is configured (free tier)', async () => {
    mockStripeRef.value = null;
    mockDeleteUser.mockResolvedValue({ data: null, error: null });

    const res = await deleteAccount();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
    expect(mockDeleteUser).toHaveBeenCalledWith('user-abc');
    expect(mockStripeCancel).not.toHaveBeenCalled();
  });

  it('cancels active Stripe sub before deleting auth user', async () => {
    mockStripeRef.value = { subscriptions: { cancel: mockStripeCancel } };
    mockFrom.mockReturnValueOnce(buildSubLookup({ stripe_subscription_id: 'sub_123', status: 'active' }));
    mockStripeCancel.mockResolvedValue({});
    mockDeleteUser.mockResolvedValue({ data: null, error: null });

    const res = await deleteAccount();
    expect(res.status).toBe(200);
    expect(mockStripeCancel).toHaveBeenCalledWith('sub_123');
    expect(mockDeleteUser).toHaveBeenCalledWith('user-abc');
    // Order check: Stripe cancel must precede auth delete
    expect(mockStripeCancel.mock.invocationCallOrder[0]).toBeLessThan(mockDeleteUser.mock.invocationCallOrder[0]);
  });

  it('skips Stripe cancel when subscription is already cancelled', async () => {
    mockStripeRef.value = { subscriptions: { cancel: mockStripeCancel } };
    mockFrom.mockReturnValueOnce(buildSubLookup({ stripe_subscription_id: 'sub_old', status: 'cancelled' }));
    mockDeleteUser.mockResolvedValue({ data: null, error: null });

    const res = await deleteAccount();
    expect(res.status).toBe(200);
    expect(mockStripeCancel).not.toHaveBeenCalled();
    expect(mockDeleteUser).toHaveBeenCalled();
  });

  it('skips Stripe cancel when no subscription row exists', async () => {
    mockStripeRef.value = { subscriptions: { cancel: mockStripeCancel } };
    mockFrom.mockReturnValueOnce(buildSubLookup(null));
    mockDeleteUser.mockResolvedValue({ data: null, error: null });

    const res = await deleteAccount();
    expect(res.status).toBe(200);
    expect(mockStripeCancel).not.toHaveBeenCalled();
    expect(mockDeleteUser).toHaveBeenCalled();
  });

  it('treats Stripe resource_missing as already-cancelled and proceeds', async () => {
    mockStripeRef.value = { subscriptions: { cancel: mockStripeCancel } };
    mockFrom.mockReturnValueOnce(buildSubLookup({ stripe_subscription_id: 'sub_missing', status: 'active' }));
    const stripeError = Object.assign(new Error('No such subscription'), { code: 'resource_missing' });
    mockStripeCancel.mockRejectedValue(stripeError);
    mockDeleteUser.mockResolvedValue({ data: null, error: null });

    const res = await deleteAccount();
    expect(res.status).toBe(200);
    expect(mockDeleteUser).toHaveBeenCalled();
  });

  it('aborts deletion when Stripe cancel fails for a real reason', async () => {
    mockStripeRef.value = { subscriptions: { cancel: mockStripeCancel } };
    mockFrom.mockReturnValueOnce(buildSubLookup({ stripe_subscription_id: 'sub_good', status: 'active' }));
    mockStripeCancel.mockRejectedValue(new Error('Stripe API timeout'));

    const res = await deleteAccount();
    expect(res.status).toBe(502);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('returns 500 when auth.admin.deleteUser fails', async () => {
    mockStripeRef.value = null;
    mockDeleteUser.mockResolvedValue({ data: null, error: { message: 'auth provider unavailable' } });

    const res = await deleteAccount();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('returns 500 when subscription lookup fails', async () => {
    mockStripeRef.value = { subscriptions: { cancel: mockStripeCancel } };
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'db down' } }),
    };
    mockFrom.mockReturnValueOnce(chain);

    const res = await deleteAccount();
    expect(res.status).toBe(500);
    expect(mockStripeCancel).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });
});

describe('POST /api/account/verify-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockReset();
  });

  it('returns 200 when password matches', async () => {
    mockRpc.mockResolvedValueOnce({ data: true, error: null });
    const res = await app.request('/account/verify-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'right-pwd' }),
    });
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('rpc_verify_user_password', {
      caller_user_id: 'user-abc',
      password: 'right-pwd',
    });
  });

  it('returns 401 when password is wrong', async () => {
    mockRpc.mockResolvedValueOnce({ data: false, error: null });
    const res = await app.request('/account/verify-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'wrong-pwd' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 when password missing', async () => {
    const res = await app.request('/account/verify-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns 401 when the verify RPC errors (fail-closed on transient failure)', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST500', message: 'db down' } });
    const res = await app.request('/account/verify-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'p' }),
    });
    expect(res.status).toBe(401);
  });
});
