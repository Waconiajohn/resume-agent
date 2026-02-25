/**
 * Pipeline Orchestrator
 *
 * Replaces the monolithic agent loop (loop.ts) with a linear pipeline of
 * 7 specialized agents. Manages data flow between agents, SSE events,
 * user interaction gates, and the revision loop.
 *
 * The orchestrator itself uses no LLM calls — it's pure coordination logic.
 */

import { setMaxListeners } from 'node:events';
import { supabaseAdmin } from '../lib/supabase.js';
import { MODEL_PRICING } from '../lib/llm.js';
import { startUsageTracking, stopUsageTracking, setUsageTrackingContext } from '../lib/llm-provider.js';
import { createSessionLogger } from '../lib/logger.js';
import { withRetry } from '../lib/retry.js';
import { sleep } from '../lib/sleep.js';
import { runIntakeAgent } from './intake.js';
import { generateQuestions, synthesizeProfile, evaluateFollowUp, MAX_FOLLOW_UPS } from './positioning-coach.js';
import { runResearchAgent } from './research.js';
import { runGapAnalyst, generateGapQuestions, enrichGapAnalysis } from './gap-analyst.js';
import { runArchitect } from './architect.js';
import { runSectionWriter, runSectionRevision } from './section-writer.js';
import { runQualityReviewer } from './quality-reviewer.js';
import { runAtsComplianceCheck, type AtsFinding } from './ats-rules.js';
import { isQuestionnaireEnabled, GUIDED_SUGGESTIONS_ENABLED, type QuestionnaireStage } from '../lib/feature-flags.js';
import { captureError } from '../lib/sentry.js';
import { buildQuestionnaireEvent, makeQuestion, getSelectedLabels } from '../lib/questionnaire-helpers.js';
import {
  generateDeterministicSuggestions,
  generateLLMEnrichedSuggestions,
  buildUnresolvedGapMap,
  buildRevisionInstruction,
  markGapAddressed,
  type ScoredGap,
} from './section-suggestions.js';
import type {
  PipelineState,
  PipelineStage,
  PipelineSSEEvent,
  IntakeOutput,
  ResearchOutput,
  BenchmarkCandidate,
  CompanyResearch,
  JDAnalysis,
  PositioningProfile,
  PositioningQuestion,
  ArchitectOutput,
  SectionWriterOutput,
  SectionSuggestion,
  QualityReviewerOutput,
  QuestionnaireQuestion,
  QuestionnaireSubmission,
  CategoryProgress,
  GapAnalystOutput,
  EvidenceItem,
} from './types.js';

export type PipelineEmitter = (event: PipelineSSEEvent) => void;

/**
 * User response callback — the pipeline pauses at interactive gates
 * and the orchestrator calls this to wait for user input.
 */
export type WaitForUser = <T>(gate: string) => Promise<T>;

function buildResearchDashboardPanelBenchmark(
  benchmark: BenchmarkCandidate,
  jdAnalysis: JDAnalysis,
  company: CompanyResearch,
  options?: {
    inferredAssumptions?: Record<string, unknown>;
    userOverrides?: Record<string, unknown>;
    overrideMeta?: {
      version: number;
      edited_at?: string;
      note?: string | null;
    };
  },
): Record<string, unknown> {
  const mustHaves = jdAnalysis.must_haves ?? [];
  const requiredSkills = mustHaves.slice(0, 12).map((requirement, index) => ({
    requirement,
    importance: index < Math.min(5, mustHaves.length) ? 'critical' : 'important',
    category: 'job_requirement',
  }));

  const sectionExpectations = benchmark.section_expectations ?? {};
  const competitiveDifferentiators = [
    sectionExpectations.summary,
    sectionExpectations.experience,
    sectionExpectations.skills,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim())
    .slice(0, 6);

  const inferredAssumptions = options?.inferredAssumptions ?? {
    role_title: jdAnalysis.role_title ?? '',
    seniority_level: jdAnalysis.seniority_level ?? '',
    company_name: company.company_name ?? jdAnalysis.company ?? '',
    industry: company.industry ?? '',
    company_size: company.size ?? '',
    must_have_count: mustHaves.length,
    language_keyword_count: (benchmark.language_keywords ?? []).length,
  };
  const assumptions = {
    ...inferredAssumptions,
    ...(options?.userOverrides ?? {}),
  };
  const confidenceByAssumption = {
    role_title: typeof inferredAssumptions.role_title === 'string' && inferredAssumptions.role_title.trim() ? 0.92 : 0.35,
    seniority_level: typeof inferredAssumptions.seniority_level === 'string' && inferredAssumptions.seniority_level ? 0.86 : 0.4,
    company_name: typeof inferredAssumptions.company_name === 'string' && inferredAssumptions.company_name.trim() ? 0.96 : 0.45,
    industry: typeof inferredAssumptions.industry === 'string' && inferredAssumptions.industry.trim() ? 0.78 : 0.42,
    company_size: typeof inferredAssumptions.company_size === 'string' && inferredAssumptions.company_size.trim() ? 0.7 : 0.38,
    must_have_count: mustHaves.length > 0 ? 0.95 : 0.5,
    language_keyword_count: (benchmark.language_keywords ?? []).length > 0 ? 0.8 : 0.45,
  };
  const whyInferred = {
    role_title: 'Parsed from the job description title and heading language.',
    seniority_level: 'Inferred from the JD scope, ownership, and leadership language.',
    company_name: 'Taken from company research and/or the job description employer name.',
    industry: 'Derived from company research signals.',
    company_size: 'Derived from company research signals and public profile sizing.',
    must_have_count: 'Counted from JD must-have requirements used to benchmark fit.',
    language_keyword_count: 'Counted from benchmark/JD language patterns selected for keyword echoing.',
  };
  const userOverrides = options?.userOverrides ?? {};
  const assumptionProvenance = Object.keys(assumptions).reduce<Record<string, Record<string, unknown>>>((acc, key) => {
    const userEdited = Object.prototype.hasOwnProperty.call(userOverrides, key);
    acc[key] = {
      source: userEdited ? 'user_edited' : 'inferred',
      ...(userEdited && options?.overrideMeta
        ? {
            edit_version: options.overrideMeta.version,
            edited_at: options.overrideMeta.edited_at ?? null,
            note: options.overrideMeta.note ?? null,
          }
        : {}),
    };
    return acc;
  }, {});

  return {
    // Legacy UI-facing shape (still used by panels + benchmark inspector)
    required_skills: requiredSkills,
    experience_expectations: sectionExpectations.experience ?? benchmark.ideal_profile ?? '',
    culture_fit_traits: company.culture_signals ?? [],
    communication_style: company.culture_signals?.[0] ?? '',
    industry_standards: [],
    competitive_differentiators: competitiveDifferentiators,
    language_keywords: benchmark.language_keywords ?? [],
    ideal_candidate_summary: benchmark.ideal_profile ?? '',
    // Preserve current v2 benchmark fields for transparency + future UI migration
    ideal_profile: benchmark.ideal_profile ?? '',
    section_expectations: sectionExpectations,
    assumptions,
    inferred_assumptions: inferredAssumptions,
    user_overrides: userOverrides,
    assumption_provenance: assumptionProvenance,
    confidence_by_assumption: confidenceByAssumption,
    why_inferred: whyInferred,
  };
}

function buildBenchmarkAssumptionsSnapshot(
  benchmark: BenchmarkCandidate,
  jdAnalysis: JDAnalysis,
  company: CompanyResearch,
): Record<string, unknown> {
  return {
    role_title: jdAnalysis.role_title ?? '',
    seniority_level: jdAnalysis.seniority_level ?? '',
    company_name: company.company_name ?? jdAnalysis.company ?? '',
    industry: company.industry ?? '',
    company_size: company.size ?? '',
    must_have_count: (jdAnalysis.must_haves ?? []).length,
    language_keyword_count: (benchmark.language_keywords ?? []).length,
  };
}

function extractBenchmarkUserOverrides(assumptions: Record<string, unknown>): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(assumptions)) {
    if (typeof rawValue === 'string') {
      const value = rawValue.trim();
      if (!value) continue;
      overrides[key] = value;
      continue;
    }
    if (Array.isArray(rawValue)) {
      const items = rawValue
        .filter((v): v is string | number | boolean => (
          typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
        ))
        .map((v) => (typeof v === 'string' ? v.trim() : v))
        .filter((v) => !(typeof v === 'string' && v.length === 0));
      if (items.length === 0) continue;
      overrides[key] = items;
      continue;
    }
    if (typeof rawValue === 'number') {
      if (!Number.isFinite(rawValue)) continue;
      overrides[key] = rawValue;
      continue;
    }
    if (typeof rawValue === 'boolean') {
      overrides[key] = rawValue;
      continue;
    }
    if (rawValue && typeof rawValue === 'object') {
      overrides[key] = rawValue;
    }
  }
  return overrides;
}

function getBenchmarkPanelPayloadOptions(
  state: Pick<PipelineState, 'benchmark_inferred_assumptions' | 'benchmark_user_overrides' | 'benchmark_override_meta'>,
  research: ResearchOutput,
): {
  inferredAssumptions?: Record<string, unknown>;
  userOverrides?: Record<string, unknown>;
  overrideMeta?: {
    version: number;
    edited_at?: string;
    note?: string | null;
  };
} {
  return {
    inferredAssumptions: state.benchmark_inferred_assumptions
      ?? buildBenchmarkAssumptionsSnapshot(research.benchmark_candidate, research.jd_analysis, research.company_research),
    ...(state.benchmark_user_overrides ? { userOverrides: state.benchmark_user_overrides } : {}),
    ...(state.benchmark_override_meta ? { overrideMeta: state.benchmark_override_meta } : {}),
  };
}

function emitResearchDashboardPanel(
  emit: PipelineEmitter,
  research: ResearchOutput,
  options?: {
    inferredAssumptions?: Record<string, unknown>;
    userOverrides?: Record<string, unknown>;
    overrideMeta?: {
      version: number;
      edited_at?: string;
      note?: string | null;
    };
  },
) {
  emit({
    type: 'right_panel_update',
    panel_type: 'research_dashboard',
    data: {
      company: research.company_research,
      jd_requirements: {
        must_haves: research.jd_analysis.must_haves,
        nice_to_haves: research.jd_analysis.nice_to_haves,
        seniority_level: research.jd_analysis.seniority_level,
      },
      benchmark: buildResearchDashboardPanelBenchmark(
        research.benchmark_candidate,
        research.jd_analysis,
        research.company_research,
        options,
      ),
      loading_state: 'complete',
      status_note: 'Research completed. Review the JD requirements and benchmark assumptions before moving deeper into drafting.',
      next_expected: 'If the benchmark assumptions look right, continue to gap analysis and blueprint design.',
    },
  });
}

function emitResearchDashboardLoadingPanel(
  emit: PipelineEmitter,
  options: {
    companyName?: string;
    loadingState: 'running' | 'background_running';
    statusNote: string;
    nextExpected: string;
  },
) {
  emit({
    type: 'right_panel_update',
    panel_type: 'research_dashboard',
    data: {
      company: {
        ...(options.companyName ? { company_name: options.companyName } : {}),
      },
      jd_requirements: {
        must_haves: [],
        nice_to_haves: [],
      },
      benchmark: {
        required_skills: [],
        language_keywords: [],
        experience_expectations: '',
        culture_fit_traits: [],
        communication_style: '',
        industry_standards: [],
        competitive_differentiators: [],
        ideal_candidate_summary: '',
      },
      loading_state: options.loadingState,
      status_note: options.statusNote,
      next_expected: options.nextExpected,
    },
  });
}

/**
 * Generic questionnaire helper — checks feature flag, emits questionnaire SSE event,
 * waits for user response, and returns the submission (or null if flag is disabled).
 */
async function runQuestionnaire(
  stage: QuestionnaireStage,
  questionnaire_id: string,
  title: string,
  questions: QuestionnaireQuestion[],
  emit: PipelineEmitter,
  waitForUser: WaitForUser,
  subtitle?: string,
): Promise<QuestionnaireSubmission | null> {
  if (!isQuestionnaireEnabled(stage)) return null;
  if (questions.length === 0) return null;

  const event = buildQuestionnaireEvent(questionnaire_id, stage, title, questions, subtitle);
  emit(event);

  const submission = await waitForUser<QuestionnaireSubmission>(`questionnaire_${questionnaire_id}`);
  return submission;
}

// ─── Pipeline entry point ────────────────────────────────────────────

export interface PipelineConfig {
  session_id: string;
  user_id: string;
  raw_resume_text: string;
  job_description: string;
  company_name: string;
  workflow_mode?: 'fast_draft' | 'balanced' | 'deep_dive';
  minimum_evidence_target?: number;
  resume_priority?: 'authentic' | 'ats' | 'impact' | 'balanced';
  seniority_delta?: 'same' | 'one_up' | 'big_jump' | 'step_back';
  emit: PipelineEmitter;
  waitForUser: WaitForUser;
}

