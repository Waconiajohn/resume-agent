/**
 * LinkedIn Content Writer Routes — Agent #21 using the generic route factory.
 *
 * Mounted at /api/linkedin-content/*. Feature-flagged via FF_LINKEDIN_CONTENT.
 * Runs a 2-agent pipeline (Strategist → Writer) to generate an authentic
 * LinkedIn thought leadership post.
 *
 * Cross-product context: Loads positioning strategy, evidence items, and
 * career narrative from prior resume sessions if available.
 */

import { z } from 'zod';
import { createProductRoutes } from './product-route-factory.js';
import { createLinkedInContentProductConfig } from '../agents/linkedin-content/product.js';
import { FF_LINKEDIN_CONTENT } from '../lib/feature-flags.js';
import { getUserContext } from '../lib/platform-context.js';
import { getEmotionalBaseline } from '../lib/emotional-baseline.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';
import type { LinkedInContentState, LinkedInContentSSEEvent } from '../agents/linkedin-content/types.js';

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
      const [baseline, strategyRows, evidenceRows, narrativeRows] = await Promise.all([
        getEmotionalBaseline(userId),
        getUserContext(userId, 'positioning_strategy'),
        getUserContext(userId, 'evidence_item'),
        getUserContext(userId, 'career_narrative'),
      ]);

      const platformContext: Record<string, unknown> = {};

      if (strategyRows.length > 0) {
        platformContext.positioning_strategy = strategyRows[0].content;
      }

      if (evidenceRows.length > 0) {
        platformContext.evidence_items = evidenceRows.map((r) => r.content);
      }

      if (narrativeRows.length > 0) {
        platformContext.career_narrative = narrativeRows[0].content;
      }

      const result: Record<string, unknown> = { ...input };
      if (Object.keys(platformContext).length > 0) {
        result.platform_context = platformContext;
      }
      if (baseline) {
        result.emotional_baseline = baseline;
      }
      return result;
    } catch (err) {
      logger.warn(
        {
          error: err instanceof Error ? err.message : String(err),
          userId,
        },
        'LinkedIn content: failed to load platform context (continuing without it)',
      );
    }

    return input;
  },
});
