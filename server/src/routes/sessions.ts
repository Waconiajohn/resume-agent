import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { supabaseAdmin } from '../lib/supabase.js';
import { authMiddleware, getCachedUser, cacheUser } from '../middleware/auth.js';
import type { AuthUser } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import logger from '../lib/logger.js';
import { parsePositiveInt, parseJsonBodyWithLimit } from '../lib/http-body-guard.js';
import type { PipelineSSEEvent } from '../agents/types.js';
import { buildGroundedPipelineChatReply } from '../lib/session-status-service.js';
import {
  enrichStoredDraftStateForClient,
  enrichStoredPipelineDataForClient,
  type StoredV2Snapshot,
} from './resume-v2-pipeline-support.js';

const sessions = new Hono();

export type AnySSEEvent = PipelineSSEEvent;
export type SSEEmitterFn = (event: AnySSEEvent) => void;

/**
 * Minimal session shape needed by the SSE restore endpoint.
 * Only the fields accessed in the session_restore event are typed here.
 */
interface SessionRestoreShape {
  id: string;
  user_id: string;
  current_phase: string;
  messages?: Array<{ role: string; content: string | Array<{ type: string; text?: string }> }>;
  pending_tool_call_id?: string | null;
  pending_phase_transition?: string | null;
  last_panel_type?: string | null;
  last_panel_data?: Record<string, unknown> | null;
  pipeline_status?: string | null;
}

const sseConnections = new Map<string, Array<(event: AnySSEEvent) => void>>();
const sseEmitterOwners = new WeakMap<(event: AnySSEEvent) => void, string>();
let totalSSEConnections = 0;

// Track SSE connections per user to prevent resource exhaustion
const sseConnectionsByUser = new Map<string, number>();
const MAX_SSE_PER_USER = 5;
const MAX_TOTAL_SSE_CONNECTIONS = (() => {
  const parsed = Number.parseInt(process.env.MAX_TOTAL_SSE_CONNECTIONS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5000;
})();
const CONFIGURED_MAX_PROCESSING_SESSIONS_PER_USER = (() => {
  const parsed = Number.parseInt(process.env.MAX_PROCESSING_SESSIONS_PER_USER ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 6;
})();
const MAX_CREATE_SESSION_BODY_BYTES = (() => {
  return parsePositiveInt(process.env.MAX_CREATE_SESSION_BODY_BYTES, 20_000);
})();
const MAX_MESSAGE_BODY_BYTES = (() => {
  return parsePositiveInt(process.env.MAX_MESSAGE_BODY_BYTES, 120_000);
})();
const MAX_RESTORE_MESSAGES = (() => {
  return parsePositiveInt(process.env.MAX_RESTORE_MESSAGES, 20);
})();
const MAX_RESTORE_MESSAGE_CHARS = (() => {
  return parsePositiveInt(process.env.MAX_RESTORE_MESSAGE_CHARS, 4_000);
})();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function truncateRestoreText(text: string): string {
  if (text.length <= MAX_RESTORE_MESSAGE_CHARS) return text;
  return `${text.slice(0, MAX_RESTORE_MESSAGE_CHARS)}...`;
}

function isValidUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}


function addSSEConnection(sessionId: string, userId: string, emitter: (event: AnySSEEvent) => void): void {
  if (!sseConnections.has(sessionId)) {
    sseConnections.set(sessionId, []);
  }
  sseConnections.get(sessionId)!.push(emitter);
  sseEmitterOwners.set(emitter, userId);
  totalSSEConnections += 1;
  sseConnectionsByUser.set(userId, (sseConnectionsByUser.get(userId) ?? 0) + 1);
}

function removeSSEConnection(sessionId: string, userId: string, emitter: (event: AnySSEEvent) => void): void {
  const ownerId = sseEmitterOwners.get(emitter) ?? userId;
  const emitters = sseConnections.get(sessionId);
  let removed = false;
  if (emitters) {
    const idx = emitters.indexOf(emitter);
    if (idx !== -1) {
      emitters.splice(idx, 1);
      totalSSEConnections = Math.max(0, totalSSEConnections - 1);
      sseEmitterOwners.delete(emitter);
      removed = true;
    }
    if (emitters.length === 0) sseConnections.delete(sessionId);
  }
  if (!removed) return;
  const count = sseConnectionsByUser.get(ownerId);
  if (!count || count <= 1) {
    sseConnectionsByUser.delete(ownerId);
    return;
  }
  sseConnectionsByUser.set(ownerId, count - 1);
}

function reconcileSSEConnectionsByUser(): void {
  const actualByUser = new Map<string, number>();
  for (const emitters of sseConnections.values()) {
    for (const emitter of emitters) {
      const ownerId = sseEmitterOwners.get(emitter);
      if (!ownerId) continue;
      actualByUser.set(ownerId, (actualByUser.get(ownerId) ?? 0) + 1);
    }
  }
  sseConnectionsByUser.clear();
  for (const [ownerId, count] of actualByUser.entries()) {
    sseConnectionsByUser.set(ownerId, count);
  }
}

function resetSessionRouteRuntimeState(): void {
  sseConnections.clear();
  sseConnectionsByUser.clear();
  sseConnectionTimestamps.clear();
  recentIdempotencyKeys.clear();
  processingSessions.clear();
  processingSessionsByUser.clear();
  totalSSEConnections = 0;
}

export function resetSessionRouteStateForTests() {
  resetSessionRouteRuntimeState();
}

export const sessionRouteTestUtils = {
  addSSEConnection,
  removeSSEConnection,
  reconcileSSEConnectionsByUser,
  truncateRestoreText,
};

// Idempotency: track recent message keys to reject duplicates
const recentIdempotencyKeys = new Map<string, number>();
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_IDEMPOTENCY_KEYS = 20_000;

// Cleanup expired keys every minute
const idempotencyCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of recentIdempotencyKeys) {
    if (now - timestamp > IDEMPOTENCY_TTL_MS) {
      recentIdempotencyKeys.delete(key);
    }
  }

  // Backstop for sustained load spikes: trim oldest keys if map grows unbounded.
  while (recentIdempotencyKeys.size > MAX_IDEMPOTENCY_KEYS) {
    const oldest = recentIdempotencyKeys.keys().next().value;
    if (!oldest) break;
    recentIdempotencyKeys.delete(oldest);
  }
}, 60_000);
idempotencyCleanupTimer.unref();

