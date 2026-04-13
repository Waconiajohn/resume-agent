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
import { loadAgentContextBundle } from '../lib/career-profile-context.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import logger from '../lib/logger.js';
import type { CaseStudyState, CaseStudySSEEvent } from '../agents/case-study/types.js';
import { applySharedContextOverride } from '../contracts/shared-context-adapter.js';

const startSchema = z.object({
  session_id: z.string().uuid(),
  resume_text: z.string().min(50).max(100_000),
  focus_areas: z.string().max(500).optional(),
  target_role: z.string().max(200).optional(),
  target_industry: z.string().max(200).optional(),
  max_case_studies: z.number().min(1).max(10).optional().default(5),
});

export const caseStudyRoutes = createProductRoutes<CaseStudyState, CaseStudySSEEvent>({
  startSchema,
  buildProductConfig: () => createCaseStudyProductConfig(),
  isEnabled: () => FF_CASE_STUDY,

  onBeforeStart: async (input, _c, _session) => {
    const sessionId = input.session_id as string;
    const { error } = await supabaseAdmin
      .from('coach_sessions')
      .update({ product_type: 'case_study' })
      .eq('id', sessionId);
    if (error) {
      logger.warn({ session_id: sessionId, error: error.message }, 'Case study: failed to set product_type');
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
        includeEvidenceItems: true,
        includeCareerNarrative: true,
        includeClientProfile: true,
        includeEmotionalBaseline: true,
      });

      if (Object.keys(platformContext).length > 0) {
        transformed.platform_context = platformContext;
      }
      transformed.shared_context = applySharedContextOverride(sharedContext, {
        artifactTarget: {
          artifactType: 'case_study',
          artifactGoal: 'build consulting-grade case studies from supported achievements',
          targetAudience: 'hiring manager or executive decision-maker',
          successCriteria: [
            'ground every case study in evidence',
            'highlight transferable executive impact',
            'avoid unsupported embellishment',
          ],
        },
        workflowState: {
          room: 'case_study',
          stage: 'context_loaded',
          activeTask: 'map shared positioning and evidence into case-study selections',
        },
      });
      if (emotionalBaseline) {
        transformed.emotional_baseline = emotionalBaseline;
      }
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), userId },
        'Case study: failed to load platform context (continuing without it)',
      );
    }

    // Thread focus_areas through directly
    if (input.focus_areas) {
      transformed.focus_areas = String(input.focus_areas);
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

  momentumActivityType: 'case_study_completed',
});

// ─── GET /reports/latest — Fetch most recent case study report ────────────────

caseStudyRoutes.get('/reports/latest', rateLimitMiddleware(30, 60_000), async (c) => {
  if (!FF_CASE_STUDY) {
    return c.json({ error: 'Not found' }, 404);
  }

  const user = c.get('user');

  const { data, error } = await supabaseAdmin
    .from('case_study_reports')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error({ error: error.message, userId: user.id }, 'GET /case-study/reports/latest: query failed');
    return c.json({ error: 'Failed to fetch report' }, 500);
  }
  if (!data) {
    return c.json({ error: 'No reports found' }, 404);
  }

  return c.json({ report: data });
});
