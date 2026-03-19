import { z } from 'zod';
import type { CareerProfileV2 } from '../lib/career-profile-context.js';
import type { V2PipelineSSEEvent, V2PipelineStage } from '../agents/resume-v2/types.js';

export const startSchema = z.object({
  resume_text: z.string().min(50, 'Resume must be at least 50 characters').max(50000, 'Resume must be at most 50,000 characters'),
  job_description: z.string().min(50, 'Job description must be at least 50 characters').max(50000, 'Job description must be at most 50,000 characters'),
  user_context: z.string().optional(),
  gap_coaching_responses: z.array(z.object({
    requirement: z.string().min(1),
    action: z.enum(['approve', 'context', 'skip']),
    user_context: z.string().optional(),
  })).optional(),
  pre_scores: z.object({
    ats_match: z.number().int().min(0).max(100),
    keywords_found: z.array(z.string()),
    keywords_missing: z.array(z.string()),
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
  section_context: z.string().optional(),
  edit_context: editContextSchema,
});

export type StoredV2PipelineData = {
  stage: V2PipelineStage;
  jobIntelligence: unknown | null;
  candidateIntelligence: unknown | null;
  benchmarkCandidate: unknown | null;
  gapAnalysis: unknown | null;
  gapCoachingCards: unknown[] | null;
  preScores: unknown | null;
  narrativeStrategy: unknown | null;
  resumeDraft: unknown | null;
  assembly: unknown | null;
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
    gapCoachingCards: null,
    preScores: null,
    narrativeStrategy: null,
    resumeDraft: null,
    assembly: null,
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

IMPORTANT: Never fabricate achievements, metrics, or claims. Every fact in the replacement must be traceable to the original text or surrounding resume context.`;

  const instructions: Record<EditAction, string> = {
    strengthen: `Rewrite the selected text to be more impactful. Use stronger action verbs, sharper language, and executive-caliber voice. Eliminate weak qualifiers and passive constructions. Preserve all factual claims. CRITICAL: Do NOT fabricate metrics, percentages, dollar amounts, or team sizes. Only sharpen language and strengthen action verbs. If the original text lacks specific numbers, do not add made-up numbers. Preserve all factual claims exactly as stated.`,
    add_metrics: `Enhance the selected text by adding or strengthening quantified results. Infer plausible numbers ONLY from the surrounding resume context — if explicit figures are absent, use conservative ranges (e.g., "team of 10+" rather than "team of 47") or directional language (e.g., "reduced costs by over 15%"). Every metric must be defensible given the context. Do NOT invent specific dollar amounts, exact percentages, or precise headcounts that aren't supported by the resume.`,
    shorten: `Compress the selected text to its most essential form. Cut every word that does not carry meaning. Preserve all key accomplishments, metrics, and impact. The result should be tighter and punchier, not thinner.`,
    add_keywords: `Naturally incorporate relevant keywords from the job description into the selected text. The integration must read fluently — never keyword-stuffed. Prioritize keywords that reflect genuine overlap with the candidate's experience. Do NOT change the meaning or add claims not present in the original text.`,
    rewrite: `Completely rewrite the selected text from scratch while preserving all underlying information, accomplishments, and meaning. Aim for cleaner structure, stronger language, and greater readability.`,
    custom: `Follow this instruction exactly: ${customInstruction ?? '(no instruction provided)'}`,
    not_my_voice: `Rewrite the selected text to sound more authentic and human. Strip out corporate jargon, buzzwords, and formulaic resume-speak. The revised text should sound like how this specific professional actually talks about their work — direct, specific, and genuine.`,
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

export const gapChatSchema = z.object({
  requirement: z.string().min(1).max(1000).trim(),
  classification: z.enum(['partial', 'missing', 'strong']),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(2000),
  })).max(20),
  context: z.object({
    evidence: z.array(z.string().max(1000)).max(20),
    current_strategy: z.string().max(2000).optional(),
    ai_reasoning: z.string().max(2000).optional(),
    inferred_metric: z.string().max(500).optional(),
    job_description_excerpt: z.string().max(5000),
    candidate_experience_summary: z.string().max(3000),
  }),
});

export const structuredCoachingResponseSchema = z.object({
  response: z.string(),
  suggested_resume_language: z.string().optional(),
  follow_up_question: z.string().optional(),
  current_question: z.string().optional(),
  needs_candidate_input: z.boolean().optional(),
  recommended_next_action: z.enum(['answer_question', 'review_edit', 'try_another_angle', 'skip', 'confirm']).optional(),
});

