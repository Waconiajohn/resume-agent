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

import type { CareerProfileV2 } from '../../lib/career-profile-context.js';
import type { EvidenceItem } from '../../contracts/shared-evidence.js';
import type { RequirementCoachingPolicySnapshot } from '../../contracts/requirement-coaching-policy.js';

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
  /** AI readiness signals detected from resume — leadership precursors, not technical AI skills */
  ai_readiness?: {
    strength: 'strong' | 'moderate' | 'minimal' | 'none';
    signals: Array<{
      family: string;
      evidence: string;
      source_role?: string;
      executive_framing: string;
    }>;
    summary: string;
  };
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
  career_profile?: CareerProfileV2;
  /** Additional context provided by user after reviewing initial draft */
  user_context?: string;
}

export type GapClassification = 'strong' | 'partial' | 'missing';

export type RequirementSource = 'job_description' | 'benchmark';

export type RequirementCategory =
  | 'core_competency'
  | 'strategic_responsibility'
  | 'hidden_signal'
  | 'benchmark_leadership'
  | 'benchmark_achievement'
  | 'benchmark_skill'
  | 'benchmark_certification'
  | 'benchmark_industry'
  | 'benchmark_differentiator';

export type RequirementScoreDomain = 'ats' | 'benchmark';

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
  /** Targeted questions to surface hidden experience relevant to this gap */
  interview_questions?: Array<{
    question: string;
    /** Why this question is relevant to the gap */
    rationale: string;
    /** What kind of answer would help (guides the user) */
    looking_for: string;
  }>;
  coaching_policy?: RequirementCoachingPolicySnapshot;
}

export interface RequirementGap {
  requirement: string;
  source: RequirementSource;
  category?: RequirementCategory;
  score_domain?: RequirementScoreDomain;
  importance: 'must_have' | 'important' | 'nice_to_have';
  classification: GapClassification;
  evidence: string[];
  /** Source-side evidence explaining why this requirement exists */
  source_evidence?: string;
  /** Only present for partial/missing — creative strategy to close the gap */
  strategy?: GapStrategy;
}

export interface RequirementCoverageBreakdown {
  total: number;
  strong: number;
  partial: number;
  missing: number;
  addressed: number;
  coverage_score: number;
}

