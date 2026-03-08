/**
 * Interview Debrief CRUD Routes — /api/interview-debriefs/*
 *
 * Deterministic Hono routes for post-interview debrief capture.
 * Stores structured interview notes compatible with the Thank You Note
 * agent's InterviewerContext shape.
 *
 * Feature-flagged via FF_INTERVIEW_DEBRIEF.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { FF_INTERVIEW_DEBRIEF } from '../lib/feature-flags.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const interviewDebriefRoutes = new Hono();

// Auth required for all routes
interviewDebriefRoutes.use('*', authMiddleware);

// Feature flag guard
interviewDebriefRoutes.use('*', async (c, next) => {
  if (!FF_INTERVIEW_DEBRIEF) {
    return c.json({ error: 'Not found' }, 404);
  }
  await next();
});

// ─── Schemas ──────────────────────────────────────────────────────────────────

const INTERVIEW_TYPES = ['phone', 'video', 'onsite'] as const;
const OVERALL_IMPRESSIONS = ['positive', 'neutral', 'negative'] as const;

/**
 * Interviewer note shape — compatible with the Thank You Note agent's
 * InterviewerContext: { name, title?, topics_discussed?, rapport_notes? }
 */
const interviewerNoteSchema = z.object({
  name: z.string().min(1).max(200),
  title: z.string().max(200).optional(),
  topics_discussed: z.array(z.string().max(500)).optional(),
  rapport_notes: z.string().max(2000).optional(),
});

const createDebriefSchema = z.object({
  company_name: z.string().min(1).max(500),
  role_title: z.string().min(1).max(500),
  interview_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  interview_type: z.enum(INTERVIEW_TYPES).optional(),
  overall_impression: z.enum(OVERALL_IMPRESSIONS).optional(),
  what_went_well: z.string().max(10000).optional(),
  what_went_poorly: z.string().max(10000).optional(),
  questions_asked: z.array(z.string().max(1000)).optional(),
  interviewer_notes: z.array(interviewerNoteSchema).optional(),
  company_signals: z.string().max(10000).optional(),
  follow_up_actions: z.string().max(10000).optional(),
  job_application_id: z.string().uuid().optional(),
});

const updateDebriefSchema = createDebriefSchema.partial();

const listQuerySchema = z.object({
  job_application_id: z.string().uuid().optional(),
});

// ─── POST / — Create ──────────────────────────────────────────────────────────

interviewDebriefRoutes.post(
  '/',
  rateLimitMiddleware(30, 60_000),
  async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => null);

    const parsed = createDebriefSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, 400);
    }

    const { data, error } = await supabaseAdmin
      .from('interview_debriefs')
      .insert({
        user_id: user.id,
        ...parsed.data,
      })
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message, userId: user.id }, 'interview-debrief: create failed');
      return c.json({ error: 'Failed to create debrief' }, 500);
    }

    return c.json(data, 201);
  },
);

// ─── GET / — List ─────────────────────────────────────────────────────────────

interviewDebriefRoutes.get(
  '/',
  rateLimitMiddleware(60, 60_000),
  async (c) => {
    const user = c.get('user');
    const rawQuery = Object.fromEntries(new URL(c.req.url).searchParams);

    const parsed = listQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      return c.json({ error: 'Invalid query', details: parsed.error.flatten().fieldErrors }, 400);
    }

    let query = supabaseAdmin
      .from('interview_debriefs')
      .select('*')
      .eq('user_id', user.id);

    if (parsed.data.job_application_id) {
      query = query.eq('job_application_id', parsed.data.job_application_id);
    }

    query = query.order('interview_date', { ascending: false });

    const { data, error } = await query;

    if (error) {
      logger.error({ error: error.message, userId: user.id }, 'interview-debrief: list failed');
      return c.json({ error: 'Failed to list debriefs' }, 500);
    }

    return c.json({ debriefs: data ?? [], count: data?.length ?? 0 });
  },
);

// ─── GET /:id — Get single ────────────────────────────────────────────────────

interviewDebriefRoutes.get(
  '/:id',
  rateLimitMiddleware(60, 60_000),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    if (!UUID_RE.test(id)) return c.json({ error: 'Invalid debrief ID' }, 400);

    const { data, error } = await supabaseAdmin
      .from('interview_debriefs')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !data) {
      return c.json({ error: 'Debrief not found' }, 404);
    }

    return c.json(data);
  },
);

// ─── PATCH /:id — Update ──────────────────────────────────────────────────────

interviewDebriefRoutes.patch(
  '/:id',
  rateLimitMiddleware(30, 60_000),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    if (!UUID_RE.test(id)) return c.json({ error: 'Invalid debrief ID' }, 400);
    const body = await c.req.json().catch(() => null);

    const parsed = updateDebriefSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, 400);
    }

    const { data, error } = await supabaseAdmin
      .from('interview_debriefs')
      .update(parsed.data)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error || !data) {
      logger.error({ error: error?.message, userId: user.id, id }, 'interview-debrief: update failed');
      return c.json({ error: 'Failed to update debrief' }, 500);
    }

    return c.json(data);
  },
);

// ─── DELETE /:id — Delete ─────────────────────────────────────────────────────

interviewDebriefRoutes.delete(
  '/:id',
  rateLimitMiddleware(30, 60_000),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    if (!UUID_RE.test(id)) return c.json({ error: 'Invalid debrief ID' }, 400);

    const { error } = await supabaseAdmin
      .from('interview_debriefs')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      logger.error({ error: error.message, userId: user.id, id }, 'interview-debrief: delete failed');
      return c.json({ error: 'Failed to delete debrief' }, 500);
    }

    return c.body(null, 204);
  },
);
