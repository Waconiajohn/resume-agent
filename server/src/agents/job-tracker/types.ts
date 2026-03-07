/**
 * Job Application Tracker Agent — Shared types for the job-tracker product.
 *
 * Agent #14 in the 33-agent platform. Analyzes job applications against
 * the user's resume and positioning, scores fit, generates follow-up
 * messages, and produces portfolio-level analytics.
 *
 * Pipeline: Analyst → Follow-Up Writer (autonomous, no user gates)
 * Delivery: Full tracker report with follow-ups at once
 */

import type { BaseState } from '../runtime/agent-protocol.js';

// ─── Application Status ────────────────────────────────────────────

/** Lifecycle status of a job application */
export type ApplicationStatus =
  | 'applied'
  | 'followed_up'
  | 'interviewing'
  | 'offered'
  | 'rejected'
  | 'ghosted'
  | 'withdrawn';

/** All statuses in lifecycle order */
export const STATUS_SEQUENCE: ApplicationStatus[] = [
  'applied',
  'followed_up',
  'interviewing',
  'offered',
  'rejected',
  'ghosted',
  'withdrawn',
];

/** Human-readable labels for statuses */
export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: 'Applied',
  followed_up: 'Followed Up',
  interviewing: 'Interviewing',
  offered: 'Offer Received',
  rejected: 'Rejected',
  ghosted: 'No Response',
  withdrawn: 'Withdrawn',
};

// ─── Follow-Up Types ───────────────────────────────────────────────

/** Types of follow-up messages the writer generates */
export type FollowUpType =
  | 'initial_follow_up'
  | 'thank_you'
  | 'check_in'
  | 'post_interview';

/** All follow-up types in sequence order */
export const FOLLOW_UP_SEQUENCE: FollowUpType[] = [
  'initial_follow_up',
  'thank_you',
  'check_in',
  'post_interview',
];

/** Human-readable labels for follow-up types */
export const FOLLOW_UP_LABELS: Record<FollowUpType, string> = {
  initial_follow_up: 'Initial Follow-Up',
  thank_you: 'Thank-You Note',
  check_in: 'Check-In',
  post_interview: 'Post-Interview Follow-Up',
};

/** Recommended timing for each follow-up type */
export const FOLLOW_UP_TIMING: Record<FollowUpType, string> = {
  initial_follow_up: '5-7 business days after applying',
  thank_you: 'Within 24 hours of interview',
  check_in: '7-10 business days after last contact',
  post_interview: '1-2 business days after interview',
};

// ─── Application Input ─────────────────────────────────────────────

/** A single job application submitted by the user */
export interface ApplicationInput {
  /** Company name */
  company: string;
  /** Job title/role */
  role: string;
  /** Date applied (ISO string) */
  date_applied: string;
  /** Full job description text */
  jd_text: string;
  /** Current status */
  status: ApplicationStatus;
  /** Optional: URL of the job posting */
  posting_url?: string;
  /** Optional: name of hiring manager or recruiter contact */
  contact_name?: string;
  /** Optional: additional notes from the user */
  notes?: string;
}

// ─── Analysis Data ─────────────────────────────────────────────────

/** Fit analysis for a single application */
export interface ApplicationAnalysis {
  /** Company name */
  company: string;
  /** Role applied for */
  role: string;
  /** Overall fit score (0-100) */
  fit_score: number;
  /** Keyword match percentage between resume and JD */
  keyword_match: number;
  /** Seniority alignment assessment */
  seniority_alignment: 'under' | 'match' | 'over';
  /** Industry relevance (0-100) */
  industry_relevance: number;
  /** How well this aligns with the user's positioning strategy */
  positioning_fit: number;
  /** Key strengths for this application */
  strengths: string[];
  /** Gaps or concerns */
  gaps: string[];
  /** Recommended next action */
  recommended_action: string;
  /** Days since application */
  days_elapsed: number;
  /** Predicted response likelihood (low/medium/high) */
  response_likelihood: 'low' | 'medium' | 'high';
}

/** Portfolio-level analytics across all applications */
export interface PortfolioAnalytics {
  /** Total applications analyzed */
  total_applications: number;
  /** Average fit score across all applications */
  average_fit_score: number;
  /** Applications by status */
  status_breakdown: Record<ApplicationStatus, number>;
  /** Applications by response likelihood */
  likelihood_breakdown: Record<string, number>;
  /** Top 3 strongest applications (by fit score) */
  top_applications: Array<{ company: string; role: string; fit_score: number }>;
  /** Applications that need immediate follow-up */
  follow_up_urgent: Array<{ company: string; role: string; days_elapsed: number }>;
  /** Industry distribution */
  industry_distribution: Record<string, number>;
  /** Overall assessment narrative */
  portfolio_assessment: string;
}

// ─── Follow-Up Messages ────────────────────────────────────────────

/** A generated follow-up message for a specific application */
export interface FollowUpMessage {
  /** Which application this follow-up is for */
  company: string;
  /** Role title */
  role: string;
  /** Type of follow-up */
  type: FollowUpType;
  /** Email subject line */
  subject: string;
  /** Full message body */
  body: string;
  /** Word count */
  word_count: number;
  /** Personalization hooks used */
  personalization_hooks: string[];
  /** Recommended send timing */
  timing: string;
  /** Quality score (0-100) */
  quality_score: number;
}

// ─── Pipeline State ────────────────────────────────────────────────

export interface JobTrackerState extends BaseState {
  session_id: string;
  user_id: string;
  current_stage: string;

  /** Applications submitted by the user */
  applications: ApplicationInput[];

  /** Cross-product context from resume pipeline */
  platform_context?: {
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

  /** Per-application analysis from Analyst agent */
  application_analyses?: ApplicationAnalysis[];

  /** Portfolio-level analytics from Analyst agent */
  portfolio_analytics?: PortfolioAnalytics;

  /** Follow-up timing assessments from Analyst agent */
  follow_up_priorities?: Array<{
    company: string;
    role: string;
    urgency: 'immediate' | 'soon' | 'can_wait' | 'no_action';
    reason: string;
    recommended_type: FollowUpType;
  }>;

  /** Generated follow-up messages (populated by Writer agent) */
  follow_up_messages: FollowUpMessage[];

  /** Final assembled tracker report (markdown) */
  final_report?: string;

  /** Overall portfolio quality score (0-100) */
  quality_score?: number;
}

// ─── SSE Events ────────────────────────────────────────────────────

export type JobTrackerSSEEvent =
  | { type: 'stage_start'; stage: string; message: string }
  | { type: 'stage_complete'; stage: string; message: string; duration_ms?: number }
  | { type: 'transparency'; stage: string; message: string }
  | { type: 'application_analyzed'; company: string; role: string; fit_score: number }
  | { type: 'follow_up_generated'; company: string; role: string; follow_up_type: FollowUpType }
  | { type: 'analytics_updated'; total: number; average_fit: number }
  | { type: 'tracker_complete'; session_id: string; report: string; quality_score: number; application_count: number; follow_up_count: number }
  | { type: 'pipeline_error'; stage: string; error: string };
