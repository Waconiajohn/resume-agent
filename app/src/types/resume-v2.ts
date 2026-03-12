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
}

// ─── Pipeline State (accumulated in the frontend) ───────────────────

export interface V2PipelineData {
  sessionId: string;
  stage: V2Stage;
  jobIntelligence: JobIntelligence | null;
  candidateIntelligence: CandidateIntelligence | null;
  benchmarkCandidate: BenchmarkCandidate | null;
  gapAnalysis: GapAnalysis | null;
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
  | { type: 'narrative_strategy'; data: NarrativeStrategy }
  | { type: 'resume_draft'; data: ResumeDraft }
  | { type: 'verification_complete' }  // Scores come through assembly_complete
  | { type: 'assembly_complete'; data: AssemblyResult }
  | { type: 'pipeline_complete'; session_id: string }
  | { type: 'pipeline_error'; stage: V2Stage; error: string };
