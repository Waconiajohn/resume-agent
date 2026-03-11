/**
 * Personal Brand Audit Agent — Shared types for the personal-brand product.
 *
 * Agent #19 in the 33-agent platform. Audits executive personal brand
 * across multiple touchpoints (resume, LinkedIn, bio, website, portfolio),
 * scores consistency, identifies gaps, and produces actionable
 * recommendations for brand coherence.
 *
 * Pipeline: Brand Auditor -> Brand Advisor
 * Delivery: Brand audit report with consistency scores and recommendations
 */

import type { BaseState } from '../runtime/agent-protocol.js';

// --- Brand Sources --------------------------------------------------------

/** Supported brand source types */
export type BrandSource =
  | 'resume'
  | 'linkedin'
  | 'bio'
  | 'website'
  | 'portfolio';

/** All brand sources in priority order */
export const BRAND_SOURCES: BrandSource[] = [
  'resume',
  'linkedin',
  'bio',
  'website',
  'portfolio',
];

/** Human-readable labels for brand sources */
export const BRAND_SOURCE_LABELS: Record<BrandSource, string> = {
  resume: 'Resume',
  linkedin: 'LinkedIn Profile',
  bio: 'Professional Bio',
  website: 'Personal Website',
  portfolio: 'Portfolio',
};

/** Input content from a brand source */
export interface BrandSourceInput {
  /** Which source this content comes from */
  source: BrandSource;
  /** Raw text content from the source */
  content: string;
}

// --- Finding Categories ---------------------------------------------------

/** Supported finding category types */
export type FindingCategory =
  | 'messaging_inconsistency'
  | 'value_prop_gap'
  | 'tone_mismatch'
  | 'missing_element'
  | 'outdated_content'
  | 'audience_misalignment';

/** All finding categories */
export const FINDING_CATEGORIES: FindingCategory[] = [
  'messaging_inconsistency',
  'value_prop_gap',
  'tone_mismatch',
  'missing_element',
  'outdated_content',
  'audience_misalignment',
];

/** Human-readable labels for finding categories */
export const FINDING_CATEGORY_LABELS: Record<FindingCategory, string> = {
  messaging_inconsistency: 'Messaging Inconsistency',
  value_prop_gap: 'Value Proposition Gap',
  tone_mismatch: 'Tone Mismatch',
  missing_element: 'Missing Element',
  outdated_content: 'Outdated Content',
  audience_misalignment: 'Audience Misalignment',
};

// --- Audit Finding --------------------------------------------------------

/** A single finding from the brand audit */
export interface AuditFinding {
  /** Unique identifier for this finding */
  id: string;
  /** Category of the finding */
  category: FindingCategory;
  /** Severity level */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Short headline describing the finding */
  title: string;
  /** Detailed description of what was found */
  description: string;
  /** Which brand source this finding relates to */
  source: BrandSource;
  /** Specific elements affected (e.g., "headline", "summary section") */
  affected_elements: string[];
  /** Actionable recommendation to address this finding */
  recommendation: string;
}

// --- Consistency Scores ---------------------------------------------------

/** Cross-source consistency scores */
export interface ConsistencyScores {
  /** Overall consistency across all sources (0-100) */
  overall: number;
  /** How well core messages align across sources (0-100) */
  messaging: number;
  /** Clarity and consistency of value proposition (0-100) */
  value_proposition: number;
  /** Consistency of tone and voice (0-100) */
  tone_voice: number;
  /** How well content speaks to the target audience (0-100) */
  audience_alignment: number;
  /** Consistency of visual identity signals (0-100) */
  visual_identity: number;
}

// --- Brand Recommendation -------------------------------------------------

/** A prioritized recommendation for brand improvement */
export interface BrandRecommendation {
  /** Priority rank (1 = highest) */
  priority: number;
  /** Category of the recommendation */
  category: string;
  /** Short headline */
  title: string;
  /** Detailed description of what to do */
  description: string;
  /** Estimated effort to implement */
  effort: 'low' | 'medium' | 'high';
  /** Expected impact of the change */
  impact: 'low' | 'medium' | 'high';
  /** Which brand sources this recommendation affects */
  affected_sources: BrandSource[];
}

// --- Pipeline State -------------------------------------------------------

/** Shared pipeline state for the personal brand audit agent */
export interface PersonalBrandState extends BaseState {
  session_id: string;
  user_id: string;
  current_stage: string;

  /** Brand source inputs provided by the user */
  brand_sources: BrandSourceInput[];

  /** Findings identified during the audit */
  audit_findings: AuditFinding[];

  /** Cross-source consistency scores */
  consistency_scores?: ConsistencyScores;

  /** Prioritized recommendations from the advisor */
  recommendations: BrandRecommendation[];

  /** Final assembled audit report (markdown) */
  final_report?: string;

  /** Overall quality score for the audit (0-100) */
  quality_score?: number;

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

  /** Cross-product context from the resume pipeline */
  platform_context?: {
    /** Positioning strategy from the resume agent */
    positioning_strategy?: Record<string, unknown>;
    /** Bios from the executive bio agent */
    bios?: Record<string, unknown>[];
  };

  /** Context about the target role and market */
  target_context?: {
    /** Target role or title */
    target_role: string;
    /** Target industry */
    target_industry: string;
  };

  /** Feedback from the user review gate (findings_review) */
  revision_feedback?: string;
}

// --- SSE Events -----------------------------------------------------------

/** Discriminated union of all SSE events emitted by the personal brand audit pipeline */
export type PersonalBrandSSEEvent =
  | { type: 'stage_start'; stage: string; message: string }
  | { type: 'stage_complete'; stage: string; message: string; duration_ms?: number }
  | { type: 'transparency'; stage: string; message: string }
  | { type: 'audit_progress'; stage: string; message: string; sources_analyzed: number; total_sources: number }
  | { type: 'finding_identified'; finding_id: string; category: FindingCategory; severity: string; title: string }
  | { type: 'audit_complete'; finding_count: number; consistency_scores: ConsistencyScores }
  | { type: 'findings_review_ready'; session_id: string; findings: AuditFinding[]; consistency_scores?: ConsistencyScores }
  | { type: 'pipeline_gate'; gate: string }
  | { type: 'recommendations_ready'; recommendation_count: number; top_priority: string }
  | { type: 'collection_complete'; session_id: string; report: string; quality_score: number; finding_count: number; audit_findings: AuditFinding[]; consistency_scores?: ConsistencyScores; recommendations: BrandRecommendation[] }
  | { type: 'pipeline_error'; stage: string; error: string };
