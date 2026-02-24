/**
 * Shared type definitions for the v2 multi-agent pipeline.
 *
 * Each agent is a pure function: typed input → typed output.
 * No shared state between agents — all data passes through these interfaces.
 */

// ─── Agent 1: Intake ─────────────────────────────────────────────────

export interface IntakeInput {
  raw_resume_text: string;
  job_description?: string;
}

export interface IntakeOutput {
  contact: {
    name: string;
    email: string;
    phone: string;
    location: string;
    linkedin?: string;
  };
  summary: string;
  experience: ExperienceEntry[];
  skills: string[];
  education: EducationEntry[];
  certifications: string[];
  career_span_years: number;
  raw_text: string;
}

export interface ExperienceEntry {
  company: string;
  title: string;
  start_date: string;
  end_date: string;
  bullets: string[];
  inferred_scope?: {
    team_size?: string;
    budget?: string;
    geography?: string;
  };
}

export interface EducationEntry {
  degree: string;
  institution: string;
  year?: string;
}

// ─── Agent 2: Positioning Coach ("Why Me") ───────────────────────────

export type QuestionCategory =
  | 'scale_and_scope'
  | 'requirement_mapped'
  | 'career_narrative'
  | 'hidden_accomplishments'
  | 'currency_and_adaptability';

export interface PositioningCoachInput {
  parsed_resume: IntakeOutput;
  existing_profile?: PositioningProfile | null;
  target_role?: string;
}

export interface PositioningProfile {
  career_arc: {
    label: string;
    evidence: string;
    user_description: string;
  };
  top_capabilities: Array<{
    capability: string;
    evidence: string[];
    source: 'resume' | 'interview' | 'both';
  }>;
  evidence_library: EvidenceItem[];
  signature_method: {
    name: string | null;
    what_it_improves: string;
    adopted_by_others: boolean;
  } | null;
  unconscious_competence: string;
  domain_insight: string;
  authentic_phrases: string[];
  gaps_detected: string[];
}

export interface EvidenceItem {
  id?: string;
  situation: string;
  action: string;
  result: string;
  metrics_defensible: boolean;
  user_validated: boolean;
  source_question_id?: string;
  mapped_requirements?: string[];
  scope_metrics?: {
    team_size?: string;
    budget?: string;
    revenue_impact?: string;
    geography?: string;
  };
}

/** Question presented to user during Why Me interview */
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

/** Category progress for positioning interview UI */
export interface CategoryProgress {
  category: QuestionCategory;
  label: string;
  answered: number;
  total: number;
}

// ─── Agent 3: Research ───────────────────────────────────────────────

export interface ResearchInput {
  job_description: string;
  company_name: string;
  parsed_resume: IntakeOutput;
}

export interface ResearchOutput {
  jd_analysis: JDAnalysis;
  company_research: CompanyResearch;
  benchmark_candidate: BenchmarkCandidate;
}

export interface JDAnalysis {
  role_title: string;
  company: string;
  seniority_level: 'entry' | 'mid' | 'senior' | 'executive';
  must_haves: string[];
  nice_to_haves: string[];
  implicit_requirements: string[];
  language_keywords: string[];
}

export interface CompanyResearch {
  company_name: string;
  industry: string;
  size: string;
  culture_signals: string[];
}

export interface BenchmarkCandidate {
  ideal_profile: string;
  language_keywords: string[];
  section_expectations: Record<string, string>;
}

// ─── Agent 4: Gap Analyst ────────────────────────────────────────────

export interface GapAnalystInput {
  parsed_resume: IntakeOutput;
  positioning: PositioningProfile;
  jd_analysis: JDAnalysis;
  benchmark: BenchmarkCandidate;
}

export interface GapAnalystOutput {
  requirements: RequirementMapping[];
  coverage_score: number;
  critical_gaps: string[];
  addressable_gaps: string[];
  strength_summary: string;
}

export interface RequirementMapping {
  requirement: string;
  classification: 'strong' | 'partial' | 'gap';
  evidence: string[];
  resume_location?: string;
  positioning_source?: string;
  strengthen?: string;
  mitigation?: string;
  unaddressable?: boolean;
}

