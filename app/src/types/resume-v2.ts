/**
 * Resume Agent v2 — Frontend Type Definitions
 *
 * Mirrors the server's V2PipelineSSEEvent types for the streaming UX.
 * These types define what the frontend receives and accumulates.
 */

// ─── Pipeline Stages ────────────────────────────────────────────────

export type V2Stage =
  | 'intake'
  | 'analysis'
  | 'strategy'
  | 'writing'
  | 'verification'
  | 'assembly'
  | 'complete';

// ─── Agent Outputs (accumulated as pipeline progresses) ─────────────

export interface JobIntelligence {
  company_name: string;
  role_title: string;
  seniority_level: string;
  core_competencies: Array<{
    competency: string;
    importance: 'must_have' | 'important' | 'nice_to_have';
    evidence_from_jd: string;
  }>;
  strategic_responsibilities: string[];
  business_problems: string[];
  cultural_signals: string[];
  hidden_hiring_signals: string[];
  language_keywords: string[];
  industry: string;
}

export interface CandidateIntelligence {
  contact: {
    name: string;
    email: string;
    phone: string;
    linkedin?: string;
    location?: string;
  };
  career_themes: string[];
  leadership_scope: string;
  quantified_outcomes: Array<{
    outcome: string;
    metric_type: 'money' | 'time' | 'volume' | 'scope';
    value: string;
  }>;
  industry_depth: string[];
  technologies: string[];
  operational_scale: string;
  career_span_years: number;
  experience: Array<{
    company: string;
    title: string;
    start_date: string;
    end_date: string;
    bullets: string[];
    inferred_scope?: {
      team_size?: string;
      budget?: string;
      geography?: string;
      revenue_impact?: string;
    };
  }>;
  education: Array<{ degree: string; institution: string; year?: string }>;
  certifications: string[];
  hidden_accomplishments: string[];
}

export interface BenchmarkCandidate {
  ideal_profile_summary: string;
  expected_achievements: Array<{
    area: string;
    description: string;
    typical_metrics: string;
  }>;
  expected_leadership_scope: string;
  expected_industry_knowledge: string[];
  expected_technical_skills: string[];
  expected_certifications: string[];
  differentiators: string[];
}

export interface GapStrategy {
  real_experience: string;
  positioning: string;
  inferred_metric?: string;
  inference_rationale?: string;
  ai_reasoning?: string;
  interview_questions?: Array<{
    question: string;
    rationale: string;
    looking_for: string;
  }>;
}

export type GapClassification = 'strong' | 'partial' | 'missing';

export interface RequirementGap {
  requirement: string;
  source?: 'job_description' | 'benchmark';
  importance: 'must_have' | 'important' | 'nice_to_have';
  classification: GapClassification;
  evidence: string[];
  strategy?: GapStrategy;
}

export interface GapAnalysis {
  requirements: RequirementGap[];
  coverage_score: number;
  strength_summary: string;
  critical_gaps: string[];
  pending_strategies: Array<{
    requirement: string;
    strategy: GapStrategy;
  }>;
}

// ─── Gap Coaching (AI coaching conversation) ─────────────────────

export interface GapCoachingCard {
  requirement: string;
  importance: 'must_have' | 'important' | 'nice_to_have';
  classification: GapClassification;
  ai_reasoning: string;
  proposed_strategy: string;
  inferred_metric?: string;
  inference_rationale?: string;
  evidence_found: string[];
  /** True when this strategy was approved in a previous run (e.g. "Add Context" re-run) */
  previously_approved?: boolean;
  /** Targeted questions to ask the user about this specific gap */
  interview_questions?: Array<{
    question: string;
    rationale: string;
    looking_for: string;
  }>;
}

export type GapCoachingAction = 'approve' | 'context' | 'skip';

export interface GapCoachingResponse {
  requirement: string;
  action: GapCoachingAction;
  user_context?: string;
}

// ─── Pre-Scores (baseline before optimization) ───────────────────

export interface PreScores {
  ats_match: number;
  keywords_found: string[];
  keywords_missing: string[];
}

// ─── Positioning Assessment ──────────────────────────────────────

