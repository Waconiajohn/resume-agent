/**
 * Content Calendar Routes — Agent #12 using the generic route factory.
 *
 * Mounted at /api/content-calendar/*. Feature-flagged via FF_CONTENT_CALENDAR.
 * Runs a 2-agent pipeline (Strategist → Writer) to generate a 30-day
 * LinkedIn content calendar. Autonomous — no user gates.
 *
 * Cross-product context: Loads Why-Me story, positioning strategy, and
 * evidence items from prior resume sessions if available. Also loads
 * LinkedIn optimization analysis if available.
 */

import { z } from 'zod';
import { createProductRoutes } from './product-route-factory.js';
import { createContentCalendarProductConfig } from '../agents/content-calendar/product.js';
import { FF_CONTENT_CALENDAR } from '../lib/feature-flags.js';
import { getUserContext } from '../lib/platform-context.js';
import { getEmotionalBaseline } from '../lib/emotional-baseline.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';
import type { ContentCalendarState, ContentCalendarSSEEvent } from '../agents/content-calendar/types.js';

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
      const [baseline, strategyRows, evidenceRows, whyMeRows, linkedinReport] = await Promise.all([
        getEmotionalBaseline(userId),
        getUserContext(userId, 'positioning_strategy'),
        getUserContext(userId, 'evidence_item'),
        supabaseAdmin
          .from('why_me_stories')
          .select('colleagues_came_for_what, known_for_what, why_not_me')
          .eq('user_id', userId)
          .maybeSingle()
          .then(r => r.data),
        supabaseAdmin
          .from('linkedin_optimization_reports')
          .select('keyword_analysis, profile_analysis')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
          .then(r => r.data),
      ]);

      const platformContext: Record<string, unknown> = {};

      if (strategyRows.length > 0) {
        platformContext.positioning_strategy = strategyRows[0].content;
      }

      if (evidenceRows.length > 0) {
        platformContext.evidence_items = evidenceRows.map((r) => r.content);
      }

      if (whyMeRows) {
        platformContext.why_me_story = {
          colleaguesCameForWhat: whyMeRows.colleagues_came_for_what ?? '',
          knownForWhat: whyMeRows.known_for_what ?? '',
          whyNotMe: whyMeRows.why_not_me ?? '',
        };
      }

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
      if (baseline) {
        result.emotional_baseline = baseline;
      }
      return result;
    } catch (err) {
      logger.warn(
        {
          error: err instanceof Error ? err.message : String(err),
          userId,
        },
        'Content calendar: failed to load platform context (continuing without it)',
      );
    }

    return input;
  },
});
