/**
 * LinkedIn Profile Editor — Shared types for the linkedin-editor product.
 *
 * Agent #22 in the 33-agent platform. Writes and optimizes each LinkedIn
 * profile section in the user's authentic voice, adapting tone based on
 * approved sections. One agent, per-section gates.
 *
 * Workflow: headline → about → experience → skills → education
 * (user approves each section before the next is written)
 */

import type { BaseState } from '../runtime/agent-protocol.js';
import type { AgentTool } from '../runtime/agent-protocol.js';
import type { CareerProfileV2 } from '../../lib/career-profile-context.js';
import type { SharedContext } from '../../contracts/shared-context.js';

// ─── Profile Sections ──────────────────────────────────────────────────

export type ProfileSection = 'headline' | 'about' | 'experience' | 'skills' | 'education';

/** All profile sections in writing order */
export const PROFILE_SECTION_ORDER: ProfileSection[] = [
  'headline',
  'about',
  'experience',
  'skills',
  'education',
];

/** Human-readable labels */
export const PROFILE_SECTION_LABELS: Record<ProfileSection, string> = {
  headline: 'Headline',
  about: 'About Section',
  experience: 'Experience Entries',
  skills: 'Skills & Endorsements',
  education: 'Education',
};

// ─── Quality Scores ────────────────────────────────────────────────────

/** Quality scores for a profile section (0-100) */
export interface SectionQualityScores {
  /** Keyword coverage for the section (0-100) */
  keyword_coverage: number;
  /** Readability and scannability (0-100) */
  readability: number;
  /** Alignment with positioning strategy (0-100) */
  positioning_alignment: number;
  /** Recruiter/hiring-manager five-second scan strength (0-100) */
  five_second_test?: number;
  /** Strength of the visible hook/opening line (0-100) */
  hook_strength?: number;
  /** How strongly this positions the user as a benchmark candidate (0-100) */
  benchmark_strength?: number;
  /** Specificity and source-grounding of proof (0-100) */
  proof_specificity?: number;
  /** LinkedIn recruiter-search keyword/search-result strength (0-100) */
  searchability?: number;
}

// ─── Pipeline State ────────────────────────────────────────────────────

export interface LinkedInEditorState extends BaseState {
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

  /** The user's existing LinkedIn profile text (raw) */
  current_profile?: string;

  /** Analysis of the current profile strengths and gaps */
  analysis?: {
    current_strengths: string[];
    gaps: string[];
    keyword_opportunities: string[];
    tone_observations: string;
  };

  /** Sections that have been approved by the user */
  sections_completed: ProfileSection[];

  /** Approved section content, keyed by section name */
  section_drafts: Partial<Record<ProfileSection, string>>;

  /** User feedback per section (used in revision loop) */
  section_feedback: Partial<Record<ProfileSection, string>>;

  /** Quality scores per section */
  quality_scores: Partial<Record<ProfileSection, SectionQualityScores>>;
}

// ─── SSE Events ────────────────────────────────────────────────────────

export type LinkedInEditorSSEEvent =
  | { type: 'stage_start'; stage: string; message: string }
  | { type: 'stage_complete'; stage: string; message: string; duration_ms?: number }
  | { type: 'transparency'; stage: string; message: string }
  | { type: 'section_draft_ready'; session_id: string; section: ProfileSection; content: string; quality_scores: SectionQualityScores }
  | { type: 'section_revised'; session_id: string; section: ProfileSection; content: string; quality_scores: SectionQualityScores }
  | { type: 'section_approved'; session_id: string; section: ProfileSection }
  | { type: 'editor_complete'; session_id: string; sections: Partial<Record<ProfileSection, string>> }
  | { type: 'pipeline_error'; stage: string; error: string };

// ─── Tool type alias ───────────────────────────────────────────────────

export type LinkedInEditorTool = AgentTool<LinkedInEditorState, LinkedInEditorSSEEvent>;
