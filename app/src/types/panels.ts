// Panel type identifiers matching backend panel_type values
export type PanelType =
  | 'onboarding_summary'
  | 'research_dashboard'
  | 'gap_analysis'
  | 'design_options'
  | 'live_resume'
  | 'quality_dashboard'
  | 'cover_letter'
  | 'interview_prep';

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

// --- Cover Letter ---
export interface CoverLetterParagraph {
  type: string;
  content: string;
  status: 'draft' | 'confirmed';
}

export interface CoverLetterData {
  paragraphs: CoverLetterParagraph[];
  company_name?: string;
  role_title?: string;
}

// --- Interview Prep ---
export interface InterviewQuestion {
  question: string;
  why_asked: string;
  star_framework: {
    situation: string;
    task: string;
    action: string;
    result: string;
  };
}

export interface InterviewCategory {
  category: string;
  questions: InterviewQuestion[];
}

export interface InterviewPrepData {
  categories: InterviewCategory[];
}

// Discriminated union type for all panel data (type field matches PanelType)
export type PanelData =
  | { type: 'onboarding_summary' } & OnboardingSummaryData
  | { type: 'research_dashboard' } & ResearchDashboardData
  | { type: 'gap_analysis' } & GapAnalysisData
  | { type: 'design_options' } & DesignOptionsData
  | { type: 'live_resume' } & LiveResumeData
  | { type: 'quality_dashboard' } & QualityDashboardData
  | { type: 'cover_letter' } & CoverLetterData
  | { type: 'interview_prep' } & InterviewPrepData;
