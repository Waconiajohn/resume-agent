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
const mockStripeCancel = vi.hoisted(() => vi.fn());
const mockStripeRef = vi.hoisted(() => ({ value: null as { subscriptions: { cancel: typeof mockStripeCancel } } | null }));

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: mockFrom,
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

describe('DELETE /api/account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
    mockDeleteUser.mockReset();
    mockStripeCancel.mockReset();
    mockStripeRef.value = null;
  });

  it('deletes the auth user when no Stripe is configured (free tier)', async () => {
    mockStripeRef.value = null;
    mockDeleteUser.mockResolvedValue({ data: null, error: null });

    const res = await app.request('/account', { method: 'DELETE' });
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

    const res = await app.request('/account', { method: 'DELETE' });
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

    const res = await app.request('/account', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(mockStripeCancel).not.toHaveBeenCalled();
    expect(mockDeleteUser).toHaveBeenCalled();
  });

  it('skips Stripe cancel when no subscription row exists', async () => {
    mockStripeRef.value = { subscriptions: { cancel: mockStripeCancel } };
    mockFrom.mockReturnValueOnce(buildSubLookup(null));
    mockDeleteUser.mockResolvedValue({ data: null, error: null });

    const res = await app.request('/account', { method: 'DELETE' });
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

    const res = await app.request('/account', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(mockDeleteUser).toHaveBeenCalled();
  });

  it('aborts deletion when Stripe cancel fails for a real reason', async () => {
    mockStripeRef.value = { subscriptions: { cancel: mockStripeCancel } };
    mockFrom.mockReturnValueOnce(buildSubLookup({ stripe_subscription_id: 'sub_good', status: 'active' }));
    mockStripeCancel.mockRejectedValue(new Error('Stripe API timeout'));

    const res = await app.request('/account', { method: 'DELETE' });
    expect(res.status).toBe(502);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('returns 500 when auth.admin.deleteUser fails', async () => {
    mockStripeRef.value = null;
    mockDeleteUser.mockResolvedValue({ data: null, error: { message: 'auth provider unavailable' } });

    const res = await app.request('/account', { method: 'DELETE' });
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

    const res = await app.request('/account', { method: 'DELETE' });
    expect(res.status).toBe(500);
    expect(mockStripeCancel).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });
});
