import { Hono } from 'hono';
import { z } from 'zod';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { supabaseAdmin } from '../lib/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { sseConnections } from './sessions.js';
import { runPipeline } from '../agents/pipeline.js';
import type { PipelineSSEEvent, PipelineStage } from '../agents/types.js';
import logger, { createSessionLogger } from '../lib/logger.js';

const startSchema = z.object({
  session_id: z.string().uuid(),
  raw_resume_text: z.string().min(50).max(100_000),
  job_description: z.string().min(1).max(50_000),
  company_name: z.string().min(1).max(200),
});

const respondSchema = z.object({
  session_id: z.string().uuid(),
  gate: z.string().min(1).max(100).optional(),
  response: z.unknown(),
});

const pipeline = new Hono();
pipeline.use('*', authMiddleware);

async function setPendingGate(sessionId: string, gate: string, data?: Record<string, unknown>) {
  const { error } = await supabaseAdmin
    .from('coach_sessions')
    .update({
      pending_gate: gate,
      pending_gate_data: data ?? null,
    })
    .eq('id', sessionId);
  if (error) {
    logger.warn({ session_id: sessionId, gate, error: error.message }, 'Failed to persist pending gate');
  }
}

async function clearPendingGate(sessionId: string) {
  const { error } = await supabaseAdmin
    .from('coach_sessions')
    .update({
      pending_gate: null,
      pending_gate_data: null,
    })
    .eq('id', sessionId);
  if (error) {
    logger.warn({ session_id: sessionId, error: error.message }, 'Failed to clear pending gate');
  }
}

const PANEL_PERSIST_DEBOUNCE_MS = 250;
const queuedPanelPersists = new Map<string, {
  panelType: string;
  panelData: unknown;
  timeout: ReturnType<typeof setTimeout>;
}>();

async function persistLastPanelState(sessionId: string, panelType: string, panelData: unknown) {
  const { error } = await supabaseAdmin
    .from('coach_sessions')
    .update({
      last_panel_type: panelType,
      last_panel_data: panelData,
    })
    .eq('id', sessionId);
  if (error) {
    logger.warn(
      { session_id: sessionId, panel_type: panelType, error: error.message },
      'Failed to persist last panel state',
    );
  }
}

function cancelQueuedPanelPersist(sessionId: string) {
  const queued = queuedPanelPersists.get(sessionId);
  if (!queued) return;
  clearTimeout(queued.timeout);
  queuedPanelPersists.delete(sessionId);
}

function queuePanelPersist(sessionId: string, panelType: string, panelData: unknown) {
  cancelQueuedPanelPersist(sessionId);
  const timeout = setTimeout(() => {
    queuedPanelPersists.delete(sessionId);
    void persistLastPanelState(sessionId, panelType, panelData);
  }, PANEL_PERSIST_DEBOUNCE_MS);
  queuedPanelPersists.set(sessionId, { panelType, panelData, timeout });
}

async function flushQueuedPanelPersist(sessionId: string) {
  const queued = queuedPanelPersists.get(sessionId);
  if (!queued) return;
  clearTimeout(queued.timeout);
  queuedPanelPersists.delete(sessionId);
  await persistLastPanelState(sessionId, queued.panelType, queued.panelData);
}

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

const JOB_URL_PATTERN = /^https?:\/\/\S+$/i;
const MAX_JOB_URL_REDIRECTS = 3;
const MAX_JOB_FETCH_BYTES = 2_000_000; // 2MB safety cap to avoid oversized pages
const PIPELINE_STAGES: PipelineStage[] = [
  'intake',
  'research',
  'positioning',
  'gap_analysis',
  'architect',
  'architect_review',
  'section_writing',
  'section_review',
  'quality_review',
  'revision',
  'complete',
];

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;

  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local / metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.trim().toLowerCase();
  if (!normalized) return true;

  if (normalized === '::' || normalized === '::1') return true; // unspecified / loopback
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.replace(/^::ffff:/, '');
    return isPrivateIPv4(mapped);
  }

  // Unique local addresses (fc00::/7)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  // Link-local addresses (fe80::/10)
  if (/^fe[89ab]/.test(normalized)) return true;
  return false;
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;

  const ipVersion = isIP(host);
  if (ipVersion === 4) return isPrivateIPv4(host);
  if (ipVersion === 6) return isPrivateIPv6(host);
  return false;
}

async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.trim().toLowerCase();
  if (isPrivateHost(host)) {
    throw new Error('This URL host is not allowed. Please paste the job description text directly.');
  }

  // Validate DNS target addresses to reduce SSRF via public hostname -> private IP.
  if (isIP(host) === 0) {
    let ips: Array<{ address: string }> = [];
    try {
      const resolved = await lookup(host, { all: true, verbatim: true });
      ips = Array.isArray(resolved) ? resolved : [resolved];
    } catch {
      throw new Error('Unable to resolve job URL host. Please paste the job description text directly.');
    }

    if (ips.length === 0) {
      throw new Error('Unable to resolve job URL host. Please paste the job description text directly.');
    }
    for (const record of ips) {
      if (isPrivateHost(record.address)) {
        throw new Error('This URL host is not allowed. Please paste the job description text directly.');
      }
    }
  }
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function extractVisibleTextFromHtml(html: string): string {
  const noScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  const withLineBreaks = noScripts.replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|br|tr|td)>/gi, '\n');
  const withoutTags = withLineBreaks.replace(/<[^>]+>/g, ' ');
  return decodeHtmlEntities(withoutTags).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

