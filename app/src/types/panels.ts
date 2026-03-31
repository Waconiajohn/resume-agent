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
  | 'questionnaire'
  | 'letter_review'
  | 'bio_review'
  | 'strategy_review'
  | 'sequence_review'
  | 'star_stories_review'
  | 'findings_review'
  | 'note_review'
  | 'stakeholder_review';

// --- Onboarding Summary ---
export interface OnboardingSummaryData {
  years_of_experience?: number;
  companies_count?: number;
  skills_count?: number;
  leadership_span?: string;
  budget_responsibility?: string;
  parse_confidence?: 'high' | 'medium' | 'low';
  parse_warnings?: string[];
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
  ideal_candidate_summary?: string;
  // v2 benchmark payload compatibility (server emits these and the UI can map/fallback)
  ideal_profile?: string;
  section_expectations?: Record<string, string>;
  assumptions?: Record<string, unknown>;
  inferred_assumptions?: Record<string, unknown>;
  user_overrides?: Record<string, unknown>;
  assumption_provenance?: Record<string, {
    source?: 'inferred' | 'user_edited' | string;
    edit_version?: number | null;
    edited_at?: string | null;
    note?: string | null;
  }>;
  confidence_by_assumption?: Record<string, number>;
  why_inferred?: Record<string, string>;
}

export interface ResearchDashboardData {
  company: CompanyCard;
  jd_requirements: JDRequirements;
  benchmark: BenchmarkProfile;
  loading_state?: 'running' | 'background_running' | 'complete';
  status_note?: string;
  next_expected?: string;
}

// --- Gap Analysis ---
// Legacy display types for the v1 GapAnalysisPanel.
// The canonical classification scheme is GapClassification ('strong' | 'partial' | 'missing')
// in resume-v2.ts. These types use 'gap' instead of 'missing' for UI display purposes.
// New code should use RequirementGap and GapAnalysis from resume-v2.ts.
// See: Backlog story "Unify Gap Analysis Types" (2026-03-30) for full retirement plan.

import type { GapClassification } from './resume-v2';

/** @deprecated Use RequirementGap from resume-v2.ts for new code. */
export interface RequirementFitItem {
  requirement: string;
  classification: 'strong' | 'partial' | 'gap';
  evidence: string;
  strategy?: string;
}

/** @deprecated Use GapAnalysis from resume-v2.ts for new code. */
export interface GapAnalysisData {
  requirements: RequirementFitItem[];
  strong_count: number;
  partial_count: number;
  gap_count: number;
  total: number;
  addressed: number;
}

/**
 * Maps canonical GapClassification to legacy panel display values.
 * 'missing' → 'gap' for user-facing display ("Not Addressed" reads better than "Missing").
 */
