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
import { getUserContext } from '../lib/platform-context.js';
import { getEmotionalBaseline } from '../lib/emotional-baseline.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';
import type { LinkedInOptimizerState, LinkedInOptimizerSSEEvent } from '../agents/linkedin-optimizer/types.js';

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

  transformInput: async (input, session) => {
    const userId = session.user_id as string | undefined;
    if (!userId) return input;

    try {
      const [baseline, strategyRows, evidenceRows, whyMeRows] = await Promise.all([
        getEmotionalBaseline(userId),
        getUserContext(userId, 'positioning_strategy'),
        getUserContext(userId, 'evidence_item'),
        supabaseAdmin
          .from('why_me_stories')
          .select('colleagues_came_for_what, known_for_what, why_not_me')
          .eq('user_id', userId)
          .maybeSingle()
          .then(r => r.data),
      ]);

      const platformContext: Record<string, unknown> = {};

      if (strategyRows.length > 0) {
        platformContext.positioning_strategy = strategyRows[0].content;
      }

      if (evidenceRows.length > 0) {
        platformContext.evidence_items = evidenceRows.map((r) => r.content);
      }

      if (whyMeRows) {
        platformContext.why_me_story = {
          colleaguesCameForWhat: whyMeRows.colleagues_came_for_what ?? '',
          knownForWhat: whyMeRows.known_for_what ?? '',
          whyNotMe: whyMeRows.why_not_me ?? '',
        };
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
        'LinkedIn optimizer: failed to load platform context (continuing without it)',
      );
    }

    return input;
  },
});
