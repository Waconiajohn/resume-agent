/**
 * Onboarding Assessment Agent — Shared types for the onboarding product.
 *
 * Agent #1 in the 33-agent platform. Conducts a brief 3-5 question assessment
 * when a user first arrives, detects financial segment non-invasively, and
 * produces a Client Profile that flows to every downstream agent via platform
 * context.
 *
 * Pipeline: Assessor (single agent)
 * Delivery: Client Profile + Assessment Summary stored in platform context
 */

import type { BaseState } from '../runtime/agent-protocol.js';
import type { CareerProfileV2 } from '../../lib/career-profile-context.js';

// ─── Financial Segments ────────────────────────────────────────────

/**
 * Detected financial segment — inferred from indirect signals, never asked
 * directly. Informs coaching tone and pacing across all downstream agents.
 */
export type FinancialSegment = 'crisis' | 'stressed' | 'ideal' | 'comfortable';

/** Human-readable labels for financial segments (user-facing) */
export const FINANCIAL_SEGMENT_LABELS: Record<FinancialSegment, string> = {
  crisis: 'Immediate Priority',
  stressed: 'Active Search',
  ideal: 'Strategic Transition',
  comfortable: 'Exploratory',
};

// ─── Career Level ──────────────────────────────────────────────────

/** Career level inferred from title, years of experience, and scope */
export type CareerLevel = 'mid_level' | 'senior' | 'director' | 'vp' | 'c_suite';

// ─── Emotional State ───────────────────────────────────────────────

/**
 * Emotional state mapped to the grief cycle (Coaching Methodology Bible Ch 8).
 * Stored for internal agent adaptation only — never labeled or shown to user.
 */
export type EmotionalState =
  | 'denial'
  | 'anger'
  | 'bargaining'
  | 'depression'
  | 'acceptance'
  | 'growth';

// ─── Assessment Question ───────────────────────────────────────────

/** A single question generated for the assessment conversation */
export interface AssessmentQuestion {
  /** Unique identifier for this question */
  id: string;
  /** The question text shown to the user */
  question: string;
  /** Thematic category this question belongs to */
  category:
    | 'career_context'
    | 'transition_drivers'
    | 'timeline_and_urgency'
    | 'goals_and_aspirations'
    | 'support_needs';
  /** Why we're asking — internal only, not shown to user */
  purpose: string;
  /** Condition under which a follow-up question should be asked */
  follow_up_trigger?: string;
}

// ─── Client Profile ────────────────────────────────────────────────

/**
 * The primary output of the Onboarding Assessment Agent.
 * Stored in platform context and flows to every downstream agent.
 */
export interface ClientProfile {
  /** Career level inferred from role description and years of experience */
  career_level: CareerLevel;
  /** Primary industry extracted from role and company context */
  industry: string;
  /** Approximate years of professional experience */
  years_experience: number;
  /** Financial segment inferred from indirect signals — never asked directly */
  financial_segment: FinancialSegment;
  /** Emotional state mapped to grief cycle — internal use only */
  emotional_state: EmotionalState;
  /** Whether the transition was initiated by employer, candidate, or preemptively */
  transition_type: 'involuntary' | 'voluntary' | 'preemptive';
  /** What the candidate wants from their next role — not what they had */
  goals: string[];
  /** Geographic, compensation, industry, or other non-negotiables */
  constraints: string[];
  /** Strengths the candidate identified for themselves */
  strengths_self_reported: string[];
  /** How urgently the candidate needs to land a role (1 = no rush, 10 = critical) */
  urgency_score: number;
  /** Which product in the platform will deliver the most immediate value */
  recommended_starting_point:
    | 'resume'
    | 'linkedin'
    | 'networking'
    | 'interview_prep'
    | 'career_exploration';
  /** Tone the coaching relationship should use across all downstream agents */
  coaching_tone: 'supportive' | 'direct' | 'motivational';
}

// ─── Assessment Summary ────────────────────────────────────────────

/** Intermediate analysis produced during assessment before the final profile */
export interface AssessmentSummary {
  /** High-value observations about this candidate's situation */
  key_insights: string[];
  /** Indirect signals that informed the financial segment assessment */
  financial_signals: string[];
  /** Language or behavior cues that informed the emotional state assessment */
  emotional_signals: string[];
  /** Prioritized next steps for the candidate */
  recommended_actions: string[];
}

// ─── Pipeline State ────────────────────────────────────────────────

/** Shared pipeline state for the onboarding assessment agent */
export interface OnboardingState extends BaseState {
  session_id: string;
  user_id: string;
  current_stage: string;

  /** Questions generated for this specific user */
  questions: AssessmentQuestion[];

  /** User's responses keyed by question id */
  responses: Record<string, string>;

  /** Intermediate assessment analysis */
  assessment_summary?: AssessmentSummary;

  /** Final output — stored in platform context on completion */
  client_profile?: ClientProfile;
  career_profile?: CareerProfileV2;

  /** Cross-product context from any prior platform interactions */
  platform_context?: {
    positioning_strategy?: Record<string, unknown>;
    prior_profile?: Record<string, unknown>;
    career_profile?: CareerProfileV2;
    why_me_story?: {
      colleaguesCameForWhat: string;
      knownForWhat: string;
      whyNotMe: string;
    };
  };
}

// ─── SSE Events ────────────────────────────────────────────────────

/** Discriminated union of all SSE events emitted by the onboarding pipeline */
export type OnboardingSSEEvent =
  | { type: 'stage_start'; stage: string; message: string }
  | { type: 'stage_complete'; stage: string; message: string; duration_ms?: number }
  | { type: 'transparency'; stage: string; message: string }
  | { type: 'questions_ready'; questions: AssessmentQuestion[] }
  | {
      type: 'assessment_complete';
      session_id: string;
      profile: ClientProfile;
      career_profile?: CareerProfileV2;
      summary: AssessmentSummary;
    }
  | {
      type: 'distress_resources';
      message: string;
      resources: Array<{ name: string; description: string; contact: string }>;
    }
  | { type: 'pipeline_error'; stage: string; error: string };