export const finalReviewChatSchema = z.object({
  concern_id: z.string().min(1).max(200).trim(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(2000),
  })).max(20),
  context: z.object({
    concern_type: z.enum(['missing_evidence', 'weak_positioning', 'missing_metric', 'unclear_scope', 'benchmark_gap', 'clarity_issue', 'credibility_risk']),
    severity: z.enum(['critical', 'moderate', 'minor']),
    observation: z.string().max(2000),
    why_it_hurts: z.string().max(2000),
    fix_strategy: z.string().max(3000),
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
    id: z.string(),
    severity: z.enum(['critical', 'moderate', 'minor']),
    type: z.enum(['missing_evidence', 'weak_positioning', 'missing_metric', 'unclear_scope', 'benchmark_gap', 'clarity_issue', 'credibility_risk']),
    observation: z.string(),
    why_it_hurts: z.string(),
    target_section: z.string().optional(),
    related_requirement: z.string().optional(),
    fix_strategy: z.string(),
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

  const leftIsDegree = /\b(bachelor'?s|master'?s|mba|phd|doctorate|degree|foreign equivalent)\b/.test(normalizedLeft);
  const rightIsDegree = /\b(bachelor'?s|master'?s|mba|phd|doctorate|degree|foreign equivalent)\b/.test(normalizedRight);
  if (!leftIsDegree || !rightIsDegree) return false;

  const stopTokens = new Set(['bachelor', 'bachelors', 'master', 'masters', 'mba', 'phd', 'doctorate', 'degree', 'higher', 'field', 'fields', 'foreign', 'equivalent', 'other', 'related', 'or', 'and']);
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
  return /\d/.test(normalized)
    || /\b(board|executive presence|p&l|profit and loss|budget|revenue|team|teams|people|organization|portfolio|multi-brand|global|multi-region|dtc|e-?commerce)\b/.test(normalized);
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

function createRecruiterSignalsFromWins(result: FinalReviewResult) {
  return result.top_wins.slice(0, 3).map((win) => ({
    signal: win.win,
    why_it_matters: win.why_powerful,
    visible_in_top_third: win.prominent_enough,
  }));
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

function createRecruiterSignalFromSummary(summary: string) {
  const firstSentence = summary.split(/(?<=[.!?])\s+/)[0]?.trim() || summary.trim();
  const signal = firstSentence.length > 140 ? `${firstSentence.slice(0, 137).trim()}...` : firstSentence;
  return {
    signal,
    why_it_matters: 'This was the clearest positive signal described in the deeper hiring-manager review.',
    visible_in_top_third: false,
  };
}

export function stabilizeFinalReviewResult(
  result: FinalReviewResult,
  options?: { hardRequirementRisks?: string[]; materialJobFitRisks?: string[] },
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
  const materialJobFitRisks = Array.from(new Set((options?.materialJobFitRisks ?? []).filter(Boolean)));
  const criticalConcernCount = normalized.concerns.filter((concern) => concern.severity === 'critical').length;

  if (normalized.six_second_scan.top_signals_seen.length === 0 && normalized.top_wins.length > 0) {
    normalized.six_second_scan.top_signals_seen = createRecruiterSignalsFromWins(normalized);
  }

  if (
    normalized.six_second_scan.top_signals_seen.length === 0
    && hasPositiveSummaryLanguage(normalized.hiring_manager_verdict.summary)
  ) {
    normalized.six_second_scan.top_signals_seen = [
      createRecruiterSignalFromSummary(normalized.hiring_manager_verdict.summary),
    ];
  }

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

  normalized.six_second_scan.important_signals_missing = normalized.six_second_scan.important_signals_missing.map((item) => ({
    ...item,
    why_it_matters: softenPreferredQualificationRiskLanguage(item.signal, item.why_it_matters),
  }));

  const hardRequirementRisks = getEffectiveHardRequirementRisks(
    normalized,
    options?.hardRequirementRisks ?? [],
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
        why_it_hurts: 'This can screen the candidate out before interview selection if the credential or threshold is truly missing or not explicit.',
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
        why_it_matters: 'This is a must-have part of the role fit, and the current draft does not yet prove it strongly enough.',
      });
    }

    if (!normalized.concerns.some((concern) => concern.id === 'material_job_fit_risk')) {
      normalized.concerns.unshift({
        id: 'material_job_fit_risk',
        severity: materialJobFitRisks.length > 1 ? 'critical' : 'moderate',
        type: 'missing_evidence',
        observation: `Must-have role-fit evidence is still thin: ${materialJobFitRisks[0]}`,
        why_it_hurts: 'Even without being a formal credential screen-out, this can weaken the interview case when the requirement is central to the role.',
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

  return normalized;
}

export function getEffectiveHardRequirementRisks(
  result: FinalReviewResult,
  hardRequirementRisks: string[],
): string[] {
  return filterContradictedHardRequirementRisks(
    Array.from(new Set(hardRequirementRisks.filter(Boolean))),
    result,
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
): string[] {
  const signalCorpus = [
    ...result.six_second_scan.top_signals_seen.map((item) => item.signal),
    ...result.top_wins.map((item) => item.win),
    result.hiring_manager_verdict.summary,
  ].join(' \n ');

  return risks.filter((risk) => !isYearsThresholdContradictedByEvidence(risk, signalCorpus));
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

function extractYearsThreshold(text: string): number | null {
  const match = text.match(/\b(?:minimum of\s*)?(\d+)\+?\s+years?\b/i);
  return match ? Number(match[1]) : null;
}

function softenPreferredQualificationRiskLanguage(signal: string, whyItMatters: string): string {
  if (!/preferred qualification|preferred|nice to have|bonus|plus/i.test(`${signal} ${whyItMatters}`)) {
    return whyItMatters;
  }

  return whyItMatters.replace(/screen(?:-| )out risk/gi, 'competitive disadvantage');
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
- Avoid vague statements like "clear executive summary", "strong background", or "relevant skills" unless they are paired with the exact proof that makes them credible.
- important_signals_missing should name the exact missing proof, metric, credential, or scope statement that a recruiter would expect to see quickly.
- The hiring_manager_verdict.summary should cite at least one concrete strength or concern from the resume, not only general impressions.
- If the resume shows credible, role-relevant strengths, populate top_signals_seen instead of leaving it empty.
- Reserve "skip" for genuinely weak top-third impressions or true screen-out risk. If the recruiter would keep reading, use "continue_reading".
- Every concern must have a concrete fix strategy.
- Ask no more than 3 clarifying questions total.
- Only ask a clarifying question when the answer could materially improve a truthful resume bullet.
- Limit the output to the highest-value findings.
- Do not include markdown fences or commentary outside the JSON object.`;

  const userPrompt = `FINAL TAILORED RESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jobDescription}${requirementsList}${hardRequirementsBlock}${hiddenSignalsBlock}${benchmarkProfile}${benchmarkRequirementsList}${careerProfileBlock}\n\nRun the final review.`;

  return { systemPrompt, userPrompt };
}
