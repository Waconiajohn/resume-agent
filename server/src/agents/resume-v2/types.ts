/**
 * Resume Agent v2 — Agent I/O Type Definitions
 *
 * 10-agent architecture: each agent is a single-prompt function with
 * typed input → typed output. No shared mutable state between agents.
 * The orchestrator passes outputs between agents explicitly.
 *
 * See: docs/obsidian/30_Specs & Designs/Resume Agent v2 — Design Blueprint.md
 * See: ADR-042
 */

// ─── Agent 1: Job Intelligence ───────────────────────────────────────

export interface JobIntelligenceInput {
  job_description: string;
}

export interface JobIntelligenceOutput {
  company_name: string;
  role_title: string;
  seniority_level: 'entry' | 'mid' | 'senior' | 'director' | 'vp' | 'c_suite';
  /** What the hiring manager actually cares about (not HR fluff) */
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

// ─── Agent 2: Candidate Intelligence ─────────────────────────────────

export interface CandidateIntelligenceInput {
  resume_text: string;
}

export interface ContactInfo {
  name: string;
  email: string;
  phone: string;
  linkedin?: string;
  location?: string;
}

export interface CandidateExperience {
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
}

export interface CandidateIntelligenceOutput {
  contact: ContactInfo;
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
  experience: CandidateExperience[];
  education: Array<{
    degree: string;
    institution: string;
    year?: string;
  }>;
  certifications: string[];
  hidden_accomplishments: string[];
  raw_text: string;
}

// ─── Agent 3: Benchmark Candidate ────────────────────────────────────

export interface BenchmarkCandidateInput {
  job_intelligence: JobIntelligenceOutput;
}

export interface BenchmarkCandidateOutput {
  /** The hiring manager's ideal hire — a realistic archetype, not a fantasy */
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

// ─── Agent 4: Gap Analysis ───────────────────────────────────────────

export interface GapAnalysisInput {
  candidate: CandidateIntelligenceOutput;
  benchmark: BenchmarkCandidateOutput;
  job_intelligence: JobIntelligenceOutput;
  /** Additional context provided by user after reviewing initial draft */
  user_context?: string;
}

export type GapClassification = 'strong' | 'partial' | 'missing';

export interface GapStrategy {
  /** What the candidate actually has that's adjacent to the requirement */
  real_experience: string;
  /** How to position it on the resume */
  positioning: string;
  /** Conservative number if inferred (backed off 10-20% from the math) */
  inferred_metric?: string;
  /** Explanation of the math/logic behind the inference */
  inference_rationale?: string;
  /**
   * Conversational explanation for the user — WHY this adjacent experience works.
   * Written as if the AI is coaching the candidate through the gap.
   * 2-3 sentences, natural language, showing the reasoning.
   */
  ai_reasoning?: string;
}

export interface RequirementGap {
  requirement: string;
  source: 'job_description' | 'benchmark';
  importance: 'must_have' | 'important' | 'nice_to_have';
  classification: GapClassification;
  evidence: string[];
  /** Only present for partial/missing — creative strategy to close the gap */
  strategy?: GapStrategy;
}

export interface GapAnalysisOutput {
  requirements: RequirementGap[];
  coverage_score: number;
  strength_summary: string;
  critical_gaps: string[];
  /**
   * Authoritative source for strategies requiring user confirmation before use.
   * These are the strategies the orchestrator passes to the Narrative Strategy agent.
   *
   * NOTE: `requirements[*].strategy` is for display context only (showing the user
   * what gap strategy exists for each requirement). `pending_strategies` is what
   * the orchestrator reads to build the approved_strategies list. Do not conflate them.
   */
  pending_strategies: Array<{
    requirement: string;
    strategy: GapStrategy;
  }>;
}

// ─── Agent 5: Narrative Strategy ─────────────────────────────────────

export interface NarrativeStrategyInput {
  gap_analysis: GapAnalysisOutput;
  candidate: CandidateIntelligenceOutput;
  job_intelligence: JobIntelligenceOutput;
  /** Strategies the user approved from gap analysis */
  approved_strategies: Array<{
    requirement: string;
    strategy: GapStrategy;
  }>;
  /** Differentiators from the Benchmark Candidate agent — raw material for the unique combination angle */
  benchmark_differentiators?: string[];
}

export interface GapPositioningMapEntry {
  requirement: string;
  narrative_positioning: string;
  where_to_feature: string;
  narrative_justification: string;
}

export interface NarrativeStrategyOutput {
  /** Primary positioning narrative (e.g., "Enterprise Transformation Leader") */
  primary_narrative: string;
  /** Rationale for the chosen positioning angle */
  narrative_angle_rationale: string;
  supporting_themes: string[];
  /** Branded title line for the resume header */
  branded_title: string;
  /** Why this person cares about this work — grounded in their history */
  narrative_origin: string;
  /** 3-5 specific differentiators unique to this candidate — not generic strengths */
  unique_differentiators: string[];
  /** Full "Why Me" positioning story */
  why_me_story: string;
  /** Concise interview version of the Why Me story */
  why_me_concise: string;
  /** The single best verbal line for the candidate */
  why_me_best_line: string;
  /** Where and how to surface gap strategies in the resume, with narrative justification */
  gap_positioning_map: GapPositioningMapEntry[];
  /** 3-5 story prompts for interviews that reinforce the narrative */
  interview_talking_points: string[];
  /** How to frame each section given the narrative */
  section_guidance: {
    summary_angle: string;
    competency_themes: string[];
    accomplishment_priorities: string[];
    experience_framing: Record<string, string>;
  };
}

// ─── Agent 6: Resume Writer ──────────────────────────────────────────

export interface ResumeWriterInput {
  job_intelligence: JobIntelligenceOutput;
  candidate: CandidateIntelligenceOutput;
  benchmark: BenchmarkCandidateOutput;
  gap_analysis: GapAnalysisOutput;
  narrative: NarrativeStrategyOutput;
  approved_strategies: Array<{
    requirement: string;
    strategy: GapStrategy;
  }>;
}

export interface ResumeBullet {
  text: string;
  /** Whether this bullet contains AI-enhanced content not from the original resume */
  is_new: boolean;
  /** Which requirement(s) this bullet addresses */
  addresses_requirements: string[];
}

export interface ResumeExperienceEntry {
  company: string;
  title: string;
  start_date: string;
  end_date: string;
  scope_statement: string;
  bullets: ResumeBullet[];
}

export interface ResumeDraftOutput {
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
  professional_experience: ResumeExperienceEntry[];
  earlier_career?: Array<{
    company: string;
    title: string;
    dates: string;
  }>;
  education: Array<{
    degree: string;
    institution: string;
    year?: string;
  }>;
  certifications: string[];
}

// ─── Agent 7: Truth Verification ─────────────────────────────────────

export interface TruthVerificationInput {
  draft: ResumeDraftOutput;
  original_resume: string;
  candidate: CandidateIntelligenceOutput;
}

export interface ClaimVerification {
  claim: string;
  section: string;
  source_found: boolean;
  source_text?: string;
  confidence: 'verified' | 'plausible' | 'unverified' | 'fabricated';
  note?: string;
}

export interface TruthVerificationOutput {
  claims: ClaimVerification[];
  truth_score: number;
  flagged_items: Array<{
    claim: string;
    issue: string;
    recommendation: string;
  }>;
}

// ─── Agent 8: ATS Optimization ───────────────────────────────────────

export interface ATSOptimizationInput {
  draft: ResumeDraftOutput;
  job_intelligence: JobIntelligenceOutput;
}

export interface ATSOptimizationOutput {
  match_score: number;
  keywords_found: string[];
  keywords_missing: string[];
  keyword_suggestions: Array<{
    keyword: string;
    suggested_placement: string;
    natural_phrasing: string;
  }>;
  formatting_issues: string[];
}

// ─── Agent 9: Executive Tone ─────────────────────────────────────────

export interface ExecutiveToneInput {
  draft: ResumeDraftOutput;
}

export interface ToneFinding {
  text: string;
  section: string;
  issue: 'junior_language' | 'ai_generated' | 'generic_filler' | 'passive_voice' | 'banned_phrase';
  suggestion: string;
}

export interface ExecutiveToneOutput {
  findings: ToneFinding[];
  tone_score: number;
  banned_phrases_found: string[];
}

// ─── Agent 10: Resume Assembly ───────────────────────────────────────

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

export interface AssemblyInput {
  draft: ResumeDraftOutput;
  truth_verification: TruthVerificationOutput;
  ats_optimization: ATSOptimizationOutput;
  executive_tone: ExecutiveToneOutput;
  gap_analysis?: GapAnalysisOutput;
  pre_scores?: PreScores;
}

export interface AssemblyOutput {
  /** Final resume with verification fixes applied */
  final_resume: ResumeDraftOutput;
  /** Combined scores from all verification agents */
  scores: {
    ats_match: number;
    truth: number;
    tone: number;
  };
  /** Top 3 quick wins the user could make */
  quick_wins: Array<{
    description: string;
    impact: 'high' | 'medium' | 'low';
  }>;
  /** Narrative assessment mapping resume to JD requirements */
  positioning_assessment?: PositioningAssessment;
}

// ─── Pre-Scores (before optimization baseline) ──────────────────

export interface PreScores {
  ats_match: number;
  keywords_found: string[];
  keywords_missing: string[];
}

// ─── Gap Coaching (AI coaching conversation for gaps) ────────────

export interface GapCoachingCard {
  requirement: string;
  importance: 'must_have' | 'important' | 'nice_to_have';
  classification: GapClassification;
  /** Conversational AI explanation of why adjacent experience works */
  ai_reasoning: string;
  /** Proposed strategy text for the resume */
  proposed_strategy: string;
  /** Inferred number if applicable */
  inferred_metric?: string;
  /** Math/logic behind inference */
  inference_rationale?: string;
  /** What real experience was found */
  evidence_found: string[];
}

export interface GapCoachingResponse {
  requirement: string;
  action: 'approve' | 'context' | 'skip';
  user_context?: string;
}

// ─── Orchestrator State ──────────────────────────────────────────────

export type V2PipelineStage =
  | 'intake'
  | 'analysis'      // Agents 1-3 (parallel)
  | 'strategy'      // Agents 4-5 (sequential)
  | 'writing'       // Agent 6
  | 'verification'  // Agents 7-9 (parallel)
  | 'assembly'      // Agent 10
  | 'complete';

export interface V2PipelineState {
  session_id: string;
  user_id: string;
  current_stage: V2PipelineStage;