type StageTimingMap = Partial<Record<PipelineStage, number>>;
const SECTION_WRITE_CONCURRENCY = 3;
const SECTION_REVISION_TIMEOUT_MS = (() => {
  const parsed = Number.parseInt(process.env.SECTION_REVISION_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 180_000;
})();
const MAX_SECTION_REVIEW_FEEDBACK_CHARS = (() => {
  const parsed = Number.parseInt(process.env.MAX_SECTION_REVIEW_FEEDBACK_CHARS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2_000;
})();
const MAX_SECTION_REVIEW_EDITED_CHARS = (() => {
  const parsed = Number.parseInt(process.env.MAX_SECTION_REVIEW_EDITED_CHARS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 12_000;
})();
const MAX_SECTION_REVIEW_REFINEMENTS = (() => {
  const parsed = Number.parseInt(process.env.MAX_SECTION_REVIEW_REFINEMENTS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 12;
})();
const MAX_SECTION_REVIEW_REFINEMENT_ID_CHARS = (() => {
  const parsed = Number.parseInt(process.env.MAX_SECTION_REVIEW_REFINEMENT_ID_CHARS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 80;
})();
const MAX_SECTION_REVIEW_TOKEN_CHARS = (() => {
  const parsed = Number.parseInt(process.env.MAX_SECTION_REVIEW_TOKEN_CHARS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 200;
})();

type WorkflowMode = 'fast_draft' | 'balanced' | 'deep_dive';
type SectionReviewStrategy = 'per_section' | 'bundled';

interface WorkflowModePolicy {
  positioning: {
    maxQuestions: number;
    maxFollowUps: number;
    useBatchQuestionnaire: boolean;
    batchSize: number;
  };
  gapQuiz: {
    enabled: boolean;
    maxQuestions: number;
  };
  draftReadiness: {
    coverageThreshold: number;
    defaultMinimumEvidenceTarget: number;
  };
  reviews: {
    architectBlocking: boolean;
    sectionStrategy: SectionReviewStrategy;
    maxExperienceRoleReviews: number;
    qualityFixApproval: 'none' | 'high_only' | 'all_high';
  };
}

function getWorkflowModePolicy(mode: WorkflowMode | undefined): WorkflowModePolicy {
  switch (mode) {
    case 'fast_draft':
      return {
        positioning: { maxQuestions: 6, maxFollowUps: 1, useBatchQuestionnaire: true, batchSize: 4 },
        gapQuiz: { enabled: false, maxQuestions: 0 },
        draftReadiness: { coverageThreshold: 65, defaultMinimumEvidenceTarget: 5 },
        reviews: {
          architectBlocking: false,
          sectionStrategy: 'bundled',
          maxExperienceRoleReviews: 1,
          qualityFixApproval: 'none',
        },
      };
    case 'deep_dive':
      return {
        positioning: {
          maxQuestions: Number.POSITIVE_INFINITY,
          maxFollowUps: MAX_FOLLOW_UPS,
          useBatchQuestionnaire: false,
          batchSize: 1,
        },
        gapQuiz: { enabled: true, maxQuestions: 6 },
        draftReadiness: { coverageThreshold: 80, defaultMinimumEvidenceTarget: 12 },
        reviews: {
          architectBlocking: true,
          sectionStrategy: 'per_section',
          maxExperienceRoleReviews: Number.POSITIVE_INFINITY,
          qualityFixApproval: 'all_high',
        },
      };
    case 'balanced':
    default:
      return {
        positioning: {
          maxQuestions: 10,
          maxFollowUps: Math.min(MAX_FOLLOW_UPS, 2),
          useBatchQuestionnaire: true,
          batchSize: 4,
        },
        gapQuiz: { enabled: true, maxQuestions: 3 },
        draftReadiness: { coverageThreshold: 70, defaultMinimumEvidenceTarget: 8 },
        reviews: {
          architectBlocking: true,
          sectionStrategy: 'bundled',
          maxExperienceRoleReviews: 2,
          qualityFixApproval: 'high_only',
        },
      };
  }
}

function getPositioningQuestionBudget(mode: WorkflowMode | undefined) {
  return getWorkflowModePolicy(mode).positioning;
}

function getMinimumEvidenceTarget(
  state: PipelineState,
  policy: WorkflowModePolicy,
): number {
  const raw = state.user_preferences?.minimum_evidence_target;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return policy.draftReadiness.defaultMinimumEvidenceTarget;
  }
  return Math.min(20, Math.max(3, Math.round(raw)));
}

type DraftReadinessBlockingReason = 'evidence_target' | 'coverage_threshold';
type DraftReadinessRequirementPriority = 'must_have' | 'implicit' | 'nice_to_have';

function normalizeRequirementKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildDraftReadinessDetails(
  state: PipelineState,
  policy: WorkflowModePolicy,
): {
  evidenceCount: number;
  minimumEvidenceTarget: number;
  coverageScore: number;
  ready: boolean;
  remainingEvidenceNeeded: number;
  remainingCoverageNeeded: number;
  blockingReasons: DraftReadinessBlockingReason[];
  gapBreakdown: {
    total: number;
    strong: number;
    partial: number;
    gap: number;
  };
  evidenceQuality: {
    userValidatedCount: number;
    metricsDefensibleCount: number;
    mappedRequirementEvidenceCount: number;
  };
  highImpactRemaining: Array<{
    requirement: string;
    classification: 'partial' | 'gap';
    priority: DraftReadinessRequirementPriority;
    evidenceCount: number;
  }>;
  suggestedQuestionCount: number;
} {
  const evidence = state.positioning?.evidence_library ?? [];
  const evidenceCount = evidence.length;
  const minimumEvidenceTarget = getMinimumEvidenceTarget(state, policy);
  const coverageScore = state.gap_analysis?.coverage_score ?? 0;
  const remainingEvidenceNeeded = Math.max(0, minimumEvidenceTarget - evidenceCount);
  const remainingCoverageNeeded = Math.max(0, Math.ceil(policy.draftReadiness.coverageThreshold - coverageScore));
  const ready = remainingEvidenceNeeded === 0 && remainingCoverageNeeded === 0;
  const blockingReasons: DraftReadinessBlockingReason[] = [
    ...(remainingEvidenceNeeded > 0 ? ['evidence_target' as const] : []),
    ...(remainingCoverageNeeded > 0 ? ['coverage_threshold' as const] : []),
  ];

  const requirements = state.gap_analysis?.requirements ?? [];
  const strong = requirements.filter((r) => r.classification === 'strong').length;
  const partial = requirements.filter((r) => r.classification === 'partial').length;
  const gap = requirements.filter((r) => r.classification === 'gap').length;

  const mustHaveSet = new Set((state.research?.jd_analysis.must_haves ?? []).map(normalizeRequirementKey));
  const implicitSet = new Set((state.research?.jd_analysis.implicit_requirements ?? []).map(normalizeRequirementKey));
  const priorityWeight: Record<DraftReadinessRequirementPriority, number> = {
    must_have: 0,
    implicit: 1,
    nice_to_have: 2,
  };
  const classificationWeight: Record<'partial' | 'gap', number> = {
    gap: 0,
    partial: 1,
  };

  const highImpactRemaining = requirements
    .filter((r): r is typeof r & { classification: 'partial' | 'gap' } => (
      r.classification === 'partial' || r.classification === 'gap'
    ))
    .map((r) => {
      const key = normalizeRequirementKey(r.requirement);
      const priority: DraftReadinessRequirementPriority = mustHaveSet.has(key)
        ? 'must_have'
        : implicitSet.has(key)
          ? 'implicit'
          : 'nice_to_have';
      return {
        requirement: r.requirement,
        classification: r.classification,
        priority,
        evidenceCount: Array.isArray(r.evidence) ? r.evidence.filter(Boolean).length : 0,
      };
    })
    .sort((a, b) => {
      if (priorityWeight[a.priority] !== priorityWeight[b.priority]) {
        return priorityWeight[a.priority] - priorityWeight[b.priority];
      }
      if (classificationWeight[a.classification] !== classificationWeight[b.classification]) {
        return classificationWeight[a.classification] - classificationWeight[b.classification];
      }
      if (a.evidenceCount !== b.evidenceCount) return a.evidenceCount - b.evidenceCount;
      return a.requirement.localeCompare(b.requirement);
    })
    .slice(0, 5);

  const userValidatedCount = evidence.filter((item) => item.user_validated).length;
  const metricsDefensibleCount = evidence.filter((item) => item.metrics_defensible).length;
  const mappedRequirementEvidenceCount = evidence.filter(
    (item) => Array.isArray(item.mapped_requirements) && item.mapped_requirements.length > 0,
  ).length;

  const suggestedQuestionCount = ready
    ? 0
    : Math.min(
        remainingEvidenceNeeded > 0 ? 5 : 2,
        Math.max(1, highImpactRemaining.length),
      );

  return {
    evidenceCount,
    minimumEvidenceTarget,
    coverageScore,
    ready,
    remainingEvidenceNeeded,
    remainingCoverageNeeded,
    blockingReasons,
    gapBreakdown: {
      total: requirements.length,
      strong,
      partial,
      gap,
    },
    evidenceQuality: {
      userValidatedCount,
      metricsDefensibleCount,
      mappedRequirementEvidenceCount,
    },
    highImpactRemaining,
    suggestedQuestionCount,
  };
}

function estimateDraftReadiness(
  state: PipelineState,
  policy: WorkflowModePolicy,
): {
  evidenceCount: number;
  minimumEvidenceTarget: number;
  coverageScore: number;
  ready: boolean;
  remainingEvidenceNeeded: number;
  remainingCoverageNeeded: number;
  blockingReasons: DraftReadinessBlockingReason[];
  gapBreakdown: {
    total: number;
    strong: number;
    partial: number;
    gap: number;
  };
  evidenceQuality: {
    userValidatedCount: number;
    metricsDefensibleCount: number;
    mappedRequirementEvidenceCount: number;
  };
  highImpactRemaining: Array<{
    requirement: string;
    classification: 'partial' | 'gap';
    priority: DraftReadinessRequirementPriority;
    evidenceCount: number;
  }>;
  suggestedQuestionCount: number;
} {
  return buildDraftReadinessDetails(state, policy);
}

function emitDraftReadinessUpdate(
  emit: PipelineEmitter,
  state: PipelineState,
  policy: WorkflowModePolicy,
  stage: PipelineStage,
  workflowMode: WorkflowMode | undefined,
  note?: string,
) {
  const readiness = estimateDraftReadiness(state, policy);
  emit({
    type: 'draft_readiness_update',
    stage,
    workflow_mode: workflowMode ?? 'balanced',
    evidence_count: readiness.evidenceCount,
    minimum_evidence_target: readiness.minimumEvidenceTarget,
    coverage_score: readiness.coverageScore,
    coverage_threshold: policy.draftReadiness.coverageThreshold,
    ready: readiness.ready,
    remaining_evidence_needed: readiness.remainingEvidenceNeeded,
    remaining_coverage_needed: readiness.remainingCoverageNeeded,
    blocking_reasons: readiness.blockingReasons,
    gap_breakdown: {
      total: readiness.gapBreakdown.total,
      strong: readiness.gapBreakdown.strong,
      partial: readiness.gapBreakdown.partial,
      gap: readiness.gapBreakdown.gap,
    },
    evidence_quality: {
      user_validated_count: readiness.evidenceQuality.userValidatedCount,
      metrics_defensible_count: readiness.evidenceQuality.metricsDefensibleCount,
      mapped_requirement_evidence_count: readiness.evidenceQuality.mappedRequirementEvidenceCount,
    },
    high_impact_remaining: readiness.highImpactRemaining.map((item) => ({
      requirement: item.requirement,
      classification: item.classification,
      priority: item.priority,
      evidence_count: item.evidenceCount,
    })),
    suggested_question_count: readiness.suggestedQuestionCount,
    ...(note ? { note } : {}),
  });
  return readiness;
}

async function hasDraftNowRequest(sessionId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('session_question_responses')
    .select('response, status')
    .eq('session_id', sessionId)
    .eq('question_id', '__generate_draft_now__')
    .maybeSingle();
  if (error || !data) return false;
  if (data.status === 'skipped') return false;
  if (!data.response || typeof data.response !== 'object' || Array.isArray(data.response)) return true;
  return (data.response as { requested?: unknown }).requested !== false;
}

function isDraftNowGateResponse(response: unknown): boolean {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return false;
  const payload = response as Record<string, unknown>;
  return payload.draft_now === true;
}

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeSeniorityLevel(value: unknown): JDAnalysis['seniority_level'] | null {
  if (typeof value !== 'string') return null;
  const lower = value.trim().toLowerCase();
  if (lower === 'entry' || lower === 'mid' || lower === 'senior' || lower === 'executive') {
    return lower;
  }
  return null;
}

function normalizeWorkflowMode(value: unknown): WorkflowMode | null {
  if (value === 'fast_draft' || value === 'balanced' || value === 'deep_dive') return value;
  return null;
}

function normalizePayoffHintKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : null;
}

function normalizeQuestionTopicKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function loadQuestionnairePayoffHistory(
  sessionId: string,
): Promise<{
  byPayoff: Map<string, { status: 'answered' | 'skipped' | 'deferred'; impactTag: 'high' | 'medium' | 'low' | null; stage: string; benchmarkEditVersion: number | null }>;
  byTopic: Map<string, { status: 'answered' | 'skipped' | 'deferred'; impactTag: 'high' | 'medium' | 'low' | null; stage: string; benchmarkEditVersion: number | null }>;
}> {
  const byPayoff = new Map<string, { status: 'answered' | 'skipped' | 'deferred'; impactTag: 'high' | 'medium' | 'low' | null; stage: string; benchmarkEditVersion: number | null }>();
  const byTopic = new Map<string, { status: 'answered' | 'skipped' | 'deferred'; impactTag: 'high' | 'medium' | 'low' | null; stage: string; benchmarkEditVersion: number | null }>();
  const { data, error } = await supabaseAdmin
    .from('session_question_responses')
    .select('question_id, stage, status, impact_tag, response, updated_at')
    .eq('session_id', sessionId)
    .order('updated_at', { ascending: false })
    .limit(500);
  if (error || !data) return { byPayoff, byTopic };

  for (const row of data) {
    const questionId = typeof row.question_id === 'string' ? row.question_id : '';
    if (!questionId.includes(':')) continue; // only nested questionnaire analytics rows
    const response = asObjectRecord(row.response);
    const payoffKey = normalizePayoffHintKey(response?.payoff_hint);
    const status = row.status === 'skipped' || row.status === 'deferred' ? row.status : 'answered';
    const impactTag = row.impact_tag === 'high' || row.impact_tag === 'medium' || row.impact_tag === 'low'
      ? row.impact_tag
      : null;
    const stage = typeof row.stage === 'string' ? row.stage : 'unknown';
    const benchmarkEditVersion = typeof response?.benchmark_edit_version === 'number'
      ? response.benchmark_edit_version
      : (response?.benchmark_edit_version === null ? null : null);
    const entry = { status, impactTag, stage, benchmarkEditVersion };
    if (payoffKey && !byPayoff.has(payoffKey)) {
      byPayoff.set(payoffKey, entry);
    }
    if (Array.isArray(response?.topic_keys)) {
      for (const rawTopic of response.topic_keys) {
        if (typeof rawTopic !== 'string') continue;
        const topicKey = normalizeQuestionTopicKey(rawTopic);
        if (!topicKey || byTopic.has(topicKey)) continue;
        byTopic.set(topicKey, entry);
      }
    }
  }
  return { byPayoff, byTopic };
}

function filterQuestionnaireQuestionsByPayoffHistory(
  questions: QuestionnaireQuestion[],
  reuseHistory: {
    byPayoff: Map<string, { status: 'answered' | 'skipped' | 'deferred'; impactTag: 'high' | 'medium' | 'low' | null; stage: string; benchmarkEditVersion: number | null }>;
    byTopic: Map<string, { status: 'answered' | 'skipped' | 'deferred'; impactTag: 'high' | 'medium' | 'low' | null; stage: string; benchmarkEditVersion: number | null }>;
  },
  options?: {
    questionnaireStage?: string;
    currentBenchmarkEditVersion?: number | null;
  },
): {
  questions: QuestionnaireQuestion[];
  skippedCount: number;
  skippedQuestions: QuestionnaireQuestion[];
  reuseStats: {
    matchedByTopicCount: number;
    matchedByPayoffCount: number;
    priorAnsweredCount: number;
    priorDeferredCount: number;
  };
} {
  if (questions.length === 0 || (reuseHistory.byPayoff.size === 0 && reuseHistory.byTopic.size === 0)) {
    return {
      questions,
      skippedCount: 0,
      skippedQuestions: [],
      reuseStats: {
        matchedByTopicCount: 0,
        matchedByPayoffCount: 0,
        priorAnsweredCount: 0,
        priorDeferredCount: 0,
      },
    };
  }
  const questionnaireStage = options?.questionnaireStage ?? null;
  const currentBenchmarkEditVersion = options?.currentBenchmarkEditVersion ?? null;
  const filtered: QuestionnaireQuestion[] = [];
  let skippedCount = 0;
  const skippedQuestions: QuestionnaireQuestion[] = [];
  const reuseStats = {
    matchedByTopicCount: 0,
    matchedByPayoffCount: 0,
    priorAnsweredCount: 0,
    priorDeferredCount: 0,
  };
  for (const question of questions) {
    const impactTier = question.impact_tier ?? 'medium';
    const stageMatches = (entryStage: string) => questionnaireStage == null || entryStage === questionnaireStage;
    const benchmarkMatches = (entryVersion: number | null) => (entryVersion ?? null) === currentBenchmarkEditVersion;
    const payoffKey = normalizePayoffHintKey(question.payoff_hint);
    if (!payoffKey || impactTier === 'high') {
      filtered.push(question);
      continue;
    }

    const topicKeys = Array.isArray(question.topic_keys)
      ? question.topic_keys
          .filter((value): value is string => typeof value === 'string')
          .map((value) => normalizeQuestionTopicKey(value))
          .filter(Boolean)
      : [];
    let matchBasis: 'topic' | 'payoff' | null = null;
    let prior = topicKeys
      .map((key) => reuseHistory.byTopic.get(key))
      .find((entry) => entry && stageMatches(entry.stage) && benchmarkMatches(entry.benchmarkEditVersion));
    if (prior) {
      matchBasis = 'topic';
    }

    if (!prior && payoffKey) {
      const payoffEntry = reuseHistory.byPayoff.get(payoffKey);
      if (payoffEntry && stageMatches(payoffEntry.stage) && benchmarkMatches(payoffEntry.benchmarkEditVersion)) {
        prior = payoffEntry;
        matchBasis = 'payoff';
      }
    }

    if (prior && (prior.status === 'answered' || prior.status === 'deferred')) {
      skippedCount += 1;
      skippedQuestions.push(question);
      if (matchBasis === 'topic') reuseStats.matchedByTopicCount += 1;
      if (matchBasis === 'payoff') reuseStats.matchedByPayoffCount += 1;
      if (prior.status === 'deferred') reuseStats.priorDeferredCount += 1;
      else reuseStats.priorAnsweredCount += 1;
      continue;
    }
    filtered.push(question);
  }
  return { questions: filtered, skippedCount, skippedQuestions, reuseStats };
}

function emitQuestionnaireReuseSummary(
  emit: PipelineEmitter,
  stage: 'positioning' | 'gap_analysis',
  questionnaireKind: 'positioning_batch' | 'gap_analysis_quiz',
  skippedQuestions: QuestionnaireQuestion[],
  benchmarkEditVersion: number | null,
  reuseStats?: {
    matchedByTopicCount: number;
    matchedByPayoffCount: number;
    priorAnsweredCount: number;
    priorDeferredCount: number;
  },
) {
  if (skippedQuestions.length === 0) return;

  const sampleTopics = Array.from(new Set(
    skippedQuestions
      .flatMap((question) => Array.isArray(question.topic_keys) ? question.topic_keys : [])
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim())
      .slice(0, 12),
  )).slice(0, 6);
  const samplePayoffs = Array.from(new Set(
    skippedQuestions
      .map((question) => (typeof question.payoff_hint === 'string' ? question.payoff_hint.trim() : ''))
      .filter((value) => value.length > 0)
      .slice(0, 12),
  )).slice(0, 4);

  emit({
    type: 'questionnaire_reuse_summary',
    stage,
    questionnaire_kind: questionnaireKind,
    skipped_count: skippedQuestions.length,
    ...(reuseStats ? {
      matched_by_topic_count: reuseStats.matchedByTopicCount,
      matched_by_payoff_count: reuseStats.matchedByPayoffCount,
      prior_answered_count: reuseStats.priorAnsweredCount,
      prior_deferred_count: reuseStats.priorDeferredCount,
    } : {}),
    benchmark_edit_version: benchmarkEditVersion,
    ...(sampleTopics.length > 0 ? { sample_topics: sampleTopics } : {}),
    ...(samplePayoffs.length > 0 ? { sample_payoffs: samplePayoffs } : {}),
    message: skippedQuestions.length === 1
      ? 'Reused one prior lower-impact answer to reduce repeat questioning.'
      : `Reused ${skippedQuestions.length} prior lower-impact answers to reduce repeat questioning.`,
  });
}

function buildQuestionnaireReuseSubtitleNote(skippedQuestions: QuestionnaireQuestion[]): string | null {
  if (skippedQuestions.length === 0) return null;
  const topicLabels = Array.from(new Set(
    skippedQuestions
      .flatMap((question) => Array.isArray(question.topic_keys) ? question.topic_keys : [])
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim())
      .map((value) => {
        const [prefix, ...rest] = value.split(':');
        const body = rest.join(':').replace(/_/g, ' ').trim();
        if (!body) return '';
        if (prefix === 'requirement') return body;
        if (prefix === 'category') return `category: ${body}`;
        return body;
      })
      .filter((value) => value.length > 0)
      .slice(0, 12),
  )).slice(0, 2);

  const topicText = topicLabels.length > 0 ? ` (reused topics: ${topicLabels.join('; ')})` : '';
  return skippedQuestions.length === 1
    ? `Reused one prior lower-impact answer to save time${topicText}.`
    : `Reused ${skippedQuestions.length} prior lower-impact answers to save time${topicText}.`;
}

async function applyLatestWorkflowPreferencesIfNeeded(
  state: PipelineState,
  emit: PipelineEmitter,
  log: ReturnType<typeof createSessionLogger>,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('session_workflow_artifacts')
    .select('version, payload, created_at')
    .eq('session_id', state.session_id)
    .eq('node_key', 'overview')
    .eq('artifact_type', 'workflow_preferences')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return false;

  const version = Number(data.version ?? 0);
  if (!Number.isFinite(version) || version <= (state.workflow_preferences_version ?? 0)) {
    return false;
  }

  const payload = asObjectRecord(data.payload);
  const nextMode = normalizeWorkflowMode(payload?.workflow_mode);
  const payloadMinimumEvidenceTarget = payload?.minimum_evidence_target;
  const rawTarget = typeof payloadMinimumEvidenceTarget === 'number'
    ? Math.min(20, Math.max(3, Math.round(payloadMinimumEvidenceTarget)))
    : null;

  const prevMode = state.user_preferences?.workflow_mode;
  const prevTarget = typeof state.user_preferences?.minimum_evidence_target === 'number'
    ? state.user_preferences.minimum_evidence_target
    : null;

  state.user_preferences = {
    ...state.user_preferences,
    ...(nextMode ? { workflow_mode: nextMode } : {}),
    ...(rawTarget != null ? { minimum_evidence_target: rawTarget } : {}),
  };
  state.workflow_preferences_version = version;

  const modeChanged = nextMode != null && nextMode !== prevMode;
  const targetChanged = rawTarget != null && rawTarget !== prevTarget;
  if (!modeChanged && !targetChanged) {
    return false;
  }

  const changedParts = [
    ...(modeChanged ? [`mode=${nextMode}`] : []),
    ...(targetChanged ? [`minimum evidence=${rawTarget}`] : []),
  ];
  emit({
    type: 'transparency',
    stage: state.current_stage,
    message: `Applied updated workflow preferences (${changedParts.join(', ')}). New settings will affect the remaining run at safe checkpoints.`,
  });
  log.info({ workflow_preferences_version: version, mode: nextMode, minimum_evidence_target: rawTarget }, 'Applied workflow preferences to current pipeline state');
  return true;
}

async function applyLatestBenchmarkAssumptionsIfNeeded(
  state: PipelineState,
  emit: PipelineEmitter,
  log: ReturnType<typeof createSessionLogger>,
): Promise<boolean> {
  if (!state.research) return false;
  const { data, error } = await supabaseAdmin
    .from('session_workflow_artifacts')
    .select('version, payload, created_at')
    .eq('session_id', state.session_id)
    .eq('node_key', 'benchmark')
    .eq('artifact_type', 'benchmark_assumptions_edit')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return false;
  const version = Number(data.version ?? 0);
  if (!Number.isFinite(version) || version <= (state.benchmark_override_version ?? 0)) {
    return false;
  }
  const payload = asObjectRecord(data.payload);
  const assumptions = asObjectRecord(payload?.assumptions);
  if (!assumptions) {
    state.benchmark_override_version = version;
    return false;
  }

  emit({
    type: 'workflow_replan_started',
    reason: 'benchmark_assumptions_updated',
    benchmark_edit_version: version,
    rebuild_from_stage: 'gap_analysis',
    current_stage: state.current_stage,
    phase: 'apply_benchmark_overrides',
    message: 'Applying updated benchmark assumptions to the current run.',
  });

  const benchmark = { ...state.research.benchmark_candidate };
  const jd = { ...state.research.jd_analysis };
  const company = { ...state.research.company_research };
  if (!state.benchmark_inferred_assumptions) {
    state.benchmark_inferred_assumptions = buildBenchmarkAssumptionsSnapshot(
      benchmark,
      jd,
      company,
    );
  }
  state.benchmark_user_overrides = extractBenchmarkUserOverrides(assumptions);
  state.benchmark_override_meta = {
    version,
    edited_at: typeof payload?.edited_at === 'string' ? payload.edited_at : undefined,
    note: typeof payload?.note === 'string' ? payload.note : null,
  };

  if (typeof assumptions.company_name === 'string' && assumptions.company_name.trim()) {
    company.company_name = assumptions.company_name.trim();
    if (typeof jd.company === 'string') {
      jd.company = assumptions.company_name.trim();
    }
  }
  const seniority = normalizeSeniorityLevel(assumptions.seniority_level);
  if (seniority) {
    jd.seniority_level = seniority;
  }
  if (Array.isArray(assumptions.must_haves)) {
    jd.must_haves = assumptions.must_haves
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim())
      .slice(0, 40);
  }
  if (Array.isArray(assumptions.benchmark_keywords)) {
    benchmark.language_keywords = assumptions.benchmark_keywords
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim())
      .slice(0, 80);
  }
  const idealSummary = typeof assumptions.ideal_candidate_summary === 'string'
    ? assumptions.ideal_candidate_summary.trim()
    : '';
  if (idealSummary) {
    benchmark.ideal_profile = idealSummary;
  }
  if (Array.isArray(assumptions.competitive_differentiators)) {
    const differentiators = assumptions.competitive_differentiators
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim())
      .slice(0, 6);
    benchmark.section_expectations = {
      ...benchmark.section_expectations,
      ...(differentiators[0] ? { summary: differentiators[0] } : {}),
      ...(differentiators[1] ? { experience: differentiators[1] } : {}),
      ...(differentiators[2] ? { skills: differentiators[2] } : {}),
    };
  }

  state.research = {
    ...state.research,
    jd_analysis: jd,
    company_research: company,
    benchmark_candidate: benchmark,
  };
  state.benchmark_override_version = version;

  emit({
    type: 'transparency',
    stage: state.current_stage,
    message: 'Applied updated benchmark assumptions to the current run. Downstream analysis will use the revised benchmark.',
  });
  emit({
    type: 'workflow_replan_completed',
    reason: 'benchmark_assumptions_updated',
    benchmark_edit_version: version,
    rebuild_from_stage: 'gap_analysis',
    current_stage: state.current_stage,
    rebuilt_through_stage: 'research',
    message: 'Updated benchmark assumptions are now active for the current run.',
  });
  emitResearchDashboardPanel(emit, state.research, getBenchmarkPanelPayloadOptions(state, state.research));
  log.info({ benchmark_override_version: version }, 'Applied benchmark assumption overrides to current pipeline state');
  return true;
}

