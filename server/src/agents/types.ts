/**
 * Shared type definitions used across the platform.
 *
 * NOTE: The resume-specific pipeline types (IntakeOutput, PositioningProfile,
 * ArchitectOutput, etc.) were removed in the v2 rebuild (ADR-042).
 * New v2 agent types will live in agents/resume-v2/types.ts.
 *
 * This file retains only types still used by platform-wide code
 * (questionnaire helpers, sessions, workflow service, etc.).
 */

import type { AgentContext, AgentTool, AgentConfig } from './runtime/agent-protocol.js';

// ─── Questionnaire Types (used by questionnaire-helpers, coach, etc.) ─────

export interface QuestionnaireOption {
  id: string;
  label: string;
  description?: string;
  source?: 'resume' | 'jd' | 'inferred' | 'system';
}

export interface QuestionnaireQuestion {
  id: string;
  question_text: string;
  context?: string;
  impact_tier?: 'high' | 'medium' | 'low';
  payoff_hint?: string;
  topic_keys?: string[];
  benchmark_edit_version?: number | null;
  input_type: 'single_choice' | 'multi_choice' | 'rating' | 'free_text';
  options?: QuestionnaireOption[];
  allow_custom: boolean;
  allow_skip: boolean;
  depends_on?: { question_id: string; condition: 'equals' | 'not_equals'; value: string };
}

export interface QuestionnaireResponse {
  question_id: string;
  selected_option_ids: string[];
  custom_text?: string;
  skipped: boolean;
  impact_tag?: 'high' | 'medium' | 'low';
  payoff_hint?: string;
  topic_keys?: string[];
  benchmark_edit_version?: number | null;
}

export interface QuestionnaireSubmission {
  questionnaire_id: string;
  schema_version: number;
  stage: string;
  responses: QuestionnaireResponse[];
  submitted_at: string;
  generated_by?: string;
}

// ─── Positioning Question (used by questionnaire-helpers) ────────────

export type QuestionCategory =
  | 'scale_and_scope'
  | 'requirement_mapped'
  | 'career_narrative'
  | 'hidden_accomplishments'
  | 'currency_and_adaptability'
  | 'trophies'
  | 'gaps';

export interface PositioningQuestion {
  id: string;
  question_number: number;
  question_text: string;
  context: string;
  input_type: 'multiple_choice' | 'text' | 'hybrid';
  suggestions?: Array<{
    label: string;
    description: string;
    source: 'resume' | 'inferred' | 'jd';
  }>;
  follow_ups?: string[];
  optional?: boolean;
  category?: QuestionCategory;
  requirement_map?: string[];
  is_follow_up?: boolean;
  parent_question_id?: string;
  encouraging_text?: string;
}

// ─── Pipeline Types (minimal — kept for sessions, SSE, tests) ────────

export type PipelineStage =
  // v2 stages
  | 'intake'
  | 'analysis'
  | 'strategy'
  | 'writing'
  | 'verification'
  | 'assembly'
  | 'complete'
  // Legacy stages (kept for workflow.ts backward compat — remove when workflow.ts is rebuilt)
  | 'positioning'
  | 'research'
  | 'gap_analysis'
  | 'architect'
  | 'architect_review'
  | 'section_writing'
  | 'section_review'
  | 'quality_review'
  | 'revision';

export interface QualityScores {
  hiring_manager_impact: number;
  requirement_coverage: number;
  ats_score: number;
  authenticity: number;
  evidence_integrity: number;
  blueprint_compliance: number;
}

export interface PipelineState {
  session_id: string;
  user_id: string;
  current_stage: PipelineStage;
  approved_sections: string[];
  revision_count: number;
  revision_counts: Record<string, number>;
  token_usage: {
    input_tokens: number;
    output_tokens: number;
    estimated_cost_usd: number;
  };
}

export type PipelineSSEEvent =
  | { type: 'stage_start'; stage: PipelineStage; message: string }
  | { type: 'stage_complete'; stage: PipelineStage; message: string; duration_ms?: number }
  | { type: 'pipeline_complete'; session_id: string; [key: string]: unknown }
  | { type: 'pipeline_error'; stage: PipelineStage; error: string }
  | { type: 'transparency'; message: string; stage: PipelineStage }
  | { type: 'system_message'; content: string }
  | { type: 'right_panel_update'; panel_type: string; data: Record<string, unknown> }
  | {
      type: 'questionnaire';
      questionnaire_id: string;
      schema_version: number;
      stage: string;
      title: string;
      subtitle?: string;
      questions: QuestionnaireQuestion[];
      current_index: number;
    }
  // Legacy event types (kept for workflow.ts backward compat)
  | { type: 'workflow_replan_requested'; [key: string]: unknown }
  | { type: 'section_draft'; section: string; content: string; [key: string]: unknown }
  | { type: 'section_revised'; section: string; content: string; [key: string]: unknown }
  | { type: 'section_approved'; section: string }
  | { type: 'quality_scores'; scores: QualityScores; [key: string]: unknown }
  | { type: 'draft_readiness_update'; [key: string]: unknown }
  | { type: 'draft_path_decision'; [key: string]: unknown };

// ─── Product-Layer Agent Type Aliases ────────────────────────────────

export type ResumeAgentContext = AgentContext<PipelineState, PipelineSSEEvent>;
export type ResumeAgentTool = AgentTool<PipelineState, PipelineSSEEvent>;
export type ResumeAgentConfig = AgentConfig<PipelineState, PipelineSSEEvent>;
