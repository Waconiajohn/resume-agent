/**
 * LinkedIn Optimizer Routes — Agent #11 using the generic route factory.
 *
 * Mounted at /api/linkedin-optimizer/*. Feature-flagged via FF_LINKEDIN_OPTIMIZER.
 * Runs a 2-agent pipeline (Analyzer → Writer) to generate LinkedIn profile
 * optimization recommendations. Autonomous — no user gates.
 *
 * Cross-product context: Loads Why-Me story, positioning strategy, and
 * evidence items from prior resume sessions if available.
 */

import { z } from 'zod';
import { createProductRoutes } from './product-route-factory.js';
import { createLinkedInOptimizerProductConfig } from '../agents/linkedin-optimizer/product.js';
import { FF_LINKEDIN_OPTIMIZER } from '../lib/feature-flags.js';
import { loadAgentContextBundle } from '../lib/career-profile-context.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';
import type { LinkedInOptimizerState, LinkedInOptimizerSSEEvent } from '../agents/linkedin-optimizer/types.js';
import { applySharedContextOverride } from '../contracts/shared-context-adapter.js';

const startSchema = z.object({
  session_id: z.string().uuid(),
  resume_text: z.string().min(50).max(100_000),
  linkedin_headline: z.string().max(500).optional(),
  linkedin_about: z.string().max(5_000).optional(),
  linkedin_experience: z.string().max(50_000).optional(),
  target_role: z.string().max(200).optional(),
  target_industry: z.string().max(200).optional(),
  job_application_id: z.string().uuid().optional(),
});

export const linkedInOptimizerRoutes = createProductRoutes<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>({
  startSchema,
  buildProductConfig: () => createLinkedInOptimizerProductConfig(),
  isEnabled: () => FF_LINKEDIN_OPTIMIZER,

  onBeforeStart: async (input, _c, _session) => {
    const sessionId = input.session_id as string;
    const { error } = await supabaseAdmin
      .from('coach_sessions')
      .update({ product_type: 'linkedin_optimizer' })
      .eq('id', sessionId);
    if (error) {
      logger.warn({ session_id: sessionId, error: error.message }, 'LinkedIn optimizer: failed to set product_type');
    }
  },

  transformInput: async (input, session) => {
    const userId = session.user_id as string | undefined;
    if (!userId) return input;

    try {
      const { platformContext, emotionalBaseline, sharedContext } = await loadAgentContextBundle(userId, {
        includeCareerProfile: true,
        includePositioningStrategy: true,
        includeEvidenceItems: true,
        includeCareerNarrative: true,
        includeWhyMeStory: true,
        includeClientProfile: true,
        includeEmotionalBaseline: true,
      });

      const result: Record<string, unknown> = { ...input };
      if (Object.keys(platformContext).length > 0) {
        result.platform_context = platformContext;
      }
      result.shared_context = applySharedContextOverride(sharedContext, {
        artifactTarget: {
          artifactType: 'linkedin_profile',
          artifactGoal: 'optimize LinkedIn profile sections',
          targetAudience: 'recruiters and hiring managers',
          successCriteria: [
            'improve discoverability',
            'stay truthful',
            'align LinkedIn with the shared career narrative',
          ],
        },
        workflowState: {
          room: 'linkedin',
          stage: 'context_loaded',
          activeTask: 'optimize LinkedIn sections using shared context and evidence',
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
        'LinkedIn optimizer: failed to load platform context (continuing without it)',
      );
    }

    return input;
  },
  momentumActivityType: 'linkedin_optimized',
});
