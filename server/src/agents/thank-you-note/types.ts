/**
 * Thank You Note Agent — Shared types for the thank-you-note product.
 *
 * Phase 2.3e: recipient-role primary axis, multi-recipient with
 * independent refinement, soft interview-prep coupling, and timing
 * awareness.
 *
 * Pipeline: single Writer agent (one session per application) +
 * `note_review` gate with per-recipient revision feedback.
 * Delivery: a collection of role-tuned notes with per-note personalization.
 */

import type { BaseState } from '../runtime/agent-protocol.js';
import type { CareerProfileV2 } from '../../lib/career-profile-context.js';
import type { SharedContext } from '../../contracts/shared-context.js';

// ─── Note Formats ──────────────────────────────────────────────────

/** Supported thank-you note delivery channels. Orthogonal to recipient role. */
export type NoteFormat = 'email' | 'handwritten' | 'linkedin_message';

export const NOTE_FORMATS: NoteFormat[] = [
  'email',
  'handwritten',
  'linkedin_message',
];

export const NOTE_FORMAT_LABELS: Record<NoteFormat, string> = {
  email: 'Email',
  handwritten: 'Handwritten Note',
  linkedin_message: 'LinkedIn Message',
};

// ─── Recipient Role ────────────────────────────────────────────────

/**
 * Phase 2.3e — primary axis for tone and emphasis. Each role drives a
 * different draft posture (confirmed fit vs. process navigation vs.
 * peer conversation vs. strategic/brief). `other` falls through to a
 * standard peer/professional tone.
 */
export type RecipientRole =
  | 'hiring_manager'
  | 'recruiter'
  | 'panel_interviewer'
  | 'executive_sponsor'
  | 'other';

export const RECIPIENT_ROLES: RecipientRole[] = [
  'hiring_manager',
  'recruiter',
  'panel_interviewer',
  'executive_sponsor',
  'other',
];

export const RECIPIENT_ROLE_LABELS: Record<RecipientRole, string> = {
  hiring_manager: 'Hiring Manager',
  recruiter: 'Recruiter',
  panel_interviewer: 'Panel Interviewer',
  executive_sponsor: 'Executive Sponsor',
  other: 'Other',
};

// ─── Recipient Context ─────────────────────────────────────────────

/**
 * Context about a single recipient of a thank-you note.
 *
 * Phase 2.3e renamed `InterviewerContext → RecipientContext` and
 * promoted `role` to a required, normalized enum field.
 * `topics_discussed` is now optional (the agent can infer topics from
 * the prior interview-prep excerpt when `source_session_id` was passed).
 */
export interface RecipientContext {
  /** Primary axis — drives tone-by-role logic. */
  role: RecipientRole;
  /** Recipient's full name. */
  name: string;
  /** Recipient's title (optional, role may imply seniority alone). */
  title?: string;
  /** Topics discussed during the interview, if the user captured any. */
  topics_discussed?: string[];
  /** Notes about rapport or connection points. */
  rapport_notes?: string;
  /** Key questions the recipient asked. */
  key_questions?: string[];
}

// ─── Thank You Note ────────────────────────────────────────────────

/** A single generated thank-you note with metadata. */
export interface ThankYouNote {
  /** Normalized role — drives tone/content slant. */
  recipient_role: RecipientRole;
  /** Name of the recipient this note is for. */
  recipient_name: string;
  /** Title of the recipient. Empty string when not provided. */
  recipient_title: string;
  /** Delivery channel. */
  format: NoteFormat;
  /** The note content. */
  content: string;
  /** Subject line (for email format only). */
  subject_line?: string;
  /** Notes on how this was personalized. */
  personalization_notes: string;
  /** Quality score (0-100). */
  quality_score?: number;
}

// ─── Prior Interview-Prep Context (soft coupling) ──────────────────

/**
 * Phase 2.3e — optional snapshot of a prior interview-prep session for
 * this application. When the `source_session_id` input is provided,
 * `transformInput` joins `interview_prep_reports` and attaches the
 * excerpt here so the writer can reference real moments without
 * requiring the user to re-enter conversation topics.
 */
