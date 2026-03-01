import type { Context, Next } from 'hono';
import { supabaseAdmin } from '../lib/supabase.js';
import { parsePositiveInt } from '../lib/http-body-guard.js';
import logger from '../lib/logger.js';

/**
 * Number of pipeline runs allowed on the Free plan per calendar month.
 * Override with FREE_TIER_PIPELINE_LIMIT env var.
 */
const FREE_TIER_LIMIT = parsePositiveInt(process.env.FREE_TIER_PIPELINE_LIMIT, 3);

/**
 * subscriptionGuard — Middleware applied to POST /api/pipeline/start.
 *
 * Checks if the authenticated user has an active paid subscription or has not
 * exceeded their free-tier pipeline limit for the current calendar month.
 *
 * Decision table:
 *   Active paid subscription (status = 'active' or 'trialing') → allow
 *   Free plan, sessions_count < FREE_TIER_LIMIT this month         → allow
 *   Free plan, sessions_count >= FREE_TIER_LIMIT this month        → 402
 *   No subscription row found                                       → treat as free, check usage
 */
export async function subscriptionGuard(c: Context, next: Next): Promise<Response | void> {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  try {
    // 1. Check subscription status
    const { data: subscription, error: subError } = await supabaseAdmin
      .from('user_subscriptions')
      .select('plan_id, status')
      .eq('user_id', user.id)
      .maybeSingle();

    if (subError) {
      logger.error({ err: subError, userId: user.id }, 'subscriptionGuard: failed to fetch subscription');
      // Fail open — do not block user if we can't check their subscription
      await next();
      return;
    }

    const isPaidActive =
      subscription !== null &&
      subscription.plan_id !== 'free' &&
      (subscription.status === 'active' || subscription.status === 'trialing');

    if (isPaidActive) {
      await next();
      return;
    }

    // 2. Free plan — check current-month usage
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();

    const { data: usage, error: usageError } = await supabaseAdmin
      .from('user_usage')
      .select('sessions_count')
      .eq('user_id', user.id)
      .gte('period_start', periodStart)
      .lte('period_start', periodEnd)
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (usageError) {
      logger.error({ err: usageError, userId: user.id }, 'subscriptionGuard: failed to fetch usage');
      // Fail open — do not block user if we can't check their usage
      await next();
      return;
    }

    const sessionsThisMonth = usage?.sessions_count ?? 0;

    if (sessionsThisMonth >= FREE_TIER_LIMIT) {
      logger.info(
        { userId: user.id, sessionsThisMonth, limit: FREE_TIER_LIMIT },
        'subscriptionGuard: free tier limit exceeded',
      );
      return c.json(
        {
          error: 'Free tier limit reached',
          code: 'FREE_TIER_LIMIT_EXCEEDED',
          sessions_used: sessionsThisMonth,
          sessions_limit: FREE_TIER_LIMIT,
          message: `You have used ${sessionsThisMonth} of ${FREE_TIER_LIMIT} free pipeline runs this month. Upgrade to continue.`,
        },
        402,
      );
    }

    await next();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, userId: user.id }, `subscriptionGuard: unexpected error: ${message}`);
    // Fail open on unexpected errors
    await next();
  }
}
