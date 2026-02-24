type CoachPhase =
  | 'onboarding'
  | 'deep_research'
  | 'gap_analysis'
  | 'resume_design'
  | 'section_craft'
  | 'quality_review';

type SessionStatus = 'active' | 'paused' | 'completed' | 'error';

export interface CoachSession {
  id: string;
  status: SessionStatus;
  current_phase: CoachPhase;
  master_resume_id: string | null;
  job_application_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface ToolStatus {
  name: string;
  description: string;
  status: 'running' | 'complete';
  summary?: string;
}

export interface AskUserPromptData {
  toolCallId: string;
  question: string;
  context: string;
  inputType: 'text' | 'voice' | 'multiple_choice';
  choices?: Array<{ label: string; description?: string }>;
  skipAllowed: boolean;
}

export interface PhaseGateData {
  toolCallId: string;
  currentPhase: string;
  nextPhase: string;
  phaseSummary: string;
  nextPhasePreview: string;
}

// Pipeline stage tracking (new pipeline model)
export type PipelineStage =
  | 'intake'
  | 'positioning'
  | 'research'
  | 'gap_analysis'
  | 'architect'
  | 'architect_review'
  | 'section_writing'
  | 'section_review'
  | 'quality_review'
  | 'revision'
  | 'complete';

export type QuestionCategory =
  | 'scale_and_scope'
  | 'requirement_mapped'
  | 'career_narrative'
  | 'hidden_accomplishments'
  | 'currency_and_adaptability';

export interface CategoryProgress {
  category: QuestionCategory;
  label: string;
  answered: number;
  total: number;
}

// Positioning question from Why Me interview
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

// Quality scores from the 6-dimension review
export interface QualityScores {
  hiring_manager_impact: number;   // 1-5
  requirement_coverage: number;    // 0-100
  ats_score: number;               // 0-100
  authenticity: number;            // 0-100
  evidence_integrity: number;      // 0-100
  blueprint_compliance: number;    // 0-100
}

export interface DraftReadinessUpdate {
  stage: PipelineStage;
  workflow_mode: 'fast_draft' | 'balanced' | 'deep_dive';
  evidence_count: number;
  minimum_evidence_target: number;
  coverage_score: number;
  coverage_threshold: number;
  ready: boolean;
  note?: string;
}

export interface WorkflowReplanUpdate {
  state: 'requested' | 'in_progress' | 'completed';
  reason: 'benchmark_assumptions_updated';
  benchmark_edit_version: number;
  rebuild_from_stage: 'gap_analysis';
  requires_restart?: boolean;
  current_stage: PipelineStage;
  phase?: 'apply_benchmark_overrides' | 'refresh_gap_analysis' | 'rebuild_blueprint';
  rebuilt_through_stage?: 'research' | 'gap_analysis' | 'architect';
  stale_nodes?: Array<'gaps' | 'questions' | 'blueprint' | 'sections' | 'quality' | 'export'>;
  message?: string;
  updated_at: string;
}

// Revision instruction from quality review
export interface RevisionInstruction {
  target_section: string;
  issue: string;
  instruction: string;
  priority: 'high' | 'medium' | 'low';
}

// ─── Questionnaire Types ────────────────────────────────────────────

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
  input_type: 'single_choice' | 'multi_choice' | 'rating';
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
}

export interface QuestionnaireSubmission {
  questionnaire_id: string;
  schema_version: number;
  stage: string;
  responses: QuestionnaireResponse[];
  submitted_at: string;
}
