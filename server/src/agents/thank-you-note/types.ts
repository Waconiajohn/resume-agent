/**
 * Thank You Note Agent — Shared types for the thank-you-note product.
 *
 * Agent #18 in the 33-agent platform. Analyzes interview context and
 * writes personalized thank-you notes for each interviewer, tailored
 * to format (email, handwritten, LinkedIn message).
 *
 * Pipeline: Writer (single agent)
 * Delivery: Collection of personalized notes with delivery guidance
 */

import type { BaseState } from '../runtime/agent-protocol.js';

// ─── Note Formats ──────────────────────────────────────────────────

/** Supported thank-you note formats */
export type NoteFormat = 'email' | 'handwritten' | 'linkedin_message';

/** All note formats */
export const NOTE_FORMATS: NoteFormat[] = [
  'email',
  'handwritten',
  'linkedin_message',
];

/** Human-readable labels for note formats */
export const NOTE_FORMAT_LABELS: Record<NoteFormat, string> = {
  email: 'Email',
  handwritten: 'Handwritten Note',
  linkedin_message: 'LinkedIn Message',
};

// ─── Interviewer Context ───────────────────────────────────────────

/** Context about a single interviewer */
export interface InterviewerContext {
  /** Interviewer's full name */
  name: string;
  /** Interviewer's title or role */
  title: string;
  /** Topics discussed during the interview */
  topics_discussed: string[];
  /** Notes about rapport or connection points */
  rapport_notes?: string;
  /** Key questions the interviewer asked */
  key_questions?: string[];
}

// ─── Thank You Note ────────────────────────────────────────────────

/** A single generated thank-you note with metadata */
export interface ThankYouNote {
  /** Name of the interviewer this note is for */
  interviewer_name: string;
  /** Title of the interviewer */
  interviewer_title: string;
  /** Format of the note */
  format: NoteFormat;
  /** The note content */
  content: string;
  /** Subject line (for email format only) */
  subject_line?: string;
  /** Notes on how this was personalized */
  personalization_notes: string;
  /** Quality score (0-100) */
  quality_score?: number;
}

// ─── Pipeline State ────────────────────────────────────────────────

/** Shared pipeline state for the thank-you-note agent */
export interface ThankYouNoteState extends BaseState {
  session_id: string;
  user_id: string;
  current_stage: string;

  /** Interviewers to write notes for */
  interviewers: InterviewerContext[];

  /** Context about the interview */
  interview_context: {
    company: string;
    role: string;
    interview_date?: string;
    interview_type?: string;
  };

  /** Generated thank-you notes */
  notes: ThankYouNote[];

  /** Final assembled report (markdown) */
  final_report?: string;

  /** Overall quality score for the note collection (0-100) */
  quality_score?: number;

  /** Parsed resume data */
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

  /** Cross-product context from resume pipeline */
  platform_context?: {
    positioning_strategy?: Record<string, unknown>;
    why_me_story?: string;
  };

  /** Context about the target role and market */
  target_context?: {
    target_role: string;
    target_company: string;
  };
}

// ─── SSE Events ────────────────────────────────────────────────────

/** Discriminated union of all SSE events emitted by the thank-you-note pipeline */
export type ThankYouNoteSSEEvent =
  | { type: 'stage_start'; stage: string; message: string }
  | { type: 'stage_complete'; stage: string; message: string; duration_ms?: number }
  | { type: 'transparency'; stage: string; message: string }
  | { type: 'note_drafted'; interviewer_name: string; format: NoteFormat }
  | { type: 'note_complete'; interviewer_name: string; format: NoteFormat; quality_score: number }
  | { type: 'collection_complete'; session_id: string; report: string; quality_score: number; note_count: number }
  | { type: 'pipeline_error'; stage: string; error: string };
