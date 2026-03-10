/**
 * Retirement Bridge Assessment Routes — Phase 6 agent using the generic route factory.
 *
 * Mounted at /api/retirement-bridge/*. Feature-flagged via FF_RETIREMENT_BRIDGE.
 * Runs a single-agent pipeline (Assessor) that generates retirement readiness questions
 * across 7 dimensions, pauses at the 'retirement_assessment' gate for user responses,
 * then evaluates answers to build a RetirementReadinessSummary stored in platform context.
 *
 * Cross-product context: Loads client_profile from onboarding (if available) so questions
 * adapt to career level, industry, and transition type. Loads emotional baseline for tone.
 *
 * FIDUCIARY GUARDRAIL: This route serves an agent that NEVER gives financial advice.
 * All output is framed as observations and questions to explore with a fiduciary planner.
 */

import { z } from 'zod';
import { createProductRoutes } from './product-route-factory.js';
import { createRetirementBridgeProductConfig } from '../agents/retirement-bridge/product.js';
import { FF_RETIREMENT_BRIDGE } from '../lib/feature-flags.js';
import { getUserContext } from '../lib/platform-context.js';
import { getEmotionalBaseline } from '../lib/emotional-baseline.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';
import type { RetirementBridgeState, RetirementBridgeSSEEvent } from '../agents/retirement-bridge/types.js';

const startSchema = z.object({
  session_id: z.string().uuid(),
});

export const retirementBridgeRoutes = createProductRoutes<RetirementBridgeState, RetirementBridgeSSEEvent>({
  startSchema,
  buildProductConfig: () => createRetirementBridgeProductConfig(),
  isEnabled: () => FF_RETIREMENT_BRIDGE,

  onBeforeStart: async (input, _c, _session) => {
    const sessionId = input.session_id as string;
    const { error } = await supabaseAdmin
      .from('coach_sessions')
      .update({ product_type: 'retirement_bridge' })
      .eq('id', sessionId);
    if (error) {
      logger.warn({ session_id: sessionId, error: error.message }, 'Retirement bridge: failed to set product_type');
    }
  },

  transformInput: async (input, session) => {
    const userId = session.user_id as string | undefined;
    if (!userId) return input;

    const transformed: Record<string, unknown> = { ...input };

    try {
      const [baseline, profileRows] = await Promise.all([
        getEmotionalBaseline(userId),
        getUserContext(userId, 'client_profile'),
      ]);

      const platformContext: Record<string, unknown> = {};

      if (profileRows.length > 0) {
        platformContext.client_profile = profileRows[0].content;
      }

      if (Object.keys(platformContext).length > 0) {
        transformed.platform_context = platformContext;
      }
      if (baseline) {
        transformed.emotional_baseline = baseline;
      }
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), userId },
        'RetirementBridge: failed to load platform context (continuing without it)',
      );
    }

    return transformed;
  },
  momentumActivityType: 'retirement_assessment_completed',
});