export interface GapAnalysisOutput {
  requirements: RequirementGap[];
  coverage_score: number;
  score_breakdown?: {
    job_description: RequirementCoverageBreakdown;
    benchmark: RequirementCoverageBreakdown;
  };
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

/** An approved gap strategy with optional user-specified placement intent */
export interface ApprovedStrategy {
  requirement: string;
  strategy: GapStrategy;
  /** Where the user wants this placed. Absent means writer decides. */
  target_section?: GapPlacementTarget;
  /** For 'experience' placement — which company's bullets should carry this */
  target_company?: string;
}

export interface NarrativeStrategyInput {
  gap_analysis: GapAnalysisOutput;
  candidate: CandidateIntelligenceOutput;
  job_intelligence: JobIntelligenceOutput;
  career_profile?: CareerProfileV2;
  /** Strategies the user approved from gap analysis */
  approved_strategies: ApprovedStrategy[];
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
  career_profile?: CareerProfileV2;
  approved_strategies: ApprovedStrategy[];
  /** Technologies and tools from the candidate's background */
  technologies?: string[];
  /** Industries the candidate has deep experience in */
  industry_depth?: string[];
  /** Description of the candidate's operational complexity and scale */
  operational_scale?: string;
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
  scope_statement_is_new?: boolean;
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
  /** Grouped technical skill categories (e.g. "Cloud Platforms": ["AWS", "Azure"]) */
  technical_skills?: Array<{
    category: string;
    skills: string[];
  }>;
  /** Flat list of technologies and tools for ATS matching */
  technologies?: string[];
  /** Industry or functional area summary for the resume */
  area_experience?: string;
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
  /** Canonical evidence mapping derived from legacy truth-verification claims */
  evidence_items?: EvidenceItem[];
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

// ─── Inline Suggestions (diff between original and AI-drafted resume) ──────

/**
 * A single inline suggestion representing a change between the original resume
 * and the AI-drafted resume, linked to the gap analysis requirement it addresses.
 * Computed deterministically in Assembly (no LLM call).
 */
export interface InlineSuggestion {
  id: string;
  requirementText: string;
  requirementPriority: 'critical' | 'important' | 'supporting';
  /** Whether this requirement came from the job description or from the benchmark profile */
  requirementSource: 'jd' | 'benchmark';
  sectionId: string;
  originalText: string;
  suggestedText: string;
  changeType: 'addition' | 'replacement' | 'deletion';
  rationale: string;
}

// ─── Agent 10: Resume Assembly ───────────────────────────────────────

/**
 * Simulates a hiring manager's 5-8 second resume scan.
 * Deterministic text analysis — no LLM call.
 */
export interface HiringManagerScan {
  /** Would this resume survive a 5-8 second hiring manager glance? */
  pass: boolean;
  /** Overall scan impact score 0-100 */
  scan_score: number;
  /** Is the branded title immediately compelling and role-matched? */
  header_impact: { score: number; note: string };
  /** Does the summary tell a clear story in the first 2 lines? */
  summary_clarity: { score: number; note: string };
  /** Are the most impressive qualifications visible in the top third? */
  above_fold_strength: { score: number; note: string };
  /** Do the first few bullets of recent experience use JD language? */
  keyword_visibility: { score: number; note: string };
  /** Obvious disqualifiers visible at a glance */
  red_flags: string[];
  /** Top 3 improvements for immediate scan impact */
  quick_wins: string[];
}

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
  /** Job intelligence used for hiring manager scan keyword matching */
  job_intelligence?: JobIntelligenceOutput;
  /** Candidate intelligence used for inline suggestion diff (raw_text = original resume) */
  candidate_intelligence?: CandidateIntelligenceOutput;
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
  /** Simulated 5-8 second hiring manager scan result */
  hiring_manager_scan?: HiringManagerScan;
  /** Diff-based inline suggestions between original and AI-drafted resume */
  inline_suggestions?: InlineSuggestion[];
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
  /** True when this strategy was approved in a previous run (e.g. "Add Context" re-run) */
  previously_approved?: boolean;
  /** Targeted questions to ask the user about this specific gap */
  interview_questions?: Array<{
    question: string;
    rationale: string;
    looking_for: string;
  }>;
  coaching_policy?: RequirementCoachingPolicySnapshot;
}

export type GapPlacementTarget = 'auto' | 'summary' | 'competencies' | 'accomplishments' | 'experience';

export interface GapCoachingResponse {
  requirement: string;
  action: 'approve' | 'context' | 'skip';
  user_context?: string;
  /** Where the user wants this strategy placed. Defaults to 'auto' (writer decides). */
  target_section?: GapPlacementTarget;
  /** For 'experience' placement — which company's bullets should carry this strategy */
  target_company?: string;
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
  career_profile?: CareerProfileV2;

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
  approved_strategies: ApprovedStrategy[];

  // Gap coaching responses from user
  gap_coaching_responses?: GapCoachingResponse[];

  // Tracking
  token_usage: {
    input_tokens: number;
    output_tokens: number;
    estimated_cost_usd: number;
  };
}

// ─── Gap Questions (gate emitted before writing, requires user responses) ──

export interface GapQuestion {
  /** Unique identifier — equal to the requirement string */
  id: string;
  requirement: string;
  importance: 'critical' | 'important' | 'supporting';
  /** Only 'partial' or 'missing' gaps are gated */
  classification: 'partial' | 'missing';
  /** The targeted question surfaced from gap analysis */
  question: string;
  /** AI reasoning explaining why this gap matters and what the question is probing */
  context: string;
  /** Evidence already found on the resume for this requirement */
  currentEvidence: string[];
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
  | { type: 'gap_questions'; data: { questions: GapQuestion[] } }
  | { type: 'narrative_strategy'; data: NarrativeStrategyOutput }
  | { type: 'resume_draft'; data: ResumeDraftOutput }
  | { type: 'verification_complete'; data: {
      truth: TruthVerificationOutput;
      ats: ATSOptimizationOutput;
      tone: ExecutiveToneOutput;
    }}
  | { type: 'assembly_complete'; data: AssemblyOutput }
  | { type: 'hiring_manager_scan'; data: HiringManagerScan }
  | { type: 'inline_suggestions'; data: { suggestions: InlineSuggestion[] } }
  | { type: 'pipeline_complete'; session_id: string }
  | { type: 'pipeline_error'; stage: V2PipelineStage; error: string }
  | { type: 'transparency'; message: string; stage: V2PipelineStage };
