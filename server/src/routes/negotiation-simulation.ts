/**
 * Negotiation Simulation Routes — using the generic route factory.
 *
 * Mounted at /api/negotiation-simulation/*. Feature-flagged via
 * FF_NEGOTIATION_SIMULATION. Shares the same feature flag as
 * FF_SALARY_NEGOTIATION since it is a companion experience.
 *
 * Runs a single-agent interactive pipeline (Employer) that pauses
 * once per round for the candidate's counter-response.
 *
 * Cross-product context: Loads positioning strategy and career narrative
 * from prior CareerIQ sessions if available.
 */

import { z } from 'zod';
import { createProductRoutes } from './product-route-factory.js';
import { createNegotiationSimulationProductConfig } from '../agents/salary-negotiation/simulation/product.js';
import { FF_SALARY_NEGOTIATION } from '../lib/feature-flags.js';
import { loadAgentContextBundle } from '../lib/career-profile-context.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';
import type {
  NegotiationSimulationState,
  NegotiationSimulationSSEEvent,
} from '../agents/salary-negotiation/simulation/types.js';
import { applySharedContextOverride } from '../contracts/shared-context-adapter.js';

const startSchema = z.object({
  session_id: z.string().uuid(),
  offer_company: z.string().min(1).max(200),
  offer_role: z.string().min(1).max(200),
  offer_base_salary: z.number().optional(),
  offer_total_comp: z.number().optional(),
  offer_equity_details: z.string().max(2000).optional(),
  mode: z.enum(['full', 'practice']),
  /** Serialised MarketResearch from a prior salary-negotiation session (optional) */
  market_research: z.record(z.string(), z.unknown()).optional(),
  /** Serialised LeveragePoint array from a prior session (optional) */
  leverage_points: z.array(z.record(z.string(), z.unknown())).optional(),
  /** Candidate target numbers from the strategy review gate (optional) */
  candidate_targets: z.object({
    target_base: z.number().optional(),
    walk_away_base: z.number().optional(),
  }).optional(),
});

export const negotiationSimulationRoutes = createProductRoutes<
  NegotiationSimulationState,
  NegotiationSimulationSSEEvent
>({
  startSchema,
  buildProductConfig: () => createNegotiationSimulationProductConfig(),
  isEnabled: () => FF_SALARY_NEGOTIATION,

  onBeforeStart: async (input, _c, _session) => {
    const sessionId = input.session_id as string;
    const { error } = await supabaseAdmin
      .from('coach_sessions')
      .update({ product_type: 'negotiation_simulation' })
      .eq('id', sessionId);
    if (error) {
      logger.warn(
        { session_id: sessionId, error: error.message },
        'Negotiation simulation: failed to set product_type',
      );
    }
  },

  transformInput: async (input, session) => {
    const userId = session.user_id as string | undefined;
    if (!userId) return input;

    try {
      const { platformContext, sharedContext } = await loadAgentContextBundle(userId, {
        includePositioningStrategy: true,
        includeCareerNarrative: true,
        includeWhyMeStory: true,
        includeClientProfile: true,
      });

      const result: Record<string, unknown> = { ...input };

      if (Object.keys(platformContext).length > 0) {
        result.platform_context = {
          positioning_strategy: platformContext.positioning_strategy,
          why_me_story: platformContext.why_me_story,
        };
      }

      result.shared_context = applySharedContextOverride(sharedContext, {
        artifactTarget: {
          artifactType: 'negotiation_simulation',
          artifactGoal: 'conduct an interactive salary negotiation simulation',
          targetAudience: 'candidate',
          successCriteria: [
            'present realistic employer positions',
            'evaluate candidate responses against negotiation best practices',
            'deliver actionable coaching feedback per round',
          ],
        },
        workflowState: {
          room: 'salary_negotiation',
          stage: 'simulation',
          activeTask: 'simulate employer negotiation positions and evaluate candidate counters',
        },
      });

      return result;
    } catch (err) {
      logger.warn(
        {
          error: err instanceof Error ? err.message : String(err),
          userId,
        },
        'Negotiation simulation: failed to load platform context (continuing without it)',
      );
    }

    return input;
  },
  momentumActivityType: 'counter_offer_sim_completed',
});
