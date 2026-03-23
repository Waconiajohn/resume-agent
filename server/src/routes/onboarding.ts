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
import { loadAgentContextBundle } from '../lib/career-profile-context.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';
import type { OnboardingState, OnboardingSSEEvent } from '../agents/onboarding/types.js';
import { applySharedContextOverride } from '../contracts/shared-context-adapter.js';

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
      const { platformContext, emotionalBaseline, sharedContext } = await loadAgentContextBundle(userId, {
        includeCareerProfile: true,
        includePositioningStrategy: true,
        includeWhyMeStory: true,
        includeClientProfile: true,
        includeEmotionalBaseline: true,
      });

      if (Object.keys(platformContext).length > 0) {
        transformed.platform_context = platformContext;
      }
      transformed.shared_context = applySharedContextOverride(sharedContext, {
        artifactTarget: {
          artifactType: 'onboarding',
          artifactGoal: 'build a truthful client profile and career direction baseline',
          targetAudience: 'internal platform agents and coaching surfaces',
          successCriteria: [
            'clarify next-role direction',
            'capture truthful strengths and constraints',
            'avoid repeating already-supported context',
          ],
        },
        workflowState: {
          room: 'onboarding',
          stage: 'context_loaded',
          activeTask: 'ask the highest-value onboarding questions from shared context',
        },
      });
      if (emotionalBaseline) {
        transformed.emotional_baseline = emotionalBaseline;
      }
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), userId },
        'Onboarding: failed to load platform context (continuing without it)',
      );
    }

    return transformed;
  },
  momentumActivityType: 'onboarding_completed',
});
