/**
 * Mock Interview Simulation Routes — using the generic route factory.
 *
 * Mounted at /api/mock-interview/*. Feature-flagged via FF_MOCK_INTERVIEW.
 * Runs a single-agent interactive pipeline (Interviewer) that pauses once
 * per question for the user's answer.
 *
 * Cross-product context: Loads positioning strategy, Why-Me story, and
 * evidence items from prior CareerIQ sessions if available.
 */

import { z } from 'zod';
import { createProductRoutes } from './product-route-factory.js';
import { createMockInterviewProductConfig } from '../agents/interview-prep/simulation/product.js';
import { FF_MOCK_INTERVIEW } from '../lib/feature-flags.js';
import { loadAgentContextBundle } from '../lib/career-profile-context.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';
import type { MockInterviewState, MockInterviewSSEEvent } from '../agents/interview-prep/simulation/types.js';

const startSchema = z.object({
  session_id: z.string().uuid(),
  resume_text: z.string().min(50).max(100_000),
  job_description: z.string().max(50_000).optional(),
  company_name: z.string().max(200).optional(),
  mode: z.enum(['full', 'practice']),
  question_type: z.enum(['behavioral', 'technical', 'situational']).optional(),
});

export const mockInterviewRoutes = createProductRoutes<MockInterviewState, MockInterviewSSEEvent>({
  startSchema,
  buildProductConfig: () => createMockInterviewProductConfig(),
  isEnabled: () => FF_MOCK_INTERVIEW,

  onBeforeStart: async (input, _c, _session) => {
    const sessionId = input.session_id as string;
    const { error } = await supabaseAdmin
      .from('coach_sessions')
      .update({ product_type: 'mock_interview' })
      .eq('id', sessionId);
    if (error) {
      logger.warn({ session_id: sessionId, error: error.message }, 'Mock interview: failed to set product_type');
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
        {
          error: err instanceof Error ? err.message : String(err),
          userId,
        },
        'Mock interview: failed to load platform context (continuing without it)',
      );
    }

    return input;
  },
  momentumActivityType: 'mock_interview_completed',
});
