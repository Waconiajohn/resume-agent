/**
 * 90-Day Plan Agent — Shared types for the ninety-day-plan product.
 *
 * Agent #20 in the 33-agent platform. Analyzes the target role context,
 * maps stakeholders, identifies quick wins, and produces a strategic
 * 90-day onboarding plan structured in three phases: Listen & Learn,
 * Contribute & Build, Lead & Deliver.
 *
 * Pipeline: Role Researcher -> Plan Writer
 * Delivery: Complete 90-day strategic onboarding plan with stakeholder map
 */

import type { BaseState } from '../runtime/agent-protocol.js';

// --- Role Context ----------------------------------------------------------

/** Context about the target role the candidate is onboarding into */
export interface RoleContext {
  target_role: string;
  target_company: string;
  target_industry: string;
  reporting_to?: string;
  team_size?: string;
  role_expectations?: string;
}

// --- Stakeholder -----------------------------------------------------------

/** Relationship type for stakeholder mapping */
export type StakeholderRelationship =
  | 'direct_report'
  | 'peer'
  | 'superior'
  | 'cross_functional'
  | 'external';

/** Priority level for stakeholder engagement */
export type StakeholderPriority = 'critical' | 'high' | 'medium' | 'low';

/** A key stakeholder identified for the onboarding plan */
export interface Stakeholder {
  name_or_role: string;
  relationship_type: StakeholderRelationship;
  priority: StakeholderPriority;
  engagement_strategy: string;
}

// --- Quick Win -------------------------------------------------------------

/** Impact level for quick wins */
export type ImpactLevel = 'high' | 'medium' | 'low';

/** Effort level for quick wins */
export type EffortLevel = 'low' | 'medium' | 'high';

/** An early-impact opportunity for the first 30 days */
export interface QuickWin {
  description: string;
  impact: ImpactLevel;
  effort: EffortLevel;
  timeline_days: number;
  stakeholder_benefit: string;
}

// --- Learning Priority -----------------------------------------------------

/** Importance level for learning priorities */
export type ImportanceLevel = 'critical' | 'high' | 'medium';

/** A knowledge gap or learning area to address during onboarding */
export interface LearningPriority {
  area: string;
  importance: ImportanceLevel;
  resources: string[];
  timeline: string;
}

// --- Plan Phase ------------------------------------------------------------

/** Phase number (30, 60, or 90 days) */
export type PhaseNumber = 30 | 60 | 90;

/** Activity category within a plan phase */
export type ActivityCategory = 'relationship' | 'learning' | 'delivery' | 'strategy';

/** A specific activity within a plan phase */
export interface PlanActivity {
  description: string;
  category: ActivityCategory;
  week_range: string;
}

/** A measurable milestone within a plan phase */
export interface PlanMilestone {
  description: string;
  measurable_outcome: string;
  target_date_range: string;
}

/** Risk likelihood level */
export type RiskLikelihood = 'high' | 'medium' | 'low';

/** A risk identified for a plan phase */
export interface PlanRisk {
  description: string;
  mitigation: string;
  likelihood: RiskLikelihood;
}

/** A single phase (30, 60, or 90 days) in the onboarding plan */
export interface PlanPhase {
  phase: PhaseNumber;
  title: string;
  theme: string;
  objectives: string[];
  key_activities: PlanActivity[];
  milestones: PlanMilestone[];
  risks: PlanRisk[];
}

// --- Pipeline State --------------------------------------------------------

/** Shared pipeline state for the ninety-day-plan agent */
export interface NinetyDayPlanState extends BaseState {
  session_id: string;
  user_id: string;
  current_stage: string;

  /** Role context for the target position */
  role_context: RoleContext;

  /** Mapped stakeholders for the onboarding plan */
  stakeholder_map: Stakeholder[];

  /** Quick wins for early impact */
  quick_wins: QuickWin[];

  /** Learning priorities and knowledge gaps */
  learning_priorities: LearningPriority[];

  /** The three plan phases (30, 60, 90 days) */
  phases: PlanPhase[];

  /** Final assembled plan report (markdown) */
  final_report?: string;

  /** Overall quality score (0-100) */
  quality_score?: number;

  /** Feedback from the user review gate (stakeholder_review) */
  revision_feedback?: string;

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
    positioning_strategy?: Record<string, unknown>;
    evidence_items?: Record<string, unknown>[];
  };

  /** Context about the target role and market */
  target_context?: {
    target_role: string;
    target_industry: string;
    target_seniority: string;
  };
}

// --- SSE Events ------------------------------------------------------------

/** Discriminated union of all SSE events emitted by the ninety-day-plan pipeline */
export type NinetyDayPlanSSEEvent =
  | { type: 'stage_start'; stage: string; message: string }
  | { type: 'stage_complete'; stage: string; message: string; duration_ms?: number }
  | { type: 'transparency'; stage: string; message: string }
  | { type: 'research_complete'; stakeholder_count: number; quick_win_count: number; learning_priority_count: number }
  | { type: 'stakeholder_review_ready'; session_id: string; stakeholder_map: Stakeholder[]; quick_wins: QuickWin[]; role_context: RoleContext }
  | { type: 'pipeline_gate'; gate: string }
  | { type: 'phase_drafted'; phase: PhaseNumber; title: string; activity_count: number }
  | { type: 'phase_complete'; phase: PhaseNumber; title: string; milestone_count: number }
  | { type: 'plan_complete'; session_id: string; report: string; quality_score: number; phase_count: number; phases: PlanPhase[]; stakeholder_map: Stakeholder[]; quick_wins: QuickWin[]; learning_priorities: LearningPriority[] }
  | { type: 'pipeline_error'; stage: string; error: string };
