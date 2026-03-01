import { Hono } from 'hono';
import type Stripe from 'stripe';
import { supabaseAdmin } from '../lib/supabase.js';
import { createPromoCode, listPromoCodes } from '../lib/stripe-promos.js';
import logger from '../lib/logger.js';

/**
 * Admin routes — protected by ADMIN_API_KEY environment variable.
 * These routes are NOT exposed to end users and must only be called
 * by internal tooling or trusted operators.
 *
 * All routes require the Authorization header:
 *   Authorization: Bearer <ADMIN_API_KEY>
 */
const admin = new Hono();

// ---------------------------------------------------------------------------
// Admin auth guard — all routes under /api/admin require the admin key
// ---------------------------------------------------------------------------
admin.use('*', async (c, next) => {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    if (process.env.NODE_ENV === 'production') {
      return c.json({ error: 'Admin API is not configured' }, 503);
    }
    // In development, allow through without a key (convenience)
    await next();
    return;
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader || authHeader !== `Bearer ${adminKey}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  await next();
});

// ---------------------------------------------------------------------------
// POST /api/admin/promo-codes — Create a promotion code
// Body: { code, percent_off, duration, duration_in_months?, max_redemptions?, name? }
// ---------------------------------------------------------------------------
admin.post('/promo-codes', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { code, percent_off, duration, duration_in_months, max_redemptions, name } =
    body as Record<string, unknown>;

  if (typeof code !== 'string' || !code.trim()) {
    return c.json({ error: 'code is required' }, 400);
  }
  if (typeof percent_off !== 'number' || percent_off < 1 || percent_off > 100) {
    return c.json({ error: 'percent_off must be a number between 1 and 100' }, 400);
  }

  const validDurations = ['once', 'repeating', 'forever'] as const;
  type ValidDuration = typeof validDurations[number];
  const dur: ValidDuration =
    typeof duration === 'string' && (validDurations as readonly string[]).includes(duration)
      ? (duration as ValidDuration)
      : 'forever';

  try {
    const result = await createPromoCode({
      code: code.trim(),
      percentOff: percent_off,
      duration: dur,
      durationInMonths: typeof duration_in_months === 'number' ? duration_in_months : undefined,
      maxRedemptions: typeof max_redemptions === 'number' ? max_redemptions : undefined,
      name: typeof name === 'string' ? name : undefined,
    });

    if (!result) {
      return c.json({ error: 'Stripe not configured' }, 503);
    }

    logger.info({ code: result.promotionCode.code }, 'Admin created promo code');

    return c.json(
      {
        code: result.promotionCode.code,
        coupon_id: result.coupon.id,
        percent_off: result.coupon.percent_off,
        duration: result.coupon.duration,
      },
      201,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Failed to create promo code: ${message}` }, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/promo-codes — List active promotion codes
// ---------------------------------------------------------------------------
admin.get('/promo-codes', async (c) => {
  try {
    const codes = await listPromoCodes();
    return c.json({
      codes: codes.map(pc => {
        const couponRaw = pc.promotion.coupon;
        const coupon = typeof couponRaw === 'object' && couponRaw !== null
          ? couponRaw as Stripe.Coupon
          : null;
        return {
          id: pc.id,
          code: pc.code,
          active: pc.active,
          times_redeemed: pc.times_redeemed,
          max_redemptions: pc.max_redemptions,
          coupon: {
            percent_off: coupon?.percent_off ?? null,
            amount_off: coupon?.amount_off ?? null,
            duration: coupon?.duration ?? null,
            name: coupon?.name ?? null,
          },
        };
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Failed to list promo codes: ${message}` }, 500);
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/feature-overrides
// Grant or update a feature override for a specific user.
// Body: { user_id, feature_key, feature_value, granted_by?, expires_at? }
// ---------------------------------------------------------------------------
admin.post('/feature-overrides', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { user_id, feature_key, feature_value, granted_by, expires_at } =
    body as Record<string, unknown>;

  if (typeof user_id !== 'string' || !user_id.trim()) {
    return c.json({ error: 'user_id is required' }, 400);
  }
  if (typeof feature_key !== 'string' || !feature_key.trim()) {
    return c.json({ error: 'feature_key is required' }, 400);
  }
  if (!feature_value || typeof feature_value !== 'object') {
    return c.json({ error: 'feature_value must be a JSON object' }, 400);
  }

  const { error } = await supabaseAdmin
    .from('user_feature_overrides')
    .upsert(
      {
        user_id: user_id.trim(),
        feature_key: feature_key.trim(),
        feature_value: feature_value as Record<string, unknown>,
        granted_by: typeof granted_by === 'string' ? granted_by : 'admin',
        expires_at: typeof expires_at === 'string' ? expires_at : null,
      },
      { onConflict: 'user_id,feature_key' },
    );

  if (error) {
    logger.error({ err: error, user_id, feature_key }, 'Failed to grant feature override');
    return c.json({ error: 'Failed to grant feature override' }, 500);
  }

  logger.info({ user_id, feature_key, granted_by }, 'Feature override granted');
  return c.json({ status: 'granted', user_id, feature_key }, 201);
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/feature-overrides
// Revoke a feature override for a specific user.
// Query params: user_id, feature_key
// ---------------------------------------------------------------------------
admin.delete('/feature-overrides', async (c) => {
  const userId = c.req.query('user_id');
  const featureKey = c.req.query('feature_key');

  if (!userId || !featureKey) {
    return c.json({ error: 'user_id and feature_key query params are required' }, 400);
  }

  const { error } = await supabaseAdmin
    .from('user_feature_overrides')
    .delete()
    .eq('user_id', userId)
    .eq('feature_key', featureKey);

  if (error) {
    logger.error({ err: error, userId, featureKey }, 'Failed to revoke feature override');
    return c.json({ error: 'Failed to revoke override' }, 500);
  }

  logger.info({ userId, featureKey }, 'Feature override revoked');
  return c.json({ status: 'revoked', user_id: userId, feature_key: featureKey });
});

// ---------------------------------------------------------------------------
// GET /api/admin/feature-overrides
// List all feature overrides for a user.
// Query params: user_id
// ---------------------------------------------------------------------------
admin.get('/feature-overrides', async (c) => {
  const userId = c.req.query('user_id');

  if (!userId) {
    return c.json({ error: 'user_id query param is required' }, 400);
  }

  const { data, error } = await supabaseAdmin
    .from('user_feature_overrides')
    .select('feature_key, feature_value, granted_by, expires_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error({ err: error, userId }, 'Failed to list feature overrides');
    return c.json({ error: 'Failed to list overrides' }, 500);
  }

  return c.json({ user_id: userId, overrides: data ?? [] });
});

export { admin };
