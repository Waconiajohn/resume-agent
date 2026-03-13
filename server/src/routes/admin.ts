import { Hono } from 'hono';
import type Stripe from 'stripe';
import { supabaseAdmin } from '../lib/supabase.js';
import { createPromoCode, listPromoCodes } from '../lib/stripe-promos.js';
import { resetSessionRouteStateForTests } from './sessions.js';
import { getPipelineMetrics } from '../lib/pipeline-metrics.js';
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
    return c.json({ error: 'Admin API key not configured' }, 503);
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

// ---------------------------------------------------------------------------
// POST /api/admin/reset-rate-limits — Reset in-memory SSE rate limit state
// Used by E2E tests to avoid stale rate-limit buckets across test runs.
// ---------------------------------------------------------------------------
admin.post('/reset-rate-limits', (c) => {
  resetSessionRouteStateForTests();
  logger.info('Admin reset SSE rate-limit state');
  return c.json({ status: 'reset' });
});

// ---------------------------------------------------------------------------
// GET /api/admin/stats
// Pipeline success/failure rates, average duration, average cost, and active sessions.
// ---------------------------------------------------------------------------
admin.get('/stats', async (c) => {
  const metrics = getPipelineMetrics();

  // Count active (non-terminal) pipeline sessions from DB
  const { count: activeSessions, error: sessionError } = await supabaseAdmin
    .from('coach_sessions')
    .select('*', { count: 'exact', head: true })
    .in('status', ['pending', 'active', 'processing']);

  if (sessionError) {
    logger.warn({ err: sessionError }, 'admin/stats: could not fetch active session count');
  }

  const total = metrics.completions_total + metrics.errors_total;
  const successRate = total > 0
    ? Math.round((metrics.completions_total / total) * 10000) / 100
    : null;

  return c.json({
    pipeline: {
      completions_total: metrics.completions_total,
      errors_total: metrics.errors_total,
      success_rate_pct: successRate,
      avg_duration_ms: metrics.avg_duration_ms,
      avg_cost_usd: metrics.completions_total > 0
        ? Math.round((metrics.llm_cost_estimate_total_usd / metrics.completions_total) * 10000) / 10000
        : 0,
      total_cost_usd: metrics.llm_cost_estimate_total_usd,
      completions_by_domain: metrics.completions_by_domain,
      errors_by_domain: metrics.errors_by_domain,
    },
    active_users_24h: metrics.active_users_24h,
    active_sessions: activeSessions ?? 0,
    generated_at: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/errors?limit=50&offset=0
// Recent pipeline errors with session_id, stage, error message, and timestamp.
// ---------------------------------------------------------------------------
admin.get('/errors', async (c) => {
  const limitParam = Number.parseInt(c.req.query('limit') ?? '50', 10);
  const offsetParam = Number.parseInt(c.req.query('offset') ?? '0', 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 200 ? limitParam : 50;
  const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0;

  const { data, error, count } = await supabaseAdmin
    .from('coach_sessions')
    .select('id, user_id, status, product_type, error_message, updated_at', { count: 'exact' })
    .eq('status', 'error')
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    logger.error({ err: error }, 'admin/errors: DB query failed');
    return c.json({ error: 'Failed to fetch error sessions' }, 500);
  }

  return c.json({
    errors: (data ?? []).map(row => ({
      session_id: row.id,
      user_id: row.user_id,
      product_type: row.product_type,
      error_message: row.error_message ?? null,
      timestamp: row.updated_at,
    })),
    total: count ?? 0,
    limit,
    offset,
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/sessions?limit=50&offset=0&status=all
// List all sessions (not scoped to a user). Supports optional status filter.
// ---------------------------------------------------------------------------
admin.get('/sessions', async (c) => {
  const limitParam = Number.parseInt(c.req.query('limit') ?? '50', 10);
  const offsetParam = Number.parseInt(c.req.query('offset') ?? '0', 10);
  const statusFilter = c.req.query('status');

  const limit = Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 200 ? limitParam : 50;
  const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0;

  let query = supabaseAdmin
    .from('coach_sessions')
    .select('id, user_id, status, product_type, error_message, created_at, updated_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const validStatuses = ['pending', 'active', 'processing', 'complete', 'error'] as const;
  type ValidStatus = typeof validStatuses[number];
  if (statusFilter && (validStatuses as readonly string[]).includes(statusFilter)) {
    query = query.eq('status', statusFilter as ValidStatus);
  }

  const { data, error, count } = await query;

  if (error) {
    logger.error({ err: error }, 'admin/sessions: DB query failed');
    return c.json({ error: 'Failed to fetch sessions' }, 500);
  }

  return c.json({
    sessions: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  });
});

export { admin };
