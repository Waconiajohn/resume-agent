/**
 * Networking Outreach Routes — Agent #13 using the generic route factory.
 *
 * Mounted at /api/networking-outreach/*. Feature-flagged via FF_NETWORKING_OUTREACH.
 * Runs a 2-agent pipeline (Researcher → Writer) to generate a personalized
 * LinkedIn outreach sequence. Autonomous — no user gates.
 *
 * Cross-product context: Loads Why-Me story, positioning strategy, and
 * evidence items from prior resume sessions if available.
 */

import { z } from 'zod';
import { createProductRoutes } from './product-route-factory.js';
import { createNetworkingOutreachProductConfig } from '../agents/networking-outreach/product.js';
import { FF_NETWORKING_OUTREACH } from '../lib/feature-flags.js';
import { getUserContext } from '../lib/platform-context.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';
import type { NetworkingOutreachState, NetworkingOutreachSSEEvent } from '../agents/networking-outreach/types.js';

const startSchema = z.object({
  session_id: z.string().uuid(),
  resume_text: z.string().min(50).max(100_000),
  target_input: z.object({
    target_name: z.string().min(1).max(200),
    target_title: z.string().min(1).max(200),
    target_company: z.string().min(1).max(200),
    target_linkedin_url: z.string().url().max(500).optional(),
    context_notes: z.string().max(2000).optional(),
  }),
});

export const networkingOutreachRoutes = createProductRoutes<NetworkingOutreachState, NetworkingOutreachSSEEvent>({
  startSchema,
  buildProductConfig: () => createNetworkingOutreachProductConfig(),
  isEnabled: () => FF_NETWORKING_OUTREACH,

  transformInput: async (input, session) => {
    const userId = session.user_id as string | undefined;
    if (!userId) return input;

    try {
      const [strategyRows, evidenceRows, whyMeRows] = await Promise.all([
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

      if (Object.keys(platformContext).length > 0) {
        return { ...input, platform_context: platformContext };
      }
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), userId },
        'Networking outreach: failed to load platform context (continuing without it)',
      );
    }

    return input;
  },
});