// Rate limit SSE connections: max 10 new connections per user per minute
const sseConnectionTimestamps = new Map<string, number[]>();
const SSE_RATE_WINDOW_MS = 60_000;
const SSE_RATE_MAX = 10;
const MAX_SSE_RATE_USERS = (() => {
  const parsed = Number.parseInt(process.env.MAX_SSE_RATE_USERS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20_000;
})();

function trimRecentSSEAttempts(timestamps: number[], now: number): number[] {
  let head = 0;
  while (head < timestamps.length && now - timestamps[head] >= SSE_RATE_WINDOW_MS) {
    head += 1;
  }
  return head > 0 ? timestamps.slice(head) : timestamps;
}

function trackSSEAttempt(userId: string, now: number): { allowed: boolean } {
  const prior = sseConnectionTimestamps.get(userId) ?? [];
  const recent = trimRecentSSEAttempts(prior, now);
  if (recent.length >= SSE_RATE_MAX) {
    sseConnectionTimestamps.set(userId, recent);
    return { allowed: false };
  }
  recent.push(now);
  // Maintain rough LRU order so oldest tracked users are evicted first.
  sseConnectionTimestamps.delete(userId);
  sseConnectionTimestamps.set(userId, recent);
  while (sseConnectionTimestamps.size > MAX_SSE_RATE_USERS) {
    const oldestUser = sseConnectionTimestamps.keys().next().value;
    if (!oldestUser) break;
    sseConnectionTimestamps.delete(oldestUser);
  }
  return { allowed: true };
}

const sseRateCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [userId, timestamps] of sseConnectionTimestamps.entries()) {
    const recent = trimRecentSSEAttempts(timestamps, now);
    if (recent.length === 0) {
      sseConnectionTimestamps.delete(userId);
    } else {
      sseConnectionTimestamps.set(userId, recent);
    }
  }
  // Reconcile per-user SSE counts from active emitter ownership to heal drift.
  reconcileSSEConnectionsByUser();
}, 60_000);
sseRateCleanupTimer.unref();

