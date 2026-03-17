/**
 * Networking Outreach Routes — Agent #13 using the generic route factory.
 *
 * Mounted at /api/networking-outreach/*. Feature-flagged via FF_NETWORKING_OUTREACH.
 * Runs a 2-agent pipeline (Researcher → Writer) to generate a personalized
 * LinkedIn outreach sequence. Autonomous — no user gates.
 *
 * Cross-product context: Loads the shared Career Profile, positioning
 * strategy, and evidence items from prior work if available.
 */

import { z } from 'zod';
import { createProductRoutes } from './product-route-factory.js';
import { createNetworkingOutreachProductConfig } from '../agents/networking-outreach/product.js';
import { FF_NETWORKING_OUTREACH } from '../lib/feature-flags.js';
import { loadAgentContextBundle } from '../lib/career-profile-context.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';
import type { NetworkingOutreachState, NetworkingOutreachSSEEvent } from '../agents/networking-outreach/types.js';

const startSchema = z.object({
  session_id: z.string().uuid(),
  resume_text: z.string().min(50).max(100_000),
  messaging_method: z.enum(['group_message', 'connection_request', 'inmail']).optional(),
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

  onBeforeStart: async (input, _c, _session) => {
    const sessionId = input.session_id as string;
    const { error } = await supabaseAdmin
      .from('coach_sessions')
      .update({ product_type: 'networking_outreach' })
      .eq('id', sessionId);
    if (error) {
      logger.warn({ session_id: sessionId, error: error.message }, 'Networking outreach: failed to set product_type');
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
        includeWhyMeStory: true,
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
        { error: err instanceof Error ? err.message : String(err), userId },
        'Networking outreach: failed to load Career Profile context (continuing without it)',
      );
    }

    return input;
  },
  momentumActivityType: 'networking_outreach_completed',
});
