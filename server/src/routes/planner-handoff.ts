/**
 * Planner Handoff Routes — /api/planner-handoff/*
 *
 * Implements the Financial Planner Warm Handoff protocol (Story 6-4).
 * All routes are deterministic CRUD except POST /refer which calls MODEL_MID
 * once to generate the handoff document.
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
import { getUserContext } from '../lib/platform-context.js';
import {
  qualifyLead,
  matchPlanners,
  generateHandoffDocument,
  createReferral,
  updateReferralStatus,
  getUserReferrals,
} from '../lib/planner-handoff.js';
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

    // Fix 1: Verify user_id matches authenticated user
    const user = c.get('user');
    if (user_id !== user.id) {
      return c.json({ error: 'Forbidden: user_id mismatch' }, 403);
    }

    // Fix 2: Derive emotional readiness server-side from platform context
    let emotionalReadiness = true;
    try {
      const baselineRows = await getUserContext(user_id, 'emotional_baseline');
      if (baselineRows.length > 0) {
        const baseline = baselineRows[0].content as Record<string, unknown>;
        emotionalReadiness = baseline.distress_detected !== true;
      }
    } catch {
      // Non-fatal — default to true if baseline unavailable
    }

    try {
      const result = await qualifyLead(user_id, opt_in, asset_range, geography, emotionalReadiness);
      return c.json(result);
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

    // Fix 1: Verify user_id matches authenticated user
    const user = c.get('user');
    if (user_id !== user.id) {
      return c.json({ error: 'Forbidden: user_id mismatch' }, 403);
    }

    // Fix 2: Derive emotional readiness server-side from platform context
    let emotionalReadiness = true;
    try {
      const baselineRows = await getUserContext(user_id, 'emotional_baseline');
      if (baselineRows.length > 0) {
        const baseline = baselineRows[0].content as Record<string, unknown>;
        emotionalReadiness = baseline.distress_detected !== true;
      }
    } catch {
      // Non-fatal — default to true if baseline unavailable
    }

    // Step 1: Re-qualify at referral time (gates are enforced here, not trusted from client)
    let qualification;
    try {
      qualification = await qualifyLead(user_id, opt_in, asset_range, geography, emotionalReadiness);
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), userId: user_id },
        'POST /planner-handoff/refer: qualification error',
      );
      return c.json({ error: 'Internal server error during qualification' }, 500);
    }

    if (!qualification.passed) {
      return c.json({ error: 'Lead qualification failed', qualification }, 400);
    }

    // Step 2: Load platform context for handoff document generation
    let readinessSummary: Record<string, unknown> | undefined;
    let clientProfile: Record<string, unknown> | undefined;

    try {
      const [readinessRows, profileRows] = await Promise.all([
        getUserContext(user_id, 'retirement_readiness'),
        getUserContext(user_id, 'client_profile'),
      ]);

      if (readinessRows.length > 0) {
        readinessSummary = readinessRows[0].content;
      }
      if (profileRows.length > 0) {
        clientProfile = profileRows[0].content;
      }
    } catch (err) {
      // Non-fatal — handoff doc generation has fallbacks
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), userId: user_id },
        'POST /planner-handoff/refer: failed to load platform context (non-fatal)',
      );
    }

    // Step 3: Generate handoff document (LLM call — has fallback)
    let handoffDocument;
    try {
      handoffDocument = await generateHandoffDocument({
        career_situation,
        transition_context,
        readiness_summary: readinessSummary,
        client_profile: clientProfile,
      });
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), userId: user_id },
        'POST /planner-handoff/refer: handoff document generation failed',
      );
      return c.json({ error: 'Failed to generate handoff document' }, 500);
    }

    // Step 4: Create referral record
    const referral = await createReferral(user_id, planner_id, handoffDocument, qualification);
    if (!referral) {
      return c.json({ error: 'Failed to create referral record' }, 500);
    }

    logger.info({ userId: user_id, plannerId: planner_id, referralId: referral.id }, 'Planner referral created');

    return c.json({ referral }, 201);
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

    // Fix 1: Verify userId matches authenticated user
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
