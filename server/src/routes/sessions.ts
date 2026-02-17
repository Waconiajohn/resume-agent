import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { supabaseAdmin } from '../lib/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { SessionContext } from '../agent/context.js';
import type { CoachSession } from '../agent/context.js';
import { runAgentLoop } from '../agent/loop.js';
import type { SSEEvent } from '../agent/loop.js';
import { withSessionLock } from '../lib/session-lock.js';
import { saveSessionCheckpoint } from '../lib/save-session-checkpoint.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import logger, { createSessionLogger } from '../lib/logger.js';

const sessions = new Hono();

const sseConnections = new Map<string, Array<(event: SSEEvent) => void>>();

// Track SSE connections per user to prevent resource exhaustion
const sseConnectionsByUser = new Map<string, number>();
const MAX_SSE_PER_USER = 5;

// Idempotency: track recent message keys to reject duplicates
const recentIdempotencyKeys = new Map<string, number>();
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Cleanup expired keys every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of recentIdempotencyKeys) {
    if (now - timestamp > IDEMPOTENCY_TTL_MS) {
      recentIdempotencyKeys.delete(key);
    }
  }
}, 60_000);

// Rate limit SSE connections: max 10 new connections per user per minute
const sseConnectionTimestamps = new Map<string, number[]>();
const SSE_RATE_WINDOW_MS = 60_000;
const SSE_RATE_MAX = 10;

// SSE endpoint — accepts Authorization header (preferred) or query param (deprecated fallback)
sessions.get('/:id/sse', async (c) => {
  const sessionId = c.req.param('id');

  // Prefer Authorization header; fall back to query param for legacy EventSource clients
  const authHeader = c.req.header('Authorization');
  let token: string | undefined;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else {
    token = c.req.query('token');
    if (token) {
      logger.warn({ sessionId }, 'DEPRECATED: JWT in query string. Use Authorization header instead.');
    }
  }

  if (!token) {
    return c.json({ error: 'Missing authentication token' }, 401);
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const { data: session, error } = await supabaseAdmin
    .from('coach_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single();

  if (error || !session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  // SSE connection rate limit: prevent rapid reconnection floods
  const now = Date.now();
  const timestamps = sseConnectionTimestamps.get(user.id) ?? [];
  const recentTimestamps = timestamps.filter(t => now - t < SSE_RATE_WINDOW_MS);
  if (recentTimestamps.length >= SSE_RATE_MAX) {
    return c.json({ error: 'Too many connection attempts. Please wait a moment.' }, 429);
  }
  recentTimestamps.push(now);
  sseConnectionTimestamps.set(user.id, recentTimestamps);

  // Enforce per-user SSE connection limit
  const currentUserConns = sseConnectionsByUser.get(user.id) ?? 0;
  if (currentUserConns >= MAX_SSE_PER_USER) {
    return c.json({ error: 'Too many open connections. Please close other tabs.' }, 429);
  }

  return streamSSE(c, async (stream) => {
    const emitter = (event: SSEEvent) => {
      stream.writeSSE({
        event: event.type,
        data: JSON.stringify(event),
      });
    };

    if (!sseConnections.has(sessionId)) {
      sseConnections.set(sessionId, []);
    }
    sseConnections.get(sessionId)!.push(emitter);
    sseConnectionsByUser.set(user.id, (sseConnectionsByUser.get(user.id) ?? 0) + 1);

    await stream.writeSSE({
      event: 'connected',
      data: JSON.stringify({ session_id: sessionId }),
    });

    // Replay historical messages and session state on reconnect
    // Lightweight validation before casting
    if (!session.id || !session.user_id || !session.current_phase) {
      logger.error({ sessionId }, 'SSE: Invalid session data');
    }
    const typedSession = session as CoachSession;
    const chatMessages: Array<{ role: string; content: string }> = [];
    for (const msg of typedSession.messages ?? []) {
      if (msg.role === 'user') {
        if (typeof msg.content === 'string') {
          chatMessages.push({ role: 'user', content: msg.content });
        }
        // Skip tool_result arrays — they're internal
      } else if (msg.role === 'assistant') {
        if (typeof msg.content === 'string') {
          chatMessages.push({ role: 'assistant', content: msg.content });
        } else if (Array.isArray(msg.content)) {
          const textParts = msg.content
            .filter((b: { type: string; text?: string }) => b.type === 'text' && b.text)
            .map((b: { text?: string }) => b.text)
            .join('');
          if (textParts) {
            chatMessages.push({ role: 'assistant', content: textParts });
          }
        }
      }
    }

    // Cap restored messages to the 20 most recent to avoid huge SSE payloads
    const MAX_RESTORE_MESSAGES = 20;
    const restoredMessages = chatMessages.length > MAX_RESTORE_MESSAGES
      ? chatMessages.slice(-MAX_RESTORE_MESSAGES)
      : chatMessages;

    if (restoredMessages.length > 0 || typedSession.current_phase !== 'onboarding') {
      await stream.writeSSE({
        event: 'session_restore',
        data: JSON.stringify({
          type: 'session_restore',
          messages: restoredMessages,
          current_phase: typedSession.current_phase,
          pending_tool_call_id: typedSession.pending_tool_call_id,
          pending_phase_transition: typedSession.pending_phase_transition,
          last_panel_type: typedSession.last_panel_type ?? null,
          last_panel_data: typedSession.last_panel_data ?? null,
        }),
      });
    }

    let heartbeatFailed = false;
    const heartbeat = setInterval(() => {
      stream.writeSSE({ event: 'heartbeat', data: '' }).catch(() => {
        logger.warn({ sessionId }, 'SSE heartbeat failed — cleaning up zombie connection');
        clearInterval(heartbeat);
        heartbeatFailed = true;
        // Trigger connection cleanup for zombie connections
        const emitters = sseConnections.get(sessionId);
        if (emitters) {
          const idx = emitters.indexOf(emitter);
          if (idx !== -1) emitters.splice(idx, 1);
          if (emitters.length === 0) sseConnections.delete(sessionId);
        }
        const count = sseConnectionsByUser.get(user.id) ?? 1;
        if (count <= 1) {
          sseConnectionsByUser.delete(user.id);
        } else {
          sseConnectionsByUser.set(user.id, count - 1);
        }
      });
    }, 10_000);

    try {
      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          resolve();
        });
      });
    } finally {
      clearInterval(heartbeat);
      // Only clean up if heartbeat failure hasn't already done it
      if (!heartbeatFailed) {
        const emitters = sseConnections.get(sessionId);
        if (emitters) {
          const idx = emitters.indexOf(emitter);
          if (idx !== -1) emitters.splice(idx, 1);
          if (emitters.length === 0) sseConnections.delete(sessionId);
        }
        // Decrement per-user connection count
        const count = sseConnectionsByUser.get(user.id) ?? 1;
        if (count <= 1) {
          sseConnectionsByUser.delete(user.id);
        } else {
          sseConnectionsByUser.set(user.id, count - 1);
        }
      }
    }
  });
});