// SSE endpoint — requires Authorization header with Bearer token
sessions.get('/:id/sse', async (c) => {
  const sessionId = c.req.param('id') ?? '';
  if (!isValidUuid(sessionId)) {
    return c.json({ error: 'Invalid session id' }, 400);
  }

  const authHeader = c.req.header('Authorization');
  let token: string | undefined;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  if (!token) {
    return c.json({ error: 'Missing authentication token' }, 401);
  }

  // Use shared token cache to avoid a Supabase remote call on every SSE connect
  let authUser: AuthUser | null = getCachedUser(token);
  if (!authUser) {
    const { data: { user: rawUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !rawUser) {
      return c.json({ error: 'Invalid or expired token' }, 401);
    }
    authUser = { id: rawUser.id, email: rawUser.email ?? '', accessToken: token };
    cacheUser(token, authUser);
  }
  const user = authUser;

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
  const sseAttempt = trackSSEAttempt(user.id, now);
  if (!sseAttempt.allowed) {
    return c.json({ error: 'Too many connection attempts. Please wait a moment.' }, 429);
  }

  // Enforce per-user SSE connection limit
  const currentUserConns = sseConnectionsByUser.get(user.id) ?? 0;
  if (currentUserConns >= MAX_SSE_PER_USER) {
    return c.json({ error: 'Too many open connections. Please close other tabs.' }, 429);
  }
  if (totalSSEConnections >= MAX_TOTAL_SSE_CONNECTIONS) {
    return c.json({ error: 'Server is at capacity. Please try again shortly.' }, 503);
  }

  return streamSSE(c, async (stream) => {
    let emitter: ((event: AnySSEEvent) => void) | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let connectionClosed = false;
    const cleanupConnection = () => {
      if (connectionClosed || !emitter) return;
      connectionClosed = true;
      removeSSEConnection(sessionId, user.id, emitter);
    };
    emitter = (event: AnySSEEvent) => {
      void stream.writeSSE({
        event: event.type,
        data: JSON.stringify(event),
      }).catch(() => {
        logger.warn({ sessionId }, 'SSE write failed — cleaning up connection');
        cleanupConnection();
      });
    };

    try {
      await stream.writeSSE({
        event: 'connected',
        data: JSON.stringify({ session_id: sessionId }),
      });

      // Register AFTER the initial write succeeds so a dead emitter is never
      // left in the connection map if the first write fails.
      addSSEConnection(sessionId, user.id, emitter);

      // Replay historical messages and session state on reconnect
      // Lightweight validation before casting
      if (!session.id || !session.user_id || !session.current_phase) {
        logger.error({ sessionId }, 'SSE: Invalid session data');
      }
      const typedSession = session as SessionRestoreShape;
      const chatMessages: Array<{ role: string; content: string }> = [];
      for (const msg of typedSession.messages ?? []) {
        if (!msg || typeof msg !== 'object' || typeof (msg as unknown as Record<string, unknown>).role !== 'string') {
          logger.warn({ sessionId }, 'SSE restore: skipping malformed message');
          continue;
        }
        if (msg.role === 'user') {
          if (typeof msg.content === 'string') {
            chatMessages.push({ role: 'user', content: truncateRestoreText(msg.content) });
          }
          // Skip tool_result arrays — they're internal
        } else if (msg.role === 'assistant') {
          if (typeof msg.content === 'string') {
            chatMessages.push({ role: 'assistant', content: truncateRestoreText(msg.content) });
          } else if (Array.isArray(msg.content)) {
            const textParts = msg.content
              .filter((b: { type: string; text?: string }) => b.type === 'text' && b.text)
              .map((b: { text?: string }) => b.text)
              .join('');
            if (textParts) {
              chatMessages.push({ role: 'assistant', content: truncateRestoreText(textParts) });
            }
          }
        }
      }

      // Cap restored messages to the most recent items to avoid huge SSE payloads
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
            pipeline_status: typedSession.pipeline_status ?? null,
          }),
        });
      }

      heartbeat = setInterval(() => {
        void stream.writeSSE({ event: 'heartbeat', data: '' }).catch(() => {
          logger.warn({ sessionId }, 'SSE heartbeat failed — cleaning up zombie connection');
          if (heartbeat) clearInterval(heartbeat);
          cleanupConnection();
        });
      }, 10_000);
      heartbeat.unref();

      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          resolve();
        });
      });
    } catch (err) {
      logger.warn(
        { sessionId, error: err instanceof Error ? err.message : String(err) },
        'SSE stream terminated before completion',
      );
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      cleanupConnection();
    }
  });
});