// ─── Agent 5: Resume Architect ───────────────────────────────────────

export interface ArchitectInput {
  parsed_resume: IntakeOutput;
  positioning: PositioningProfile;
  research: ResearchOutput;
  gap_analysis: GapAnalystOutput;
  user_preferences?: {
    primary_goal?: string;
    resume_priority?: string;
    seniority_delta?: string;
    workflow_mode?: 'fast_draft' | 'balanced' | 'deep_dive';
  };
  research_preferences?: {
    top_requirements?: string[];
    culture_alignment?: 'yes' | 'somewhat' | 'not_quite';
    culture_notes?: string;
    additional_notes?: string;
  };
}

export interface ArchitectOutput {
  blueprint_version: string;
  target_role: string;
  positioning_angle: string;

  section_plan: {
    order: string[];
    rationale: string;
  };

  summary_blueprint: SummaryBlueprint;
  evidence_allocation: EvidenceAllocation;
  skills_blueprint: SkillsBlueprint;
  experience_blueprint: ExperienceBlueprint;
  age_protection: AgeProtectionAudit;
  keyword_map: Record<string, KeywordTarget>;

  global_rules: {
    voice: string;
    bullet_format: string;
    length_target: string;
    ats_rules: string;
  };
}

export interface SummaryBlueprint {
  positioning_angle: string;
  must_include: string[];
  gap_reframe: Record<string, string>;
  tone_guidance: string;
  keywords_to_embed: string[];
  authentic_phrases_to_echo: string[];
  length: string;
}

export interface EvidenceAllocation {
  selected_accomplishments?: Array<{
    evidence_id: string;
    achievement: string;
    maps_to_requirements: string[];
    placement_rationale: string;
    enhancement: string;
  }>;
  experience_section: Record<string, {
    company: string;
    bullets_to_write: Array<{
      focus: string;
      maps_to: string;
      evidence_source: string;
      instruction: string;
      target_metric?: string;
    }>;
    bullets_to_keep: string[];
    bullets_to_cut: string[];
  }>;
  unallocated_requirements: Array<{
    requirement: string;
    resolution: string;
  }>;
}

export interface SkillsBlueprint {
  format: 'categorized';
  categories: Array<{
    label: string;
    skills: string[];
    rationale: string;
  }>;
  keywords_still_missing: string[];
  age_protection_removals: string[];
}

export interface ExperienceBlueprint {
  roles: Array<{
    company: string;
    title: string;
    dates: string;
    title_adjustment?: string;
    bullet_count: number;
  }>;
  earlier_career?: {
    include: boolean;
    roles: Array<{ title: string; company: string }>;
    format: string;
    rationale: string;
  };
}

export interface AgeProtectionAudit {
  flags: Array<{
    item: string;
    risk: string;
    action: string;
  }>;
  clean: boolean;
}

export interface KeywordTarget {
  target_density: number;
  placements: string[];
  current_count: number;
  action: string;
}

// ─── Agent 6: Section Writer ─────────────────────────────────────────

export interface SectionWriterInput {
  section: string;
  blueprint_slice: Record<string, unknown>;
  evidence_sources: Record<string, unknown>;
  global_rules: ArchitectOutput['global_rules'];
  signal?: AbortSignal;
}

export interface SectionWriterOutput {
  section: string;
  content: string;
  keywords_used: string[];
  requirements_addressed: string[];
  evidence_ids_used: string[];
}

// ─── Agent 7: Quality Reviewer ───────────────────────────────────────

export interface QualityReviewerInput {
  assembled_resume: {
    sections: Record<string, string>;
    full_text: string;
  };
  architect_blueprint: ArchitectOutput;
  jd_analysis: JDAnalysis;
  evidence_library: EvidenceItem[];
}

export interface QualityReviewerOutput {
  decision: 'approve' | 'revise' | 'redesign';
  scores: QualityScores;
  overall_pass: boolean;
  revision_instructions?: RevisionInstruction[];
  redesign_reason?: string;
}

