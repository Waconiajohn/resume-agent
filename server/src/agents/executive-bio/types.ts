/**
 * Executive Bio Agent — Shared types for the executive-bio product.
 *
 * Agent #16 in the 33-agent platform. Analyzes executive positioning,
 * then writes polished bios in multiple formats and lengths tailored
 * to the user's target audience and context.
 *
 * Pipeline: Bio Writer (single agent)
 * Delivery: Collection of bios across requested formats and lengths
 */

import type { BaseState } from '../runtime/agent-protocol.js';
import type { CareerProfileV2 } from '../../lib/career-profile-context.js';
import type { SharedContext } from '../../contracts/shared-context.js';

// ─── Bio Formats ────────────────────────────────────────────────────

/** Supported bio format types */
export type BioFormat =
  | 'speaker'
  | 'board'
  | 'advisory'
  | 'professional'
  | 'linkedin_featured';

/** All bio formats in priority order */
export const BIO_FORMATS: BioFormat[] = [
  'speaker',
  'board',
  'advisory',
  'professional',
  'linkedin_featured',
];

/** Human-readable labels for bio formats */
export const BIO_FORMAT_LABELS: Record<BioFormat, string> = {
  speaker: 'Speaker Bio',
  board: 'Board Bio',
  advisory: 'Advisory Bio',
  professional: 'Professional Bio',
  linkedin_featured: 'LinkedIn Featured',
};

// ─── Bio Lengths ────────────────────────────────────────────────────

/** Supported bio length tiers */
export type BioLength = 'micro' | 'short' | 'standard' | 'full';

/** All bio lengths in ascending order */
export const BIO_LENGTHS: BioLength[] = [
  'micro',
  'short',
  'standard',
  'full',
];

/** Human-readable labels for bio lengths */
export const BIO_LENGTH_LABELS: Record<BioLength, string> = {
  micro: 'Micro (50 words)',
  short: 'Short (100 words)',
  standard: 'Standard (250 words)',
  full: 'Full (500 words)',
};

/** Target word counts for each bio length */
export const BIO_LENGTH_TARGETS: Record<BioLength, number> = {
  micro: 50,
  short: 100,
  standard: 250,
  full: 500,
};

// ─── Bio ────────────────────────────────────────────────────────────

/** A single generated bio with metadata */
export interface Bio {
  /** Which format this bio was written for */
  format: BioFormat;
  /** Which length tier this bio targets */
  length: BioLength;
  /** Target word count for this length tier */
  target_words: number;
  /** The bio content */
  content: string;
  /** Actual word count of the generated content */
  actual_words: number;
  /** Overall quality score (0-100) */
  quality_score: number;
  /** Whether the bio is written in first or third person */
  tone: 'first_person' | 'third_person';
  /** How well the bio aligns with the user's positioning strategy (0-100) */
  positioning_alignment: number;
}

// ─── Positioning Analysis ───────────────────────────────────────────

/** Positioning analysis derived from resume data and platform context */
export interface PositioningAnalysis {
  /** The executive's core professional identity */
  core_identity: string;
  /** Top achievements to feature in bios */
  key_achievements: string[];
  /** What sets this executive apart from peers */
  differentiators: string[];
  /** Who the bios are written for */
  target_audience: string;
  /** Recommended tone and voice direction */
  tone_recommendation: string;
  /**
   * True when the career_summary stored in resume_data was synthesized by the LLM
   * from the resume content rather than extracted verbatim. Downstream gates can
   * surface this flag so users know the summary is AI-generated, not a direct quote.
   */
  career_summary_is_synthesized?: boolean;
}

// ─── Pipeline State ─────────────────────────────────────────────────

/** Shared pipeline state for the executive bio agent */
export interface ExecutiveBioState extends BaseState {
  session_id: string;
  user_id: string;
  current_stage: string;

  /** Which bio formats the user wants generated */
  requested_formats: BioFormat[];

  /** Which length tiers to generate per format */
  requested_lengths: BioLength[];

  /** Cross-product context from resume pipeline */
  platform_context?: {
    career_profile?: CareerProfileV2;
    /** Positioning strategy from the resume agent */
    positioning_strategy?: Record<string, unknown>;
    /** Why-me narrative from the resume agent */
    why_me_story?: string | {
      colleaguesCameForWhat: string;
      knownForWhat: string;
      whyNotMe: string;
    };
  };

  /** Canonical shared context, populated alongside legacy platform_context during migration */
  shared_context?: SharedContext;

  /** Context about the target role and market */
  target_context?: {
    /** Target role or title */
    target_role: string;
    /** Target industry */
    target_industry: string;
    /** Target seniority level (e.g. "VP", "Director", "C-suite") */
    target_seniority: string;
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

  /** Positioning analysis derived from resume and context */
  positioning_analysis?: PositioningAnalysis;

  /** All generated bios */
  bios: Bio[];

  /** Final assembled bio collection report (markdown) */
  final_report?: string;

  /** Overall quality score for the bio collection (0-100) */
  quality_score?: number;

  /** User-supplied revision feedback from the bio_review gate */
  revision_feedback?: string;
}

// ─── SSE Events ─────────────────────────────────────────────────────

/** Discriminated union of all SSE events emitted by the executive bio pipeline */
export type ExecutiveBioSSEEvent =
  | { type: 'stage_start'; stage: string; message: string }
  | { type: 'stage_complete'; stage: string; message: string; duration_ms?: number }
  | { type: 'transparency'; stage: string; message: string }
  | { type: 'bio_drafted'; format: BioFormat; length: BioLength; word_count: number }
  | { type: 'bio_complete'; format: BioFormat; length: BioLength; quality_score: number }
  | { type: 'bio_review_ready'; session_id: string; bios: Bio[]; final_report?: string; quality_score?: number }
  | { type: 'pipeline_gate'; gate: string }
  | { type: 'collection_complete'; session_id: string; report: string; quality_score: number; bio_count: number; bios: Bio[]; positioning_analysis?: PositioningAnalysis }
  | { type: 'pipeline_error'; stage: string; error: string };
