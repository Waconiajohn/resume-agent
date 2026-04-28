/**
 * Interview Prep Agent — Shared types for the interview-prep product.
 *
 * Agent #10 in the 33-agent platform. Generates comprehensive interview
 * preparation documents from resume + job description + company research.
 *
 * Pipeline: Researcher → Prep Writer (autonomous, no user gates)
 * Delivery: Full report at once (not streamed section-by-section)
 */

import type { BaseState } from '../runtime/agent-protocol.js';
import type { CareerProfileV2 } from '../../lib/career-profile-context.js';
import type { SharedContext } from '../../contracts/shared-context.js';

// ─── Document Sections ──────────────────────────────────────────────

/** The 9 mandatory sections in every interview prep report (Rule 1) */
export type InterviewPrepSection =
  | 'company_research'
  | 'elevator_pitch'
  | 'requirements_fit'
  | 'technical_questions'
  | 'behavioral_questions'
  | 'three_two_one'
  | 'why_me'
  | 'thirty_sixty_ninety'
  | 'final_tips';

/** All sections in document order */
export const SECTION_ORDER: InterviewPrepSection[] = [
  'company_research',
  'elevator_pitch',
  'requirements_fit',
  'technical_questions',
  'behavioral_questions',
  'three_two_one',
  'why_me',
  'thirty_sixty_ninety',
  'final_tips',
];

/** Written section content with quality metadata */
export interface WrittenSection {
  /** Section identifier */
  section: InterviewPrepSection;
  /** Markdown content (first person, no tables/charts) */
  content: string;
  /** Self-review passed? */
  reviewed: boolean;
  /** Self-review notes (if any quality issues were flagged) */
  review_notes?: string;
  /** Word count for Rule 2 enforcement */
  word_count: number;
}

// ─── Research Data ──────────────────────────────────────────────────

export interface CompanyResearchData {
  company_name: string;
  overview: string;
  revenue_streams: string[];
  industry: string;
  growth_areas: string[];
  risks: string[];
  competitors: Array<{
    name: string;
    differentiation: string;
  }>;
  /**
   * Specific strategic initiatives the company is executing this year
   * (from earnings calls, press releases, or investor materials).
   * More precise than growth_areas — these are named programs or priorities.
   */
  strategic_priorities?: string[];
  /**
   * Observable culture signals: what the company values, how they work,
   * what they reward. Sourced from job postings, Glassdoor, LinkedIn, press.
   */
  culture_signals?: string[];
  /**
   * How this specific role connects to the company's revenue or operations.
   * E.g. "VP of Sales directly owns 40% of ARR" or "COO accountable for
   * operational margin improvement that is the primary driver of 2025 guidance."
   */
  role_impact?: string;
  /** Research source caveat shown to writer when public company data is weak/unverified. */
  source_note?: string;
  /** Source quality flag so writers do not overstate weak company research. */
  source_confidence?: 'verified_web' | 'jd_only' | 'mixed_unverified';
  /** Raw Perplexity response for transparency */
  raw_research?: string;
  /** Raw Perplexity response from the role-intelligence query */
  raw_role_research?: string;
}

export interface InterviewQuestionSource {
  question: string;
  source: string;
  category: 'technical' | 'behavioral' | 'culture_fit' | 'motivation';
}

export interface JobRequirement {
  /** The requirement as stated or extracted from JD */
  requirement: string;
  /** Expanded definition of what this means in practice */
  expanded_definition: string;
  /** Priority rank (1 = most important) */
  rank: number;
}

// ─── Pipeline State ─────────────────────────────────────────────────

export interface InterviewPrepState extends BaseState {
  session_id: string;
  user_id: string;
  current_stage: string;

  /** Job application ID for persistence linkage */
  job_application_id?: string;

  /** Cross-product context from resume pipeline */
  platform_context?: {
    career_profile?: CareerProfileV2;
    /** Why-Me story signals and narrative */
    why_me_story?: {
      colleaguesCameForWhat: string;
      knownForWhat: string;
      whyNotMe: string;
    };
    /** Positioning strategy from Strategist agent */
    positioning_strategy?: Record<string, unknown>;
    /** Evidence items captured during resume sessions */
    evidence_items?: Record<string, unknown>[];
    /** Candidate intelligence from resume pipeline (quantified outcomes, hidden accomplishments) */
    candidate_intelligence?: Record<string, unknown>;
    /** Gap analysis from resume pipeline (requirements, gaps, bridging strategies) */
    gap_analysis?: Record<string, unknown>;
  };

  /** Canonical shared context, populated alongside legacy platform_context during migration */
  shared_context?: SharedContext;

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

  /** Parsed job description */
  jd_analysis?: {
    company_name: string;
    role_title: string;
    requirements: JobRequirement[];
    culture_cues: string[];
    seniority_level: 'director' | 'vp' | 'svp' | 'c_suite' | 'senior_ic' | 'other';
    raw_job_description?: string;
  };

