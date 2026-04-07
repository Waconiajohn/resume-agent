import { z } from 'zod';
import type { CareerProfileV2 } from '../lib/career-profile-context.js';
import type { V2PipelineSSEEvent, V2PipelineStage, FeedbackMetadata } from '../agents/resume-v2/types.js';
import {
  buildRequirementClarifyingQuestion,
  buildRequirementProofAction,
  getRequirementCoachingPolicySnapshot,
  isGenericClarifyingQuestion,
} from '../contracts/requirement-coaching-policy.js';

export const startSchema = z.object({
  resume_text: z.string().min(50, 'Resume must be at least 50 characters').max(50000, 'Resume must be at most 50,000 characters'),
  job_description: z.string().min(50, 'Job description must be at least 50 characters').max(50000, 'Job description must be at most 50,000 characters'),
  user_context: z.string().optional(),
  gap_coaching_responses: z.array(z.object({
    requirement: z.string().min(1),
    action: z.enum(['approve', 'context', 'skip']),
    user_context: z.string().optional(),
    target_section: z.enum(['auto', 'summary', 'competencies', 'accomplishments', 'experience']).optional(),
    target_company: z.string().optional(),
  })).optional(),
  pre_scores: z.object({
    ats_match: z.number().int().min(0).max(100),
    keywords_found: z.array(z.string()),
    keywords_missing: z.array(z.string()),
    keyword_match_score: z.number().int().min(0).max(100).optional(),
    job_requirement_coverage_score: z.number().int().min(0).max(100).optional(),
    overall_fit_score: z.number().int().min(0).max(100).optional(),
  }).optional(),
});

export const EDIT_ACTIONS = ['strengthen', 'add_metrics', 'shorten', 'add_keywords', 'rewrite', 'custom', 'not_my_voice'] as const;
export type EditAction = typeof EDIT_ACTIONS[number];

const editContextSchema = z.object({
  requirement: z.string().optional(),
  evidence: z.array(z.string()).optional(),
  strategy: z.string().optional(),
}).optional();

export const editSchema = z.object({
  action: z.enum(EDIT_ACTIONS),
  selected_text: z.string().min(5, 'Selected text must be at least 5 characters'),
  section: z.string().min(1, 'Section is required'),
  full_resume_context: z.string().min(1, 'Full resume context is required'),
  job_description: z.string().min(1, 'Job description is required'),
  custom_instruction: z.string().optional(),
  working_draft: z.string().min(5).max(5000).optional(),
  section_context: z.string().optional(),
  edit_context: editContextSchema,
});

export type StoredV2PipelineData = {
  stage: V2PipelineStage;
  jobIntelligence: unknown | null;
  candidateIntelligence: unknown | null;
  benchmarkCandidate: unknown | null;
  gapAnalysis: unknown | null;
  requirementWorkItems?: unknown[] | null;
  gapCoachingCards: unknown[] | null;
  preScores: unknown | null;
  narrativeStrategy: unknown | null;
  resumeDraft: unknown | null;
  assembly: unknown | null;
  /** Feedback loop instrumentation — populated at pipeline completion */
  feedbackMetadata: FeedbackMetadata | null;
  error: string | null;
  stageMessages: Array<{
    stage: V2PipelineStage;
    message: string;
    type: 'start' | 'complete';
    duration_ms?: number;
  }>;
};

export type StoredV2Snapshot = {
  version: 'v2';
  pipeline_data: StoredV2PipelineData;
  inputs: {
    resume_text: string;
    job_description: string;
  };
  draft_state: unknown | null;
  updated_at: string;
};

function createInitialPipelineData(): StoredV2PipelineData {
  return {
    stage: 'intake',
    jobIntelligence: null,
    candidateIntelligence: null,
    benchmarkCandidate: null,
    gapAnalysis: null,
    requirementWorkItems: null,
    gapCoachingCards: null,
    preScores: null,
    narrativeStrategy: null,
    resumeDraft: null,
    assembly: null,
    feedbackMetadata: null,
    error: null,
    stageMessages: [],
  };
}

export function createInitialSnapshot(resumeText: string, jobDescription: string): StoredV2Snapshot {
  return {
    version: 'v2',
    pipeline_data: createInitialPipelineData(),
    inputs: {
      resume_text: resumeText,
      job_description: jobDescription,
    },
    draft_state: null,
    updated_at: new Date().toISOString(),
  };
}

function withRequirementCoachingPolicy<T extends { requirement?: unknown; strategy?: unknown }>(value: T): T {
  if (typeof value.requirement !== 'string' || !value.requirement.trim()) {
    return value;
  }

  const strategy = value.strategy;
  if (!strategy || typeof strategy !== 'object') {
    return value;
  }

  if ('coaching_policy' in strategy && strategy.coaching_policy && typeof strategy.coaching_policy === 'object') {
    return value;
  }

  return {
    ...value,
    strategy: {
      ...strategy,
      coaching_policy: getRequirementCoachingPolicySnapshot(value.requirement),
    },
  };
}

function enrichGapAnalysisForClient(gapAnalysis: unknown): unknown {
  if (!gapAnalysis || typeof gapAnalysis !== 'object') {
    return gapAnalysis;
  }

  const record = gapAnalysis as Record<string, unknown>;
  const requirements = Array.isArray(record.requirements)
    ? record.requirements.map((requirement) => (
      requirement && typeof requirement === 'object'
        ? withRequirementCoachingPolicy(requirement as {
            requirement?: unknown;
            strategy?: unknown;
          })
        : requirement
    ))
    : record.requirements;

  const pendingStrategies = Array.isArray(record.pending_strategies)
    ? record.pending_strategies.map((item) => (
      item && typeof item === 'object'
        ? withRequirementCoachingPolicy(item as {
            requirement?: unknown;
            strategy?: unknown;
          })
        : item
    ))
    : record.pending_strategies;

  return {
    ...record,
    requirements,
    pending_strategies: pendingStrategies,
  };
}

function enrichGapCoachingCardsForClient(cards: unknown): unknown {
  if (!Array.isArray(cards)) {
    return cards;
  }

  return cards.map((card) => {
    if (!card || typeof card !== 'object') {
      return card;
    }

    const record = card as Record<string, unknown>;
    const requirement = typeof record.requirement === 'string' ? record.requirement.trim() : '';
    const coachingPolicy = record.coaching_policy;

    if (!requirement || (coachingPolicy && typeof coachingPolicy === 'object')) {
      return card;
    }

    return {
      ...record,
      coaching_policy: getRequirementCoachingPolicySnapshot(requirement),
    };
  });
}

export function enrichStoredPipelineDataForClient(pipelineData: StoredV2PipelineData): StoredV2PipelineData {
  return {
    ...pipelineData,
    gapAnalysis: enrichGapAnalysisForClient(pipelineData.gapAnalysis),
    requirementWorkItems: Array.isArray(pipelineData.requirementWorkItems)
      ? pipelineData.requirementWorkItems
      : Array.isArray((pipelineData.gapAnalysis as Record<string, unknown> | null | undefined)?.requirement_work_items)
        ? ((pipelineData.gapAnalysis as Record<string, unknown>).requirement_work_items as unknown[])
        : null,
    gapCoachingCards: enrichGapCoachingCardsForClient(pipelineData.gapCoachingCards) as unknown[] | null,
  };
}

function stabilizeStoredFinalReviewResultForClient(
  result: unknown,
  options?: { resumeText?: string; gapAnalysis?: unknown },
): unknown {
  if (!result || typeof result !== 'object') {
    return result;
  }

  const parsed = finalReviewResultSchema.safeParse(result);
  if (!parsed.success) {
    return result;
  }

  return stabilizeFinalReviewResult(parsed.data, {
    resumeText: options?.resumeText,
    hardRequirementRisks: extractHardRequirementRisksFromGapAnalysis(options?.gapAnalysis),
    materialJobFitRisks: extractMaterialJobFitRisksFromGapAnalysis(options?.gapAnalysis),
  });
}

export function enrichStoredDraftStateForClient(
  draftState: unknown,
  options?: { resumeText?: string; gapAnalysis?: unknown },
): unknown {
  if (!draftState || typeof draftState !== 'object') {
    return draftState;
  }

  const record = draftState as Record<string, unknown>;
  const finalReviewState = record.final_review_state;
  if (!finalReviewState || typeof finalReviewState !== 'object') {
    return draftState;
  }

  const finalReviewRecord = finalReviewState as Record<string, unknown>;
  const reviewedResumeText = typeof finalReviewRecord.reviewed_resume_text === 'string'
    && finalReviewRecord.reviewed_resume_text.trim().length > 0
    ? finalReviewRecord.reviewed_resume_text
    : options?.resumeText;

  const enrichedResult = stabilizeStoredFinalReviewResultForClient(finalReviewRecord.result, {
    resumeText: reviewedResumeText,
    gapAnalysis: options?.gapAnalysis,
  });

  if (enrichedResult === finalReviewRecord.result) {
    return draftState;
  }

  return {
    ...record,
    final_review_state: {
      ...finalReviewRecord,
      result: enrichedResult,
    },
  };
}

export function applyEventToSnapshot(snapshot: StoredV2Snapshot, event: V2PipelineSSEEvent): {
  pipelineStatus?: 'running' | 'complete' | 'error';
  pipelineStage?: V2PipelineStage;
} {
  const pipelineData = snapshot.pipeline_data;

  switch (event.type) {
    case 'stage_start':
      pipelineData.stage = event.stage;
      pipelineData.stageMessages.push({
        stage: event.stage,
        message: event.message,
        type: 'start',
      });
      break;

    case 'stage_complete':
      pipelineData.stageMessages.push({
        stage: event.stage,
        message: event.message,
        type: 'complete',
        duration_ms: event.duration_ms,
      });
      break;

    case 'job_intelligence':
      pipelineData.jobIntelligence = event.data;
      break;

    case 'candidate_intelligence':
      pipelineData.candidateIntelligence = event.data;
      break;

    case 'benchmark_candidate':
      pipelineData.benchmarkCandidate = event.data;
      break;

    case 'gap_analysis':
      pipelineData.gapAnalysis = event.data;
      pipelineData.requirementWorkItems = Array.isArray(((event.data as unknown) as Record<string, unknown>).requirement_work_items)
        ? ((((event.data as unknown) as Record<string, unknown>).requirement_work_items) as unknown[])
        : pipelineData.requirementWorkItems;
      break;

    case 'requirement_work_items':
      pipelineData.requirementWorkItems = event.data;
      break;

    case 'pre_scores':
      pipelineData.preScores = event.data;
      break;

    case 'gap_coaching':
      pipelineData.gapCoachingCards = event.data;
      break;

    case 'narrative_strategy':
      pipelineData.narrativeStrategy = event.data;
      break;

    case 'resume_draft':
      pipelineData.resumeDraft = event.data;
      break;

    case 'assembly_complete':
      pipelineData.assembly = event.data;
      break;

    case 'pipeline_complete':
      pipelineData.stage = 'complete';
      pipelineData.error = null;
      return {
        pipelineStatus: 'complete',
        pipelineStage: 'complete',
      };

    case 'pipeline_error':
      pipelineData.stage = event.stage;
      pipelineData.error = event.error;
      return {
        pipelineStatus: 'error',
        pipelineStage: event.stage,
      };

    case 'gap_questions':
    case 'verification_complete':
    case 'transparency':
      break;

    default:
      break;
  }

  return {
    pipelineStatus: 'running',
    pipelineStage: pipelineData.stage,
  };
}

export const gapResponseSchema = z.object({
  responses: z.array(z.object({
    requirement: z.string().min(1),
    action: z.enum(['approve', 'context', 'skip']),
    user_context: z.string().optional(),
    target_section: z.enum(['auto', 'summary', 'competencies', 'accomplishments', 'experience']).optional(),
    target_company: z.string().optional(),
  })),
});

export const draftStateSchema = z.object({
  draft_state: z.object({
    editable_resume: z.unknown().nullable(),
    master_save_mode: z.enum(['session_only', 'master_resume']),
    gap_chat_state: z.object({
      items: z.record(z.string(), z.object({
        messages: z.array(z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string().max(4000),
          suggestedLanguage: z.string().max(4000).optional(),
          followUpQuestion: z.string().max(2000).optional(),
          currentQuestion: z.string().max(2000).optional(),
          needsCandidateInput: z.boolean().optional(),
          recommendedNextAction: z.enum(['answer_question', 'review_edit', 'try_another_angle', 'skip', 'confirm']).optional(),
          candidateInputUsed: z.boolean().optional(),
        })).max(30),
        resolvedLanguage: z.string().max(4000).nullable(),
        error: z.string().max(1000).nullable(),
      })),
    }).nullable().optional(),
    final_review_state: z.object({
      result: z.unknown().nullable(),
      resolved_concern_ids: z.array(z.string()).max(100),
      acknowledged_export_warnings: z.boolean(),
      is_stale: z.boolean().optional(),
      reviewed_resume_text: z.string().max(100_000).nullable().optional(),
      last_run_at: z.string().optional(),
    }).nullable().optional(),
    final_review_chat_state: z.object({
      items: z.record(z.string(), z.object({
        messages: z.array(z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string().max(4000),
          suggestedLanguage: z.string().max(4000).optional(),
          followUpQuestion: z.string().max(2000).optional(),
          currentQuestion: z.string().max(2000).optional(),
          needsCandidateInput: z.boolean().optional(),
          recommendedNextAction: z.enum(['answer_question', 'review_edit', 'try_another_angle', 'skip', 'confirm']).optional(),
          candidateInputUsed: z.boolean().optional(),
        })).max(30),
        resolvedLanguage: z.string().max(4000).nullable(),
        error: z.string().max(1000).nullable(),
      })),
    }).nullable().optional(),
    post_review_polish: z.object({
      status: z.enum(['idle', 'running', 'complete', 'error']),
      message: z.string().max(1000),
      result: z.object({
        ats_score: z.number().int().min(0).max(100),
        keywords_found: z.array(z.string().max(200)).max(100),
        keywords_missing: z.array(z.string().max(200)).max(100),
        top_suggestions: z.array(z.string().max(1000)).max(10),
        tone_score: z.number().int().min(0).max(100),
        tone_findings: z.array(z.string().max(1000)).max(20),
      }).nullable(),
      last_triggered_by_concern_id: z.string().nullable().optional(),
      updated_at: z.string().optional(),
    }).nullable().optional(),
    master_promotion_state: z.object({
      selected_item_ids: z.array(z.string().max(200)).max(500),
    }).nullable().optional(),
    updated_at: z.string(),
  }).nullable(),
});

