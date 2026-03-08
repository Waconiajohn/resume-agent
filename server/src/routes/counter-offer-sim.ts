/**
 * Counter-Offer Simulation Routes — using the generic route factory.
 *
 * Mounted at /api/counter-offer-sim/*. Feature-flagged via FF_COUNTER_OFFER_SIM.
 * Runs a single-agent interactive pipeline (Employer) that pauses once per
 * negotiation round for the user to respond with their counter.
 *
 * Cross-product context: Loads positioning strategy and Why-Me story from
 * prior CareerIQ sessions. Also checks for prior salary_negotiation market
 * research in platform context and includes it if available.
 */

import { z } from 'zod';
import { createProductRoutes } from './product-route-factory.js';
import { createCounterOfferSimProductConfig } from '../agents/salary-negotiation/simulation/product.js';
import { FF_COUNTER_OFFER_SIM } from '../lib/feature-flags.js';
import { getUserContext } from '../lib/platform-context.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';
import type { CounterOfferSimState, CounterOfferSSEEvent } from '../agents/salary-negotiation/simulation/types.js';

const startSchema = z.object({
  session_id: z.string().uuid(),
  resume_text: z.string().min(10).max(100_000).optional(),
  offer_company: z.string().min(1).max(200),
  offer_role: z.string().min(1).max(200),
  offer_base_salary: z.number().positive().optional(),
  offer_total_comp: z.number().positive().optional(),
  target_salary: z.number().positive().optional(),
  mode: z.enum(['full', 'single_round']),
  round_type: z.enum(['initial_response', 'counter', 'final']).optional(),
});

export const counterOfferSimRoutes = createProductRoutes<CounterOfferSimState, CounterOfferSSEEvent>({
  startSchema,
  buildProductConfig: () => createCounterOfferSimProductConfig(),
  isEnabled: () => FF_COUNTER_OFFER_SIM,

  transformInput: async (input, session) => {
    const userId = session.user_id as string | undefined;
    if (!userId) return input;

    try {
      const [strategyRows, whyMeRows] = await Promise.all([
        getUserContext(userId, 'positioning_strategy'),
        supabaseAdmin
          .from('why_me_stories')
          .select('colleagues_came_for_what, known_for_what, why_not_me')
          .eq('user_id', userId)
          .maybeSingle()
          .then((r) => r.data),
      ]);

      const platformContext: Record<string, unknown> = {};

      if (strategyRows.length > 0) {
        platformContext.positioning_strategy = strategyRows[0].content;
      }

      if (whyMeRows) {
        const parts: string[] = [];
        if (whyMeRows.known_for_what) {
          parts.push(`Known for: ${whyMeRows.known_for_what}`);
        }
        if (whyMeRows.colleagues_came_for_what) {
          parts.push(`Colleagues come to me for: ${whyMeRows.colleagues_came_for_what}`);
        }
        if (whyMeRows.why_not_me) {
          parts.push(`Why-not-me awareness: ${whyMeRows.why_not_me}`);
        }
        if (parts.length > 0) {
          platformContext.why_me_story = parts.join('\n');
        }
      }

      const result: Record<string, unknown> = { ...input };
      if (Object.keys(platformContext).length > 0) {
        result.platform_context = platformContext;
      }
      return result;
    } catch (err) {
      logger.warn(
        {
          error: err instanceof Error ? err.message : String(err),
          userId,
        },
        'Counter-offer sim: failed to load platform context (continuing without it)',
      );
    }

    return input;
  },
});
