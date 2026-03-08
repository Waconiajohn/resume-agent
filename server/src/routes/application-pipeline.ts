/**
 * Application Pipeline CRUD Routes — /api/applications/*
 *
 * Deterministic Hono routes for Kanban board management (not an agent).
 * Stages: saved → researching → applied → screening → interviewing → offer → closed_won / closed_lost
 *
 * Feature-flagged via FF_APPLICATION_PIPELINE.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { FF_APPLICATION_PIPELINE } from '../lib/feature-flags.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';

export const applicationPipelineRoutes = new Hono();

// Auth required for all routes
applicationPipelineRoutes.use('*', authMiddleware);

// Feature flag guard
applicationPipelineRoutes.use('*', async (c, next) => {
  if (!FF_APPLICATION_PIPELINE) {
    return c.json({ error: 'Not found' }, 404);
  }
  await next();
});

// ─── Schemas ──────────────────────────────────────────────────────────────────

const STAGES = [
  'saved', 'researching', 'applied', 'screening',
  'interviewing', 'offer', 'closed_won', 'closed_lost',
] as const;

const SOURCES = ['job_finder', 'manual', 'referral', 'linkedin', 'indeed', 'other'] as const;

const SORT_FIELDS = ['created_at', 'updated_at', 'applied_date', 'next_action_due', 'company_name', 'role_title'] as const;

const createApplicationSchema = z.object({
  role_title: z.string().min(1).max(500),
  company_name: z.string().min(1).max(500),
  company_id: z.string().uuid().optional(),
  stage: z.enum(STAGES).optional().default('saved'),
  source: z.enum(SOURCES).optional().default('manual'),
  url: z.string().url().max(2000).optional(),
  applied_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  next_action: z.string().max(500).optional(),
  next_action_due: z.string().datetime().optional(),
  resume_version_id: z.string().uuid().optional(),
  notes: z.string().max(10000).optional(),
  score: z.number().int().min(0).max(100).optional(),
});

const updateApplicationSchema = createApplicationSchema.partial().extend({
  stage: z.enum(STAGES).optional(),
});

const listQuerySchema = z.object({
  stage: z.enum(STAGES).optional(),
  search: z.string().max(200).optional(),
  sort_by: z.enum(SORT_FIELDS).optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// ─── POST /applications — Create ──────────────────────────────────────────────

applicationPipelineRoutes.post(
  '/',
  rateLimitMiddleware(30, 60_000),
  async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => null);

    const parsed = createApplicationSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, 400);
    }

    const now = new Date().toISOString();
    const stageHistory = [{ stage: parsed.data.stage ?? 'saved', at: now }];

    const { data, error } = await supabaseAdmin
      .from('application_pipeline')
      .insert({
        user_id: user.id,
        ...parsed.data,
        stage_history: stageHistory,
      })
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message, userId: user.id }, 'application-pipeline: create failed');
      return c.json({ error: 'Failed to create application' }, 500);
    }

    return c.json(data, 201);
  },
);

// ─── GET /applications — List with filters ────────────────────────────────────

applicationPipelineRoutes.get(
  '/',
  rateLimitMiddleware(60, 60_000),
  async (c) => {
    const user = c.get('user');
    const rawQuery = Object.fromEntries(new URL(c.req.url).searchParams);
    const parsed = listQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      return c.json({ error: 'Invalid query', details: parsed.error.flatten().fieldErrors }, 400);
    }

    const { stage, search, sort_by, sort_order, limit, offset } = parsed.data;

    let query = supabaseAdmin
      .from('application_pipeline')
      .select('*')
      .eq('user_id', user.id);

    if (stage) {
      query = query.eq('stage', stage);
    }

    if (search) {
      // Escape PostgREST ILIKE special characters to prevent filter injection
      const safe = search.replace(/[%_\\]/g, (ch) => `\\${ch}`);
      query = query.or(`role_title.ilike.%${safe}%,company_name.ilike.%${safe}%`);
    }

    query = query.order(sort_by ?? 'updated_at', { ascending: (sort_order ?? 'desc') === 'asc' });
    query = query.range(offset ?? 0, (offset ?? 0) + (limit ?? 50) - 1);

    const { data, error, count } = await query;

    if (error) {
      logger.error({ error: error.message, userId: user.id }, 'application-pipeline: list failed');
      return c.json({ error: 'Failed to list applications' }, 500);
    }

    return c.json({ applications: data ?? [], count: data?.length ?? 0 });
  },
);

// ─── GET /applications/:id — Get single ───────────────────────────────────────

applicationPipelineRoutes.get(
  '/:id',
  rateLimitMiddleware(60, 60_000),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');

    const { data, error } = await supabaseAdmin
      .from('application_pipeline')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !data) {
      return c.json({ error: 'Application not found' }, 404);
    }

    return c.json(data);
  },
);

// ─── PATCH /applications/:id — Update (with stage transition tracking) ────────

applicationPipelineRoutes.patch(
  '/:id',
  rateLimitMiddleware(30, 60_000),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => null);

    const parsed = updateApplicationSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, 400);
    }

    // If stage is changing, append to stage_history
    if (parsed.data.stage) {
      const { data: existing } = await supabaseAdmin
        .from('application_pipeline')
        .select('stage, stage_history, user_id')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (!existing) {
        return c.json({ error: 'Application not found' }, 404);
      }

      const history = Array.isArray(existing.stage_history) ? existing.stage_history : [];

      // Only append to history if the stage actually changed
      if (existing.stage !== parsed.data.stage) {
        history.push({ stage: parsed.data.stage, at: new Date().toISOString() });
      }

      const { data, error } = await supabaseAdmin
        .from('application_pipeline')
        .update({
          ...parsed.data,
          stage_history: history,
          last_touch_date: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error || !data) {
        logger.error({ error: error?.message, userId: user.id, id }, 'application-pipeline: update failed');
        return c.json({ error: 'Failed to update application' }, 500);
      }

      return c.json(data);
    }

    // No stage change — simple update
    const { data, error } = await supabaseAdmin
      .from('application_pipeline')
      .update(parsed.data)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error || !data) {
      logger.error({ error: error?.message, userId: user.id, id }, 'application-pipeline: update failed');
      return c.json({ error: 'Failed to update application' }, 500);
    }

    return c.json(data);
  },
);

// ─── DELETE /applications/:id — Delete ────────────────────────────────────────

applicationPipelineRoutes.delete(
  '/:id',
  rateLimitMiddleware(30, 60_000),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');

    const { error } = await supabaseAdmin
      .from('application_pipeline')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      logger.error({ error: error.message, userId: user.id, id }, 'application-pipeline: delete failed');
      return c.json({ error: 'Failed to delete application' }, 500);
    }

    return c.body(null, 204);
  },
);

// ─── GET /applications/actions/due — Upcoming actions (Daily Ops) ─────────────

applicationPipelineRoutes.get(
  '/actions/due',
  rateLimitMiddleware(60, 60_000),
  async (c) => {
    const user = c.get('user');
    const rawQuery = Object.fromEntries(new URL(c.req.url).searchParams);
    const daysParsed = z.coerce.number().int().min(1).max(90).optional().safeParse(rawQuery.days);
    if (!daysParsed.success) {
      return c.json({ error: 'Invalid days parameter', details: daysParsed.error.flatten() }, 400);
    }
    const days = daysParsed.data ?? 7;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + days);

    const { data, error } = await supabaseAdmin
      .from('application_pipeline')
      .select('*')
      .eq('user_id', user.id)
      .not('next_action_due', 'is', null)
      .lte('next_action_due', dueDate.toISOString())
      .not('stage', 'in', '(closed_won,closed_lost)')
      .order('next_action_due', { ascending: true });

    if (error) {
      logger.error({ error: error.message, userId: user.id }, 'application-pipeline: due actions failed');
      return c.json({ error: 'Failed to fetch due actions' }, 500);
    }

    return c.json({ actions: data ?? [], count: data?.length ?? 0 });
  },
);