  // Raw inputs
  resume_text: string;
  job_description: string;
  user_context?: string;

  // Agent outputs (populated as pipeline progresses)
  job_intelligence?: JobIntelligenceOutput;
  candidate_intelligence?: CandidateIntelligenceOutput;
  benchmark_candidate?: BenchmarkCandidateOutput;
  gap_analysis?: GapAnalysisOutput;
  narrative_strategy?: NarrativeStrategyOutput;
  resume_draft?: ResumeDraftOutput;
  truth_verification?: TruthVerificationOutput;
  ats_optimization?: ATSOptimizationOutput;
  executive_tone?: ExecutiveToneOutput;
  final_resume?: AssemblyOutput;

  // Pre-optimization baseline scores
  pre_scores?: PreScores;

  // User decisions
  approved_strategies: Array<{
    requirement: string;
    strategy: GapStrategy;
  }>;

  // Gap coaching responses from user
  gap_coaching_responses?: GapCoachingResponse[];

  // Tracking
  token_usage: {
    input_tokens: number;
    output_tokens: number;
    estimated_cost_usd: number;
  };
}

// ─── SSE Events for v2 Pipeline ──────────────────────────────────────

export type V2PipelineSSEEvent =
  | { type: 'stage_start'; stage: V2PipelineStage; message: string }
  | { type: 'stage_complete'; stage: V2PipelineStage; message: string; duration_ms: number }
  | { type: 'job_intelligence'; data: JobIntelligenceOutput }
  | { type: 'candidate_intelligence'; data: CandidateIntelligenceOutput }
  | { type: 'benchmark_candidate'; data: BenchmarkCandidateOutput }
  | { type: 'pre_scores'; data: PreScores }
  | { type: 'gap_analysis'; data: GapAnalysisOutput }
  | { type: 'gap_coaching'; data: GapCoachingCard[] }
  | { type: 'narrative_strategy'; data: NarrativeStrategyOutput }
  | { type: 'resume_draft'; data: ResumeDraftOutput }
  | { type: 'verification_complete'; data: {
      truth: TruthVerificationOutput;
      ats: ATSOptimizationOutput;
      tone: ExecutiveToneOutput;
    }}
  | { type: 'assembly_complete'; data: AssemblyOutput }
  | { type: 'pipeline_complete'; session_id: string }
  | { type: 'pipeline_error'; stage: V2PipelineStage; error: string }
  | { type: 'transparency'; message: string; stage: V2PipelineStage };