export function classificationToLegacy(c: GapClassification): 'strong' | 'partial' | 'gap' {
  return c === 'missing' ? 'gap' : c;
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
  evidence_integrity?: number;
  blueprint_compliance?: number;
  narrative_coherence?: number;
  risk_flags?: RiskFlag[];
  age_bias_risks?: string[];
  overall_assessment?: string;
  // Detailed findings from quality checks
  ats_findings?: Array<{ issue: string; priority: string }>;
  humanize_issues?: string[];
  coherence_issues?: string[];
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
export interface BlueprintKeywordTarget {
  keyword: string;
  target_density: number;
  current_count: number;
  placements: string[];
  action: string;
}

export interface BlueprintEvidenceItem {
  achievement: string;
  maps_to_requirements: string[];
  placement_rationale: string;
}

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
  // Enriched data (optional for backward compat)
  keyword_targets?: BlueprintKeywordTarget[];
  evidence_items?: BlueprintEvidenceItem[];
  experience_roles?: Array<{ role_key: string; company: string; bullet_range?: [number, number] }>;
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
  review_strategy?: 'per_section' | 'bundled';
  review_required_sections?: string[];
  auto_approved_sections?: string[];
  current_review_bundle_key?: 'headline' | 'core_experience' | 'supporting';
  review_bundles?: Array<{
    key: 'headline' | 'core_experience' | 'supporting';
    label: string;
    total_sections: number;
    review_required: number;
    reviewed_required: number;
    status: 'pending' | 'in_progress' | 'complete' | 'auto_approved';
  }>;
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

// --- Letter Review ---
export interface LetterReviewData {
  /** The full cover letter draft text */
  letter: string;
  /** Self-review quality score (0-100) */
  quality_score?: number;
}

// --- Bio Review ---
export interface BioVariant {
  /** Bio format label (e.g. "Speaker Bio", "Board Bio") */
  format_label: string;
  /** Bio length label (e.g. "Standard (250 words)") */
  length_label: string;
  /** Actual word count */
  word_count: number;
  /** The bio content */
  content: string;
  /** Quality score (0-100) */
  quality_score: number;
}

export interface BioReviewData {
  /** All generated bio variants */
  bios: BioVariant[];
  /** Overall quality score for the collection (0-100) */
  quality_score?: number;
  /** Final assembled report (markdown) */
  final_report?: string;
}

// --- Strategy Review (Salary Negotiation) ---
export interface StrategyReviewData {
  /** Recommended opening position (the number to ask for) */
  opening_position: string;
  /** Walk-away point (minimum acceptable) */
  walk_away_point: string;
  /** Best Alternative to a Negotiated Agreement */
  batna: string;
  /** Overall negotiation approach (e.g. "collaborative", "value-anchored") */
  approach: string;
  /** Market P50 for reference context (AI-estimated) */
  market_p50?: number;
  /** Market P75 for reference context (AI-estimated) */
  market_p75?: number;
  /** Confidence level of market data */
  data_confidence?: 'low' | 'medium' | 'high';
}

// --- Sequence Review (Networking Outreach) ---
export interface OutreachMessagePreview {
  /** Message type in the sequence */
  type: string;
  /** Message subject (for InMail) */
  subject: string;
  /** Full message body */
  body: string;
  /** Character count */
  char_count: number;
  /** Recommended timing */
  timing: string;
  /** Quality score (0-100) */
  quality_score: number;
}

export interface SequenceReviewData {
  /** All outreach messages in the sequence */
  messages: OutreachMessagePreview[];
  /** Target person's name */
  target_name: string;
  /** Target person's company */
  target_company: string;
  /** Overall sequence quality score (0-100) */
  quality_score: number;
}

// --- Star Stories Review (Interview Prep) ---
export interface StarStoriesReviewData {
  /** The full interview prep report (markdown) */
  report: string;
  /** Quality score (0-100) */
  quality_score?: number;
}

// --- Brand Findings Review (Personal Brand) ---
export interface AuditFindingItem {
  id: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  source: string;
  affected_elements: string[];
  recommendation: string;
}

export interface BrandFindingsReviewData {
  /** All audit findings */
  findings: AuditFindingItem[];
  /** Consistency scores (optional) */
  consistency_scores?: {
    overall: number;
    messaging: number;
    value_proposition: number;
    tone_voice: number;
    audience_alignment: number;
    visual_identity: number;
  };
}

// --- Note Review (Thank You Note) ---
export interface ThankYouNoteItem {
  interviewer_name: string;
  interviewer_title: string;
  format: string;
  content: string;
  subject_line?: string;
  personalization_notes: string;
  quality_score?: number;
}

export interface NoteReviewData {
  /** All generated thank-you notes */
  notes: ThankYouNoteItem[];
  /** Overall quality score (0-100) */
  quality_score?: number;
}

// --- Stakeholder Review (30-60-90 Day Plan) ---
export interface StakeholderItem {
  name_or_role: string;
  relationship_type: string;
  priority: string;
  engagement_strategy: string;
}

export interface StakeholderReviewData {
  /** AI-inferred stakeholder map */
  stakeholder_map: StakeholderItem[];
  /** Quick wins identified (summary context) */
  quick_wins?: Array<{
    description: string;
    impact: string;
    effort: string;
  }>;
  /** Role context for display */
  role_context?: {
    target_role: string;
    target_company: string;
    target_industry: string;
  };
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
  | { type: 'questionnaire' } & QuestionnaireData
  | { type: 'letter_review' } & LetterReviewData
  | { type: 'bio_review' } & BioReviewData
  | { type: 'strategy_review' } & StrategyReviewData
  | { type: 'sequence_review' } & SequenceReviewData
  | { type: 'star_stories_review' } & StarStoriesReviewData
  | { type: 'findings_review' } & BrandFindingsReviewData
  | { type: 'note_review' } & NoteReviewData
  | { type: 'stakeholder_review' } & StakeholderReviewData;
