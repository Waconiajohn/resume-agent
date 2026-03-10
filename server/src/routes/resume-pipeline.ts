/**
 * Resume Pipeline Routes — Wires the resume product into the generic route factory.
 *
 * Replaces the monolithic routes/pipeline.ts (1,985 lines) with a thin config
 * that plugs resume-specific hooks (Stories 3-5) into createProductRoutes().
 *
 * Mounted at /api/pipeline in index.ts.
 */

import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { subscriptionGuard } from '../middleware/subscription-guard.js';
import { createProductRoutes, STALE_PIPELINE_MS } from './product-route-factory.js';
import { createResumeProductConfig } from '../agents/resume/product.js';
import {
  createResumeEventMiddleware,
  flushAllQueuedPanelPersists,
  type ResumeEventMiddleware,
} from '../agents/resume/event-middleware.js';
import {
  resumeBeforeStart,
  resumeTransformInput,
  resumeOnRespond,
  registerRunningPipeline,
  unregisterRunningPipeline,
  handleStalePipelineOnRespond,
  getPipelineRouteStats,
} from '../agents/resume/route-hooks.js';
import type { PipelineState, PipelineSSEEvent } from '../agents/types.js';

// ─── Zod schema for POST /start ──────────────────────────────────────

const startSchema = z.object({
  session_id: z.string().uuid(),
  raw_resume_text: z.string().min(50).max(100_000),
  job_description: z.string().min(1).max(50_000),
  company_name: z.string().min(1).max(200),
  workflow_mode: z.enum(['fast_draft', 'balanced', 'deep_dive']).optional(),
  minimum_evidence_target: z.number().int().min(3).max(20).optional(),
  resume_priority: z.enum(['authentic', 'ats', 'impact', 'balanced']).optional(),
  seniority_delta: z.enum(['same', 'one_up', 'big_jump', 'step_back']).optional(),
});

// ─── Per-session event middleware registry ────────────────────────────

const sessionMiddleware = new Map<string, ResumeEventMiddleware>();

function cleanupSession(sessionId: string): void {
  const mw = sessionMiddleware.get(sessionId);
  if (mw) {
    mw.dispose();
    sessionMiddleware.delete(sessionId);
  }
  unregisterRunningPipeline(sessionId);
}

// ─── Route factory wiring ────────────────────────────────────────────

const pipeline = createProductRoutes<PipelineState, PipelineSSEEvent>({
  startSchema,
  buildProductConfig: createResumeProductConfig,

  maxStartBodyBytes: 220_000,

  startMiddleware: [subscriptionGuard],

  onBeforeStart: async (input, c, session) => {
    const result = await resumeBeforeStart(input, c, session);
    if (result) return result;

    // Create per-session event middleware (uses _pipeline_run_started_at set by resumeBeforeStart)
    const sessionId = input.session_id as string;
    const startedAt = typeof input._pipeline_run_started_at === 'string'
      ? input._pipeline_run_started_at
      : undefined;
    const mw = createResumeEventMiddleware(sessionId, startedAt);
    sessionMiddleware.set(sessionId, mw);

    // Register in the resume-level running pipeline guard
    registerRunningPipeline(sessionId);
  },

  transformInput: resumeTransformInput,

  onEvent: (event, sessionId) => {
    const mw = sessionMiddleware.get(sessionId);
    if (mw) return mw.onEvent(event, sessionId);
  },

  onBeforeRespond: async (sessionId, _gate, _response, dbState, c) => {
    // Stale pipeline detection — if updated_at is too old, reset and notify
    const updatedAtMs = Date.parse(dbState.updated_at ?? '');
    const staleRunning = Number.isFinite(updatedAtMs) && (Date.now() - updatedAtMs > STALE_PIPELINE_MS);
    if (staleRunning) {
      await handleStalePipelineOnRespond(sessionId, dbState);
      return new Response(
        JSON.stringify({
          error: 'Pipeline state became stale after a server restart. Please restart the pipeline from this session.',
          code: 'STALE_PIPELINE',
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      );
    }
  },

  onRespond: resumeOnRespond,

  onComplete: async (sessionId) => {
    const mw = sessionMiddleware.get(sessionId);
    if (mw) {
      await mw.onComplete(sessionId);
    }
    cleanupSession(sessionId);
  },

  onError: async (sessionId, error) => {
    const mw = sessionMiddleware.get(sessionId);
    if (mw) {
      await mw.onError(sessionId, error);
    }
    cleanupSession(sessionId);
  },

  momentumActivityType: 'resume_completed',
});

// ─── GET /status — pipeline status endpoint ──────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

pipeline.get('/status', rateLimitMiddleware(180, 60_000), async (c) => {
  const user = c.get('user');
  const sessionId = c.req.query('session_id');

  if (!sessionId) {
    return c.json({ error: 'Missing session_id' }, 400);
  }

  if (!UUID_RE.test(sessionId.trim())) {
    return c.json({ error: 'Invalid session_id' }, 400);
  }

  const { data: dbSession } = await supabaseAdmin
    .from('coach_sessions')
    .select('id, pipeline_status, pipeline_stage, pending_gate, updated_at')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single();

  if (!dbSession) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const running = dbSession.pipeline_status === 'running';
  const pendingGate = dbSession.pending_gate ?? null;
  const updatedAtMs = Date.parse(dbSession.updated_at ?? '');
  const stalePipeline = running && Number.isFinite(updatedAtMs) && (Date.now() - updatedAtMs > STALE_PIPELINE_MS);

  return c.json({
    running,
    pending_gate: pendingGate,
    stale_pipeline: stalePipeline,
    pipeline_stage: dbSession.pipeline_stage ?? null,
  });
});

export { pipeline, getPipelineRouteStats, flushAllQueuedPanelPersists, STALE_PIPELINE_MS };
