import { Hono } from 'hono';
import { supabaseAdmin } from '../lib/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { sseConnections } from './sessions.js';
import { runPipeline } from '../agents/pipeline.js';
import type { PipelineSSEEvent } from '../agents/types.js';
import logger, { createSessionLogger } from '../lib/logger.js';

const pipeline = new Hono();
pipeline.use('*', authMiddleware);

// In-memory gate resolvers per session
const pendingGates = new Map<string, {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  gate: string;
  timeout: ReturnType<typeof setTimeout>;
}>();

// Buffered responses for gates that arrive before waitForUser is called (race condition fix)
const bufferedResponses = new Map<string, { gate: string; response: unknown }>();

// Track running pipelines to prevent double-start
const runningPipelines = new Set<string>();

// POST /pipeline/start
// Body: { session_id, raw_resume_text, job_description, company_name }
pipeline.post('/start', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { session_id, raw_resume_text, job_description, company_name } = body;

  // Validate inputs
  if (!session_id || !raw_resume_text || !job_description || !company_name) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  // Verify session belongs to user
  const { data: session, error } = await supabaseAdmin
    .from('coach_sessions')
    .select('id, user_id, status')
    .eq('id', session_id)
    .eq('user_id', user.id)
    .single();

  if (error || !session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  // Prevent double-start
  if (runningPipelines.has(session_id)) {
    return c.json({ error: 'Pipeline already running' }, 409);
  }

  runningPipelines.add(session_id);

  // Create emit function that bridges to SSE
  const emit = (event: PipelineSSEEvent) => {
    const emitters = sseConnections.get(session_id);
    if (emitters) {
      for (const emitter of emitters) {
        try { emitter(event as never); } catch { /* closed */ }
      }
    }
  };

  // Create waitForUser function
  const GATE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

  const waitForUser = <T>(gate: string): Promise<T> => {
    // Check if a response was already buffered (user responded before gate was registered)
    const buffered = bufferedResponses.get(session_id);
    if (buffered && buffered.gate === gate) {
      bufferedResponses.delete(session_id);
      log.info({ gate }, 'Resolved gate from buffered response');
      return Promise.resolve(buffered.response as T);
    }

    return new Promise<T>((resolve, reject) => {
      // Clear any existing gate for this session
      const existing = pendingGates.get(session_id);
      if (existing) {
        clearTimeout(existing.timeout);
        existing.reject(new Error('Gate superseded'));
      }

      const timeout = setTimeout(() => {
        pendingGates.delete(session_id);
        reject(new Error(`Gate '${gate}' timed out after ${GATE_TIMEOUT_MS}ms`));
      }, GATE_TIMEOUT_MS);

      pendingGates.set(session_id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        gate,
        timeout,
      });
    });
  };

  // Start pipeline in background (fire-and-forget)
  const log = createSessionLogger(session_id);

  runPipeline({
    session_id,
    user_id: user.id,
    raw_resume_text,
    job_description,
    company_name,
    emit,
    waitForUser,
  }).then((state) => {
    log.info({ stage: state.current_stage, revision_count: state.revision_count }, 'Pipeline completed');
  }).catch((error) => {
    log.error({ error: error instanceof Error ? error.message : error }, 'Pipeline failed');
    emit({ type: 'pipeline_error', stage: 'intake', error: error instanceof Error ? error.message : 'Pipeline failed' });
  }).finally(() => {
    runningPipelines.delete(session_id);
    // Clean up any lingering gate
    const gate = pendingGates.get(session_id);
    if (gate) {
      clearTimeout(gate.timeout);
      pendingGates.delete(session_id);
    }
    bufferedResponses.delete(session_id);
  });

  return c.json({ status: 'started', session_id });
});

// POST /pipeline/respond
// Body: { session_id, gate, response }
pipeline.post('/respond', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { session_id, gate, response } = body;

  if (!session_id) {
    return c.json({ error: 'Missing session_id' }, 400);
  }

  // Verify session belongs to user
  const { data: session, error } = await supabaseAdmin
    .from('coach_sessions')
    .select('id, user_id')
    .eq('id', session_id)
    .eq('user_id', user.id)
    .single();

  if (error || !session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const pending = pendingGates.get(session_id);
  if (!pending) {
    // Gate not registered yet — buffer the response for when waitForUser is called
    if (gate) {
      bufferedResponses.set(session_id, { gate, response });
      logger.info({ session_id, gate }, 'Buffered early gate response');
      return c.json({ status: 'buffered', gate });
    }
    return c.json({ error: 'No pending gate for this session' }, 404);
  }

  // Optional: verify gate name matches
  if (gate && pending.gate !== gate) {
    return c.json({ error: `Expected gate '${pending.gate}', got '${gate}'` }, 400);
  }

  // Resolve the gate
  clearTimeout(pending.timeout);
  pending.resolve(response);
  pendingGates.delete(session_id);

  return c.json({ status: 'ok', gate: pending.gate });
});

// GET /pipeline/status
// Returns whether a pipeline is running and what gate is pending
pipeline.get('/status', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.query('session_id');

  if (!sessionId) {
    return c.json({ error: 'Missing session_id' }, 400);
  }

  // Verify session belongs to user
  const { data: session } = await supabaseAdmin
    .from('coach_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const running = runningPipelines.has(sessionId);
  const pending = pendingGates.get(sessionId);

  return c.json({
    running,
    pending_gate: pending?.gate ?? null,
  });
});

export { pipeline, pendingGates, runningPipelines };