export interface PriorInterviewPrepContext {
  /** Markdown excerpt from interview_prep_reports.report_markdown (truncated ~4000 chars). */
  report_excerpt: string;
  company_name?: string;
  role_title?: string;
  /** ISO timestamp of the prior report row's creation. */
  generated_at?: string;
}

// ─── Activity Signals (timing awareness) ───────────────────────────

/**
 * Phase 2.3e — timing signals computed in `transformInput` from
 * `interview_debriefs`. The agent emits a soft SSE warning when
 * `days_since_interview > 2`; never blocks.
 */
export interface ActivitySignals {
  most_recent_interview_date?: string;
  days_since_interview?: number;
}

// ─── Pipeline State ────────────────────────────────────────────────

/** Shared pipeline state for the thank-you-note agent. */
export interface ThankYouNoteState extends BaseState {
  session_id: string;
  user_id: string;
  current_stage: string;
  job_application_id?: string;

  /** Phase 2.3e — recipients to write notes for (renamed from interviewers). */
  recipients: RecipientContext[];

  /** Context about the interview. */
  interview_context: {
    company: string;
    role: string;
    interview_date?: string;
    interview_type?: string;
  };

  /** Generated thank-you notes. One per recipient at minimum. */
  notes: ThankYouNote[];

  /** Phase 2.3e — optional prior interview-prep context. */
  prior_interview_prep?: PriorInterviewPrepContext;

  /** Phase 2.3e — activity signals driving timing warning. */
  activity_signals: ActivitySignals;

  /**
   * Phase 2.3e — guard to prevent re-emitting the timing warning
   * across reruns triggered by revision feedback.
   */
  timing_warning_emitted?: boolean;

  /** Final assembled report (markdown). */
  final_report?: string;

  /** Overall quality score for the note collection (0-100). */
  quality_score?: number;

  /** Collection-level feedback (kept for back-compat). */
  revision_feedback?: string;

  /**
   * Phase 2.3e — per-recipient feedback, keyed by recipient index.
   * When set, the writer only rewrites the affected note(s); other
   * notes are preserved in `state.notes`.
   */
  revision_feedback_by_recipient?: Record<number, string>;

  /** Parsed resume data. */
  resume_data?: {
    name: string;
    current_title: string;
    career_summary: string;
    key_skills: string[];
    key_achievements: string[];
    work_history: Array<{
      company: string;
      title: string;
      duration: string;
      highlights: string[];
    }>;
  };

  /** Cross-product context from resume pipeline. */
  platform_context?: {
    career_profile?: CareerProfileV2;
    positioning_strategy?: Record<string, unknown>;
    why_me_story?: string | {
      colleaguesCameForWhat: string;
      knownForWhat: string;
      whyNotMe: string;
    };
  };

  /** Canonical shared context. */
  shared_context?: SharedContext;

  /** Target role/company derived from flat input. */
  target_context?: {
    target_role: string;
    target_company: string;
  };
}

// ─── SSE Events ────────────────────────────────────────────────────

/** Discriminated union of all SSE events emitted by the thank-you-note pipeline. */
export type ThankYouNoteSSEEvent =
  | { type: 'stage_start'; stage: string; message: string }
  | { type: 'stage_complete'; stage: string; message: string; duration_ms?: number }
  | { type: 'transparency'; stage: string; message: string }
  | {
      type: 'thank_you_timing_warning';
      session_id: string;
      days_since_interview: number;
      message: string;
    }
  | {
      type: 'note_drafted';
      recipient_name: string;
      recipient_role: RecipientRole;
      format: NoteFormat;
    }
  | {
      type: 'note_complete';
      recipient_name: string;
      recipient_role: RecipientRole;
      format: NoteFormat;
      quality_score: number;
    }
  | {
      type: 'note_review_ready';
      session_id: string;
      notes: ThankYouNote[];
      quality_score: number;
    }
  | { type: 'pipeline_gate'; gate: string }
  | {
      type: 'collection_complete';
      session_id: string;
      report: string;
      quality_score: number;
      note_count: number;
    }
  | { type: 'pipeline_error'; stage: string; error: string };
