/**
 * LinkedIn Optimizer Agent — Shared types for the linkedin-optimizer product.
 *
 * Agent #11 in the 33-agent platform. Generates LinkedIn profile optimization
 * recommendations from resume + positioning strategy + current profile text.
 *
 * Pipeline: Analyzer → Writer (autonomous, no user gates)
 * Delivery: Full optimization report at once
 */

import type { BaseState } from '../runtime/agent-protocol.js';
import type { CareerProfileV2 } from '../../lib/career-profile-context.js';
import type { SharedContext } from '../../contracts/shared-context.js';

// ─── Profile Sections ────────────────────────────────────────────────

/** The sections optimized by the LinkedIn Optimizer */
export type LinkedInSection =
  | 'headline'
  | 'about'
  | 'experience'
  | 'keywords';

/** All sections in report order */
export const SECTION_ORDER: LinkedInSection[] = [
  'headline',
  'about',
  'experience',
  'keywords',
];

/** A single optimized section with before/after */
export interface OptimizedSection {
  section: LinkedInSection;
  /** Original content from user's current profile (if provided) */
  original: string;
  /** Optimized content */
  optimized: string;
  /** Explanation of changes and why they matter */
  rationale: string;
  /** Word count of optimized content */
  word_count: number;
}

// ─── Experience Entries ──────────────────────────────────────────────

/** Per-role structured experience entry produced by write_experience_entries */
export interface ExperienceEntry {
  /** Stable identifier, e.g. 'role_0', 'role_1' */
  role_id: string;
  company: string;
  title: string;
  duration: string;
  /** Original text from user's LinkedIn for this role (if available) */
  original: string;
  /** Optimized bullet points in markdown */
  optimized: string;
  quality_scores: {
    /** Impact strength: does the entry lead with what changed? (0-100) */
    impact: number;
    /** Metric density: are numbers used appropriately? (0-100) */
    metrics: number;
    /** Context richness: team size, budget, scope present? (0-100) */
    context: number;
    /** Keyword coverage: relevant search terms woven in? (0-100) */
    keywords: number;
  };
}

// ─── Analysis Data ───────────────────────────────────────────────────

export interface KeywordAnalysis {
  /** High-value keywords found in resume/strategy but missing from LinkedIn */
  missing_keywords: string[];
  /** Keywords already present in the LinkedIn profile */
  present_keywords: string[];
  /** Recruiter-facing keywords recommended for the target role */
  recommended_keywords: string[];
  /** Overall keyword coverage score (0-100) */
  coverage_score: number;
}

export interface ProfileAnalysis {
  /** Current headline assessment */
  headline_assessment: string;
  /** Current about section assessment */
  about_assessment: string;
  /** Key gaps between resume positioning and LinkedIn profile */
  positioning_gaps: string[];
  /** Strengths already reflected in the profile */
  strengths: string[];
}

// ─── Audit Report ────────────────────────────────────────────────────────────

export interface LinkedInAuditReport {
  positioning_summary: {
    core_identity: string;
    value_proposition: string;
    differentiators: string[];
    target_market_fit: string;
  };
  audit_scores: {
    five_second_test: number;
    headline_strength: number;
    about_hook_strength: number;
    proof_strength: number;
    differentiation_strength: number;
    executive_presence: number;
    keyword_effectiveness: number;
    overall_score: number;
  };
  diagnostic_findings: {
    what_is_working: string[];
    what_is_weak: string[];
    what_is_missing: string[];
    where_profile_undersells_candidate: string[];
  };
  headline_recommendations: {
    options: Array<{ label: string; headline: string; why_it_works: string }>;
    recommended_headline: string;
    recommended_headline_rationale: string;
  };
  about_section_rewrite: {
    five_second_hook_analysis: string;
    recommended_opening: string;
    full_rewritten_about: string;
  };
  experience_alignment: {
    resume_strengths_to_surface_more: string[];
    claims_that_need_stronger_proof: string[];
    recommended_experience_reframing: string[];
  };
  skills_and_featured_recommendations: {
    top_skills_to_pin: string[];
    skills_to_add_or_emphasize: string[];
    featured_section_recommendations: string[];
  };
  final_benchmark_assessment: {
    benchmark_candidate_summary: string;
    confidence: number;
    key_caveats: string[];
  };
}

// ─── Pipeline State ──────────────────────────────────────────────────

export interface LinkedInOptimizerState extends BaseState {
  session_id: string;
  user_id: string;
  current_stage: string;

  /** Job application ID for context linkage */
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

  /** Current LinkedIn profile text (user-provided) */
  current_profile?: {
    headline: string;
    about: string;
    experience_text: string;
  };

  /** Target role/industry context */
  target_context?: {
    target_role: string;
    target_industry: string;
    target_seniority: string;
  };

  /** Profile analysis from Analyzer agent */
  profile_analysis?: ProfileAnalysis;

  /** Keyword gap analysis from Analyzer agent */
  keyword_analysis?: KeywordAnalysis;

  /** Optimized sections (populated by Writer agent) */
  sections: Record<LinkedInSection, OptimizedSection | undefined>;

  /** Per-role structured experience data (populated by write_experience_entries) */
  experience_entries?: ExperienceEntry[];

  /** Final assembled report (markdown, backward compat) */
  final_report?: string;

  /** Structured audit report (JSON) */
  audit_report?: LinkedInAuditReport;

  /** Quality score from self-review (0-100) */
  quality_score?: number;

  /** Recruiter search simulation result (from simulate_recruiter_search) */
  recruiter_search_result?: {
    overall_score: number;
    section_analysis: Array<{
      section: string;
      weight: number;
      keywords_found: string[];
      keywords_missing: string[];
      section_score: number;
      note: string;
    }>;
    missing_keywords: string[];
    recommendations: string[];
    verdict: string;
  };
}

// ─── SSE Events ──────────────────────────────────────────────────────

export type LinkedInOptimizerSSEEvent =
  | { type: 'stage_start'; stage: string; message: string }
  | { type: 'stage_complete'; stage: string; message: string; duration_ms?: number }
  | { type: 'transparency'; stage: string; message: string }
  | { type: 'section_progress'; section: LinkedInSection; status: 'writing' | 'reviewing' | 'complete' }
  | { type: 'report_complete'; session_id: string; report: string; quality_score: number; experience_entries?: ExperienceEntry[]; audit_report?: LinkedInAuditReport }
  | { type: 'pipeline_error'; stage: string; error: string };
