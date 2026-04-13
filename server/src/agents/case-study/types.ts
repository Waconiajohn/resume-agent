/**
 * Case Study Agent — Shared types for the case-study product.
 *
 * Agent #17 in the 33-agent platform. Analyzes executive achievements,
 * selects the highest-impact ones, and produces consulting-grade case
 * studies that prove capability through evidence, not claims.
 *
 * Pipeline: Achievement Analyst -> Case Study Writer
 * Delivery: Collection of 3-5 case studies with executive summaries
 */

import type { BaseState } from '../runtime/agent-protocol.js';
import type { SharedContext } from '../../contracts/shared-context.js';

// --- Case Study Formats ------------------------------------------------

/** Supported case study format types */
export type CaseStudyFormat =
  | 'consulting'
  | 'board'
  | 'advisory'
  | 'portfolio'
  | 'presentation';

/** All case study formats in priority order */
export const CASE_STUDY_FORMATS: CaseStudyFormat[] = [
  'consulting',
  'board',
  'advisory',
  'portfolio',
  'presentation',
];

/** Human-readable labels for case study formats */
export const CASE_STUDY_FORMAT_LABELS: Record<CaseStudyFormat, string> = {
  consulting: 'Consulting Proposal',
  board: 'Board Presentation',
  advisory: 'Advisory Pitch',
  portfolio: 'Portfolio Collection',
  presentation: 'Executive Presentation',
};

// --- Impact Categories -------------------------------------------------

/** Supported impact category types */
export type ImpactCategory =
  | 'revenue'
  | 'cost_savings'
  | 'efficiency'
  | 'growth'
  | 'transformation'
  | 'risk_mitigation';

/** All impact categories */
export const IMPACT_CATEGORIES: ImpactCategory[] = [
  'revenue',
  'cost_savings',
  'efficiency',
  'growth',
  'transformation',
  'risk_mitigation',
];

/** Human-readable labels for impact categories */
export const IMPACT_CATEGORY_LABELS: Record<ImpactCategory, string> = {
  revenue: 'Revenue Impact',
  cost_savings: 'Cost Savings',
  efficiency: 'Operational Efficiency',
  growth: 'Growth & Expansion',
  transformation: 'Transformation',
  risk_mitigation: 'Risk Mitigation',
};

// --- Achievement -------------------------------------------------------

/** A single executive achievement extracted and scored by the Achievement Analyst */
export interface Achievement {
  /** Unique identifier for this achievement */
  id: string;
  /** Headline title of the achievement */
  title: string;
  /** Company where this achievement occurred */
  company: string;
  /** Role held when this achievement occurred */
  role: string;
  /** Overall impact score (0-100) used for selection ranking */
  impact_score: number;
  /** Primary category of business impact */
  impact_category: ImpactCategory;
  /** Context, stakes, and constraints (the "S" in STAR) */
  situation: string;
  /** True if the situation was inferred by AI rather than directly stated in user input */
  situation_is_inferred?: boolean;
  /** What the executive specifically did, decisions made (the "A" in STAR) */
  approach: string;
  /** True if the approach was inferred by AI rather than directly stated in user input */
  approach_is_inferred?: boolean;
  /** Quantified outcomes and business impact (the "R" in STAR) */
  results: string;
  /** True if the results were inferred by AI rather than directly stated in user input */
  results_is_inferred?: boolean;
  /** Specific metrics with context */
  metrics: Array<{ label: string; value: string; context: string }>;
  /** Lessons that apply beyond this specific company/industry */
  transferable_lessons: string[];
  /** Tags for categorization and filtering */
  tags: string[];
}

// --- Case Study --------------------------------------------------------

/** A single completed case study produced by the Case Study Writer */
export interface CaseStudy {
  /** Links back to the source achievement */
  achievement_id: string;
  /** Case study headline */
  title: string;
  /** 2-3 sentence executive summary */
  executive_summary: string;
  /** Context, stakes, and constraints */
  situation: string;
  /** What the executive specifically did */
  approach: string;
  /** Quantified outcomes and business impact */
  results: string;
  /** Specific metrics with context */
  metrics: Array<{ label: string; value: string; context: string }>;
  /** Transferable lessons and patterns */
  lessons: string;
  /** Actual word count of the case study body */
  word_count: number;
  /** Overall quality score (0-100) */
  quality_score: number;
  /** Clarity and flow of the narrative (0-100) */
  narrative_clarity: number;
  /** Precision and specificity of metrics (0-100) */
  metric_specificity: number;
  /** How well the approach section frames strategic thinking (0-100) */
  strategic_framing: number;
}

// --- Pipeline State ----------------------------------------------------

/** Shared pipeline state for the case study agent */
export interface CaseStudyState extends BaseState {
  session_id: string;
  user_id: string;
  current_stage: string;

  /** Cross-product context from the resume pipeline */
  platform_context?: {
    /** Positioning strategy from the resume agent */
    positioning_strategy?: Record<string, unknown>;
    /** Evidence items surfaced during resume building */
    evidence_items?: Record<string, unknown>[];
  };

  /** Canonical shared context, populated alongside legacy platform_context during migration */
  shared_context?: SharedContext;

  /** Optional emphasis areas specified by the user */
  focus_areas?: string;

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

  /** All achievements extracted by the Achievement Analyst */
  achievements?: Achievement[];

  /** Top 3-5 achievements selected by impact score for case study writing */
  selected_achievements?: Achievement[];

  /** All completed case studies */
  case_studies: CaseStudy[];

  /** Final assembled case study collection report (markdown) */
  final_report?: string;

  /** Overall quality score for the collection (0-100) */
  quality_score?: number;
}

// --- SSE Events --------------------------------------------------------

/** Discriminated union of all SSE events emitted by the case study pipeline */
export type CaseStudySSEEvent =
  | { type: 'stage_start'; stage: string; message: string }
  | { type: 'stage_complete'; stage: string; message: string; duration_ms?: number }
  | { type: 'transparency'; stage: string; message: string }
  | { type: 'achievement_selected'; title: string; company: string; impact_score: number; impact_category: ImpactCategory }
  | { type: 'case_study_drafted'; title: string; word_count: number }
  | { type: 'case_study_complete'; title: string; quality_score: number }
  | { type: 'collection_complete'; session_id: string; report: string; quality_score: number; case_study_count: number; case_studies: CaseStudy[]; selected_achievements: Achievement[] }
  | { type: 'pipeline_error'; stage: string; error: string };