export function buildEditSystemPrompt(action: EditAction, customInstruction?: string): string {
  const base = `You are an expert executive resume editor. You will receive a selected piece of resume text and must return an improved replacement.

You MUST respond with valid JSON in exactly this format:
{ "replacement": "<your improved text here>" }

Do not include any explanation, preamble, or markdown. Only return the JSON object.

IMPORTANT: Never fabricate achievements, metrics, or claims. Every fact in the replacement must be traceable to the original text or surrounding resume context.

If the user message includes CURRENT WORKING DRAFT TO REPLACE, rewrite that draft directly. Do not explain what you changed. Do not echo editing instructions. Do not output helper language like "tightened," "rewritten," "added proof," or "safer version." Return only the finished resume line.`;

  const instructions: Record<EditAction, string> = {
    strengthen: `Rewrite the selected text to be more impactful. Use stronger action verbs, sharper language, and executive-caliber voice. Eliminate weak qualifiers and passive constructions. Preserve all factual claims. CRITICAL: Do NOT fabricate metrics, percentages, dollar amounts, or team sizes. Only sharpen language and strengthen action verbs. If the original text lacks specific numbers, do not add made-up numbers. Return one finished bullet, not commentary about how you strengthened it.`,
    add_metrics: `Rewrite the selected text as a finished resume bullet that adds one truthful proof detail, metric, scope marker, cadence, or outcome drawn from the provided resume context or evidence. Every added detail must be defensible from the surrounding context. Do NOT invent specific dollar amounts, exact percentages, or precise headcounts that are not supported. Do NOT explain the edit. Return only the revised bullet with the proof woven into it.`,
    shorten: `Compress the selected text to its most essential form. Cut every word that does not carry meaning. Preserve all key accomplishments, metrics, and impact. The result should be tighter and punchier, not thinner.`,
    add_keywords: `Naturally incorporate relevant keywords from the job description into the selected text. The integration must read fluently — never keyword-stuffed. Prioritize keywords that reflect genuine overlap with the candidate's experience. Do NOT change the meaning or add claims not present in the original text.`,
    rewrite: `Completely rewrite the selected text from scratch while preserving all underlying information, accomplishments, and meaning. Aim for cleaner structure, stronger language, and greater readability. Return the rewritten bullet itself, not a description of the rewrite.`,
    custom: `Follow this instruction exactly: ${customInstruction ?? '(no instruction provided)'}`,
    not_my_voice: `Rewrite the selected text to sound more authentic and human. Strip out corporate jargon, buzzwords, and formulaic resume-speak. The revised text should sound like how this specific professional actually talks about their work — direct, specific, and genuine. Return only the revised bullet.`,
  };

  return `${base}\n\n${instructions[action]}`;
}

export const rescoreSchema = z.object({
  resume_text: z.string().min(50, 'Resume text is required'),
  job_description: z.string().min(50, 'Job description is required'),
});

export const polishSchema = z.object({
  resume_text: z.string().min(50, 'Resume text is required'),
  job_description: z.string().min(50, 'Job description is required'),
});

export const integrateKeywordSchema = z.object({
  keyword: z.string().min(1, 'Keyword is required'),
  resume_text: z.string().min(50, 'Resume text is required'),
  job_description: z.string().min(50, 'Job description is required'),
});

const coachingMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(2000),
});

const relatedLineCandidateSchema = z.object({
  id: z.string().min(1).max(200).trim(),
  section: z.string().min(1).max(200).trim(),
  index: z.number().int().min(-1).max(10000),
  line_text: z.string().min(1).max(2000),
  line_kind: z.enum(['bullet', 'summary', 'competency', 'section_summary', 'custom_line']).optional(),
  label: z.string().min(1).max(500),
  requirements: z.array(z.string().max(1000)).max(10).default([]),
  evidence_found: z.string().max(3000).optional(),
  work_item_id: z.string().max(200).optional(),
});

const relatedLineSuggestionSchema = z.object({
  candidate_id: z.string().min(1).max(200).trim(),
  line_text: z.string().min(1).max(2000),
  suggested_resume_language: z.string().min(1).max(3000),
  rationale: z.string().max(1000).optional(),
  requirement: z.string().max(1000).optional(),
});

const coachingPolicySchema = z.object({
  primaryFamily: z.string().nullable(),
  families: z.array(z.string()),
  clarifyingQuestion: z.string().max(2000),
  proofActionRequiresInput: z.string().max(3000),
  proofActionDirect: z.string().max(3000),
  rationale: z.string().max(2000),
  lookingFor: z.string().max(2000),
});

export const gapChatSchema = z.object({
  requirement: z.string().min(1).max(1000).trim(),
  classification: z.enum(['partial', 'missing', 'strong']),
  messages: z.array(coachingMessageSchema).max(20),
  context: z.object({
    evidence: z.array(z.string().max(1000)).max(20),
    current_strategy: z.string().max(2000).optional(),
    ai_reasoning: z.string().max(2000).optional(),
    inferred_metric: z.string().max(500).optional(),
    job_description_excerpt: z.string().max(5000),
    candidate_experience_summary: z.string().max(3000),
    coaching_policy: coachingPolicySchema.optional(),
  }),
});

export const structuredCoachingResponseSchema = z.object({
  response: z.string(),
  suggested_resume_language: z.string().optional(),
  follow_up_question: z.string().optional(),
  current_question: z.string().optional(),
  needs_candidate_input: z.boolean().optional(),
  recommended_next_action: z.enum(['answer_question', 'review_edit', 'try_another_angle', 'skip', 'confirm']).optional(),
  related_line_suggestions: z.array(relatedLineSuggestionSchema).max(3).optional(),
});

export const lineCoachSchema = z.object({
  mode: z.enum(['clarify', 'rewrite', 'quantify', 'reframe', 'final_review_fix']),
  item_id: z.string().min(1).max(200).trim(),
  messages: z.array(coachingMessageSchema).max(20),
  context: z.object({
    work_item_id: z.string().max(200).optional(),
    requirement: z.string().max(1000).optional(),
    classification: z.enum(['partial', 'missing', 'strong']).optional(),
    review_state: z.enum(['supported', 'supported_rewrite', 'strengthen', 'confirm_fit', 'code_red']).optional(),
    requirement_source: z.enum(['job_description', 'benchmark']).optional(),
    evidence: z.array(z.string().max(1000)).max(20).optional(),
    current_strategy: z.string().max(2000).optional(),
    ai_reasoning: z.string().max(2000).optional(),
    inferred_metric: z.string().max(500).optional(),
    job_description_excerpt: z.string().max(5000).optional(),
    candidate_experience_summary: z.string().max(3000).optional(),
    coaching_policy: coachingPolicySchema.optional(),
    source_evidence: z.string().max(5000).optional(),
    line_text: z.string().max(2000).optional(),
    line_kind: z.enum(['bullet', 'summary', 'competency', 'section_summary', 'custom_line']).optional(),
    section_key: z.string().max(200).optional(),
    section_label: z.string().max(500).optional(),
    related_requirements: z.array(z.string().max(1000)).max(10).optional(),
    coaching_goal: z.string().max(2000).optional(),
    clarifying_questions: z.array(z.string().max(2000)).max(5).optional(),
    related_line_candidates: z.array(relatedLineCandidateSchema).max(5).optional(),
    concern_id: z.string().max(200).optional(),
    concern_type: z.enum(['missing_evidence', 'weak_positioning', 'missing_metric', 'unclear_scope', 'benchmark_gap', 'clarity_issue', 'credibility_risk']).optional(),
    severity: z.enum(['critical', 'moderate', 'minor']).optional(),
    observation: z.string().max(2000).optional(),
    why_it_hurts: z.string().max(2000).optional(),
    fix_strategy: z.string().max(3000).optional(),
    requires_candidate_input: z.boolean().optional(),
    clarifying_question: z.string().max(2000).optional(),
    target_section: z.string().max(500).optional(),
    related_requirement: z.string().max(1000).optional(),
    suggested_resume_edit: z.string().max(3000).optional(),
    role_title: z.string().max(500).optional(),
    company_name: z.string().max(500).optional(),
    job_description_fit: z.enum(['strong', 'moderate', 'weak']).optional(),
    benchmark_alignment: z.enum(['strong', 'moderate', 'weak']).optional(),
    business_impact: z.enum(['strong', 'moderate', 'weak']).optional(),
    clarity_and_credibility: z.enum(['strong', 'moderate', 'weak']).optional(),
    resume_excerpt: z.string().max(6000).optional(),
  }),
});

export const finalReviewChatSchema = z.object({
  concern_id: z.string().min(1).max(200).trim(),
  messages: z.array(coachingMessageSchema).max(20),
  context: z.object({
    work_item_id: z.string().max(200).optional(),
    concern_type: z.enum(['missing_evidence', 'weak_positioning', 'missing_metric', 'unclear_scope', 'benchmark_gap', 'clarity_issue', 'credibility_risk']),
    severity: z.enum(['critical', 'moderate', 'minor']),
    observation: z.string().max(2000),
    why_it_hurts: z.string().max(2000),
    fix_strategy: z.string().max(3000),
    requires_candidate_input: z.boolean().optional(),
    clarifying_question: z.string().max(2000).optional(),
    target_section: z.string().max(500).optional(),
    related_requirement: z.string().max(1000).optional(),
    suggested_resume_edit: z.string().max(3000).optional(),
    role_title: z.string().max(500),
    company_name: z.string().max(500),
    job_description_fit: z.enum(['strong', 'moderate', 'weak']).optional(),
    benchmark_alignment: z.enum(['strong', 'moderate', 'weak']).optional(),
    business_impact: z.enum(['strong', 'moderate', 'weak']).optional(),
    clarity_and_credibility: z.enum(['strong', 'moderate', 'weak']).optional(),
    resume_excerpt: z.string().max(6000),
  }),
});

export const hiringManagerReviewSchema = z.object({
  resume_text: z.string().min(50),
  job_description: z.string().min(50),
  company_name: z.string().min(1),
  role_title: z.string().min(1),
  requirements: z.array(z.string()).optional(),
  hidden_signals: z.array(z.string()).optional(),
  benchmark_profile_summary: z.string().optional(),
  benchmark_requirements: z.array(z.string()).optional(),
  job_requirements: z.array(z.string()).optional(),
});

export const finalReviewResultSchema = z.object({
  six_second_scan: z.object({
    decision: z.enum(['continue_reading', 'skip']),
    reason: z.string(),
    top_signals_seen: z.array(z.object({
      signal: z.string(),
      why_it_matters: z.string(),
      visible_in_top_third: z.boolean(),
    })).default([]),
    important_signals_missing: z.array(z.object({
      signal: z.string(),
      why_it_matters: z.string(),
    })).default([]),
  }),
  hiring_manager_verdict: z.object({
    rating: z.enum(['strong_interview_candidate', 'possible_interview', 'needs_improvement', 'likely_rejected']),
    summary: z.string(),
  }),
  fit_assessment: z.object({
    job_description_fit: z.enum(['strong', 'moderate', 'weak']),
    benchmark_alignment: z.enum(['strong', 'moderate', 'weak']),
    business_impact: z.enum(['strong', 'moderate', 'weak']),
    clarity_and_credibility: z.enum(['strong', 'moderate', 'weak']),
  }),
  top_wins: z.array(z.object({
    win: z.string(),
    why_powerful: z.string(),
    aligned_requirement: z.string(),
    prominent_enough: z.boolean(),
    repositioning_recommendation: z.string(),
  })).default([]),
  concerns: z.array(z.object({
    id: z.string().catch('concern'),
    work_item_id: z.string().optional(),
    severity: z.enum(['critical', 'moderate', 'minor']).catch('moderate'),
    type: z.enum(['missing_evidence', 'weak_positioning', 'missing_metric', 'unclear_scope', 'benchmark_gap', 'clarity_issue', 'credibility_risk']).catch('missing_evidence'),
    observation: z.string(),
    why_it_hurts: z.string().catch('This issue weakens interview odds.'),
    target_section: z.string().optional(),
    related_requirement: z.string().optional(),
    fix_strategy: z.string().catch('Review this concern and add truthful supporting proof before export if you have it.'),
    suggested_resume_edit: z.string().optional(),
    requires_candidate_input: z.boolean().default(false),
    clarifying_question: z.string().optional(),
  })).default([]),
  structure_recommendations: z.array(z.object({
    issue: z.string(),
    recommendation: z.string(),
    priority: z.enum(['high', 'medium', 'low']),
  })).default([]),
  benchmark_comparison: z.object({
    advantages_vs_benchmark: z.array(z.string()).default([]),
    gaps_vs_benchmark: z.array(z.string()).default([]),
    reframing_opportunities: z.array(z.string()).default([]),
  }),
  improvement_summary: z.array(z.string()).default([]),
});

export type FinalReviewResult = z.infer<typeof finalReviewResultSchema>;

function normalizeReviewText(value: string): string {
  return value.trim().toLowerCase();
}