interface FinalResumePayload {
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
}

/**
 * Run the full 7-agent pipeline from start to finish.
 * The pipeline pauses at user interaction gates and resumes when responses arrive.
 */
export async function runPipeline(config: PipelineConfig): Promise<PipelineState> {
  const { session_id, user_id, emit, waitForUser } = config;
  const log = createSessionLogger(session_id);

  // Track token usage across all LLM calls made during this pipeline run
  const usageAcc = startUsageTracking(session_id);
  setUsageTrackingContext(session_id);

  const state: PipelineState = {
    session_id,
    user_id,
    current_stage: 'intake',
    revision_count: 0,
    token_usage: { input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0 },
  };
  state.user_preferences = {
    resume_priority: config.resume_priority ?? 'balanced',
    seniority_delta: config.seniority_delta,
    workflow_mode: config.workflow_mode,
    minimum_evidence_target: config.minimum_evidence_target,
  };
  let workflowModePolicy = getWorkflowModePolicy(state.user_preferences.workflow_mode);
  const refreshWorkflowModePolicy = async () => {
    if (await applyLatestWorkflowPreferencesIfNeeded(state, emit, log)) {
      workflowModePolicy = getWorkflowModePolicy(state.user_preferences?.workflow_mode);
      return true;
    }
    return false;
  };
  let researchAbort: AbortController | undefined;
  const stageTimingsMs: StageTimingMap = {};
  const stageStart = new Map<PipelineStage, number>();
  const markStageStart = (stage: PipelineStage) => stageStart.set(stage, Date.now());
  const markStageEnd = (stage: PipelineStage) => {
    const start = stageStart.get(stage);
    if (start) stageTimingsMs[stage] = Date.now() - start;
  };

  try {
    // ─── Stage 1: Intake ─────────────────────────────────────────
    emit({ type: 'stage_start', stage: 'intake', message: 'Step 1 of 7: Parsing and structuring your resume...' });
    state.current_stage = 'intake';
    markStageStart('intake');

    state.intake = await runIntakeAgent({
      raw_resume_text: config.raw_resume_text,
      job_description: config.job_description,
    });

    markStageEnd('intake');
    emit({ type: 'stage_complete', stage: 'intake', message: 'Step 1 of 7 complete: resume snapshot ready', duration_ms: stageTimingsMs.intake });
    emit({
      type: 'right_panel_update',
      panel_type: 'onboarding_summary',
      data: buildOnboardingSummary(state.intake),
    });

    if (state.intake.experience.length === 0) {
      emit({
        type: 'transparency',
        stage: 'intake',
        message: 'No work experience was detected in your resume. The pipeline will continue but results may be limited — consider pasting your resume again with clearer formatting.',
      });
    }

    log.info({ experience_count: state.intake.experience.length }, 'Intake complete');

    // ─── Steps 2-3: Research-first flow (race research, then start positioning) ───────
    emit({ type: 'stage_start', stage: 'research', message: 'Step 2 of 7: Analyzing the job and building a benchmark profile...' });
    state.current_stage = 'research';
    markStageStart('research');
    emitResearchDashboardLoadingPanel(emit, {
      companyName: config.company_name,
      loadingState: 'running',
      statusNote: 'Research has started. The system is extracting requirements, company signals, and benchmark assumptions.',
      nextExpected: 'A benchmark profile and JD requirement summary will appear here.',
    });

    // Fire off research as a background promise (with retry for transient failures)
    researchAbort = new AbortController();
    setMaxListeners(20, researchAbort.signal);
    const researchPromise = withRetry(
      () => runResearchAgent({
        job_description: config.job_description,
        company_name: config.company_name,
        parsed_resume: state.intake!,
      }),
      { maxAttempts: 3, baseDelay: 2_000, signal: researchAbort.signal, onRetry: (attempt, error) => log.warn({ attempt, error: error.message }, 'Research background retry') },
    );

    // Race: give research 90s to complete before falling back
    const RESEARCH_RACE_TIMEOUT_MS = 90_000;
    const researchRaceResult = await Promise.race([
      researchPromise.then(r => ({ resolved: true as const, data: r })),
      sleep(RESEARCH_RACE_TIMEOUT_MS).then(() => ({ resolved: false as const, data: null })),
    ]);

    if (researchRaceResult.resolved) {
      state.research = researchRaceResult.data!;
      await applyLatestBenchmarkAssumptionsIfNeeded(state, emit, log);
      markStageEnd('research');
      emit({ type: 'stage_complete', stage: 'research', message: 'Step 2 of 7 complete: benchmark profile ready', duration_ms: stageTimingsMs.research });
      log.info({ coverage_keywords: state.research.jd_analysis.language_keywords.length }, 'Research complete (within timeout)');
    } else {
      log.info('Research still running after timeout — starting positioning with fallback questions');
      emit({ type: 'transparency', stage: 'research', message: 'Step 2 is still running. Starting Step 3 (Why Me) with general questions so you do not have to wait.' });
      emitResearchDashboardLoadingPanel(emit, {
        companyName: config.company_name,
        loadingState: 'background_running',
        statusNote: 'Research is still running in the background while the Why Me interview starts.',
        nextExpected: 'This panel will update automatically when research finishes.',
      });
    }

    // Emit research dashboard if research is ready
    if (state.research) {
      emitResearchDashboardPanel(emit, state.research, getBenchmarkPanelPayloadOptions(state, state.research));
    }

    // ─── Step 3: Positioning Coach (Why Me interview) ──────────────────────
    emit({ type: 'stage_start', stage: 'positioning', message: 'Step 3 of 7: Building your Why Me positioning profile...' });
    state.current_stage = 'positioning';
    markStageStart('positioning');
    state.positioning = await runPositioningStage(
      state, config, emit, waitForUser, log,
    );
    markStageEnd('positioning');
    emit({
      type: 'stage_complete',
      stage: 'positioning',
      message: state.positioning_reuse_mode === 'reuse'
        ? 'Step 3 of 7 complete: using saved positioning profile'
        : 'Step 3 of 7 complete: positioning profile created',
      duration_ms: stageTimingsMs.positioning,
    });

    // ─── Finish Step 2 research if it is still running ─────────────────────
    if (!state.research) {
      try {
        state.research = await researchPromise;
      } catch (researchErr) {
        // Research failed after positioning — retry once before giving up.
        log.warn(
          { error: researchErr instanceof Error ? researchErr.message : String(researchErr) },
          'Late research promise rejected — retrying once',
        );
        try {
          state.research = await withRetry(
            () => runResearchAgent({
              job_description: config.job_description,
              company_name: config.company_name,
              parsed_resume: state.intake!,
            }),
            { maxAttempts: 2, baseDelay: 3_000, signal: researchAbort?.signal, onRetry: (a, e) => log.warn({ attempt: a, error: e.message }, 'Research retry') },
          );
        } catch (retryErr) {
          log.error(
            { error: retryErr instanceof Error ? retryErr.message : String(retryErr) },
            'Research failed after retry — pipeline cannot continue without research',
          );
          throw retryErr;
        }
      }
      await applyLatestBenchmarkAssumptionsIfNeeded(state, emit, log);
      markStageEnd('research');
      emit({ type: 'stage_complete', stage: 'research', message: 'Step 2 of 7 complete: benchmark profile ready', duration_ms: stageTimingsMs.research });
      emitResearchDashboardPanel(emit, state.research, getBenchmarkPanelPayloadOptions(state, state.research));
      log.info({ coverage_keywords: state.research.jd_analysis.language_keywords.length }, 'Research complete (after positioning)');
    }

    // ─── Step 4: Gap Analysis ───────────────────────────────────────────────
    await refreshWorkflowModePolicy();
    await applyLatestBenchmarkAssumptionsIfNeeded(state, emit, log);
    emit({ type: 'stage_start', stage: 'gap_analysis', message: 'Step 4 of 7: Comparing your evidence to the JD and benchmark...' });
    state.current_stage = 'gap_analysis';
    markStageStart('gap_analysis');

    state.gap_analysis = await runGapAnalyst({
      parsed_resume: state.intake,
      positioning: state.positioning,
      jd_analysis: state.research.jd_analysis,
      benchmark: state.research.benchmark_candidate,
    });

    markStageEnd('gap_analysis');
    emit({ type: 'stage_complete', stage: 'gap_analysis', message: `Step 4 of 7 complete: coverage ${state.gap_analysis.coverage_score}%`, duration_ms: stageTimingsMs.gap_analysis });
    const gapReqs = state.gap_analysis.requirements;
    const gapStrong = gapReqs.filter(r => r.classification === 'strong').length;
    const gapPartial = gapReqs.filter(r => r.classification === 'partial').length;
    const gapGap = gapReqs.filter(r => r.classification === 'gap').length;
    emit({
      type: 'right_panel_update',
      panel_type: 'gap_analysis',
      data: {
        requirements: gapReqs,
        coverage_score: state.gap_analysis.coverage_score,
        critical_gaps: state.gap_analysis.critical_gaps,
        strength_summary: state.gap_analysis.strength_summary,
        total: gapReqs.length,
        addressed: gapStrong + gapPartial,
        strong_count: gapStrong,
        partial_count: gapPartial,
        gap_count: gapGap,
      },
    });

    log.info({ coverage: state.gap_analysis.coverage_score, gaps: state.gap_analysis.critical_gaps.length }, 'Gap analysis complete');

    await refreshWorkflowModePolicy();
    const draftReadinessBeforeGapQuiz = emitDraftReadinessUpdate(
      emit,
      state,
      workflowModePolicy,
      'gap_analysis',
      state.user_preferences?.workflow_mode,
      'Initial draft readiness after gap analysis.',
    );
    const initialBlockingSummary = draftReadinessBeforeGapQuiz.blockingReasons
      .map((reason) => reason === 'evidence_target'
        ? `${draftReadinessBeforeGapQuiz.remainingEvidenceNeeded} more evidence item${draftReadinessBeforeGapQuiz.remainingEvidenceNeeded === 1 ? '' : 's'}`
        : `${draftReadinessBeforeGapQuiz.remainingCoverageNeeded}% more coverage`)
      .join(' and ');
    const initialTopRemaining = draftReadinessBeforeGapQuiz.highImpactRemaining[0];
    emit({
      type: 'transparency',
      stage: 'gap_analysis',
      message: draftReadinessBeforeGapQuiz.ready
        ? `Draft readiness check: ready to draft (${draftReadinessBeforeGapQuiz.evidenceCount}/${draftReadinessBeforeGapQuiz.minimumEvidenceTarget} evidence items, coverage ${draftReadinessBeforeGapQuiz.coverageScore}% vs target ${workflowModePolicy.draftReadiness.coverageThreshold}%).`
        : `Draft readiness check: not ready yet (${draftReadinessBeforeGapQuiz.evidenceCount}/${draftReadinessBeforeGapQuiz.minimumEvidenceTarget} evidence items, coverage ${draftReadinessBeforeGapQuiz.coverageScore}% vs target ${workflowModePolicy.draftReadiness.coverageThreshold}%). Still needed: ${initialBlockingSummary || 'additional evidence/coverage'}.${initialTopRemaining ? ` Highest-impact remaining area: ${initialTopRemaining.requirement}.` : ''}`,
    });

    // ─── Gap Analysis Quiz (optional, mode-aware and draft-readiness-aware) ───────────
    const allGapQuizQuestions = generateGapQuestions(state.gap_analysis, {
      benchmarkEditVersion: state.benchmark_override_version ?? null,
    });
    const gapQuizPayoffHistory = await loadQuestionnairePayoffHistory(state.session_id);
    const {
      questions: filteredGapQuizQuestionPool,
      skippedCount: skippedPriorGapPrompts,
      skippedQuestions: skippedGapQuestions,
      reuseStats: gapQuizReuseStats,
    } = filterQuestionnaireQuestionsByPayoffHistory(allGapQuizQuestions, gapQuizPayoffHistory, {
      questionnaireStage: 'gap_analysis',
      currentBenchmarkEditVersion: state.benchmark_override_version ?? null,
    });
    if (skippedPriorGapPrompts > 0) {
      emitQuestionnaireReuseSummary(
        emit,
        'gap_analysis',
        'gap_analysis_quiz',
        skippedGapQuestions,
        state.benchmark_override_version ?? null,
        gapQuizReuseStats,
      );
      emit({
        type: 'transparency',
        stage: 'gap_analysis',
        message: `Skipping ${skippedPriorGapPrompts} previously answered lower-impact gap question${skippedPriorGapPrompts === 1 ? '' : 's'} from this session so we can focus on unresolved high-value gaps.`,
      });
    }
    const gapQuizReuseSubtitleNote = buildQuestionnaireReuseSubtitleNote(skippedGapQuestions);
    const targetedCoverageBoosterNeeded = !draftReadinessBeforeGapQuiz.ready
      && draftReadinessBeforeGapQuiz.evidenceCount >= draftReadinessBeforeGapQuiz.minimumEvidenceTarget
      && draftReadinessBeforeGapQuiz.coverageScore < workflowModePolicy.draftReadiness.coverageThreshold;
    const gapQuizQuestionLimit = workflowModePolicy.gapQuiz.enabled
      ? workflowModePolicy.gapQuiz.maxQuestions
      : (targetedCoverageBoosterNeeded ? 2 : 0);
    const gapQuizQuestions = filteredGapQuizQuestionPool.slice(0, gapQuizQuestionLimit);
    const shouldRunGapQuiz = workflowModePolicy.gapQuiz.enabled
      ? (gapQuizQuestions.length > 0 && !draftReadinessBeforeGapQuiz.ready)
      : (targetedCoverageBoosterNeeded && gapQuizQuestions.length > 0);
    if (!shouldRunGapQuiz) {
      const topRemaining = draftReadinessBeforeGapQuiz.highImpactRemaining[0];
      emit({
        type: 'transparency',
        stage: 'gap_analysis',
        message: draftReadinessBeforeGapQuiz.ready
          ? 'Skipping additional gap questions because evidence and coverage are already strong enough to draft.'
          : (workflowModePolicy.gapQuiz.enabled
              ? `No high-impact gap questions remain${topRemaining ? ` (top unresolved area: ${topRemaining.requirement})` : ''}.`
              : `Skipping gap verification questions in this mode to keep momentum toward a draft${topRemaining ? `; the top unresolved area is ${topRemaining.requirement}` : ''}.`),
      });
    } else if (!workflowModePolicy.gapQuiz.enabled && targetedCoverageBoosterNeeded) {
      const topTargets = draftReadinessBeforeGapQuiz.highImpactRemaining
        .slice(0, 2)
        .map((item) => item.requirement)
        .join('; ');
      emit({
        type: 'transparency',
        stage: 'gap_analysis',
        message: `Fast Draft mode: asking up to 2 targeted gap questions because coverage is still below the draft threshold, then continuing to a draft${topTargets ? `. Priority areas: ${topTargets}.` : '.'}`,
      });
    }
    const gapSubmission = shouldRunGapQuiz
      ? await runQuestionnaire(
          'gap_analysis_quiz', 'gap_analysis', 'Step 4 of 7: Verify Gap-Close Evidence', gapQuizQuestions, emit, waitForUser,
          [
            'These answers refine the gap map before blueprint design.',
            gapQuizReuseSubtitleNote,
          ].filter(Boolean).join(' '),
        )
      : null;

    if (gapSubmission && gapQuizQuestions.length > 0) {
      await refreshWorkflowModePolicy();
      state.gap_analysis = enrichGapAnalysis(state.gap_analysis, gapSubmission.responses, gapQuizQuestions);
      const draftReadinessAfterGapQuiz = emitDraftReadinessUpdate(
        emit,
        state,
        workflowModePolicy,
        'gap_analysis',
        state.user_preferences?.workflow_mode,
        'Updated draft readiness after gap question responses.',
      );
      const postGapTopRemaining = draftReadinessAfterGapQuiz.highImpactRemaining[0];
      // Re-emit the updated gap panel
      const enrichedReqs = state.gap_analysis.requirements;
      const enrichedStrong = enrichedReqs.filter(r => r.classification === 'strong').length;
      const enrichedPartial = enrichedReqs.filter(r => r.classification === 'partial').length;
      const enrichedGap = enrichedReqs.filter(r => r.classification === 'gap').length;
      emit({
        type: 'right_panel_update',
        panel_type: 'gap_analysis',
        data: {
          requirements: enrichedReqs,
          coverage_score: state.gap_analysis.coverage_score,
          critical_gaps: state.gap_analysis.critical_gaps,
          strength_summary: state.gap_analysis.strength_summary,
          total: enrichedReqs.length,
          addressed: enrichedStrong + enrichedPartial,
          strong_count: enrichedStrong,
          partial_count: enrichedPartial,
          gap_count: enrichedGap,
        },
      });
      log.info({ enriched_coverage: state.gap_analysis.coverage_score }, 'Gap analysis enriched by user');
      emit({
        type: 'transparency',
        stage: 'gap_analysis',
        message: draftReadinessAfterGapQuiz.ready
          ? `Updated draft readiness: ready to draft (${draftReadinessAfterGapQuiz.evidenceCount}/${draftReadinessAfterGapQuiz.minimumEvidenceTarget} evidence items; coverage ${draftReadinessAfterGapQuiz.coverageScore}%).`
          : `Updated draft readiness: ${draftReadinessAfterGapQuiz.evidenceCount}/${draftReadinessAfterGapQuiz.minimumEvidenceTarget} evidence items; coverage ${draftReadinessAfterGapQuiz.coverageScore}% (mode target ${workflowModePolicy.draftReadiness.coverageThreshold}%).${postGapTopRemaining ? ` Top remaining area: ${postGapTopRemaining.requirement}.` : ''}`,
      });
    }

    // Build scored gap map for suggestion generation (after gap analysis + enrichment)
    const unresolvedGapMap: ScoredGap[] = GUIDED_SUGGESTIONS_ENABLED
      ? buildUnresolvedGapMap(state.gap_analysis!, state.research!.jd_analysis)
      : [];

    // If benchmark assumptions changed after gap analysis, refresh gap analysis before architect.
    if (await applyLatestBenchmarkAssumptionsIfNeeded(state, emit, log)) {
      emit({
        type: 'workflow_replan_started',
        reason: 'benchmark_assumptions_updated',
        benchmark_edit_version: state.benchmark_override_version ?? 0,
        rebuild_from_stage: 'gap_analysis',
        current_stage: state.current_stage,
        phase: 'refresh_gap_analysis',
        message: 'Regenerating the gap analysis to match the updated benchmark.',
      });
      emit({
        type: 'transparency',
        stage: 'gap_analysis',
        message: 'Benchmark assumptions changed after gap analysis. Refreshing gap analysis before building the blueprint.',
      });
      state.gap_analysis = await runGapAnalyst({
        parsed_resume: state.intake,
        positioning: state.positioning,
        jd_analysis: state.research.jd_analysis,
        benchmark: state.research.benchmark_candidate,
      });
      const refreshedReqs = state.gap_analysis.requirements;
      const refreshedStrong = refreshedReqs.filter(r => r.classification === 'strong').length;
      const refreshedPartial = refreshedReqs.filter(r => r.classification === 'partial').length;
      const refreshedGap = refreshedReqs.filter(r => r.classification === 'gap').length;
      emit({
        type: 'right_panel_update',
        panel_type: 'gap_analysis',
        data: {
          requirements: refreshedReqs,
          coverage_score: state.gap_analysis.coverage_score,
          critical_gaps: state.gap_analysis.critical_gaps,
          strength_summary: state.gap_analysis.strength_summary,
          total: refreshedReqs.length,
          addressed: refreshedStrong + refreshedPartial,
          strong_count: refreshedStrong,
          partial_count: refreshedPartial,
          gap_count: refreshedGap,
        },
      });
      emitDraftReadinessUpdate(
        emit,
        state,
        workflowModePolicy,
        'gap_analysis',
        state.user_preferences?.workflow_mode,
        'Draft readiness refreshed after benchmark replan updated the gap analysis.',
      );
      emit({
        type: 'workflow_replan_completed',
        reason: 'benchmark_assumptions_updated',
        benchmark_edit_version: state.benchmark_override_version ?? 0,
        rebuild_from_stage: 'gap_analysis',
        current_stage: state.current_stage,
        rebuilt_through_stage: 'gap_analysis',
        message: 'Gap analysis was regenerated with the updated benchmark.',
      });
    }

    await refreshWorkflowModePolicy();
    const finalDraftReadinessBeforeArchitect = emitDraftReadinessUpdate(
      emit,
      state,
      workflowModePolicy,
      'gap_analysis',
      state.user_preferences?.workflow_mode,
      'Final draft readiness checkpoint before blueprint design.',
    );
    const finalTopRemaining = finalDraftReadinessBeforeArchitect.highImpactRemaining[0];
    const finalDraftPathDecisionMessage = finalDraftReadinessBeforeArchitect.ready
      ? `Proceeding to blueprint design because draft readiness is strong enough (${finalDraftReadinessBeforeArchitect.evidenceCount}/${finalDraftReadinessBeforeArchitect.minimumEvidenceTarget} evidence items; coverage ${finalDraftReadinessBeforeArchitect.coverageScore}% vs target ${workflowModePolicy.draftReadiness.coverageThreshold}%).`
      : `Proceeding to blueprint design to keep momentum in ${state.user_preferences?.workflow_mode ?? 'balanced'} mode, even though readiness is not fully complete yet. Remaining blockers: ${finalDraftReadinessBeforeArchitect.blockingReasons.map((reason) => (
          reason === 'evidence_target'
            ? `${finalDraftReadinessBeforeArchitect.remainingEvidenceNeeded} more evidence item${finalDraftReadinessBeforeArchitect.remainingEvidenceNeeded === 1 ? '' : 's'}`
            : `${finalDraftReadinessBeforeArchitect.remainingCoverageNeeded}% more coverage`
        )).join(' and ') || 'additional evidence/coverage'}${finalTopRemaining ? `. Highest-impact remaining area: ${finalTopRemaining.requirement}.` : '.'}`;
    emit({
      type: 'draft_path_decision',
      stage: 'gap_analysis',
      workflow_mode: state.user_preferences?.workflow_mode ?? 'balanced',
      ready: finalDraftReadinessBeforeArchitect.ready,
      proceeding_reason: finalDraftReadinessBeforeArchitect.ready ? 'readiness_met' : 'momentum_mode',
      ...(finalDraftReadinessBeforeArchitect.blockingReasons.length > 0
        ? { blocking_reasons: finalDraftReadinessBeforeArchitect.blockingReasons }
        : {}),
      ...(typeof finalDraftReadinessBeforeArchitect.remainingEvidenceNeeded === 'number'
        ? { remaining_evidence_needed: finalDraftReadinessBeforeArchitect.remainingEvidenceNeeded }
        : {}),
      ...(typeof finalDraftReadinessBeforeArchitect.remainingCoverageNeeded === 'number'
        ? { remaining_coverage_needed: finalDraftReadinessBeforeArchitect.remainingCoverageNeeded }
        : {}),
      ...(finalTopRemaining
        ? {
            top_remaining: {
              requirement: finalTopRemaining.requirement,
              classification: finalTopRemaining.classification,
              priority: finalTopRemaining.priority,
              evidence_count: finalTopRemaining.evidenceCount,
            },
          }
        : {}),
      message: finalDraftPathDecisionMessage,
    });
    emit({
      type: 'transparency',
      stage: 'gap_analysis',
      message: finalDraftPathDecisionMessage,
    });

    // ─── Step 5: Resume Architect (Blueprint) ──────────────────────────────
    await refreshWorkflowModePolicy();
    emit({ type: 'stage_start', stage: 'architect', message: 'Step 5 of 7: Designing the resume blueprint...' });
    state.current_stage = 'architect';
    markStageStart('architect');

    // Architect has an internal 2-attempt retry for JSON parse failures.
    // Keep outer retry at maxAttempts: 2 to avoid 6-call worst case (2*3).
    state.architect = await withRetry(
      () => runArchitect({
        parsed_resume: state.intake!,
        positioning: state.positioning!,
        research: state.research!,
        gap_analysis: state.gap_analysis!,
        user_preferences: state.user_preferences,
      }),
      {
        maxAttempts: 2,
        baseDelay: 1_500,
        onRetry: (attempt, error) => {
          log.warn({ attempt, error: error.message }, 'Architect retry');
        },
      },
    );

    markStageEnd('architect');
    emit({ type: 'stage_complete', stage: 'architect', message: 'Step 5 of 7 complete: blueprint ready for review', duration_ms: stageTimingsMs.architect });

    // ─── Gate: User reviews blueprint ────────────────────────────
    state.current_stage = 'architect_review';
    markStageStart('architect_review');
    // blueprint_ready event sets up BlueprintReviewPanel with approve button
    emit({ type: 'blueprint_ready', blueprint: state.architect });
    if (workflowModePolicy.reviews.architectBlocking) {
      await waitForUser<void>('architect_review');
    } else {
      emit({
        type: 'transparency',
        stage: 'architect',
        message: 'Fast Draft mode: showing the blueprint but continuing automatically to keep momentum. You can still review it in the workspace.',
      });
    }
    markStageEnd('architect_review');

    if (await applyLatestBenchmarkAssumptionsIfNeeded(state, emit, log)) {
      emit({
        type: 'workflow_replan_started',
        reason: 'benchmark_assumptions_updated',
        benchmark_edit_version: state.benchmark_override_version ?? 0,
        rebuild_from_stage: 'gap_analysis',
        current_stage: state.current_stage,
        phase: 'rebuild_blueprint',
        message: 'Rebuilding the blueprint to match the updated benchmark.',
      });
      emit({
        type: 'transparency',
        stage: 'architect',
        message: 'Benchmark assumptions changed after the blueprint step. Rebuilding gap analysis and blueprint before section writing.',
      });
      state.gap_analysis = await runGapAnalyst({
        parsed_resume: state.intake,
        positioning: state.positioning,
        jd_analysis: state.research.jd_analysis,
        benchmark: state.research.benchmark_candidate,
      });
      const refreshedReqs = state.gap_analysis.requirements;
      const refreshedStrong = refreshedReqs.filter(r => r.classification === 'strong').length;
      const refreshedPartial = refreshedReqs.filter(r => r.classification === 'partial').length;
      const refreshedGap = refreshedReqs.filter(r => r.classification === 'gap').length;
      emit({
        type: 'right_panel_update',
        panel_type: 'gap_analysis',
        data: {
          requirements: refreshedReqs,
          coverage_score: state.gap_analysis.coverage_score,
          critical_gaps: state.gap_analysis.critical_gaps,
          strength_summary: state.gap_analysis.strength_summary,
          total: refreshedReqs.length,
          addressed: refreshedStrong + refreshedPartial,
          strong_count: refreshedStrong,
          partial_count: refreshedPartial,
          gap_count: refreshedGap,
        },
      });
      emitDraftReadinessUpdate(
        emit,
        state,
        workflowModePolicy,
        'gap_analysis',
        state.user_preferences?.workflow_mode,
        'Draft readiness refreshed after benchmark replan rebuilt the gap analysis and blueprint inputs.',
      );
      state.architect = await withRetry(
        () => runArchitect({
          parsed_resume: state.intake!,
          positioning: state.positioning!,
          research: state.research!,
          gap_analysis: state.gap_analysis!,
          user_preferences: state.user_preferences,
        }),
        {
          maxAttempts: 2,
          baseDelay: 1_500,
          onRetry: (attempt, error) => {
            log.warn({ attempt, error: error.message }, 'Architect retry after benchmark override');
          },
        },
      );
      emit({ type: 'blueprint_ready', blueprint: state.architect });
      if (workflowModePolicy.reviews.architectBlocking) {
        await waitForUser<void>('architect_review');
      }
      emit({
        type: 'workflow_replan_completed',
        reason: 'benchmark_assumptions_updated',
        benchmark_edit_version: state.benchmark_override_version ?? 0,
        rebuild_from_stage: 'gap_analysis',
        current_stage: state.current_stage,
        rebuilt_through_stage: 'architect',
        message: 'Blueprint was rebuilt using the updated benchmark assumptions.',
      });
    }

    log.info('Blueprint approved by user');

    // ─── Step 6: Section Writing ────────────────────────────────────────────
    await refreshWorkflowModePolicy();
    emit({ type: 'stage_start', stage: 'section_writing', message: 'Step 6 of 7: Writing resume sections...' });
    state.current_stage = 'section_writing';
    markStageStart('section_writing');
    state.sections = {};

    const sectionCalls = buildSectionCalls(state.architect, state.intake, state.positioning);
    const expandedSectionOrder = sectionCalls.map((c) => c.section);
    let reviewRequiredSections = buildSectionReviewRequiredSet(expandedSectionOrder, workflowModePolicy);
    let autoApprovedByModeSections = expandedSectionOrder.filter((section) => !reviewRequiredSections.has(section));

    // Run section calls with bounded concurrency to reduce provider 429 bursts.
    const runWithSectionLimit = createConcurrencyLimiter(SECTION_WRITE_CONCURRENCY);
    const sectionPromises = new Map<string, Promise<{ ok: true; value: SectionWriterOutput } | { ok: false; error: unknown }>>();
    for (const [index, call] of sectionCalls.entries()) {
      // Catch per-promise immediately to avoid unhandled rejections while user is approving earlier sections.
      sectionPromises.set(
        call.section,
        runWithSectionLimit(async () => {
          // Add slight stagger so calls do not hit the provider at the same millisecond.
          if (index > 0) {
            await sleep(Math.min(index * 120, 900) + Math.floor(Math.random() * 120));
          }
          const sectionAbort = new AbortController();
          setMaxListeners(20, sectionAbort.signal);
          // 5-minute wall-clock timeout per section to prevent stalled sections
          // from blocking the rest of the pipeline indefinitely.
          return withTimeout(
            withRetry(
              () => runSectionWriter({ ...call, signal: sectionAbort.signal }),
              {
                maxAttempts: 4,
                baseDelay: 1_250,
                onRetry: (attempt, error) => {
                  log.warn({ section: call.section, attempt, error: error.message }, 'Section writer retry');
                },
              },
            ),
            300_000,
            `Section ${call.section} timed out after 5 minutes`,
            () => sectionAbort.abort(),
          );
        })
          .then((value) => ({ ok: true as const, value }))
          .catch((error) => ({ ok: false as const, error })),
      );
    }

    // Track approved sections for section_context events
    const approvedSectionSet = new Set<string>();
    const sectionContextVersions = new Map<string, number>();
    // Track last emitted suggestions per section for __suggestion__: lookup
    const lastEmittedSuggestions = new Map<string, SectionSuggestion[]>();
    let draftNowAppliedToSectionReviews = false;
    let approveRemainingReviewBundle = false;
    const autoApproveReviewBundles = new Set<SectionReviewBundleKey>();
    let lastSectionReviewPlanSignature = '';
    const refreshSectionReviewPlan = (announceChanges = false) => {
      const nextReviewRequired = buildSectionReviewRequiredSet(expandedSectionOrder, workflowModePolicy);
      const nextAutoApproved = expandedSectionOrder.filter((section) => !nextReviewRequired.has(section));
      const signature = JSON.stringify({
        mode: state.user_preferences?.workflow_mode ?? 'balanced',
        strategy: workflowModePolicy.reviews.sectionStrategy,
        maxExperienceRoleReviews: workflowModePolicy.reviews.maxExperienceRoleReviews,
        required: Array.from(nextReviewRequired).sort(),
      });
      const changed = signature !== lastSectionReviewPlanSignature;
      reviewRequiredSections = nextReviewRequired;
      autoApprovedByModeSections = nextAutoApproved;

      if (workflowModePolicy.reviews.sectionStrategy !== 'bundled') {
        approveRemainingReviewBundle = false;
        autoApproveReviewBundles.clear();
      }

      if (announceChanges && changed) {
        if (workflowModePolicy.reviews.sectionStrategy === 'bundled') {
          const reviewList = expandedSectionOrder.filter((section) => reviewRequiredSections.has(section));
          const modeLabel = state.user_preferences?.workflow_mode === 'fast_draft'
            ? 'Fast Draft'
            : 'Balanced';
          emit({
            type: 'transparency',
            stage: 'section_review',
            message: `${modeLabel} mode will review ${reviewList.length} high-impact section${reviewList.length === 1 ? '' : 's'} (${reviewList.map((s) => s.replace(/_/g, ' ')).join(', ') || 'core sections'}) and auto-approve the rest. You can still revise any section later in the workspace.`,
          });
        } else {
          emit({
            type: 'transparency',
            stage: 'section_review',
            message: 'Deep Dive mode is now active. The remaining sections will use per-section review (bundle auto-approvals have been disabled).',
          });
        }
      }

      lastSectionReviewPlanSignature = signature;
      return changed;
    };
    refreshSectionReviewPlan(true);

    // Present sections sequentially for user review (LLM work already in flight)
    for (const call of sectionCalls) {
      if (await refreshWorkflowModePolicy()) {
        refreshSectionReviewPlan(true);
      }
      if (await applyLatestBenchmarkAssumptionsIfNeeded(state, emit, log)) {
        throw new Error('Benchmark assumptions changed after section writing started. Restart the pipeline to rebuild sections consistently from gap analysis.');
      }
      const outcome = await sectionPromises.get(call.section)!;
      let result: SectionWriterOutput;
      if (!outcome.ok) {
        const sectionErr = outcome.error instanceof Error ? outcome.error : new Error(String(outcome.error));
        log.error({ section: call.section, error: sectionErr.message }, 'Section writer failed after retries — using fallback content');
        emit({ type: 'section_error', section: call.section, error: sectionErr.message });
        // Use a minimal fallback so the pipeline can continue
        result = {
          section: call.section,
          content: buildFallbackSectionContent(call.section, state.intake!),
          keywords_used: [],
          requirements_addressed: [],
          evidence_ids_used: [],
        };
      } else {
        result = outcome.value;
      }
      state.sections[call.section] = result;

      const autoApproveSectionForMode = workflowModePolicy.reviews.sectionStrategy === 'bundled'
        && (!reviewRequiredSections.has(call.section)
          || (approveRemainingReviewBundle && reviewRequiredSections.has(call.section))
          || autoApproveReviewBundles.has(getSectionReviewBundleKey(call.section)));
      if (autoApproveSectionForMode) {
        emit({
          type: 'transparency',
          stage: 'section_review',
          message: approveRemainingReviewBundle && reviewRequiredSections.has(call.section)
            ? `Bundle review approved the remaining high-impact sections. Auto-approving ${call.section.replace(/_/g, ' ')} and moving on.`
            : autoApproveReviewBundles.has(getSectionReviewBundleKey(call.section)) && reviewRequiredSections.has(call.section)
              ? `Current bundle approved. Auto-approving ${call.section.replace(/_/g, ' ')} and moving to the next review bundle.`
            : `${state.user_preferences?.workflow_mode === 'fast_draft' ? 'Fast Draft' : 'Balanced'} mode auto-approved ${call.section.replace(/_/g, ' ')} to keep momentum. You can still revise it later in the workspace.`,
        });
        emit({ type: 'section_draft', section: call.section, content: result.content });
        emit({ type: 'section_approved', section: call.section });
        approvedSectionSet.add(call.section);
        if (GUIDED_SUGGESTIONS_ENABLED) {
          markGapAddressed(unresolvedGapMap, call.section, result.content);
        }
        continue;
      }

      // Revision loop: keep presenting section until user approves
      const MAX_REVIEW_ITERATIONS = 5;
      let sectionApproved = false;
      let reviewIterations = 0;
      while (!sectionApproved) {
        if (await refreshWorkflowModePolicy()) {
          refreshSectionReviewPlan(true);
        }
        if (await applyLatestBenchmarkAssumptionsIfNeeded(state, emit, log)) {
          throw new Error('Benchmark assumptions changed during section review. Restart the pipeline to rebuild sections consistently from gap analysis.');
        }
        if (reviewIterations >= MAX_REVIEW_ITERATIONS) {
          log.warn({ section: call.section, iterations: reviewIterations }, 'Max review iterations exceeded — auto-approving section');
          emit({ type: 'section_approved', section: call.section });
          approvedSectionSet.add(call.section);
          break;
        }
        const contextVersion = (sectionContextVersions.get(call.section) ?? 0) + 1;
        sectionContextVersions.set(call.section, contextVersion);
        const reviewToken = `${call.section}:${contextVersion}:${Date.now()}`;
        // Phase 1: Emit section context with deterministic suggestions (instant)
        const deterministicSuggestions = GUIDED_SUGGESTIONS_ENABLED
          ? generateDeterministicSuggestions(
              call.section, result.content, unresolvedGapMap,
              state.architect!, state.positioning!, state.research!,
            )
          : [];
        lastEmittedSuggestions.set(call.section, deterministicSuggestions);
        emit({
          type: 'section_context',
          section: call.section,
          context_version: contextVersion,
          generated_at: new Date().toISOString(),
          blueprint_slice: getSectionBlueprint(call.section, state.architect!),
          evidence: filterEvidenceForSection(call.section, state.architect!, state.positioning!),
          keywords: buildKeywordStatus(call.section, result.content, state.architect!),
          gap_mappings: buildGapMappingsForSection(state.gap_analysis!),
          section_order: expandedSectionOrder,
          sections_approved: Array.from(approvedSectionSet),
          review_strategy: workflowModePolicy.reviews.sectionStrategy,
          review_required_sections: Array.from(reviewRequiredSections),
          auto_approved_sections: autoApprovedByModeSections,
          ...buildSectionReviewBundleMetadata(
            expandedSectionOrder,
            reviewRequiredSections,
            approvedSectionSet,
            call.section,
          ),
          suggestions: deterministicSuggestions.length > 0 ? deterministicSuggestions : undefined,
        });

        // Phase 2: Fire-and-forget LLM enrichment (non-blocking, MODEL_LIGHT is free)
        if (GUIDED_SUGGESTIONS_ENABLED && deterministicSuggestions.length > 0) {
          generateLLMEnrichedSuggestions(deterministicSuggestions, call.section, result.content)
            .then(enriched => {
              const enrichedVersion = (sectionContextVersions.get(call.section) ?? 0) + 1;
              sectionContextVersions.set(call.section, enrichedVersion);
              lastEmittedSuggestions.set(call.section, enriched);
              emit({
                type: 'section_context',
                section: call.section,
                context_version: enrichedVersion,
                generated_at: new Date().toISOString(),
                blueprint_slice: getSectionBlueprint(call.section, state.architect!),
                evidence: filterEvidenceForSection(call.section, state.architect!, state.positioning!),
                keywords: buildKeywordStatus(call.section, result.content, state.architect!),
                gap_mappings: buildGapMappingsForSection(state.gap_analysis!),
                section_order: expandedSectionOrder,
                sections_approved: Array.from(approvedSectionSet),
                review_strategy: workflowModePolicy.reviews.sectionStrategy,
                review_required_sections: Array.from(reviewRequiredSections),
                auto_approved_sections: autoApprovedByModeSections,
                ...buildSectionReviewBundleMetadata(
                  expandedSectionOrder,
                  reviewRequiredSections,
                  approvedSectionSet,
                  call.section,
                ),
                suggestions: enriched.length > 0 ? enriched : undefined,
              });
            })
            .catch((err: unknown) => {
              log.warn({ err }, 'Enriched suggestion generation failed — using deterministic suggestions');
            });
        }

        // Emit section for progressive rendering / re-review
        emit({ type: 'section_draft', section: call.section, content: result.content, review_token: reviewToken });

        if (await hasDraftNowRequest(config.session_id)) {
          draftNowAppliedToSectionReviews = true;
          emit({
            type: 'transparency',
            stage: 'section_review',
            message: `Draft-now is active. Auto-approving ${call.section.replace(/_/g, ' ')} and continuing through the remaining section reviews.`,
          });
          emit({ type: 'section_approved', section: call.section });
          approvedSectionSet.add(call.section);
          if (GUIDED_SUGGESTIONS_ENABLED) {
            markGapAddressed(unresolvedGapMap, call.section, result.content);
          }
          sectionApproved = true;
          continue;
        }

        // Gate: User approves, quick-fixes, directly edits, or provides feedback
        state.current_stage = 'section_review';
        const reviewResponse = await waitForUser<boolean | {
          approved: boolean;
          edited_content?: string;
          feedback?: string;
          refinement_ids?: string[];
          review_token?: string;
          approve_remaining_review_bundle?: boolean;
          approve_remaining_current_bundle?: boolean;
        }>(
          `section_review_${call.section}`,
        );
        const normalizedReview = normalizeSectionReviewResponse(reviewResponse);
        reviewIterations++;

        // Strict token checks for object responses. Legacy boolean responses are accepted
        // for backwards compatibility, but all structured workbench actions must be tokened.
        if (typeof reviewResponse !== 'boolean' && !normalizedReview.review_token) {
          emit({
            type: 'transparency',
            stage: 'section_review',
            message: 'Your action expired. Please click your choice again on the latest draft.',
          });
          log.warn({ section: call.section }, 'Rejected tokenless section review object response');
          continue;
        }
        if (normalizedReview.review_token && normalizedReview.review_token !== reviewToken) {
          emit({
            type: 'transparency',
            stage: 'section_review',
            message: 'Ignoring an outdated refinement action and keeping the latest draft on screen.',
          });
          log.info(
            {
              section: call.section,
              expected_review_token: reviewToken,
              received_review_token: normalizedReview.review_token,
            },
            'Ignored stale section review response',
          );
          continue;
        }

        if (normalizedReview.approved) {
          if (
            normalizedReview.approve_remaining_review_bundle
            && workflowModePolicy.reviews.sectionStrategy === 'bundled'
          ) {
            approveRemainingReviewBundle = true;
            emit({
              type: 'transparency',
              stage: 'section_review',
              message: 'Bundle review approved. The remaining high-impact review sections will be auto-approved so you can move on to quality review faster.',
            });
          }
          if (
            normalizedReview.approve_remaining_current_bundle
            && workflowModePolicy.reviews.sectionStrategy === 'bundled'
          ) {
            const currentBundleKey = getSectionReviewBundleKey(call.section);
            autoApproveReviewBundles.add(currentBundleKey);
            emit({
              type: 'transparency',
              stage: 'section_review',
              message: `${getSectionReviewBundleLabel(currentBundleKey)} bundle approved. Remaining review sections in this bundle will be auto-approved.`,
            });
          }
          emit({ type: 'section_approved', section: call.section });
          approvedSectionSet.add(call.section);
          // Mark gap requirements as addressed in this section
          if (GUIDED_SUGGESTIONS_ENABLED) {
            markGapAddressed(unresolvedGapMap, call.section, result.content);
          }
          sectionApproved = true;
        } else if (normalizedReview.edited_content) {
          // User directly edited — use their content without LLM rewrite
          result = { ...result, content: normalizedReview.edited_content };
          state.sections[call.section] = result;
          emit({ type: 'section_approved', section: call.section });
          approvedSectionSet.add(call.section);
          if (GUIDED_SUGGESTIONS_ENABLED) {
            markGapAddressed(unresolvedGapMap, call.section, result.content);
          }
          sectionApproved = true;
          log.info({ section: call.section }, 'Section directly edited by user');
        } else if (normalizedReview.feedback) {
          // Quick Fix: re-run section writer with user feedback as revision instruction
          const feedback = normalizedReview.feedback;
          const refinementIds = normalizedReview.refinement_ids;

          // Handle suggestion-based feedback: __suggestion__:ID → look up template instruction
          let instruction: string;
          if (feedback.startsWith('__suggestion__:')) {
            const suggestionId = feedback.slice('__suggestion__:'.length);
            const sectionSuggestions = lastEmittedSuggestions.get(call.section) ?? [];
            const suggestion = sectionSuggestions.find(s => s.id === suggestionId);
            if (suggestion) {
              instruction = buildRevisionInstruction(suggestion);
              log.info({ section: call.section, suggestion_id: suggestionId, intent: suggestion.intent }, 'Applying suggestion-based revision');
            } else {
              log.warn({ section: call.section, suggestion_id: suggestionId }, 'Suggestion ID not found — using generic instruction');
              instruction = feedback;
            }
          } else {
            instruction = refinementIds?.length
              ? `Apply these fixes: ${refinementIds.join(', ')}. User feedback: ${feedback}`
              : feedback;
          }

          const blueprintSlice = getSectionBlueprint(call.section, state.architect!);
          try {
            const revisionAbort = new AbortController();
            const revised = await withTimeout(
              withRetry(
                () => runSectionRevision(
                  call.section,
                  result.content,
                  instruction,
                  blueprintSlice,
                  state.architect!.global_rules,
                  { signal: revisionAbort.signal },
                ),
                {
                  maxAttempts: 3,
                  baseDelay: 1_000,
                  onRetry: (a, e) => {
                    log.warn({ section: call.section, attempt: a, error: e.message }, 'Section revision retry');
                  },
                },
              ),
              SECTION_REVISION_TIMEOUT_MS,
              `Section ${call.section} revision timed out`,
              () => revisionAbort.abort(),
            );
            result = revised;
            state.sections[call.section] = revised;
            emit({ type: 'section_revised', section: call.section, content: revised.content, review_token: reviewToken });
            log.info({ section: call.section }, 'Section revised via Quick Fix feedback');
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            emit({
              type: 'transparency',
              stage: 'section_review',
              message: 'Revision attempt failed — keeping the current draft so you can continue.',
            });
            emit({ type: 'section_error', section: call.section, error: message });
            log.error({ section: call.section, error: message }, 'Section quick-fix revision failed');
          }
          // Loop continues — re-present revised section for re-review
        } else {
          // Keep the review gate active until we receive an actionable response.
          emit({
            type: 'transparency',
            stage: 'section_review',
            message: 'We received an unrecognized response — please use the Approve, Quick Fix, or Edit buttons to continue.',
          });
          log.warn({ section: call.section, reviewResponse }, 'Non-actionable section review response');
        }
      }
    }

    markStageEnd('section_writing');
    emit({ type: 'stage_complete', stage: 'section_writing', message: 'Step 6 of 7 complete: section drafts ready', duration_ms: stageTimingsMs.section_writing });

    log.info({ sections: Object.keys(state.sections).length }, 'Section writing complete');

    if (draftNowAppliedToSectionReviews) {
      await supabaseAdmin
        .from('session_question_responses')
        .update({ status: 'skipped', updated_at: new Date().toISOString() })
        .eq('session_id', config.session_id)
        .eq('question_id', '__generate_draft_now__');
    }

    if (await applyLatestBenchmarkAssumptionsIfNeeded(state, emit, log)) {
      throw new Error('Benchmark assumptions changed after section writing completed. Restart the pipeline to rebuild downstream work consistently from gap analysis.');
    }

    // ─── Step 7: Quality Review & Export Readiness ─────────────────────────
    await refreshWorkflowModePolicy();
    emit({ type: 'stage_start', stage: 'quality_review', message: 'Step 7 of 7: Running quality review and final checks...' });
    state.current_stage = 'quality_review';
    markStageStart('quality_review');

    const fullText = assembleResume(state.sections, state.architect);

    // Deterministic keyword-integration signal (weighted, no LLM call needed)
    const keywordCoverage = computeKeywordCoverage(
      fullText,
      state.research.jd_analysis.language_keywords,
      state.research.jd_analysis.must_haves,
    );
    emit({
      type: 'transparency',
      stage: 'quality_review',
      message: `Keyword integration effort: ${keywordCoverage.strong} strong + ${keywordCoverage.partial} partial matches across ${keywordCoverage.total} targets (${keywordCoverage.percentage}% weighted)`,
    });
    if (keywordCoverage.high_priority_missing.length > 0) {
      emit({
        type: 'transparency',
        stage: 'quality_review',
        message: `Still missing high-priority terms: ${keywordCoverage.high_priority_missing.slice(0, 5).join(', ')}`,
      });
    }

    state.quality_review = await withRetry(
      () => runQualityReviewer({
        assembled_resume: {
          sections: Object.fromEntries(
            Object.entries(state.sections ?? {}).map(([k, v]) => [k, v.content])
          ),
          full_text: fullText,
        },
        architect_blueprint: state.architect!,
        jd_analysis: state.research!.jd_analysis,
        evidence_library: state.positioning!.evidence_library,
      }),
      {
        maxAttempts: 3,
        baseDelay: 1_500,
        onRetry: (attempt, error) => {
          log.warn({ attempt, error: error.message }, 'Quality reviewer retry');
        },
      },
    );

    // Use a single source of truth for keyword integration effort in UI surfaces.
    state.quality_review.scores.requirement_coverage = keywordCoverage.percentage;

    emit({ type: 'quality_scores', scores: state.quality_review.scores });

    // ─── Revision loop (max 1 cycle) ────────────────────────────
    if (state.quality_review.decision === 'revise' && state.quality_review.revision_instructions) {
      state.current_stage = 'revision';
      markStageStart('revision');
      state.revision_count = 1;

      emit({
        type: 'revision_start',
        instructions: state.quality_review.revision_instructions,
      });

      const allInstructions = state.quality_review.revision_instructions.slice(0, 4);
      const highPriority = allInstructions.filter(i => i.priority === 'high');
      const autoApply = allInstructions.filter(i => i.priority !== 'high');

      // Auto-apply low/medium priority fixes without asking
      for (const instruction of autoApply) {
        const section = instruction.target_section;
        const original = state.sections[section];
        if (!original) continue;

        const blueprintSlice = getSectionBlueprint(section, state.architect);
        try {
          const revisionAbort = new AbortController();
          const revised = await withTimeout(
            withRetry(
              () => runSectionRevision(
                section,
                original.content,
                instruction.instruction,
                blueprintSlice,
                state.architect!.global_rules,
                { signal: revisionAbort.signal },
              ),
              {
                maxAttempts: 3,
                baseDelay: 1_000,
                onRetry: (attempt, error) => {
                  log.warn({ section, attempt, error: error.message }, 'Section revision retry');
                },
              },
            ),
            SECTION_REVISION_TIMEOUT_MS,
            `Section ${section} revision timed out`,
            () => revisionAbort.abort(),
          );
          state.sections[section] = revised;
          emit({ type: 'section_revised', section, content: revised.content });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          emit({ type: 'section_error', section, error: message });
          log.error({ section, error: message }, 'Auto-applied revision failed');
        }
      }

      // High-priority fixes: present to user for approval (if feature flag enabled)
      let approvedFixIds: Set<string> = new Set(highPriority.map((_, i) => `fix_${i}`)); // default: apply all
      const customModifications = new Map<string, string>();
      const requireHighFixApproval = workflowModePolicy.reviews.qualityFixApproval !== 'none'
        || (state.quality_review.scores.evidence_integrity ?? 0) < 90;
      if (highPriority.length > 0 && !requireHighFixApproval) {
        emit({
          type: 'transparency',
          stage: 'quality_review',
          message: 'Fast Draft mode: auto-applying high-priority quality fixes to preserve momentum (no evidence integrity issues detected).',
        });
      }
      if (highPriority.length > 0 && requireHighFixApproval) {
        const fixQuestions = highPriority.map((inst, i) =>
          makeQuestion(`fix_${i}`, `${inst.target_section}: ${inst.issue}`, 'single_choice', [
            { id: 'apply', label: 'Apply this fix' },
            { id: 'skip', label: 'Skip this one' },
            { id: 'modify', label: 'Apply with changes' },
          ], { allow_custom: true, context: inst.instruction }),
        );

        const fixSubmission = await runQuestionnaire(
          'quality_review_approval', 'quality_fixes', 'Step 7 of 7: Review High-Priority Fixes', fixQuestions, emit, waitForUser,
          `${highPriority.length} important fix${highPriority.length > 1 ? 'es' : ''} need your approval before export`,
        );

        if (fixSubmission) {
          approvedFixIds = new Set<string>();
          for (const resp of fixSubmission.responses) {
            const selected = resp.selected_option_ids[0];
            if (selected === 'apply' || selected === 'modify') {
              approvedFixIds.add(resp.question_id);
              if (selected === 'modify' && resp.custom_text?.trim()) {
                customModifications.set(resp.question_id, resp.custom_text.trim());
              }
            }
          }
        }
      }

      // Apply approved high-priority fixes
      for (let i = 0; i < highPriority.length; i++) {
        if (!approvedFixIds.has(`fix_${i}`)) continue;

        const instruction = highPriority[i];
        const section = instruction.target_section;
        const original = state.sections[section];
        if (!original) continue;

        // Append user's custom modification text when "Apply with changes" was selected
        const customText = customModifications.get(`fix_${i}`);
        const revisionInstruction = customText
          ? `${instruction.instruction}\n\nUSER MODIFICATION: ${customText}`
          : instruction.instruction;

        const blueprintSlice = getSectionBlueprint(section, state.architect);
        try {
          const revisionAbort = new AbortController();
          const revised = await withTimeout(
            withRetry(
              () => runSectionRevision(
                section,
                original.content,
                revisionInstruction,
                blueprintSlice,
                state.architect!.global_rules,
                { signal: revisionAbort.signal },
              ),
              {
                maxAttempts: 3,
                baseDelay: 1_000,
                onRetry: (attempt, error) => {
                  log.warn({ section, attempt, error: error.message }, 'Section revision retry');
                },
              },
            ),
            SECTION_REVISION_TIMEOUT_MS,
            `Section ${section} revision timed out`,
            () => revisionAbort.abort(),
          );
          state.sections[section] = revised;
          emit({ type: 'section_revised', section, content: revised.content });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          emit({ type: 'section_error', section, error: message });
          log.error({ section, error: message }, 'Approved high-priority revision failed');
        }
      }

      log.info({ revisions: allInstructions.length, approved: approvedFixIds.size }, 'Revision cycle complete');
      markStageEnd('revision');
    } else if (state.quality_review.decision === 'redesign') {
      // Quality reviewer suggests a full redesign — surface reason to user, then continue to
      // export the best resume we have rather than silently ignoring the signal.
      const reason = state.quality_review.redesign_reason ?? 'The resume structure may not optimally showcase your candidacy for this role.';
      log.warn({ decision: 'redesign', reason }, 'Quality review suggests redesign — notifying user and proceeding with current sections');
      emit({
        type: 'transparency',
        stage: 'quality_review',
        message: `Quality review note: ${reason} The resume has been optimized as far as possible in this session.`,
      });
      emit({
        type: 'right_panel_update',
        panel_type: 'quality_dashboard',
        data: {
          scores: state.quality_review.scores,
          decision: state.quality_review.decision,
          redesign_reason: reason,
        },
      });
    }

    // ─── Explicit ATS compliance check before export ──────────────
    const postRevisionText = assembleResume(state.sections, state.architect);
    const atsFindings = runAtsComplianceCheck(postRevisionText);
    if (atsFindings.length > 0) {
      state.current_stage = 'revision';
      emit({
        type: 'transparency',
        stage: 'revision',
        message: 'Applying ATS compliance corrections before export...',
      });

      for (const finding of atsFindings.filter((f) => f.priority !== 'low').slice(0, 3)) {
        const section = mapFindingToSection(finding.section, state.sections);
        const original = section ? state.sections[section] : undefined;
        if (!section || !original) continue;

        emit({ type: 'system_message', content: `Applying ATS fix to ${section}: ${finding.issue}` });

        const blueprintSlice = getSectionBlueprint(section, state.architect);
        try {
          const revisionAbort = new AbortController();
          const revised = await withTimeout(
            withRetry(
              () => runSectionRevision(
                section,
                original.content,
                `${finding.issue}. ${finding.instruction}`,
                blueprintSlice,
                state.architect!.global_rules,
                { signal: revisionAbort.signal },
              ),
              {
                maxAttempts: 3,
                baseDelay: 1_000,
                onRetry: (attempt, error) => {
                  log.warn({ section, attempt, error: error.message }, 'ATS revision retry');
                },
              },
            ),
            SECTION_REVISION_TIMEOUT_MS,
            `Section ${section} revision timed out`,
            () => revisionAbort.abort(),
          );
          state.sections[section] = revised;
          emit({ type: 'section_revised', section, content: revised.content });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          emit({ type: 'section_error', section, error: message });
          log.error({ section, error: message }, 'ATS compliance revision failed');
        }
      }
    }

    markStageEnd('quality_review');
    emit({ type: 'stage_complete', stage: 'quality_review', message: 'Step 7 of 7 complete: final resume ready for export', duration_ms: stageTimingsMs.quality_review });

    // ─── Complete ────────────────────────────────────────────────
    state.current_stage = 'complete';
    const finalResume = buildFinalResumePayload(state, config);
    const exportValidation = runAtsComplianceCheck(assembleResume(state.sections, state.architect));
    emit({
      type: 'pipeline_complete',
      session_id,
      contact_info: state.intake.contact,
      company_name: config.company_name,
      resume: finalResume,
      export_validation: {
        passed: exportValidation.length === 0,
        findings: exportValidation,
      },
    });

    // Collect accumulated token usage from all LLM calls
    state.token_usage.input_tokens = usageAcc.input_tokens;
    state.token_usage.output_tokens = usageAcc.output_tokens;
    // Estimate cost using blended rate for this pipeline's model mix:
    // The pipeline primarily uses MODEL_LIGHT (free) for intake/JD analysis,
    // MODEL_MID for research/gap, and MODEL_PRIMARY for section writing.
    // Rough blended estimate: 50% at LIGHT rate (free), 30% at MID, 20% at PRIMARY.
    const lightPrice = MODEL_PRICING['glm-4.7-flash'] ?? { input: 0, output: 0 };
    const midPrice = MODEL_PRICING['glm-4.5-air'] ?? { input: 0.20, output: 1.10 };
    const primaryPrice = MODEL_PRICING['glm-4.7'] ?? { input: 0.60, output: 2.20 };
    const blendedInputRate = lightPrice.input * 0.5 + midPrice.input * 0.3 + primaryPrice.input * 0.2;
    const blendedOutputRate = lightPrice.output * 0.5 + midPrice.output * 0.3 + primaryPrice.output * 0.2;
    state.token_usage.estimated_cost_usd = Number(
      ((usageAcc.input_tokens / 1_000_000) * blendedInputRate +
       (usageAcc.output_tokens / 1_000_000) * blendedOutputRate).toFixed(4),
    );
    stopUsageTracking(session_id);

    // Persist final state (including resume for reconnect restore)
    await persistSession(state, finalResume, emit);

    log.info({
      stages_completed: 7,
      sections: Object.keys(state.sections).length,
      quality_decision: state.quality_review.decision,
      quality_scores: state.quality_review.scores,
      stage_timings_ms: stageTimingsMs,
    }, 'Pipeline complete');

    return state;

  } catch (error) {
    researchAbort?.abort();
    stopUsageTracking(session_id);
    const errorMsg = error instanceof Error ? error.message : String(error);
    captureError(error, { sessionId: session_id, stage: state.current_stage });
    log.error({ error: errorMsg, stage: state.current_stage }, 'Pipeline error');
    emit({ type: 'pipeline_error', stage: state.current_stage, error: errorMsg });
    throw error;
  }
}

