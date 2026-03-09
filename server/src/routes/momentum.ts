/**
 * Momentum Routes — /api/momentum/*
 *
 * Deterministic CRUD routes for momentum tracking: activity logging,
 * streak computation, coaching nudges. LLM orchestration is delegated
 * to lib/momentum-service.ts; the cognitive-reframing engine handles
 * stall detection and message generation.
 *
 * Feature-flagged via FF_MOMENTUM.
 * Mounted at /api/momentum by server/src/index.ts.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { FF_MOMENTUM } from '../lib/feature-flags.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { computeStreak, checkStallsAndGenerateNudges, generateCelebration } from '../lib/momentum-service.js';

// Re-export streak helpers so existing consumers (tests, other routes) can import
// from the route module without breaking.
export { computeStreak } from '../lib/momentum-service.js';
import logger from '../lib/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MomentumActivity {
  id: string;
  user_id: string;
  activity_type: string;
  related_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CoachingNudge {
  id: string;
  user_id: string;
  trigger_type: string;
  message: string;
  coaching_tone: string;
  dismissed: boolean;
  created_at: string;
}

// ─── Allowed activity types ───────────────────────────────────────────────────

const ALLOWED_ACTIVITY_TYPES = [
  'resume_completed',
  'cover_letter_completed',
  'job_applied',
  'interview_prep',
  'mock_interview',
  'debrief_logged',
  'networking_outreach',
  'linkedin_post',
  'profile_update',
  'salary_negotiation',
] as const;

type ActivityType = typeof ALLOWED_ACTIVITY_TYPES[number];

// ─── Schemas ──────────────────────────────────────────────────────────────────

const logActivitySchema = z.object({
  activity_type: z.enum(ALLOWED_ACTIVITY_TYPES),
  related_id: z.string().uuid().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const listActivitiesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const celebrateSchema = z.object({
  milestone: z.string().min(1).max(500),
});

const ALLOWED_COACHING_TOPICS = [
  'resume_help', 'interview_prep', 'salary_negotiation',
  'career_direction', 'emotional_support', 'other',
] as const;

const ALLOWED_URGENCIES = ['low', 'normal', 'high'] as const;

const coachingRequestSchema = z.object({
  topic: z.enum(ALLOWED_COACHING_TOPICS),
  description: z.string().min(10).max(2000),
  urgency: z.enum(ALLOWED_URGENCIES).optional().default('normal'),
});

// ─── Completed activity types (for "recent wins") ─────────────────────────────

const COMPLETED_TYPES: ReadonlySet<ActivityType> = new Set([
  'resume_completed',
  'cover_letter_completed',
  'job_applied',
  'mock_interview',
  'debrief_logged',
]);

// ─── Router ───────────────────────────────────────────────────────────────────

export const momentumRoutes = new Hono();

// Auth required for all routes
momentumRoutes.use('*', authMiddleware);

// Feature flag guard
momentumRoutes.use('*', async (c, next) => {
  if (!FF_MOMENTUM) {
    return c.json({ error: 'Not found' }, 404);
  }
  await next();
});

// ─── POST /log — Log an activity ─────────────────────────────────────────────

momentumRoutes.post(
  '/log',
  rateLimitMiddleware(60, 60_000),
  async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => null);

    const parsed = logActivitySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.issues }, 400);
    }

    const { activity_type, related_id, metadata } = parsed.data;

    try {
      const { data: activity, error } = await supabaseAdmin
        .from('user_momentum_activities')
        .insert({
          user_id: user.id,
          activity_type,
          related_id: related_id ?? null,
          metadata: metadata ?? {},
        })
        .select('*')
        .single();

      if (error) {
        logger.error({ error: error.message, userId: user.id }, 'POST /momentum/log: insert failed');
        return c.json({ error: 'Failed to log activity' }, 500);
      }

      return c.json({ activity }, 201);
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), userId: user.id },
        'POST /momentum/log: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── GET /summary — Momentum summary for dashboard ───────────────────────────

momentumRoutes.get(
  '/summary',
  rateLimitMiddleware(60, 60_000),
  async (c) => {
    const user = c.get('user');

    try {
      // Fetch all activities for streak computation and summary stats
      const { data: activities, error } = await supabaseAdmin
        .from('user_momentum_activities')
        .select('activity_type, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error({ error: error.message, userId: user.id }, 'GET /momentum/summary: query failed');
        return c.json({ error: 'Failed to fetch momentum data' }, 500);
      }

      const allActivities = activities ?? [];

      // Streak computation
      const { current: current_streak, longest: longest_streak } = computeStreak(allActivities);

      // Total count
      const total_activities = allActivities.length;

      // This week (last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const this_week_activities = allActivities.filter(
        (a) => a.created_at >= sevenDaysAgo,
      ).length;

      // Recent wins: last 5 completed-type activities
      const { data: recentWinRows, error: winsError } = await supabaseAdmin
        .from('user_momentum_activities')
        .select('*')
        .eq('user_id', user.id)
        .in('activity_type', Array.from(COMPLETED_TYPES))
        .order('created_at', { ascending: false })
        .limit(5);

      if (winsError) {
        logger.warn({ error: winsError.message, userId: user.id }, 'GET /momentum/summary: wins query failed (non-fatal)');
      }

      return c.json({
        current_streak,
        longest_streak,
        total_activities,
        this_week_activities,
        recent_wins: recentWinRows ?? [],
      });
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), userId: user.id },
        'GET /momentum/summary: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── GET /activities — List recent activities (paginated) ─────────────────────

momentumRoutes.get(
  '/activities',
  rateLimitMiddleware(60, 60_000),
  async (c) => {
    const user = c.get('user');

    const queryParsed = listActivitiesQuerySchema.safeParse({
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
    });

    if (!queryParsed.success) {
      return c.json({ error: 'Invalid query parameters', details: queryParsed.error.issues }, 400);
    }

    const { limit = 20, offset = 0 } = queryParsed.data;

    try {
      const { data: activities, error, count } = await supabaseAdmin
        .from('user_momentum_activities')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        logger.error({ error: error.message, userId: user.id }, 'GET /momentum/activities: query failed');
        return c.json({ error: 'Failed to fetch activities' }, 500);
      }

      return c.json({ activities: activities ?? [], count: count ?? 0 });
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), userId: user.id },
        'GET /momentum/activities: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── GET /nudges — Active (not dismissed) coaching nudges ─────────────────────

momentumRoutes.get(
  '/nudges',
  rateLimitMiddleware(60, 60_000),
  async (c) => {
    const user = c.get('user');

    try {
      const { data: nudges, error } = await supabaseAdmin
        .from('coaching_nudges')
        .select('*')
        .eq('user_id', user.id)
        .eq('dismissed', false)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        logger.error({ error: error.message, userId: user.id }, 'GET /momentum/nudges: query failed');
        return c.json({ error: 'Failed to fetch nudges' }, 500);
      }

      return c.json({ nudges: nudges ?? [] });
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), userId: user.id },
        'GET /momentum/nudges: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── PATCH /nudges/:id/dismiss — Dismiss a nudge ─────────────────────────────

momentumRoutes.patch(
  '/nudges/:id/dismiss',
  rateLimitMiddleware(30, 60_000),
  async (c) => {
    const user = c.get('user');
    const nudgeId = c.req.param('id');

    try {
      // Verify ownership before updating
      const { data: existing, error: findError } = await supabaseAdmin
        .from('coaching_nudges')
        .select('id')
        .eq('id', nudgeId)
        .eq('user_id', user.id)
        .single();

      if (findError || !existing) {
        return c.json({ error: 'Nudge not found' }, 404);
      }

      const { data: nudge, error } = await supabaseAdmin
        .from('coaching_nudges')
        .update({ dismissed: true })
        .eq('id', nudgeId)
        .eq('user_id', user.id)
        .select('*')
        .single();

      if (error) {
        logger.error({ error: error.message, nudgeId, userId: user.id }, 'PATCH /momentum/nudges/:id/dismiss: update failed');
        return c.json({ error: 'Failed to dismiss nudge' }, 500);
      }

      return c.json({ nudge });
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), userId: user.id },
        'PATCH /momentum/nudges/:id/dismiss: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── POST /check-stalls — Detect stalls and create coaching nudges ────────────

momentumRoutes.post(
  '/check-stalls',
  rateLimitMiddleware(3, 300_000),
  async (c) => {
    const user = c.get('user');

    try {
      const result = await checkStallsAndGenerateNudges(user.id, user.email ?? 'there');
      return c.json(result);
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), userId: user.id },
        'POST /momentum/check-stalls: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── POST /celebrate — Generate a milestone celebration message ───────────────

momentumRoutes.post(
  '/celebrate',
  rateLimitMiddleware(10, 60_000),
  async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => null);

    const parsed = celebrateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.issues }, 400);
    }

    const { milestone } = parsed.data;

    try {
      const result = await generateCelebration(user.id, user.email ?? 'there', milestone);
      return c.json(result);
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), userId: user.id },
        'POST /momentum/celebrate: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── POST /coaching-requests — Submit a coaching request ─────────────────────

momentumRoutes.post(
  '/coaching-requests',
  rateLimitMiddleware(10, 60_000),
  async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => null);

    const parsed = coachingRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.issues }, 400);
    }

    const { topic, description, urgency } = parsed.data;

    try {
      const { data: request, error } = await supabaseAdmin
        .from('coaching_requests')
        .insert({
          user_id: user.id,
          topic,
          description,
          urgency,
        })
        .select('*')
        .single();

      if (error) {
        logger.error({ error: error.message, userId: user.id }, 'POST /momentum/coaching-requests: insert failed');
        return c.json({ error: 'Failed to submit coaching request' }, 500);
      }

      return c.json({ request }, 201);
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), userId: user.id },
        'POST /momentum/coaching-requests: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── GET /coaching-requests — List user's coaching requests ─────────────────

momentumRoutes.get(
  '/coaching-requests',
  rateLimitMiddleware(30, 60_000),
  async (c) => {
    const user = c.get('user');

    try {
      const { data: requests, error } = await supabaseAdmin
        .from('coaching_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        logger.error({ error: error.message, userId: user.id }, 'GET /momentum/coaching-requests: query failed');
        return c.json({ error: 'Failed to fetch coaching requests' }, 500);
      }

      return c.json({ requests: requests ?? [] });
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), userId: user.id },
        'GET /momentum/coaching-requests: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);