  /** Company research from Perplexity */
  company_research?: CompanyResearchData;

  /** Interview questions sourced from Glassdoor/Reddit/etc */
  sourced_questions?: InterviewQuestionSource[];

  /** Written sections (populated by Prep Writer) */
  sections: Record<InterviewPrepSection, WrittenSection | undefined>;

  /** Final assembled report (markdown) */
  final_report?: string;

  /** Career story fallback: discovery questions if resume lacks detail */
  career_story_questions?: string[];

  /** Quality score from self-review (0-100) */
  quality_score?: number;

  /** Feedback from the user review gate (star_stories_review) */
  revision_feedback?: string;

  /**
   * Feedback loop instrumentation — which stories were used this session.
   * Populated by onComplete from scratchpad after the writer runs.
   * Persisted to interview_prep_reports.stories_used for future correlation.
   */
  stories_used?: {
    /** Stories loaded from the Story Bank at session start */
    existing_count: number;
    /** Stories newly generated and saved to the Story Bank this session */
    saved_count: number;
    /** Themes present in newly saved stories (for aggregation) */
    saved_themes: string[][];
    /** Objections addressed by newly saved stories */
    saved_objections: string[][];
  };

  /** Post-interview documents generated after the interview completes */
  post_interview_docs?: PostInterviewDocs;
}

// ─── Story Bank ─────────────────────────────────────────────────────

/**
 * A single STAR+R story persisted in the user's Story Bank.
 * Accumulates across sessions — each interview prep session reads the bank
 * first so existing stories can be reframed rather than regenerated.
 */
export interface InterviewStory {
  /** The Situation — context and background */
  situation: string;
  /** The Task — what needed to be accomplished */
  task: string;
  /** The Action — what the candidate specifically did */
  action: string;
  /** The Result — measurable outcomes */
  result: string;
  /** The Reflection — what was learned, what would be done differently. MANDATORY. */
  reflection: string;
  /** Thematic tags (e.g., leadership, crisis-management, scale, turnaround) */
  themes: string[];
  /** Which hiring manager objections this story neutralizes */
  objections_addressed: string[];
  /** Job application session ID this story was generated for, or null */
  source_job_id: string | null;
  /** ISO timestamp when this story was generated */
  generated_at: string;
  /** Number of times this story has been used across sessions */
  used_count: number;
}

// ─── Post-Interview Documents ────────────────────────────────────────

export type FollowUpSituation =
  | 'post_interview'
  | 'no_response'
  | 'rejection_graceful'
  | 'keep_warm'
  | 'negotiation_counter';

export interface ThankYouNoteOutput {
  /** Interviewer name */
  interviewer: string;
  /** Interviewer title/role (optional — not always known) */
  interviewer_title: string;
  /** Full note text (first person, email format) */
  note_text: string;
  /** Subject line for email */
  subject_line: string;
  /** Specific discussion points woven in for personalization */
  key_callbacks: string[];
  /** When to send and how */
  timing_guidance: string;
}

export interface FollowUpEmailOutput {
  /** Situation type that triggered this email */
  situation: FollowUpSituation;
  /** Email subject line */
  subject: string;
  /** Full email body */
  body: string;
  /** Notes on tone choices and why */
  tone_notes: string;
  /** When and how to send */
  timing_guidance: string;
}

export interface InterviewDebriefOutput {
  /** Company name */
  company: string;
  /** Role title */
  role: string;
  /** Interview date if provided */
  interview_date?: string;
  /** What the candidate demonstrated well, tied to specific moments */
  strengths_demonstrated: string[];
  /** Honest areas where answers were weak, vague, or missing proof */
  areas_to_improve: string[];
  /** Concrete actions to take before next round or next interview */
  follow_up_items: string[];
  /** What to do differently in the next interview */
  lessons_for_next: string[];
  /** Candidate's read on how it went */
  overall_impression: 'positive' | 'neutral' | 'negative';
  /** Signals gathered about the company or role during the interview */
  company_signals: string[];
}

export interface PostInterviewDocs {
  thank_you_notes?: ThankYouNoteOutput[];
  follow_up_email?: FollowUpEmailOutput;
  debrief?: InterviewDebriefOutput;
}

// ─── SSE Events ─────────────────────────────────────────────────────

export type InterviewPrepSSEEvent =
  | { type: 'stage_start'; stage: string; message: string }
  | { type: 'stage_complete'; stage: string; message: string; duration_ms?: number }
  | { type: 'transparency'; stage: string; message: string }
  | { type: 'right_panel_update'; panelType: string; data: Record<string, unknown> }
  | { type: 'section_progress'; section: InterviewPrepSection; status: 'writing' | 'reviewing' | 'complete' }
  | { type: 'star_stories_review_ready'; session_id: string; report: string; quality_score: number }
  | { type: 'pipeline_gate'; gate: string }
  | { type: 'report_complete'; session_id: string; report: string; quality_score: number }
  | { type: 'pipeline_error'; stage: string; error: string };
