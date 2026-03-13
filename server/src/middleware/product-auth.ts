/**
 * product-auth — Cross-product authorization middleware.
 *
 * Defines which subscription tiers can access which products, and provides
 * a `requireTier` factory that gates a route by product slug.
 *
 * Usage (opt-in per route):
 *   router.post('/start', authMiddleware, requireTier('linkedin_optimizer'), handler)
 *
 * On access denied:
 *   HTTP 403 { error: 'Upgrade required', required_tier: 'pro', upgrade_url: '/pricing' }
 *
 * Tier hierarchy: enterprise > pro > free
 * A user on 'pro' can access everything in 'free' and 'pro' but not 'enterprise'.
 *
 * The guard reads the user's subscription tier from the entitlements system
 * (which already handles plan_features + user_feature_overrides). On any DB
 * error it fails open (allows the request) to avoid blocking users on infra
 * outages.
 */

import type { Context, Next } from 'hono';
import { getUserEntitlements } from '../lib/entitlements.js';
import logger from '../lib/logger.js';

// ─── Tier Access Map ─────────────────────────────────────────────────────────

export type AccessTier = 'free' | 'pro' | 'enterprise';

/**
 * Maps each product slug to the minimum subscription tier required to access it.
 * A user on 'pro' inherits access to all 'free' and 'pro' products.
 * A user on 'enterprise' inherits access to all products.
 *
 * Products not listed here are considered unrestricted (no tier check applied).
 */
export const PRODUCT_TIER_REQUIREMENTS: Record<string, AccessTier> = {
  // ─── Free tier products ───
  resume_v2: 'free',
  cover_letter: 'free',

  // ─── Pro tier products ───
  linkedin_optimizer: 'pro',
  linkedin_editor: 'pro',
  linkedin_content: 'pro',
  interview_prep: 'pro',
  mock_interview: 'pro',
  interview_debrief: 'pro',
  salary_negotiation: 'pro',
  counter_offer_sim: 'pro',
  executive_bio: 'pro',
  case_study: 'pro',
  thank_you_note: 'pro',
  personal_brand_audit: 'pro',
  ninety_day_plan: 'pro',
  content_calendar: 'pro',
  job_finder: 'pro',
  job_tracker: 'pro',
  networking_outreach: 'pro',
  networking_crm: 'pro',
  job_search: 'pro',
  application_pipeline: 'pro',
  watchlist: 'pro',
  retirement_bridge: 'pro',
  momentum: 'pro',
  onboarding: 'free',

  // ─── Enterprise-only products ───
  b2b_admin: 'enterprise',
};

// Tier numeric values for comparison
const TIER_RANK: Record<AccessTier, number> = {
  free: 0,
  pro: 1,
  enterprise: 2,
};

/** Map a Supabase plan_id to an AccessTier. */
function planToTier(planId: string): AccessTier {
  const lower = planId.toLowerCase();
  if (lower.includes('enterprise') || lower.includes('b2b')) return 'enterprise';
  if (
    lower.includes('pro')
    || lower.includes('starter')
    || lower.includes('paid')
    || lower.includes('premium')
  ) return 'pro';
  return 'free';
}

/** Check whether a user's tier meets the required tier. */
function tierMeetsRequirement(userTier: AccessTier, required: AccessTier): boolean {
  return TIER_RANK[userTier] >= TIER_RANK[required];
}

/**
 * Middleware factory. Returns a Hono middleware that checks whether the
 * authenticated user's subscription tier is sufficient for `productSlug`.
 *
 * If the product slug is not in PRODUCT_TIER_REQUIREMENTS, the middleware
 * is a no-op (passes through).
 *
 * Requires authMiddleware to have run first (c.get('user') must be set).
 */
export function requireTier(productSlug: string) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const requiredTier = PRODUCT_TIER_REQUIREMENTS[productSlug];

    // Not a gated product — pass through
    if (!requiredTier || requiredTier === 'free') {
      await next();
      return;
    }

    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    try {
      const entitlements = await getUserEntitlements(user.id);
      const userTier = planToTier(entitlements.plan_id);

      if (!tierMeetsRequirement(userTier, requiredTier)) {
        logger.info(
          { userId: user.id, productSlug, userTier, requiredTier },
          'product-auth: access denied',
        );
        return c.json(
          {
            error: 'Upgrade required',
            required_tier: requiredTier,
            your_tier: userTier,
            product: productSlug,
            upgrade_url: '/pricing',
          },
          403,
        );
      }

      await next();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, userId: user.id, productSlug }, `product-auth: unexpected error: ${message}`);
      // Fail open — do not block user on infra errors
      await next();
    }
  };
}

/**
 * Check whether a user ID has access to a product without being in a Hono middleware chain.
 * Useful for programmatic checks inside route handlers.
 *
 * Returns { allowed: true } or { allowed: false, required_tier, user_tier }.
 */
export async function checkProductAccess(
  userId: string,
  productSlug: string,
): Promise<
  | { allowed: true }
  | { allowed: false; required_tier: AccessTier; user_tier: AccessTier }
> {
  const requiredTier = PRODUCT_TIER_REQUIREMENTS[productSlug];
  if (!requiredTier || requiredTier === 'free') {
    return { allowed: true };
  }

  try {
    const entitlements = await getUserEntitlements(userId);
    const userTier = planToTier(entitlements.plan_id);

    if (tierMeetsRequirement(userTier, requiredTier)) {
      return { allowed: true };
    }

    return { allowed: false, required_tier: requiredTier, user_tier: userTier };
  } catch {
    // Fail open on errors
    return { allowed: true };
  }
}
