/**
 * Account routes — /api/account/*
 *
 * Currently exposes:
 *   DELETE /api/account — wipe the caller's account.
 *
 * Order of operations matters:
 *   1. Cancel any live Stripe subscription (so the user isn't billed after
 *      they think they've deleted the account). Stripe-side records persist
 *      on Stripe's end; we just stop the recurring charge.
 *   2. Call auth.admin.deleteUser. Postgres CASCADE on every public-schema
 *      FK to auth.users (see migration 20260426000000) wipes the user's
 *      content as part of the same delete.
 *
 * If Stripe cancellation fails, we fail the whole flow rather than leaving
 * the user with a billable subscription pointing at a deleted account.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { stripe } from '../lib/stripe.js';
import logger from '../lib/logger.js';

export const accountRoutes = new Hono();

accountRoutes.use('*', authMiddleware);

// Password re-auth helper used by destructive ops. Returns true if the
// supplied password matches the user's bcrypt hash in auth.users.
// The RPC is service-role only; we never expose verification to a
// non-authenticated caller.
async function verifyUserPassword(userId: string, password: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('rpc_verify_user_password', {
    caller_user_id: userId,
    password,
  });
  if (error) {
    logger.warn(
      { userId, code: error.code, message: error.message },
      'account: rpc_verify_user_password failed',
    );
    return false;
  }
  return data === true;
}

const verifyPasswordSchema = z.object({
  password: z.string().min(1).max(256),
});

// Lightweight standalone endpoint for non-server-mediated destructive
// ops (e.g., disabling MFA, which goes from frontend directly to
// Supabase). The frontend prompts for the password, calls this to
// confirm, then proceeds with the user-side mutation.
accountRoutes.post('/verify-password', rateLimitMiddleware(10, 60_000), async (c) => {
  const user = c.get('user');
  const raw = await c.req.json().catch(() => null);
  const parsed = verifyPasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'Password required' }, 400);
  }
  const ok = await verifyUserPassword(user.id, parsed.data.password);
  if (!ok) {
    return c.json({ error: 'Incorrect password' }, 401);
  }
  return c.json({ verified: true });
});

const deleteAccountSchema = z.object({
  password: z.string().min(1).max(256),
});

// One destructive call per minute is plenty; nothing legitimate retries
// account deletion in a tight loop.
accountRoutes.delete('/', rateLimitMiddleware(3, 60_000), async (c) => {
  const user = c.get('user');

  // Password re-auth. Even though the user is signed in, requiring the
  // password again limits the blast radius of session-jacking
  // (XSS / stolen JWT / unlocked-laptop attacks). The body schema is
  // optional-friendly: we only pull the password if the body parses.
  const rawBody = await c.req.json().catch(() => null);
  const parsedBody = deleteAccountSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return c.json({ error: 'Password required to confirm deletion' }, 400);
  }
  const passwordOk = await verifyUserPassword(user.id, parsedBody.data.password);
  if (!passwordOk) {
    return c.json({ error: 'Incorrect password' }, 401);
  }

  // 1) Cancel any live Stripe subscription. Treat "no Stripe configured" and
  //    "no subscription on file" as no-ops; treat a real Stripe failure as a
  //    hard fail so we never delete the auth row while leaving the user
  //    billable.
  if (stripe) {
    const { data: sub, error: subErr } = await supabaseAdmin
      .from('user_subscriptions')
      .select('stripe_subscription_id, status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (subErr) {
      logger.error(
        { error: subErr.message, userId: user.id },
        'account-delete: subscription lookup failed',
      );
      return c.json({ error: 'Failed to verify subscription state' }, 500);
    }

    const stripeSubId = sub?.stripe_subscription_id;
    const isActive = sub?.status === 'active' || sub?.status === 'trialing' || sub?.status === 'past_due';

    if (stripeSubId && isActive) {
      try {
        // cancel() is immediate; cancel_at_period_end would let the user keep
        // service through the paid window. For account deletion, immediate
        // cancellation is the right call — they've asked to leave.
        await stripe.subscriptions.cancel(stripeSubId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // 'resource_missing' means Stripe doesn't recognize the sub id; treat
        // as already-cancelled and let deletion proceed. Anything else is a
        // hard fail.
        const isMissing = typeof err === 'object'
          && err !== null
          && 'code' in err
          && (err as { code: string }).code === 'resource_missing';
        if (!isMissing) {
          logger.error(
            { error: message, userId: user.id, stripeSubId },
            'account-delete: Stripe cancellation failed',
          );
          return c.json(
            { error: 'Failed to cancel subscription before account deletion. Please try again or contact support.' },
            502,
          );
        }
        logger.warn(
          { userId: user.id, stripeSubId },
          'account-delete: Stripe subscription not found; treating as already cancelled',
        );
      }
    }
  }

  // 2) Delete the auth user. Postgres CASCADE on every FK in public.* wipes
  //    the user's data atomically with this call (migration
  //    20260426000000_cascade_user_deletion_fks.sql).
  const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(user.id);
  if (deleteErr) {
    logger.error(
      { error: deleteErr.message, userId: user.id },
      'account-delete: auth.admin.deleteUser failed',
    );
    return c.json({ error: 'Failed to delete account' }, 500);
  }

  logger.info({ userId: user.id }, 'account-delete: account deleted');
  return c.json({ deleted: true });
});