// All remaining routes require Bearer token auth
sessions.use('*', authMiddleware);

// POST /sessions — Create a new coaching session
sessions.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));

  const { master_resume_id, job_application_id } = body as {
    master_resume_id?: string;
    job_application_id?: string;
  };

  // Check usage limits before creating session
  const periodStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const { data: usage } = await supabaseAdmin.from('user_usage')
    .select('sessions_count')
    .eq('user_id', user.id)
    .gte('period_start', periodStart)
    .single();

  const { data: subscription } = await supabaseAdmin.from('user_subscriptions')
    .select('plan_id')
    .eq('user_id', user.id)
    .single();

  const { data: plan } = await supabaseAdmin.from('pricing_plans')
    .select('max_sessions_per_month')
    .eq('id', subscription?.plan_id ?? 'free')
    .single();

  if (plan?.max_sessions_per_month && (usage?.sessions_count ?? 0) >= plan.max_sessions_per_month) {
    return c.json({ error: 'Monthly session limit reached. Please upgrade your plan.', code: 'USAGE_LIMIT' }, 402);
  }

  const { data, error } = await supabaseAdmin
    .from('coach_sessions')
    .insert({
      user_id: user.id,
      master_resume_id: master_resume_id ?? null,
      job_application_id: job_application_id ?? null,
      status: 'active',
      current_phase: 'onboarding',
      messages: [],
    })
    .select()
    .single();

  if (error) {
    logger.error({ error: error.message }, 'Failed to create session');
    return c.json({ error: 'Failed to create session' }, 500);
  }

  return c.json({ session: data });
});

