/**
 * Networking Message Agent — Shared types.
 *
 * Phase 2.3f: thin, single-agent networking message peer tool.
 * Parallel to the heavier networking-outreach pipeline (unchanged).
 * One session → one recipient → one message.
 */

import type { BaseState } from '../runtime/agent-protocol.js';
import type { CareerProfileV2 } from '../../lib/career-profile-context.js';
import type { SharedContext } from '../../contracts/shared-context.js';

// ─── Vocabularies ─────────────────────────────────────────────────

/** Recipient archetype — a tone/approach hint, not a structural axis. */
export type RecipientType =
  | 'former_colleague'
  | 'second_degree'
  | 'cold'
  | 'referrer'
  | 'other';

export const RECIPIENT_TYPES: RecipientType[] = [
  'former_colleague',
  'second_degree',
  'cold',
  'referrer',
  'other',
];

export const RECIPIENT_TYPE_LABELS: Record<RecipientType, string> = {
  former_colleague: 'Former colleague',
  second_degree: 'Second-degree connection',
  cold: 'Cold outreach',
  referrer: 'Referrer / referral target',
  other: 'Other',
};

/** LinkedIn-aware delivery channel. Drives the character cap. */
export type MessagingMethod = 'connection_request' | 'inmail' | 'group_message';

export const MESSAGING_METHOD_CHAR_CAP: Record<MessagingMethod, number> = {
  connection_request: 300,
  inmail: 1900,
  group_message: 8000,
};

export const MESSAGING_METHOD_LABELS: Record<MessagingMethod, string> = {
  connection_request: 'Connection request (300 chars)',
  inmail: 'InMail (1900 chars)',
  group_message: 'Group message (8000 chars)',
};

export const DEFAULT_MESSAGING_METHOD: MessagingMethod = 'connection_request';

// ─── Target application context ────────────────────────────────────

/** Snapshot of the job_applications row attached by transformInput. */
export interface TargetApplicationContext {
  company_name: string;
  role_title: string;
  /** JD excerpt (truncated in transformInput). Optional — many applications have no JD. */
  jd_excerpt?: string;
  stage?: string;
}

// ─── Message artifact ──────────────────────────────────────────────

export interface NetworkingMessageDraft {
  recipient_name: string;
  recipient_type: RecipientType;
  recipient_title?: string;
  recipient_company?: string;
  recipient_linkedin_url?: string;
  messaging_method: MessagingMethod;
  goal: string;
  context?: string;
  /** Full message body (markdown). */
  message_markdown: string;
  /** Character count of the final message (useful for UI cap enforcement). */
  char_count: number;
}

// ─── Pipeline state ────────────────────────────────────────────────

export interface NetworkingMessageState extends BaseState {
  session_id: string;
  user_id: string;
  current_stage: string;

  /** Required — peer tool is app-scoped. */
  job_application_id: string;

  recipient_name: string;
  recipient_type: RecipientType;
  recipient_title?: string;
  recipient_company?: string;
  recipient_linkedin_url?: string;

  messaging_method: MessagingMethod;
  goal: string;
  context?: string;

  /** Populated by transformInput from the job_applications row. */
  target_application?: TargetApplicationContext;

  /** Draft surfaced at the message_review gate. */
  draft?: NetworkingMessageDraft;

  /** Feedback from the review gate — triggers rerun of the writer. */
  revision_feedback?: string;

  /** Cross-product context (Career Profile / positioning). */
  platform_context?: {
    career_profile?: CareerProfileV2;
    positioning_strategy?: Record<string, unknown>;
    why_me_story?: string | {
      colleaguesCameForWhat: string;
      knownForWhat: string;
      whyNotMe: string;
    };
  };
  shared_context?: SharedContext;
}

// ─── SSE events ────────────────────────────────────────────────────

export type NetworkingMessageSSEEvent =
  | { type: 'stage_start'; stage: string; message: string }
  | { type: 'stage_complete'; stage: string; message: string; duration_ms?: number }
  | { type: 'transparency'; stage: string; message: string }
  | {
      type: 'message_draft_ready';
      session_id: string;
      draft: NetworkingMessageDraft;
    }
  | { type: 'pipeline_gate'; gate: string }
  | {
      type: 'message_complete';
      session_id: string;
      draft: NetworkingMessageDraft;
    }
  | { type: 'pipeline_error'; stage: string; error: string };
