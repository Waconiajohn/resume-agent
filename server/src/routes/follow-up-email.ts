/**
 * Follow-Up Email Routes — Phase 2.3d peer tool.
 *
 * Mounted at /api/follow-up-email/*. Feature-flagged via FF_FOLLOW_UP_EMAIL.
 * Single-agent pipeline (Writer) with one review gate (email_review) that
 * supports approve / revise / direct-edit. Multi-turn refinement is bounded
 * by the coordinator's 3-rerun cap.
 *
 * Replaces the legacy sync /interview-prep/follow-up-email handler (kept
 * with a console.warn for one release, then removed).
 */

import { z } from 'zod';
import { createProductRoutes } from './product-route-factory.js';
import { createFollowUpEmailProductConfig } from '../agents/follow-up-email/product.js';
import { FF_FOLLOW_UP_EMAIL } from '../lib/feature-flags.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';
import { loadAgentContextBundle } from '../lib/career-profile-context.js';
import { applySharedContextOverride } from '../contracts/shared-context-adapter.js';
import type {
  FollowUpEmailState,
  FollowUpEmailSSEEvent,
} from '../agents/follow-up-email/types.js';

const startSchema = z.object({
  session_id: z.string().uuid(),
  job_application_id: z.string().uuid(),
  /** 1 = day-7 nudge, 2 = day-14 nudge, 3+ = breakup / value-add. */
  follow_up_number: z.number().int().min(1).max(10).optional(),
  /** Default derives from follow_up_number when omitted. */
  tone: z.enum(['warm', 'direct', 'value-add']).optional(),
  /** Default derives from follow_up_number when omitted. */
  situation: z
    .enum(['post_interview', 'no_response', 'rejection_graceful', 'keep_warm', 'negotiation_counter'])
    .optional(),
  company_name: z.string().min(1).max(500).optional(),
  role_title: z.string().min(1).max(500).optional(),
  recipient_name: z.string().max(200).optional(),
  recipient_title: z.string().max(200).optional(),
  specific_context: z.string().max(5_000).optional(),
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

export const followUpEmailRoutes = createProductRoutes<
  FollowUpEmailState,
  FollowUpEmailSSEEvent
>({
  startSchema,
  buildProductConfig: () => createFollowUpEmailProductConfig(),
  isEnabled: () => FF_FOLLOW_UP_EMAIL,

  onBeforeStart: async (input, _c, _session) => {
    const sessionId = input.session_id as string;
    const jobApplicationId = input.job_application_id as string;
    const { error } = await supabaseAdmin
      .from('coach_sessions')
      .update({
        product_type: 'follow_up_email',
        job_application_id: jobApplicationId,
      })
      .eq('id', sessionId);
    if (error) {
      logger.warn(
        { session_id: sessionId, error: error.message },
        'Follow-up email: failed to set product_type',
      );
    }
  },

  transformInput: async (input, session) => {
    const userId = session.user_id as string | undefined;
    const jobApplicationId = input.job_application_id as string;
    if (!userId) return input;

    const enriched: Record<string, unknown> = { ...input };

    // ── Prior interview-prep report excerpt ──────────────────────────
    try {
      const { data: priorReport } = await supabaseAdmin
        .from('interview_prep_reports')
        .select('company_name, role_title, report_markdown, created_at')
        .eq('user_id', userId)
        .eq('job_application_id', jobApplicationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (priorReport && typeof priorReport.report_markdown === 'string') {
        const excerpt = priorReport.report_markdown.slice(0, REPORT_EXCERPT_MAX_CHARS);
        enriched.prior_interview_prep = {
          report_excerpt: excerpt,
          company_name:
            typeof priorReport.company_name === 'string' ? priorReport.company_name : undefined,
          role_title: typeof priorReport.role_title === 'string' ? priorReport.role_title : undefined,
          generated_at:
            typeof priorReport.created_at === 'string' ? priorReport.created_at : undefined,
        };
        // If caller didn't supply company/role, fall back to the prior report.
        if (!enriched.company_name && typeof priorReport.company_name === 'string') {
          enriched.company_name = priorReport.company_name;
        }
        if (!enriched.role_title && typeof priorReport.role_title === 'string') {
          enriched.role_title = priorReport.role_title;
        }
      }
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), jobApplicationId },
        'Follow-up email: failed to load prior interview-prep report (continuing without it)',
      );
    }

    // ── Activity signals: thank-you sent + most-recent interview date ─
    let thankYouSent = false;
    let mostRecentInterviewDate: string | undefined;
    try {
      const [{ count: thankYouCount }, { data: debriefs }] = await Promise.all([
        supabaseAdmin
          .from('thank_you_note_reports')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('job_application_id', jobApplicationId),
        supabaseAdmin
          .from('interview_debriefs')
          .select('interview_date')
          .eq('user_id', userId)
          .eq('job_application_id', jobApplicationId)
          .order('interview_date', { ascending: false })
          .limit(1),
      ]);

      thankYouSent = (thankYouCount ?? 0) > 0;
      if (debriefs && debriefs.length > 0 && typeof debriefs[0]?.interview_date === 'string') {
        mostRecentInterviewDate = debriefs[0].interview_date;
      }
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), jobApplicationId },
        'Follow-up email: failed to load activity signals (continuing with defaults)',
      );
    }

    enriched.activity_signals = {
      thank_you_sent: thankYouSent,
      most_recent_interview_date: mostRecentInterviewDate,
      days_since_interview: computeDaysSince(mostRecentInterviewDate),
    };

    try {
      const { sharedContext } = await loadAgentContextBundle(userId, {
        includeCareerProfile: true,
        includePositioningStrategy: true,
        includeEvidenceItems: true,
        includeClientProfile: true,
      });

      enriched.shared_context = applySharedContextOverride(sharedContext, {
        artifactTarget: {
          artifactType: 'follow_up_email',
          artifactGoal: 'draft a precise, confident follow-up for a live application',
          targetAudience: 'recruiter, hiring manager, or interviewer',
          successCriteria: [
            'sound specific without desperation',
            'reinforce approved Benchmark Profile proof',
            'avoid unapproved or risky claims',
          ],
        },
        workflowState: {
          room: 'follow_up_email',
          stage: 'context_loaded',
          activeTask: 'turn approved brand context into a concise follow-up',
        },
      });
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), userId },
        'Follow-up email: failed to load shared Career Profile context (continuing without it)',
      );
    }

    return enriched;
  },
});

