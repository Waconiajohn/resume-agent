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
import { getUserContext } from '../lib/platform-context.js';
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
        {
          error: err instanceof Error ? err.message : String(err),
          userId,
        },
        'Interview prep: failed to load platform context (continuing without it)',
      );
    }

    return input;
  },
});
