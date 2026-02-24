import type { PositioningQuestion, QuestionnaireQuestion, CategoryProgress } from '@/types/session';

// Panel type identifiers matching backend panel_type values
export type PanelType =
  | 'onboarding_summary'
  | 'research_dashboard'
  | 'gap_analysis'
  | 'design_options'
  | 'live_resume'
  | 'quality_dashboard'
  | 'completion'
  | 'positioning_interview'
  | 'blueprint_review'
  | 'section_review'
  | 'questionnaire';

// --- Onboarding Summary ---
export interface OnboardingSummaryData {
  years_of_experience?: number;
  companies_count?: number;
  skills_count?: number;
  leadership_span?: string;
  budget_responsibility?: string;
  strengths?: string[];
  opportunities?: string[];
}

// --- Research Dashboard ---
export interface CompanyCard {
  company_name?: string;
  culture?: string;
  values?: string[];
  language_style?: string;
  leadership_style?: string;
}

export interface JDRequirements {
  must_haves?: string[];
  nice_to_haves?: string[];
  seniority_level?: string;
}

export interface BenchmarkSkill {
  requirement: string;
  importance: 'critical' | 'important' | 'nice_to_have';
  category: string;
}

export interface BenchmarkProfile {
  required_skills: BenchmarkSkill[];
  experience_expectations: string;
  culture_fit_traits: string[];
  communication_style: string;
  industry_standards: string[];
  competitive_differentiators: string[];
  language_keywords: string[];
  ideal_candidate_summary: string;
}

export interface ResearchDashboardData {
  company: CompanyCard;
  jd_requirements: JDRequirements;
  benchmark: BenchmarkProfile;
}

// --- Gap Analysis ---
export interface RequirementFitItem {
  requirement: string;
  classification: 'strong' | 'partial' | 'gap';
  evidence: string;
  strategy?: string;
}

export interface GapAnalysisData {
  requirements: RequirementFitItem[];
  strong_count: number;
  partial_count: number;
  gap_count: number;
  total: number;
  addressed: number;
}

// --- Design Options ---
export interface DesignOption {
  id: string;
  name: string;
  description: string;
  section_order: string[];
  rationale?: string;
  selected?: boolean;
}

export interface DesignOptionsData {
  options: DesignOption[];
  selected_id?: string;
}

// --- Live Resume (diff view) ---
export interface SectionChange {
  original: string;
  proposed: string;
  reasoning: string;
  jd_requirements: string[];
}

export interface LiveResumeData {
  active_section: string;
  changes: SectionChange[];
  proposed_content?: string;
}

// --- Quality Dashboard ---
export interface RiskFlag {
  flag: string;
  severity: 'low' | 'medium' | 'high';
  recommendation: string;
}

export interface QualityDashboardData {
  hiring_manager?: {
    pass?: boolean;
    checklist_total?: number;
    checklist_max?: number;
    checklist_scores?: Record<string, number>;
  };
  ats_score?: number;
  keyword_coverage?: number;
  authenticity_score?: number;
  risk_flags?: RiskFlag[];
  age_bias_risks?: string[];
  overall_assessment?: string;
}

// --- Completion ---
export interface CompletionData {
  ats_score?: number;
  keyword_coverage?: number;
  authenticity_score?: number;
  requirements_addressed?: number;
  sections_rewritten?: number;
  export_validation?: {
    passed: boolean;
    findings: Array<{
      section: string;
      issue: string;
      instruction: string;
      priority: 'high' | 'medium' | 'low';
    }>;
  };
}

// --- Positioning Interview ---
export interface PositioningInterviewData {
  current_question?: PositioningQuestion;
  questions_total: number;
  questions_answered: number;
  category_progress?: CategoryProgress[];
  encouraging_text?: string;
}

// --- Blueprint Review ---
export interface BlueprintReviewData {
  target_role: string;
  positioning_angle: string;
  section_plan: {
    order: string[];
    rationale: string;
  };
  age_protection: {
    flags: Array<{ item: string; risk: string; action: string }>;
    clean: boolean;
  };
  evidence_allocation_count: number;
  keyword_count: number;
}

// --- Section Suggestions ---
export type SuggestionIntent =
  | 'address_requirement'
  | 'weave_evidence'
  | 'integrate_keyword'
  | 'quantify_bullet'
  | 'tighten'
  | 'strengthen_verb'
  | 'align_positioning';

export interface SectionSuggestion {
  id: string;
  intent: SuggestionIntent;
  question_text: string;
  context?: string;
  target_id?: string;
  options: Array<{
    id: string;
    label: string;
    action: 'apply' | 'skip';
  }>;
  priority: number;
  priority_tier: 'high' | 'medium' | 'low';
  resolved_when: {
    type: 'keyword_present' | 'evidence_referenced' | 'requirement_addressed' | 'always_recheck';
    target_id: string;
  };
}

// --- Section Workbench Context ---
export interface SectionWorkbenchContext {
  context_version: number;
  generated_at: string;
  blueprint_slice: Record<string, unknown>;
  evidence: Array<{
    id: string;
    situation: string;
    action: string;
    result: string;
    metrics_defensible: boolean;
    user_validated: boolean;
    mapped_requirements: string[];
    scope_metrics: Record<string, string>;
  }>;
  keywords: Array<{
    keyword: string;
    target_density: number;
    current_count: number;
  }>;
  gap_mappings: Array<{
    requirement: string;
    classification: 'strong' | 'partial' | 'gap';
  }>;
  section_order: string[];
  sections_approved: string[];
  suggestions?: SectionSuggestion[];
}

// --- Section Review ---
export interface SectionReviewData {
  section: string;
  content: string;
  review_token?: string;
  context?: SectionWorkbenchContext | null;
}

// --- Questionnaire ---
export interface QuestionnaireData {
  questionnaire_id: string;
  schema_version: number;
  stage: string;
  title: string;
  subtitle?: string;
  questions: QuestionnaireQuestion[];
  current_index: number;
}

// Discriminated union type for all panel data (type field matches PanelType)
export type PanelData =
  | { type: 'onboarding_summary' } & OnboardingSummaryData
  | { type: 'research_dashboard' } & ResearchDashboardData
  | { type: 'gap_analysis' } & GapAnalysisData
  | { type: 'design_options' } & DesignOptionsData
  | { type: 'live_resume' } & LiveResumeData
  | { type: 'quality_dashboard' } & QualityDashboardData
  | { type: 'completion' } & CompletionData
  | { type: 'positioning_interview' } & PositioningInterviewData
  | { type: 'blueprint_review' } & BlueprintReviewData
  | { type: 'section_review' } & SectionReviewData
  | { type: 'questionnaire' } & QuestionnaireData;
