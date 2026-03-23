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
import { loadAgentContextBundle } from '../lib/career-profile-context.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import logger from '../lib/logger.js';
import type { RetirementBridgeState, RetirementBridgeSSEEvent } from '../agents/retirement-bridge/types.js';
import { applySharedContextOverride } from '../contracts/shared-context-adapter.js';

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
      const { platformContext, emotionalBaseline, sharedContext } = await loadAgentContextBundle(userId, {
        includeCareerProfile: true,
        includePositioningStrategy: true,
        includeClientProfile: true,
        includeEmotionalBaseline: true,
      });

      if (Object.keys(platformContext).length > 0) {
        transformed.platform_context = platformContext;
      }
      transformed.shared_context = applySharedContextOverride(sharedContext, {
        artifactTarget: {
          artifactType: 'retirement_bridge',
          artifactGoal: 'assess retirement-readiness questions without giving financial advice',
          targetAudience: 'candidate preparing for a fiduciary planning conversation',
          successCriteria: [
            'surface observations instead of advice',
            'personalize questions from known context',
            'preserve fiduciary guardrails',
          ],
        },
        workflowState: {
          room: 'retirement_bridge',
          stage: 'context_loaded',
          activeTask: 'personalize retirement-readiness assessment from shared context',
        },
      });
      if (emotionalBaseline) {
        transformed.emotional_baseline = emotionalBaseline;
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

retirementBridgeRoutes.get('/reports/latest', rateLimitMiddleware(30, 60_000), async (c) => {
  if (!FF_RETIREMENT_BRIDGE) {
    return c.json({ error: 'Not found' }, 404);
  }

  const user = c.get('user');

  const { data, error } = await supabaseAdmin
    .from('retirement_readiness_assessments')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error({ error: error.message, userId: user.id }, 'GET /retirement-bridge/reports/latest: query failed');
    return c.json({ error: 'Failed to fetch assessment' }, 500);
  }
  if (!data) {
    return c.json({ error: 'No assessments found' }, 404);
  }

  return c.json({ report: data });
});

retirementBridgeRoutes.get('/reports/session/:sessionId', rateLimitMiddleware(30, 60_000), async (c) => {
  if (!FF_RETIREMENT_BRIDGE) {
    return c.json({ error: 'Not found' }, 404);
  }

  const user = c.get('user');
  const sessionId = c.req.param('sessionId');
  const parsed = z.string().uuid().safeParse(sessionId);
  if (!parsed.success) {
    return c.json({ error: 'Invalid session id' }, 400);
  }

  const { data, error } = await supabaseAdmin
    .from('retirement_readiness_assessments')
    .select('*')
    .eq('user_id', user.id)
    .eq('session_id', parsed.data)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error({ error: error.message, userId: user.id, sessionId: parsed.data }, 'GET /retirement-bridge/reports/session/:sessionId: query failed');
    return c.json({ error: 'Failed to fetch assessment' }, 500);
  }
  if (!data) {
    return c.json({ error: 'No assessment found for session' }, 404);
  }

  return c.json({ report: data });
});