// All remaining routes require Bearer token auth
sessions.use('*', authMiddleware);

// POST /sessions — Create a new coaching session
sessions.post('/', rateLimitMiddleware(12, 60_000), async (c) => {
  const parsedBody = await parseJsonBodyWithLimit(c, MAX_CREATE_SESSION_BODY_BYTES);
  if (!parsedBody.ok) return parsedBody.response;

  const user = c.get('user');
  const body = parsedBody.data as Record<string, unknown>;

  const KNOWN_PRODUCT_TYPES = new Set([
    'resume',
    'executive_bio',
    'case_study',
    'thank_you_note',
    'salary_negotiation',
    'ninety_day_plan',
    'personal_brand',
    'content_calendar',
    'linkedin_optimization',
    'interview_prep',
    'cover_letter',
    'job_search',
  ]);

  const { master_resume_id, job_application_id, product_type: rawProductType } = body as {
    master_resume_id?: string;
    job_application_id?: string;
    product_type?: string;
  };

  const product_type = typeof rawProductType === 'string' && KNOWN_PRODUCT_TYPES.has(rawProductType)
    ? rawProductType
    : 'resume';

  let resolvedMasterResumeId = master_resume_id ?? null;
  if (!resolvedMasterResumeId) {
    const { data: defaultResume } = await supabaseAdmin
      .from('master_resumes')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (defaultResume?.id) {
      resolvedMasterResumeId = defaultResume.id;
    } else {
      const { data: latestResume } = await supabaseAdmin
        .from('master_resumes')
        .select('id')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      resolvedMasterResumeId = latestResume?.id ?? null;
    }
  }

  // Atomic usage check + increment
  const { data: usageResult, error: usageError } = await supabaseAdmin
    .rpc('increment_session_usage', { p_user_id: user.id });

  if (usageError) {
    logger.error({ error: usageError.message }, 'Failed to check usage limits');
    return c.json({ error: 'Failed to verify usage limits' }, 500);
  }

  if (usageResult && !usageResult.allowed) {
    return c.json({
      error: 'Monthly session limit reached. Please upgrade your plan.',
      code: 'USAGE_LIMIT',
      current_count: usageResult.current_count,
      max_count: usageResult.max_count,
    }, 402);
  }

  const { data, error } = await supabaseAdmin
    .from('coach_sessions')
    .insert({
      user_id: user.id,
      master_resume_id: resolvedMasterResumeId,
      job_application_id: job_application_id ?? null,
      status: 'active',
      current_phase: 'onboarding',
      messages: [],
      product_type: product_type ?? 'resume',
    })
    .select()
    .single();

  if (error) {
    logger.error({ error: error.message }, 'Failed to create session');
    return c.json({ error: 'Failed to create session' }, 500);
  }

  return c.json({ session: data });
});

// GET /sessions/:id/resume — Get the final resume from a completed session
sessions.get('/:id/resume', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('id') ?? '';
  if (!isValidUuid(sessionId)) {
    return c.json({ error: 'Invalid session id' }, 400);
  }

  const { data, error } = await supabaseAdmin
    .from('coach_sessions')
    .select('last_panel_data')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const panelData = data.last_panel_data as Record<string, unknown> | null;
  const resume = panelData?.resume ?? null;
  if (!resume) {
    return c.json({ error: 'No resume data available for this session' }, 404);
  }

  return c.json({ resume });
});

// GET /sessions/:id/cover-letter — Get the final cover letter from a completed session
sessions.get('/:id/cover-letter', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('id') ?? '';
  if (!isValidUuid(sessionId)) {
    return c.json({ error: 'Invalid session id' }, 400);
  }

  const { data, error } = await supabaseAdmin
    .from('coach_sessions')
    .select('last_panel_data')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const panelData = data.last_panel_data as Record<string, unknown> | null;
  const letter = (panelData?.letter ?? panelData?.cover_letter ?? null) as string | null;
  if (!letter) {
    return c.json({ error: 'No cover letter data available for this session' }, 404);
  }

  const qualityScore = (panelData?.quality_score ?? null) as number | null;
  return c.json({ letter, quality_score: qualityScore });
});

