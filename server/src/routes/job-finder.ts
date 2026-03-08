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
import { getUserContext } from '../lib/platform-context.js';
import { getEmotionalBaseline } from '../lib/emotional-baseline.js';
import logger from '../lib/logger.js';
import type { JobFinderState, JobFinderSSEEvent } from '../agents/job-finder/types.js';

const startSchema = z.object({
  session_id: z.string().uuid(),
  resume_text: z.string().min(50).max(100_000).optional(),
});

export const jobFinderRoutes = createProductRoutes<JobFinderState, JobFinderSSEEvent>({
  startSchema,
  buildProductConfig: () => createJobFinderProductConfig(),
  isEnabled: () => FF_JOB_FINDER,

  transformInput: async (input, session) => {
    const userId = session.user_id as string | undefined;
    if (!userId) return input;

    try {
      const [
        baseline,
        strategyRows,
        benchmarkRows,
        gapRows,
        evidenceRows,
        narrativeRows,
        industryRows,
      ] = await Promise.all([
        getEmotionalBaseline(userId),
        getUserContext(userId, 'positioning_strategy'),
        getUserContext(userId, 'benchmark_candidate'),
        getUserContext(userId, 'gap_analysis'),
        getUserContext(userId, 'evidence_item'),
        getUserContext(userId, 'career_narrative'),
        getUserContext(userId, 'industry_research'),
      ]);

      const platformContext: Record<string, unknown> = {};

      if (strategyRows.length > 0) {
        platformContext.positioning_strategy = strategyRows[0].content;
      }
      if (benchmarkRows.length > 0) {
        platformContext.benchmark_candidate = benchmarkRows[0].content;
      }
      if (gapRows.length > 0) {
        platformContext.gap_analysis = gapRows[0].content;
      }
      if (evidenceRows.length > 0) {
        platformContext.evidence_items = evidenceRows.map((r) => r.content);
      }
      if (narrativeRows.length > 0) {
        platformContext.career_narrative = narrativeRows[0].content;
      }
      if (industryRows.length > 0) {
        platformContext.industry_research = industryRows[0].content;
      }

      const result: Record<string, unknown> = { ...input };
      if (Object.keys(platformContext).length > 0) {
        result.platform_context = platformContext;
      }
      if (baseline) {
        result.emotional_baseline = baseline;
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
});
