/**
 * Retirement Bridge Agent — Shared types for the retirement readiness product.
 *
 * Assesses retirement readiness across 7 dimensions during a career transition.
 * This agent NEVER gives financial advice. It surfaces questions, observations,
 * and frameworks. All financial guidance is deferred to qualified fiduciary planners.
 *
 * Pipeline: Assessor (single agent with user gate)
 * Delivery: RetirementReadinessSummary stored in platform context
 *
 * IMPORTANT — Fiduciary Guardrail:
 * This agent is not a financial advisor. Every output is framed as observations
 * and questions to explore with a planner, never as recommendations or advice.
 */

import type { BaseState } from '../runtime/agent-protocol.js';
import type { SharedContext } from '../../contracts/shared-context.js';

// ─── Assessment Dimensions ──────────────────────────────────────────

/**
 * The 7 retirement readiness dimensions assessed during a career transition.
 * Each dimension produces a signal — not a score, not a recommendation.
 */
export type ReadinessDimension =
  | 'income_replacement'
  | 'healthcare_bridge'
  | 'debt_profile'
  | 'retirement_savings_impact'
  | 'insurance_gaps'
  | 'tax_implications'
  | 'lifestyle_adjustment';

/** Human-readable labels for the 7 dimensions (user-facing) */
export const DIMENSION_LABELS: Record<ReadinessDimension, string> = {
  income_replacement: 'Income Replacement',
  healthcare_bridge: 'Healthcare Bridge',
  debt_profile: 'Debt Profile',
  retirement_savings_impact: 'Retirement Savings Impact',
  insurance_gaps: 'Insurance Gaps',
  tax_implications: 'Tax Implications',
  lifestyle_adjustment: 'Lifestyle Adjustment',
};

// ─── Readiness Signals ──────────────────────────────────────────────

/**
 * Signal levels for each assessed dimension.
 * These are NOT scores or grades — they indicate whether an area
 * warrants prompt attention from a fiduciary planner.
 *
 * green  — No concerning indicators detected; appears well-positioned
 * yellow — Some areas worth exploring with a planner; not urgent
 * red    — Significant areas that would benefit from prompt professional attention
 */
export type ReadinessSignal = 'green' | 'yellow' | 'red';

/** User-facing descriptions of each signal level */
export const SIGNAL_DESCRIPTIONS: Record<ReadinessSignal, string> = {
  green: 'Appears well-positioned — no immediate concerns detected',
  yellow: 'Worth exploring with a planner — some areas to consider',
  red: 'Warrants prompt professional attention — significant areas to address',
};

// ─── Assessment Question ────────────────────────────────────────────

/** A single exploratory question for one or more assessment dimensions */
export interface RetirementQuestion {
  /** Unique identifier for this question */
  id: string;
  /** The question text shown to the user */
  question: string;
  /** The primary dimension this question informs */
  dimension: ReadinessDimension;
  /** Why we're asking — internal only, not shown to user */
  purpose: string;
  /** Condition under which a follow-up question should be asked */
  follow_up_trigger?: string;
}

// ─── Dimension Assessment ───────────────────────────────────────────

/**
 * Per-dimension assessment result.
 *
 * Contains observations (what the assessor noticed) and questions the USER
 * should bring to a fiduciary planner. Never contains advice, recommendations,
 * or suggested financial products.
 */
export interface DimensionAssessment {
  /** Which of the 7 dimensions this assessment covers */
  dimension: ReadinessDimension;
  /**
   * Readiness signal for this dimension.
   * NOT a score — indicates whether planner attention is warranted.
   */
  signal: ReadinessSignal;
  /**
   * Observations about what was detected. Framed as "what we noticed"
   * rather than "what you should do." No financial advice.
   */
  observations: string[];
  /**
   * Questions the user should bring to a fiduciary planner for this dimension.
   * These are structured as questions the USER asks their planner, not advice
   * we are giving.
   */
  questions_to_ask_planner: string[];
}

// ─── Retirement Readiness Summary ──────────────────────────────────

/**
 * Full retirement readiness assessment output.
 *
 * The primary deliverable of the Retirement Bridge Agent. Stored in platform
 * context and used to generate the Financial Planner Warm Handoff document.
 *
 * IMPORTANT: This summary surfaces observations and questions — not advice.
 * The fiduciary disclaimer must appear on all user-facing representations.
 */
export interface RetirementReadinessSummary {
  /** Per-dimension assessment results — all 7 dimensions */
  dimensions: DimensionAssessment[];
  /**
   * Overall readiness signal — computed as the worst-case across all dimensions.
   * If any dimension is red, overall is red.
   * If no red but any yellow, overall is yellow.
   * Only green if all dimensions are green.
   */
  overall_readiness: ReadinessSignal;
  /**
   * High-level observations across all dimensions. Plain language.
   * Framed as "areas we noticed" rather than "things you must do."
   */
  key_observations: string[];
  /**
   * Topics the user should discuss with a qualified fiduciary planner.
   * Synthesized from all dimension-level questions_to_ask_planner arrays.
   * Prioritized by signal severity (red first, then yellow, then green).
   */
  recommended_planner_topics: string[];
  /**
   * Formatted plain-language summary the user can share with or print for
   * a fiduciary planner. Includes the fiduciary disclaimer in the footer.
   * Professional enough to hand to a planner at the start of a meeting.
   */
  shareable_summary: string;
}

// ─── Pipeline State ─────────────────────────────────────────────────

/** Shared pipeline state for the Retirement Bridge Assessment Agent */
export interface RetirementBridgeState extends BaseState {
  session_id: string;
  user_id: string;
  current_stage: string;

  /** Questions generated for this specific user's situation */
  questions: RetirementQuestion[];

  /** User's responses keyed by question id */
  responses: Record<string, string>;

  /** Per-dimension assessments, populated after response evaluation */
  dimension_assessments: DimensionAssessment[];

  /** Final readiness summary — stored in platform context on completion */
  readiness_summary?: RetirementReadinessSummary;

  /**
   * Cross-product context from prior platform interactions.
   * client_profile from onboarding informs tone and framing.
   * positioning_strategy surfaces career transition context.
   */
  platform_context?: {
    client_profile?: Record<string, unknown>;
    positioning_strategy?: Record<string, unknown>;
  };

  /** Canonical shared context, populated alongside legacy platform_context during migration */
  shared_context?: SharedContext;
}

// ─── SSE Events ─────────────────────────────────────────────────────

/** Discriminated union of all SSE events emitted by the retirement bridge pipeline */
export type RetirementBridgeSSEEvent =
  | { type: 'stage_start'; stage: string; message: string }
  | { type: 'stage_complete'; stage: string; message: string; duration_ms?: number }
  | { type: 'transparency'; stage: string; message: string }
  | { type: 'questions_ready'; questions: RetirementQuestion[] }
  | {
      type: 'assessment_complete';
      session_id: string;
      summary: RetirementReadinessSummary;
    }
  | { type: 'pipeline_error'; stage: string; error: string };
