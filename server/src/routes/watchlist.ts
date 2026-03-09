/**
 * Watchlist Companies CRUD Routes — /api/watchlist/*
 *
 * Deterministic Hono routes for managing a user's company watchlist (job search radar).
 * Sources: manual, ai_suggested, contact_derived.
 *
 * Feature-flagged via FF_JOB_SEARCH.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { FF_JOB_SEARCH } from '../lib/feature-flags.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';

export const watchlistRoutes = new Hono();

// Auth required for all routes
watchlistRoutes.use('*', authMiddleware);

// Feature flag guard
watchlistRoutes.use('*', async (c, next) => {
  if (!FF_JOB_SEARCH) {
    return c.json({ error: 'Not found' }, 404);
  }
  await next();
});

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createSchema = z.object({
  name: z.string().min(1).max(500),
  industry: z.string().max(200).optional(),
  website: z.string().url().max(2000).optional(),
  careers_url: z.string().url().max(2000).optional(),
  priority: z.number().int().min(0).max(100).optional().default(0),
  source: z.enum(['manual', 'ai_suggested', 'contact_derived']).optional().default('manual'),
  notes: z.string().max(5000).optional(),
});

const updateSchema = createSchema.partial();

// ─── POST / — Create watchlist company ────────────────────────────────────────

watchlistRoutes.post(
  '/',
  rateLimitMiddleware(30, 60_000),
  async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => null);

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, 400);
    }

    const { data, error } = await supabaseAdmin
      .from('watchlist_companies')
      .insert({
        user_id: user.id,
        ...parsed.data,
      })
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message, userId: user.id }, 'watchlist: create failed');
      return c.json({ error: 'Failed to create watchlist company' }, 500);
    }

    return c.json(data, 201);
  },
);

// ─── GET / — List user's watchlist ────────────────────────────────────────────

watchlistRoutes.get(
  '/',
  rateLimitMiddleware(60, 60_000),
  async (c) => {
    const user = c.get('user');

    const { data, error } = await supabaseAdmin
      .from('watchlist_companies')
      .select('*')
      .eq('user_id', user.id)
      .order('priority', { ascending: false });

    if (error) {
      logger.error({ error: error.message, userId: user.id }, 'watchlist: list failed');
      return c.json({ error: 'Failed to list watchlist companies' }, 500);
    }

    return c.json({ companies: data ?? [], count: data?.length ?? 0 });
  },
);

// ─── PATCH /:id — Update watchlist company ────────────────────────────────────

watchlistRoutes.patch(
  '/:id',
  rateLimitMiddleware(30, 60_000),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => null);

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, 400);
    }

    const { data, error } = await supabaseAdmin
      .from('watchlist_companies')
      .update(parsed.data)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error || !data) {
      logger.error({ error: error?.message, userId: user.id, id }, 'watchlist: update failed');
      return c.json({ error: 'Failed to update watchlist company' }, 500);
    }

    return c.json(data);
  },
);

// ─── DELETE /:id — Delete watchlist company ───────────────────────────────────

watchlistRoutes.delete(
  '/:id',
  rateLimitMiddleware(30, 60_000),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');

    const { error } = await supabaseAdmin
      .from('watchlist_companies')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      logger.error({ error: error.message, userId: user.id, id }, 'watchlist: delete failed');
      return c.json({ error: 'Failed to delete watchlist company' }, 500);
    }

    return c.body(null, 204);
  },
);