// ─── Stage-derived default helper ──────────────────────────────────────
//
// Exported for the server-side "reset to default" flow. Matches the rule
// encoded in the migration comment:
//   stage = 'interviewing' AND (thank_you_sent OR days_since_interview > 3)
//     → active
//   stage IN ('offer','closed_won','closed_lost') → inactive
//   otherwise → inactive
//
// Kept in server/ because it needs DB access (thank-you + debrief joins).
// The client-side activation helper in ApplicationWorkspaceRoute only uses
// the explicit user toggle — the stage-derived default is the *server's*
// job to compute when the user asks to reset.

export async function computeFollowUpEmailDefault(
  applicationId: string,
  userId: string,
): Promise<boolean> {
  const { data: app } = await supabaseAdmin
    .from('job_applications')
    .select('stage')
    .eq('id', applicationId)
    .eq('user_id', userId)
    .maybeSingle();

  const stage = (app?.stage as string | undefined) ?? 'saved';

  if (stage === 'offer' || stage === 'closed_won' || stage === 'closed_lost') {
    return false;
  }
  if (stage !== 'interviewing') {
    return false;
  }

  const [{ count: thankYouCount }, { data: debriefs }] = await Promise.all([
    supabaseAdmin
      .from('thank_you_note_reports')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('job_application_id', applicationId),
    supabaseAdmin
      .from('interview_debriefs')
      .select('interview_date')
      .eq('user_id', userId)
      .eq('job_application_id', applicationId)
      .order('interview_date', { ascending: false })
      .limit(1),
  ]);

  if ((thankYouCount ?? 0) > 0) return true;
  const latest = debriefs?.[0]?.interview_date as string | undefined;
  const days = computeDaysSince(latest);
  if (typeof days === 'number' && days > 3) return true;
  return false;
}
