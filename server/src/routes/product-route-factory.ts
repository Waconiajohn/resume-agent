/**
 * Product Route Factory — Generates Hono routes for any product pipeline.
 *
 * Creates the standard 3 routes: POST /start, GET /:sessionId/stream, POST /respond.
 * Handles SSE connection management, heartbeat, gate polling, session validation,
 * and pipeline concurrency. Products plug in their own schema, ProductConfig, and
 * optional lifecycle hooks for domain-specific processing.
 *
 * Lifecycle hooks (all optional):
 * - onBeforeStart: Pre-pipeline validation (capacity, JD resolution). Return Response to short-circuit.
 * - transformInput: Enrich validated input before buildProductConfig.
 * - onEvent: Per-SSE-event processing (workflow artifacts, panel persistence, metrics).
 * - onRespond: After gate response persisted (question response persistence).
 * - onComplete: Pipeline success cleanup.
 * - onError: Pipeline failure cleanup.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ZodSchema } from 'zod';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { sseConnections, addSSEConnection, removeSSEConnection } from './sessions.js';
import { streamSSE } from 'hono/streaming';
import { sleep } from '../lib/sleep.js';
import logger from '../lib/logger.js';
import { parseJsonBodyWithLimit } from '../lib/http-body-guard.js';
import {
  getPendingGateQueueConfig,
  getResponseQueue,
  parsePendingGatePayload,
  type PendingGatePayload,
  withResponseQueue,
} from '../lib/pending-gate-queue.js';
import type { ProductConfig, RuntimeParams } from '../agents/runtime/product-config.js';
import type { BaseState, BaseEvent } from '../agents/runtime/agent-protocol.js';
import { runProductPipeline } from '../agents/runtime/product-coordinator.js';

// ─── Gate polling infrastructure ──────────────────────────────────────

const GATE_TIMEOUT_MS = 10 * 60 * 1000;
const GATE_POLL_BASE_MS = 250;
const GATE_POLL_MAX_MS = 2_000;
export const STALE_PIPELINE_MS = 15 * 60 * 1000;
const HEARTBEAT_MS = 5 * 60 * 1000;

function gatePollDelayMs(attempt: number): number {
  const backoff = Math.min(GATE_POLL_MAX_MS, Math.floor(GATE_POLL_BASE_MS * Math.pow(1.35, attempt)));
  const jitter = Math.floor(Math.random() * 120);
  return backoff + jitter;
}

async function getPipelineState(sessionId: string): Promise<{
  pipeline_status: string | null;
  pipeline_stage: string | null;
  pending_gate: string | null;
  pending_gate_data: unknown;
  updated_at: string | null;
} | null> {
  const { data, error } = await supabaseAdmin
    .from('coach_sessions')
    .select('pipeline_status, pipeline_stage, pending_gate, pending_gate_data, updated_at')
    .eq('id', sessionId)
    .single();
  if (error) return null;
  return data;
}

async function setPendingGate(sessionId: string, gate: string, data?: Record<string, unknown>) {
  const { data: existing } = await supabaseAdmin
    .from('coach_sessions')
    .select('pending_gate_data')
    .eq('id', sessionId)
    .maybeSingle();
  const existingPayload = parsePendingGatePayload(existing?.pending_gate_data);
  const queue = getResponseQueue(existingPayload);
  const payload = withResponseQueue(data ?? {}, queue);

  const { error } = await supabaseAdmin
    .from('coach_sessions')
    .update({ pending_gate: gate, pending_gate_data: payload })
    .eq('id', sessionId);
  if (error) {
    throw new Error(`Failed to persist pending gate '${gate}' for session ${sessionId}: ${error.message}`);
  }
}

async function clearPendingGate(sessionId: string, keepQueueFromPayload?: PendingGatePayload) {
  const queue = keepQueueFromPayload ? getResponseQueue(keepQueueFromPayload) : [];
  const { error } = await supabaseAdmin
    .from('coach_sessions')
    .update({
      pending_gate: null,
      pending_gate_data: queue.length > 0 ? { response_queue: queue } : null,
    })
    .eq('id', sessionId);
  if (error) {
    logger.warn({ session_id: sessionId, error: error.message }, 'Failed to clear pending gate');
  }
}

async function waitForGateResponse<T>(sessionId: string, gate: string): Promise<T> {
  const startedAt = Date.now();
  let pollAttempt = 0;
  let lastPayload: PendingGatePayload = {};

  // First consume any buffered early response for this exact gate.
  const initial = await getPipelineState(sessionId);
  const initialPayload = parsePendingGatePayload(initial?.pending_gate_data);
  const initialQueue = getResponseQueue(initialPayload);
  let initialIdx = -1;
  for (let i = initialQueue.length - 1; i >= 0; i -= 1) {
    if (initialQueue[i].gate === gate) {
      initialIdx = i;
      break;
    }
  }
  if (initialIdx >= 0) {
    const [match] = initialQueue.splice(initialIdx, 1);
    const nextPayload = withResponseQueue(initialPayload, initialQueue);
    const { error } = await supabaseAdmin
      .from('coach_sessions')
      .update({ pending_gate_data: nextPayload })
      .eq('id', sessionId);
    if (error) {
      throw new Error(`Failed to persist gate response consumption for session ${sessionId}: ${error.message}`);
    }
    return match.response as T;
  }

  await setPendingGate(sessionId, gate, {
    gate,
    created_at: new Date().toISOString(),
  });

  while (Date.now() - startedAt < GATE_TIMEOUT_MS) {
    const state = await getPipelineState(sessionId);
    if (!state) {
      await sleep(gatePollDelayMs(pollAttempt));
      pollAttempt += 1;
      continue;
    }

    if (state.pipeline_status !== 'running') {
      throw new Error(`Gate '${gate}' aborted because pipeline status is '${state.pipeline_status ?? 'unknown'}'`);
    }

    const payload = parsePendingGatePayload(state.pending_gate_data);
    lastPayload = payload;
    const responseGate = payload.response_gate ?? payload.gate ?? state.pending_gate ?? null;
    if (responseGate === gate && 'response' in payload) {
      await clearPendingGate(sessionId, payload);
      return payload.response as T;
    }

    await sleep(gatePollDelayMs(pollAttempt));
    pollAttempt += 1;
  }

  await clearPendingGate(sessionId, lastPayload);
  throw new Error(`Gate '${gate}' timed out after ${GATE_TIMEOUT_MS}ms`);
}

// ─── Pipeline tracking ────────────────────────────────────────────────

const IN_PROCESS_PIPELINE_TTL_MS = 20 * 60 * 1000;
const runningProductPipelines = new Map<string, number>();

function pruneStaleProductPipelines(now = Date.now()): void {
  for (const [sessionId, startedAt] of runningProductPipelines.entries()) {
    if (now - startedAt > IN_PROCESS_PIPELINE_TTL_MS) {
      runningProductPipelines.delete(sessionId);
      logger.warn({ session_id: sessionId }, 'Evicted stale product pipeline guard');
    }
  }
}

// ─── DB state type (shared with hooks) ────────────────────────────────

export interface DbPipelineState {
  pipeline_status: string | null;
  pipeline_stage: string | null;
  pending_gate: string | null;
  pending_gate_data: unknown;
  updated_at: string | null;
}

// ─── Route configuration ──────────────────────────────────────────────

export interface ProductRouteConfig<
  TState extends BaseState = BaseState,
  TEvent extends BaseEvent = BaseEvent,
> {
  /** Zod schema for validating the POST /start request body */
  startSchema: ZodSchema;

  /** Factory that builds a ProductConfig from validated input */
  buildProductConfig: (input: Record<string, unknown>) => ProductConfig<TState, TEvent>;

  /** Max body size for /start endpoint (bytes) */
  maxStartBodyBytes?: number;

  /** Max body size for /respond endpoint (bytes) */
  maxRespondBodyBytes?: number;

  /** Optional: process SSE events before broadcasting (e.g., sanitization) */
  processEvent?: (event: TEvent) => TEvent;

  /** Optional: feature flag check — return false to 404 the routes */
  isEnabled?: () => boolean;

  // ── Lifecycle hooks ──────────────────────────────────────────────

  /**
   * Pre-pipeline validation hook. Called after schema validation and session lookup
   * but before marking the pipeline as running. Use for domain-specific checks
   * (capacity, JD URL resolution, stale recovery, etc.).
   *
   * Return a Response to short-circuit (e.g., 4xx/5xx). Return void to continue.
   * The `session` parameter is the raw DB row for the session.
   */
  onBeforeStart?: (
    input: Record<string, unknown>,
    c: Context,
    session: Record<string, unknown>,
  ) => Promise<Response | void>;

  /**
   * Input enrichment hook. Called after onBeforeStart succeeds but before
   * buildProductConfig. Use to resolve/transform input (e.g., fetch JD from URL,
   * load master resume from DB).
   *
   * Returns enriched input that replaces the original for buildProductConfig.
   */
  transformInput?: (
    input: Record<string, unknown>,
    session: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;

  /**
   * Per-SSE-event processing hook. Called for every event emitted by the pipeline.
   * Use for workflow artifact persistence, panel state persistence, metrics tracking.
   *
   * May optionally return a transformed event for SSE broadcast. Return void to
   * broadcast the original event unchanged.
   *
   * When both `onEvent` and `processEvent` are set, `onEvent` runs first. If
   * `onEvent` returns a transformed event, that is broadcast. Otherwise
   * `processEvent` runs on the original event.
   */
  onEvent?: (event: TEvent, sessionId: string) => TEvent | void;

  /**
   * Post-gate-response hook. Called after a gate response is persisted in the DB.
   * Use for question response persistence, analytics, etc.
   */
  onRespond?: (
    sessionId: string,
    gate: string,
    response: unknown,
    dbState: DbPipelineState,
  ) => Promise<void>;

  /**
   * Pipeline success cleanup hook. Called after the pipeline completes successfully
   * and the DB status is updated to 'complete'.
   */
  onComplete?: (sessionId: string) => Promise<void>;

  /**
   * Pipeline failure cleanup hook. Called after the pipeline fails and the DB
   * status is updated to 'error'.
   */
  onError?: (sessionId: string, error: unknown) => Promise<void>;

  /**
   * Momentum activity type to log on pipeline completion. When set, the factory
   * auto-inserts into `user_momentum_activities` after onComplete runs.
   * Must match one of the allowed activity types in momentum.ts.
   */
  momentumActivityType?: string;

  /**
   * Pre-respond validation hook. Called after basic validation and pipeline_status
   * check but before gate response persistence. Use for stale pipeline detection,
   * response normalization, etc.
   *
   * Return a Response to short-circuit the respond handler. Return void to continue.
   */
  onBeforeRespond?: (
    sessionId: string,
    gate: string | undefined,
    response: unknown,
    dbState: DbPipelineState,
    c: Context,
  ) => Promise<Response | void>;

  /**
   * Additional Hono middleware to apply before /start (e.g., subscriptionGuard).
   * Array of middleware functions applied in order.
   */
  startMiddleware?: Array<(c: Context, next: () => Promise<void>) => Promise<Response | void>>;
}