export interface QualityScores {
  hiring_manager_impact: number;   // 1-5
  requirement_coverage: number;    // 0-100
  ats_score: number;               // 0-100
  authenticity: number;            // 0-100
  evidence_integrity: number;      // 0-100
  blueprint_compliance: number;    // 0-100
}

export interface RevisionInstruction {
  target_section: string;
  issue: string;
  instruction: string;
  priority: 'high' | 'medium' | 'low';
}

// ─── Questionnaire Types ─────────────────────────────────────────────

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
  generated_by?: string;
}

// ─── Section Suggestions ─────────────────────────────────────────

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

// ─── Pipeline Orchestration ──────────────────────────────────────────

export type PipelineStage =
  | 'intake'
  | 'positioning'
  | 'research'
  | 'gap_analysis'
  | 'architect'
  | 'architect_review'    // user reviews blueprint
  | 'section_writing'
  | 'section_review'      // user approves sections
  | 'quality_review'
  | 'revision'            // auto-revision loop
  | 'complete';

export interface PipelineState {
  session_id: string;
  user_id: string;
  current_stage: PipelineStage;

  // Accumulated data from each agent
  intake?: IntakeOutput;
  positioning?: PositioningProfile;
  research?: ResearchOutput;
  gap_analysis?: GapAnalystOutput;
  architect?: ArchitectOutput;
  sections?: Record<string, SectionWriterOutput>;
  quality_review?: QualityReviewerOutput;

  // Questionnaire data
  user_preferences?: {
    primary_goal?: string;
    resume_priority?: string;
    seniority_delta?: string;
    workflow_mode?: 'fast_draft' | 'balanced' | 'deep_dive';
  };
  research_preferences?: QuestionnaireSubmission;
  research_preferences_summary?: {
    top_requirements?: string[];
    culture_alignment?: 'yes' | 'somewhat' | 'not_quite';
    culture_notes?: string;
    additional_notes?: string;
  };

  // Metadata
  positioning_profile_id?: string;    // if reusing saved profile
  positioning_reuse_mode?: 'reuse' | 'update' | 'fresh';
  revision_count: number;
  token_usage: {
    input_tokens: number;
    output_tokens: number;
    estimated_cost_usd: number;
  };
}

// ─── SSE Events for Pipeline ─────────────────────────────────────────

export type PipelineSSEEvent =
  | { type: 'stage_start'; stage: PipelineStage; message: string }
  | { type: 'stage_complete'; stage: PipelineStage; message: string; duration_ms?: number }
  | { type: 'positioning_question'; question: PositioningQuestion; questions_total: number; category_progress?: CategoryProgress[] }
  | { type: 'positioning_profile_found'; profile: PositioningProfile; updated_at: string }
  | { type: 'blueprint_ready'; blueprint: ArchitectOutput }
  | { type: 'section_draft'; section: string; content: string; review_token?: string }
  | { type: 'section_revised'; section: string; content: string; review_token?: string }
  | { type: 'section_approved'; section: string }
  | {
      type: 'section_context';
      section: string;
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
  | { type: 'quality_scores'; scores: QualityScores }
  | { type: 'revision_start'; instructions: RevisionInstruction[] }
  | {
      type: 'pipeline_complete';
      session_id: string;
      contact_info?: Record<string, string>;
      company_name?: string;
      resume?: {
        summary: string;
        selected_accomplishments?: string;
        experience: Array<{
          company: string;
          title: string;
          start_date: string;
          end_date: string;
          location: string;
          bullets: Array<{ text: string; source: string }>;
        }>;
        skills: Record<string, string[]>;
        education: Array<{ institution: string; degree: string; field: string; year: string }>;
        certifications: Array<{ name: string; issuer: string; year: string }>;
        ats_score: number;
        contact_info?: Record<string, string>;
        section_order?: string[];
        company_name?: string;
        job_title?: string;
        _raw_sections?: Record<string, string>;
      };
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
  | { type: 'pipeline_error'; stage: PipelineStage; error: string }
  | { type: 'transparency'; message: string; stage: PipelineStage }
  | { type: 'system_message'; content: string }
  | { type: 'section_error'; section: string; error: string }
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
    };
