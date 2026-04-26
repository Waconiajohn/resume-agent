/**
 * Auth Events Routes — /api/auth/events
 *
 * Sprint B (auth hardening). Append-only audit log of authentication events
 * per user. The frontend AuthEventEmitter posts to this route from the
 * Supabase onAuthStateChange handler; the user can read their own log via
 * Settings → Activity.
 *
 *   POST /api/auth/events  — record an event for the caller
 *   GET  /api/auth/events  — read the caller's own log (most recent first)
 *
 * Server captures the request's IP and user-agent so the user can spot a
 * sign-in from an unfamiliar device. Writes go through supabaseAdmin so
 * the table can keep service-role-only INSERT in RLS.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { AUTH_EVENT_TYPES } from '../lib/auth-events.js';
import logger from '../lib/logger.js';

const createEventSchema = z.object({
  event_type: z.enum(AUTH_EVENT_TYPES),
  // Free-form metadata — capped at ~2KB at the JSON level. Sign-in metadata
  // typically carries { method: 'password' | 'oauth' } plus optional
  // provider name; user_updated may carry { changed_fields: [...] }.
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const MAX_METADATA_BYTES = 2_048;

export const authEventsRoutes = new Hono();

authEventsRoutes.use('*', authMiddleware);

// Conservative rate limit — at typical usage we expect ~1-3 events per
// session. 60 per minute is plenty of headroom and still stops a runaway
// loop from flooding the table.
authEventsRoutes.post('/', rateLimitMiddleware(60, 60_000), async (c) => {
  const user = c.get('user');

  const raw = await c.req.json().catch(() => null);
  if (!raw || typeof raw !== 'object') {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  const parsed = createEventSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'Invalid event payload', issues: parsed.error.issues }, 400);
  }

  const { event_type, metadata } = parsed.data;

  if (metadata && JSON.stringify(metadata).length > MAX_METADATA_BYTES) {
    return c.json({ error: 'metadata too large' }, 400);
  }

  // Capture network context. x-forwarded-for is honored only when the
  // server is behind a trusted proxy; otherwise we leave ip null rather
  // than trust a header that any client can set.
  const trustProxy = process.env.TRUST_PROXY === 'true';
  const ip = trustProxy
    ? (c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || null)
    : null;
  const userAgent = c.req.header('user-agent')?.slice(0, 500) ?? null;

  const { error } = await supabaseAdmin.from('auth_audit_log').insert({
    user_id: user.id,
    event_type,
    ip_address: ip,
    user_agent: userAgent,
    metadata: metadata ?? null,
  });

  if (error) {
    logger.error(
      { source: 'auth_audit_log', code: error.code, message: error.message, userId: user.id, eventType: event_type },
      'auth-events: insert failed',
    );
    return c.json({ error: 'Failed to record event' }, 500);
  }

  return c.json({ recorded: true });
});

authEventsRoutes.get('/', rateLimitMiddleware(120, 60_000), async (c) => {
  const user = c.get('user');

  const limitParam = Number(c.req.query('limit') ?? '50');
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;

  const { data, error } = await supabaseAdmin
    .from('auth_audit_log')
    .select('id, event_type, ip_address, user_agent, metadata, occurred_at')
    .eq('user_id', user.id)
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error(
      { source: 'auth_audit_log', code: error.code, message: error.message, userId: user.id },
      'auth-events: select failed',
    );
    return c.json({ error: 'Failed to load activity log' }, 500);
  }

  return c.json({ events: data ?? [] });
});
