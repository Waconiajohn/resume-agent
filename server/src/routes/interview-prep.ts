/**
 * Interview Prep Routes — Agent #10 using the generic route factory.
 *
 * Mounted at /api/interview-prep/*. Feature-flagged via FF_INTERVIEW_PREP.
 * Runs a 2-agent pipeline (Researcher → Writer) to generate comprehensive
 * interview preparation documents. Autonomous — no user gates.
 *
 * Cross-product context: Loads Why-Me story, positioning strategy, and
 * evidence items from prior resume sessions if available.
 */

import { z } from 'zod';
import { createProductRoutes } from './product-route-factory.js';
import { createInterviewPrepProductConfig } from '../agents/interview-prep/product.js';
import { FF_INTERVIEW_PREP } from '../lib/feature-flags.js';
import { loadAgentContextBundle } from '../lib/career-profile-context.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';
import type { InterviewPrepState, InterviewPrepSSEEvent } from '../agents/interview-prep/types.js';

const startSchema = z.object({
  session_id: z.string().uuid(),
  resume_text: z.string().min(50).max(100_000),
  job_description: z.string().min(1).max(50_000),
  company_name: z.string().min(1).max(200),
  job_application_id: z.string().uuid().optional(),
});

export const interviewPrepRoutes = createProductRoutes<InterviewPrepState, InterviewPrepSSEEvent>({
  startSchema,
  buildProductConfig: () => createInterviewPrepProductConfig(),
  isEnabled: () => FF_INTERVIEW_PREP,

  onBeforeStart: async (input, _c, _session) => {
    const sessionId = input.session_id as string;
    const jobApplicationId = typeof input.job_application_id === 'string' ? input.job_application_id : null;
    const { error } = await supabaseAdmin
      .from('coach_sessions')
      .update({
        product_type: 'interview_prep',
        ...(jobApplicationId ? { job_application_id: jobApplicationId } : {}),
      })
      .eq('id', sessionId);
    if (error) {
      logger.warn({ session_id: sessionId, error: error.message }, 'Interview prep: failed to set product_type');
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
        'Interview prep: failed to load platform context (continuing without it)',
      );
    }

    return input;
  },

  momentumActivityType: 'interview_prep_completed',
});
