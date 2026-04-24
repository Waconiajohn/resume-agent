/**
 * Thank You Note Routes — Agent #18 using the generic route factory.
 *
 * Mounted at /api/thank-you-note/*. Feature-flagged via FF_THANK_YOU_NOTE.
 *
 * Phase 2.3e: recipient-role primary axis, multi-recipient with
 * independent refinement, soft interview-prep coupling, timing awareness.
 * Single Writer agent, single `note_review` gate with per-recipient
 * revision feedback.
 *
 * Cross-product context pulled in transformInput:
 * - Career Profile, positioning, shared context (as before)
 * - NEW: prior interview-prep report excerpt (when source_session_id provided)
 * - NEW: days-since-interview activity signal (from interview_debriefs)
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
import { applySharedContextOverride } from '../contracts/shared-context-adapter.js';

const RECIPIENT_ROLES_TUPLE = [
  'hiring_manager',
  'recruiter',
  'panel_interviewer',
  'executive_sponsor',
  'other',
] as const;

const recipientSchema = z.object({
  role: z.enum(RECIPIENT_ROLES_TUPLE),
  name: z.string().min(1).max(200),
  title: z.string().max(200).optional(),
  topics_discussed: z.array(z.string().max(500)).max(20).optional(),
  rapport_notes: z.string().max(1000).optional(),
  key_questions: z.array(z.string().max(500)).max(20).optional(),
});

const startSchema = z.object({
  session_id: z.string().uuid(),
  job_application_id: z.string().uuid(),
  resume_text: z.string().min(50).max(100_000),
  company: z.string().max(200),
  role: z.string().max(200),
  interview_date: z.string().optional(),
  interview_type: z.string().max(100).optional(),
  source_session_id: z.string().uuid().optional(),
  recipients: z.array(recipientSchema).min(1).max(10),
});

const REPORT_EXCERPT_MAX_CHARS = 4_000;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

function computeDaysSince(isoDate: string | null | undefined): number | undefined {
  if (!isoDate) return undefined;
  const t = Date.parse(isoDate);
  if (!Number.isFinite(t)) return undefined;
  const diff = Date.now() - t;
  return Math.max(0, Math.floor(diff / MS_PER_DAY));
}

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
    const jobApplicationId = typeof input.job_application_id === 'string' ? input.job_application_id : null;
    const sourceSessionId = typeof input.source_session_id === 'string' ? input.source_session_id : null;

    // ── Career Profile + shared context (existing behavior) ──────────
    try {
      const { platformContext, emotionalBaseline, sharedContext } = await loadAgentContextBundle(userId, {
        includeCareerProfile: true,
        includePositioningStrategy: true,
        includeCareerNarrative: true,
        includeWhyMeStory: true,
        includeClientProfile: true,
        includeEmotionalBaseline: true,
      });

      if (Object.keys(platformContext).length > 0) {
        transformed.platform_context = platformContext;
      }
      transformed.shared_context = applySharedContextOverride(sharedContext, {
        artifactTarget: {
          artifactType: 'thank_you_note',
          artifactGoal: 'draft post-interview thank-you notes',
          targetAudience: 'interviewer',
          successCriteria: [
            'sound specific and human',
            'reinforce fit without overclaiming',
            'match the shared career narrative',
          ],
        },
        workflowState: {
          room: 'thank_you_note',
          stage: 'context_loaded',
          activeTask: 'turn interview context into tailored follow-up notes',
        },
      });
      if (emotionalBaseline) {
        transformed.emotional_baseline = emotionalBaseline;
      }
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), userId },
        'Thank-you note: failed to load Career Profile context (continuing without it)',
      );
    }

    // ── Phase 2.3e: Prior interview-prep excerpt (soft coupling) ─────
    if (sourceSessionId) {
      try {
        const { data: priorReport } = await supabaseAdmin
          .from('interview_prep_reports')
          .select('company_name, role_title, report_markdown, created_at')
          .eq('user_id', userId)
          .eq('session_id', sourceSessionId)
          .maybeSingle();

        if (priorReport && typeof priorReport.report_markdown === 'string') {
          transformed.prior_interview_prep = {
            report_excerpt: priorReport.report_markdown.slice(0, REPORT_EXCERPT_MAX_CHARS),
            company_name:
              typeof priorReport.company_name === 'string' ? priorReport.company_name : undefined,
            role_title:
              typeof priorReport.role_title === 'string' ? priorReport.role_title : undefined,
            generated_at:
              typeof priorReport.created_at === 'string' ? priorReport.created_at : undefined,
          };
        }
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err), sourceSessionId },
          'Thank-you note: failed to load prior interview-prep report (continuing without it)',
        );
      }
    }

    // ── Phase 2.3e: Activity signals (timing awareness) ──────────────
    if (jobApplicationId) {
      try {
        const { data: debriefs } = await supabaseAdmin
          .from('interview_debriefs')
          .select('interview_date')
          .eq('user_id', userId)
          .eq('job_application_id', jobApplicationId)
          .order('interview_date', { ascending: false })
          .limit(1);

        const latest = debriefs && debriefs.length > 0 ? (debriefs[0]?.interview_date as string | undefined) : undefined;
        transformed.activity_signals = {
          most_recent_interview_date: latest,
          days_since_interview: computeDaysSince(latest),
        };
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err), jobApplicationId },
          'Thank-you note: failed to load activity signals (continuing with defaults)',
        );
        transformed.activity_signals = {};
      }
    } else {
      transformed.activity_signals = {};
    }

    // Build target_context from flat fields (existing behavior).
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
  // "no reports yet" is a cache-miss, not an error. Returning 200 { report: null }
  // keeps the browser network panel clean and matches usePriorResult's expectations.
  return c.json({ report: data ?? null });
});

thankYouNoteRoutes.get('/reports/session/:sessionId', rateLimitMiddleware(30, 60_000), async (c) => {
  if (!FF_THANK_YOU_NOTE) {
    return c.json({ error: 'Not found' }, 404);
  }

  const user = c.get('user');
  const sessionId = c.req.param('sessionId') ?? '';
  const parsed = z.string().uuid().safeParse(sessionId);
  if (!parsed.success) {
    return c.json({ error: 'Invalid session id' }, 400);
  }

  const { data, error } = await supabaseAdmin
    .from('thank_you_note_reports')
    .select('*')
    .eq('user_id', user.id)
    .eq('session_id', parsed.data)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error({ error: error.message, userId: user.id, sessionId: parsed.data }, 'GET /thank-you-note/reports/session/:sessionId: query failed');
    return c.json({ error: 'Failed to fetch report' }, 500);
  }
  if (!data) {
    return c.json({ error: 'No reports found' }, 404);
  }

  return c.json({ report: data });
});
