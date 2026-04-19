/**
 * V3 Resume Pipeline Routes
 *
 * POST /run — streaming SSE response. Accepts { resume_text, job_description,
 * jd_title?, jd_company? } and streams V3PipelineSSEEvent events as each
 * stage completes.
 *
 * Stateless by design (Phase A) — no session_id, no DB row, no
 * fire-and-forget. The user's fetch() reads the stream; disconnect = cancel.
 * Phase B can add persistence once the frontend is stable.
 *
 * Deliberately simpler than v2's POST /start + GET /:id/stream pattern.
 * v3 is a one-shot call; the UI just POSTs and renders.
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { parseJsonBodyWithLimit } from '../lib/http-body-guard.js';
import logger from '../lib/logger.js';
import { randomUUID } from 'node:crypto';
import { runV3Pipeline } from '../v3/pipeline/run.js';
import type { V3PipelineSSEEvent } from '../v3/pipeline/types.js';
import { fetchDefaultMaster, fetchMasterSummary } from '../v3/master/load.js';
import { promoteToMaster } from '../v3/master/promote.js';

export const v3Pipeline = new Hono();

const runSchema = z.object({
  // Optional: when omitted, the server loads the user's default master
  // resume's raw_text. Caller sets `use_master: true` to make intent
  // explicit (prevents silently running on a stale master if the user
  // thought they were pasting fresh text).
  resume_text: z.string().min(50).max(200_000).optional(),
  use_master: z.boolean().optional(),
  job_description: z.string().min(50).max(50_000),
  jd_title: z.string().max(300).optional(),
  jd_company: z.string().max(200).optional(),
}).refine(
  (d) => (d.use_master === true) || (typeof d.resume_text === 'string' && d.resume_text.length >= 50),
  { message: 'Either resume_text (min 50 chars) or use_master=true is required.' },
);

// ─── GET /api/v3-pipeline/master ─────────────────────────────────────
// Returns the user's default master-resume summary, or 404 if none.
// The intake form uses this to show "using your master resume" when the
// returning user hits /resume-v3 and doesn't need to paste a resume again.
v3Pipeline.get('/master', authMiddleware, async (c) => {
  const user = c.get('user');
  try {
    const summary = await fetchMasterSummary(user.id);
    if (!summary) return c.json({ master: null }, 404);
    return c.json({ master: summary });
  } catch (err) {
    logger.error(
      { userId: user.id, err: err instanceof Error ? err.message : String(err) },
      'GET /v3-pipeline/master failed',
    );
    return c.json({ error: 'Failed to load master resume' }, 500);
  }
});

// ─── POST /api/v3-pipeline/promote ───────────────────────────────────
// Apply the user's curated promotion selections to their master resume.
// Creates a new master_resumes version via create_master_resume_atomic.
const promoteBulletSchema = z.object({
  positionIndex: z.number().int().min(0),
  text: z.string().min(3).max(2000),
  source: z.enum(['crafted', 'upgraded']),
});
const promoteScopeSchema = z.object({
  positionIndex: z.number().int().min(0),
  text: z.string().min(3).max(1000),
});
const promoteSummarySchema = z.object({
  text: z.string().min(20).max(5000),
});
const promoteEvidenceSchema = z.object({
  text: z.string().min(3).max(2000),
  category: z.string().max(100).optional(),
});
const promoteBodySchema = z.object({
  source_session_id: z.string().uuid(),
  summary: promoteSummarySchema.optional(),
  scopes: z.array(promoteScopeSchema).max(50).optional(),
  bullets: z.array(promoteBulletSchema).max(200).optional(),
  evidence: z.array(promoteEvidenceSchema).max(100).optional(),
});

v3Pipeline.post('/promote', authMiddleware, rateLimitMiddleware(20, 60_000), async (c) => {
  const user = c.get('user');
  const parsedBody = await parseJsonBodyWithLimit(c, 300_000);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = promoteBodySchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);
  }

  try {
    const result = await promoteToMaster({
      userId: user.id,
      sourceSessionId: parsed.data.source_session_id,
      summary: parsed.data.summary,
      scopes: parsed.data.scopes,
      bullets: parsed.data.bullets,
      evidence: parsed.data.evidence,
    });
    if (!result.ok) return c.json({ error: result.error ?? 'Promote failed' }, 400);
    return c.json({ ok: true, new_version: result.new_version });
  } catch (err) {
    logger.error(
      { userId: user.id, err: err instanceof Error ? err.message : String(err) },
      'POST /v3-pipeline/promote failed',
    );
    return c.json({ error: 'Promote failed' }, 500);
  }
});

v3Pipeline.post('/run', authMiddleware, rateLimitMiddleware(10, 60_000), async (c) => {
  const user = c.get('user');
  const userId = user.id;

  const parsedBody = await parseJsonBodyWithLimit(c, 300_000);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = runSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const { resume_text: providedResumeText, use_master, job_description, jd_title, jd_company } = parsed.data;
  const sessionId = randomUUID();

  // Resolve resume_text: prefer what the caller pasted; else load from the
  // user's default master. The schema refinement above guarantees at least
  // one is present, but we still guard in case the master has since been
  // deleted between the UI's check and the POST.
  let resumeText: string;
  if (typeof providedResumeText === 'string' && providedResumeText.length >= 50) {
    resumeText = providedResumeText;
  } else if (use_master) {
    const master = await fetchDefaultMaster(userId);
    if (!master || !master.raw_text || master.raw_text.trim().length < 50) {
      return c.json({
        error: 'No master resume available. Paste a resume to continue.',
      }, 400);
    }
    resumeText = master.raw_text;
  } else {
    return c.json({ error: 'Invalid input: resume_text or use_master required' }, 400);
  }

  logger.info({ sessionId, userId, resumeChars: resumeText.length, jdChars: job_description.length, source: use_master ? 'master' : 'paste' }, 'v3 pipeline start');

  // AbortController tied to the SSE stream — if the client disconnects,
  // we cancel in-flight LLM calls rather than burning them.
  const abortController = new AbortController();

  return streamSSE(c, async (stream) => {
    stream.onAbort(() => {
      abortController.abort();
      logger.info({ sessionId }, 'v3 pipeline client aborted');
    });

    const emit = (event: V3PipelineSSEEvent): void => {
      // streamSSE.writeSSE serializes as `event: <type>\ndata: <json>\n\n`.
      // We set event to the union discriminator so clients can addEventListener
      // by type if they want, but most will parse data in a single handler.
      void stream.writeSSE({
        event: event.type,
        data: JSON.stringify(event),
      });
    };

    try {
      await runV3Pipeline({
        sessionId,
        userId,
        resumeText,
        jobDescription: {
          text: job_description,
          title: jd_title,
          company: jd_company,
        },
        emit,
        signal: abortController.signal,
      });
    } catch (err) {
      // runV3Pipeline itself never throws (reports errors via pipeline_error
      // events) — this catch exists to guard against unexpected bugs.
      logger.error(
        { sessionId, err: err instanceof Error ? err.message : String(err) },
        'v3 pipeline unexpected throw',
      );
      emit({
        type: 'pipeline_error',
        stage: 'extract',
        message: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });
    }

    // Signal end-of-stream so the client's stream reader completes cleanly.
    await stream.close();
  });
});
