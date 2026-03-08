/**
 * Onboarding Assessment Routes — Agent #1 using the generic route factory.
 *
 * Mounted at /api/onboarding/*. Feature-flagged via FF_ONBOARDING.
 * Runs a single-agent pipeline (Assessor) that generates personalized questions,
 * pauses at the 'onboarding_assessment' gate for user responses, then evaluates
 * answers to build a ClientProfile stored in platform context.
 *
 * Cross-product context: Loads positioning strategy from prior resume sessions
 * if available, so returning users get contextually-aware questions.
 */

import { z } from 'zod';
import { createProductRoutes } from './product-route-factory.js';
import { createOnboardingProductConfig } from '../agents/onboarding/product.js';
import { FF_ONBOARDING } from '../lib/feature-flags.js';
import { getUserContext } from '../lib/platform-context.js';
import { getEmotionalBaseline } from '../lib/emotional-baseline.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';
import type { OnboardingState, OnboardingSSEEvent } from '../agents/onboarding/types.js';

const startSchema = z.object({
  session_id: z.string().uuid(),
  resume_text: z.string().max(100_000).optional(),
});

export const onboardingRoutes = createProductRoutes<OnboardingState, OnboardingSSEEvent>({
  startSchema,
  buildProductConfig: () => createOnboardingProductConfig(),
  isEnabled: () => FF_ONBOARDING,

  onBeforeStart: async (input, _c, _session) => {
    const sessionId = input.session_id as string;
    const { error } = await supabaseAdmin
      .from('coach_sessions')
      .update({ product_type: 'onboarding' })
      .eq('id', sessionId);
    if (error) {
      logger.warn({ session_id: sessionId, error: error.message }, 'Onboarding: failed to set product_type');
    }
  },

  transformInput: async (input, session) => {
    const userId = session.user_id as string | undefined;
    if (!userId) return input;

    const transformed: Record<string, unknown> = { ...input };

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
        'Onboarding: failed to load platform context (continuing without it)',
      );
    }

    return transformed;
  },
});