function isHardRequirementRequirement(value: string): boolean {
  if (isPreferredOnlyRequirement(value)) return false;
  const normalized = value.toLowerCase();
  const hasRequiredSignal = /\b(required|must have|must-have|minimum|mandatory|screen(?:-| )out|foreign equivalent|years of experience|year experience|minimum of \d+ years)\b/.test(normalized);
  const hasBaselineDegreeSignal = /\b(bachelor'?s|undergraduate|degree in|degree from|foreign equivalent)\b/.test(normalized);
  const hasExperienceThreshold = /\b(years of experience|year experience|minimum of \d+ years|\d+\+?\s+years?)\b/.test(normalized);
  const hasLicenseSignal = /\b(license|licensed|licensure)\b/.test(normalized);
  const hasCertificationSignal = /\b(certification|certified)\b/.test(normalized);
  const hasAdvancedDegreeSignal = /\b(mba|master'?s|phd|doctorate)\b/.test(normalized);

  if (hasCertificationSignal || hasAdvancedDegreeSignal) {
    return hasRequiredSignal;
  }

  return hasBaselineDegreeSignal || hasExperienceThreshold || hasLicenseSignal || hasRequiredSignal;
}

function isPreferredOnlyRequirement(value: string): boolean {
  const normalized = value.toLowerCase();
  const hasPreferredSignal = /\b(preferred|preference|preferred qualification|nice[- ]to[- ]have|bonus|plus)\b/.test(normalized);
  const hasRequiredSignal = /\b(required|must have|must-have|minimum|mandatory|screen(?:-| )out|foreign equivalent|years of experience|year experience|minimum of \d+ years)\b/.test(normalized);
  if (!hasPreferredSignal || hasRequiredSignal) return false;

  const beforePreferred = normalized.split(/\bpreferred\b|\bpreference\b|\bpreferred qualification\b|\bnice[- ]to[- ]have\b|\bbonus\b|\bplus\b/i)[0] ?? normalized;
  const hasMixedHardClauseBeforePreferred = /[;:,]|\bor\b|\band\b/.test(beforePreferred)
    && /\b(bachelor'?s|master'?s|mba|phd|doctorate|degree|certification|certified|license|licensed|licensure|foreign equivalent|\d+\+?\s+years?)\b/.test(beforePreferred);

  return !hasMixedHardClauseBeforePreferred;
}

export function extractHardRequirementRisksFromGapAnalysis(gapAnalysis: unknown): string[] {
  if (!gapAnalysis || typeof gapAnalysis !== 'object') return [];
  const requirements = (gapAnalysis as { requirements?: unknown }).requirements;
  const criticalGaps = (gapAnalysis as { critical_gaps?: unknown }).critical_gaps;

  const parsedRequirements = Array.isArray(requirements)
    ? requirements
      .filter((item): item is { requirement?: unknown; classification?: unknown; source?: unknown } => !!item && typeof item === 'object')
      .map((item) => ({
        requirement: typeof item.requirement === 'string' ? item.requirement.trim() : '',
        classification: typeof item.classification === 'string' ? item.classification : '',
        source: item.source === 'benchmark' ? 'benchmark' : 'job_description',
      }))
      .filter((item) => item.requirement.length > 0)
    : [];

  const strongJobRequirements = parsedRequirements
    .filter((item) => item.source === 'job_description')
    .filter((item) => item.classification === 'strong')
    .map((item) => item.requirement);

  const nonHardRequirementSeeds = parsedRequirements
    .filter((item) => item.source === 'benchmark' || isPreferredOnlyRequirement(item.requirement))
    .map((item) => item.requirement);

  const requirementRisks = parsedRequirements
      .filter((item) => item.source === 'job_description')
      .filter((item) => isHardRequirementRequirement(item.requirement))
      .filter((item) => item.classification !== 'strong')
      .map((item) => canonicalizeHardRequirementRisk(item.requirement));

  const criticalGapRisks = Array.isArray(criticalGaps)
    ? criticalGaps
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .filter((item) => isHardRequirementRequirement(item))
      .map((item) => canonicalizeHardRequirementRisk(item))
      .filter((item) => !isHardRequirementAlreadySatisfied(item, strongJobRequirements))
      .filter((item) => !isRequirementExplainedByNonHardRequirement(item, nonHardRequirementSeeds))
    : [];

  return dedupeNearEquivalentHardRequirementRisks([
    ...requirementRisks,
    ...criticalGapRisks,
  ]);
}

function dedupeNearEquivalentHardRequirementRisks(risks: string[]): string[] {
  const deduped: string[] = [];

  for (const risk of risks) {
    if (!risk) continue;
    if (deduped.some((existing) => areEquivalentHardRequirementRisks(existing, risk))) {
      continue;
    }
    deduped.push(risk);
  }

  return deduped;
}

function areEquivalentHardRequirementRisks(left: string, right: string): boolean {
  const normalizedLeft = normalizeReviewText(left);
  const normalizedRight = normalizeReviewText(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) return true;

  const leftYears = extractYearsThreshold(left);
  const rightYears = extractYearsThreshold(right);
  if (leftYears !== null && rightYears !== null && leftYears === rightYears) {
    const stopTokens = new Set(['years', 'year', 'experience', 'experiences', 'role', 'roles', 'minimum', 'minimums', 'progressive', 'required', 'must', 'have', 'plus', 'over', 'more', 'than']);
    const leftTokens = extractRequirementTokens(normalizedLeft).filter((token) => !stopTokens.has(token));
    const rightTokens = extractRequirementTokens(normalizedRight).filter((token) => !stopTokens.has(token));

    if (leftTokens.length === 0 || rightTokens.length === 0) {
      return true;
    }

    const leftSet = new Set(leftTokens);
    const rightSet = new Set(rightTokens);
    const sharedCount = [...leftSet].filter((token) => rightSet.has(token)).length;
    if (sharedCount >= Math.min(leftSet.size, rightSet.size)) {
      return true;
    }
  }

  const leftIsDegree = /\b(bachelor'?s|master'?s|mba|phd|doctorate|degree|foreign equivalent)\b/.test(normalizedLeft);
  const rightIsDegree = /\b(bachelor'?s|master'?s|mba|phd|doctorate|degree|foreign equivalent)\b/.test(normalizedRight);
  if (!leftIsDegree || !rightIsDegree) return false;

  const stopTokens = new Set(['bachelor', 'bachelors', 'master', 'masters', 'mba', 'phd', 'doctorate', 'degree', 'higher', 'field', 'fields', 'foreign', 'equivalent', 'other', 'related', 'relevant', 'or', 'and']);
  const leftTokens = extractRequirementTokens(normalizedLeft).filter((token) => !stopTokens.has(token));
  const rightTokens = extractRequirementTokens(normalizedRight).filter((token) => !stopTokens.has(token));

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return true;
  }

  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  const sharedCount = [...leftSet].filter((token) => rightSet.has(token)).length;
  return sharedCount >= Math.min(leftSet.size, rightSet.size);
}

function isMaterialMustHaveGapRequirement(value: string): boolean {
  const normalized = value.toLowerCase();
  if (isPreferredOnlyRequirement(normalized)) return false;
  if (isAdministrativeAvailabilityRequirement(normalized)) return false;
  return /\d/.test(normalized)
    || /\b(board|executive presence|p&l|profit and loss|budget|revenue|team|teams|people|organization|portfolio|multi-brand|global|multi-region|dtc|e-?commerce)\b/.test(normalized);
}

function isAdministrativeAvailabilityRequirement(value: string): boolean {
  return /\b(travel|willing(?:ness)? to travel|ability to travel|relocat(?:e|ion)|work authorization|authorized to work|visa|sponsorship|commute|on-?site|onsite|hybrid|remote|shift work|weekend availability|overnight)\b/i.test(value);
}

export function extractMaterialJobFitRisksFromGapAnalysis(gapAnalysis: unknown): string[] {
  if (!gapAnalysis || typeof gapAnalysis !== 'object') return [];
  const requirements = (gapAnalysis as { requirements?: unknown }).requirements;

  const parsedRequirements = Array.isArray(requirements)
    ? requirements
      .filter((item): item is { requirement?: unknown; classification?: unknown; source?: unknown; importance?: unknown } => !!item && typeof item === 'object')
      .map((item) => ({
        requirement: typeof item.requirement === 'string' ? item.requirement.trim() : '',
        classification: typeof item.classification === 'string' ? item.classification : '',
        source: item.source === 'benchmark' ? 'benchmark' : 'job_description',
        importance: item.importance === 'must_have' ? 'must_have' : item.importance === 'important' ? 'important' : 'nice_to_have',
      }))
      .filter((item) => item.requirement.length > 0)
    : [];

  return Array.from(new Set(
    parsedRequirements
      .filter((item) => item.source === 'job_description')
      .filter((item) => item.importance === 'must_have')
      .filter((item) => item.classification !== 'strong')
      .filter((item) => !isHardRequirementRequirement(item.requirement))
      .filter((item) => !isAdministrativeAvailabilityRequirement(item.requirement))
      .filter((item) => item.classification === 'missing' || isMaterialMustHaveGapRequirement(item.requirement))
      .map((item) => item.requirement),
  ));
}

function canonicalizeHardRequirementRisk(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  const segments = trimmed
    .split(/(?=[;:])|(?:\s+-\s+)|(?:\s+\/\s+)/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const primary = segments.find((segment) => !isPreferredOnlyRequirement(segment));
  return primary ?? trimmed;
}

function isRequirementExplainedByNonHardRequirement(
  risk: string,
  nonHardRequirements: string[],
): boolean {
  const normalizedRisk = normalizeReviewText(risk);
  const riskTokens = extractRequirementTokens(normalizedRisk);

  return nonHardRequirements.some((requirement) => {
    const normalizedRequirement = normalizeReviewText(requirement);
    if (normalizedRequirement === normalizedRisk) return true;
    if (normalizedRequirement.includes(normalizedRisk) || normalizedRisk.includes(normalizedRequirement)) return true;

    const requirementTokens = extractRequirementTokens(normalizedRequirement);
    if (riskTokens.length === 0 || requirementTokens.length === 0) return false;
    return riskTokens.every((token) => requirementTokens.includes(token));
  });
}

function extractRequirementTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function isPositiveRecruiterSignalCandidate(result: FinalReviewResult): boolean {
  return result.hiring_manager_verdict.rating === 'strong_interview_candidate'
    || result.hiring_manager_verdict.rating === 'possible_interview';
}

type RecruiterSignal = FinalReviewResult['six_second_scan']['top_signals_seen'][number];

function hasConcreteRecruiterMetric(signal: string): boolean {
  const normalized = normalizeReviewText(signal);
  const hasDigits = /\d/.test(signal);

  if (/\$|%/.test(signal)) return true;

  return hasDigits && /\b(million|billion|thousand|percent|employees?|people|team|sites?|facilities|plants?|brands?|markets?|states?|countries?|regions?|portfolio|budget|revenue|arr|output|savings|growth|roi|lift|reduction)\b/i.test(normalized);
}

function hasConcreteRecruiterScope(signal: string): boolean {
  const normalized = normalizeReviewText(signal);
  return /\d/.test(signal)
    && /\b(employees?|people|team|sites?|facilities|plants?|brands?|markets?|states?|countries?|regions?|portfolio|budget|output)\b/i.test(normalized);
}

function hasVisibleRecruiterCredential(signal: string): boolean {
  const normalized = normalizeReviewText(signal);
  return /\b(certification|certified|license|licensed|licensure|mba|bachelor'?s|master'?s|phd|doctorate|pmp|cpa|pe|aws solutions architect)\b/i.test(normalized);
}

function hasVisibleRecruiterTitle(signal: string): boolean {
  const normalized = normalizeReviewText(signal);
  return /\b(vp|vice president|chief|cmo|coo|cto|cfo|director|head of|senior director|general manager)\b/i.test(normalized);
}

function isGenericExecutiveRecruiterSignal(signal: string): boolean {
  const normalized = normalizeReviewText(signal);
  const hasConcreteProof = hasConcreteRecruiterMetric(signal) || hasConcreteRecruiterScope(signal);

  if (hasConcreteProof) return false;

  return /\b(\d+\+?\s+years?(?:\s+of)?\s+experience|strong\s+background|proven\s+track\s+record|operations\s+excellence\s+leader|transformational\s+\w+\s+leader|experience\s+driving|background\s+in|leader\s+with\s+\d+\+?\s+years)\b/i.test(normalized);
}

function recruiterSignalPriority(signal: RecruiterSignal): number {
  let score = 0;

  if (signal.visible_in_top_third) score += 3;
  if (hasConcreteRecruiterMetric(signal.signal)) score += 8;
  else if (/\d/.test(signal.signal)) score += 2;
  if (hasConcreteRecruiterScope(signal.signal)) score += 4;
  if (hasVisibleRecruiterCredential(signal.signal)) score += 3;
  if (hasVisibleRecruiterTitle(signal.signal)) score += 2;
  if (isGenericExecutiveRecruiterSignal(signal.signal)) score -= 7;
  if (recruiterSignalNeedsSpecificity(signal.why_it_matters)) score -= 1;

  return score;
}

function recruiterSignalKey(signal: string): string {
  return normalizeReviewText(signal)
    .replace(/[^a-z0-9$%\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function areNearEquivalentRecruiterSignals(left: RecruiterSignal, right: RecruiterSignal): boolean {
  const leftKey = recruiterSignalKey(left.signal);
  const rightKey = recruiterSignalKey(right.signal);

  if (!leftKey || !rightKey) return false;
  if (leftKey === rightKey) return true;
  if (leftKey.includes(rightKey) || rightKey.includes(leftKey)) return true;

  const leftTokens = extractSalientRequirementTokens(leftKey);
  const rightTokens = extractSalientRequirementTokens(rightKey);
  if (leftTokens.length === 0 || rightTokens.length === 0) return false;

  const rightTokenSet = new Set(rightTokens);
  const shared = leftTokens.filter((token) => rightTokenSet.has(token));
  return shared.length / Math.min(leftTokens.length, rightTokens.length) >= 0.7;
}

function rankRecruiterSignals(signals: RecruiterSignal[]): RecruiterSignal[] {
  const ranked = signals
    .map((signal, index) => ({
      signal,
      score: recruiterSignalPriority(signal),
      index,
    }))
    .sort((left, right) => (
      right.score - left.score
      || Number(right.signal.visible_in_top_third) - Number(left.signal.visible_in_top_third)
      || left.index - right.index
    ));

  const deduped: RecruiterSignal[] = [];
  for (const candidate of ranked) {
    if (deduped.some((existing) => areNearEquivalentRecruiterSignals(existing, candidate.signal))) {
      continue;
    }
    deduped.push(candidate.signal);
  }

  return deduped.slice(0, 3);
}

function createRecruiterSignalsFromWins(result: FinalReviewResult) {
  return rankRecruiterSignals(result.top_wins.map((win) => ({
    signal: win.win,
    why_it_matters: win.why_powerful,
    visible_in_top_third: win.prominent_enough,
  })));
}

function createMissingSignalsFromConcerns(result: FinalReviewResult) {
  return result.concerns
    .filter((concern) => concern.severity !== 'minor')
    .slice(0, 3)
    .map((concern) => ({
      signal: concern.related_requirement || concern.observation,
      why_it_matters: concern.why_it_hurts,
    }));
}

function hasPositiveSummaryLanguage(summary: string): boolean {
  return /\b(strong|compelling|impressive|solid|credible|good fit|well-aligned|well aligned|well-suited|well suited|promising)\b/i.test(summary);
}

function hasInterviewPositiveSummaryLanguage(summary: string): boolean {
  return /\b(invite(?:d)?(?:\s+\w+){0,4}\s+interview|likely invite(?:d)?|worth interviewing|interview-worthy|keep in the funnel)\b/i.test(summary);
}

function createRecruiterSignalFromSummary(summary: string) {
  const sentences = summary
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);

  const signal = rankRecruiterSignals(sentences.map((sentence) => ({
    signal: sentence.length > 140 ? `${sentence.slice(0, 137).trim()}...` : sentence,
    why_it_matters: 'This was the clearest positive signal described in the deeper hiring-manager review.',
    visible_in_top_third: false,
  })))[0]?.signal ?? summary.trim();

  return {
    signal,
    why_it_matters: 'This was the clearest positive signal described in the deeper hiring-manager review.',
    visible_in_top_third: false,
  };
}

function buildResumeEvidenceCorpus(result: FinalReviewResult, resumeText?: string): string {
  return [
    resumeText ?? '',
    ...result.six_second_scan.top_signals_seen.map((item) => item.signal),
    ...result.top_wins.map((item) => item.win),
  ].join(' \n ');
}

function concernRequirementKey(concern: FinalReviewResult['concerns'][number]): string {
  return normalizeReviewText(concern.related_requirement ?? concern.observation ?? '');
}

function areNearEquivalentConcernRequirements(
  left: FinalReviewResult['concerns'][number],
  right: FinalReviewResult['concerns'][number],
): boolean {
  const leftKey = concernRequirementKey(left);
  const rightKey = concernRequirementKey(right);

  if (!leftKey || !rightKey) return false;
  if (leftKey === rightKey) return true;
  if (leftKey.includes(rightKey) || rightKey.includes(leftKey)) return true;

  const leftTokens = extractSalientRequirementTokens(leftKey);
  const rightTokens = extractSalientRequirementTokens(rightKey);
  if (leftTokens.length === 0 || rightTokens.length === 0) return false;

  const rightTokenSet = new Set(rightTokens);
  const shared = leftTokens.filter((token) => rightTokenSet.has(token));
  return shared.length / Math.min(leftTokens.length, rightTokens.length) >= 0.7;
}

function concernPriority(concern: FinalReviewResult['concerns'][number]): number {
  const id = concern.id ?? '';
  if (id === 'hard_requirement_risk') return 0;
  if (id === 'material_job_fit_risk') return 1;
  return 2 + severityRank(concern.severity);
}

function dedupeNearEquivalentConcerns(
  concerns: FinalReviewResult['concerns'],
): FinalReviewResult['concerns'] {
  const deduped: FinalReviewResult['concerns'] = [];

  for (const concern of concerns) {
    const existingIndex = deduped.findIndex((candidate) => areNearEquivalentConcernRequirements(candidate, concern));
    if (existingIndex === -1) {
      deduped.push(concern);
      continue;
    }

    const existing = deduped[existingIndex]!;
    if (concernPriority(concern) < concernPriority(existing)) {
      deduped[existingIndex] = concern;
    }
  }

  return deduped;
}

function buildContradictionEvidenceCorpus(result: FinalReviewResult, resumeText?: string): string {
  return [
    resumeText ?? '',
    ...result.six_second_scan.top_signals_seen.map((item) => item.signal),
    ...result.top_wins.map((item) => item.win),
  ].join(' \n ');
}

function isConditionalSuggestedEdit(edit: string): boolean {
  return /\b(if (?:true|accurate|applicable|relevant|you have|you did)|only if|if supported|if evidenced|if documented)\b/i.test(edit);
}

function extractSampleRewriteText(edit: string): string {
  const suchAsMatch = edit.match(/\bsuch as ['"]([^'"]+)['"]/i);
  if (suchAsMatch?.[1]) {
    return suchAsMatch[1].trim();
  }

  const quotedMatch = edit.match(/['"]([^'"]+)['"]/);
  if (quotedMatch?.[1]) {
    return quotedMatch[1].trim();
  }

  return edit;
}

function extractSuggestedEditClaims(edit: string): string[] {
  const claims: string[] = [];
  const capturePatterns = [
    /\bexperience with ([^.;]+)/gi,
    /\bexperience in ([^.;]+)/gi,
    /\bexpertise in ([^.;]+)/gi,
    /\bbackground in ([^.;]+)/gi,
    /\btraining in ([^.;]+)/gi,
    /\bcertification(?:s)? in ([^.;]+)/gi,
    /\bincluding ([^.;]+)/gi,
    /\bpartnered with ([^.;]+)/gi,
    /\b(?:supported|led|managed|oversaw) the integration of ([^.;]+)/gi,
  ];
  const literalClaimPatterns = [
    /\bprivate equity sponsors?\b/gi,
    /\bpe-backed\b/gi,
    /\bpost-acquisition(?: operational)? integration\b/gi,
    /\bintegration of acquired businesses?\b/gi,
    /\bacquired businesses?\b/gi,
  ];

  for (const pattern of capturePatterns) {
    for (const match of edit.matchAll(pattern)) {
      const rawClaim = match[1]?.trim();
      if (!rawClaim) continue;
      claims.push(rawClaim);
    }
  }

  for (const pattern of literalClaimPatterns) {
    for (const match of edit.matchAll(pattern)) {
      const claim = match[0]?.trim();
      if (!claim) continue;
      claims.push(claim);
    }
  }

  return claims;
}

function normalizeClaimFragments(value: string): string[] {
  return value
    .split(/\band\b|,|\/|&/i)
    .map((fragment) => fragment.trim())
    .map((fragment) => fragment.replace(/\b(?:through|via|using|with|from)\b.*$/i, '').trim())
    .filter((fragment) => fragment.length >= 2);
}

const genericRequirementTokens = new Set([
  'deep', 'expertise', 'experience', 'additional', 'cloud', 'platform', 'platforms', 'resume', 'candidate',
  'professional', 'section', 'architecture', 'architecting', 'architect', 'using', 'designed', 'implemented',
  'hybrid', 'multi', 'strategy', 'role', 'roles', 'specific', 'examples', 'accomplishments', 'demonstrate',
  'highlighting', 'highlight', 'bullet', 'point', 'professional', 'requirement',
]);

function extractSalientRequirementTokens(text: string): string[] {
  const rawTokens = text.match(/[A-Za-z0-9.+#-]+/g) ?? [];
  const normalizedTokens = rawTokens
    .map((token) => normalizeReviewText(token))
    .filter((token) => token.length >= 2)
    .filter((token) => !genericRequirementTokens.has(token));

  return Array.from(new Set(normalizedTokens));
}

function evidenceCorpusContainsClaim(corpus: string, claim: string): boolean {
  const normalizedCorpus = normalizeReviewText(corpus);
  const fragments = normalizeClaimFragments(claim)
    .map((fragment) => normalizeReviewText(fragment))
    .filter((fragment) => fragment.length > 1);

  if (fragments.length === 0) return true;
  return fragments.every((fragment) => normalizedCorpus.includes(fragment));
}

function extractNumericClaims(text: string): string[] {
  return Array.from(text.matchAll(/\b\d+(?:\.\d+)?%|\$\d+(?:\.\d+)?\s*(?:k|m|mm|million|b|bn|billion)?|\b\d+(?:\.\d+)?\+?\b/gi))
    .map((match) => match[0]?.trim() ?? '')
    .filter((value) => value.length > 0);
}

function evidenceCorpusContainsNumericClaims(corpus: string, text: string): boolean {
  const numericClaims = extractNumericClaims(text);
  if (numericClaims.length === 0) return true;

  const normalizedCorpus = normalizeReviewText(corpus);
  return numericClaims.every((claim) => normalizedCorpus.includes(normalizeReviewText(claim)));
}

function introducesUnsupportedRequirementTerms(
  concern: FinalReviewResult['concerns'][number],
  sampleText: string,
  evidenceCorpus: string,
): boolean {
  const requirementTerms = extractSalientRequirementTokens(`${concern.related_requirement ?? ''} ${concern.observation}`);
  if (requirementTerms.length === 0) return false;

  const normalizedSample = normalizeReviewText(sampleText);
  const normalizedCorpus = normalizeReviewText(evidenceCorpus);
  const referencedTerms = requirementTerms.filter((term) => normalizedSample.includes(term));

  if (referencedTerms.length === 0) return false;
  return referencedTerms.some((term) => !normalizedCorpus.includes(term));
}

function isSpeculativeSuggestedEdit(
  concern: FinalReviewResult['concerns'][number],
  suggestedEdit: string,
  evidenceCorpus: string,
): boolean {
  if (!suggestedEdit.trim()) {
    return false;
  }

  const sampleText = extractSampleRewriteText(suggestedEdit);
  const conditionalOnly = isConditionalSuggestedEdit(suggestedEdit) && sampleText === suggestedEdit;

  const introducesTrainingOrCredentialClaim = /\b(training(?: programs?)?|certification(?: programs?)?|certificate|certified|coursework|courses?)\b/i.test(sampleText);
  if (introducesTrainingOrCredentialClaim && !evidenceCorpusContainsClaim(evidenceCorpus, sampleText)) {
    return true;
  }

  const claims = extractSuggestedEditClaims(sampleText);
  if (claims.length === 0) {
    return !evidenceCorpusContainsNumericClaims(evidenceCorpus, sampleText)
      || introducesUnsupportedRequirementTerms(concern, sampleText, evidenceCorpus)
      ? true
      : conditionalOnly ? false : false;
  }

  return claims.some((claim) => !evidenceCorpusContainsClaim(evidenceCorpus, claim))
    || !evidenceCorpusContainsNumericClaims(evidenceCorpus, sampleText)
    || introducesUnsupportedRequirementTerms(concern, sampleText, evidenceCorpus);
}

function sanitizeConcernSuggestedEdit(
  concern: FinalReviewResult['concerns'][number],
  evidenceCorpus: string,
): FinalReviewResult['concerns'][number] {
  const suggestedEdit = concern.suggested_resume_edit?.trim();
  if (!suggestedEdit) {
    return concern;
  }

  if (/^(none|n\/a|not without)/i.test(suggestedEdit) || /without explicit candidate input/i.test(suggestedEdit)) {
    const coachingSubject = cleanImprovementSummaryText(concern.related_requirement ?? concern.observation ?? '');
    return {
      ...concern,
      suggested_resume_edit: undefined,
      requires_candidate_input: true,
      clarifying_question: concern.clarifying_question
        ?? (coachingSubject
          ? buildRequirementClarifyingQuestion(coachingSubject)
          : 'What truthful example or missing detail would let us strengthen this point without inventing experience?'),
    };
  }

  if (!isSpeculativeSuggestedEdit(concern, suggestedEdit, evidenceCorpus)) {
    return concern;
  }

  const coachingSubject = cleanImprovementSummaryText(concern.related_requirement ?? concern.observation ?? '');
  return {
    ...concern,
    suggested_resume_edit: undefined,
    requires_candidate_input: true,
    clarifying_question: concern.clarifying_question
      ?? (coachingSubject
        ? buildRequirementClarifyingQuestion(coachingSubject)
        : 'What truthful example, credential, or concrete proof can we point to for this requirement without inventing new experience?'),
    fix_strategy: /only add/i.test(concern.fix_strategy)
      ? concern.fix_strategy
      : `${concern.fix_strategy.replace(/\s*$/, '').replace(/[.?!]$/, '')}. Only add sample language that is already directly supported by the resume or by a truthful candidate clarification.`,
  };
}

function requirementLooksCredentialBased(concern: FinalReviewResult['concerns'][number]): boolean {
  return /\b(certification|certified|certificate|license|licensed|licensure|degree|bachelor'?s|master'?s|mba|cpa|pmp)\b|\bpe\b(?!-)/i
    .test(`${concern.related_requirement ?? ''} ${concern.observation}`);
}

function removeUnsupportedCredentialGuidance(text: string): string {
  return text
    .replace(/\s*,?\s*or certifications? related to [^,.?!;]+/gi, '')
    .replace(/\s*,?\s*or any relevant certifications?(?: you hold)?/gi, '')
    .replace(/\s*,?\s*including certifications?[^,.?!;]*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.?!])/g, '$1')
    .trim();
}

function sanitizeConcernGuidance(
  concern: FinalReviewResult['concerns'][number],
): FinalReviewResult['concerns'][number] {
  const coachingSubject = cleanImprovementSummaryText(concern.related_requirement ?? concern.observation ?? '');
  if (requirementLooksCredentialBased(concern)) {
    return concern;
  }

  let fixStrategy = concern.fix_strategy
    ? removeUnsupportedCredentialGuidance(concern.fix_strategy)
    : concern.fix_strategy;
  let clarifyingQuestion = concern.clarifying_question
    ? removeUnsupportedCredentialGuidance(concern.clarifying_question)
    : concern.clarifying_question;

  if (
    fixStrategy
    && coachingSubject
    && !/only add sample language/i.test(fixStrategy)
    && (concern.id === 'material_job_fit_risk' || isLowSignalFixStrategy(fixStrategy))
  ) {
    fixStrategy = buildRequirementProofAction(coachingSubject, concern.requires_candidate_input);
  }

  if (coachingSubject && concern.requires_candidate_input && (!clarifyingQuestion || isGenericClarifyingQuestion(clarifyingQuestion))) {
    clarifyingQuestion = buildRequirementClarifyingQuestion(coachingSubject);
  }

  return {
    ...concern,
    fix_strategy: fixStrategy,
    clarifying_question: clarifyingQuestion,
  };
}

export function stabilizeFinalReviewResult(
  result: FinalReviewResult,
  options?: {
    hardRequirementRisks?: string[];
    materialJobFitRisks?: string[];
    resumeText?: string;
    requirementWorkItems?: Array<{ id?: string; requirement?: string }> | null;
  },
): FinalReviewResult {
  const normalized: FinalReviewResult = {
    ...result,
    six_second_scan: {
      ...result.six_second_scan,
      top_signals_seen: [...result.six_second_scan.top_signals_seen],
      important_signals_missing: [...result.six_second_scan.important_signals_missing],
    },
    top_wins: [...result.top_wins],
    concerns: [...result.concerns],
    structure_recommendations: [...result.structure_recommendations],
    benchmark_comparison: {
      ...result.benchmark_comparison,
      advantages_vs_benchmark: [...result.benchmark_comparison.advantages_vs_benchmark],
      gaps_vs_benchmark: [...result.benchmark_comparison.gaps_vs_benchmark],
      reframing_opportunities: [...result.benchmark_comparison.reframing_opportunities],
    },
    improvement_summary: [...result.improvement_summary],
  };
  const evidenceCorpus = buildResumeEvidenceCorpus(normalized, options?.resumeText);
  normalized.concerns = normalized.concerns
    .map((concern) => sanitizeConcernSuggestedEdit(concern, evidenceCorpus))
    .map((concern) => sanitizeConcernGuidance(concern))
    .map((concern) => ({
      ...concern,
      work_item_id: concern.work_item_id ?? findConcernWorkItemId(
        concern.related_requirement,
        concern.observation,
        options?.requirementWorkItems,
      ),
    }));
  const criticalConcernCount = normalized.concerns.filter((concern) => concern.severity === 'critical').length;

  const recruiterSignalCandidates: RecruiterSignal[] = [
    ...normalized.six_second_scan.top_signals_seen,
    ...createRecruiterSignalsFromWins(normalized),
  ];

  const hasConcreteRecruiterSignal = recruiterSignalCandidates.some((signal) => recruiterSignalPriority(signal) >= 6);
  if (!hasConcreteRecruiterSignal && hasPositiveSummaryLanguage(normalized.hiring_manager_verdict.summary)) {
    recruiterSignalCandidates.push(createRecruiterSignalFromSummary(normalized.hiring_manager_verdict.summary));
  }

  normalized.six_second_scan.top_signals_seen = rankRecruiterSignals(recruiterSignalCandidates);

  if (normalized.six_second_scan.important_signals_missing.length === 0 && normalized.concerns.length > 0) {
    normalized.six_second_scan.important_signals_missing = createMissingSignalsFromConcerns(normalized);
  }

  if (
    normalized.six_second_scan.decision === 'skip'
    && normalized.six_second_scan.top_signals_seen.length > 0
    && normalized.hiring_manager_verdict.rating !== 'likely_rejected'
  ) {
    normalized.six_second_scan.decision = 'continue_reading';
  }

  if (
    isPositiveRecruiterSignalCandidate(normalized)
    && normalized.six_second_scan.top_signals_seen.length > 0
    && normalized.six_second_scan.decision !== 'continue_reading'
  ) {
    normalized.six_second_scan.decision = 'continue_reading';
  }

  if (
    normalized.hiring_manager_verdict.rating !== 'likely_rejected'
    && hasPositiveSummaryLanguage(normalized.hiring_manager_verdict.summary)
    && normalized.six_second_scan.top_signals_seen.length > 0
    && normalized.six_second_scan.decision === 'skip'
  ) {
    normalized.six_second_scan.decision = 'continue_reading';
  }

  if (!normalized.six_second_scan.reason.trim()) {
    normalized.six_second_scan.reason = normalized.hiring_manager_verdict.summary;
  }

  const contradictionEvidenceCorpus = buildContradictionEvidenceCorpus(normalized, options?.resumeText);
  normalized.six_second_scan.important_signals_missing = normalized.six_second_scan.important_signals_missing.filter((item) => !isYearsThresholdContradictedByEvidence(item.signal, contradictionEvidenceCorpus));
  normalized.concerns = normalized.concerns.filter((concern) => !isYearsThresholdContradictedByEvidence(
    `${concern.related_requirement ?? ''} ${concern.observation}`,
    contradictionEvidenceCorpus,
  ));
  normalized.improvement_summary = normalized.improvement_summary.filter((item) => !isYearsThresholdContradictedByEvidence(item, contradictionEvidenceCorpus));
  normalized.hiring_manager_verdict.summary = removeContradictedYearsConcernLanguage(
    normalized.hiring_manager_verdict.summary,
    contradictionEvidenceCorpus,
  );

  normalized.six_second_scan.top_signals_seen = normalized.six_second_scan.top_signals_seen.map((item) => ({
    ...item,
    why_it_matters: recruiterSignalNeedsSpecificity(item.why_it_matters)
      ? buildRecruiterSignalWhyItMatters(item.signal)
      : item.why_it_matters,
  }));

  normalized.six_second_scan.important_signals_missing = normalized.six_second_scan.important_signals_missing.map((item) => ({
    ...item,
    why_it_matters: preferredMissingSignalNeedsSpecificity(item.signal, item.why_it_matters)
      ? buildPreferredMissingSignalWhyItMatters(item.signal)
      : missingSignalNeedsSpecificity(item.why_it_matters)
        ? buildMissingSignalWhyItMatters(item.signal)
      : softenPreferredQualificationRiskLanguage(item.signal, item.why_it_matters),
  }));
  const hardRequirementRisks = getEffectiveHardRequirementRisks(
    normalized,
    options?.hardRequirementRisks ?? [],
    options?.resumeText,
  );
  const materialJobFitRisks = getEffectiveMaterialJobFitRisks(
    normalized,
    options?.materialJobFitRisks ?? [],
    options?.resumeText,
  );

  if (hardRequirementRisks.length > 0) {
    const existingMissingSignals = new Set(
      normalized.six_second_scan.important_signals_missing.map((item) => normalizeReviewText(item.signal)),
    );
    for (const requirement of hardRequirementRisks) {
      if (existingMissingSignals.has(normalizeReviewText(requirement))) continue;
      normalized.six_second_scan.important_signals_missing.push({
        signal: requirement,
        why_it_matters: 'This looks like a hard requirement and can create real screening risk if it is not clearly evidenced.',
      });
    }

    const hasCriticalHardConcern = normalized.concerns.some((concern) => (
      concern.severity === 'critical'
      && normalizeReviewText(concern.related_requirement ?? concern.observation).includes(normalizeReviewText(hardRequirementRisks[0]))
    ));

    if (!hasCriticalHardConcern) {
      normalized.concerns.unshift({
        id: 'hard_requirement_risk',
        severity: 'critical',
        type: 'credibility_risk',
        observation: `Hard requirement not clearly evidenced: ${hardRequirementRisks[0]}`,
        why_it_hurts: buildHardRequirementWhyItHurts(hardRequirementRisks[0]),
        target_section: 'Education, Certifications, or Summary',
        related_requirement: hardRequirementRisks[0],
        fix_strategy: 'If the requirement is real, add direct proof. If it is not, keep the risk visible and avoid overstating fit.',
        requires_candidate_input: true,
        clarifying_question: 'Do you actually have this hard requirement, and if so, where should it be shown explicitly on the resume?',
      });
    }

    if (normalized.hiring_manager_verdict.rating === 'strong_interview_candidate') {
      normalized.hiring_manager_verdict.rating = hardRequirementRisks.length > 1
        ? 'needs_improvement'
        : 'possible_interview';
    }

    if (!/hard requirement|screen(?:-| )out|credential|degree|certification|license/i.test(normalized.hiring_manager_verdict.summary)) {
      normalized.hiring_manager_verdict.summary = `${normalized.hiring_manager_verdict.summary} One important caveat: ${hardRequirementRisks[0]} is not clearly evidenced yet and could become a screening risk.`;
    }
  }

  const effectiveCriticalConcernCount = normalized.concerns.filter((concern) => concern.severity === 'critical').length;
  if (hardRequirementRisks.length > 0 || effectiveCriticalConcernCount > 0) {
    const jobFitCap = hardRequirementRisks.length > 1 ? 'weak' : 'moderate';
    normalized.fit_assessment.job_description_fit = capFitAssessment(
      normalized.fit_assessment.job_description_fit,
      jobFitCap,
    );
    normalized.fit_assessment.clarity_and_credibility = capFitAssessment(
      normalized.fit_assessment.clarity_and_credibility,
      hardRequirementRisks.length > 1 || effectiveCriticalConcernCount > 1 ? 'weak' : 'moderate',
    );

    if (hardRequirementRisks.length > 0) {
      normalized.fit_assessment.benchmark_alignment = capFitAssessment(
        normalized.fit_assessment.benchmark_alignment,
        'moderate',
      );
    }
  } else if (criticalConcernCount > 0) {
    normalized.fit_assessment.clarity_and_credibility = capFitAssessment(
      normalized.fit_assessment.clarity_and_credibility,
      'moderate',
    );
  }

  if (hardRequirementRisks.length === 0 && materialJobFitRisks.length > 0) {
    const existingMissingSignals = new Set(
      normalized.six_second_scan.important_signals_missing.map((item) => normalizeReviewText(item.signal)),
    );
    for (const requirement of materialJobFitRisks.slice(0, 3)) {
      if (existingMissingSignals.has(normalizeReviewText(requirement))) continue;
      normalized.six_second_scan.important_signals_missing.push({
        signal: requirement,
        why_it_matters: buildMaterialJobFitWhyItMatters(requirement),
      });
    }

    if (!normalized.concerns.some((concern) => concern.id === 'material_job_fit_risk')) {
      normalized.concerns.unshift({
        id: 'material_job_fit_risk',
        severity: materialJobFitRisks.length > 1 ? 'critical' : 'moderate',
        type: 'missing_evidence',
        observation: `Must-have role-fit evidence is still thin: ${materialJobFitRisks[0]}`,
        why_it_hurts: buildMaterialJobFitWhyItHurts(materialJobFitRisks[0]),
        target_section: 'Summary or most relevant experience bullets',
        related_requirement: materialJobFitRisks[0],
        fix_strategy: 'Prioritize direct proof for this requirement before treating the draft as final.',
        requires_candidate_input: true,
        clarifying_question: 'What is the strongest real example from your background that proves this must-have requirement?',
      });
    }

    if (normalized.hiring_manager_verdict.rating === 'strong_interview_candidate') {
      normalized.hiring_manager_verdict.rating = materialJobFitRisks.length > 1
        ? 'needs_improvement'
        : 'possible_interview';
    }

    normalized.fit_assessment.job_description_fit = capFitAssessment(
      normalized.fit_assessment.job_description_fit,
      materialJobFitRisks.length > 1 ? 'weak' : 'moderate',
    );
    normalized.fit_assessment.clarity_and_credibility = capFitAssessment(
      normalized.fit_assessment.clarity_and_credibility,
      materialJobFitRisks.length > 1 ? 'weak' : 'moderate',
    );
  }

  const criticalConcerns = normalized.concerns.filter((concern) => concern.severity === 'critical');
  const singleAggregatedMaterialConcern = hardRequirementRisks.length === 0
    && criticalConcerns.length === 1
    && criticalConcerns[0]?.id === 'material_job_fit_risk'
    && normalized.concerns.every((concern) => concern.id === 'material_job_fit_risk' || concern.severity !== 'critical');

  if (
    singleAggregatedMaterialConcern
    && normalized.six_second_scan.decision === 'continue_reading'
    && normalized.six_second_scan.top_signals_seen.length > 0
    && (
      hasInterviewPositiveSummaryLanguage(normalized.hiring_manager_verdict.summary)
      || (
        normalized.fit_assessment.business_impact === 'strong'
        && normalized.six_second_scan.top_signals_seen.length >= 2
        && normalized.six_second_scan.top_signals_seen.some((signal) => recruiterSignalPriority(signal) >= 6)
      )
    )
  ) {
    normalized.concerns = normalized.concerns.map((concern) => (
      concern.id === 'material_job_fit_risk'
        ? { ...concern, severity: 'moderate' }
        : concern
    ));

    if (normalized.hiring_manager_verdict.rating === 'needs_improvement') {
      normalized.hiring_manager_verdict.rating = 'possible_interview';
    }

    if (normalized.fit_assessment.job_description_fit === 'weak') {
      normalized.fit_assessment.job_description_fit = 'moderate';
    }
    if (normalized.fit_assessment.clarity_and_credibility === 'weak') {
      normalized.fit_assessment.clarity_and_credibility = 'moderate';
    }
  }

  normalized.concerns = normalized.concerns.map((concern) => sanitizeConcernGuidance(concern));
  normalized.concerns = dedupeNearEquivalentConcerns(normalized.concerns);
  normalized.hiring_manager_verdict.summary = softenContradictedSummaryClaims(normalized);
  normalized.improvement_summary = buildImprovementSummaryFromConcerns(normalized);

  return normalized;
}

function findConcernWorkItemId(
  relatedRequirement: string | undefined,
  observation: string | undefined,
  workItems?: Array<{ id?: string; requirement?: string }> | null,
): string | undefined {
  if (!Array.isArray(workItems) || workItems.length === 0) return undefined;

  const normalizedRequirement = normalizeReviewText(relatedRequirement ?? '');
  const normalizedObservation = normalizeReviewText(observation ?? '');

  const directMatch = workItems.find((item) => {
    const requirement = normalizeReviewText(item.requirement ?? '');
    if (!requirement) return false;
    return requirement === normalizedRequirement
      || (normalizedRequirement.length > 0 && requirement.includes(normalizedRequirement))
      || (normalizedObservation.length > 0 && normalizedObservation.includes(requirement));
  });

  return typeof directMatch?.id === 'string' && directMatch.id.trim().length > 0
    ? directMatch.id
    : undefined;
}

export function getEffectiveHardRequirementRisks(
  result: FinalReviewResult,
  hardRequirementRisks: string[],
  resumeText?: string,
): string[] {
  return filterContradictedHardRequirementRisks(
    Array.from(new Set(hardRequirementRisks.filter(Boolean))),
    result,
    resumeText,
  );
}

function getEffectiveMaterialJobFitRisks(
  result: FinalReviewResult,
  materialJobFitRisks: string[],
  resumeText?: string,
): string[] {
  return filterContradictedMaterialJobFitRisks(
    Array.from(new Set(materialJobFitRisks.filter(Boolean))),
    result,
    resumeText,
  );
}

function capFitAssessment(
  current: 'strong' | 'moderate' | 'weak',
  cap: 'strong' | 'moderate' | 'weak',
): 'strong' | 'moderate' | 'weak' {
  const order = { strong: 3, moderate: 2, weak: 1 } as const;
  return order[current] <= order[cap] ? current : cap;
}

function filterContradictedHardRequirementRisks(
  risks: string[],
  result: FinalReviewResult,
  resumeText?: string,
): string[] {
  const signalCorpus = [
    ...result.six_second_scan.top_signals_seen.map((item) => item.signal),
    ...result.top_wins.map((item) => item.win),
    result.hiring_manager_verdict.summary,
    resumeText ?? '',
  ].join(' \n ');

  return risks.filter((risk) => !(
    isYearsThresholdContradictedByEvidence(risk, signalCorpus)
    || isCredentialRequirementContradictedByEvidence(risk, signalCorpus)
  ));
}

function filterContradictedMaterialJobFitRisks(
  risks: string[],
  result: FinalReviewResult,
  resumeText?: string,
): string[] {
  const signalCorpus = [
    ...result.six_second_scan.top_signals_seen.map((item) => item.signal),
    ...result.top_wins.map((item) => item.win),
    result.hiring_manager_verdict.summary,
    resumeText ?? '',
  ].join(' \n ');

  return risks.filter((risk) => !isMaterialRequirementContradictedByEvidence(risk, signalCorpus));
}

function isHardRequirementAlreadySatisfied(
  risk: string,
  strongRequirements: string[],
): boolean {
  const normalizedRisk = normalizeReviewText(risk);
  if (strongRequirements.some((item) => normalizeReviewText(item) === normalizedRisk)) {
    return true;
  }

  const riskYears = extractYearsThreshold(risk);
  if (riskYears !== null) {
    const strongestYears = strongRequirements
      .map((item) => extractYearsThreshold(item))
      .filter((value): value is number => value !== null);
    if (strongestYears.some((value) => value >= riskYears)) {
      return true;
    }
  }

  return false;
}

function isYearsThresholdContradictedByEvidence(
  risk: string,
  signalCorpus: string,
): boolean {
  const requiredYears = extractYearsThreshold(risk);
  if (requiredYears === null) return false;

  const evidencedYears = Array.from(signalCorpus.matchAll(/\b(\d+)\+?\s+years?\b/gi))
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value));

  if (evidencedYears.length === 0) return false;
  return Math.max(...evidencedYears) >= requiredYears;
}

function removeContradictedYearsConcernLanguage(
  summary: string,
  contradictionEvidenceCorpus: string,
): string {
  if (!isYearsThresholdContradictedByEvidence(summary, contradictionEvidenceCorpus)) {
    return summary;
  }

  const sentences = summary
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const filtered = sentences.filter((sentence) => !(
    isYearsThresholdContradictedByEvidence(sentence, contradictionEvidenceCorpus)
    && /\b(short(?:er|fall)|falls?\s+short|not clearly|not explicit|lack of clear|may be a concern|required \d+\+?\s+years|minimum of \d+\+?\s+years)\b/i.test(sentence)
  ));

  return filtered.length > 0 ? filtered.join(' ') : summary;
}

function buildImprovementSummaryFromConcerns(result: FinalReviewResult): string[] {
  const prioritizedConcerns = [...result.concerns]
    .sort((left, right) => severityRank(left.severity) - severityRank(right.severity));

  const nextSteps: string[] = [];
  const seen = new Set<string>();

  const add = (value: string | null) => {
    if (!value) return;
    const normalized = normalizeReviewText(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    nextSteps.push(value);
  };

  for (const concern of prioritizedConcerns) {
    if (concern.type === 'benchmark_gap') continue;
    add(createImprovementSummaryItemFromConcern(concern));
    if (nextSteps.length >= 3) break;
  }

  if (nextSteps.length > 0) {
    return nextSteps;
  }

  for (const item of result.improvement_summary) {
    const cleaned = cleanImprovementSummaryText(item);
    if (!cleaned || isGenericImprovementSummaryText(cleaned)) continue;
    add(cleaned);
    if (nextSteps.length >= 3) break;
  }

  return nextSteps;
}

function severityRank(severity: 'critical' | 'moderate' | 'minor'): number {
  if (severity === 'critical') return 0;
  if (severity === 'moderate') return 1;
  return 2;
}

function createImprovementSummaryItemFromConcern(
  concern: FinalReviewResult['concerns'][number],
): string | null {
  const requirement = cleanImprovementSummaryText(concern.related_requirement ?? '');
  const fixStrategy = cleanConcernFixStrategy(concern.fix_strategy ?? '', concern.requires_candidate_input);

  if (concern.id === 'material_job_fit_risk' && requirement) {
    return buildRequirementProofAction(requirement, concern.requires_candidate_input);
  }

  if (fixStrategy && requirement && isLowSignalFixStrategy(fixStrategy)) {
    return buildRequirementProofAction(requirement, concern.requires_candidate_input);
  }

  if (fixStrategy && !isGenericImprovementSummaryText(fixStrategy)) {
    return fixStrategy;
  }

  if (requirement) {
    return `Add direct proof of ${requirement}.`;
  }

  const observation = cleanImprovementSummaryText(concern.observation ?? '');
  if (!observation) return null;
  if (/must-have role-fit evidence is still thin:/i.test(observation)) {
    return `Add direct proof of ${observation.replace(/^must-have role-fit evidence is still thin:\s*/i, '')}.`;
  }

  return null;
}

function cleanConcernFixStrategy(value: string, requiresCandidateInput: boolean): string {
  let cleaned = cleanImprovementSummaryText(
    value
      .replace(/Only add sample language.*$/i, '')
      .replace(/Prioritize direct proof for this requirement before treating the draft as final\.?/i, '')
      .trim(),
  );

  const lowSignalAction = isLowSignalFixStrategy(cleaned);
  const requirementMatch = cleaned.match(/\b(?:for|of|showing|highlighting)\s+(.+)$/i);
  if (lowSignalAction && !requirementMatch) {
    cleaned = cleaned.replace(/\.$/, '');
  }

  if (
    requiresCandidateInput
    && /^(add|consider adding|highlight)\b/i.test(cleaned)
    && !/^if (?:you have this experience|you have this background|true|applicable|relevant)\b/i.test(cleaned)
  ) {
    cleaned = `If you have this experience, ${cleaned.charAt(0).toLowerCase()}${cleaned.slice(1)}`;
  }

  return cleaned;
}

function isLowSignalFixStrategy(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!/^(if (?:you have this experience,\s*)?)?(add|consider adding|highlight|provide|strengthen|review)\b/i.test(normalized)) {
    return false;
  }

  return [
    'direct example',
    'direct proof',
    'specific example',
    'specific examples',
    'specific detail',
    'specific details',
    'specific metric',
    'specific metrics',
    'specific context',
    'specific information',
    'more detail',
    'more details',
    'a statement',
    'a sentence',
    'a sentence or bullet point',
    'a brief statement',
    'a brief statement or bullet point',
    'a brief description',
    'a bullet point',
    'a bullet point or statement',
    'bullet points',
    'a separate section',
    'strengthen the supporting proof before export',
    'review this concern and add truthful supporting proof before export if you have it',
    'mention',
    'if this requirement is real',
    'any relevant experience',
    'any relevant experience or training',
  ].some((fragment) => normalized.includes(fragment));
}

function cleanImprovementSummaryText(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s+\./g, '.')
    .trim();
}

function isGenericImprovementSummaryText(value: string): boolean {
  return /\b(white space|section breaks|clear headings|formatting|reformat|reorganizing|career progression timeline|timeline for clarity|make the resume easier to read|for clarity|more technical metrics|more data points)\b/i.test(value);
}

function isMaterialRequirementContradictedByEvidence(
  risk: string,
  signalCorpus: string,
): boolean {
  if (isYearsThresholdContradictedByEvidence(risk, signalCorpus)) {
    return true;
  }

  if (isCredentialRequirementContradictedByEvidence(risk, signalCorpus)) {
    return true;
  }

  if (isNamedFrameworkRequirementContradictedByEvidence(risk, signalCorpus)) {
    return true;
  }

  return isDollarThresholdContradictedByEvidence(risk, signalCorpus);
}

function isNamedFrameworkRequirementContradictedByEvidence(
  risk: string,
  signalCorpus: string,
): boolean {
  const frameworkPatterns = extractFrameworkEvidencePatterns(risk);
  if (frameworkPatterns.length === 0) return false;
  return frameworkPatterns.some((pattern) => pattern.test(signalCorpus));
}

function extractFrameworkEvidencePatterns(value: string): RegExp[] {
  const normalized = normalizeReviewText(value);
  const patterns: RegExp[] = [];

  if (/\bsoc\s*2\b/.test(normalized)) patterns.push(/\bsoc\s*2\b/i);
  if (/\bhipaa\b/.test(normalized)) patterns.push(/\bhipaa\b/i);
  if (/\bpci(?:\s|-)?dss\b/.test(normalized)) patterns.push(/\bpci(?:\s|-)?dss\b/i);
  if (/\biso\s*9001\b/.test(normalized)) patterns.push(/\biso\s*9001\b/i);
  if (/\bas\s*9100\b|\bas9100\b/.test(normalized)) patterns.push(/\bas\s*9100[a-z]?\b|\bas9100[a-z]?\b/i);
  if (/\biatf\s*16949\b/.test(normalized)) patterns.push(/\biatf\s*16949\b/i);
  if (/\bnist\b/.test(normalized)) patterns.push(/\bnist\b/i);
  if (/\bfedramp\b/.test(normalized)) patterns.push(/\bfedramp\b/i);
  if (/\bgdpr\b/.test(normalized)) patterns.push(/\bgdpr\b/i);
  if (/\bhitrust\b/.test(normalized)) patterns.push(/\bhitrust\b/i);
  if (/\bcmmc\b/.test(normalized)) patterns.push(/\bcmmc\b/i);
  if (/\bsox\b/.test(normalized)) patterns.push(/\bsox\b/i);
  if (/\bglba\b/.test(normalized)) patterns.push(/\bglba\b/i);

  return patterns;
}

function isCredentialRequirementContradictedByEvidence(
  risk: string,
  signalCorpus: string,
): boolean {
  const normalizedRisk = normalizeReviewText(risk);
  const normalizedCorpus = normalizeReviewText(signalCorpus);

  if (/\b(certification|certified|license|licensed|licensure)\b/.test(normalizedRisk)) {
    const credentialKeywords = normalizedRisk
      .replace(/\b(required|required preferred|preferred|or related field|foreign equivalent)\b/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 3 && !['certification', 'certified', 'license', 'licensed', 'licensure'].includes(token));

    return credentialKeywords.some((token) => normalizedCorpus.includes(token));
  }

  if (!/\b(bachelor|master|mba|phd|doctorate|degree|foreign equivalent)\b/.test(normalizedRisk)) {
    return false;
  }

  const levelPattern = getDegreeLevelEvidencePattern(normalizedRisk);
  if (!levelPattern.test(signalCorpus)) {
    return false;
  }

  const fieldPatterns = getDegreeFieldEvidencePatterns(normalizedRisk);
  if (fieldPatterns.length === 0) {
    return true;
  }

  return fieldPatterns.some((pattern) => pattern.test(signalCorpus));
}

function getDegreeLevelEvidencePattern(requirement: string): RegExp {
  if (/\b(phd|doctorate|doctor)\b/.test(requirement)) {
    return /\b(phd|doctorate|doctor)\b/i;
  }

  if (/\b(master|ms|ma|mba)\b/.test(requirement)) {
    return /\b(master|m\.?\s*s\.?|m\.?\s*a\.?|mba|phd|doctorate|doctor)\b/i;
  }

  return /\b(bachelor|b\.?\s*s\.?|b\.?\s*a\.?|beng|bsc|master|m\.?\s*s\.?|m\.?\s*a\.?|mba|phd|doctorate|doctor)\b/i;
}

function getDegreeFieldEvidencePatterns(requirement: string): RegExp[] {
  const patterns: RegExp[] = [];

  if (/\bmechanical engineering\b/.test(requirement)) patterns.push(buildDegreeFieldPattern('mechanical engineering'));
  if (/\bchemical engineering\b/.test(requirement)) patterns.push(buildDegreeFieldPattern('chemical engineering'));
  if (/\bcivil engineering\b/.test(requirement)) patterns.push(buildDegreeFieldPattern('civil engineering'));
  if (/\bpetroleum engineering\b/.test(requirement)) patterns.push(buildDegreeFieldPattern('petroleum engineering'));
  if (/\boperations management\b/.test(requirement)) patterns.push(buildDegreeFieldPattern('operations management'));
  if (/\bmarketing\b/.test(requirement)) patterns.push(buildDegreeFieldPattern('marketing'));
  if (/\bbusiness\b/.test(requirement)) patterns.push(buildDegreeFieldPattern('business'));

  if (/\bengineering|engineer\b/.test(requirement)) {
    patterns.push(buildDegreeFieldPattern('engineering'));
  }

  return patterns;
}

function buildDegreeFieldPattern(field: string): RegExp {
  const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    String.raw`\b(?:bachelor|b\.?\s*s\.?|b\.?\s*a\.?|beng|bsc|master|m\.?\s*s\.?|m\.?\s*a\.?|mba|phd|doctorate|doctor)[^.\n]{0,120}\b${escapedField}\b`,
    'i',
  );
}

