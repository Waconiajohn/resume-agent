/**
 * Job Tracker Routes — Agent #14 using the generic route factory.
 *
 * Mounted at /api/job-tracker/*. Feature-flagged via FF_JOB_TRACKER.
 * Runs a 2-agent pipeline (Analyst → Follow-Up Writer) to analyze
 * applications and generate follow-up messages. Autonomous — no user gates.
 *
 * Cross-product context: Loads positioning strategy and evidence items
 * from prior resume sessions if available.
 */

import { z } from 'zod';
import { createProductRoutes } from './product-route-factory.js';
import { createJobTrackerProductConfig } from '../agents/job-tracker/product.js';
import { FF_JOB_TRACKER } from '../lib/feature-flags.js';
import { getUserContext } from '../lib/platform-context.js';
import { getEmotionalBaseline } from '../lib/emotional-baseline.js';
import logger from '../lib/logger.js';
import type { JobTrackerState, JobTrackerSSEEvent } from '../agents/job-tracker/types.js';

const applicationSchema = z.object({
  company: z.string().min(1).max(200),
  role: z.string().min(1).max(200),
  date_applied: z.string().min(1).max(50),
  jd_text: z.string().min(50).max(100_000),
  status: z.enum(['applied', 'followed_up', 'interviewing', 'offered', 'rejected', 'ghosted', 'withdrawn']),
  posting_url: z.string().url().max(500).optional(),
  contact_name: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

const startSchema = z.object({
  session_id: z.string().uuid(),
  resume_text: z.string().min(50).max(100_000),
  applications: z.array(applicationSchema).min(1).max(50),
});

export const jobTrackerRoutes = createProductRoutes<JobTrackerState, JobTrackerSSEEvent>({
  startSchema,
  buildProductConfig: () => createJobTrackerProductConfig(),
  isEnabled: () => FF_JOB_TRACKER,

  transformInput: async (input, session) => {
    const userId = session.user_id as string | undefined;
    if (!userId) return input;

    try {
      const [baseline, strategyRows, evidenceRows] = await Promise.all([
        getEmotionalBaseline(userId),
        getUserContext(userId, 'positioning_strategy'),
        getUserContext(userId, 'evidence_item'),
      ]);

      const platformContext: Record<string, unknown> = {};

      if (strategyRows.length > 0) {
        platformContext.positioning_strategy = strategyRows[0].content;
      }
      if (evidenceRows.length > 0) {
        platformContext.evidence_items = evidenceRows.map((r) => r.content);
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
        'Job tracker: failed to load platform context (continuing without it)',
      );
    }

    return input;
  },
});
