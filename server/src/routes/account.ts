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
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { stripe } from '../lib/stripe.js';
import logger from '../lib/logger.js';

export const accountRoutes = new Hono();

accountRoutes.use('*', authMiddleware);

// One destructive call per minute is plenty; nothing legitimate retries
// account deletion in a tight loop.
accountRoutes.delete('/', rateLimitMiddleware(3, 60_000), async (c) => {
  const user = c.get('user');

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