// GET /sessions/:id — Get session state
sessions.get('/:id', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('id') ?? '';
  if (!isValidUuid(sessionId)) {
    return c.json({ error: 'Invalid session id' }, 400);
  }

  const { data, error } = await supabaseAdmin
    .from('coach_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const stored = data.tailored_sections as Record<string, unknown> | null;
  if (stored && stored.version === 'v2') {
    const storedSnapshot = stored as StoredV2Snapshot;
    const enrichedPipelineData = enrichStoredPipelineDataForClient(storedSnapshot.pipeline_data);
    const enrichedDraftState = enrichStoredDraftStateForClient(storedSnapshot.draft_state, {
      resumeText: storedSnapshot.inputs.resume_text,
      gapAnalysis: enrichedPipelineData.gapAnalysis,
    });
    return c.json({
      session: {
        ...data,
        tailored_sections: {
          ...storedSnapshot,
          pipeline_data: enrichedPipelineData,
          draft_state: enrichedDraftState,
        },
      },
    });
  }

  return c.json({ session: data });
});

// DELETE /sessions/:id — Delete a session
sessions.delete('/:id', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('id') ?? '';
  if (!isValidUuid(sessionId)) {
    return c.json({ error: 'Invalid session id' }, 400);
  }

  const { data: existing, error: loadError } = await supabaseAdmin
    .from('coach_sessions')
    .select('pipeline_status')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single();
  if (loadError || !existing) {
    return c.json({ error: 'Session not found' }, 404);
  }
  if (existing.pipeline_status === 'running') {
    return c.json({ error: 'Cannot delete a session while its pipeline is running' }, 409);
  }

  const { data: deleted, error } = await supabaseAdmin
    .from('coach_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .neq('pipeline_status', 'running')
    .select('id');

  if (error) {
    logger.error({ sessionId, error: error.message }, 'Failed to delete session');
    return c.json({ error: 'Failed to delete session' }, 500);
  }

  // If no row was deleted, the pipeline started running between our check and delete.
  if (!deleted || deleted.length === 0) {
    return c.json({ error: 'Cannot delete a session while its pipeline is running' }, 409);
  }

  // Best-effort in-memory cleanup — use removeSSEConnection for each emitter
  // to keep totalSSEConnections and sseConnectionsByUser consistent.
  const emitters = sseConnections.get(sessionId) ?? [];
  for (const emitter of [...emitters]) {
    removeSSEConnection(sessionId, user.id, emitter);
  }
  releaseProcessingSession(sessionId);

  return c.json({ status: 'deleted', session_id: sessionId });
});

