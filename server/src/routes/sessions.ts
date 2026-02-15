import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { supabaseAdmin } from '../lib/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { SessionContext } from '../agent/context.js';
import type { CoachSession } from '../agent/context.js';
import { runAgentLoop } from '../agent/loop.js';
import type { SSEEvent } from '../agent/loop.js';
import { withSessionLock } from '../lib/session-lock.js';

const sessions = new Hono();

const sseConnections = new Map<string, Array<(event: SSEEvent) => void>>();

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

// SSE endpoint — auth via query param since EventSource can't set headers.
// Known limitation: the EventSource API does not support custom headers, so we
// pass the JWT as a query parameter. This means the token may appear in server
// logs and browser history. Short-lived JWTs (Supabase default ~1hr) mitigate
// the exposure window. Consider upgrading to fetch-based streaming if the
// EventSource constraint becomes a security concern.
sessions.get('/:id/sse', async (c) => {
  const sessionId = c.req.param('id');
  const token = c.req.query('token');

  if (!token) {
    return c.json({ error: 'Missing token query parameter' }, 401);
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

    await stream.writeSSE({
      event: 'connected',
      data: JSON.stringify({ session_id: sessionId }),
    });

    // Replay historical messages and session state on reconnect
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

    if (chatMessages.length > 0 || typedSession.current_phase !== 'onboarding') {
      await stream.writeSSE({
        event: 'session_restore',
        data: JSON.stringify({
          type: 'session_restore',
          messages: chatMessages,
          current_phase: typedSession.current_phase,
          pending_tool_call_id: typedSession.pending_tool_call_id,
          pending_phase_transition: typedSession.pending_phase_transition,
        }),
      });
    }

    const heartbeat = setInterval(() => {
      stream.writeSSE({ event: 'heartbeat', data: '' }).catch(() => {
        console.warn('SSE heartbeat failed for session', sessionId);
        clearInterval(heartbeat);
      });
    }, 15000);

    try {
      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          resolve();
        });
      });
    } finally {
      clearInterval(heartbeat);
      const emitters = sseConnections.get(sessionId);
      if (emitters) {
        const idx = emitters.indexOf(emitter);
        if (idx !== -1) emitters.splice(idx, 1);
        if (emitters.length === 0) sseConnections.delete(sessionId);
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
    return c.json({ error: 'Failed to create session', details: error.message }, 500);
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

// POST /sessions/:id/messages — Send a message to the agent
sessions.post('/:id/messages', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('id');
  const body = await c.req.json();
  const { content, idempotency_key } = body as { content: string; idempotency_key?: string };

  if (!content?.trim()) {
    return c.json({ error: 'Message content is required' }, 400);
  }

  if (idempotency_key) {
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
      console.error('DB error loading session:', loadError);
      return c.json({ error: 'Database error' }, 503);
    }
    return c.json({ error: 'Session not found' }, 404);
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

  withSessionLock(sessionId, async () => {
    try {
      await runAgentLoop(ctx, content, emit);
    } catch (error) {
      console.error('Agent loop error:', error);
      emit({
        type: 'error',
        message: error instanceof Error ? error.message : 'Agent error',
        recoverable: true,
      });
    } finally {
      const checkpoint = ctx.toCheckpoint();
      await supabaseAdmin
        .from('coach_sessions')
        .update(checkpoint)
        .eq('id', sessionId)
        .eq('user_id', user.id);
    }
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
    return c.json({ error: 'Failed to load sessions' }, 500);
  }

  return c.json({ sessions: data });
});

export { sessions, sseConnections };