function isDollarThresholdContradictedByEvidence(
  risk: string,
  signalCorpus: string,
): boolean {
  const requiredDollars = extractDollarThreshold(risk);
  if (requiredDollars === null) return false;

  const normalizedRisk = normalizeReviewText(risk);
  const normalizedCorpus = normalizeReviewText(signalCorpus);
  const riskHasFinancialScope = /\bp&l|profit and loss|budget|revenue|operations?\b/.test(normalizedRisk);
  const corpusHasFinancialScope = /\bp&l|profit and loss|budget|revenue|operations?\b/.test(normalizedCorpus);
  if (!riskHasFinancialScope || !corpusHasFinancialScope) return false;

  const evidencedDollars = Array.from(signalCorpus.matchAll(/\$(\d+(?:\.\d+)?)\s*(k|m|mm|million|b|bn|billion)?/gi))
    .map((match) => normalizeDollarMagnitude(Number(match[1]), match[2] ?? ''))
    .filter((value): value is number => value !== null);

  if (evidencedDollars.length === 0) return false;
  return Math.max(...evidencedDollars) >= requiredDollars;
}

function extractDollarThreshold(value: string): number | null {
  const match = value.match(/\$(\d+(?:\.\d+)?)\s*(k|m|mm|million|b|bn|billion)?/i);
  if (!match) return null;
  return normalizeDollarMagnitude(Number(match[1]), match[2] ?? '');
}

