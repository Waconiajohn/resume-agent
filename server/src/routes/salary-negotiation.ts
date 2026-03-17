/**
 * Salary Negotiation Routes — Agent #15 using the generic route factory.
 *
 * Mounted at /api/salary-negotiation/*. Feature-flagged via FF_SALARY_NEGOTIATION.
 * Runs a 2-agent pipeline (Market Researcher → Negotiation Strategist) to research
 * compensation benchmarks, design negotiation strategy, and generate talking points.
 * Autonomous — no user gates.
 *
 * Cross-product context: Loads the shared Career Profile and positioning
 * strategy from prior work if available.
 */

import { z } from 'zod';
import { createProductRoutes } from './product-route-factory.js';
import { createSalaryNegotiationProductConfig } from '../agents/salary-negotiation/product.js';
import { FF_SALARY_NEGOTIATION } from '../lib/feature-flags.js';
import { loadAgentContextBundle } from '../lib/career-profile-context.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import logger from '../lib/logger.js';
import type { SalaryNegotiationState, SalaryNegotiationSSEEvent } from '../agents/salary-negotiation/types.js';

const startSchema = z.object({
  session_id: z.string().uuid(),
  resume_text: z.string().min(50).max(100_000),
  offer_company: z.string().min(1).max(200),
  offer_role: z.string().min(1).max(200),
  offer_base_salary: z.number().optional(),
  offer_total_comp: z.number().optional(),
  offer_equity_details: z.string().max(2000).optional(),
  offer_other_details: z.string().max(2000).optional(),
  current_base_salary: z.number().optional(),
  current_total_comp: z.number().optional(),
  current_equity: z.string().max(2000).optional(),
  target_role: z.string().max(200).optional(),
  target_industry: z.string().max(200).optional(),
  target_seniority: z.string().max(200).optional(),
});

export const salaryNegotiationRoutes = createProductRoutes<SalaryNegotiationState, SalaryNegotiationSSEEvent>({
  startSchema,
  buildProductConfig: () => createSalaryNegotiationProductConfig(),
  isEnabled: () => FF_SALARY_NEGOTIATION,

  onBeforeStart: async (input, _c, _session) => {
    const sessionId = input.session_id as string;
    const { error } = await supabaseAdmin
      .from('coach_sessions')
      .update({ product_type: 'salary_negotiation' })
      .eq('id', sessionId);
    if (error) {
      logger.warn({ session_id: sessionId, error: error.message }, 'Salary negotiation: failed to set product_type');
    }
  },

  transformInput: async (input, session) => {
    const userId = session.user_id as string | undefined;
    if (!userId) return input;

    // Restructure flat input fields into nested objects
    const offer_details = {
      company: input.offer_company as string,
      role: input.offer_role as string,
      base_salary: input.offer_base_salary as number | undefined,
      total_comp: input.offer_total_comp as number | undefined,
      equity_details: input.offer_equity_details as string | undefined,
      other_details: input.offer_other_details as string | undefined,
    };

    const current_compensation = {
      base_salary: input.current_base_salary as number | undefined,
      total_comp: input.current_total_comp as number | undefined,
      equity: input.current_equity as string | undefined,
    };

    const transformed: Record<string, unknown> = {
      ...input,
      offer_details,
      current_compensation,
    };

    try {
      const { platformContext, emotionalBaseline } = await loadAgentContextBundle(userId, {
        includeCareerProfile: true,
        includePositioningStrategy: true,
        includeWhyMeStory: true,
        includeEmotionalBaseline: true,
      });

      if (Object.keys(platformContext).length > 0) {
        transformed.platform_context = platformContext;
      }
      if (emotionalBaseline) {
        transformed.emotional_baseline = emotionalBaseline;
      }
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), userId },
        'Salary negotiation: failed to load Career Profile context (continuing without it)',
      );
    }

    return transformed;
  },
  momentumActivityType: 'salary_negotiation_completed',
});

// ─── GET /reports/latest — Fetch most recent salary negotiation report ────────

salaryNegotiationRoutes.get('/reports/latest', rateLimitMiddleware(30, 60_000), async (c) => {
  if (!FF_SALARY_NEGOTIATION) {
    return c.json({ error: 'Not found' }, 404);
  }

  const user = c.get('user');

  const { data, error } = await supabaseAdmin
    .from('salary_negotiation_reports')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error({ error: error.message, userId: user.id }, 'GET /salary-negotiation/reports/latest: query failed');
    return c.json({ error: 'Failed to fetch report' }, 500);
  }
  if (!data) {
    return c.json({ error: 'No reports found' }, 404);
  }

  return c.json({ report: data });
});
