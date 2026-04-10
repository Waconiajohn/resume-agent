/**
 * Content Posts Routes — /api/content-posts/*
 *
 * CRUD routes for managing persisted LinkedIn content posts.
 * Posts are written by the LinkedIn Content Writer agent (persistResult in
 * linkedin-content/product.ts). This route handles reading, status updates,
 * and deletion only — creation is handled by the agent pipeline.
 *
 * Feature-flagged via FF_LINKEDIN_CONTENT.
 * Mounted at /api/content-posts by server/src/index.ts.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { FF_LINKEDIN_CONTENT } from '../lib/feature-flags.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';

export const contentPostsRoutes = new Hono();

// Auth required for all routes
contentPostsRoutes.use('*', authMiddleware);

// Feature flag guard
contentPostsRoutes.use('*', async (c, next) => {
  if (!FF_LINKEDIN_CONTENT) {
    return c.json({ data: null, feature_disabled: true }, 200);
  }
  await next();
});

// ─── Schemas ──────────────────────────────────────────────────────────────────

const POST_STATUSES = ['draft', 'approved', 'published'] as const;

const listPostsQuerySchema = z.object({
  status: z.enum(POST_STATUSES).optional(),
});

const updatePostStatusSchema = z.object({
  status: z.enum(POST_STATUSES),
});

// ─── GET /posts — List user's posts ──────────────────────────────────────────

contentPostsRoutes.get(
  '/posts',
  rateLimitMiddleware(60, 60_000),
  async (c) => {
    const user = c.get('user');

    const queryParsed = listPostsQuerySchema.safeParse({
      status: c.req.query('status'),
    });

    if (!queryParsed.success) {
      return c.json({ error: 'Invalid query parameters', details: queryParsed.error.issues }, 400);
    }

    const { status } = queryParsed.data;

    try {
      let query = supabaseAdmin
        .from('content_posts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data: posts, error } = await query;

      if (error) {
        logger.error({ error: error.message, userId: user.id }, 'GET /posts: query failed');
        return c.json({ error: 'Failed to fetch posts' }, 500);
      }

      return c.json({ posts: posts ?? [] });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ error: message, userId: user.id }, 'GET /posts: unexpected error');
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── PATCH /posts/:id — Update post status ────────────────────────────────────

contentPostsRoutes.patch(
  '/posts/:id',
  rateLimitMiddleware(30, 60_000),
  async (c) => {
    const user = c.get('user');
    const postId = c.req.param('id') ?? '';
    const body = await c.req.json().catch(() => null);

    const parsed = updatePostStatusSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.issues }, 400);
    }

    try {
      // Verify ownership first
      const { data: existing, error: findError } = await supabaseAdmin
        .from('content_posts')
        .select('id')
        .eq('id', postId)
        .eq('user_id', user.id)
        .single();

      if (findError || !existing) {
        return c.json({ error: 'Post not found' }, 404);
      }

      const { data: post, error } = await supabaseAdmin
        .from('content_posts')
        .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
        .eq('id', postId)
        .eq('user_id', user.id)
        .select('*')
        .single();

      if (error) {
        logger.error({ error: error.message, postId, userId: user.id }, 'PATCH /posts/:id: update failed');
        return c.json({ error: 'Failed to update post' }, 500);
      }

      return c.json({ post });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ error: message, postId, userId: user.id }, 'PATCH /posts/:id: unexpected error');
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── DELETE /posts/:id — Delete a post ───────────────────────────────────────

contentPostsRoutes.delete(
  '/posts/:id',
  rateLimitMiddleware(30, 60_000),
  async (c) => {
    const user = c.get('user');
    const postId = c.req.param('id') ?? '';

    try {
      const { data: existing, error: findError } = await supabaseAdmin
        .from('content_posts')
        .select('id')
        .eq('id', postId)
        .eq('user_id', user.id)
        .single();

      if (findError || !existing) {
        return c.json({ error: 'Post not found' }, 404);
      }

      const { error } = await supabaseAdmin
        .from('content_posts')
        .delete()
        .eq('id', postId)
        .eq('user_id', user.id);

      if (error) {
        logger.error({ error: error.message, postId, userId: user.id }, 'DELETE /posts/:id: delete failed');
        return c.json({ error: 'Failed to delete post' }, 500);
      }

      return new Response(null, { status: 204 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ error: message, postId, userId: user.id }, 'DELETE /posts/:id: unexpected error');
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);