// ─── Positioning stage (interactive) ─────────────────────────────────

function buildPositioningBatchQuestions(
  batch: PositioningQuestion[],
  workflowMode: WorkflowMode | undefined,
  config?: {
    benchmarkEditVersion?: number | null;
  },
): QuestionnaireQuestion[] {
  const categoryLabels: Record<string, string> = {
    scale_and_scope: 'Scale & Scope',
    requirement_mapped: 'Requirements',
    career_narrative: 'Career Story',
    hidden_accomplishments: 'Hidden Wins',
    currency_and_adaptability: 'Adaptability',
  };

  return batch.map((question) => {
    const payoffRequirements = (question.requirement_map ?? []).slice(0, 2);
    const payoffParts: string[] = [];
    let payoffHint: string | undefined;
    let impactTier: 'high' | 'medium' | 'low' = 'medium';
    if (question.category) {
      payoffParts.push(`Focus: ${categoryLabels[question.category] ?? question.category}`);
    }
    if (payoffRequirements.length > 0) {
      payoffParts.push(`Improves coverage for: ${payoffRequirements.join('; ')}`);
      payoffHint = `Improves JD coverage for ${payoffRequirements.slice(0, 2).join(' and ')}`;
      impactTier = 'high';
    }
    const topicKeys = [
      ...payoffRequirements.map((req) => `requirement:${normalizeQuestionTopicKey(req)}`),
      ...(question.category ? [`category:${question.category}`] : []),
    ];
    if (workflowMode && workflowMode !== 'deep_dive') {
      payoffParts.push(workflowMode === 'fast_draft'
        ? 'Fast Draft mode: concise answers are okay; add detail only where helpful.'
        : 'Balanced mode: concise answers are fine, but metrics and scope details help.');
    }

    const context = [question.context, ...payoffParts].filter(Boolean).join(' ');
    const answerOptions = (question.suggestions ?? []).map((suggestion, index) => ({
      id: `opt_${index + 1}`,
      label: suggestion.label,
      description: suggestion.description,
      source: suggestion.source,
    }));

    return makeQuestion(
      question.id,
      question.question_text,
      question.input_type === 'multiple_choice' ? 'multi_choice' : 'single_choice',
      answerOptions,
      {
        context: context || undefined,
        payoff_hint: payoffHint,
        impact_tier: impactTier,
        topic_keys: topicKeys.length > 0 ? topicKeys : undefined,
        benchmark_edit_version: config?.benchmarkEditVersion ?? null,
        allow_custom: true,
        allow_skip: question.optional ?? true,
      },
    );
  });
}