// GET /sessions/:id — Get session state
sessions.get('/:id', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('id');

  const { data, error } = await supabaseAdmin
    .from('coach_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    return c.json({ error: 'Session not found' }, 404);
  }

  return c.json({ session: data });
});

// Track in-flight processing per session to prevent concurrent submissions
const processingSessions = new Set<string>();

// POST /sessions/:id/messages — Send a message to the agent
// Rate limit: 20 messages per user per minute
sessions.post('/:id/messages', rateLimitMiddleware(20, 60_000), async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const { content, idempotency_key } = body as { content: string; idempotency_key?: string };

  if (!content?.trim()) {
    return c.json({ error: 'Message content is required' }, 400);
  }

  if (content.length > 50_000) {
    return c.json({ error: 'Message too long' }, 400);
  }

  // Reject concurrent submissions for the same session
  if (processingSessions.has(sessionId)) {
    return c.json({ error: 'A message is already being processed. Please wait.', code: 'PROCESSING' }, 409);
  }

  if (idempotency_key) {
    if (idempotency_key.length > 128) {
      return c.json({ error: 'Idempotency key too long (max 128 chars)' }, 400);
    }
    if (recentIdempotencyKeys.has(idempotency_key)) {
      return c.json({ error: 'Duplicate message', code: 'DUPLICATE' }, 409);
    }
    recentIdempotencyKeys.set(idempotency_key, Date.now());
  }

  const { data: sessionData, error: loadError } = await supabaseAdmin
    .from('coach_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single();

  if (loadError || !sessionData) {
    if (loadError && loadError.code !== 'PGRST116') {
      logger.error({ sessionId, error: loadError.message }, 'DB error loading session');
      return c.json({ error: 'Database error' }, 503);
    }
    return c.json({ error: 'Session not found' }, 404);
  }

  // Lightweight validation before casting
  if (!sessionData.id || !sessionData.user_id || !sessionData.current_phase) {
    return c.json({ error: 'Invalid session data' }, 500);
  }
  const session = sessionData as CoachSession;
  const ctx = new SessionContext(session);

  await ctx.loadMasterResume(supabaseAdmin);

  const emit = (event: SSEEvent) => {
    const emitters = sseConnections.get(sessionId);
    if (emitters) {
      for (const emitter of emitters) {
        try { emitter(event); } catch { /* Connection may have closed */ }
      }
    }
  };

  if (ctx.pendingToolCallId) {
    const lastResponse = ctx.interviewResponses[ctx.interviewResponses.length - 1];
    if (lastResponse && lastResponse.answer === '[awaiting response]') {
      lastResponse.answer = content;
    }
  }

  const log = createSessionLogger(sessionId);

  processingSessions.add(sessionId);

  withSessionLock(sessionId, async () => {
    try {
      await runAgentLoop(ctx, content, emit);
    } catch (error) {
      log.error({ error: error instanceof Error ? error.message : error }, 'Agent loop error');
      emit({
        type: 'error',
        message: 'Something went wrong processing your message. Please try again.',
        recoverable: true,
      });
    } finally {
      const result = await saveSessionCheckpoint(ctx);
      if (!result.success) {
        log.error({ error: result.error }, 'Failed to save session checkpoint');
        emit({
          type: 'error',
          message: 'Failed to save your progress. Your message was processed but changes may not persist. Please retry.',
          recoverable: true,
        });
      }
    }
  }).catch((error) => {
    log.error({ error: error instanceof Error ? error.message : error }, 'Session lock error');
    emit({
      type: 'error',
      message: 'Failed to process message — please try again.',
      recoverable: true,
    });
  }).finally(() => {
    processingSessions.delete(sessionId);
  });

  return c.json({ status: 'processing' });
});

// GET /sessions — Get user's sessions list
sessions.get('/', async (c) => {
  const user = c.get('user');

  const { data, error } = await supabaseAdmin
    .from('coach_sessions')
    .select('id, status, current_phase, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(10);

  if (error) {
    logger.error({ error: error.message }, 'Failed to load sessions');
    return c.json({ error: 'Failed to load sessions' }, 500);
  }

  return c.json({ sessions: data });
});

export { sessions, sseConnections };
