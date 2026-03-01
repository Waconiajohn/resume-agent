import type { Context, Next } from 'hono';
import { hasFeature } from '../lib/entitlements.js';

/**
 * Middleware factory that checks if the authenticated user has a specific feature enabled.
 * Returns 402 Payment Required if the feature is not available on their plan.
 *
 * Usage:
 *   router.get('/export-docx', authMiddleware, requireFeature('export_docx'), handler)
 */
export function requireFeature(featureKey: string) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const allowed = await hasFeature(user.id, featureKey);
    if (!allowed) {
      return c.json(
        {
          error: 'Feature not available on your plan',
          code: 'FEATURE_NOT_AVAILABLE',
          feature: featureKey,
          message: `The ${featureKey.replace(/_/g, ' ')} feature requires a paid plan. Please upgrade to access this feature.`,
        },
        402,
      );
    }

    await next();
  };
}
