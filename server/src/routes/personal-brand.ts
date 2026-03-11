/**
 * Personal Brand Audit Routes — Agent #19 using the generic route factory.
 *
 * Mounted at /api/personal-brand/*. Feature-flagged via FF_PERSONAL_BRAND_AUDIT.
 * Runs a 2-agent pipeline (Brand Auditor -> Brand Advisor) to audit executive
 * personal brand across multiple touchpoints, score consistency, and produce
 * actionable recommendations. Autonomous — no user gates.
 *
 * Cross-product context: Loads positioning strategy from resume sessions
 * and bios from executive-bio sessions if available.
 */

import { z } from 'zod';
import { createProductRoutes } from './product-route-factory.js';
import { createPersonalBrandProductConfig } from '../agents/personal-brand/product.js';
import { FF_PERSONAL_BRAND_AUDIT } from '../lib/feature-flags.js';
import { getUserContext } from '../lib/platform-context.js';
import { getEmotionalBaseline } from '../lib/emotional-baseline.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import logger from '../lib/logger.js';
import type { PersonalBrandState, PersonalBrandSSEEvent, BrandSourceInput } from '../agents/personal-brand/types.js';

const startSchema = z.object({
  session_id: z.string().uuid(),
  resume_text: z.string().min(50).max(100_000),
  linkedin_text: z.string().max(100_000).optional(),
  bio_text: z.string().max(50_000).optional(),
  target_role: z.string().max(200).optional(),
  target_industry: z.string().max(200).optional(),
});

export const personalBrandRoutes = createProductRoutes<PersonalBrandState, PersonalBrandSSEEvent>({
  startSchema,
  buildProductConfig: () => createPersonalBrandProductConfig(),
  isEnabled: () => FF_PERSONAL_BRAND_AUDIT,

  onBeforeStart: async (input, _c, _session) => {
    const sessionId = input.session_id as string;
    const { error } = await supabaseAdmin
      .from('coach_sessions')
      .update({ product_type: 'personal_brand' })
      .eq('id', sessionId);
    if (error) {
      logger.warn({ session_id: sessionId, error: error.message }, 'Personal brand: failed to set product_type');
    }
  },

  transformInput: async (input, session) => {
    const userId = session.user_id as string | undefined;
    if (!userId) return input;

    const transformed: Record<string, unknown> = { ...input };

    // Build brand_sources array from provided texts
    const brandSources: BrandSourceInput[] = [];

    if (input.resume_text) {
      brandSources.push({ source: 'resume', content: String(input.resume_text) });
    }
    if (input.linkedin_text) {
      brandSources.push({ source: 'linkedin', content: String(input.linkedin_text) });
    }
    if (input.bio_text) {
      brandSources.push({ source: 'bio', content: String(input.bio_text) });
    }

    transformed.brand_sources = brandSources;

    // Load cross-product platform context and emotional baseline
    try {
      const [baseline, strategyRows, bioRows] = await Promise.all([
        getEmotionalBaseline(userId),
        getUserContext(userId, 'positioning_strategy'),
        getUserContext(userId, 'career_narrative'),
      ]);

      const platformContext: Record<string, unknown> = {};

      if (strategyRows.length > 0) {
        platformContext.positioning_strategy = strategyRows[0].content;
      }
      if (bioRows.length > 0) {
        platformContext.bios = bioRows.map(r => r.content);
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
        'Personal brand: failed to load platform context (continuing without it)',
      );
    }

    // Build target context from flat fields
    if (input.target_role || input.target_industry) {
      transformed.target_context = {
        target_role: String(input.target_role ?? ''),
        target_industry: String(input.target_industry ?? ''),
      };
    }

    return transformed;
  },

  momentumActivityType: 'personal_brand_completed',
});

// ─── GET /reports/latest — Fetch most recent personal brand report ────────────

personalBrandRoutes.get('/reports/latest', rateLimitMiddleware(30, 60_000), async (c) => {
  if (!FF_PERSONAL_BRAND_AUDIT) {
    return c.json({ error: 'Not found' }, 404);
  }

  const user = c.get('user');

  const { data, error } = await supabaseAdmin
    .from('personal_brand_reports')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error({ error: error.message, userId: user.id }, 'GET /personal-brand/reports/latest: query failed');
    return c.json({ error: 'Failed to fetch report' }, 500);
  }
  if (!data) {
    return c.json({ error: 'No reports found' }, 404);
  }

  return c.json({ report: data });
});