async function resolveJobDescriptionInput(input: string): Promise<string> {
  const trimmed = input.trim();
  if (!JOB_URL_PATTERN.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Invalid job URL. Please paste full job description text or a valid URL.');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http/https job URLs are supported.');
  }
  let currentUrl = url;

  for (let redirects = 0; redirects <= MAX_JOB_URL_REDIRECTS; redirects += 1) {
    await assertPublicHost(currentUrl.hostname);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const res = await fetch(currentUrl.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'Resume-Agent/1.0 (+job-description-fetch)',
          Accept: 'text/html, text/plain;q=0.9, */*;q=0.1',
        },
        redirect: 'manual',
        signal: controller.signal,
      });

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        if (redirects >= MAX_JOB_URL_REDIRECTS) {
          throw new Error('Job URL redirected too many times. Please paste JD text directly.');
        }
        const location = res.headers.get('location');
        if (!location) {
          throw new Error('Job URL redirect did not include a location. Please paste JD text directly.');
        }
        let nextUrl: URL;
        try {
          nextUrl = new URL(location, currentUrl);
        } catch {
          throw new Error('Job URL redirect target is invalid. Please paste JD text directly.');
        }
        if (!['http:', 'https:'].includes(nextUrl.protocol)) {
          throw new Error('Job URL redirect uses an unsupported protocol.');
        }
        currentUrl = nextUrl;
        continue;
      }

      if (!res.ok) {
        throw new Error(`Failed to fetch job URL (${res.status}). Please paste JD text instead.`);
      }
      const contentLength = res.headers.get('content-length');
      if (contentLength) {
        const bytes = Number.parseInt(contentLength, 10);
        if (Number.isFinite(bytes) && bytes > MAX_JOB_FETCH_BYTES) {
          throw new Error('Job URL content is too large. Please paste the job description text directly.');
        }
      }
      const contentType = res.headers.get('content-type')?.toLowerCase() ?? '';
      const body = await res.text();
      if (body.length > MAX_JOB_FETCH_BYTES) {
        throw new Error('Job URL content is too large. Please paste the job description text directly.');
      }
      const text = contentType.includes('text/plain') ? body.trim() : extractVisibleTextFromHtml(body);
      if (text.length < 200) {
        throw new Error('Could not extract enough job description text from the URL. Please paste JD text directly.');
      }
      return text.slice(0, 50_000);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Fetching job URL timed out. Please paste the job description text directly.');
      }
      throw err instanceof Error ? err : new Error('Unable to fetch job URL. Please paste JD text directly.');
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error('Unable to fetch job URL. Please paste JD text directly.');
}

