import type { Context, Next } from 'hono';
import { getUserEntitlements } from '../lib/entitlements.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';

/**
 * subscriptionGuard — Middleware applied to POST /api/pipeline/start.
 *
 * Checks if the authenticated user has not exceeded their plan's session limit
 * for the current calendar month. Uses the entitlements system so that the limit
 * is derived from the user's active plan (free / starter / pro) plus any
 * user_feature_overrides.
 *
 * Decision table:
 *   sessions_per_month limit = -1           → unlimited, always allow
 *   sessions_count < limit this month       → allow
 *   sessions_count >= limit this month      → 402
 *   DB error (subscription or usage lookup) → fail open, allow
 */
export async function subscriptionGuard(c: Context, next: Next): Promise<Response | void> {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  try {
    const entitlements = await getUserEntitlements(user.id);
    const sessionLimit = entitlements.features.sessions_per_month?.limit ?? 3;

    // -1 means unlimited sessions
    if (sessionLimit === -1) {
      await next();
      return;
    }

    // Check current-month usage
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

    if (sessionsThisMonth >= sessionLimit) {
      logger.info(
        { userId: user.id, sessionsThisMonth, limit: sessionLimit, plan: entitlements.plan_id },
        'subscriptionGuard: session limit exceeded',
      );
      return c.json(
        {
          error: 'Session limit reached',
          code: 'SESSION_LIMIT_EXCEEDED',
          sessions_used: sessionsThisMonth,
          sessions_limit: sessionLimit,
          plan_id: entitlements.plan_id,
          message: `You have used ${sessionsThisMonth} of ${sessionLimit} pipeline runs this month. Upgrade to continue.`,
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