// Track in-flight processing per session to prevent concurrent submissions.
// Includes user ownership for per-user concurrency caps.
const processingSessions = new Map<string, { userId: string; startedAt: number }>();
const processingSessionsByUser = new Map<string, number>();
const MAX_PROCESSING_SESSIONS = (() => {
  const parsed = Number.parseInt(process.env.MAX_PROCESSING_SESSIONS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2_000;
})();
const MAX_PROCESSING_SESSIONS_PER_USER = Math.min(
  CONFIGURED_MAX_PROCESSING_SESSIONS_PER_USER,
  MAX_PROCESSING_SESSIONS,
);
if (CONFIGURED_MAX_PROCESSING_SESSIONS_PER_USER > MAX_PROCESSING_SESSIONS) {
  logger.warn({
    configured_per_user: CONFIGURED_MAX_PROCESSING_SESSIONS_PER_USER,
    max_processing_sessions: MAX_PROCESSING_SESSIONS,
    effective_per_user: MAX_PROCESSING_SESSIONS_PER_USER,
  }, 'Clamped MAX_PROCESSING_SESSIONS_PER_USER to MAX_PROCESSING_SESSIONS');
}
const PROCESSING_TTL_MS = (() => {
  const parsed = Number.parseInt(process.env.PROCESSING_TTL_MS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15 * 60_000;
})();

function pruneStaleProcessingSessions(now: number): void {
  for (const [sid, entry] of processingSessions.entries()) {
    if (now - entry.startedAt >= PROCESSING_TTL_MS) {
      releaseProcessingSession(sid);
    }
  }
}

function getUserProcessingCount(userId: string): number {
  return processingSessionsByUser.get(userId) ?? 0;
}

function reserveProcessingSession(sessionId: string, userId: string, startedAt: number): void {
  processingSessions.set(sessionId, { userId, startedAt });
  processingSessionsByUser.set(userId, (processingSessionsByUser.get(userId) ?? 0) + 1);
}

function releaseProcessingSession(sessionId: string): void {
  const entry = processingSessions.get(sessionId);
  if (!entry) return;
  processingSessions.delete(sessionId);
  const nextCount = (processingSessionsByUser.get(entry.userId) ?? 1) - 1;
  if (nextCount <= 0) {
    processingSessionsByUser.delete(entry.userId);
  } else {
    processingSessionsByUser.set(entry.userId, nextCount);
  }
}

const processingCleanupTimer = setInterval(() => {
  pruneStaleProcessingSessions(Date.now());
}, 60_000);
processingCleanupTimer.unref();

// POST /sessions/:id/messages — Send a message to the agent
// Rate limit: 20 messages per user per minute
sessions.post('/:id/messages', rateLimitMiddleware(20, 60_000), async (c) => {
  const parsedBody = await parseJsonBodyWithLimit(c, MAX_MESSAGE_BODY_BYTES);
  if (!parsedBody.ok) return parsedBody.response;

  const user = c.get('user');
  const sessionId = c.req.param('id') ?? '';
  if (!isValidUuid(sessionId)) {
    return c.json({ error: 'Invalid session id' }, 400);
  }
  const body = parsedBody.data as Record<string, unknown>;
  const { content, idempotency_key } = body as { content: string; idempotency_key?: string };

  if (!content?.trim()) {
    return c.json({ error: 'Message content is required' }, 400);
  }

  if (content.length > 50_000) {
    return c.json({ error: 'Message too long' }, 400);
  }

  const now = Date.now();
  pruneStaleProcessingSessions(now);

  // Reject concurrent submissions for the same session
  if (processingSessions.has(sessionId)) {
    return c.json({ error: 'A message is already being processed. Please wait.', code: 'PROCESSING' }, 409);
  }

  if (processingSessions.size >= MAX_PROCESSING_SESSIONS) {
    return c.json({ error: 'Server is busy. Please retry shortly.' }, 503);
  }
  if (getUserProcessingCount(user.id) >= MAX_PROCESSING_SESSIONS_PER_USER) {
    return c.json({ error: 'You have too many active requests. Please wait for one to finish.' }, 429);
  }

  if (idempotency_key) {
    if (idempotency_key.length > 128) {
      return c.json({ error: 'Idempotency key too long (max 128 chars)' }, 400);
    }
    const scopedKey = `${user.id}:${idempotency_key}`;
    if (recentIdempotencyKeys.has(scopedKey)) {
      return c.json({ status: 'duplicate', code: 'DUPLICATE' });
    }
    recentIdempotencyKeys.set(scopedKey, Date.now());
    while (recentIdempotencyKeys.size > MAX_IDEMPOTENCY_KEYS) {
      const oldest = recentIdempotencyKeys.keys().next().value;
      if (!oldest) break;
      recentIdempotencyKeys.delete(oldest);
    }
  }

  // Reserve immediately so concurrent requests for the same session are rejected in-process.
  reserveProcessingSession(sessionId, user.id, now);
  let handedOff = false;
  try {
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

    const emit = (event: AnySSEEvent) => {
      const emitters = sseConnections.get(sessionId);
      if (emitters) {
        for (const emitter of [...emitters]) {
          try {
            emitter(event);
          } catch {
            // Drop dead emitter immediately to reduce repeated send failures.
            removeSSEConnection(sessionId, user.id, emitter);
          }
        }
      }
    };

    const sessionRow = sessionData as Record<string, unknown>;

    // Legacy chat loop has been decommissioned. All interaction happens through the pipeline.
    // Return a grounded status response based on current session state.
    const groundedReply = buildGroundedPipelineChatReply(sessionRow);
    emit({ type: 'system_message', content: groundedReply });
    releaseProcessingSession(sessionId);
    handedOff = true;
    return c.json({ status: 'grounded_status' });
  } finally {
    if (!handedOff) {
      releaseProcessingSession(sessionId);
    }
  }
});

// GET /sessions — Get user's sessions list
sessions.get('/', async (c) => {
  const user = c.get('user');

  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '50', 10) || 50, 1), 100);
  const offset = Math.max(parseInt(c.req.query('offset') ?? '0', 10) || 0, 0);
  const statusFilter = c.req.query('status') ?? '';

  let query = supabaseAdmin
    .from('coach_sessions')
    .select('id, status, current_phase, pipeline_status, pipeline_stage, input_tokens_used, output_tokens_used, estimated_cost_usd, last_panel_type, last_panel_data, tailored_sections, product_type, job_application_id, created_at, updated_at, job_applications(company, title, status)', { count: 'exact' })
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (statusFilter) {
    query = query.eq('pipeline_status', statusFilter);
  }

  const { data, error, count } = await query;

  if (error) {
    logger.error({ error: error.message }, 'Failed to load sessions');
    return c.json({ error: 'Failed to load sessions' }, 500);
  }

  const enriched = (data ?? []).map((row: Record<string, unknown>) => {
    const panelData = row.last_panel_data as Record<string, unknown> | null;
    const resume = panelData?.resume as Record<string, unknown> | null;

    // For resume_v2 sessions the pipeline stores job intelligence in tailored_sections,
    // not last_panel_data. Extract company/role from there as an additional fallback.
    const tailoredSections = row.tailored_sections as Record<string, unknown> | null;
    const v2PipelineData = tailoredSections?.version === 'v2'
      ? (tailoredSections.pipeline_data as Record<string, unknown> | null)
      : null;
    const v2JobIntelligence = v2PipelineData?.jobIntelligence as Record<string, unknown> | null;

    return {
      id: row.id,
      status: row.status,
      current_phase: row.current_phase,
      pipeline_status: row.pipeline_status ?? null,
      pipeline_stage: row.pipeline_stage ?? null,
      input_tokens_used: row.input_tokens_used ?? 0,
      output_tokens_used: row.output_tokens_used ?? 0,
      estimated_cost_usd: row.estimated_cost_usd ?? 0,
      last_panel_type: row.last_panel_type ?? null,
      company_name: (resume?.company_name as string)
        ?? (panelData?.company_name as string)
        ?? (v2JobIntelligence?.company_name as string)
        ?? (row.job_applications as Record<string, unknown> | null)?.company as string
        ?? null,
      job_title: (resume?.job_title as string)
        ?? (panelData?.job_title as string)
        ?? (v2JobIntelligence?.role_title as string)
        ?? (row.job_applications as Record<string, unknown> | null)?.title as string
        ?? null,
      job_stage: (row.job_applications as Record<string, unknown> | null)?.status as string ?? null,
      job_application_id: row.job_application_id ?? null,
      product_type: (row.product_type as string) ?? 'resume',
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });

  const totalCount = count ?? enriched.length;
  const has_more = offset + enriched.length < totalCount;
  return c.json({ sessions: enriched, has_more });
});

export function getSessionRouteStats() {
  return {
    active_sse_sessions: sseConnections.size,
    total_sse_emitters: totalSSEConnections,
    sse_users_tracked: sseConnectionsByUser.size,
    active_processing_sessions: processingSessions.size,
    processing_users_tracked: processingSessionsByUser.size,
    max_processing_sessions: MAX_PROCESSING_SESSIONS,
    max_processing_sessions_per_user: MAX_PROCESSING_SESSIONS_PER_USER,
    max_create_session_body_bytes: MAX_CREATE_SESSION_BODY_BYTES,
    max_message_body_bytes: MAX_MESSAGE_BODY_BYTES,
    max_restore_messages: MAX_RESTORE_MESSAGES,
    max_restore_message_chars: MAX_RESTORE_MESSAGE_CHARS,
  };
}

export { sessions, sseConnections, addSSEConnection, removeSSEConnection };
