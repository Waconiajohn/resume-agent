/**
 * LinkedIn Content Writer — Shared types for the linkedin-content product.
 *
 * Agent #23 in the 33-agent platform. Analyzes a professional's positioning
 * strategy and evidence library to suggest compelling LinkedIn post topics,
 * then writes authentic posts that position them as a thought leader.
 *
 * Pipeline: Strategist (topic/series selection gate) -> Writer (post review gate)
 *
 * Supports two modes:
 * - Single-post: User selects one topic, Writer drafts one post.
 * - Series: Strategist plans a 12-16 post series, user approves the plan,
 *   Writer drafts each post with series continuity context.
 */

import type { BaseState } from '../runtime/agent-protocol.js';
import type { AgentTool } from '../runtime/agent-protocol.js';
import type { CareerProfileV2 } from '../../lib/career-profile-context.js';
import type { SharedContext } from '../../contracts/shared-context.js';

// --- Topic Suggestion ---------------------------------------------------

/** A suggested LinkedIn post topic with hook and rationale */
export interface TopicSuggestion {
  /** Unique identifier for this topic */
  id: string;
  /** The post topic/subject */
  topic: string;
  /** The opening hook line visible in the preview */
  hook: string;
  /** Why this topic positions the user as a thought leader */
  rationale: string;
  /** Which expertise area this showcases */
  expertise_area: string;
  /** Which evidence items from the user's profile support this topic */
  evidence_refs: string[];
}

// --- Series Types -------------------------------------------------------

/**
 * One post in a thought leadership series.
 * Each post stands alone but threads into the series narrative arc.
 */
export interface SeriesPost {
  /** 1-based position in the series */
  post_number: number;
  /** Post title/subject */
  title: string;
  /** Opening line -- must stop the scroll independently */
  hook: string;
  /** 3-5 key points to cover in the post body */
  key_points: string[];
  /** Which resume evidence or experience supports this post's claims */
  evidence_source: string;
  /** Call to action -- the question or invitation at the end */
  cta: string;
  /**
   * Structural role of this post in the series arc.
   * - foundation: establishes shared context, definitions, or stakes
   * - deep_dive: drills into one specific mechanism or principle
   * - case_study: narrates a real situation with before/after outcomes
   * - contrarian: challenges a widely-held belief with evidence
   * - vision: extrapolates forward -- where the domain is heading
   */
  category: 'foundation' | 'deep_dive' | 'case_study' | 'contrarian' | 'vision';
}

/**
 * A full 12-16 post thought leadership series.
 * The series tells a cohesive story across all posts -- each post stands alone
 * but also references the thread that runs through the series.
 */
export interface ContentSeries {
  /** Memorable title for the series (e.g., "The Modern Supply Chain Leader's Playbook") */
  series_title: string;
  /** The overarching narrative thread that ties all posts together */
  series_theme: string;
  /** Total number of posts (12-16) */
  total_posts: number;
  /** Who these posts are written for */
  target_audience: string;
  /**
   * How the series builds across its arc.
   * Describes the intellectual journey: e.g., "Starts with the problem most leaders
   * misdiagnose -> establishes the correct diagnostic framework -> walks through each
   * lever -> closes with the future of the domain"
   */
  series_arc: string;
  /** The ordered posts */
  posts: SeriesPost[];
}

// --- Quality Scores ----------------------------------------------------

/** Quality scores for a LinkedIn post (0-100) */
export interface PostQualityScores {
  /** How authentic and genuine the post sounds (0-100) */
  authenticity: number;
  /** Likelihood of meaningful engagement (0-100) */
  engagement_potential: number;
  /** Keyword density for discoverability (0-100) */
  keyword_density: number;
}

// --- Pipeline State ----------------------------------------------------

export interface LinkedInContentState extends BaseState {
  session_id: string;
  user_id: string;
  current_stage: string;

  /** Cross-product context from prior sessions */
  platform_context?: {
    career_profile?: CareerProfileV2;
    positioning_strategy?: Record<string, unknown>;
    evidence_items?: Record<string, unknown>[];
    career_narrative?: Record<string, unknown>;
  };

  /** Canonical shared context, populated alongside legacy platform_context during migration */
  shared_context?: SharedContext;

  /**
   * Whether the user is in series mode (12-16 part series) vs single-post mode.
   * Set from the initial input. Defaults to false (single-post).
   */
  series_mode?: boolean;

  /**
   * The planned content series, present when series_mode is true and the
   * Strategist has completed the plan_series tool call.
   */
  series_plan?: ContentSeries;

  /**
   * Which post number (1-based) is currently being written in series mode.
   * Undefined in single-post mode.
   */
  current_series_post?: number;

  /** Generated topic suggestions (single-post mode) */
  suggested_topics?: TopicSuggestion[];

  /** The topic chosen by the user (single-post mode) */
  selected_topic?: string;

  /** The drafted LinkedIn post body */
  post_draft?: string;

  /** Hashtags for the post */
  post_hashtags?: string[];

  /** Quality scores from self-review */
  quality_scores?: PostQualityScores;

  /** User-provided feedback for post revision */
  revision_feedback?: string;
}

// --- SSE Events --------------------------------------------------------

export type LinkedInContentSSEEvent =
  | { type: 'stage_start'; stage: string; message: string }
  | { type: 'stage_complete'; stage: string; message: string; duration_ms?: number }
  | { type: 'transparency'; stage: string; message: string }
  | { type: 'topics_ready'; session_id: string; topics: TopicSuggestion[] }
  | { type: 'series_plan_ready'; session_id: string; series: ContentSeries }
  | { type: 'post_draft_ready'; session_id: string; post: string; hashtags: string[]; quality_scores: PostQualityScores; hook_score?: number | null; hook_type?: string | null; hook_assessment?: string | null; series_post_number?: number; series_total?: number }
  | { type: 'post_revised'; session_id: string; post: string; hashtags: string[]; quality_scores: PostQualityScores; hook_score?: number | null; hook_type?: string | null; hook_assessment?: string | null; series_post_number?: number; series_total?: number }
  | { type: 'content_complete'; session_id: string; post: string; hashtags: string[]; quality_scores: PostQualityScores; hook_score?: number | null; hook_type?: string | null; hook_assessment?: string | null; series_plan?: ContentSeries }
  | { type: 'pipeline_error'; stage: string; error: string };

// --- Tool type alias ---------------------------------------------------

export type LinkedInContentTool = AgentTool<LinkedInContentState, LinkedInContentSSEEvent>;
