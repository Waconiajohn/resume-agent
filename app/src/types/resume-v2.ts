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
  coaching_policy?: RequirementCoachingPolicySnapshot;
}

export interface RequirementCoachingPolicySnapshot {
  primaryFamily: string | null;
  families: string[];
  clarifyingQuestion: string;
  proofActionRequiresInput: string;
  proofActionDirect: string;
  rationale: string;
  lookingFor: string;
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

export interface RequirementGap {
  requirement: string;
  source?: RequirementSource;
  category?: RequirementCategory;
  score_domain?: RequirementScoreDomain;
  importance: 'must_have' | 'important' | 'nice_to_have';
  classification: GapClassification;
  evidence: string[];
  source_evidence?: string;
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

export interface GapAnalysis {
  requirements: RequirementGap[];
  coverage_score: number;
  score_breakdown?: {
    job_description: RequirementCoverageBreakdown;
    benchmark: RequirementCoverageBreakdown;
  };
  strength_summary: string;
  critical_gaps: string[];
  pending_strategies: Array<{
    requirement: string;
    strategy: GapStrategy;
  }>;
}

// ─── Gap Questions (gate emitted before writing, requires user responses) ──
// NOTE: GapQuestion.importance uses a simplified UI-facing scale:
//   'critical' | 'important' | 'supporting'
// This maps from the canonical requirement importance scale:
//   'must_have' → 'critical', 'important' → 'important', 'nice_to_have' → 'supporting'
// The simplification is intentional — user-facing gap questions use plain language.
// GapQuestion.classification uses a subset of GapClassification (only 'partial' | 'missing',
// since 'strong' requirements don't generate questions).

export interface GapQuestion {
  id: string;
  requirement: string;
  importance: 'critical' | 'important' | 'supporting';
  classification: 'partial' | 'missing';
  question: string;
  context: string;
  currentEvidence: string[];
  informational_only?: boolean;
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
  coaching_policy?: RequirementCoachingPolicySnapshot;
}

export type GapCoachingAction = 'approve' | 'context' | 'skip';

export type GapPlacementTarget = 'auto' | 'summary' | 'competencies' | 'accomplishments' | 'experience';

export interface GapCoachingResponse {
  requirement: string;
  action: GapCoachingAction;
  user_context?: string;
  /** Where the user wants this strategy placed. Defaults to 'auto' (writer decides). */
  target_section?: GapPlacementTarget;
  /** For 'experience' placement — which company's bullets should carry this strategy */
  target_company?: string;
}

// ─── Pre-Scores (baseline before optimization) ───────────────────

export interface PreScores {
  /** Original keyword/ATS-style baseline from the uploaded resume */
  ats_match: number;
  keywords_found: string[];
  keywords_missing: string[];
  /** Explicit alias for the keyword baseline to keep downstream semantics clear */
  keyword_match_score?: number;
  /** Original JD requirement coverage before optimization */
  job_requirement_coverage_score?: number;
  /** Blended on-paper fit baseline used for before/after headline comparisons */
  overall_fit_score?: number;
}

// ─── Positioning Assessment ──────────────────────────────────────
// NOTE: PositioningAssessmentEntry.status uses a DIFFERENT scheme from GapClassification.
// GapClassification ('strong' | 'partial' | 'missing') is the pre-pipeline gap classification.
// PositioningAssessment status ('strong' | 'repositioned' | 'gap') is the post-pipeline result:
//   - 'repositioned' means a gap/partial was successfully addressed via a positioning strategy
//   - 'gap' means it remained unaddressed after the full pipeline ran
// These are intentionally different domains — do not unify them.

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

export type BulletConfidence = 'strong' | 'partial' | 'needs_validation';
export type ResumeReviewState =
  | 'supported'
  | 'supported_rewrite'
  | 'strengthen'
  | 'confirm_fit'
  | 'code_red';
export type ResumeContentOrigin =
  | 'verbatim_resume'
  | 'resume_rewrite'
  | 'multi_source_synthesis'
  | 'gap_closing_draft';
export type ResumeSupportOrigin =
  | 'original_resume'
  | 'adjacent_resume_inference'
  | 'user_confirmed_context'
  | 'not_found';

export interface ResumePriorityTarget {
  requirement: string;
  source: RequirementSource;
  importance: 'must_have' | 'important' | 'nice_to_have';
  source_evidence?: string;
}

export interface ResumeBullet {
  text: string;
  is_new: boolean;
  addresses_requirements: string[];
  primary_target_requirement?: string;
  primary_target_source?: RequirementSource;
  target_evidence?: string;
  source?: 'original' | 'enhanced' | 'drafted';
  /** Confidence level — guaranteed by server ensureBulletMetadata() */
  confidence: BulletConfidence;
  review_state?: ResumeReviewState;
  /** The original resume text that supports this bullet */
  evidence_found: string;
  /** Whether this requirement came from the JD or from the benchmark profile */
  requirement_source: RequirementSource;
  content_origin?: ResumeContentOrigin;
  support_origin?: ResumeSupportOrigin;
}

export interface ResumeExperience {
  company: string;
  title: string;
  start_date: string;
  end_date: string;
  scope_statement: string;
  scope_statement_is_new?: boolean;
  scope_statement_addresses_requirements?: string[];
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
    addresses_requirements?: string[];
  };
  core_competencies: string[];
  selected_accomplishments: Array<{
    content: string;
    is_new: boolean;
    addresses_requirements: string[];
    primary_target_requirement?: string;
    primary_target_source?: RequirementSource;
    target_evidence?: string;
    source?: 'original' | 'enhanced' | 'drafted';
    /** Confidence level — guaranteed by server ensureBulletMetadata() */
    confidence: BulletConfidence;
    review_state?: ResumeReviewState;
    /** The original resume text that supports this bullet */
    evidence_found: string;
    /** Whether this requirement came from the JD or from the benchmark profile */
    requirement_source: RequirementSource;
    content_origin?: ResumeContentOrigin;
    support_origin?: ResumeSupportOrigin;
  }>;
  selected_accomplishment_targets?: ResumePriorityTarget[];
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

export interface HiringManagerScan {
  pass: boolean;
  scan_score: number;
  header_impact: { score: number; note: string };
  summary_clarity: { score: number; note: string };
  above_fold_strength: { score: number; note: string };
  keyword_visibility: { score: number; note: string };
  red_flags: string[];
  quick_wins: string[];
}

export interface AssemblyResult {
  final_resume: ResumeDraft;
  scores: VerificationScores;
  quick_wins: QuickWin[];
  positioning_assessment?: PositioningAssessment;
  hiring_manager_scan?: HiringManagerScan;
}

// ─── Gap Chat (per-item coaching conversation) ──────────────────────

export type CoachingRecommendedAction =
  | 'answer_question'
  | 'review_edit'
  | 'try_another_angle'
  | 'skip'
  | 'confirm';

export interface GapChatMessage {
  role: 'user' | 'assistant';
  content: string;
  suggestedLanguage?: string;
  followUpQuestion?: string;
  currentQuestion?: string;
  needsCandidateInput?: boolean;
  recommendedNextAction?: CoachingRecommendedAction;
  candidateInputUsed?: boolean;
}

export interface GapChatContext {
  evidence: string[];
  currentStrategy?: string;
  aiReasoning?: string;
  inferredMetric?: string;
  jobDescriptionExcerpt: string;
  candidateExperienceSummary: string;
  coachingPolicy?: RequirementCoachingPolicySnapshot;
}

export interface FinalReviewChatContext {
  concernId: string;
  concernType: FinalReviewConcern['type'];
  severity: FinalReviewConcern['severity'];
  observation: string;
  whyItHurts: string;
  fixStrategy: string;
  requiresCandidateInput?: boolean;
  clarifyingQuestion?: string;
  targetSection?: string;
  relatedRequirement?: string;
  suggestedResumeEdit?: string;
  roleTitle: string;
  companyName: string;
  jobDescriptionFit?: FinalReviewFitAssessment['job_description_fit'];
  benchmarkAlignment?: FinalReviewFitAssessment['benchmark_alignment'];
  businessImpact?: FinalReviewFitAssessment['business_impact'];
  clarityAndCredibility?: FinalReviewFitAssessment['clarity_and_credibility'];
  resumeExcerpt: string;
}

export interface CoachingThreadItemSnapshot {
  messages: GapChatMessage[];
  resolvedLanguage: string | null;
  error: string | null;
}

export interface CoachingThreadSnapshot {
  items: Record<string, CoachingThreadItemSnapshot>;
}

// ─── Final Review (recruiter skim + hiring manager critique) ───────────────

export interface FinalReviewSignal {
  signal: string;
  why_it_matters: string;
  visible_in_top_third?: boolean;
}

export interface FinalReviewVerdict {
  rating:
    | 'strong_interview_candidate'
    | 'possible_interview'
    | 'needs_improvement'
    | 'likely_rejected';
  summary: string;
}

export interface FinalReviewFitAssessment {
  job_description_fit: 'strong' | 'moderate' | 'weak';
  benchmark_alignment: 'strong' | 'moderate' | 'weak';
  business_impact: 'strong' | 'moderate' | 'weak';
  clarity_and_credibility: 'strong' | 'moderate' | 'weak';
}

export interface FinalReviewTopWin {
  win: string;
  why_powerful: string;
  aligned_requirement: string;
  prominent_enough: boolean;
  repositioning_recommendation: string;
}

export interface FinalReviewConcern {
  id: string;
  severity: 'critical' | 'moderate' | 'minor';
  type:
    | 'missing_evidence'
    | 'weak_positioning'
    | 'missing_metric'
    | 'unclear_scope'
    | 'benchmark_gap'
    | 'clarity_issue'
    | 'credibility_risk';
  observation: string;
  why_it_hurts: string;
  fix_strategy: string;
  target_section?: string;
  related_requirement?: string;
  suggested_resume_edit?: string;
  requires_candidate_input: boolean;
  clarifying_question?: string;
}

export interface FinalReviewStructureRecommendation {
  issue: string;
  recommendation: string;
  priority: 'high' | 'medium' | 'low';
}

export interface FinalReviewResult {
  six_second_scan: {
    decision: 'continue_reading' | 'skip';
    reason: string;
    top_signals_seen: FinalReviewSignal[];
    important_signals_missing: FinalReviewSignal[];
  };
  hiring_manager_verdict: FinalReviewVerdict;
  fit_assessment: FinalReviewFitAssessment;
  top_wins: FinalReviewTopWin[];
  concerns: FinalReviewConcern[];
  structure_recommendations: FinalReviewStructureRecommendation[];
  benchmark_comparison: {
    advantages_vs_benchmark: string[];
    gaps_vs_benchmark: string[];
    reframing_opportunities: string[];
  };
  improvement_summary: string[];
}

export type RewriteQueueSource = 'job_description' | 'benchmark' | 'final_review';

export type RewriteQueueCategory =
  | 'quick_win'
  | 'proof_upgrade'
  | 'hard_gap'
  | 'benchmark_stretch'
  | 'final_review_issue';

export type RewriteQueueStatus =
  | 'already_covered'
  | 'partially_addressed'
  | 'needs_more_evidence'
  | 'not_addressed';

export type RewriteQueueBucket =
  | 'needs_attention'
  | 'partially_addressed'
  | 'resolved';

export type RewriteQueueAction =
  | 'answer_question'
  | 'review_edit'
  | 'review_suggested_fix'
  | 'view_in_resume'
  | 'check_hard_requirement'
  | 'rerun_final_review'
  | 'verify';

export interface RewriteQueueEvidence {
  text: string;
  source: 'resume' | 'job_description' | 'benchmark' | 'final_review';
  section?: string;
  isNew?: boolean;
  basis?: 'mapped' | 'nearby' | 'source';
}

export interface RewriteQueueNextStep {
  action: RewriteQueueAction;
  label: string;
  detail: string;
}

export interface RewriteQueueItem {
  id: string;
  kind: 'requirement' | 'final_review';
  source: RewriteQueueSource;
  category: RewriteQueueCategory;
  title: string;
  status: RewriteQueueStatus;
  bucket: RewriteQueueBucket;
  isResolved: boolean;
  whyItMatters: string;
  aiPlan: string;
  userInstruction: string;
  currentEvidence: RewriteQueueEvidence[];
  sourceEvidence: RewriteQueueEvidence[];
  recommendedNextStep: RewriteQueueNextStep;
  requirement?: string;
  concernId?: string;
  targetSection?: string;
  relatedRequirement?: string;
  importance?: RequirementGap['importance'];
  classification?: GapClassification;
  severity?: FinalReviewConcern['severity'];
  candidateInputNeeded?: boolean;
  coachingReasoning?: string;
  coachingPolicy?: RequirementCoachingPolicySnapshot;
  starterQuestion?: string;
  riskNote?: string;
  suggestedDraft?: string;
}

export interface RewriteQueueSummary {
  total: number;
  needsAttention: number;
  partiallyAddressed: number;
  resolved: number;
  hardGapCount: number;
}

export interface FinalReviewPersistedState {
  result: FinalReviewResult | null;
  resolved_concern_ids: string[];
  acknowledged_export_warnings: boolean;
  is_stale: boolean;
  reviewed_resume_text?: string | null;
  last_run_at?: string;
}

export interface PostReviewPolishResult {
  ats_score: number;
  keywords_found: string[];
  keywords_missing: string[];
  top_suggestions: string[];
  tone_score: number;
  tone_findings: string[];
}

export interface PostReviewPolishState {
  status: 'idle' | 'running' | 'complete' | 'error';
  message: string;
  result: PostReviewPolishResult | null;
  last_triggered_by_concern_id?: string | null;
  updated_at?: string;
}

export type MasterPromotionItemCategory =
  | 'experience_bullet'
  | 'scope_statement'
  | 'selected_accomplishment';

export interface MasterPromotionItem {
  id: string;
  category: MasterPromotionItemCategory;
  section: string;
  label: string;
  text: string;
  company?: string;
  title?: string;
  addressesRequirements?: string[];
}

export interface MasterPromotionState {
  selected_item_ids: string[];
}

export interface V2PersistedDraftState {
  editable_resume: ResumeDraft | null;
  master_save_mode: 'session_only' | 'master_resume';
  gap_chat_state?: CoachingThreadSnapshot | null;
  final_review_state?: FinalReviewPersistedState | null;
  final_review_chat_state?: CoachingThreadSnapshot | null;
  post_review_polish?: PostReviewPolishState | null;
  master_promotion_state?: MasterPromotionState | null;
  updated_at: string;
}

// ─── Verification Detail (full agent outputs from truth, ATS, tone) ─

export interface TruthVerificationDetail {
  truth_score: number;
  claims: Array<{
    claim: string;
    section: string;
    source_found: boolean;
    confidence: 'verified' | 'plausible' | 'unverified' | 'fabricated';
    source_text?: string;
    note?: string;
  }>;
  flagged_items: Array<{
    claim: string;
    issue: string;
    recommendation: string;
  }>;
}

export interface ATSOptimizationDetail {
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

export interface ExecutiveToneDetail {
  tone_score: number;
  findings: Array<{
    text: string;
    section: string;
    issue: string;
    suggestion: string;
  }>;
  banned_phrases_found: string[];
}

export interface VerificationDetail {
  truth: TruthVerificationDetail;
  ats: ATSOptimizationDetail;
  tone: ExecutiveToneDetail;
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
  gapQuestions: GapQuestion[] | null;
  preScores: PreScores | null;
  narrativeStrategy: NarrativeStrategy | null;
  resumeDraft: ResumeDraft | null;
  assembly: AssemblyResult | null;
  hiringManagerScan: HiringManagerScan | null;
  /** Full verification agent outputs (truth, ATS, tone) from the pipeline */
  verificationDetail: VerificationDetail | null;
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
  | { type: 'gap_questions'; data: { questions: GapQuestion[] } }
  | { type: 'narrative_strategy'; data: NarrativeStrategy }
  | { type: 'resume_draft'; data: ResumeDraft }
  | { type: 'verification_complete'; data?: { truth?: TruthVerificationDetail; ats?: ATSOptimizationDetail; tone?: ExecutiveToneDetail } }
  | { type: 'assembly_complete'; data: AssemblyResult }
  | { type: 'hiring_manager_scan'; data: HiringManagerScan }
  | { type: 'pipeline_complete'; session_id: string }
  | { type: 'pipeline_error'; stage: V2Stage; error: string }
  | { type: 'transparency'; message: string; stage: V2Stage };