function isDraftNowQuestionnaireSubmission(submission: QuestionnaireSubmission | null): boolean {
  if (!submission) return false;
  return submission.generated_by === 'generate_draft_now'
    || submission.generated_by === 'generate_draft_now_fallback';
}

function collectPositioningAnswersFromQuestionnaire(
  submission: QuestionnaireSubmission,
  questionnaireQuestions: QuestionnaireQuestion[],
): Array<{ question_id: string; answer: string; selected_suggestion?: string }> {
  const questionnaireById = new Map(questionnaireQuestions.map((q) => [q.id, q]));
  const collected: Array<{ question_id: string; answer: string; selected_suggestion?: string }> = [];

  for (const response of submission.responses) {
    if (response.skipped) continue;
    const questionnaireQuestion = questionnaireById.get(response.question_id);
    const selectedLabels = questionnaireQuestion
      ? getSelectedLabels(response, questionnaireQuestion)
      : [];
    const selectedSuggestion = selectedLabels[0];
    const customText = typeof response.custom_text === 'string' ? response.custom_text.trim() : '';
    const synthesizedAnswer = customText || selectedLabels.join('; ');
    if (!synthesizedAnswer) continue;

    collected.push({
      question_id: response.question_id,
      answer: tagPositioningAnswer(synthesizedAnswer, selectedSuggestion),
      selected_suggestion: selectedSuggestion,
    });
  }

  return collected;
}

