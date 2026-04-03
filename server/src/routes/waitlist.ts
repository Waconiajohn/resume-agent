/**
 * Waitlist Routes — POST /api/waitlist
 *
 * Public endpoint (no auth required). Captures interest in coming-soon products.
 * Upserts on (email, product_slug) so repeated submissions are idempotent.
 *
 * Request body: { email: string, product_slug: string }
 * Response 201: { status: 'joined' }
 * Response 200: { status: 'already_joined' }
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import logger from '../lib/logger.js';

export const waitlistRoutes = new Hono();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const joinSchema = z.object({
  email: z
    .string()
    .min(3)
    .max(254)
    .refine((value) => EMAIL_RE.test(value), { message: 'Invalid email address' }),
  product_slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9_-]+$/, { message: 'product_slug must be lowercase letters, digits, hyphens, or underscores' }),
});

// POST / — Join waitlist for a specific product
waitlistRoutes.post(
  '/',
  rateLimitMiddleware(10, 60_000),
  async (c) => {
    const body = await c.req.json().catch(() => null);

    const parsed = joinSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        400,
      );
    }

    const { email, product_slug } = parsed.data;

    // Check if this (email, product_slug) pair already exists before inserting.
    // This lets us return a distinct 200 vs 201 without relying on Postgres
    // error codes, which vary across Supabase client versions.
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from('waitlist_emails')
      .select('id')
      .eq('email', email)
      .eq('product_slug', product_slug)
      .maybeSingle();

    if (lookupError) {
      logger.error(
        { error: lookupError.message, product_slug },
        'waitlist: lookup failed',
      );
      return c.json({ error: 'Failed to process waitlist request' }, 500);
    }

    if (existing) {
      return c.json({ status: 'already_joined' }, 200);
    }

    const { error: insertError } = await supabaseAdmin
      .from('waitlist_emails')
      .insert({
        email,
        product_slug,
        source: product_slug,
      });

    if (insertError) {
      // 23505 = unique_violation — race condition between check and insert.
      if (insertError.code === '23505') {
        return c.json({ status: 'already_joined' }, 200);
      }
      logger.error(
        { error: insertError.message, product_slug },
        'waitlist: insert failed',
      );
      return c.json({ error: 'Failed to join waitlist' }, 500);
    }

    return c.json({ status: 'joined' }, 201);
  },
);
