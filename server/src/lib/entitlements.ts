import { supabaseAdmin } from './supabase.js';
import logger from './logger.js';

export interface FeatureEntitlement {
  enabled?: boolean;
  limit?: number;
}

export interface UserEntitlements {
  plan_id: string;
  features: Record<string, FeatureEntitlement>;
}

/**
 * Default free-plan entitlements used as fallback when the DB is unavailable.
 */
const FREE_PLAN_DEFAULTS: UserEntitlements = {
  plan_id: 'free',
  features: {
    sessions_per_month: { limit: 3 },
    export_pdf: { enabled: true },
    export_docx: { enabled: false },
    deep_research: { enabled: false },
  },
};

function parseFeatureValue(raw: unknown): FeatureEntitlement {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as FeatureEntitlement;
    } catch {
      return {};
    }
  }
  if (raw !== null && typeof raw === 'object') {
    return raw as FeatureEntitlement;
  }
  return {};
}

/**
 * Get the merged entitlements for a user based on their plan + overrides.
 * Plan features form the base; user_feature_overrides take precedence.
 * Expired overrides are ignored.
 * Fails open with free-plan defaults on any DB error.
 */
export async function getUserEntitlements(userId: string): Promise<UserEntitlements> {
  try {
    // 1. Get user's active subscription plan
    const { data: subscription, error: subError } = await supabaseAdmin
      .from('user_subscriptions')
      .select('plan_id, status')
      .eq('user_id', userId)
      .maybeSingle();

    if (subError) {
      logger.error({ err: subError, userId }, 'getUserEntitlements: failed to fetch subscription');
      return FREE_PLAN_DEFAULTS;
    }

    const planId =
      subscription !== null &&
      (subscription.status === 'active' || subscription.status === 'trialing')
        ? (subscription.plan_id ?? 'free')
        : 'free';

    // 2. Get plan features
    const { data: planFeatures, error: planError } = await supabaseAdmin
      .from('plan_features')
      .select('feature_key, feature_value')
      .eq('plan_id', planId);

    if (planError) {
      logger.error({ err: planError, userId, planId }, 'getUserEntitlements: failed to fetch plan features');
      return FREE_PLAN_DEFAULTS;
    }

    const features: Record<string, FeatureEntitlement> = {};
    for (const pf of planFeatures ?? []) {
      features[pf.feature_key] = parseFeatureValue(pf.feature_value);
    }

    // 3. Get user overrides (non-expired)
    const { data: overrides, error: overrideError } = await supabaseAdmin
      .from('user_feature_overrides')
      .select('feature_key, feature_value, expires_at')
      .eq('user_id', userId);

    if (overrideError) {
      // Non-fatal: log and continue with plan features only
      logger.warn({ err: overrideError, userId }, 'getUserEntitlements: failed to fetch overrides, using plan features only');
    } else {
      const now = new Date();
      for (const override of overrides ?? []) {
        // Skip expired overrides
        if (override.expires_at && new Date(override.expires_at) < now) continue;
        // Override wins over plan feature
        features[override.feature_key] = parseFeatureValue(override.feature_value);
      }
    }

    return { plan_id: planId, features };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, userId }, `getUserEntitlements: unexpected error: ${message}`);
    // Fail open with free plan defaults
    return FREE_PLAN_DEFAULTS;
  }
}

/**
 * Check if a user has a specific feature enabled.
 * Returns false if the feature is not in their entitlements or enabled is not true.
 */
export async function hasFeature(userId: string, featureKey: string): Promise<boolean> {
  const entitlements = await getUserEntitlements(userId);
  const feature = entitlements.features[featureKey];
  if (!feature) return false;
  return feature.enabled === true;
}

/**
 * Get the numeric limit for a feature.
 * Returns -1 for unlimited, 0 if the feature is not defined.
 */
export async function getFeatureLimit(userId: string, featureKey: string): Promise<number> {
  const entitlements = await getUserEntitlements(userId);
  const feature = entitlements.features[featureKey];
  if (!feature) return 0;
  if (feature.limit === -1) return -1; // unlimited
  return feature.limit ?? 0;
}