// POST /pipeline/start
// Body: { session_id, raw_resume_text, job_description, company_name }
pipeline.post('/start', rateLimitMiddleware(5, 60_000), async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400);
  }
  const { session_id, raw_resume_text, job_description, company_name } = parsed.data;
  let resolvedJobDescription = job_description.trim();
  try {
    resolvedJobDescription = await resolveJobDescriptionInput(job_description);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Invalid job description input' }, 400);
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

  // Prevent double-start (in-memory check)
  if (runningPipelines.has(session_id)) {
    return c.json({ error: 'Pipeline already running' }, 409);
  }

  // Prevent restarting a completed or errored pipeline after server restart
  // (runningPipelines is in-memory and empty after restart)
  if (session.status === 'completed') {
    return c.json({ error: 'Pipeline already completed for this session' }, 409);
  }
  const { data: pipelineCheck } = await supabaseAdmin
    .from('coach_sessions')
    .select('pipeline_status')
    .eq('id', session_id)
    .single();
  if (pipelineCheck?.pipeline_status === 'complete') {
    return c.json({ error: 'Pipeline already completed for this session' }, 409);
  }

  runningPipelines.add(session_id);

  // Persist pipeline status to DB
  await supabaseAdmin
    .from('coach_sessions')
    .update({ pipeline_status: 'running', pipeline_stage: 'intake' })
    .eq('id', session_id);

  // Create emit function that bridges to SSE
  const emit = (event: PipelineSSEEvent) => {
    if (event.type === 'stage_start') {
      void supabaseAdmin
        .from('coach_sessions')
        .update({ pipeline_stage: event.stage })
        .eq('id', session_id);
    }
    // Persist questionnaire events for session restore
    if (event.type === 'questionnaire') {
      queuePanelPersist(session_id, 'questionnaire', event);
    }
    // Persist right_panel_update events for session restore
    if (event.type === 'right_panel_update') {
      queuePanelPersist(session_id, event.panel_type, event.data);
    }
    // Persist section_draft as section_review panel for restore
    if (event.type === 'section_draft') {
      queuePanelPersist(session_id, 'section_review', {
        section: event.section,
        content: event.content,
      });
    }
    // Persist blueprint_ready for restore
    if (event.type === 'blueprint_ready') {
      queuePanelPersist(session_id, 'blueprint_review', event.blueprint);
    }
    // Persist final completion payload with precedence over queued intermediate panels
    if (event.type === 'pipeline_complete') {
      cancelQueuedPanelPersist(session_id);
      void persistLastPanelState(session_id, 'completion', { resume: event.resume });
    }
    if (event.type === 'pipeline_error') {
      cancelQueuedPanelPersist(session_id);
    }
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
      void clearPendingGate(session_id);
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
        void clearPendingGate(session_id);
        reject(new Error(`Gate '${gate}' timed out after ${GATE_TIMEOUT_MS}ms`));
      }, GATE_TIMEOUT_MS);

      pendingGates.set(session_id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        gate,
        timeout,
      });

      void setPendingGate(session_id, gate, {
        created_at: new Date().toISOString(),
      });
    });
  };

  // Start pipeline in background (fire-and-forget)
  const log = createSessionLogger(session_id);

  runPipeline({
    session_id,
    user_id: user.id,
    raw_resume_text,
    job_description: resolvedJobDescription,
    company_name,
    emit,
    waitForUser,
  }).then(async (state) => {
    log.info({ stage: state.current_stage, revision_count: state.revision_count }, 'Pipeline completed');
    await flushQueuedPanelPersist(session_id);
    await supabaseAdmin
      .from('coach_sessions')
      .update({ pipeline_status: 'complete', pending_gate: null, pending_gate_data: null })
      .eq('id', session_id);
  }).catch(async (error) => {
    log.error({ error: error instanceof Error ? error.message : error }, 'Pipeline failed');
    // Note: runPipeline already emits pipeline_error before re-throwing — do NOT emit a second one here.
    await flushQueuedPanelPersist(session_id);
    await supabaseAdmin
      .from('coach_sessions')
      .update({ pipeline_status: 'error', pending_gate: null, pending_gate_data: null })
      .eq('id', session_id);
  }).finally(() => {
    runningPipelines.delete(session_id);
    // Clean up any lingering gate
    const gate = pendingGates.get(session_id);
    if (gate) {
      clearTimeout(gate.timeout);
      pendingGates.delete(session_id);
    }
    bufferedResponses.delete(session_id);
    cancelQueuedPanelPersist(session_id);
    void clearPendingGate(session_id);
  });

  return c.json({ status: 'started', session_id });
});

// POST /pipeline/respond
// Body: { session_id, gate, response }
pipeline.post('/respond', rateLimitMiddleware(30, 60_000), async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const parsed = respondSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400);
  }
  const { session_id, gate, response } = parsed.data;

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
    const { data: dbState } = await supabaseAdmin
      .from('coach_sessions')
      .select('pipeline_status, pipeline_stage, pending_gate')
      .eq('id', session_id)
      .single();

    if (dbState?.pipeline_status === 'running' && dbState.pending_gate) {
      logger.warn(
        { session_id, pending_gate: dbState.pending_gate },
        'Detected stale pipeline state while resolving gate response',
      );
      // Process was likely restarted; clear stale running state so the session can be resumed.
      await supabaseAdmin
        .from('coach_sessions')
        .update({
          pipeline_status: 'error',
          pending_gate: null,
          pending_gate_data: null,
        })
        .eq('id', session_id);
      bufferedResponses.delete(session_id);
      const staleStage = PIPELINE_STAGES.includes(dbState.pipeline_stage as PipelineStage)
        ? (dbState.pipeline_stage as PipelineStage)
        : 'intake';
      const emitters = sseConnections.get(session_id);
      if (emitters) {
        for (const emitter of emitters) {
          try {
            emitter({
              type: 'pipeline_error',
              stage: staleStage,
              error: 'Pipeline state became stale after a server restart. Please restart the pipeline.',
            } as never);
          } catch {
            // Connection may already be closed.
          }
        }
      }
      return c.json({
        error: 'Pipeline state became stale after a server restart. Please restart the pipeline from this session.',
        code: 'STALE_PIPELINE',
        pending_gate: dbState.pending_gate,
      }, 409);
    }

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
  await clearPendingGate(session_id);

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
  const { data: dbSession } = await supabaseAdmin
    .from('coach_sessions')
    .select('pipeline_status, pipeline_stage, pending_gate')
    .eq('id', sessionId)
    .single();
  const persistedPendingGate = dbSession?.pending_gate ?? null;
  const stalePipeline = !running && dbSession?.pipeline_status === 'running';

  return c.json({
    running,
    pending_gate: pending?.gate ?? persistedPendingGate,
    stale_pipeline: stalePipeline,
    pipeline_stage: dbSession?.pipeline_stage ?? null,
  });
});

export { pipeline, pendingGates, runningPipelines };
