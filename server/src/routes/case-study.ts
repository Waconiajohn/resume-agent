/**
 * Case Study Routes — Agent #17 using the generic route factory.
 *
 * Mounted at /api/case-study/*. Feature-flagged via FF_CASE_STUDY.
 * Runs a 2-agent pipeline (Achievement Analyst → Case Study Writer) to analyze
 * executive achievements, select the highest-impact ones, and produce
 * consulting-grade case studies. Autonomous — no user gates.
 *
 * Cross-product context: Loads positioning strategy and evidence items
 * from prior resume sessions if available.
 */

import { z } from 'zod';
import { createProductRoutes } from './product-route-factory.js';
import { createCaseStudyProductConfig } from '../agents/case-study/product.js';
import { FF_CASE_STUDY } from '../lib/feature-flags.js';
import { getUserContext } from '../lib/platform-context.js';
import logger from '../lib/logger.js';
import type { CaseStudyState, CaseStudySSEEvent } from '../agents/case-study/types.js';

const startSchema = z.object({
  session_id: z.string().uuid(),
  resume_text: z.string().min(50).max(100_000),
  target_role: z.string().max(200).optional(),
  target_industry: z.string().max(200).optional(),
  max_case_studies: z.number().min(1).max(10).optional().default(5),
});

export const caseStudyRoutes = createProductRoutes<CaseStudyState, CaseStudySSEEvent>({
  startSchema,
  buildProductConfig: () => createCaseStudyProductConfig(),
  isEnabled: () => FF_CASE_STUDY,

  transformInput: async (input, session) => {
    const userId = session.user_id as string | undefined;
    if (!userId) return input;

    const transformed: Record<string, unknown> = { ...input };

    // Load cross-product platform context
    try {
      const [strategyRows, evidenceRows] = await Promise.all([
        getUserContext(userId, 'positioning_strategy'),
        getUserContext(userId, 'evidence_item'),
      ]);

      const platformContext: Record<string, unknown> = {};

      if (strategyRows.length > 0) {
        platformContext.positioning_strategy = strategyRows[0].content;
      }
      if (evidenceRows.length > 0) {
        platformContext.evidence_items = evidenceRows.map(r => r.content);
      }

      if (Object.keys(platformContext).length > 0) {
        transformed.platform_context = platformContext;
      }
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), userId },
        'Case study: failed to load platform context (continuing without it)',
      );
    }

    // Build target context from flat fields
    if (input.target_role || input.target_industry) {
      transformed.target_context = {
        target_role: String(input.target_role ?? ''),
        target_industry: String(input.target_industry ?? ''),
        target_seniority: '',
      };
    }

    return transformed;
  },
});
