/**
 * LinkedIn Content Writer — Shared types for the linkedin-content product.
 *
 * Agent #23 in the 33-agent platform. Analyzes a professional's positioning
 * strategy and evidence library to suggest compelling LinkedIn post topics,
 * then writes authentic posts that position them as a thought leader.
 *
 * Pipeline: Strategist (topic selection gate) → Writer (post review gate)
 */

import type { BaseState } from '../runtime/agent-protocol.js';
import type { AgentTool } from '../runtime/agent-protocol.js';

// ─── Topic Suggestion ──────────────────────────────────────────────────

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

// ─── Quality Scores ────────────────────────────────────────────────────

/** Quality scores for a LinkedIn post (0-100) */
export interface PostQualityScores {
  /** How authentic and genuine the post sounds (0-100) */
  authenticity: number;
  /** Likelihood of meaningful engagement (0-100) */
  engagement_potential: number;
  /** Keyword density for discoverability (0-100) */
  keyword_density: number;
}

// ─── Pipeline State ────────────────────────────────────────────────────

export interface LinkedInContentState extends BaseState {
  session_id: string;
  user_id: string;
  current_stage: string;

  /** Cross-product context from prior sessions */
  platform_context?: {
    positioning_strategy?: Record<string, unknown>;
    evidence_items?: Record<string, unknown>[];
    career_narrative?: Record<string, unknown>;
  };

  /** Generated topic suggestions */
  suggested_topics?: TopicSuggestion[];

  /** The topic chosen by the user */
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

// ─── SSE Events ────────────────────────────────────────────────────────

export type LinkedInContentSSEEvent =
  | { type: 'stage_start'; stage: string; message: string }
  | { type: 'stage_complete'; stage: string; message: string; duration_ms?: number }
  | { type: 'transparency'; stage: string; message: string }
  | { type: 'topics_ready'; session_id: string; topics: TopicSuggestion[] }
  | { type: 'post_draft_ready'; session_id: string; post: string; hashtags: string[]; quality_scores: PostQualityScores }
  | { type: 'post_revised'; session_id: string; post: string; hashtags: string[]; quality_scores: PostQualityScores }
  | { type: 'content_complete'; session_id: string; post: string; hashtags: string[]; quality_scores: PostQualityScores }
  | { type: 'pipeline_error'; stage: string; error: string };

// ─── Tool type alias ───────────────────────────────────────────────────

export type LinkedInContentTool = AgentTool<LinkedInContentState, LinkedInContentSSEEvent>;
