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
  /** Raw Perplexity response for transparency */
  raw_research?: string;
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
