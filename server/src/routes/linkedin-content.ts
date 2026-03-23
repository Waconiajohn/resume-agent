/**
 * LinkedIn Content Writer Routes — Agent #21 using the generic route factory.
 *
 * Mounted at /api/linkedin-content/*. Feature-flagged via FF_LINKEDIN_CONTENT.
 * Runs a 2-agent pipeline (Strategist → Writer) to generate an authentic
 * LinkedIn thought leadership post.
 *
 * Cross-product context: Loads the shared Career Profile, positioning
 * strategy, evidence items, and career narrative from prior work.
 */

import { z } from 'zod';
import { createProductRoutes } from './product-route-factory.js';
import { createLinkedInContentProductConfig } from '../agents/linkedin-content/product.js';
import { FF_LINKEDIN_CONTENT } from '../lib/feature-flags.js';
import { loadAgentContextBundle } from '../lib/career-profile-context.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';
import type { LinkedInContentState, LinkedInContentSSEEvent } from '../agents/linkedin-content/types.js';
import { applySharedContextOverride } from '../contracts/shared-context-adapter.js';

const startSchema = z.object({
  session_id: z.string().uuid(),
});

export const linkedInContentRoutes = createProductRoutes<LinkedInContentState, LinkedInContentSSEEvent>({
  startSchema,
  buildProductConfig: () => createLinkedInContentProductConfig(),
  isEnabled: () => FF_LINKEDIN_CONTENT,

  onBeforeStart: async (input, _c, _session) => {
    const sessionId = input.session_id as string;
    const { error } = await supabaseAdmin
      .from('coach_sessions')
      .update({ product_type: 'linkedin_content' })
      .eq('id', sessionId);
    if (error) {
      logger.warn({ session_id: sessionId, error: error.message }, 'LinkedIn content: failed to set product_type');
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
        includeClientProfile: true,
        includeEmotionalBaseline: true,
      });

      const result: Record<string, unknown> = { ...input };
      if (Object.keys(platformContext).length > 0) {
        result.platform_context = platformContext;
      }
      result.shared_context = applySharedContextOverride(sharedContext, {
        artifactTarget: {
          artifactType: 'linkedin_post',
          artifactGoal: 'draft a LinkedIn thought leadership post',
          targetAudience: 'linkedin audience',
          successCriteria: ['stay truthful', 'sound like the candidate', 'use supported evidence'],
        },
        workflowState: {
          room: 'linkedin',
          stage: 'context_loaded',
          activeTask: 'develop content ideas from shared positioning and evidence',
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
        'LinkedIn content: failed to load Career Profile context (continuing without it)',
      );
    }

    return input;
  },
  momentumActivityType: 'linkedin_content_completed',
});
