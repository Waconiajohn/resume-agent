/**
 * Resume v2 Pipeline Routes
 *
 * POST /start — Accepts resume_text + job_description, starts pipeline
 * GET /:sessionId/stream — SSE stream of pipeline events
 *
 * The v2 pipeline has no gates (no approval steps during generation).
 * The user sees results accumulate via SSE, then edits inline afterward.
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { sseConnections, addSSEConnection, removeSSEConnection, type AnySSEEvent } from './sessions.js';
import logger from '../lib/logger.js';
import { parseJsonBodyWithLimit } from '../lib/http-body-guard.js';
import { runV2Pipeline } from '../agents/resume-v2/orchestrator.js';
import type { V2PipelineSSEEvent } from '../agents/resume-v2/types.js';
import { llm } from '../lib/llm.js';
import { MODEL_MID, MODEL_LIGHT } from '../lib/model-constants.js';
import { repairJSON } from '../lib/json-repair.js';

const startSchema = z.object({
  resume_text: z.string().min(50, 'Resume must be at least 50 characters').max(50000, 'Resume must be at most 50,000 characters'),
  job_description: z.string().min(50, 'Job description must be at least 50 characters').max(50000, 'Job description must be at most 50,000 characters'),
  user_context: z.string().optional(),
});

const EDIT_ACTIONS = ['strengthen', 'add_metrics', 'shorten', 'add_keywords', 'rewrite', 'custom', 'not_my_voice'] as const;
type EditAction = typeof EDIT_ACTIONS[number];

const editSchema = z.object({
  action: z.enum(EDIT_ACTIONS),
  selected_text: z.string().min(5, 'Selected text must be at least 5 characters'),
  section: z.string().min(1, 'Section is required'),
  full_resume_context: z.string().min(1, 'Full resume context is required'),
  job_description: z.string().min(1, 'Job description is required'),
  custom_instruction: z.string().optional(),
});

export const resumeV2Pipeline = new Hono();

// ─── Metrics ─────────────────────────────────────────────────────────

let activePipelines = 0;
let totalStarted = 0;
let totalCompleted = 0;
let totalFailed = 0;

export function getV2PipelineRouteStats() {
  return { active_pipelines: activePipelines, total_started: totalStarted, total_completed: totalCompleted, total_failed: totalFailed };
}

// ─── POST /start ─────────────────────────────────────────────────────

resumeV2Pipeline.post('/start', authMiddleware, rateLimitMiddleware(10, 60_000), async (c) => {
  const user = c.get('user');
  const userId = user.id;

  const body = await parseJsonBodyWithLimit(c, 200_000);
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const { resume_text, job_description, user_context } = parsed.data;

  // Create session
  const { data: session, error: sessionError } = await supabaseAdmin
    .from('coach_sessions')
    .insert({
      user_id: userId,
      session_type: 'resume_v2',
      pipeline_status: 'running',
      pipeline_stage: 'intake',
    })
    .select('id')
    .single();

  if (sessionError || !session) {
    logger.error({ error: sessionError }, 'Failed to create v2 pipeline session');
    return c.json({ error: 'Failed to create session' }, 500);
  }

  const sessionId = session.id;

  // Start pipeline in background
  activePipelines++;
  totalStarted++;

  // Pipeline runs asynchronously — events are emitted to SSE connections
  void (async () => {
    try {
      // emitters is looked up on every emit so late-connecting clients receive events
      const emit = (event: V2PipelineSSEEvent) => {
        const emitters = sseConnections.get(sessionId);
        if (!emitters) return;
        for (const emitter of emitters) {
          try {
            // The SSE emitter expects the old PipelineSSEEvent type — cast through unknown
            (emitter as (e: unknown) => void)(event);
          } catch {
            // Emitter may have been closed
          }
        }
      };

      const result = await runV2Pipeline({
        resume_text,
        job_description,
        session_id: sessionId,
        user_id: userId,
        emit,
        user_context,
      });

      // Persist the final assembled result so clients can retrieve it on reconnect
      // via GET /:sessionId/result. Stored in tailored_sections (repurposed as
      // pipeline_result for v2 sessions) since it's an existing JSONB column.
      await supabaseAdmin
        .from('coach_sessions')
        .update({
          pipeline_status: 'complete',
          pipeline_stage: 'complete',
          tailored_sections: result.final_resume as unknown as Record<string, unknown>,
        })
        .eq('id', sessionId);

      totalCompleted++;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ session_id: sessionId, error: message }, 'v2 pipeline failed');

      await supabaseAdmin
        .from('coach_sessions')
        .update({ pipeline_status: 'error', error_message: message })
        .eq('id', sessionId);

      totalFailed++;
    } finally {
      activePipelines--;
    }
  })();

  return c.json({ session_id: sessionId, status: 'started' });
});

// ─── GET /:sessionId/stream ──────────────────────────────────────────

resumeV2Pipeline.get('/:sessionId/stream', authMiddleware, async (c) => {
  const user = c.get('user');
  const userId = user.id;
  const sessionId = c.req.param('sessionId');

  // Verify session belongs to user
  const { data: session } = await supabaseAdmin
    .from('coach_sessions')
    .select('id, user_id, pipeline_status')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  return streamSSE(c, async (stream) => {
    const emitter = (event: unknown) => {
      void stream.writeSSE({
        data: JSON.stringify(event),
        event: 'pipeline',
      });
    };

    // Type boundary: V2PipelineSSEEvent is a different union from the legacy AnySSEEvent.
    // The emitter itself is typed as (event: unknown) — the cast is safe here.
    addSSEConnection(sessionId, userId, emitter as (event: AnySSEEvent) => void);

    // Keep-alive heartbeat
    const heartbeat = setInterval(() => {
      void stream.writeSSE({ data: '', event: 'heartbeat' });
    }, 30_000);

    try {
      // Hold the connection open until client disconnects
      await new Promise<void>((resolve) => {
        stream.onAbort(() => resolve());
      });
    } finally {
      clearInterval(heartbeat);
      removeSSEConnection(sessionId, userId, emitter as (event: AnySSEEvent) => void); // same type boundary as above
    }
  });
});

// ─── GET /:sessionId/result ──────────────────────────────────────────

resumeV2Pipeline.get('/:sessionId/result', authMiddleware, async (c) => {
  const user = c.get('user');
  const userId = user.id;
  const sessionId = c.req.param('sessionId');

  const { data: session } = await supabaseAdmin
    .from('coach_sessions')
    .select('id, user_id, pipeline_status, tailored_sections')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  if (session.pipeline_status !== 'complete') {
    return c.json({ error: 'Pipeline not yet complete', status: session.pipeline_status }, 409);
  }

  return c.json({ result: session.tailored_sections });
});

// ─── POST /:sessionId/edit ───────────────────────────────────────────

function buildEditSystemPrompt(action: EditAction, customInstruction?: string): string {
  const base = `You are an expert executive resume editor. You will receive a selected piece of resume text and must return an improved replacement.

You MUST respond with valid JSON in exactly this format:
{ "replacement": "<your improved text here>" }

Do not include any explanation, preamble, or markdown. Only return the JSON object.`;

  const instructions: Record<EditAction, string> = {
    strengthen: `Rewrite the selected text to be more impactful. Use stronger action verbs, sharper language, and executive-caliber voice. Eliminate weak qualifiers and passive constructions. Preserve all factual claims.`,
    add_metrics: `Enhance the selected text by adding or strengthening quantified results. Infer plausible numbers from the surrounding context where explicit figures are absent (e.g., team size, revenue, percentage improvements, timeframes). Every metric added must be defensible given the context.`,
    shorten: `Compress the selected text to its most essential form. Cut every word that does not carry meaning. Preserve all key accomplishments, metrics, and impact. The result should be tighter and punchier, not thinner.`,
    add_keywords: `Naturally incorporate relevant keywords from the job description into the selected text. The integration must read fluently — never keyword-stuffed. Prioritize keywords that reflect genuine overlap with the candidate's experience.`,
    rewrite: `Completely rewrite the selected text from scratch while preserving all underlying information, accomplishments, and meaning. Aim for cleaner structure, stronger language, and greater readability.`,
    custom: `Follow this instruction exactly: ${customInstruction ?? '(no instruction provided)'}`,
    not_my_voice: `Rewrite the selected text to sound more authentic and human. Strip out corporate jargon, buzzwords, and formulaic resume-speak. The revised text should sound like how this specific professional actually talks about their work — direct, specific, and genuine.`,
  };

  return `${base}\n\n${instructions[action]}`;
}

resumeV2Pipeline.post('/:sessionId/edit', authMiddleware, rateLimitMiddleware(30, 60_000), async (c) => {
  const user = c.get('user');
  const userId = user.id;
  const sessionId = c.req.param('sessionId');

  // Verify session belongs to user
  const { data: session } = await supabaseAdmin
    .from('coach_sessions')
    .select('id, user_id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const body = await parseJsonBodyWithLimit(c, 50_000);
  const parsed = editSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const { action, selected_text, section, full_resume_context, job_description, custom_instruction } = parsed.data;

  logger.info({ session_id: sessionId, user_id: userId, action, section }, 'Inline resume edit requested');

  const systemPrompt = buildEditSystemPrompt(action, custom_instruction);

  const userMessage = [
    `SECTION: ${section}`,
    '',
    `SELECTED TEXT TO EDIT:`,
    selected_text,
    '',
    `FULL RESUME CONTEXT:`,
    full_resume_context,
    '',
    `JOB DESCRIPTION (for keyword and requirement awareness):`,
    job_description,
  ].join('\n');

  try {
    const response = await llm.chat({
      model: MODEL_MID,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 1024,
    });

    const parsed_response = repairJSON<{ replacement: string }>(response.text);

    let replacement: string;
    if (parsed_response?.replacement) {
      replacement = parsed_response.replacement;
    } else {
      // Fall back to raw text, stripping any markdown code fences
      replacement = response.text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    }

    logger.info({ session_id: sessionId, action, section }, 'Inline resume edit completed');

    return c.json({ replacement });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ session_id: sessionId, action, error: message }, 'Inline resume edit failed');
    return c.json({ error: 'Edit failed', message }, 500);
  }
});

// ─── POST /:sessionId/rescore ─────────────────────────────────────

const rescoreSchema = z.object({
  resume_text: z.string().min(50, 'Resume text is required'),
  job_description: z.string().min(50, 'Job description is required'),
});

resumeV2Pipeline.post('/:sessionId/rescore', authMiddleware, rateLimitMiddleware(20, 60_000), async (c) => {
  const user = c.get('user');
  const userId = user.id;
  const sessionId = c.req.param('sessionId');

  const { data: session } = await supabaseAdmin
    .from('coach_sessions')
    .select('id, user_id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const body = await parseJsonBodyWithLimit(c, 200_000);
  const parsed = rescoreSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const { resume_text, job_description } = parsed.data;

  try {
    const response = await llm.chat({
      model: MODEL_LIGHT,
      system: `You are an ATS scoring specialist. Score how well a resume matches a job description.

Return valid JSON only:
{
  "ats_score": 82,
  "keywords_found": ["keyword1", "keyword2"],
  "keywords_missing": ["keyword3"],
  "top_suggestions": ["Add X to Y section", "Include Z in competencies"]
}

RULES:
- ats_score = (keywords_found / total_important_keywords) × 100
- Only count must-have and important keywords, not nice-to-haves
- top_suggestions: max 3, most impactful improvements`,
      messages: [{
        role: 'user',
        content: `RESUME:\n${resume_text}\n\nJOB DESCRIPTION:\n${job_description}\n\nScore the ATS match.`,
      }],
      max_tokens: 2048,
    });

    const result = repairJSON<{
      ats_score: number;
      keywords_found: string[];
      keywords_missing: string[];
      top_suggestions: string[];
    }>(response.text);

    if (!result) {
      return c.json({ error: 'Scoring failed — unparseable response' }, 500);
    }

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ session_id: sessionId, error: message }, 'ATS rescore failed');
    return c.json({ error: 'Rescore failed', message }, 500);
  }
});
