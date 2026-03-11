/**
 * Planner Handoff Routes — /api/planner-handoff/*
 *
 * Implements the Financial Planner Warm Handoff protocol (Story 6-4).
 * LLM orchestration and qualification pipeline are delegated to
 * lib/planner-handoff-service.ts.
 *
 * Endpoints:
 *   POST /qualify       — run all 5 lead qualification gates
 *   POST /match         — find matching planners by geography + asset range
 *   POST /refer         — qualify, generate handoff doc, create referral record
 *   PATCH /:id/status   — update referral status (ops use)
 *   GET /user/:userId   — get all referrals for a user
 *
 * Feature-flagged via FF_RETIREMENT_BRIDGE (shared with the assessment agent).
 * Mounted at /api/planner-handoff by server/src/index.ts.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { FF_RETIREMENT_BRIDGE } from '../lib/feature-flags.js';
import {
  matchPlanners,
  updateReferralStatus,
  getUserReferrals,
} from '../lib/planner-handoff.js';
import { supabaseAdmin } from '../lib/supabase.js';
import {
  qualifyWithEmotionalReadiness,
  runHandoffPipeline,
} from '../lib/planner-handoff-service.js';
import logger from '../lib/logger.js';

// ─── Shared schema building blocks ───────────────────────────────────────────

const ASSET_RANGES = ['under_100k', '100k_250k', '250k_500k', '500k_1m', 'over_1m'] as const;
const REFERRAL_STATUSES = ['pending', 'introduced', 'meeting_scheduled', 'engaged', 'declined', 'expired'] as const;

const assetRangeEnum = z.enum(ASSET_RANGES);

// ─── Route schemas ────────────────────────────────────────────────────────────

const qualifySchema = z.object({
  user_id: z.string().uuid(),
  opt_in: z.boolean(),
  asset_range: assetRangeEnum,
  geography: z.string().min(1).max(200),
});

const matchSchema = z.object({
  geography: z.string().min(1).max(200),
  asset_range: assetRangeEnum,
  specializations: z.array(z.string()).max(10).optional(),
});

const referSchema = z.object({
  user_id: z.string().uuid(),
  planner_id: z.string().uuid(),
  opt_in: z.boolean(),
  asset_range: assetRangeEnum,
  geography: z.string().min(1).max(200),
  career_situation: z.string().max(2000).optional(),
  transition_context: z.string().max(2000).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(REFERRAL_STATUSES),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const plannerHandoffRoutes = new Hono();

// Auth required for all routes
plannerHandoffRoutes.use('*', authMiddleware);

// Feature flag guard
plannerHandoffRoutes.use('*', async (c, next) => {
  if (!FF_RETIREMENT_BRIDGE) {
    return c.json({ error: 'Not found' }, 404);
  }
  await next();
});

// ─── POST /qualify — Run all 5 lead qualification gates ──────────────────────

plannerHandoffRoutes.post(
  '/qualify',
  rateLimitMiddleware(20, 60_000),
  async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = qualifySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.issues }, 400);
    }

    const { user_id, opt_in, asset_range, geography } = parsed.data;

    const user = c.get('user');
    if (user_id !== user.id) {
      return c.json({ error: 'Forbidden: user_id mismatch' }, 403);
    }

    try {
      const { qualification } = await qualifyWithEmotionalReadiness(user_id, opt_in, asset_range, geography);
      return c.json(qualification);
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), userId: user_id },
        'POST /planner-handoff/qualify: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── POST /match — Find matching planners ────────────────────────────────────

plannerHandoffRoutes.post(
  '/match',
  rateLimitMiddleware(20, 60_000),
  async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = matchSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.issues }, 400);
    }

    const { geography, asset_range, specializations } = parsed.data;

    try {
      const planners = await matchPlanners(geography, asset_range, specializations);
      return c.json({ planners });
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), geography },
        'POST /planner-handoff/match: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── POST /refer — Qualify, generate handoff doc, create referral ─────────────

plannerHandoffRoutes.post(
  '/refer',
  rateLimitMiddleware(5, 300_000),  // 5 per 5 minutes — LLM call involved
  async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = referSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.issues }, 400);
    }

    const {
      user_id,
      planner_id,
      opt_in,
      asset_range,
      geography,
      career_situation,
      transition_context,
    } = parsed.data;

    const user = c.get('user');
    if (user_id !== user.id) {
      return c.json({ error: 'Forbidden: user_id mismatch' }, 403);
    }

    try {
      const result = await runHandoffPipeline({
        userId: user_id,
        plannerId: planner_id,
        optIn: opt_in,
        assetRange: asset_range,
        geography,
        careerSituation: career_situation,
        transitionContext: transition_context,
      });

      return c.json({ referral: result.referral }, 201);
    } catch (err) {
      // Qualification failures are signalled with a structured property
      if (err instanceof Error && (err as Error & { isQualificationFailure?: boolean }).isQualificationFailure) {
        const structured = err as Error & { qualification: unknown };
        return c.json({ error: 'Lead qualification failed', qualification: structured.qualification }, 400);
      }

      if (err instanceof Error && err.message === 'Failed to create referral record') {
        return c.json({ error: 'Failed to create referral record' }, 500);
      }

      logger.error(
        { error: err instanceof Error ? err.message : String(err), userId: user_id },
        'POST /planner-handoff/refer: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── PATCH /:id/status — Update referral status ──────────────────────────────

plannerHandoffRoutes.patch(
  '/:id/status',
  rateLimitMiddleware(30, 60_000),
  async (c) => {
    const referralId = c.req.param('id');
    const body = await c.req.json().catch(() => null);
    const parsed = updateStatusSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.issues }, 400);
    }

    const { status } = parsed.data;

    const user = c.get('user');

    // Verify ownership: the referral must belong to the requesting user
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from('planner_referrals')
      .select('user_id')
      .eq('id', referralId)
      .maybeSingle();

    if (lookupError || !existing) {
      return c.json({ error: 'Referral not found' }, 404);
    }

    if (existing.user_id !== user.id) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    try {
      await updateReferralStatus(referralId, status);
      return c.json({ success: true, referral_id: referralId, status });
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), referralId },
        'PATCH /planner-handoff/:id/status: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── GET /user/:userId — Get all referrals for a user ────────────────────────

plannerHandoffRoutes.get(
  '/user/:userId',
  rateLimitMiddleware(30, 60_000),
  async (c) => {
    const { userId } = c.req.param();

    // Validate the UUID format before hitting the DB
    const uuidParsed = z.string().uuid().safeParse(userId);
    if (!uuidParsed.success) {
      return c.json({ error: 'Invalid user ID' }, 400);
    }

    const user = c.get('user');
    if (userId !== user.id) {
      return c.json({ error: 'Forbidden: user_id mismatch' }, 403);
    }

    try {
      const referrals = await getUserReferrals(userId);
      return c.json({ referrals });
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), userId },
        'GET /planner-handoff/user/:userId: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);
