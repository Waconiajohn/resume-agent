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

export const v3Pipeline = new Hono();

const runSchema = z.object({
  resume_text: z.string().min(50).max(200_000),
  job_description: z.string().min(50).max(50_000),
  jd_title: z.string().max(300).optional(),
  jd_company: z.string().max(200).optional(),
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

  const { resume_text, job_description, jd_title, jd_company } = parsed.data;
  const sessionId = randomUUID();

  logger.info({ sessionId, userId, resumeChars: resume_text.length, jdChars: job_description.length }, 'v3 pipeline start');

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
        resumeText: resume_text,
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
