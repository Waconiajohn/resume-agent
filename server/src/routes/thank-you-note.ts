/**
 * Thank You Note Routes — Agent #18 using the generic route factory.
 *
 * Mounted at /api/thank-you-note/*. Feature-flagged via FF_THANK_YOU_NOTE.
 * Runs a single-agent pipeline (Writer) to analyze interview context
 * and write personalized thank-you notes for each interviewer.
 * Autonomous — no user gates.
 *
 * Cross-product context: Loads the shared Career Profile and positioning
 * context from prior work if available.
 */

import { z } from 'zod';
import { createProductRoutes } from './product-route-factory.js';
import { createThankYouNoteProductConfig } from '../agents/thank-you-note/product.js';
import { FF_THANK_YOU_NOTE } from '../lib/feature-flags.js';
import { loadAgentContextBundle } from '../lib/career-profile-context.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import logger from '../lib/logger.js';
import type { ThankYouNoteState, ThankYouNoteSSEEvent } from '../agents/thank-you-note/types.js';

const startSchema = z.object({
  session_id: z.string().uuid(),
  resume_text: z.string().min(50).max(100_000),
  company: z.string().max(200),
  role: z.string().max(200),
  interview_date: z.string().optional(),
  interview_type: z.string().max(100).optional(),
  job_application_id: z.string().uuid().optional(),
  interviewers: z.array(
    z.object({
      name: z.string().max(200),
      title: z.string().max(200),
      topics_discussed: z.array(z.string().max(500)),
      rapport_notes: z.string().max(1000).optional(),
      key_questions: z.array(z.string().max(500)).optional(),
    }),
  ).min(1),
});

export const thankYouNoteRoutes = createProductRoutes<ThankYouNoteState, ThankYouNoteSSEEvent>({
  startSchema,
  buildProductConfig: () => createThankYouNoteProductConfig(),
  isEnabled: () => FF_THANK_YOU_NOTE,

  onBeforeStart: async (input, _c, _session) => {
    const sessionId = input.session_id as string;
    const jobApplicationId = typeof input.job_application_id === 'string' ? input.job_application_id : null;
    const { error } = await supabaseAdmin
      .from('coach_sessions')
      .update({
        product_type: 'thank_you_note',
        ...(jobApplicationId ? { job_application_id: jobApplicationId } : {}),
      })
      .eq('id', sessionId);
    if (error) {
      logger.warn({ session_id: sessionId, error: error.message }, 'Thank-you note: failed to set product_type');
    }
  },

  transformInput: async (input, session) => {
    const userId = session.user_id as string | undefined;
    if (!userId) return input;

    const transformed: Record<string, unknown> = { ...input };

    try {
      const { platformContext, emotionalBaseline } = await loadAgentContextBundle(userId, {
        includeCareerProfile: true,
        includePositioningStrategy: true,
        includeWhyMeStory: true,
        includeEmotionalBaseline: true,
      });

      if (Object.keys(platformContext).length > 0) {
        transformed.platform_context = platformContext;
      }
      if (emotionalBaseline) {
        transformed.emotional_baseline = emotionalBaseline;
      }
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), userId },
        'Thank-you note: failed to load Career Profile context (continuing without it)',
      );
    }

    // Build target_context from flat fields
    if (input.company || input.role) {
      transformed.target_context = {
        target_role: String(input.role ?? ''),
        target_company: String(input.company ?? ''),
      };
    }

    return transformed;
  },

  momentumActivityType: 'thank_you_note_completed',
});

// ─── GET /reports/latest — Fetch most recent thank-you note report ────────────

thankYouNoteRoutes.get('/reports/latest', rateLimitMiddleware(30, 60_000), async (c) => {
  if (!FF_THANK_YOU_NOTE) {
    return c.json({ error: 'Not found' }, 404);
  }

  const user = c.get('user');

  const { data, error } = await supabaseAdmin
    .from('thank_you_note_reports')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error({ error: error.message, userId: user.id }, 'GET /thank-you-note/reports/latest: query failed');
    return c.json({ error: 'Failed to fetch report' }, 500);
  }
  if (!data) {
    return c.json({ error: 'No reports found' }, 404);
  }

  return c.json({ report: data });
});