export interface PositioningAssessmentEntry {
  requirement: string;
  importance: 'must_have' | 'important' | 'nice_to_have';
  status: 'strong' | 'repositioned' | 'gap';
  addressed_by: Array<{ section: string; bullet_text: string }>;
  strategy_used?: string;
}

export interface PositioningAssessment {
  summary: string;
  requirement_map: PositioningAssessmentEntry[];
  before_score: number;
  after_score: number;
  strategies_applied: string[];
}

export interface GapPositioningMapEntry {
  requirement: string;
  narrative_positioning: string;
  where_to_feature: string;
  narrative_justification: string;
}

export interface NarrativeStrategy {
  primary_narrative: string;
  supporting_themes: string[];
  branded_title: string;
  why_me_story: string;
  why_me_concise: string;
  why_me_best_line: string;
  section_guidance: {
    summary_angle: string;
    competency_themes: string[];
    accomplishment_priorities: string[];
    experience_framing: Record<string, string>;
  };
  // New fields — optional for backward compatibility
  narrative_angle_rationale?: string;
  narrative_origin?: string;
  unique_differentiators?: string[];
  gap_positioning_map?: GapPositioningMapEntry[];
  interview_talking_points?: string[];
}

export interface ResumeBullet {
  text: string;
  is_new: boolean;
  addresses_requirements: string[];
}

export interface ResumeExperience {
  company: string;
  title: string;
  start_date: string;
  end_date: string;
  scope_statement: string;
  bullets: ResumeBullet[];
}

export interface ResumeDraft {
  header: {
    name: string;
    phone: string;
    email: string;
    linkedin?: string;
    branded_title: string;
  };
  executive_summary: {
    content: string;
    is_new: boolean;
  };
  core_competencies: string[];
  selected_accomplishments: Array<{
    content: string;
    is_new: boolean;
    addresses_requirements: string[];
  }>;
  professional_experience: ResumeExperience[];
  earlier_career?: Array<{
    company: string;
    title: string;
    dates: string;
  }>;
  education: Array<{ degree: string; institution: string; year?: string }>;
  certifications: string[];
}

export interface VerificationScores {
  ats_match: number;
  truth: number;
  tone: number;
}

export interface QuickWin {
  description: string;
  impact: 'high' | 'medium' | 'low';
}

export interface AssemblyResult {
  final_resume: ResumeDraft;
  scores: VerificationScores;
  quick_wins: QuickWin[];
  positioning_assessment?: PositioningAssessment;
}

// ─── Pipeline State (accumulated in the frontend) ───────────────────

export interface V2PipelineData {
  sessionId: string;
  stage: V2Stage;
  jobIntelligence: JobIntelligence | null;
  candidateIntelligence: CandidateIntelligence | null;
  benchmarkCandidate: BenchmarkCandidate | null;
  gapAnalysis: GapAnalysis | null;
  gapCoachingCards: GapCoachingCard[] | null;
  preScores: PreScores | null;
  narrativeStrategy: NarrativeStrategy | null;
  resumeDraft: ResumeDraft | null;
  assembly: AssemblyResult | null;
  error: string | null;
  stageMessages: Array<{ stage: V2Stage; message: string; type: 'start' | 'complete'; duration_ms?: number }>;
}

// ─── SSE Event Types (matches server V2PipelineSSEEvent) ────────────

export type V2SSEEvent =
  | { type: 'stage_start'; stage: V2Stage; message: string }
  | { type: 'stage_complete'; stage: V2Stage; message: string; duration_ms: number }
  | { type: 'job_intelligence'; data: JobIntelligence }
  | { type: 'candidate_intelligence'; data: CandidateIntelligence }
  | { type: 'benchmark_candidate'; data: BenchmarkCandidate }
  | { type: 'gap_analysis'; data: GapAnalysis }
  | { type: 'pre_scores'; data: PreScores }
  | { type: 'gap_coaching'; data: GapCoachingCard[] }
  | { type: 'narrative_strategy'; data: NarrativeStrategy }
  | { type: 'resume_draft'; data: ResumeDraft }
  | { type: 'verification_complete' }  // Scores come through assembly_complete
  | { type: 'assembly_complete'; data: AssemblyResult }
  | { type: 'pipeline_complete'; session_id: string }
  | { type: 'pipeline_error'; stage: V2Stage; error: string }
  | { type: 'transparency'; message: string; stage: V2Stage };
