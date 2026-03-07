/**
 * Networking Outreach Agent — Shared types for the networking-outreach product.
 *
 * Agent #13 in the 33-agent platform. Generates personalized LinkedIn
 * connection requests and follow-up message sequences based on the user's
 * resume, positioning strategy, and target contact/company.
 *
 * Pipeline: Researcher → Writer (autonomous, no user gates)
 * Delivery: Full outreach sequence at once
 */

import type { BaseState } from '../runtime/agent-protocol.js';

// ─── Message Types ──────────────────────────────────────────────────

/** Types of outreach messages in a sequence */
export type OutreachMessageType =
  | 'connection_request'
  | 'follow_up_1'
  | 'follow_up_2'
  | 'value_offer'
  | 'meeting_request';

/** All message types in sequence order */
export const MESSAGE_SEQUENCE: OutreachMessageType[] = [
  'connection_request',
  'follow_up_1',
  'follow_up_2',
  'value_offer',
  'meeting_request',
];

/** Human-readable labels for message types */
export const MESSAGE_TYPE_LABELS: Record<OutreachMessageType, string> = {
  connection_request: 'Connection Request',
  follow_up_1: 'Follow-Up #1',
  follow_up_2: 'Follow-Up #2',
  value_offer: 'Value Offer',
  meeting_request: 'Meeting Request',
};

/** Recommended delays between messages */
export const MESSAGE_TIMING: Record<OutreachMessageType, string> = {
  connection_request: 'Send immediately',
  follow_up_1: '3-5 days after connection accepted',
  follow_up_2: '5-7 days after follow-up #1',
  value_offer: '7-10 days after follow-up #2',
  meeting_request: '3-5 days after value offer',
};

// ─── Outreach Message ───────────────────────────────────────────────

export interface OutreachMessage {
  /** Message type in the sequence */
  type: OutreachMessageType;
  /** Message subject (for InMail) or empty for connection requests */
  subject: string;
  /** Full message body */
  body: string;
  /** Character count */
  char_count: number;
  /** Personalization hooks used in this message */
  personalization_hooks: string[];
  /** Recommended timing */
  timing: string;
  /** Quality score (0-100) */
  quality_score: number;
}

// ─── Research Data ──────────────────────────────────────────────────

export interface TargetAnalysis {
  /** Target person's name */
  target_name: string;
  /** Target person's title/role */
  target_title: string;
  /** Target company */
  target_company: string;
  /** What the target likely cares about professionally */
  professional_interests: string[];
  /** Recent activity or achievements (if discoverable) */
  recent_activity: string[];
  /** Industry context */
  industry: string;
  /** Seniority level */
  seniority: string;
}

export interface CommonGround {
  /** Shared experiences, skills, or interests */
  shared_connections: string[];
  /** Industry overlap */
  industry_overlap: string[];
  /** Complementary expertise */
  complementary_expertise: string[];
  /** Mutual challenges or interests */
  mutual_interests: string[];
  /** Best angle for the initial approach */
  recommended_angle: string;
}

export interface ConnectionPath {
  /** Direct connection, 2nd degree, or cold outreach */
  connection_degree: 'direct' | '2nd_degree' | 'cold';
  /** Recommended approach strategy */
  approach_strategy: string;
  /** Why this person is worth connecting with */
  connection_rationale: string;
  /** What value the user can offer this contact */
  value_proposition: string;
  /** Risk level of this outreach (low/medium/high) */
  risk_level: 'low' | 'medium' | 'high';
}

export interface OutreachPlan {
  /** Number of messages in the sequence */
  sequence_length: number;
  /** Which message types to include */
  message_types: OutreachMessageType[];
  /** Overall tone (professional, warm, direct, casual-professional) */
  tone: string;
  /** Key themes to weave through the sequence */
  themes: string[];
  /** What success looks like (meeting, referral, information) */
  goal: string;
}

// ─── Pipeline State ─────────────────────────────────────────────────

export interface NetworkingOutreachState extends BaseState {
  session_id: string;
  user_id: string;
  current_stage: string;

  /** Target contact information (user-provided) */
  target_input?: {
    target_name: string;
    target_title: string;
    target_company: string;
    target_linkedin_url?: string;
    context_notes?: string;
  };

  /** Cross-product context from resume pipeline */
  platform_context?: {
    why_me_story?: {
      colleaguesCameForWhat: string;
      knownForWhat: string;
      whyNotMe: string;
    };
    positioning_strategy?: Record<string, unknown>;
    evidence_items?: Record<string, unknown>[];
  };

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

  /** Target analysis from Researcher agent */
  target_analysis?: TargetAnalysis;

  /** Common ground from Researcher agent */
  common_ground?: CommonGround;

  /** Connection path assessment from Researcher agent */
  connection_path?: ConnectionPath;

  /** Outreach plan from Researcher agent */
  outreach_plan?: OutreachPlan;

  /** Generated messages (populated by Writer agent) */
  messages: OutreachMessage[];

  /** Final assembled sequence report (markdown) */
  final_report?: string;

  /** Overall sequence quality score (0-100) */
  quality_score?: number;
}

// ─── SSE Events ─────────────────────────────────────────────────────

export type NetworkingOutreachSSEEvent =
  | { type: 'stage_start'; stage: string; message: string }
  | { type: 'stage_complete'; stage: string; message: string; duration_ms?: number }
  | { type: 'transparency'; stage: string; message: string }
  | { type: 'message_progress'; message_type: OutreachMessageType; status: 'drafting' | 'reviewing' | 'complete' }
  | { type: 'sequence_complete'; session_id: string; report: string; quality_score: number; message_count: number }
  | { type: 'pipeline_error'; stage: string; error: string };