function normalizeDollarMagnitude(amount: number, rawUnit: string): number | null {
  if (!Number.isFinite(amount)) return null;
  const unit = rawUnit.trim().toLowerCase();
  if (!unit) return amount;
  if (unit === 'k' || unit === 'thousand') return amount * 1_000;
  if (unit === 'm' || unit === 'mm' || unit === 'million') return amount * 1_000_000;
  if (unit === 'b' || unit === 'bn' || unit === 'billion') return amount * 1_000_000_000;
  return amount;
}

function extractYearsThreshold(text: string): number | null {
  const match = text.match(/\b(?:minimum of\s*)?(\d+)\+?\s+years?\b/i);
  return match ? Number(match[1]) : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function softenPreferredQualificationRiskLanguage(signal: string, whyItMatters: string): string {
  if (!/preferred qualification|preferred|nice to have|bonus|plus/i.test(`${signal} ${whyItMatters}`)) {
    return whyItMatters;
  }

  return whyItMatters.replace(/screen(?:-| )out risk/gi, 'competitive disadvantage');
}

function isShoutyReviewExplanation(value: string): boolean {
  const letters = value.replace(/[^A-Za-z]/g, '');
  return letters.length >= 12 && value === value.toUpperCase();
}

function recruiterSignalNeedsSpecificity(whyItMatters: string): boolean {
  const normalized = normalizeReviewText(whyItMatters);
  return isShoutyReviewExplanation(whyItMatters)
    || /^this (metric|signal|credential|experience) (indicates|demonstrates|shows)/.test(normalized)
    || normalized === 'this was the clearest positive signal described in the deeper hiring-manager review.'
    || /^shows /.test(normalized);
}

function buildRecruiterSignalWhyItMatters(signal: string): string {
  const normalized = normalizeReviewText(signal);

  if (/\$|\b(percent|%|reduced|increase|increased|grew|lift|improved|savings|revenue|roi|arr)\b/i.test(signal)) {
    return 'This gives the recruiter a concrete business-impact proof point in the top third.';
  }

  if (/\b(certification|certified|license|licensed|licensure|aws solutions architect|pmp|cpa|mba)\b/i.test(normalized)) {
    return 'This gives the recruiter an immediately visible credential match in the first skim.';
  }

  if (/\b(vp|vice president|cmo|coo|cto|cfo|director|head of)\b/i.test(normalized)) {
    return 'This gives the recruiter an immediately visible role-level signal in the first skim.';
  }

  if (extractYearsThreshold(signal) !== null || /\b\d+\s+years?\b/.test(normalized)) {
    return 'This clears an early experience screen and gives the recruiter visible seniority proof in the top third.';
  }

  return 'This gives the recruiter a concrete proof point early in the draft.';
}

function preferredMissingSignalNeedsSpecificity(signal: string, whyItMatters: string): boolean {
  const normalized = normalizeReviewText(whyItMatters);
  return /preferred qualifications? and could be valuable in the role/.test(normalized)
    || /^the job description mentions .*preferred qualification/.test(normalized)
    || /^the company is backed by /.test(normalized)
    || /^this experience is a preferred qualification /.test(normalized)
    || /^lack of explicit experience /.test(normalized)
    || /^while the candidate mentions .* they do not explicitly highlight /.test(normalized)
    || (/preferred|nice to have|bonus|plus/.test(normalized) && /role/.test(normalized));
}

function buildPreferredMissingSignalWhyItMatters(signal: string): string {
  const normalized = normalizeReviewText(signal);

  if (/\b(pe-backed|private equity|post-acquisition|integration|acquisition)\b/i.test(normalized)) {
    return 'This would strengthen the fit for this role, but it is still a preferred background signal and more of a competitive disadvantage than a must-have screen.';
  }

  if (/\b(board|executive|leadership|communication|presence)\b/i.test(normalized)) {
    return 'This would strengthen the leadership story, but it is still a preferred signal and more of a competitive disadvantage than a must-have screen.';
  }

  return 'This would strengthen the fit, but it is still a preferred signal and more of a competitive disadvantage than a must-have screen.';
}

function missingSignalNeedsSpecificity(whyItMatters: string): boolean {
  const normalized = normalizeReviewText(whyItMatters);
  return /^the job description emphasizes /.test(normalized)
    || /^a key requirement for the role/.test(normalized)
    || /^the job requires /.test(normalized);
}

function buildMissingSignalWhyItMatters(signal: string): string {
  const normalized = normalizeReviewText(signal);

  if (/\bindustry 4\.0|smart manufacturing|advanced manufacturing\b/.test(normalized)) {
    return 'This is part of the technical and operating model the role expects, and that proof is not obvious in the draft yet.';
  }

  if (/\bazure\b|\bgcp\b|additional cloud|multiple clouds?\b/.test(normalized)) {
    return 'This is part of the technical fit for the role, and the draft does not yet make that broader cloud depth obvious.';
  }

  if (/\bdisaster recovery|business continuity\b/.test(normalized)) {
    return 'This is part of the platform-resilience fit for the role, and the draft does not yet make that proof obvious.';
  }

  return 'This is part of the role fit, and the draft does not yet make that proof obvious.';
}

function buildMaterialJobFitWhyItMatters(requirement: string): string {
  const normalized = normalizeReviewText(requirement);
  const hasYearsThreshold = extractYearsThreshold(requirement) !== null
    || /\b(progressive|seniority|senior|leadership tenure)\b/.test(normalized);
  const hasDomainSignal = /\b(regulated industr(?:y|ies)|financial services|healthcare|consumer products|cpg|manufacturing|saas|public sector|federal|defense|pharma|medtech|ecommerce|e-commerce|retail)\b/i.test(normalized);
  const hasLeadershipSignal = /\b(leadership|executive stakeholders?|executive presence|board(?:-level)?|communication|influence|talent development|high-performing teams?|build and lead|cross-functional|mentor|coach|hire|hiring|cmo|coo|cto|cfo|vice president|vp\b|director)\b/i.test(normalized);
  const hasScaleSignal = extractDollarThreshold(requirement) !== null
    || /\b(\d+\+\s*(?:person|people|member)|p&l|profit and loss|budget|revenue|global|enterprise|multi-site|multisite|plant|plants|facility|facilities|organization)\b/i.test(normalized);
  const hasTechnicalSignal = extractFrameworkEvidencePatterns(normalized).length > 0
    || /\b(service mesh|istio|linkerd|kafka|spark|kubernetes|cloud|architecture|data platform|erp|aws|azure|gcp|microservices)\b/i.test(normalized);

  if (hasYearsThreshold) {
    return 'This is part of the seniority bar for the role, and the draft does not yet make that threshold obvious.';
  }

  if (hasLeadershipSignal && hasScaleSignal) {
    return 'This leadership scope is part of the role fit, and the draft does not yet show direct proof at that scale.';
  }

  if (hasScaleSignal) {
    return 'This level of scale is part of the role fit, and the draft does not yet show direct proof at that level.';
  }

  if (hasDomainSignal) {
    return 'This domain background is part of the role fit, and the draft does not yet show direct proof of it.';
  }

  if (hasTechnicalSignal) {
    return 'This is part of the core technical fit for the role, and the draft does not yet make that proof obvious.';
  }

  if (hasLeadershipSignal) {
    return 'This leadership scope is part of the role fit, and the draft does not yet show direct proof of it.';
  }

  return 'This is central to the role fit, and the draft does not yet make that proof obvious.';
}

function buildHardRequirementWhyItHurts(requirement: string): string {
  const normalized = normalizeReviewText(requirement);

  if (extractYearsThreshold(requirement) !== null) {
    return 'If this tenure threshold is not obvious, the candidate may fail an early screen before the deeper interview discussion starts.';
  }

  if (/\b(certification|certified|certificate|license|licensed|licensure|cpa|pmp|pe)\b/i.test(normalized)) {
    return 'If this credential is truly required and not explicit, the candidate may be screened out before interview selection.';
  }

  if (/\b(bachelor|master|mba|phd|doctorate|degree|foreign equivalent)\b/i.test(normalized)) {
    return 'If this degree requirement is truly required and not explicit, the candidate may be screened out before interview selection.';
  }

  return 'If this requirement is truly mandatory and not explicit, the candidate may be screened out before interview selection.';
}

function buildMaterialJobFitWhyItHurts(requirement: string): string {
  const normalized = normalizeReviewText(requirement);
  const hasYearsThreshold = extractYearsThreshold(requirement) !== null
    || /\b(progressive|seniority|senior|leadership tenure)\b/.test(normalized);
  const hasDomainSignal = /\b(regulated industr(?:y|ies)|financial services|healthcare|consumer products|cpg|manufacturing|saas|public sector|federal|defense|pharma|medtech|ecommerce|e-commerce|retail)\b/i.test(normalized);
  const hasLeadershipSignal = /\b(leadership|executive stakeholders?|executive presence|board(?:-level)?|communication|influence|talent development|high-performing teams?|build and lead|cross-functional|mentor|coach|hire|hiring|cmo|coo|cto|cfo|vice president|vp\b|director)\b/i.test(normalized);
  const hasScaleSignal = extractDollarThreshold(requirement) !== null
    || /\b(\d+\+\s*(?:person|people|member)|p&l|profit and loss|budget|revenue|global|enterprise|multi-site|multisite|plant|plants|facility|facilities|organization)\b/i.test(normalized);
  const hasTechnicalSignal = extractFrameworkEvidencePatterns(normalized).length > 0
    || /\b(service mesh|istio|linkerd|kafka|spark|kubernetes|cloud|architecture|data platform|erp|aws|azure|gcp|microservices)\b/i.test(normalized);

  if (hasYearsThreshold) {
    return 'Without direct proof of this seniority bar, the candidate can look short of the role level even if the broader background is strong.';
  }

  if (hasLeadershipSignal && hasScaleSignal) {
    return 'Without direct proof at this leadership scale, the hiring team may question whether the candidate has operated at the level the role demands.';
  }

  if (hasScaleSignal) {
    return 'Without direct proof at this scale, the hiring team may question whether the candidate has operated at the level the role demands.';
  }

  if (hasDomainSignal) {
    return 'Without direct proof in this domain, the hiring team may question whether the candidate can transfer quickly into the core context of the role.';
  }

  if (hasTechnicalSignal) {
    return 'Without direct proof here, the hiring team may question whether the candidate has the technical depth this role expects.';
  }

  if (hasLeadershipSignal) {
    return 'Without direct proof here, the hiring team may question whether the candidate has the leadership scope this role expects.';
  }

  return 'Without direct proof here, the hiring team may question whether the candidate fully matches this core part of the role.';
}

function softenContradictedSummaryClaims(result: FinalReviewResult): string {
  let summary = result.hiring_manager_verdict.summary;
  const contradictionCorpus = [
    ...result.six_second_scan.important_signals_missing.map((item) => `${item.signal} ${item.why_it_matters}`),
    ...result.concerns.map((concern) => `${concern.related_requirement ?? ''} ${concern.observation}`),
  ].join(' \n ');

  summary = alignInterviewFollowUpSummary(summary, result);

  const hasCommunicationGap = /\b(communication|executive stakeholders?|executive presence|board(?:-level)?|presenting to executive stakeholders?)\b/i.test(contradictionCorpus);
  if (hasCommunicationGap) {
    const softenedCommunication = summary
      .replace(/\bexcellent communication skills(?:\s+and\s+)?/i, '')
      .replace(/\bstrong communication skills(?:\s+and\s+)?/i, '')
      .replace(/\bexcellent executive presence(?:\s+and\s+)?/i, '')
      .replace(/\bboard-level communication skills(?:\s+and\s+)?/i, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+,/g, ',')
      .replace(/\s+\./g, '.')
      .trim();

    if (softenedCommunication !== summary) {
      summary = /communication|executive presence/i.test(softenedCommunication)
        ? softenedCommunication
        : `${softenedCommunication} Communication and executive-facing influence should be validated more explicitly during the interview process.`;
    }
  }

  const hasRealFitConcern = result.hiring_manager_verdict.rating === 'needs_improvement'
    || result.concerns.some((concern) => concern.severity === 'critical')
    || result.concerns.some((concern) => concern.id === 'material_job_fit_risk')
    || result.six_second_scan.important_signals_missing.some((item) => /must-have|all requirements|role fit|does not yet prove/i.test(item.why_it_matters));

  if (
    hasRealFitConcern
    && result.hiring_manager_verdict.rating === 'possible_interview'
    && /\b(compelling (?:candidate|fit|profile|blend|combination)|strong contender)\b/i.test(summary)
  ) {
    summary = summary
      .replace(/\bmake (?:them|the candidate) a compelling candidate\b/i, 'make them a credible candidate')
      .replace(/\bmake (?:them|the candidate) a compelling fit\b/i, 'make them a credible fit')
      .replace(/\ba compelling candidate for the ([^.]+?) role\b/i, 'a credible candidate for the $1 role')
      .replace(/\ba compelling fit for the ([^.]+?) role\b/i, 'a credible fit for the $1 role')
      .replace(/\ba compelling candidate for this role\b/i, 'a credible candidate for this role')
      .replace(/\ba compelling fit for this role\b/i, 'a credible fit for this role')
      .replace(/\bcompelling candidate\b/i, 'credible candidate')
      .replace(/\bcompelling fit\b/i, 'credible fit')
      .replace(/\bcompelling profile\b/i, 'credible profile')
      .replace(/\bcompelling blend\b/i, 'solid blend')
      .replace(/\bcompelling combination\b/i, 'solid combination')
      .replace(/\bstrong contender\b/i, 'credible contender')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+,/g, ',')
      .replace(/\s+\./g, '.')
      .trim();
  }

  if (
    hasRealFitConcern
    && /\bstrong fit\b/i.test(summary)
  ) {
    summary = summary
      .replace(/\bmake (?:them|the candidate) a strong fit\b/i, 'make them a credible candidate, but key fit evidence is still incomplete')
      .replace(/\bstrong fit for the ([^.]+?) role\b/i, 'credible background for the $1 role, but key fit evidence is still incomplete')
      .replace(/\ba strong fit for this role\b/i, 'a credible candidate, but key fit evidence is still incomplete')
      .replace(/\bstrong fit\b/i, 'credible but still incomplete fit')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+,/g, ',')
      .replace(/\s+\./g, '.')
      .trim();
  }

  if (
    hasRealFitConcern
    && !/validated more explicitly|key fit evidence is still incomplete|should be treated as a final interview-ready draft|clearest remaining proof gap/i.test(summary)
  ) {
    const primaryConcern = result.concerns
      .filter((concern) => concern.severity !== 'minor')
      .map((concern) => cleanImprovementSummaryText(concern.related_requirement ?? concern.observation ?? ''))
      .find(Boolean);

    summary = primaryConcern
      ? `${summary} The clearest remaining proof gap is ${primaryConcern}.`
      : `${summary} One important proof gap still needs clearer evidence before this draft is final.`;
  }

  const overclaimedMissingSignal = findOverclaimedMissingSignal(summary, result);
  if (
    overclaimedMissingSignal
    && !/The clearest remaining proof gap is /i.test(summary)
    && !new RegExp(`clearest remaining proof gap is ${escapeRegExp(overclaimedMissingSignal)}`, 'i').test(summary)
  ) {
    summary = summary.replace(
      /One important proof gap still needs clearer evidence before this draft is final\.?$/i,
      '',
    ).trim();
    summary = `${summary} The clearest remaining proof gap is ${overclaimedMissingSignal}.`;
  }

  return summary;
}