function buildSectionReviewRequiredSet(
  sectionNames: string[],
  policy: WorkflowModePolicy,
): Set<string> {
  if (policy.reviews.sectionStrategy === 'per_section') {
    return new Set(sectionNames);
  }

  const required = new Set<string>();
  const headlineSections = ['summary', 'selected_accomplishments'];
  for (const section of headlineSections) {
    if (sectionNames.includes(section)) {
      required.add(section);
    }
  }

  const experienceSections = sectionNames
    .filter((section) => section.startsWith('experience_role_'))
    .sort(compareExperienceRoleKeys)
    .slice(0, Math.max(0, Math.floor(policy.reviews.maxExperienceRoleReviews)));
  for (const section of experienceSections) {
    required.add(section);
  }

  if (required.size === 0 && sectionNames.length > 0) {
    required.add(sectionNames[0]!);
  }

  return required;
}

type SectionReviewBundleKey = 'headline' | 'core_experience' | 'supporting';

function getSectionReviewBundleKey(section: string): SectionReviewBundleKey {
  if (section === 'summary' || section === 'selected_accomplishments') return 'headline';
  if (section.startsWith('experience_role_')) return 'core_experience';
  return 'supporting';
}

function getSectionReviewBundleLabel(bundleKey: SectionReviewBundleKey): string {
  switch (bundleKey) {
    case 'headline':
      return 'Headline';
    case 'core_experience':
      return 'Core Experience';
    case 'supporting':
      return 'Supporting Sections';
  }
}

function buildSectionReviewBundleMetadata(
  sectionOrder: string[],
  reviewRequiredSections: Set<string>,
  approvedSections: Set<string>,
  currentSection: string,
): {
  current_review_bundle_key: SectionReviewBundleKey;
  review_bundles: Array<{
    key: SectionReviewBundleKey;
    label: string;
    total_sections: number;
    review_required: number;
    reviewed_required: number;
    status: 'pending' | 'in_progress' | 'complete' | 'auto_approved';
  }>;
} {
  const bundleOrder: SectionReviewBundleKey[] = ['headline', 'core_experience', 'supporting'];
  const sectionsByBundle = new Map<SectionReviewBundleKey, string[]>(
    bundleOrder.map((key) => [key, []]),
  );
  for (const section of sectionOrder) {
    const key = getSectionReviewBundleKey(section);
    sectionsByBundle.get(key)!.push(section);
  }

  const currentBundle = getSectionReviewBundleKey(currentSection);
  const bundles = bundleOrder.map((key) => {
    const sections = sectionsByBundle.get(key) ?? [];
    const reviewRequired = sections.filter((s) => reviewRequiredSections.has(s));
    const reviewedRequired = reviewRequired.filter((s) => approvedSections.has(s));
    let status: 'pending' | 'in_progress' | 'complete' | 'auto_approved' = 'pending';
    if (reviewRequired.length === 0) {
      status = sections.length > 0 ? 'auto_approved' : 'pending';
    } else if (reviewedRequired.length >= reviewRequired.length) {
      status = 'complete';
    } else if (key === currentBundle || reviewedRequired.length > 0) {
      status = 'in_progress';
    }
    return {
      key,
      label: getSectionReviewBundleLabel(key),
      total_sections: sections.length,
      review_required: reviewRequired.length,
      reviewed_required: reviewedRequired.length,
      status,
    };
  }).filter((bundle) => bundle.total_sections > 0);

  return {
    current_review_bundle_key: currentBundle,
    review_bundles: bundles,
  };
}

