/**
 * Content Calendar Agent — Shared types for the content-calendar product.
 *
 * Agent #12 in the 33-agent platform. Generates a 30-day LinkedIn posting
 * plan from resume data, positioning strategy, and industry expertise.
 *
 * Pipeline: Strategist → Writer (autonomous, no user gates)
 * Delivery: Full calendar report at once
 */

import type { BaseState } from '../runtime/agent-protocol.js';

// ─── Content Types ──────────────────────────────────────────────────

/** Content types that make up a balanced posting mix */
export type ContentType =
  | 'thought_leadership'
  | 'storytelling'
  | 'engagement'
  | 'industry_insight'
  | 'how_to'
  | 'case_study'
  | 'career_lesson';

/** All content types in display order */
export const CONTENT_TYPES: ContentType[] = [
  'thought_leadership',
  'storytelling',
  'engagement',
  'industry_insight',
  'how_to',
  'case_study',
  'career_lesson',
];

/** Human-readable labels for content types */
export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  thought_leadership: 'Thought Leadership',
  storytelling: 'Storytelling',
  engagement: 'Engagement',
  industry_insight: 'Industry Insight',
  how_to: 'How-To',
  case_study: 'Case Study',
  career_lesson: 'Career Lesson',
};

/** Days of the week for scheduling */
export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday';

// ─── Content Theme ──────────────────────────────────────────────────

export interface ContentTheme {
  /** Unique theme identifier */
  id: string;
  /** Theme name (e.g., "Digital Transformation Leadership") */
  name: string;
  /** Why this theme matters for the user's positioning */
  rationale: string;
  /** Which content types work best for this theme */
  suggested_types: ContentType[];
  /** Target audience segment */
  audience_segment: string;
  /** Keywords to weave into posts on this theme */
  keywords: string[];
}

// ─── Post Plan ──────────────────────────────────────────────────────

export interface PlannedPost {
  /** Day number (1-30) */
  day: number;
  /** Day of week for this post */
  day_of_week: DayOfWeek;
  /** Content type */
  content_type: ContentType;
  /** Which theme this post supports */
  theme_id: string;
  /** Post hook (first 1-2 lines that stop the scroll) */
  hook: string;
  /** Full post body (including hook) */
  body: string;
  /** Call to action at the end */
  cta: string;
  /** Hashtags (3-5 recommended) */
  hashtags: string[];
  /** Optimal posting time (e.g., "8:00 AM EST") */
  posting_time: string;
  /** Quality score for this individual post (0-100) */
  quality_score: number;
  /** Word count */
  word_count: number;
}

// ─── Content Mix ────────────────────────────────────────────────────

export interface ContentMix {
  /** Target posts per week */
  posts_per_week: number;
  /** Percentage allocation per content type */
  type_distribution: Partial<Record<ContentType, number>>;
  /** Which days to post */
  posting_days: DayOfWeek[];
  /** Rationale for this mix */
  rationale: string;
}

// ─── Analysis Data ──────────────────────────────────────────────────

export interface ExpertiseAnalysis {
  /** User's primary areas of expertise */
  core_expertise: string[];
  /** Industry vertical(s) */
  industries: string[];
  /** Career level / seniority */
  seniority: string;
  /** Unique differentiators from positioning strategy */
  differentiators: string[];
  /** Key achievements that make good post content */
  post_worthy_achievements: string[];
}

export interface AudienceMapping {
  /** Primary audience (e.g., "C-suite executives in manufacturing") */
  primary_audience: string;
  /** Secondary audience */
  secondary_audience: string;
  /** What this audience cares about */
  audience_interests: string[];
  /** Pain points the user can address */
  pain_points: string[];
}

// ─── Pipeline State ─────────────────────────────────────────────────

export interface ContentCalendarState extends BaseState {
  session_id: string;
  user_id: string;
  current_stage: string;

  /** Cross-product context from resume pipeline */
  platform_context?: {
    why_me_story?: {
      colleaguesCameForWhat: string;
      knownForWhat: string;
      whyNotMe: string;
    };
    positioning_strategy?: Record<string, unknown>;
    evidence_items?: Record<string, unknown>[];
    /** LinkedIn optimizer analysis (if available) */
    linkedin_analysis?: {
      keyword_analysis?: Record<string, unknown>;
      profile_analysis?: Record<string, unknown>;
    };
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

  /** Target role/industry context */
  target_context?: {
    target_role: string;
    target_industry: string;
    target_seniority: string;
  };

  /** Expertise analysis from Strategist agent */
  expertise_analysis?: ExpertiseAnalysis;

  /** Audience mapping from Strategist agent */
  audience_mapping?: AudienceMapping;

  /** Content themes identified by Strategist */
  themes?: ContentTheme[];

  /** Content mix plan from Strategist */
  content_mix?: ContentMix;

  /** Generated posts (populated by Writer agent) */
  posts: PlannedPost[];

  /** Final assembled calendar report (markdown) */
  final_report?: string;

  /** Overall calendar quality score (0-100) */
  quality_score?: number;

  /** Calendar coherence score — how well posts flow together (0-100) */
  coherence_score?: number;
}

// ─── SSE Events ─────────────────────────────────────────────────────

export type ContentCalendarSSEEvent =
  | { type: 'stage_start'; stage: string; message: string }
  | { type: 'stage_complete'; stage: string; message: string; duration_ms?: number }
  | { type: 'transparency'; stage: string; message: string }
  | { type: 'theme_identified'; theme_name: string; theme_count: number }
  | { type: 'post_progress'; day: number; total_days: number; content_type: ContentType; status: 'drafting' | 'reviewing' | 'complete' }
  | { type: 'calendar_complete'; session_id: string; report: string; quality_score: number; post_count: number; posts: Array<{ day: number; day_of_week: string; content_type: string; hook: string; body: string; cta: string; hashtags: string[]; posting_time: string; quality_score: number; word_count: number }> }
  | { type: 'pipeline_error'; stage: string; error: string };