function alignInterviewFollowUpSummary(summary: string, result: FinalReviewResult): string {
  const probeSentencePattern = /\b(?:However|But)[^.]*?(?:probe further|beneficial to discuss|delve deeper|explore)[^.]*\./i;
  if (!probeSentencePattern.test(summary)) {
    return summary;
  }

  const followUpTopics = Array.from(new Set(
    result.concerns
      .map((concern) => extractConcernFollowUpTopic(concern))
      .filter(Boolean),
  ));

  const rewritten = followUpTopics.length === 0
    ? ''
    : followUpTopics.length === 1
      ? `However, interview follow-up should focus on ${followUpTopics[0]}.`
      : `However, interview follow-up should focus on ${followUpTopics[0]} and ${followUpTopics[1]}.`;

  return cleanImprovementSummaryText(
    summary
      .replace(probeSentencePattern, rewritten ? ` ${rewritten}` : ' ')
      .replace(/\s{2,}/g, ' '),
  );
}

function extractConcernFollowUpTopic(concern: FinalReviewResult['concerns'][number]): string | null {
  const observation = cleanImprovementSummaryText(concern.observation ?? '');
  const strippedObservation = observation
    .replace(/^Must-have role-fit evidence is still thin:\s*/i, '')
    .replace(/^The candidate'?s\s+/i, '')
    .replace(/^Lack of explicit mention of\s+/i, '')
    .replace(/^Lack of direct experience with\s+/i, '')
    .replace(/^Limited direct mention of\s+/i, '')
    .replace(/^Limited evidence of\s+/i, '')
    .replace(/^While the candidate mentions experience with\s+/i, 'experience with ')
    .replace(/\s+is not explicitly stated\.?$/i, '')
    .replace(/\s+is not explicitly mentioned\.?$/i, '')
    .replace(/\s+is not clearly highlighted\.?$/i, '')
    .replace(/\s+is not clearly evident\.?$/i, '')
    .replace(/\s+is not fully highlighted\.?$/i, '')
    .replace(/\s+may raise concerns\.?$/i, '')
    .trim();

  if (strippedObservation) {
    return strippedObservation;
  }

  const requirement = cleanImprovementSummaryText(concern.related_requirement ?? '');
  return requirement || null;
}

function findOverclaimedMissingSignal(summary: string, result: FinalReviewResult): string | null {
  const summaryTokens = new Set(extractSalientRequirementTokens(summary));
  if (summaryTokens.size === 0) return null;
  const lowSignalOverlapTokens = new Set([
    'with', 'without', 'direct', 'clear', 'explicit', 'specific', 'mention', 'mentions',
    'strong', 'background', 'additional', 'cloud', 'systems', 'technology', 'technologies',
    'experience', 'evident', 'evidence', 'proof', 'managed', 'management', 'quality', 'one',
  ]);

  const candidateSignals = [
    ...result.six_second_scan.important_signals_missing
      .filter((item) => /must-have|role fit|does not yet prove|not yet prove|key requirement/i.test(item.why_it_matters))
      .map((item) => item.signal),
    ...result.concerns
      .filter((concern) => concern.type === 'missing_evidence' && concern.severity !== 'minor')
      .map((concern) => concern.related_requirement ?? concern.observation),
  ];

  for (const signal of candidateSignals) {
    const tokens = extractSalientRequirementTokens(signal).filter((token) => !lowSignalOverlapTokens.has(token));
    if (tokens.length < 2) continue;

    const matchedTokenCount = tokens.filter((token) => summaryTokens.has(token)).length;
    if (matchedTokenCount >= 2) {
      return signal;
    }
  }

  return null;
}

export function buildFinalReviewPrompts({
  companyName,
  roleTitle,
  resumeText,
  jobDescription,
  jobRequirements,
  hiddenSignals,
  benchmarkProfileSummary,
  benchmarkRequirements,
  careerProfile,
}: {
  companyName: string;
  roleTitle: string;
  resumeText: string;
  jobDescription: string;
  jobRequirements: string[];
  hiddenSignals: string[];
  benchmarkProfileSummary?: string;
  benchmarkRequirements: string[];
  careerProfile: CareerProfileV2 | null;
}) {
  const hardRequirements = jobRequirements.filter((requirement) => isHardRequirementRequirement(requirement));

  const requirementsList = jobRequirements.length
    ? `\n\nJOB REQUIREMENTS TO EVALUATE:\n${jobRequirements.map((requirement) => `- ${requirement}`).join('\n')}`
    : '';

  const hardRequirementsBlock = hardRequirements.length
    ? `\n\nPOTENTIAL HARD REQUIREMENTS / SCREEN-OUT RISKS:\n${hardRequirements.map((requirement) => `- ${requirement}`).join('\n')}`
    : '';

  const hiddenSignalsBlock = hiddenSignals.length
    ? `\n\nHIDDEN HIRING SIGNALS:\n${hiddenSignals.map((signal) => `- ${signal}`).join('\n')}`
    : '';

  const benchmarkProfile = benchmarkProfileSummary
    ? `\n\nBENCHMARK CANDIDATE PROFILE:\n${benchmarkProfileSummary}`
    : '';

  const benchmarkRequirementsList = benchmarkRequirements.length
    ? `\n\nBENCHMARK REQUIREMENTS AND DIFFERENTIATORS:\n${benchmarkRequirements.map((requirement) => `- ${requirement}`).join('\n')}`
    : '';

  const careerProfileBlock = careerProfile
    ? `\n\nCAREER PROFILE:\nProfile summary: ${careerProfile.profile_summary}\nTarget roles: ${careerProfile.targeting.target_roles.join(', ') || 'Not yet defined'}\nCore strengths: ${careerProfile.positioning.core_strengths.join(', ') || 'Not yet defined'}\nProof themes: ${careerProfile.positioning.proof_themes.join(', ') || 'Not yet defined'}\nDifferentiators: ${careerProfile.positioning.differentiators.join(', ') || 'Not yet defined'}\nKnown for: ${careerProfile.narrative.known_for_what || 'Not yet defined'}\nConstraints: ${careerProfile.preferences.constraints.join(', ') || 'None recorded'}`
    : '';

  const systemPrompt = `You are running the final review for a tailored resume targeting the ${roleTitle} position at ${companyName}.

This final review has two distinct lenses:
1. A 6-second recruiter scan: would a skim reader keep reading?
2. A hiring manager review: would this candidate earn an interview?

Evaluation priorities:
- Primary standard: fit for the actual job description.
- Secondary standard: competitiveness relative to a strong benchmark candidate.
- Do NOT let benchmark-only gaps outweigh strong job-description fit.
- Treat benchmark gaps as competitive disadvantages unless they directly affect success in the role.
- If the resume appears to miss a hard requirement such as a degree, certification, license, or clearly required credential, call that out directly as a screen-out risk rather than pretending adjacent experience fully solves it.
- Be skeptical, commercial, and specific.
- If something is not clearly shown on the resume, treat it as missing or only partially evidenced.
- Do not fabricate experience, metrics, certifications, scope, or credentials.

Return valid JSON only in this exact shape:
{
  "six_second_scan": {
    "decision": "continue_reading" | "skip",
    "reason": "1-2 sentence explanation",
    "top_signals_seen": [
      {
        "signal": "what stands out immediately",
        "why_it_matters": "why a recruiter or hiring manager cares",
        "visible_in_top_third": true
      }
    ],
    "important_signals_missing": [
      {
        "signal": "what should have been obvious but was not",
        "why_it_matters": "why its absence hurts"
      }
    ]
  },
  "hiring_manager_verdict": {
    "rating": "strong_interview_candidate" | "possible_interview" | "needs_improvement" | "likely_rejected",
    "summary": "2-3 sentence hiring manager reaction"
  },
  "fit_assessment": {
    "job_description_fit": "strong" | "moderate" | "weak",
    "benchmark_alignment": "strong" | "moderate" | "weak",
    "business_impact": "strong" | "moderate" | "weak",
    "clarity_and_credibility": "strong" | "moderate" | "weak"
  },
  "top_wins": [
    {
      "win": "candidate's strongest accomplishment or selling point",
      "why_powerful": "why this matters for the target role",
      "aligned_requirement": "job or benchmark requirement it supports",
      "prominent_enough": true,
      "repositioning_recommendation": "how to move or emphasize it if needed"
    }
  ],
  "concerns": [
    {
      "id": "concern_1",
      "severity": "critical" | "moderate" | "minor",
      "type": "missing_evidence" | "weak_positioning" | "missing_metric" | "unclear_scope" | "benchmark_gap" | "clarity_issue" | "credibility_risk",
      "observation": "specific problem in the resume",
      "why_it_hurts": "why this weakens interview odds",
      "target_section": "section to fix",
      "related_requirement": "job or benchmark requirement tied to this issue",
      "fix_strategy": "specific recommendation phrased as a resume edit instruction",
      "suggested_resume_edit": "optional sample rewrite if justified",
      "requires_candidate_input": true,
      "clarifying_question": "only include if an answer from the candidate could materially improve this item"
    }
  ],
  "structure_recommendations": [
    {
      "issue": "structural problem",
      "recommendation": "specific fix",
      "priority": "high" | "medium" | "low"
    }
  ],
  "benchmark_comparison": {
    "advantages_vs_benchmark": ["where the candidate already compares well"],
    "gaps_vs_benchmark": ["where the candidate looks weaker"],
    "reframing_opportunities": ["truthful ways to position adjacent or like-kind experience more competitively"]
  },
  "improvement_summary": ["highest-value change 1", "highest-value change 2", "highest-value change 3"]
}

RULES:
- Job-description fit should drive the verdict.
- Benchmark alignment should be treated as a secondary competitiveness signal.
- Hard requirements that are not clearly evidenced should be elevated as real screening risks.
- The recruiter scan, top_signals_seen list, and hiring manager verdict must be internally consistent.
- Every positive claim must point to specific resume evidence, not generic praise about the summary or competencies.
- top_signals_seen.signal should name a concrete accomplishment, scope indicator, credential, title line, or metric the recruiter can actually see in the top third.
- When concrete proof exists, lead top_signals_seen with that proof instead of generic years-of-experience or broad leadership phrasing.
- Avoid vague statements like "clear executive summary", "strong background", or "relevant skills" unless they are paired with the exact proof that makes them credible.
- important_signals_missing should name the exact missing proof, metric, credential, or scope statement that a recruiter would expect to see quickly.
- The hiring_manager_verdict.summary should cite at least one concrete strength or concern from the resume, not only general impressions.
- If the resume shows credible, role-relevant strengths, populate top_signals_seen instead of leaving it empty.
- Reserve "skip" for genuinely weak top-third impressions or true screen-out risk. If the recruiter would keep reading, use "continue_reading".
- Every concern must have a concrete fix strategy.
- Only include suggested_resume_edit when the wording is directly supported by the resume evidence already shown. If proof is missing, omit suggested_resume_edit and ask a clarifying question instead of inventing new experience, training, or certifications.
- Ask no more than 3 clarifying questions total.
- Only ask a clarifying question when the answer could materially improve a truthful resume bullet.
- Limit the output to the highest-value findings.
- Do not include markdown fences or commentary outside the JSON object.`;

  const userPrompt = `FINAL TAILORED RESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jobDescription}${requirementsList}${hardRequirementsBlock}${hiddenSignalsBlock}${benchmarkProfile}${benchmarkRequirementsList}${careerProfileBlock}\n\nRun the final review.`;

  return { systemPrompt, userPrompt };
}
