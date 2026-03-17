/**
 * Executive Bio Routes — Agent #16 using the generic route factory.
 *
 * Mounted at /api/executive-bio/*. Feature-flagged via FF_EXECUTIVE_BIO.
 * Runs a single-agent pipeline (Writer) to analyze executive positioning
 * and write polished bios across multiple formats and lengths.
 * Autonomous — no user gates.
 *
 * Cross-product context: Loads the shared Career Profile and positioning
 * strategy from prior work if available.
 */

import { z } from 'zod';
import { createProductRoutes } from './product-route-factory.js';
import { createExecutiveBioProductConfig } from '../agents/executive-bio/product.js';
import { FF_EXECUTIVE_BIO } from '../lib/feature-flags.js';
import { loadAgentContextBundle } from '../lib/career-profile-context.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import logger from '../lib/logger.js';
import type { ExecutiveBioState, ExecutiveBioSSEEvent } from '../agents/executive-bio/types.js';

const startSchema = z.object({
  session_id: z.string().uuid(),
  resume_text: z.string().min(50).max(100_000),
  requested_formats: z.array(
    z.enum(['speaker', 'board', 'advisory', 'professional', 'linkedin_featured']),
  ).optional(),
  requested_lengths: z.array(
    z.enum(['micro', 'short', 'standard', 'full']),
  ).optional(),
  target_role: z.string().max(200).optional(),
  target_industry: z.string().max(200).optional(),
});

export const executiveBioRoutes = createProductRoutes<ExecutiveBioState, ExecutiveBioSSEEvent>({
  startSchema,
  buildProductConfig: () => createExecutiveBioProductConfig(),
  isEnabled: () => FF_EXECUTIVE_BIO,

  onBeforeStart: async (input, _c, _session) => {
    const sessionId = input.session_id as string;
    const { error } = await supabaseAdmin
      .from('coach_sessions')
      .update({ product_type: 'executive_bio' })
      .eq('id', sessionId);
    if (error) {
      logger.warn({ session_id: sessionId, error: error.message }, 'Executive bio: failed to set product_type');
    }
  },

  transformInput: async (input, session) => {
    const userId = session.user_id as string | undefined;
    if (!userId) return input;

    const transformed: Record<string, unknown> = { ...input };

    try {
      const { platformContext, emotionalBaseline } = await loadAgentContextBundle(userId, {
        includeCareerProfile: true,
        includePositioningStrategy: true,
        includeCareerNarrative: true,
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
        'Executive bio: failed to load Career Profile context (continuing without it)',
      );
    }

    // Build target_context from flat fields (same pattern as case-study route)
    if (input.target_role || input.target_industry) {
      transformed.target_context = {
        target_role: String(input.target_role ?? ''),
        target_industry: String(input.target_industry ?? ''),
        target_seniority: '',
      };
    }

    return transformed;
  },

  momentumActivityType: 'executive_bio_completed',
});

// ─── GET /reports/latest — Fetch most recent executive bio report ─────────────

executiveBioRoutes.get('/reports/latest', rateLimitMiddleware(30, 60_000), async (c) => {
  if (!FF_EXECUTIVE_BIO) {
    return c.json({ error: 'Not found' }, 404);
  }

  const user = c.get('user');

  const { data, error } = await supabaseAdmin
    .from('executive_bio_reports')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error({ error: error.message, userId: user.id }, 'GET /executive-bio/reports/latest: query failed');
    return c.json({ error: 'Failed to fetch report' }, 500);
  }
  if (!data) {
    return c.json({ error: 'No reports found' }, 404);
  }

  return c.json({ report: data });
});
