/**
 * Job Finder Routes — Agent #21 using the generic route factory.
 *
 * Mounted at /api/job-finder/*. Feature-flagged via FF_JOB_FINDER.
 * Runs a 2-agent pipeline (Searcher → Ranker) with 1 interactive gate
 * (review_results) after the Ranker completes.
 *
 * Cross-product context: Loads positioning strategy, benchmark candidate,
 * gap analysis, evidence items, career narrative, and industry research
 * from prior resume/research sessions if available.
 */

import { z } from 'zod';
import { createProductRoutes } from './product-route-factory.js';
import { createJobFinderProductConfig } from '../agents/job-finder/product.js';
import { FF_JOB_FINDER } from '../lib/feature-flags.js';
import { loadAgentContextBundle } from '../lib/career-profile-context.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';
import type { JobFinderState, JobFinderSSEEvent } from '../agents/job-finder/types.js';
import { applySharedContextOverride } from '../contracts/shared-context-adapter.js';

const startSchema = z.object({
  session_id: z.string().uuid(),
  resume_text: z.string().min(50).max(100_000).optional(),
});

export const jobFinderRoutes = createProductRoutes<JobFinderState, JobFinderSSEEvent>({
  startSchema,
  buildProductConfig: () => createJobFinderProductConfig(),
  isEnabled: () => FF_JOB_FINDER,

  onBeforeStart: async (input, _c, _session) => {
    const sessionId = input.session_id as string;
    const { error } = await supabaseAdmin
      .from('coach_sessions')
      .update({ product_type: 'job_finder' })
      .eq('id', sessionId);
    if (error) {
      logger.warn({ session_id: sessionId, error: error.message }, 'Job finder: failed to set product_type');
    }
  },

  transformInput: async (input, session) => {
    const userId = session.user_id as string | undefined;
    if (!userId) return input;

    try {
      const { platformContext, emotionalBaseline, sharedContext } = await loadAgentContextBundle(userId, {
        includeCareerProfile: true,
        includePositioningStrategy: true,
        includeBenchmarkCandidate: true,
        includeGapAnalysis: true,
        includeEvidenceItems: true,
        includeCareerNarrative: true,
        includeIndustryResearch: true,
        includeClientProfile: true,
        includeTargetRole: true,
        includeEmotionalBaseline: true,
      });

      const result: Record<string, unknown> = { ...input };
      if (Object.keys(platformContext).length > 0) {
        result.platform_context = platformContext;
      }
      result.shared_context = applySharedContextOverride(sharedContext, {
        artifactTarget: {
          artifactType: 'job_match_list',
          artifactGoal: 'identify and rank target jobs',
          targetAudience: 'candidate',
          successCriteria: ['surface strong-fit roles', 'ground ranking in shared context'],
        },
        workflowState: {
          room: 'job_search',
          stage: 'context_loaded',
          activeTask: 'score job matches against shared positioning and evidence',
        },
      });
      if (emotionalBaseline) {
        result.emotional_baseline = emotionalBaseline;
      }
      return result;
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), userId },
        'Job finder: failed to load platform context (continuing without it)',
      );
    }

    return input;
  },
  momentumActivityType: 'job_search_completed',
});