async function runPositioningStage(
  state: PipelineState,
  config: PipelineConfig,
  emit: PipelineEmitter,
  waitForUser: WaitForUser,
  log: ReturnType<typeof createSessionLogger>,
): Promise<PositioningProfile> {
  // Check for existing positioning profile
  const { data: existingProfile } = await supabaseAdmin
    .from('user_positioning_profiles')
    .select('id, positioning_data, updated_at, version')
    .eq('user_id', config.user_id)
    .single();

  if (existingProfile?.positioning_data) {
    // User has a saved profile — ask if they want to reuse it
    emit({
      type: 'positioning_profile_found',
      profile: existingProfile.positioning_data as PositioningProfile,
      updated_at: existingProfile.updated_at,
    });

    const choice = await waitForUser<'reuse' | 'update' | 'fresh'>('positioning_profile_choice');
    state.positioning_reuse_mode = choice;

    if (choice === 'reuse') {
      state.positioning_profile_id = existingProfile.id;
      log.info('Reusing existing positioning profile');
      return existingProfile.positioning_data as PositioningProfile;
    }
    // For 'update' and 'fresh', proceed with the interview
  }

  // Generate JD-informed questions (async, LLM-powered when research is available)
  await applyLatestWorkflowPreferencesIfNeeded(state, emit, log);
  const questions = await generateQuestions(state.intake!, state.research ?? undefined, state.user_preferences);
  const answers: Array<{ question_id: string; answer: string; selected_suggestion?: string }> = [];
  let workflowMode = state.user_preferences?.workflow_mode;
  let positioningBudget = getPositioningQuestionBudget(workflowMode);
  let workflowModePolicy = getWorkflowModePolicy(workflowMode);
  let minimumEvidenceTarget = getMinimumEvidenceTarget(state, workflowModePolicy);
  let effectiveMaxQuestions = Number.isFinite(positioningBudget.maxQuestions)
    ? Math.max(positioningBudget.maxQuestions, minimumEvidenceTarget)
    : positioningBudget.maxQuestions;
  const refreshPositioningPreferences = async () => {
    if (!(await applyLatestWorkflowPreferencesIfNeeded(state, emit, log))) return false;
    workflowMode = state.user_preferences?.workflow_mode;
    positioningBudget = getPositioningQuestionBudget(workflowMode);
    workflowModePolicy = getWorkflowModePolicy(workflowMode);
    minimumEvidenceTarget = getMinimumEvidenceTarget(state, workflowModePolicy);
    effectiveMaxQuestions = Number.isFinite(positioningBudget.maxQuestions)
      ? Math.max(positioningBudget.maxQuestions, minimumEvidenceTarget)
      : positioningBudget.maxQuestions;
    return true;
  };

  // Build category progress tracking
  const categoryLabels: Record<string, string> = {
    scale_and_scope: 'Scale & Scope',
    requirement_mapped: 'Requirements',
    career_narrative: 'Career Story',
    hidden_accomplishments: 'Hidden Wins',
    currency_and_adaptability: 'Adaptability',
  };
  const buildCategoryProgress = (answeredIds: Set<string>): CategoryProgress[] => {
    const cats = new Map<string, { total: number; answered: number }>();
    for (const q of questions) {
      const cat = q.category ?? 'career_narrative';
      if (!cats.has(cat)) cats.set(cat, { total: 0, answered: 0 });
      const c = cats.get(cat)!;
      c.total++;
      if (answeredIds.has(q.id)) c.answered++;
    }
    return Array.from(cats.entries()).map(([cat, c]) => ({
      category: cat as CategoryProgress['category'],
      label: categoryLabels[cat] ?? cat,
      answered: c.answered,
      total: c.total,
    }));
  };

  const answeredIds = new Set<string>();
  let budgetNoticeEmitted = false;
  let draftNowConsumed = false;
  const questionnairePayoffHistory = await loadQuestionnairePayoffHistory(state.session_id);
  let dedupeNoticeEmitted = false;
  const useBatchPositioningQuestionnaire = workflowModePolicy.positioning.useBatchQuestionnaire
    && isQuestionnaireEnabled('positioning_batch');

  if (useBatchPositioningQuestionnaire) {
    emit({
      type: 'transparency',
      stage: 'positioning',
      message: workflowMode === 'fast_draft'
        ? 'Fast Draft mode: collecting a short batch of high-impact questions at a time.'
        : 'Balanced mode: using batched questions to reduce back-and-forth while preserving strong evidence capture.',
    });

    const questionPool = Number.isFinite(effectiveMaxQuestions)
      ? questions.slice(0, Math.max(0, Math.floor(effectiveMaxQuestions)))
      : questions;
    if (!budgetNoticeEmitted && workflowMode && workflowMode !== 'deep_dive' && questionPool.length < questions.length) {
      budgetNoticeEmitted = true;
      emit({
        type: 'transparency',
        stage: 'positioning',
        message: workflowMode === 'fast_draft'
          ? `Fast Draft mode is using the top ${questionPool.length} interview questions for your evidence target (${minimumEvidenceTarget}).`
          : `Balanced mode is using the top ${questionPool.length} interview questions for your evidence target (${minimumEvidenceTarget}).`,
      });
    }

    let batchNumber = 0;
    for (let start = 0; start < questionPool.length; start += workflowModePolicy.positioning.batchSize) {
      await refreshPositioningPreferences();
      if (await applyLatestBenchmarkAssumptionsIfNeeded(state, emit, log)) {
        emit({
          type: 'transparency',
          stage: 'positioning',
          message: 'Benchmark assumptions changed during the interview. Ending the interview early and continuing with the updated benchmark.',
        });
        break;
      }
      if (await hasDraftNowRequest(config.session_id)) {
        draftNowConsumed = true;
        emit({
          type: 'transparency',
          stage: 'positioning',
          message: 'Draft-now was requested. Finishing the interview early and synthesizing your positioning profile from current evidence.',
        });
        break;
      }

      const batch = questionPool.slice(start, start + workflowModePolicy.positioning.batchSize);
      if (batch.length === 0) break;
      batchNumber++;
      const questionnaireQuestionsRaw = buildPositioningBatchQuestions(batch, workflowMode, {
        benchmarkEditVersion: state.benchmark_override_version ?? null,
      });
      const {
        questions: questionnaireQuestions,
        skippedCount: skippedPriorPrompts,
        skippedQuestions: skippedPositioningQuestions,
        reuseStats: positioningReuseStats,
      } = filterQuestionnaireQuestionsByPayoffHistory(questionnaireQuestionsRaw, questionnairePayoffHistory, {
        questionnaireStage: 'positioning',
        currentBenchmarkEditVersion: state.benchmark_override_version ?? null,
      });
      if (skippedPriorPrompts > 0 && !dedupeNoticeEmitted) {
        emitQuestionnaireReuseSummary(
          emit,
          'positioning',
          'positioning_batch',
          skippedPositioningQuestions,
          state.benchmark_override_version ?? null,
          positioningReuseStats,
        );
        dedupeNoticeEmitted = true;
        emit({
          type: 'transparency',
          stage: 'positioning',
          message: `Reusing prior interview answers for ${skippedPriorPrompts} lower-impact question${skippedPriorPrompts === 1 ? '' : 's'} from this session, so the next batches focus on higher-value evidence.`,
        });
      }
      const positioningReuseSubtitleNote = buildQuestionnaireReuseSubtitleNote(skippedPositioningQuestions);
      if (questionnaireQuestions.length === 0) {
        continue;
      }
      const batchTitle = batchNumber === 1
        ? 'Step 3 of 7: Why Me Positioning'
        : `Step 3 of 7: Why Me Positioning (Batch ${batchNumber})`;
      const batchSubtitle = workflowMode === 'fast_draft'
        ? 'Answer briefly where you can. Select a suggestion, add details, or skip anything non-critical. We are building the evidence library for the draft.'
        : 'Select the closest option, then add details where helpful. Metrics and scope make the final resume stronger and improve the gap map.';
      const finalBatchSubtitle = [batchSubtitle, positioningReuseSubtitleNote].filter(Boolean).join(' ');

      let submission: QuestionnaireSubmission | null;
      try {
        submission = await runQuestionnaire(
          'positioning_batch',
          `positioning_batch_${batchNumber}`,
          batchTitle,
          questionnaireQuestions,
          emit,
          waitForUser,
          finalBatchSubtitle,
        );
      } catch (gateErr) {
        const errMsg = gateErr instanceof Error ? gateErr.message : String(gateErr);
        if (errMsg.includes('Gate superseded')) {
          log.warn({ batch: batchNumber }, 'Positioning questionnaire batch superseded — continuing');
          continue;
        }
        throw gateErr;
      }

      if (!submission) {
        continue;
      }

      if (isDraftNowQuestionnaireSubmission(submission) || (await hasDraftNowRequest(config.session_id))) {
        draftNowConsumed = true;
        emit({
          type: 'transparency',
          stage: 'positioning',
          message: 'Draft-now was requested during a batched questionnaire. Moving on with the strongest evidence collected so far.',
        });
        break;
      }

      const batchAnswers = collectPositioningAnswersFromQuestionnaire(submission, questionnaireQuestions);
      for (const answer of batchAnswers) {
        answers.push(answer);
        answeredIds.add(answer.question_id);
      }
    }
  } else {
    let previousEncouragingText: string | undefined;
    let followUpCount = 0;
    for (const question of questions) {
      await refreshPositioningPreferences();
      if (await applyLatestBenchmarkAssumptionsIfNeeded(state, emit, log)) {
        emit({
          type: 'transparency',
          stage: 'positioning',
          message: 'Benchmark assumptions changed during the interview. Ending the interview early and continuing with the updated benchmark.',
        });
        break;
      }
      if (await hasDraftNowRequest(config.session_id)) {
        draftNowConsumed = true;
        emit({
          type: 'transparency',
          stage: 'positioning',
          message: 'Draft-now was requested. Finishing the interview early and synthesizing your positioning profile from current evidence.',
        });
        break;
      }
      if (Number.isFinite(effectiveMaxQuestions) && answeredIds.size >= effectiveMaxQuestions) {
        if (!budgetNoticeEmitted && workflowMode && workflowMode !== 'deep_dive') {
          budgetNoticeEmitted = true;
          emit({
            type: 'transparency',
            stage: 'positioning',
            message: workflowMode === 'fast_draft'
              ? `Fast Draft mode reached its interview budget for your evidence target (${minimumEvidenceTarget}). Moving on to synthesize your positioning profile from the strongest answers so far.`
              : `Balanced mode reached its interview budget for your evidence target (${minimumEvidenceTarget}). Moving on to synthesize your positioning profile from the answers collected so far.`,
          });
        }
        break;
      }

      const catProgress = buildCategoryProgress(answeredIds);
      emit({
        type: 'positioning_question',
        question: {
          ...question,
          encouraging_text: previousEncouragingText,
        },
        questions_total: questions.length,
        category_progress: catProgress,
      });

      let response: { answer: string; selected_suggestion?: string };
      try {
        response = await waitForUser<{ answer: string; selected_suggestion?: string }>(
          `positioning_q_${question.id}`,
        );
      } catch (gateErr) {
        const errMsg = gateErr instanceof Error ? gateErr.message : String(gateErr);
        if (errMsg.includes('Gate superseded')) {
          log.warn({ question_id: question.id }, 'Positioning gate superseded — skipping question');
          continue;
        }
        throw gateErr;
      }

      if (isDraftNowGateResponse(response)) {
        emit({
          type: 'transparency',
          stage: 'positioning',
          message: 'Draft-now was requested during the interview. Moving on with the answers collected so far.',
        });
        break;
      }

      // Tag answers where user selected a suggestion without providing custom text,
      // so the synthesis LLM knows this is a suggested value rather than user-authored.
      const taggedAnswer = tagPositioningAnswer(response.answer, response.selected_suggestion);
      answers.push({
        question_id: question.id,
        answer: taggedAnswer,
        selected_suggestion: response.selected_suggestion,
      });
      answeredIds.add(question.id);
      previousEncouragingText = question.encouraging_text;

      // Evaluate follow-up triggers (max 1 follow-up per question, capped globally)
      if (followUpCount < positioningBudget.maxFollowUps) {
        const followUp = evaluateFollowUp(question, response.answer);
        if (followUp) {
          followUpCount++;
          const followUpQuestion: PositioningQuestion = {
            ...followUp,
            question_number: question.question_number,
            is_follow_up: true,
            parent_question_id: question.id,
          };

          emit({
            type: 'positioning_question',
            question: followUpQuestion,
            questions_total: questions.length,
            category_progress: buildCategoryProgress(answeredIds),
          });

          let followUpResponse: { answer: string; selected_suggestion?: string };
          try {
            followUpResponse = await waitForUser<{ answer: string; selected_suggestion?: string }>(
              `positioning_q_${followUpQuestion.id}`,
            );
          } catch (gateErr) {
            const errMsg = gateErr instanceof Error ? gateErr.message : String(gateErr);
            if (errMsg.includes('Gate superseded')) {
              log.warn({ question_id: followUpQuestion.id }, 'Follow-up gate superseded — skipping follow-up');
              continue;
            }
            throw gateErr;
          }

          if (isDraftNowGateResponse(followUpResponse)) {
            emit({
              type: 'transparency',
              stage: 'positioning',
              message: 'Draft-now was requested during a follow-up question. Moving on with current evidence.',
            });
            break;
          }

          const taggedFollowUpAnswer = tagPositioningAnswer(followUpResponse.answer, followUpResponse.selected_suggestion);
          answers.push({
            question_id: followUpQuestion.id,
            answer: taggedFollowUpAnswer,
            selected_suggestion: followUpResponse.selected_suggestion,
          });
        }
      }
    }
  }

  await applyLatestBenchmarkAssumptionsIfNeeded(state, emit, log);

  // Clear the draft-now flag after consumption so reruns don't re-trigger it
  if (draftNowConsumed) {
    await supabaseAdmin
      .from('session_question_responses')
      .update({ status: 'skipped', updated_at: new Date().toISOString() })
      .eq('session_id', config.session_id)
      .eq('question_id', '__generate_draft_now__');
  }

  // Synthesize the profile (research-aware when available)
  emit({ type: 'transparency', message: 'Synthesizing your positioning profile...', stage: 'positioning' });
  const profile = await withRetry(
    () => synthesizeProfile(state.intake!, answers, state.research ?? undefined, {
      workflow_mode: state.user_preferences?.workflow_mode,
      minimum_evidence_target: state.user_preferences?.minimum_evidence_target,
    }),
    { maxAttempts: 3, baseDelay: 2000, onRetry: (attempt, error) => log.warn({ attempt, error: error.message }, 'synthesizeProfile retry') },
  );

  // Save to database
  const currentVersion = Number.isFinite((existingProfile as { version?: unknown } | null)?.version as number)
    ? Number((existingProfile as { version?: number }).version)
    : 0;
  const { data: saved, error: saveError } = await supabaseAdmin
    .from('user_positioning_profiles')
    .upsert({
      user_id: config.user_id,
      positioning_data: profile,
      version: currentVersion + 1,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select('id')
    .single();

  if (saveError) {
    log.warn({ error: saveError.message }, 'Failed to persist positioning profile — continuing without saved profile');
  }
  if (saved) {
    state.positioning_profile_id = saved.id;
  }
  log.info({ capabilities: profile.top_capabilities.length, evidence: profile.evidence_library.length }, 'Positioning complete');

  return profile;
}

// ─── Section call builder ────────────────────────────────────────────

function buildSectionCalls(
  blueprint: ArchitectOutput,
  resume: IntakeOutput,
  positioning: PositioningProfile,
): Array<{ section: string; blueprint_slice: Record<string, unknown>; evidence_sources: Record<string, unknown>; global_rules: ArchitectOutput['global_rules'] }> {
  const calls: Array<{ section: string; blueprint_slice: Record<string, unknown>; evidence_sources: Record<string, unknown>; global_rules: ArchitectOutput['global_rules'] }> = [];

  for (const section of blueprint.section_plan.order) {
    if (section === 'header') continue; // Header is built from contact info, no LLM needed

    // Expand "experience" into one call per role from the blueprint
    if (section === 'experience') {
      // Guardrail: never generate more role calls than parsed intake experience.
      // If architect omitted roles unexpectedly, fall back to intake role count so
      // experience content still gets drafted/reviewed instead of disappearing.
      const blueprintRoleCount = blueprint.experience_blueprint.roles.length;
      const roleCount = blueprintRoleCount > 0
        ? Math.min(blueprintRoleCount, resume.experience.length)
        : resume.experience.length;
      for (let i = 0; i < roleCount; i++) {
        const roleSection = `experience_role_${i}`;
        calls.push({
          section: roleSection,
          blueprint_slice: getSectionBlueprint(roleSection, blueprint),
          evidence_sources: getSectionEvidence(roleSection, blueprint, resume, positioning),
          global_rules: blueprint.global_rules,
        });
      }
      // Earlier career as a separate section if included — but skip if ALL original
      // resume roles are already individually expanded (prevents duplicate entries).
      if (blueprint.experience_blueprint.earlier_career?.include && roleCount < resume.experience.length) {
        calls.push({
          section: 'earlier_career',
          blueprint_slice: {
            earlier_career: blueprint.experience_blueprint.earlier_career,
          },
          evidence_sources: getSectionEvidence('earlier_career', blueprint, resume, positioning),
          global_rules: blueprint.global_rules,
        });
      }
      continue;
    }

    const blueprintSlice = getSectionBlueprint(section, blueprint);
    const evidenceSources = getSectionEvidence(section, blueprint, resume, positioning);

    calls.push({
      section,
      blueprint_slice: blueprintSlice,
      evidence_sources: evidenceSources,
      global_rules: blueprint.global_rules,
    });
  }

  return calls;
}

function getSectionBlueprint(section: string, blueprint: ArchitectOutput): Record<string, unknown> {
  switch (section) {
    case 'summary':
      return blueprint.summary_blueprint as unknown as Record<string, unknown>;
    case 'selected_accomplishments':
      return { accomplishments: blueprint.evidence_allocation.selected_accomplishments };
    case 'skills':
      return blueprint.skills_blueprint as unknown as Record<string, unknown>;
    case 'education_and_certifications':
      return { age_protection: blueprint.age_protection };
    default:
      if (section.startsWith('experience')) {
        // Map "experience" to all role slices; "experience_role_N" to a single role.
        if (section === 'experience') {
          return {
            roles: blueprint.experience_blueprint.roles,
            experience_instructions: blueprint.evidence_allocation.experience_section,
            keyword_targets: blueprint.keyword_map,
          };
        }
        const roleKey = section.replace('experience_', '');
        const roleIndex = parseInt(roleKey.replace('role_', ''), 10);
        return {
          role: blueprint.evidence_allocation.experience_section[roleKey] ?? {},
          role_meta: blueprint.experience_blueprint.roles[roleIndex] ?? blueprint.experience_blueprint.roles[0] ?? {},
          keyword_targets: blueprint.keyword_map,
        };
      }
      return {};
  }
}

function getSectionEvidence(
  section: string,
  blueprint: ArchitectOutput,
  resume: IntakeOutput,
  positioning: PositioningProfile,
): Record<string, unknown> {
  // Minimal shared context — only keyword targets (needed everywhere for density)
  const keywordTargets = blueprint.keyword_map;

  if (section === 'summary') {
    return {
      authentic_phrases: positioning.authentic_phrases.slice(0, 8),
      career_arc: positioning.career_arc,
      top_capabilities: positioning.top_capabilities.slice(0, 6),
      keyword_targets: keywordTargets,
      evidence_library: positioning.evidence_library.slice(0, 10),
      original_summary: resume.summary,
    };
  }

  if (section === 'selected_accomplishments') {
    // Only the allocated accomplishments + evidence they reference
    const allocated = blueprint.evidence_allocation.selected_accomplishments ?? [];
    const allocatedIds = new Set(allocated.map(a => a.evidence_id));
    const relevantEvidence = positioning.evidence_library.filter(e => e.id && allocatedIds.has(e.id));
    return {
      keyword_targets: keywordTargets,
      top_capabilities: positioning.top_capabilities.slice(0, 4),
      accomplishments_target: allocated,
      evidence_library: relevantEvidence.length > 0 ? relevantEvidence : positioning.evidence_library.slice(0, 8),
    };
  }

  if (section === 'skills') {
    return {
      keyword_targets: keywordTargets,
      original_skills: resume.skills,
      skills_blueprint: blueprint.skills_blueprint,
    };
  }

  if (section === 'education_and_certifications') {
    return {
      original_education: resume.education,
      original_certifications: resume.certifications,
      age_protection: blueprint.age_protection,
    };
  }

  if (section.startsWith('experience_role_')) {
    const roleKey = section.replace('experience_', '');
    const roleAllocation = blueprint.evidence_allocation.experience_section[roleKey] ?? {};
    // Only include evidence items referenced by this role's bullet instructions
    const bulletSources = new Set(
      ((roleAllocation as Record<string, unknown>).bullets_to_write as Array<{ evidence_source?: string }> ?? [])
        .map(b => b.evidence_source).filter(Boolean)
    );
    const roleEvidence = positioning.evidence_library.filter(e => e.id && bulletSources.has(e.id));
    return {
      keyword_targets: keywordTargets,
      role_key: roleKey,
      role_blueprint: roleAllocation,
      role_source: resume.experience.find((_, idx) => `role_${idx}` === roleKey) ?? null,
      evidence_library: roleEvidence.length > 0 ? roleEvidence : positioning.evidence_library.slice(0, 6),
      authentic_phrases: positioning.authentic_phrases.slice(0, 4),
    };
  }

  if (section === 'earlier_career') {
    return {
      earlier_career: blueprint.experience_blueprint.earlier_career,
      original_experience: resume.experience,
    };
  }

  // Fallback for any unknown section
  return {
    keyword_targets: keywordTargets,
    evidence_library: positioning.evidence_library.slice(0, 6),
  };
}

// ─── Section context helpers ─────────────────────────────────────────

function filterEvidenceForSection(
  section: string,
  blueprint: ArchitectOutput,
  positioning: PositioningProfile,
): Array<{
  id: string;
  situation: string;
  action: string;
  result: string;
  metrics_defensible: boolean;
  user_validated: boolean;
  mapped_requirements: string[];
  scope_metrics: Record<string, string>;
}> {
  let relevant: EvidenceItem[] = [];

  if (section === 'summary' || section === 'selected_accomplishments') {
    const allocated = blueprint.evidence_allocation.selected_accomplishments ?? [];
    const allocatedIds = new Set(allocated.map(a => a.evidence_id));
    relevant = positioning.evidence_library.filter(e => e.id && allocatedIds.has(e.id));
    if (relevant.length === 0) {
      relevant = positioning.evidence_library.slice(0, 10);
    }
  } else if (section.startsWith('experience_role_')) {
    const roleKey = section.replace('experience_', '');
    const roleAllocation = blueprint.evidence_allocation.experience_section[roleKey] ?? {};
    const bulletSources = new Set(
      ((roleAllocation as Record<string, unknown>).bullets_to_write as Array<{ evidence_source?: string }> ?? [])
        .map(b => b.evidence_source).filter(Boolean),
    );
    relevant = positioning.evidence_library.filter(e => e.id && bulletSources.has(e.id));
    if (relevant.length === 0) {
      relevant = positioning.evidence_library.slice(0, 6);
    }
  } else {
    relevant = positioning.evidence_library.slice(0, 6);
  }

  return relevant.map((e, idx) => ({
    id: (e.id && e.id.trim()) ? e.id : `${section}_evidence_${idx + 1}`,
    situation: e.situation,
    action: e.action,
    result: e.result,
    metrics_defensible: e.metrics_defensible,
    user_validated: e.user_validated,
    mapped_requirements: e.mapped_requirements ?? [],
    scope_metrics: {
      ...(e.scope_metrics?.team_size ? { team_size: e.scope_metrics.team_size } : {}),
      ...(e.scope_metrics?.budget ? { budget: e.scope_metrics.budget } : {}),
      ...(e.scope_metrics?.revenue_impact ? { revenue_impact: e.scope_metrics.revenue_impact } : {}),
      ...(e.scope_metrics?.geography ? { geography: e.scope_metrics.geography } : {}),
    },
  }));
}

function buildKeywordStatus(
  _section: string,
  content: string,
  blueprint: ArchitectOutput,
): Array<{ keyword: string; target_density: number; current_count: number }> {
  return Object.entries(blueprint.keyword_map).map(([keyword, target]) => {
    return {
      keyword,
      target_density: target.target_density,
      current_count: countKeywordOccurrences(keyword, content),
    };
  });
}

function countKeywordOccurrences(keyword: string, content: string): number {
  const term = keyword.trim();
  if (!term || !content) return 0;

  const escaped = term
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
  const boundaryPattern = `(^|[^A-Za-z0-9])(${escaped})(?=$|[^A-Za-z0-9])`;
  const regex = new RegExp(boundaryPattern, 'gi');

  let count = 0;
  for (const _ of content.matchAll(regex)) {
    count += 1;
  }
  return count;
}

function buildGapMappingsForSection(
  gapAnalysis: GapAnalystOutput,
): Array<{ requirement: string; classification: 'strong' | 'partial' | 'gap' }> {
  return gapAnalysis.requirements.map(r => ({
    requirement: r.requirement,
    classification: r.classification,
  }));
}

// ─── Resume assembly ─────────────────────────────────────────────────

function assembleResume(
  sections: Record<string, SectionWriterOutput>,
  blueprint: ArchitectOutput,
): string {
  const parts: string[] = [];

  for (const sectionName of blueprint.section_plan.order) {
    if (sectionName === 'experience') {
      // Collect all experience_role_* entries in sorted order
      const roleKeys = Object.keys(sections)
        .filter(k => k.startsWith('experience_role_'))
        .sort(compareExperienceRoleKeys);
      for (const key of roleKeys) {
        parts.push(sections[key].content);
      }
      if (sections['earlier_career']) {
        parts.push(sections['earlier_career'].content);
      }
      continue;
    }

    const section = sections[sectionName];
    if (section) {
      parts.push(section.content);
    }
  }

  return parts.join('\n\n');
}

function mapFindingToSection(
  findingSection: string,
  sections: Record<string, SectionWriterOutput>,
): string | null {
  // Exact match first
  if (sections[findingSection]) return findingSection;
  // Try canonical section names with stable priority: summary → skills → experience
  if (findingSection === 'summary' && sections.summary) return 'summary';
  if (findingSection === 'skills' && sections.skills) return 'skills';
  // Map generic "experience" finding to first experience_role_* section (sorted)
  if (findingSection === 'experience') {
    const roleKey = Object.keys(sections).filter(k => k.startsWith('experience_role_')).sort(compareExperienceRoleKeys)[0];
    if (roleKey) return roleKey;
  }
  // Generic formatting finding: prefer summary, then skills, then first experience role
  if (findingSection === 'formatting') {
    if (sections.summary) return 'summary';
    if (sections.skills) return 'skills';
    const roleKey = Object.keys(sections).filter(k => k.startsWith('experience_role_')).sort(compareExperienceRoleKeys)[0];
    if (roleKey) return roleKey;
    return Object.keys(sections)[0] ?? null;
  }
  return null;
}

function normalizeSectionReviewResponse(
  response: boolean | {
    approved: boolean;
    edited_content?: string;
    feedback?: string;
    refinement_ids?: string[];
    review_token?: string;
    approve_remaining_review_bundle?: boolean;
    approve_remaining_current_bundle?: boolean;
  },
): {
  approved: boolean;
  edited_content?: string;
  feedback?: string;
  refinement_ids?: string[];
  review_token?: string;
  approve_remaining_review_bundle?: boolean;
  approve_remaining_current_bundle?: boolean;
} {
  if (typeof response === 'boolean') {
    // Legacy false path: treat as a request for a generic improvement instead of auto-approving.
    return response
      ? { approved: true }
      : {
          approved: false,
          feedback: 'Improve this section for clarity, impact, and ATS alignment while preserving factual accuracy.',
        };
  }

  const editedContent = response.edited_content?.trim().slice(0, MAX_SECTION_REVIEW_EDITED_CHARS);
  const feedback = response.feedback?.trim().slice(0, MAX_SECTION_REVIEW_FEEDBACK_CHARS);
  const refinementIds = Array.from(
    new Set(
      (response.refinement_ids ?? [])
        .filter((id): id is string => typeof id === 'string')
        .map((id) => id.trim())
        .filter(Boolean)
        .map((id) => id.slice(0, MAX_SECTION_REVIEW_REFINEMENT_ID_CHARS)),
    ),
  ).slice(0, MAX_SECTION_REVIEW_REFINEMENTS);
  const reviewToken = response.review_token?.trim().slice(0, MAX_SECTION_REVIEW_TOKEN_CHARS);

  return {
    approved: Boolean(response.approved),
    edited_content: editedContent ? editedContent : undefined,
    feedback: feedback ? feedback : undefined,
    refinement_ids: refinementIds.length > 0 ? refinementIds : undefined,
    review_token: reviewToken || undefined,
    approve_remaining_review_bundle: response.approve_remaining_review_bundle === true || undefined,
    approve_remaining_current_bundle: response.approve_remaining_current_bundle === true || undefined,
  };
}

/**
 * Build minimal fallback content for a section when the LLM writer fails after all retries.
 * Uses raw intake data so the pipeline can continue with something rather than nothing.
 */
function buildFallbackSectionContent(section: string, intake: IntakeOutput): string {
  if (section === 'summary') {
    return intake.summary ?? '';
  }
  if (section.startsWith('experience_role_')) {
    const idx = parseInt(section.replace('experience_role_', ''), 10);
    const exp = intake.experience[idx];
    if (!exp) return '';
    const bullets = exp.bullets.map(b => `• ${b}`).join('\n');
    return `${exp.title}, ${exp.company}\n${exp.start_date} – ${exp.end_date}\n${bullets}`;
  }
  if (section === 'skills') {
    return intake.skills.join(', ');
  }
  if (section === 'education_and_certifications') {
    const edu = intake.education.map(e => `${e.degree} — ${e.institution}${e.year ? ` (${e.year})` : ''}`).join('\n');
    const certs = intake.certifications.join('\n');
    return [edu, certs].filter(Boolean).join('\n');
  }
  return '';
}

async function withTimeout<T>(
  task: Promise<T>,
  ms: number,
  message: string,
  onTimeout?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          onTimeout?.();
          reject(new Error(message));
        }, ms);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Tag a positioning answer when the user selected a pre-populated suggestion without
 * providing any custom text. This signals to the synthesis LLM that the value is
 * inferred/suggested rather than directly user-authored, so it should be treated
 * with lower confidence when building the evidence library.
 */
function tagPositioningAnswer(answer: string, selectedSuggestion?: string): string {
  if (!selectedSuggestion) return answer;
  const trimmed = answer.trim();
  // If the answer is empty or identical to the selected suggestion label, tag it
  if (!trimmed || trimmed === selectedSuggestion.trim()) {
    return `[Selected suggestion: ${selectedSuggestion}]`;
  }
  return answer;
}

function createConcurrencyLimiter(limit: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  const release = () => {
    active = Math.max(0, active - 1);
    const next = queue.shift();
    if (next) next();
  };

  return async function runLimited<T>(task: () => Promise<T>): Promise<T> {
    if (active >= limit) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active += 1;
    try {
      return await task();
    } finally {
      release();
    }
  };
}

/**
 * Strip leading section title lines that the LLM includes in raw section text.
 * Prevents "PROFESSIONAL SUMMARY" heading duplicating the structured heading.
 */
function stripLeadingSectionTitle(content: string): string {
  const lines = content.split('\n');
  // Remove leading blank lines
  while (lines.length > 0 && !lines[0].trim()) lines.shift();
  if (lines.length === 0) return '';
  const first = lines[0].trim();
  // ALL CAPS heading (e.g. "SELECTED ACCOMPLISHMENTS", "PROFESSIONAL SUMMARY")
  if (/^[A-Z][A-Z &/]+$/.test(first) && first.length > 2) {
    lines.shift();
    while (lines.length > 0 && !lines[0].trim()) lines.shift();
  }
  // Title-case variant (e.g. "Professional Summary", "Selected Accomplishments", "Experience")
  else if (/^(Professional Summary|Selected Accomplishments|Core Competencies|Skills|Education|Certifications|Experience|Professional Experience|Earlier Career)$/i.test(first)) {
    lines.shift();
    while (lines.length > 0 && !lines[0].trim()) lines.shift();
  }
  return lines.join('\n').trim();
}

function normalizeSkills(intakeSkills: string[]): Record<string, string[]> {
  if (!Array.isArray(intakeSkills) || intakeSkills.length === 0) return {};
  return { 'Core Skills': intakeSkills.slice(0, 30) };
}

function compareExperienceRoleKeys(a: string, b: string): number {
  const ai = Number.parseInt(a.replace('experience_role_', ''), 10);
  const bi = Number.parseInt(b.replace('experience_role_', ''), 10);
  if (Number.isNaN(ai) || Number.isNaN(bi)) return a.localeCompare(b);
  return ai - bi;
}

function sanitizeEducationYear(
  rawYear: string | undefined,
  ageProtection: ArchitectOutput['age_protection'] | undefined,
): string {
  const yearText = (rawYear ?? '').trim();
  if (!yearText) return '';
  if (!ageProtection || ageProtection.clean) return yearText;

  const yearMatch = yearText.match(/\b(19|20)\d{2}\b/);
  if (!yearMatch) return yearText;
  const yearToken = yearMatch[0];

  const flaggedYears = new Set<string>();
  for (const flag of ageProtection.flags ?? []) {
    const matches = `${flag.item} ${flag.risk} ${flag.action}`.match(/\b(19|20)\d{2}\b/g) ?? [];
    for (const y of matches) flaggedYears.add(y);
  }

  if (flaggedYears.has(yearToken)) return '';

  // Guardrail from architect rules: hide graduation years 20+ years old.
  const numericYear = Number.parseInt(yearToken, 10);
  if (!Number.isNaN(numericYear) && new Date().getFullYear() - numericYear >= 20) {
    return '';
  }

  return yearText;
}

function parseExperienceRoleForStructuredPayload(
  crafted: string | undefined,
  fallback: IntakeOutput['experience'][number],
): {
  title: string;
  company: string;
  start_date: string;
  end_date: string;
  location: string;
  bullets: Array<{ text: string; source: string }>;
} {
  if (!crafted) {
    return {
      title: fallback.title,
      company: fallback.company,
      start_date: fallback.start_date,
      end_date: fallback.end_date,
      location: '',
      bullets: fallback.bullets.map((b) => ({ text: b, source: 'resume' })),
    };
  }

  // Strip markdown bold/italic from LLM output
  const stripMd = (s: string) => s.replace(/\*\*/g, '').replace(/\*/g, '').replace(/__/g, '');
  const lines = crafted.split('\n').map((l) => stripMd(l.trim())).filter(Boolean);

  // Separate bullet lines from header/body lines
  const bulletLines = lines.filter((l) => /^[•\-*]\s/.test(l));
  const nonBullets = lines.filter((l) => !/^[•\-*]\s/.test(l));

  // Skip section title lines (ALL CAPS like "PROFESSIONAL EXPERIENCE" or mixed-case like "Experience")
  const headerLines = nonBullets.filter((l) => {
    if (/^[A-Z][A-Z &/]+$/.test(l) && l.length > 2) return false;
    if (/^(Experience|Professional Experience|Earlier Career)$/i.test(l)) return false;
    return true;
  });

  let startDate = fallback.start_date;
  let endDate = fallback.end_date;
  let location = '';

  // Match standalone date lines: "2020 – Present", "Jan 2020 – Present", "January 2020 – Dec 2022"
  const DATE_LINE_RE = /^(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+)?\d{4}\s*[–\-]\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+)?\d{4}|(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+)?\d{4}\s*[–\-]\s*(?:Present|Current)$/i;
  const YEAR_EXTRACT_RE = /\b(\d{4})\b/g;

  const dateLine = headerLines.find((l) => DATE_LINE_RE.test(l));
  if (dateLine) {
    const yearMatches = Array.from(dateLine.matchAll(YEAR_EXTRACT_RE)).map(m => m[1]);
    if (yearMatches.length >= 2) {
      startDate = yearMatches[0];
      endDate = yearMatches[1];
    } else if (yearMatches.length === 1) {
      startDate = yearMatches[0];
      const presentMatch = /Present|Current/i.test(dateLine);
      if (presentMatch) endDate = 'Present';
    }
  }

  // Header lines excluding standalone date lines
  const contentHeaders = headerLines.filter((l) => !DATE_LINE_RE.test(l));
  const titleLine = contentHeaders[0] ?? fallback.title;
  const companyLine = contentHeaders[1] ?? '';

  // Extract date from title line if embedded (e.g. "VP Engineering, Company, 2020 – Present")
  const titleDate = titleLine.match(/\b(\d{4})\s*[–\-]\s*(\d{4}|Present|Current)\b/i);
  if (titleDate && startDate === fallback.start_date) {
    startDate = titleDate[1];
    endDate = titleDate[2];
  }

  // Parse company line for location and trailing dates
  let companyParsed = fallback.company;
  if (companyLine) {
    const trailingDate = companyLine.match(/(\d{4})\s*[–\-]\s*(\d{4}|Present|Current)\s*$/i);
    let companyMeta = companyLine;
    if (trailingDate?.index != null) {
      startDate = trailingDate[1];
      endDate = trailingDate[2];
      companyMeta = companyLine
        .slice(0, trailingDate.index)
        .replace(/[|,;•\-]\s*$/, '')
        .trim();
    }

    // Prefer explicit delimiters if present (legacy "|" or ATS-safe ";" / "•")
    const explicitParts = companyMeta
      .split(/\s*\|\s*|\s*;\s*|\s+•\s+/)
      .map((p) => p.trim())
      .filter(Boolean);

    if (explicitParts.length > 0) {
      companyParsed = explicitParts[0];
      if (explicitParts.length > 1) {
        location = explicitParts.slice(1).join(', ');
      }
    } else if (companyMeta) {
      // Fallback for comma-delimited "Company, City, ST" lines
      const commaIdx = companyMeta.indexOf(',');
      if (commaIdx > 0) {
        companyParsed = companyMeta.slice(0, commaIdx).trim();
        const loc = companyMeta.slice(commaIdx + 1).trim();
        if (loc) location = loc;
      } else {
        companyParsed = companyMeta;
      }
    }
  }

  const titleParsed = titleLine
    .replace(/\b\d{4}\s*[–\-]\s*(?:\d{4}|Present|Current)\b/i, '')
    .replace(/\s\|\s/g, ', ')
    .trim() || fallback.title;

  // Parse bullets — LLM may use bullet markers or plain paragraph text
  let parsedBullets = bulletLines
    .map((l) => ({ text: l.replace(/^[•\-*]\s*/, ''), source: 'crafted' }));

  // If no bullet-marked lines, treat remaining content headers (after title/company/date) as bullets
  if (parsedBullets.length === 0) {
    const bodyLines = contentHeaders.slice(2).filter((l) => l.length > 20); // skip short lines
    if (bodyLines.length > 0) {
      parsedBullets = bodyLines.map((l) => ({ text: l, source: 'crafted' }));
    }
  }

  return {
    title: titleParsed,
    company: companyParsed,
    start_date: startDate,
    end_date: endDate,
    location,
    bullets: parsedBullets.length > 0 ? parsedBullets : fallback.bullets.map((b) => ({ text: b, source: 'resume' })),
  };
}

