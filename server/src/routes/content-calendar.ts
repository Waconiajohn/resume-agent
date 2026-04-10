/**
 * Content Calendar Routes — Agent #12 using the generic route factory.
 *
 * Mounted at /api/content-calendar/*. Feature-flagged via FF_CONTENT_CALENDAR.
 * Runs a 2-agent pipeline (Strategist → Writer) to generate a 30-day
 * LinkedIn content calendar. Autonomous — no user gates.
 *
 * Cross-product context: Loads the shared Career Profile, positioning
 * strategy, evidence items, and narrative signals when available. Also
 * loads LinkedIn optimization analysis if available.
 */

import { z } from 'zod';
import { createProductRoutes } from './product-route-factory.js';
import { createContentCalendarProductConfig } from '../agents/content-calendar/product.js';
import { FF_CONTENT_CALENDAR } from '../lib/feature-flags.js';
import { loadAgentContextBundle } from '../lib/career-profile-context.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import type { ContentCalendarState, ContentCalendarSSEEvent } from '../agents/content-calendar/types.js';
import { applySharedContextOverride } from '../contracts/shared-context-adapter.js';

const startSchema = z.object({
  session_id: z.string().uuid(),
  resume_text: z.string().min(50).max(100_000),
  target_role: z.string().max(200).optional(),
  target_industry: z.string().max(200).optional(),
  posts_per_week: z.number().int().min(3).max(5).optional(),
});

export const contentCalendarRoutes = createProductRoutes<ContentCalendarState, ContentCalendarSSEEvent>({
  startSchema,
  buildProductConfig: () => createContentCalendarProductConfig(),
  isEnabled: () => FF_CONTENT_CALENDAR,

  onBeforeStart: async (input, _c, _session) => {
    const sessionId = input.session_id as string;
    const { error } = await supabaseAdmin
      .from('coach_sessions')
      .update({ product_type: 'content_calendar' })
      .eq('id', sessionId);
    if (error) {
      logger.warn({ session_id: sessionId, error: error.message }, 'Content calendar: failed to set product_type');
    }
  },

  transformInput: async (input, session) => {
    const userId = session.user_id as string | undefined;
    if (!userId) return input;

    try {
      const [{ platformContext, emotionalBaseline, sharedContext }, linkedinReport] = await Promise.all([
        loadAgentContextBundle(userId, {
          includeCareerProfile: true,
          includePositioningStrategy: true,
          includeEvidenceItems: true,
          includeCareerNarrative: true,
          includeWhyMeStory: true,
          includeClientProfile: true,
          includeEmotionalBaseline: true,
        }),
        supabaseAdmin
          .from('linkedin_optimization_reports')
          .select('keyword_analysis, profile_analysis')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
          .then((r) => r.data),
      ]);

      if (linkedinReport) {
        platformContext.linkedin_analysis = {
          keyword_analysis: linkedinReport.keyword_analysis,
          profile_analysis: linkedinReport.profile_analysis,
        };
      }

      const result: Record<string, unknown> = { ...input };
      if (Object.keys(platformContext).length > 0) {
        result.platform_context = platformContext;
      }
      result.shared_context = applySharedContextOverride(sharedContext, {
        artifactTarget: {
          artifactType: 'content_calendar',
          artifactGoal: 'generate a LinkedIn content calendar',
          targetAudience: 'linkedin audience',
          successCriteria: [
            'reflect the candidate voice',
            'ground themes in supported evidence',
            'create a coherent month-long plan',
          ],
        },
        workflowState: {
          room: 'content_calendar',
          stage: 'context_loaded',
          activeTask: 'plan a truthful content calendar from shared positioning and evidence',
        },
      });
      if (emotionalBaseline) {
        result.emotional_baseline = emotionalBaseline;
      }
      return result;
    } catch (err) {
      logger.warn(
        {
          error: err instanceof Error ? err.message : String(err),
          userId,
        },
        'Content calendar: failed to load Career Profile context (continuing without it)',
      );
    }

    return input;
  },

  momentumActivityType: 'content_calendar_completed',
});

// ─── GET /reports — List user's saved calendar reports ────────────────────────
//
// Returns up to 10 calendar reports, newest first. Auth is handled by the
// authMiddleware applied to all routes in createProductRoutes (via '*').
// RLS policies on content_calendar_reports enforce user isolation.

contentCalendarRoutes.get(
  '/reports',
  rateLimitMiddleware(60, 60_000),
  async (c) => {
    if (!FF_CONTENT_CALENDAR) {
      return c.json({ error: 'Not found' }, 404);
    }

    const user = c.get('user');

    try {
      const { data: reports, error } = await supabaseAdmin
        .from('content_calendar_reports')
        .select('id, target_role, target_industry, quality_score, coherence_score, post_count, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        logger.error({ error: error.message, userId: user.id }, 'GET /content-calendar/reports: query failed');
        return c.json({ error: 'Failed to fetch reports' }, 500);
      }

      return c.json({ reports: reports ?? [] });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ error: message, userId: user.id }, 'GET /content-calendar/reports: unexpected error');
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── GET /reports/:id — Fetch a single report with full markdown ──────────────

contentCalendarRoutes.get(
  '/reports/:id',
  rateLimitMiddleware(60, 60_000),
  async (c) => {
    if (!FF_CONTENT_CALENDAR) {
      return c.json({ error: 'Not found' }, 404);
    }

    const user = c.get('user');
    const reportId = c.req.param('id') ?? '';

    if (!reportId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reportId)) {
      return c.json({ error: 'Invalid report ID' }, 400);
    }

    try {
      const { data: report, error } = await supabaseAdmin
        .from('content_calendar_reports')
        .select('*')
        .eq('id', reportId)
        .eq('user_id', user.id)
        .single();

      if (error || !report) {
        return c.json({ error: 'Report not found' }, 404);
      }

      return c.json({ report });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ error: message, reportId, userId: user.id }, 'GET /content-calendar/reports/:id: unexpected error');
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);
