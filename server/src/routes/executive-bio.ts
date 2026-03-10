/**
 * Executive Bio Routes — Agent #16 using the generic route factory.
 *
 * Mounted at /api/executive-bio/*. Feature-flagged via FF_EXECUTIVE_BIO.
 * Runs a single-agent pipeline (Writer) to analyze executive positioning
 * and write polished bios across multiple formats and lengths.
 * Autonomous — no user gates.
 *
 * Cross-product context: Loads positioning strategy and why-me narrative
 * from prior resume sessions if available.
 */

import { z } from 'zod';
import { createProductRoutes } from './product-route-factory.js';
import { createExecutiveBioProductConfig } from '../agents/executive-bio/product.js';
import { FF_EXECUTIVE_BIO } from '../lib/feature-flags.js';
import { getUserContext } from '../lib/platform-context.js';
import { getEmotionalBaseline } from '../lib/emotional-baseline.js';
import { supabaseAdmin } from '../lib/supabase.js';
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

    // Load cross-product platform context and emotional baseline
    try {
      const [baseline, strategyRows, narrativeRows] = await Promise.all([
        getEmotionalBaseline(userId),
        getUserContext(userId, 'positioning_strategy'),
        getUserContext(userId, 'career_narrative'),
      ]);

      const platformContext: Record<string, unknown> = {};

      if (strategyRows.length > 0) {
        platformContext.positioning_strategy = strategyRows[0].content;
      }
      if (narrativeRows.length > 0) {
        const narrative = narrativeRows[0].content;
        platformContext.why_me_story = typeof narrative === 'object' && narrative !== null && 'why_me_story' in narrative
          ? String((narrative as Record<string, unknown>).why_me_story)
          : JSON.stringify(narrative);
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
        'Executive bio: failed to load platform context (continuing without it)',
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