function buildFinalResumePayload(state: PipelineState, config: PipelineConfig): FinalResumePayload {
  const sections = state.sections ?? {};
  const intake = state.intake!;
  const payloadLog = createSessionLogger(state.session_id);
  const sectionOrder = (state.architect?.section_plan.order ?? ['summary', 'experience', 'skills', 'education', 'certifications'])
    .flatMap((s) => {
      if (s === 'education_and_certifications') return ['education', 'certifications'];
      if (s === 'experience') {
        // Expand into actual experience_role_* keys + earlier_career
        const roleKeys = Object.keys(state.sections ?? {})
          .filter(k => k.startsWith('experience_role_'))
          .sort(compareExperienceRoleKeys);
        const keys = roleKeys.length > 0 ? roleKeys : ['experience'];
        if (state.sections?.['earlier_career']) keys.push('earlier_career');
        return keys;
      }
      return [s];
    })
    .filter((s) => s !== 'header');
  const resume: FinalResumePayload = {
    summary: stripLeadingSectionTitle(sections.summary?.content ?? intake.summary ?? ''),
    selected_accomplishments: sections.selected_accomplishments?.content
      ? stripLeadingSectionTitle(sections.selected_accomplishments.content)
      : undefined,
    experience: (() => {
      const craftedRoleKeys = Object.keys(sections)
        .filter(k => k.startsWith('experience_role_'))
        .sort(compareExperienceRoleKeys);
      // Only include roles that were actually crafted; fall back to all intake roles
      // if none were crafted (e.g., pipeline was aborted before section writing).
      if (craftedRoleKeys.length > 0) {
        return craftedRoleKeys.map(key => {
          const idx = parseInt(key.replace('experience_role_', ''), 10);
          const fallbackRole = intake.experience[idx];
          if (!fallbackRole) {
            payloadLog.warn({ section_key: key }, 'Skipping crafted role without matching intake entry');
            return null;
          }
          return parseExperienceRoleForStructuredPayload(sections[key]?.content, fallbackRole);
        }).filter((role): role is ReturnType<typeof parseExperienceRoleForStructuredPayload> => role !== null);
      }
      return intake.experience.map((exp, idx) =>
        parseExperienceRoleForStructuredPayload(sections[`experience_role_${idx}`]?.content, exp),
      );
    })(),
    skills: normalizeSkills(intake.skills),
    education: intake.education.map((edu) => ({
      institution: edu.institution,
      degree: edu.degree,
      field: '',
      year: sanitizeEducationYear(edu.year, state.architect?.age_protection),
    })),
    certifications: intake.certifications.map((cert) => ({
      name: cert,
      issuer: '',
      year: '',
    })),
    ats_score: state.quality_review?.scores.ats_score ?? 0,
    contact_info: intake.contact,
    section_order: sectionOrder,
    company_name: config.company_name,
    job_title: state.research?.jd_analysis.role_title,
    _raw_sections: Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, stripLeadingSectionTitle(v.content)])),
  };

  // Best-effort: parse a skills section output into structured categories when present.
  const skillsText = sections.skills?.content;
  if (skillsText) {
    const parsedSkills: Record<string, string[]> = {};
    for (const line of skillsText.split('\n')) {
      // Strip markdown bold/italic and leading list markers before parsing
      const trimmed = line.trim()
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/__/g, '')
        .replace(/^[-•*]\s*/, '');  // Handle "- Category: skills" and "• Category: skills"
      const idx = trimmed.indexOf(':');
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (!key || !value) continue;
      parsedSkills[key] = value.split(/[,|;\u2022]/).map(s => s.trim()).filter(Boolean);
    }
    if (Object.keys(parsedSkills).length > 0) {
      resume.skills = parsedSkills;
    } else {
      payloadLog.warn('Skills section could not be parsed into categories; falling back to intake skills');
    }
  }

  return resume;
}

// ─── Keyword coverage (deterministic, no LLM) ────────────────────────

const KEYWORD_STOPWORDS = new Set([
  'and', 'or', 'with', 'for', 'the', 'a', 'an', 'to', 'of', 'in', 'on', 'at', 'by',
  'is', 'are', 'as', 'from', 'across', 'within', 'using', 'build', 'develop', 'manage',
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeKeywordTerm(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+/#\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeKeywordTerm(value: string): string[] {
  return normalizeKeywordTerm(value)
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !KEYWORD_STOPWORDS.has(t));
}

function isLikelyKeyword(value: string): boolean {
  const normalized = normalizeKeywordTerm(value);
  if (!normalized) return false;
  if (normalized.length < 3) return false;
  const tokens = tokenizeKeywordTerm(normalized);
  return tokens.length > 0;
}

function computeKeywordCoverage(
  resumeText: string,
  jdKeywords: string[],
  mustHaves: string[] = [],
): {
  found: number;
  strong: number;
  partial: number;
  total: number;
  percentage: number;
  missing: string[];
  high_priority_missing: string[];
} {
  if (!jdKeywords || jdKeywords.length === 0) {
    return {
      found: 0,
      strong: 0,
      partial: 0,
      total: 0,
      percentage: 100,
      missing: [],
      high_priority_missing: [],
    };
  }

  const deduped = new Map<string, string>();
  for (const raw of jdKeywords) {
    const normalized = normalizeKeywordTerm(raw);
    if (!normalized || !isLikelyKeyword(normalized)) continue;
    if (!deduped.has(normalized)) deduped.set(normalized, raw.trim());
  }

  const entries = Array.from(deduped.entries()).map(([normalized, original]) => ({ normalized, original }));
  if (entries.length === 0) {
    return {
      found: 0,
      strong: 0,
      partial: 0,
      total: 0,
      percentage: 100,
      missing: [],
      high_priority_missing: [],
    };
  }

  const mustHaveCorpus = normalizeKeywordTerm(mustHaves.join(' '));
  const resumeNormalized = normalizeKeywordTerm(resumeText);
  const resumeTokens = new Set(tokenizeKeywordTerm(resumeNormalized));

  let strong = 0;
  let partial = 0;
  let weightedFound = 0;
  let totalWeight = 0;
  const missing: string[] = [];
  const highPriorityMissing: string[] = [];

  for (const keyword of entries) {
    const phrasePattern = new RegExp(`\\b${escapeRegExp(keyword.normalized).replace(/\s+/g, '\\s+')}\\b`, 'i');
    const highPriority = mustHaveCorpus.includes(keyword.normalized);
    const weight = highPriority ? 1.4 : 1;
    totalWeight += weight;

    if (phrasePattern.test(resumeNormalized)) {
      strong += 1;
      weightedFound += weight;
      continue;
    }

    const tokens = tokenizeKeywordTerm(keyword.normalized);
    const tokenHits = tokens.filter((t) => resumeTokens.has(t)).length;
    const ratio = tokens.length > 0 ? tokenHits / tokens.length : 0;

    if (ratio >= 0.75 || (tokens.length >= 3 && tokenHits >= 2)) {
      partial += 1;
      weightedFound += weight * 0.6;
      continue;
    }

    missing.push(keyword.original);
    if (highPriority) highPriorityMissing.push(keyword.original);
  }

  const percentage = totalWeight > 0 ? Math.round((weightedFound / totalWeight) * 100) : 100;
  return {
    found: strong + partial,
    strong,
    partial,
    total: entries.length,
    percentage,
    missing,
    high_priority_missing: highPriorityMissing,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function buildOnboardingSummary(intake: IntakeOutput): Record<string, unknown> {
  const experienceYears = Math.max(0, Math.floor(intake.career_span_years ?? 0));
  const companiesCount = intake.experience.length;
  const skillsCount = intake.skills.length;
  const parseWarnings: string[] = [];

  const leadershipRoles = intake.experience.filter(e =>
    /manager|director|vp|vice president|head of|lead|chief|principal|senior/i.test(e.title)
  );
  const leadershipSpan = leadershipRoles.length > 0
    ? (() => {
        const years = leadershipRoles.map(e => parseInt(e.start_date)).filter(y => !isNaN(y));
        if (years.length === 0) return undefined;
        const rawSpan = new Date().getFullYear() - Math.min(...years);
        const span = Math.max(0, Math.min(rawSpan, experienceYears || rawSpan));
        return span > 0 ? `${span}+ years` : undefined;
      })()
    : undefined;

  const rolesMissingDates = intake.experience.filter((e) => !e.start_date || !e.end_date).length;
  const rolesMissingCompanyOrTitle = intake.experience.filter((e) => !e.company?.trim() || !e.title?.trim()).length;
  const rolesWithoutBullets = intake.experience.filter((e) => !Array.isArray(e.bullets) || e.bullets.length === 0).length;
  const educationSparse = intake.education.length > 0 && intake.education.every((ed) => !ed.institution?.trim() && !ed.degree?.trim());

  if (intake.experience.length === 0) {
    parseWarnings.push('No work history was detected from the uploaded resume text.');
  }
  if (rolesMissingDates > 0) {
    parseWarnings.push(`${rolesMissingDates} role${rolesMissingDates === 1 ? '' : 's'} have missing dates; experience totals may be approximate.`);
  }
  if (rolesMissingCompanyOrTitle > 0) {
    parseWarnings.push(`${rolesMissingCompanyOrTitle} role${rolesMissingCompanyOrTitle === 1 ? '' : 's'} are missing a company or title.`);
  }
  if (rolesWithoutBullets > 0) {
    parseWarnings.push(`${rolesWithoutBullets} role${rolesWithoutBullets === 1 ? '' : 's'} have no parsed bullets, which can weaken evidence extraction.`);
  }
  if (educationSparse) {
    parseWarnings.push('Education details were only partially parsed.');
  }

  const parseConfidence: 'high' | 'medium' | 'low' = parseWarnings.length === 0
    ? 'high'
    : (parseWarnings.length <= 2 ? 'medium' : 'low');

  return {
    years_of_experience: experienceYears,
    companies_count: companiesCount,
    skills_count: skillsCount,
    leadership_span: leadershipSpan,
    parse_confidence: parseConfidence,
    parse_warnings: parseWarnings,
    strengths: intake.experience.slice(0, 3).map(e => `${e.title} at ${e.company}`),
  };
}

async function persistSession(
  state: PipelineState,
  finalResume?: FinalResumePayload,
  emit?: PipelineEmitter,
): Promise<void> {
  try {
    await supabaseAdmin
      .from('coach_sessions')
      .update({
      status: 'completed',
      input_tokens_used: state.token_usage.input_tokens,
      output_tokens_used: state.token_usage.output_tokens,
      estimated_cost_usd: state.token_usage.estimated_cost_usd,
      positioning_profile_id: state.positioning_profile_id,
      // Persist panel state so SSE restore can provide resume after reconnect
      last_panel_type: 'completion',
      last_panel_data: finalResume ? { resume: finalResume } : undefined,
      })
      .eq('id', state.session_id)
      .eq('user_id', state.user_id);
  } catch (err) {
    // Non-critical — log but don't fail the pipeline
    const errMsg = err instanceof Error ? err.message : String(err);
    createSessionLogger(state.session_id).warn({ error: errMsg }, 'persistSession failed');
    // Notify the user so they know to export immediately before the session closes
    emit?.({
      type: 'transparency',
      stage: 'complete',
      message: 'Note: Your session could not be saved to the database. Please export your resume now to avoid losing it.',
    });
  }
}
