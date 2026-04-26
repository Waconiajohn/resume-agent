/**
 * Auth Sessions routes — /api/auth/sessions
 *
 * Sprint B (auth hardening). Lets a user see and revoke their own
 * Supabase auth sessions (one device per session row).
 *
 *   GET    /api/auth/sessions              — list with `current` marker
 *   DELETE /api/auth/sessions/:id          — revoke one
 *   POST   /api/auth/sessions/sign-out-others  — revoke all but the current
 *
 * `auth.sessions` is not exposed via PostgREST and supabase-js v2's
 * admin SDK doesn't have a listUserSessions method, so the work is
 * done via three SECURITY DEFINER RPCs in
 * supabase/migrations/20260426000003_user_sessions_rpcs_caller_arg.sql.
 *
 * The current session id comes from the `session_id` claim in the
 * caller's JWT; we never trust a session id from the request body.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';

export const authSessionsRoutes = new Hono();

authSessionsRoutes.use('*', authMiddleware);

/**
 * Pulls the `session_id` claim out of a Supabase access token without
 * verifying its signature — the auth middleware already verified the
 * token via supabaseAdmin.auth.getUser. Returns null on any decode
 * failure rather than throwing.
 */
function decodeSessionId(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1];
    const json = Buffer.from(payload, 'base64url').toString('utf8');
    const claims = JSON.parse(json) as { session_id?: unknown };
    return typeof claims.session_id === 'string' ? claims.session_id : null;
  } catch {
    return null;
  }
}

interface SessionRow {
  id: string;
  user_agent: string | null;
  ip: string | null;
  aal: string | null;
  created_at: string;
  updated_at: string | null;
  not_after: string | null;
}

authSessionsRoutes.get('/', rateLimitMiddleware(120, 60_000), async (c) => {
  const user = c.get('user');
  const currentSessionId = decodeSessionId(user.accessToken);

  const { data, error } = await supabaseAdmin.rpc('rpc_list_user_sessions', {
    caller_user_id: user.id,
  });

  if (error) {
    logger.error(
      { source: 'rpc_list_user_sessions', code: error.code, message: error.message, userId: user.id },
      'auth-sessions: list failed',
    );
    return c.json({ error: 'Failed to load sessions' }, 500);
  }

  const rows = (data as SessionRow[] | null) ?? [];
  const sessions = rows.map((row) => ({
    id: row.id,
    user_agent: row.user_agent,
    ip: row.ip,
    aal: row.aal,
    created_at: row.created_at,
    updated_at: row.updated_at,
    not_after: row.not_after,
    current: row.id === currentSessionId,
  }));
  return c.json({ sessions, current_session_id: currentSessionId });
});

const deleteParamsSchema = z.object({ id: z.string().uuid() });

authSessionsRoutes.delete('/:id', rateLimitMiddleware(30, 60_000), async (c) => {
  const user = c.get('user');
  const params = deleteParamsSchema.safeParse({ id: c.req.param('id') });
  if (!params.success) {
    return c.json({ error: 'Invalid session id' }, 400);
  }

  // Refuse to revoke the caller's own current session — that's what
  // the existing sign-out flow is for, and it avoids the edge case
  // where the user kills their session mid-request and sees a stuck
  // loading state instead of routing back to AuthGate.
  const currentSessionId = decodeSessionId(user.accessToken);
  if (currentSessionId && params.data.id === currentSessionId) {
    return c.json({ error: 'Use sign-out to revoke the current session' }, 400);
  }

  const { data, error } = await supabaseAdmin.rpc('rpc_revoke_user_session', {
    caller_user_id: user.id,
    target_session_id: params.data.id,
  });

  if (error) {
    logger.error(
      { source: 'rpc_revoke_user_session', code: error.code, message: error.message, userId: user.id },
      'auth-sessions: revoke failed',
    );
    return c.json({ error: 'Failed to revoke session' }, 500);
  }

  // RPC returns false when the session id didn't match — either the
  // session is gone already or it never belonged to the caller. Either
  // way, treat as 404 so the UI doesn't claim success.
  if (data !== true) {
    return c.json({ error: 'Session not found' }, 404);
  }

  return c.json({ revoked: true });
});

authSessionsRoutes.post('/sign-out-others', rateLimitMiddleware(10, 60_000), async (c) => {
  const user = c.get('user');
  const currentSessionId = decodeSessionId(user.accessToken);
  if (!currentSessionId) {
    // Without a current session id we can't safely revoke "others" —
    // we'd kill the caller's own session. Decline.
    return c.json({ error: 'Current session unavailable' }, 400);
  }

  const { data, error } = await supabaseAdmin.rpc('rpc_revoke_other_user_sessions', {
    caller_user_id: user.id,
    current_session_id: currentSessionId,
  });

  if (error) {
    logger.error(
      { source: 'rpc_revoke_other_user_sessions', code: error.code, message: error.message, userId: user.id },
      'auth-sessions: bulk revoke failed',
    );
    return c.json({ error: 'Failed to sign out other sessions' }, 500);
  }

  return c.json({ revoked: typeof data === 'number' ? data : 0 });
});
