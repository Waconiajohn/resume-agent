/**
 * 90-Day Plan Routes — Agent #20 using the generic route factory.
 *
 * Mounted at /api/ninety-day-plan/*. Feature-flagged via FF_NINETY_DAY_PLAN.
 * Runs a 2-agent pipeline (Role Researcher -> Plan Writer) to analyze the
 * target role, map stakeholders, and produce a strategic 90-day onboarding
 * plan. Autonomous — no user gates.
 *
 * Cross-product context: Loads positioning strategy from prior resume
 * sessions if available.
 */

import { z } from 'zod';
import { createProductRoutes } from './product-route-factory.js';
import { createNinetyDayPlanProductConfig } from '../agents/ninety-day-plan/product.js';
import { FF_NINETY_DAY_PLAN } from '../lib/feature-flags.js';
import { getUserContext } from '../lib/platform-context.js';
import { getEmotionalBaseline } from '../lib/emotional-baseline.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import logger from '../lib/logger.js';
import type { NinetyDayPlanState, NinetyDayPlanSSEEvent } from '../agents/ninety-day-plan/types.js';

const startSchema = z.object({
  session_id: z.string().uuid(),
  resume_text: z.string().min(50).max(100_000),
  target_role: z.string().max(200),
  target_company: z.string().max(200),
  target_industry: z.string().max(200).optional(),
  reporting_to: z.string().max(200).optional(),
  team_size: z.string().max(100).optional(),
});

export const ninetyDayPlanRoutes = createProductRoutes<NinetyDayPlanState, NinetyDayPlanSSEEvent>({
  startSchema,
  buildProductConfig: () => createNinetyDayPlanProductConfig(),
  isEnabled: () => FF_NINETY_DAY_PLAN,

  onBeforeStart: async (input, _c, _session) => {
    const sessionId = input.session_id as string;
    const { error } = await supabaseAdmin
      .from('coach_sessions')
      .update({ product_type: 'ninety_day_plan' })
      .eq('id', sessionId);
    if (error) {
      logger.warn({ session_id: sessionId, error: error.message }, '90-day plan: failed to set product_type');
    }
  },

  transformInput: async (input, session) => {
    const userId = session.user_id as string | undefined;
    if (!userId) return input;

    const transformed: Record<string, unknown> = { ...input };

    // Load cross-product platform context and emotional baseline
    try {
      const [baseline, strategyRows] = await Promise.all([
        getEmotionalBaseline(userId),
        getUserContext(userId, 'positioning_strategy'),
      ]);

      const platformContext: Record<string, unknown> = {};

      if (strategyRows.length > 0) {
        platformContext.positioning_strategy = strategyRows[0].content;
      }

      if (Object.keys(platformContext).length > 0) {
        transformed.platform_context = platformContext;
      }
      if (baseline) {
        transformed.emotional_baseline = baseline;
      }
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), userId },
        '90-day plan: failed to load platform context (continuing without it)',
      );
    }

    // Build role_context from flat fields
    transformed.role_context = {
      target_role: String(input.target_role ?? ''),
      target_company: String(input.target_company ?? ''),
      target_industry: String(input.target_industry ?? ''),
      reporting_to: input.reporting_to ? String(input.reporting_to) : undefined,
      team_size: input.team_size ? String(input.team_size) : undefined,
    };

    // Build target context from flat fields
    if (input.target_role || input.target_industry) {
      transformed.target_context = {
        target_role: String(input.target_role ?? ''),
        target_industry: String(input.target_industry ?? ''),
        target_seniority: '',
      };
    }

    return transformed;
  },

  momentumActivityType: 'ninety_day_plan_completed',
});

// ─── GET /reports/latest — Fetch most recent 90-day plan report ───────────────

ninetyDayPlanRoutes.get('/reports/latest', rateLimitMiddleware(30, 60_000), async (c) => {
  if (!FF_NINETY_DAY_PLAN) {
    return c.json({ error: 'Not found' }, 404);
  }

  const user = c.get('user');

  const { data, error } = await supabaseAdmin
    .from('ninety_day_plan_reports')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error({ error: error.message, userId: user.id }, 'GET /ninety-day-plan/reports/latest: query failed');
    return c.json({ error: 'Failed to fetch report' }, 500);
  }
  if (!data) {
    return c.json({ error: 'No reports found' }, 404);
  }

  return c.json({ report: data });
});
