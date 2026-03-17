/**
 * LinkedIn Profile Editor Routes — Agent #22 using the generic route factory.
 *
 * Mounted at /api/linkedin-editor/*. Feature-flagged via FF_LINKEDIN_EDITOR.
 * Runs a single-agent pipeline with per-section gates to write and optimize
 * each LinkedIn profile section in the user's authentic voice.
 *
 * Cross-product context: Loads the shared Career Profile, positioning
 * strategy, and evidence items from prior work if available.
 */

import { z } from 'zod';
import { createProductRoutes } from './product-route-factory.js';
import { createLinkedInEditorProductConfig } from '../agents/linkedin-editor/product.js';
import { FF_LINKEDIN_EDITOR } from '../lib/feature-flags.js';
import { loadAgentContextBundle } from '../lib/career-profile-context.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';
import type { LinkedInEditorState, LinkedInEditorSSEEvent } from '../agents/linkedin-editor/types.js';

const startSchema = z.object({
  session_id: z.string().uuid(),
  current_profile: z.string().max(50_000).optional().describe('Existing LinkedIn profile text for reference and improvement'),
});

export const linkedInEditorRoutes = createProductRoutes<LinkedInEditorState, LinkedInEditorSSEEvent>({
  startSchema,
  buildProductConfig: () => createLinkedInEditorProductConfig(),
  isEnabled: () => FF_LINKEDIN_EDITOR,

  onBeforeStart: async (input, _c, _session) => {
    const sessionId = input.session_id as string;
    const { error } = await supabaseAdmin
      .from('coach_sessions')
      .update({ product_type: 'linkedin_editor' })
      .eq('id', sessionId);
    if (error) {
      logger.warn({ session_id: sessionId, error: error.message }, 'LinkedIn editor: failed to set product_type');
    }
  },

  transformInput: async (input, session) => {
    const userId = session.user_id as string | undefined;
    if (!userId) return input;

    try {
      const { platformContext, emotionalBaseline } = await loadAgentContextBundle(userId, {
        includeCareerProfile: true,
        includePositioningStrategy: true,
        includeEvidenceItems: true,
        includeCareerNarrative: true,
        includeEmotionalBaseline: true,
      });

      const result: Record<string, unknown> = { ...input };
      if (Object.keys(platformContext).length > 0) {
        result.platform_context = platformContext;
      }
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
        'LinkedIn editor: failed to load Career Profile context (continuing without it)',
      );
    }

    return input;
  },
  momentumActivityType: 'profile_update',
});
