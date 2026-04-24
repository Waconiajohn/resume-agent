/**
 * Follow-Up Email Agent — Shared types.
 *
 * Phase 2.3d: converts the legacy sync /interview-prep/follow-up-email handler
 * into a first-class peer tool with the SSE agent pattern. A single writer
 * agent drafts a sequence-aware email, a review gate lets the user approve /
 * revise / direct-edit, and multi-turn refinement keeps the flow open until
 * the user is happy with the draft.
 */

import type { BaseState } from '../runtime/agent-protocol.js';

// ─── Tone + situation vocabulary ──────────────────────────────────────

/**
 * Tone variant chosen at /start. The default is derived from followUpNumber
 * (1 → warm, 2 → direct, 3+ → value-add), but the user may override.
 */
export type FollowUpTone = 'warm' | 'direct' | 'value-add';

/**
 * Situation label — retained for symmetry with the legacy endpoint and
 * surfaced in the final artifact so downstream UI can label the email.
 */
export type FollowUpSituation =
  | 'post_interview'
  | 'no_response'
  | 'rejection_graceful'
  | 'keep_warm'
  | 'negotiation_counter';

// ─── Context pulled from DB before the agent runs ─────────────────────

/**
 * Lightweight snapshot of the prior interview-prep session for this
 * application. Attached to state by `transformInput` so the agent can
 * reference topics discussed, evidence used, and commitments made.
 */
export interface PriorInterviewPrepContext {
  /** Markdown summary from interview_prep_reports.report_markdown (truncated). */
  report_excerpt: string;
  /** Company pulled from the prior report row. */
  company_name?: string;
  /** Role pulled from the prior report row. */
  role_title?: string;
  /** ISO timestamp of the prior report's creation. */
  generated_at?: string;
}

/**
 * Post-interview activity signals used to tune tone and urgency. Populated
 * by `transformInput` from `interview_debriefs` + `thank_you_note_reports`.
 */
export interface FollowUpActivitySignals {
  /** Has a thank-you-note report row been persisted for this application? */
  thank_you_sent: boolean;
  /** ISO date of the most recent interview_debriefs.interview_date, if any. */
  most_recent_interview_date?: string;
  /** Whole-days between the most recent interview and now. */
  days_since_interview?: number;
}

// ─── Email artifact ───────────────────────────────────────────────────

export interface FollowUpEmailDraft {
  situation: FollowUpSituation;
  tone: FollowUpTone;
  follow_up_number: number;
  subject: string;
  body: string;
  tone_notes: string;
  timing_guidance: string;
}

// ─── Pipeline state ───────────────────────────────────────────────────

export interface FollowUpEmailState extends BaseState {
  session_id: string;
  user_id: string;
  current_stage: string;

  /** Job application ID — required so we can scope DB lookups to this app. */
  job_application_id?: string;

  /** 1 = first nudge, 2 = second nudge, 3+ = breakup email. */
  follow_up_number: number;

  /** Tone variant chosen up front. */
  tone: FollowUpTone;

  /** Situation label — retained for backward-compat and UI labeling. */
  situation: FollowUpSituation;

  /** Optional inputs forwarded from the caller. */
  company_name?: string;
  role_title?: string;
  recipient_name?: string;
  recipient_title?: string;
  specific_context?: string;

  /** Pre-fetched DB context. */
  prior_interview_prep?: PriorInterviewPrepContext;
  activity_signals: FollowUpActivitySignals;

  /** Final draft surfaced at the review gate. */
  draft?: FollowUpEmailDraft;

  /** Feedback from the email_review gate — when set, the writer re-runs. */
  revision_feedback?: string;
}

// ─── SSE events ───────────────────────────────────────────────────────

export type FollowUpEmailSSEEvent =
  | { type: 'stage_start'; stage: string; message: string }
  | { type: 'stage_complete'; stage: string; message: string; duration_ms?: number }
  | { type: 'transparency'; stage: string; message: string }
  | {
      type: 'email_draft_ready';
      session_id: string;
      draft: FollowUpEmailDraft;
    }
  | { type: 'pipeline_gate'; gate: string }
  | {
      type: 'email_complete';
      session_id: string;
      draft: FollowUpEmailDraft;
    }
  | { type: 'pipeline_error'; stage: string; error: string };

// ─── Defaults ─────────────────────────────────────────────────────────

/**
 * Default tone for a given follow-up number — overrideable by caller input.
 * 1 → warm status check, 2 → direct, 3+ → value-add breakup.
 */
export function defaultToneForFollowUpNumber(n: number): FollowUpTone {
  if (n <= 1) return 'warm';
  if (n === 2) return 'direct';
  return 'value-add';
}

/**
 * Default situation for a given follow-up number. The caller can override;
 * this is what we assume when only followUpNumber is supplied.
 */
export function defaultSituationForFollowUpNumber(n: number): FollowUpSituation {
  if (n <= 1) return 'post_interview';
  if (n === 2) return 'no_response';
  return 'keep_warm';
}