// ─── Factory ──────────────────────────────────────────────────────────

const respondSchema = z.object({
  session_id: z.string().uuid(),
  gate: z.string().min(1).max(100).optional(),
  response: z.unknown().optional(),
});

export function createProductRoutes<
  TState extends BaseState = BaseState,
  TEvent extends BaseEvent = BaseEvent,
>(config: ProductRouteConfig<TState, TEvent>): Hono {
  const router = new Hono();
  router.use('*', authMiddleware);

  const maxStartBytes = config.maxStartBodyBytes ?? 200_000;
  const maxRespondBytes = config.maxRespondBodyBytes ?? 120_000;

  // ── POST /start ─────────────────────────────────────────────────

  // Apply optional product-specific middleware before the start handler
  if (config.startMiddleware) {
    for (const mw of config.startMiddleware) {
      router.post('/start', mw as never);
    }
  }

  router.post('/start', rateLimitMiddleware(5, 60_000), async (c) => {
    if (config.isEnabled && !config.isEnabled()) {
      return c.json({ error: 'feature_not_enabled', message: 'This feature is not currently enabled' }, 403);
    }

    const parsedBody = await parseJsonBodyWithLimit(c, maxStartBytes);
    if (!parsedBody.ok) return parsedBody.response;

    const user = c.get('user');
    const parsed = config.startSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400);
    }

    let input = parsed.data as Record<string, unknown>;
    const sessionId = input.session_id as string;

    // Verify session belongs to user — select extra fields for hooks
    const { data: session, error } = await supabaseAdmin
      .from('coach_sessions')
      .select('id, user_id, pipeline_status, status, updated_at, master_resume_id')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (error || !session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    const sessionRecord = session as Record<string, unknown>;

    if (sessionRecord.pipeline_status === 'complete' || sessionRecord.status === 'completed') {
      return c.json({ error: 'Pipeline already completed for this session' }, 409);
    }

    // Hook: onBeforeStart — domain-specific pre-pipeline validation
    if (config.onBeforeStart) {
      const hookResult = await config.onBeforeStart(input, c, sessionRecord);
      if (hookResult instanceof Response) return hookResult;
    }

    // Hook: transformInput — enrich input before building ProductConfig
    if (config.transformInput) {
      input = await config.transformInput(input, sessionRecord);
    }

    // In-process dedup
    const existing = runningProductPipelines.get(sessionId);
    if (typeof existing === 'number') {
      const stale = Date.now() - existing > IN_PROCESS_PIPELINE_TTL_MS;
      if (!stale) {
        return c.json({ error: 'Pipeline already running for this session' }, 409);
      }
      runningProductPipelines.delete(sessionId);
    }

    pruneStaleProductPipelines();

    if (sessionRecord.pipeline_status === 'running') {
      return c.json({ error: 'Pipeline already running for this session' }, 409);
    }

    // Mark as running in DB
    const { error: updateError } = await supabaseAdmin
      .from('coach_sessions')
      .update({ pipeline_status: 'running', pending_gate: null, pending_gate_data: null })
      .eq('id', sessionId);

    if (updateError) {
      return c.json({ error: 'Failed to start pipeline' }, 500);
    }

    // Build emitter that broadcasts to SSE connections (with hook support)
    const emit = (event: TEvent) => {
      // Hook: onEvent — domain-specific per-event processing
      let broadcastEvent = event;
      if (config.onEvent) {
        const transformed = config.onEvent(event, sessionId);
        if (transformed !== undefined && transformed !== null) {
          broadcastEvent = transformed;
        }
      }

      // Legacy processEvent for backward compat (only if onEvent didn't transform)
      const finalEvent = broadcastEvent === event && config.processEvent
        ? config.processEvent(broadcastEvent)
        : broadcastEvent;

      const emitters = sseConnections.get(sessionId);
      if (emitters) {
        for (const emitter of [...emitters]) {
          try {
            emitter(finalEvent as never);
          } catch {
            // Connection may be closed
          }
        }
      }
    };

    const waitForUser = <T>(gate: string): Promise<T> => waitForGateResponse<T>(sessionId, gate);

    runningProductPipelines.set(sessionId, Date.now());

    // Heartbeat
    const heartbeatTimer = setInterval(() => {
      if (!runningProductPipelines.has(sessionId)) {
        clearInterval(heartbeatTimer);
        return;
      }
      supabaseAdmin
        .from('coach_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', sessionId)
        .eq('pipeline_status', 'running')
        .then(({ error: heartbeatError }) => {
          if (heartbeatError) {
            logger.warn({ session_id: sessionId, error: heartbeatError.message }, 'Product pipeline heartbeat failed');
          }
        });
    }, HEARTBEAT_MS);
    heartbeatTimer.unref();

    const productConfig = config.buildProductConfig(input);
    const runtimeParams: RuntimeParams<TEvent> = {
      sessionId,
      userId: user.id,
      emit,
      waitForUser,
      input,
    };

    runProductPipeline(productConfig, runtimeParams).then(async () => {
      await supabaseAdmin
        .from('coach_sessions')
        .update({ pipeline_status: 'complete', pending_gate: null, pending_gate_data: null })
        .eq('id', sessionId);
      // Hook: onComplete — domain-specific success cleanup
      if (config.onComplete) {
        await config.onComplete(sessionId).catch((err) => {
          logger.warn({ session_id: sessionId, error: err instanceof Error ? err.message : String(err) }, 'onComplete hook failed');
        });
      }
      // Momentum: auto-log activity on pipeline completion
      if (config.momentumActivityType) {
        const { error: momentumErr } = await supabaseAdmin
          .from('user_momentum_activities')
          .insert({
            user_id: user.id,
            activity_type: config.momentumActivityType,
            related_id: sessionId,
            metadata: {},
          });
        if (momentumErr) {
          logger.warn({ session_id: sessionId, error: momentumErr.message }, 'Momentum activity log failed');
        }
      }
    }).catch(async (pipelineError) => {
      logger.error(
        { session_id: sessionId, error: pipelineError instanceof Error ? pipelineError.message : String(pipelineError) },
        'Product pipeline failed',
      );
      await supabaseAdmin
        .from('coach_sessions')
        .update({ pipeline_status: 'error', pending_gate: null, pending_gate_data: null })
        .eq('id', sessionId);
      // Hook: onError — domain-specific failure cleanup
      if (config.onError) {
        await config.onError(sessionId, pipelineError).catch((err) => {
          logger.warn({ session_id: sessionId, error: err instanceof Error ? err.message : String(err) }, 'onError hook failed');
        });
      }
    }).finally(() => {
      clearInterval(heartbeatTimer);
      runningProductPipelines.delete(sessionId);
      void clearPendingGate(sessionId);
    });

    return c.json({ status: 'started', session_id: sessionId });
  });

  // ── POST /respond ───────────────────────────────────────────────
  router.post('/respond', rateLimitMiddleware(30, 60_000), async (c) => {
    if (config.isEnabled && !config.isEnabled()) {
      return c.json({ error: 'feature_not_enabled', message: 'This feature is not currently enabled' }, 403);
    }

    const parsedBody = await parseJsonBodyWithLimit(c, maxRespondBytes);
    if (!parsedBody.ok) return parsedBody.response;

    const user = c.get('user');
    const parsed = respondSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400);
    }

    const { session_id, gate } = parsed.data;

    // Verify session belongs to user
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('coach_sessions')
      .select('id, user_id')
      .eq('id', session_id)
      .eq('user_id', user.id)
      .single();

    if (sessionError || !session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    const dbState = await getPipelineState(session_id);
    if (!dbState) {
      return c.json({ error: 'Session not found' }, 404);
    }

    if (dbState.pipeline_status !== 'running') {
      return new Response(
        JSON.stringify({ error: 'Pipeline is not running for this session' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '2',
          },
        },
      );
    }

    // Hook: onBeforeRespond — domain-specific pre-respond validation (stale detection, etc.)
    if (config.onBeforeRespond) {
      const hookResult = await config.onBeforeRespond(session_id, gate, parsed.data.response, dbState, c);
      if (hookResult instanceof Response) return hookResult;
    }

    const hasExplicitResponse = Object.prototype.hasOwnProperty.call(parsed.data, 'response');
    const normalizedResponse = hasExplicitResponse ? parsed.data.response : undefined;
    if (!hasExplicitResponse) {
      return c.json({ error: 'Missing response payload' }, 400);
    }

    if (dbState.pending_gate) {
      if (gate && dbState.pending_gate !== gate) {
        return c.json({ error: `Expected gate '${dbState.pending_gate}', got '${gate}'` }, 400);
      }

      const currentPayload = parsePendingGatePayload(dbState.pending_gate_data);
      if (currentPayload.responded_at) {
        return c.json({ status: 'already_responded', gate: dbState.pending_gate });
      }

      const payload: PendingGatePayload = {
        ...currentPayload,
        gate: dbState.pending_gate,
        response: normalizedResponse,
        response_gate: dbState.pending_gate,
        responded_at: new Date().toISOString(),
      };

      const { error: persistError } = await supabaseAdmin
        .from('coach_sessions')
        .update({ pending_gate_data: payload })
        .eq('id', session_id)
        .eq('pending_gate', dbState.pending_gate);

      if (persistError) {
        return c.json({ error: 'Failed to persist gate response' }, 500);
      }

      // Hook: onRespond — domain-specific post-response processing
      if (config.onRespond) {
        void config.onRespond(session_id, dbState.pending_gate, normalizedResponse, dbState).catch((err) => {
          logger.warn({ session_id, gate: dbState.pending_gate, error: err instanceof Error ? err.message : String(err) }, 'onRespond hook failed');
        });
      }

      return c.json({ status: 'ok', gate: dbState.pending_gate });
    }

    // No pending gate — buffer the response
    if (gate) {
      const currentPayload = parsePendingGatePayload(dbState.pending_gate_data);
      const queue = getResponseQueue(currentPayload).filter((item) => item.gate !== gate);
      queue.push({
        gate,
        response: normalizedResponse,
        responded_at: new Date().toISOString(),
      });
      const payload = withResponseQueue(currentPayload, queue);
      const { error: bufferError } = await supabaseAdmin
        .from('coach_sessions')
        .update({ pending_gate_data: payload })
        .eq('id', session_id);
      if (bufferError) {
        return c.json({ error: 'Failed to buffer gate response' }, 500);
      }

      // Hook: onRespond — also called for buffered responses
      if (config.onRespond) {
        void config.onRespond(session_id, gate, normalizedResponse, dbState).catch((err) => {
          logger.warn({ session_id, gate, error: err instanceof Error ? err.message : String(err) }, 'onRespond hook failed (buffered)');
        });
      }

      return c.json({ status: 'buffered', gate });
    }

    return new Response(
      JSON.stringify({ error: 'No pending gate for this session — pipeline may not have reached a gate yet' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '1',
        },
      },
    );
  });

  // ── GET /:sessionId/stream ─────────────────────────────────────
  router.get('/:sessionId/stream', async (c) => {
    if (config.isEnabled && !config.isEnabled()) {
      return c.json({ error: 'feature_not_enabled', message: 'This feature is not currently enabled' }, 403);
    }

    const sessionId = c.req.param('sessionId');
    const user = c.get('user');

    // Verify session belongs to user
    const { data: session, error } = await supabaseAdmin
      .from('coach_sessions')
      .select('id, user_id')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (error || !session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    return streamSSE(c, async (stream) => {
      let connectionClosed = false;
      const emitter = (event: BaseEvent) => {
        if (connectionClosed) return;
        void stream.writeSSE({
          event: (event as Record<string, unknown>).type as string,
          data: JSON.stringify(event),
        }).catch(() => {
          connectionClosed = true;
          removeSSEConnection(sessionId, user.id, emitter as never);
        });
      };

      addSSEConnection(sessionId, user.id, emitter as never);

      await stream.writeSSE({
        event: 'connected',
        data: JSON.stringify({ session_id: sessionId }),
      });

      // Heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        if (connectionClosed) {
          clearInterval(heartbeat);
          return;
        }
        void stream.writeSSE({ event: 'heartbeat', data: '' }).catch(() => {
          connectionClosed = true;
          clearInterval(heartbeat);
          removeSSEConnection(sessionId, user.id, emitter as never);
        });
      }, 30_000);

      stream.onAbort(() => {
        connectionClosed = true;
        clearInterval(heartbeat);
        removeSSEConnection(sessionId, user.id, emitter as never);
      });

      // Keep stream open until aborted
      await new Promise<void>((resolve) => {
        stream.onAbort(() => resolve());
      });
    });
  });

  return router;
}
