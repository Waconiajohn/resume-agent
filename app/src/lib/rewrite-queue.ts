import type {
  BenchmarkCandidate,
  CoachingThreadSnapshot,
  FinalReviewResult,
  GapAnalysis,
  GapCoachingCard,
  GapChatMessage,
  JobIntelligence,
  RequirementGap,
  RequirementWorkItem,
  ResumeDraft,
  RewriteQueueCategory,
  RewriteQueueEvidence,
  RewriteQueueItem,
  RewriteQueueSource,
  RewriteQueueSummary,
} from '@/types/resume-v2';
import { evidenceLooksDirectForRequirement } from './requirement-evidence';
import { canonicalRequirementSignals } from './resume-requirement-signals';
import { scoreSuggestion } from './suggestion-scoring';

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[.,;:!?]+$/, '');
}

function hasMeaningfulSourceEvidence(text: string | null | undefined): text is string {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/^#+\s*/.test(trimmed)) return false;
  if (/canonical requirement catalog/i.test(trimmed)) return false;
  if (/^(job description|benchmark|jd|requirement catalog|resume evidence|required qualifications?)$/i.test(trimmed)) return false;
  return true;
}

function looksLikeResumeRewrite(text: string | null | undefined): text is string {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  const wordCount = trimmed.split(/\s+/).length;
  const hasStrongVerb = /\b(led|built|developed|tracked|drove|improved|managed|owned|created|launched|delivered|oversaw|designed|implemented|optimized|reduced|increased|grew|guided|ran|used|partnered)\b/i.test(trimmed);
  const looksLikeLabel = /\b(experience|expertise|background|exposure)\b/i.test(trimmed) && wordCount <= 6;
  const looksLikeInstruction = /^(use|acknowledge|frame|highlight|position|naturally\b|translate|connect|show|bring|surface|tie|focus on|lean on)\b/i.test(trimmed);

  if (looksLikeLabel) return false;
  if (looksLikeInstruction) return false;
  if (wordCount < 5) return false;

  return hasStrongVerb || wordCount >= 8;
}

function looksLikeResumeEvidenceSnippet(text: string | null | undefined, requirement: string): text is string {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/^#+\s*/.test(trimmed)) return false;
  if (/^(job description|benchmark|jd|canonical requirement catalog|requirement catalog|resume evidence|required qualifications?|source evidence)$/i.test(trimmed)) {
    return false;
  }

  if (normalize(trimmed) === normalize(requirement)) return false;

  const wordCount = trimmed.split(/\s+/).length;
  const hasStrongVerb = /\b(led|built|developed|tracked|drove|improved|managed|owned|created|launched|delivered|oversaw|designed|implemented|optimized|reduced|increased|grew|guided|ran|used|partnered|presented|executed|standardized|scaled)\b/i.test(trimmed);
  const hasMetricSignal = /[$%]|\b\d+\b|\b(kpi|kpis|metric|metrics|scorecard|scorecards|dashboard|dashboards|budget|revenue|cost|throughput|latency|uptime)\b/i.test(trimmed);
  const hasCredentialSignal = /\b(bachelor'?s|master'?s|mba|phd|doctorate|degree|certification|certified|license|licensed|licensure|aws|azure|gcp|pmp|cpa|rn|pe)\b/i.test(trimmed);
  const hasIndustrySignal = /\b(financial services|banking|healthcare|insurance|energy|oil|gas|manufacturing|retail|telecom|logistics|transportation|saas|software|fintech|medtech|pharma|public sector|government|education)\b/i.test(trimmed);
  const looksLikeLabel = /\b(experience|expertise|background|exposure|knowledge|skills?)\b/i.test(trimmed) && wordCount <= 7;

  if (looksLikeLabel) return false;
  if (wordCount < 3 && !hasStrongVerb && !hasMetricSignal && !hasCredentialSignal && !hasIndustrySignal) return false;

  return true;
}

function summarizeEvidenceSnippet(text: string | null | undefined): string | null {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 140) return trimmed;
  return `${trimmed.slice(0, 137).trimEnd()}...`;
}

function buildStarterQuestion(args: {
  requirement: string;
  category: RewriteQueueCategory;
  source: RewriteQueueSource;
  currentEvidenceText?: string | null;
  sourceEvidenceText?: string | null;
}): string {
  const evidenceSnippet = summarizeEvidenceSnippet(args.currentEvidenceText ?? null);
  const promptPrefix = evidenceSnippet
    ? `Your resume already shows "${evidenceSnippet}". `
    : args.source === 'benchmark'
      ? 'Strong benchmark candidates usually show this more directly. '
      : '';

  if (args.category === 'hard_gap') {
    return `Do you actually have ${args.requirement}, or is this a real gap we should keep visible?`;
  }

  const sourceSnippet = summarizeEvidenceSnippet(args.sourceEvidenceText ?? null);
  if (sourceSnippet && normalize(sourceSnippet) !== normalize(args.requirement)) {
    return `${promptPrefix}What is the clearest example from your background that proves this role need: "${sourceSnippet}"?`;
  }

  return `${promptPrefix}What is the clearest concrete example that proves "${args.requirement}" for this role?`;
}

function looksLikeTargetedStarterQuestion(question: string | null | undefined, _requirement: string): boolean {
  if (typeof question !== 'string') return false;
  const trimmed = question.trim();
  if (!trimmed) return false;
  if (trimmed.split(/\s+/).length < 5) return false;

  const normalizedQuestion = trimmed.toLowerCase();
  if (
    /^(tell me about|can you walk me through your experience|what experience do you have|share any experience|describe your experience)\b/.test(normalizedQuestion)
    || /\brelated to\b/.test(normalizedQuestion)
  ) {
    return false;
  }

  return true;
}

function classificationWeight(classification: RequirementGap['classification']): number {
  if (classification === 'missing') return 0;
  if (classification === 'partial') return 1;
  return 2;
}

function importanceWeight(importance?: RequirementGap['importance']): number {
  if (importance === 'must_have') return 0;
  if (importance === 'important') return 1;
  return 2;
}

function bucketWeight(bucket: RewriteQueueItem['bucket']): number {
  if (bucket === 'needs_attention') return 0;
  if (bucket === 'partially_addressed') return 1;
  return 2;
}

function categoryWeight(category: RewriteQueueCategory): number {
  switch (category) {
    case 'quick_win':
      return 0;
    case 'proof_upgrade':
      return 1;
    case 'hard_gap':
      return 2;
    case 'benchmark_stretch':
      return 3;
    case 'final_review_issue':
    default:
      return 4;
  }
}

function actionWeight(action: RewriteQueueItem['recommendedNextStep']['action']): number {
  switch (action) {
    case 'review_edit':
    case 'review_suggested_fix':
      return 0;
    case 'answer_question':
      return 1;
    case 'check_hard_requirement':
      return 2;
    case 'view_in_resume':
    case 'verify':
    case 'rerun_final_review':
    default:
      return 3;
  }
}

/**
 * Primary sort tier: AI-enhanced items needing approval come before items requiring
 * candidate input, which come before everything else. This ensures the review queue
 * starts with fast, satisfying approvals that build momentum before asking for input.
 */
function actionTierWeight(item: RewriteQueueItem): number {
  // Tier 0: AI-enhanced items needing approval (fast, satisfying)
  if (item.recommendedNextStep.action === 'review_edit') {
    return 0;
  }
  // Tier 1: Items needing candidate input
  if (
    item.recommendedNextStep.action === 'answer_question'
    || item.recommendedNextStep.action === 'check_hard_requirement'
  ) {
    return 1;
  }
  // Tier 2: Everything else (verify, view_in_resume, rerun_final_review, etc.)
  return 2;
}

function latestAssistantMessage(snapshot: CoachingThreadSnapshot | null | undefined, key: string): GapChatMessage | null {
  const messages = snapshot?.items[normalize(key)]?.messages ?? [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') {
      return messages[index];
    }
  }
  return null;
}

function resolvedLanguage(snapshot: CoachingThreadSnapshot | null | undefined, key: string): string | null {
  return snapshot?.items[normalize(key)]?.resolvedLanguage ?? null;
}

function collectResumeEvidenceForRequirement(resume: ResumeDraft | null | undefined, requirement: string): RewriteQueueEvidence[] {
  if (!resume) return [];
  const normalizedRequirement = normalize(requirement);
  const evidence: RewriteQueueEvidence[] = [];

  const matchesRequirement = (
    primaryRequirement: string | null | undefined,
    requirements: string[] | undefined,
  ) => canonicalRequirementSignals(primaryRequirement, requirements)
    .some((item) => normalize(item) === normalizedRequirement);

  if (matchesRequirement(undefined, resume.executive_summary.addresses_requirements)) {
    if (evidenceLooksDirectForRequirement(requirement, resume.executive_summary.content)) {
      evidence.push({
        text: resume.executive_summary.content,
        source: 'resume',
        section: 'Executive Summary',
        isNew: resume.executive_summary.is_new,
        basis: 'mapped',
      });
    }
  }

  for (const accomplishment of resume.selected_accomplishments) {
    if (matchesRequirement(accomplishment.primary_target_requirement, accomplishment.addresses_requirements)) {
      if (!evidenceLooksDirectForRequirement(requirement, accomplishment.content)) {
        continue;
      }
      evidence.push({
        text: accomplishment.content,
        source: 'resume',
        section: 'Selected Accomplishments',
        isNew: accomplishment.is_new,
        basis: 'mapped',
      });
    }
  }

  for (const experience of resume.professional_experience) {
    if (matchesRequirement(undefined, experience.scope_statement_addresses_requirements)) {
      if (!evidenceLooksDirectForRequirement(requirement, experience.scope_statement)) {
        continue;
      }
      evidence.push({
        text: experience.scope_statement,
        source: 'resume',
        section: `Professional Experience - ${experience.company}`,
        isNew: experience.scope_statement_is_new ?? false,
        basis: 'mapped',
      });
    }

    for (const bullet of experience.bullets) {
      if (matchesRequirement(bullet.primary_target_requirement, bullet.addresses_requirements)) {
        if (!evidenceLooksDirectForRequirement(requirement, bullet.text)) {
          continue;
        }
        evidence.push({
          text: bullet.text,
          source: 'resume',
          section: `Professional Experience - ${experience.company}`,
          isNew: bullet.is_new,
          basis: 'mapped',
        });
      }
    }
  }

  return evidence;
}

function sourceEvidenceForRequirement(args: {
  requirement: RequirementGap;
  jobIntelligence: JobIntelligence;
  benchmarkCandidate?: BenchmarkCandidate | null;
}): RewriteQueueEvidence[] {
  const source = args.requirement.source ?? (args.requirement.score_domain === 'benchmark' ? 'benchmark' : 'job_description');
  const evidence: RewriteQueueEvidence[] = [];

  if (source === 'job_description') {
    const competency = args.jobIntelligence.core_competencies.find(
      (item) => normalize(item.competency) === normalize(args.requirement.requirement),
    );
    if (hasMeaningfulSourceEvidence(competency?.evidence_from_jd)) {
      evidence.push({
        text: competency.evidence_from_jd,
        source: 'job_description',
        basis: 'source',
      });
    } else if (hasMeaningfulSourceEvidence(args.requirement.source_evidence)) {
      evidence.push({
        text: args.requirement.source_evidence,
        source: 'job_description',
        basis: 'source',
      });
    } else {
      evidence.push({
        text: args.requirement.requirement,
        source: 'job_description',
        basis: 'source',
      });
    }
  }

  if (source === 'benchmark' && hasMeaningfulSourceEvidence(args.requirement.source_evidence)) {
    evidence.push({
      text: args.requirement.source_evidence,
      source: 'benchmark',
      basis: 'source',
    });
  }

  if (source === 'benchmark' && evidence.length === 0 && args.benchmarkCandidate) {
    evidence.push({
      text: args.benchmarkCandidate.ideal_profile_summary,
      source: 'benchmark',
      basis: 'source',
    });
  }

  return evidence;
}

function hardRequirementText(requirement: string, sourceEvidence: RewriteQueueEvidence[]): boolean {
  const combined = [requirement, ...sourceEvidence.map((item) => item.text)].join(' ').toLowerCase();
  return /\b(bachelor'?s|master'?s|mba|phd|doctorate|degree|certification|certified|license|licensed|licensure|foreign equivalent|pe\b|pmp\b|cpa\b|rn\b)\b/.test(combined);
}

function whyRequirementMatters(source: RewriteQueueSource, sourceEvidence: RewriteQueueEvidence[]): string {
  const primarySourceText = sourceEvidence[0]?.text?.trim();

  if (hardRequirementText(primarySourceText ?? '', sourceEvidence)) {
    return 'This looks like a hard requirement and could become a real screen-out risk if it is truly missing.';
  }

  if (source === 'job_description') {
    return primarySourceText || 'This comes straight from the job description and affects how closely your resume matches the role.';
  }

  if (source === 'benchmark') {
    return primarySourceText || 'This is common among stronger candidates and can improve competitiveness once the core job fit is in place.';
  }

  return 'This issue affects the final interview-readiness verdict.';
}

function categoryForRequirement(args: {
  source: RewriteQueueSource;
  status: RewriteQueueItem['status'];
  liveEvidenceCount: number;
  inferredEvidenceCount: number;
  hasSuggestedLanguage: boolean;
  isHardRequirement: boolean;
}): RewriteQueueCategory {
  if (args.status === 'already_covered') {
    return args.source === 'benchmark' ? 'benchmark_stretch' : 'quick_win';
  }

  if (args.isHardRequirement && args.liveEvidenceCount === 0) {
    return 'hard_gap';
  }

  if (args.source === 'benchmark') {
    return 'benchmark_stretch';
  }

  if (args.hasSuggestedLanguage || args.liveEvidenceCount > 0 || args.inferredEvidenceCount > 0) {
    return 'quick_win';
  }

  return 'proof_upgrade';
}

function bucketForItem(
  status: RewriteQueueItem['status'],
  category: RewriteQueueCategory,
): RewriteQueueItem['bucket'] {
  if (status === 'already_covered') return 'resolved';
  if (category === 'benchmark_stretch') return 'partially_addressed';
  if (status === 'partially_addressed' && category !== 'hard_gap') return 'partially_addressed';
  return 'needs_attention';
}

function aiPlanForRequirement(args: {
  category: RewriteQueueCategory;
  status: RewriteQueueItem['status'];
  liveEvidenceCount: number;
  inferredEvidenceCount: number;
  hasSuggestedLanguage: boolean;
}): string {
  if (args.category === 'hard_gap') {
    return 'We will confirm whether you truly have this requirement. If you do, we will add proof. If you do not, we will keep it visible as a real risk.';
  }

  if (args.category === 'benchmark_stretch') {
    return 'We are checking whether you have adjacent experience that can truthfully strengthen this stretch item without distracting from the core job fit.';
  }

  if (args.hasSuggestedLanguage) {
    return 'We already drafted stronger language for this item. The next step is to review it carefully and keep it only if it is exactly true.';
  }

  if (args.liveEvidenceCount > 0) {
    return 'We already found proof on the resume. The next move is to sharpen it so the requirement is obvious without stretching the truth.';
  }

  if (args.inferredEvidenceCount > 0) {
    return 'We found nearby evidence, but it is still indirect. One focused detail should let us turn it into direct proof.';
  }

  if (args.status === 'already_covered') {
    return 'The current draft already carries this requirement. We are keeping it visible so you can confirm the proof is still in the strongest place.';
  }

  return 'We need one or two better details before this becomes believable resume proof.';
}

function userInstructionForRequirement(args: {
  requirement: string;
  category: RewriteQueueCategory;
  status: RewriteQueueItem['status'];
  liveEvidenceCount: number;
  inferredEvidenceCount: number;
  hasSuggestedLanguage: boolean;
}): string {
  if (args.category === 'hard_gap') {
    return 'Confirm whether you actually have this requirement. Do not stretch it. If you do not have it, leave it marked as a real risk.';
  }

  if (args.category === 'benchmark_stretch') {
    return 'Only work this if it is real and supportable. Core job-description fit comes first.';
  }

  if (args.status === 'already_covered') {
    return 'Read the current proof on the resume and make sure it still belongs in the strongest place.';
  }

  if (args.hasSuggestedLanguage) {
    return 'Review the suggested language and accept it only if it is fully accurate and supportable.';
  }

  if (args.liveEvidenceCount > 0 || args.inferredEvidenceCount > 0) {
    return 'Tell us one concrete example so we can turn the related proof into direct evidence for this requirement.';
  }

  return 'Tell us one concrete example so we can find truthful proof before we draft a stronger line.';
}

function mergeEvidence(left: RequirementGap['evidence'], right: RequirementGap['evidence']): string[] {
  const merged = [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])]
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return Array.from(new Set(merged));
}

function dedupeRequirements(requirements: RequirementGap[]): RequirementGap[] {
  const merged = new Map<string, RequirementGap>();

  for (const requirement of requirements) {
    const source = requirement.source ?? (requirement.score_domain === 'benchmark' ? 'benchmark' : 'job_description');
    const key = `${source}:${normalize(requirement.requirement)}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        ...requirement,
        evidence: mergeEvidence(requirement.evidence, []),
      });
      continue;
    }

    const mergedRequirement: RequirementGap = {
      ...existing,
      importance:
        importanceWeight(requirement.importance) < importanceWeight(existing.importance)
          ? requirement.importance
          : existing.importance,
      classification:
        classificationWeight(requirement.classification) < classificationWeight(existing.classification)
          ? requirement.classification
          : existing.classification,
      evidence: mergeEvidence(existing.evidence, requirement.evidence),
      source_evidence: existing.source_evidence || requirement.source_evidence,
      strategy: existing.strategy ?? requirement.strategy,
    };

    merged.set(key, mergedRequirement);
  }

  return Array.from(merged.values());
}

export function buildRewriteQueue(args: {
  jobIntelligence: JobIntelligence;
  gapAnalysis: GapAnalysis;
  requirementWorkItems?: RequirementWorkItem[] | null;
  currentResume?: ResumeDraft | null;
  benchmarkCandidate?: BenchmarkCandidate | null;
  gapCoachingCards?: GapCoachingCard[] | null;
  gapChatSnapshot?: CoachingThreadSnapshot | null;
  finalReviewResult?: FinalReviewResult | null;
  finalReviewChatSnapshot?: CoachingThreadSnapshot | null;
  resolvedFinalReviewConcernIds?: string[];
}): {
  items: RewriteQueueItem[];
  summary: RewriteQueueSummary;
  nextItem: RewriteQueueItem | null;
} {
  const coachingLookup = new Map(
    (args.gapCoachingCards ?? []).map((card) => [normalize(card.requirement), card]),
  );
  const workItemLookup = new Map(
    (args.requirementWorkItems ?? args.gapAnalysis.requirement_work_items ?? []).map((item) => [
      normalize(item.requirement),
      item,
    ]),
  );

  const dedupedRequirements = dedupeRequirements(args.gapAnalysis.requirements);

  const items: RewriteQueueItem[] = dedupedRequirements.map((requirement) => {
    const normalizedRequirement = normalize(requirement.requirement);
    const source = requirement.source ?? (requirement.score_domain === 'benchmark' ? 'benchmark' : 'job_description');
    const coachingCard = coachingLookup.get(normalizedRequirement);
    const workItem = workItemLookup.get(normalizedRequirement);
    const acceptedLanguage = resolvedLanguage(args.gapChatSnapshot, requirement.requirement);
    const latestAssistant = latestAssistantMessage(args.gapChatSnapshot, requirement.requirement);
    const liveEvidence = collectResumeEvidenceForRequirement(args.currentResume, requirement.requirement);
    const workItemEvidence = (workItem?.candidate_evidence ?? []).map((item) => ({
      text: item.text,
      source: 'resume' as const,
      section: item.source_section,
      isNew: false,
      basis: item.evidence_strength === 'direct' ? 'mapped' as const : 'nearby' as const,
    }));
    const mergedEvidence = liveEvidence.length > 0 ? liveEvidence : workItemEvidence;
    const inferredEvidence = Array.isArray(requirement.evidence)
      ? requirement.evidence.filter((item): item is string => (
        typeof item === 'string'
        && item.trim().length > 0
        && looksLikeResumeEvidenceSnippet(item, requirement.requirement)
        && evidenceLooksDirectForRequirement(requirement.requirement, item)
      ))
      : [];
    const sourceEvidence = sourceEvidenceForRequirement({
      requirement,
      jobIntelligence: args.jobIntelligence,
      benchmarkCandidate: args.benchmarkCandidate,
    });
    const normalizedSourceEvidence = sourceEvidence.length > 0
      ? sourceEvidence
      : workItem?.source_evidence
        ? [{
            text: workItem.source_evidence,
            source: workItem.source === 'benchmark' ? 'benchmark' as const : 'job_description' as const,
            basis: 'source' as const,
          }]
        : [];
    const isHardRequirement = hardRequirementText(requirement.requirement, normalizedSourceEvidence);
    const hasSuggestedLanguage = Boolean(latestAssistant?.suggestedLanguage);
    const sharedCoachingPolicy = coachingCard?.coaching_policy ?? requirement.strategy?.coaching_policy;
    const status: RewriteQueueItem['status'] = workItem
      ? (
          workItem.current_claim_strength === 'supported' || workItem.current_claim_strength === 'supported_rewrite'
            ? 'already_covered'
            : workItem.proof_level === 'none'
              ? 'not_addressed'
              : 'needs_more_evidence'
        )
      : requirement.classification === 'strong'
        ? 'already_covered'
        : acceptedLanguage || mergedEvidence.some((item) => item.isNew)
          ? 'partially_addressed'
          : requirement.classification === 'partial' || mergedEvidence.length > 0 || latestAssistant?.needsCandidateInput || Boolean(latestAssistant?.currentQuestion)
            ? 'needs_more_evidence'
            : 'not_addressed';

    const category = workItem
      ? (
          workItem.source === 'benchmark' && workItem.current_claim_strength === 'confirm_fit'
            ? 'benchmark_stretch'
            : workItem.proof_level === 'none' && isHardRequirement
              ? 'hard_gap'
              : workItem.next_best_action === 'quantify' || workItem.current_claim_strength === 'strengthen'
                ? 'proof_upgrade'
                : 'quick_win'
        )
      : categoryForRequirement({
          source,
          status,
          liveEvidenceCount: mergedEvidence.length,
          inferredEvidenceCount: inferredEvidence.length,
          hasSuggestedLanguage,
          isHardRequirement,
        });

    const recommendedNextStep = workItem?.next_best_action
      ? ({
          accept: {
            action: 'view_in_resume' as const,
            label: 'Review Current Line',
            detail: 'This line is already grounded well. Keep it only if it is still your strongest proof.',
          },
          tighten: {
            action: 'review_edit' as const,
            label: 'Sharpen This Line',
            detail: 'The proof is there. Tighten the wording so the requirement match is unmistakable.',
          },
          quantify: {
            action: 'answer_question' as const,
            label: 'Add Scope or Metric',
            detail: 'Add one defensible metric, scope marker, cadence, or concrete result to make the proof land harder.',
          },
          confirm: {
            action: 'verify' as const,
            label: 'Confirm Honest Fit',
            detail: 'Decide whether this benchmark-style claim truly fits your background or needs a more honest reframe.',
          },
          answer: {
            action: 'answer_question' as const,
            label: 'Answer 1 Question',
            detail: 'We need one concrete detail before this claim should stay on the resume.',
          },
          remove: {
            action: 'verify' as const,
            label: 'Decide Whether It Stays',
            detail: 'If this line does not fit your real experience, remove it instead of forcing it.',
          },
        } satisfies Record<NonNullable<RequirementWorkItem['next_best_action']>, RewriteQueueItem['recommendedNextStep']>)[workItem.next_best_action]
      : status === 'already_covered'
      ? {
          action: 'view_in_resume' as const,
          label: 'Check Current Proof',
          detail: 'Confirm the current resume line is still the strongest proof for this requirement.',
        }
      : category === 'hard_gap'
        ? {
            action: 'check_hard_requirement' as const,
            label: 'Check This Requirement',
            detail: 'Confirm whether you actually have this credential or degree. If not, keep it visible as a real risk.',
          }
        : hasSuggestedLanguage
          ? {
              action: 'review_edit' as const,
              label: 'Review Edit',
              detail: 'A stronger line is ready. Review it and only accept it if it is fully true.',
            }
      : {
          action: 'answer_question' as const,
          label: 'Answer 1 Question',
          detail: category === 'benchmark_stretch'
                ? 'Answer one targeted question so we can decide whether this stretch item is really supportable.'
                : status === 'not_addressed'
                  ? 'Answer one targeted question so we can find truthful proof for this job requirement and draft the right edit.'
                  : 'Answer one targeted question so we can strengthen the proof already on the page.',
            };

    const aiPlan = aiPlanForRequirement({
      category,
      status,
      liveEvidenceCount: mergedEvidence.length,
      inferredEvidenceCount: inferredEvidence.length,
      hasSuggestedLanguage,
    });

    // Legacy compatibility fallback for older snapshots that do not yet carry
    // canonical coaching_policy metadata from the server.
    const fallbackUserInstruction = userInstructionForRequirement({
      requirement: requirement.requirement,
      category,
      status,
      liveEvidenceCount: mergedEvidence.length,
      inferredEvidenceCount: inferredEvidence.length,
      hasSuggestedLanguage,
    });
    const userInstruction = status === 'already_covered' || category === 'hard_gap' || hasSuggestedLanguage
      ? fallbackUserInstruction
      : latestAssistant?.needsCandidateInput === false && sharedCoachingPolicy?.proofActionDirect
        ? sharedCoachingPolicy.proofActionDirect
        : sharedCoachingPolicy?.proofActionRequiresInput ?? fallbackUserInstruction;
    const fallbackStarterQuestion = buildStarterQuestion({
      requirement: requirement.requirement,
      category,
      source,
      currentEvidenceText: mergedEvidence[0]?.text ?? inferredEvidence[0] ?? null,
      sourceEvidenceText: normalizedSourceEvidence[0]?.text ?? null,
    });
    const starterQuestion = looksLikeTargetedStarterQuestion(latestAssistant?.currentQuestion, requirement.requirement)
      ? latestAssistant?.currentQuestion?.trim()
      : workItem?.clarifying_question?.trim()
        || sharedCoachingPolicy?.clarifyingQuestion?.trim()
        || fallbackStarterQuestion;

    return {
      id: `requirement:${source}:${normalizedRequirement}`,
      kind: 'requirement' as const,
      source,
      category,
      title: requirement.requirement,
      status,
      bucket: bucketForItem(status, category),
      isResolved: status === 'already_covered',
      whyItMatters: whyRequirementMatters(source, normalizedSourceEvidence),
      aiPlan,
      userInstruction,
      currentEvidence: mergedEvidence.length > 0
        ? mergedEvidence
        : inferredEvidence.map((text) => ({ text, source: 'resume' as const, basis: 'nearby' as const })),
      sourceEvidence: normalizedSourceEvidence,
      recommendedNextStep,
      requirement: requirement.requirement,
      importance: requirement.importance,
      classification: requirement.classification,
      candidateInputNeeded: (workItem?.next_best_action === 'answer') || (latestAssistant?.needsCandidateInput ?? false),
      coachingReasoning: coachingCard?.ai_reasoning ?? requirement.strategy?.ai_reasoning,
      coachingPolicy: sharedCoachingPolicy,
      starterQuestion,
      riskNote: category === 'hard_gap'
        ? 'If this is truly missing, keep it visible as a real risk instead of forcing it into the resume.'
        : undefined,
      suggestedDraft: looksLikeResumeRewrite(latestAssistant?.suggestedLanguage)
        ? latestAssistant?.suggestedLanguage
        : looksLikeResumeRewrite(workItem?.recommended_bullet)
          ? workItem?.recommended_bullet
        : looksLikeResumeRewrite(requirement.strategy?.positioning)
          ? requirement.strategy?.positioning
          : undefined,
    };
  });

  // ─── Compute suggestion quality scores ───────────────────────────
  const brandedTitle = args.currentResume?.header?.branded_title;
  const allItemTexts = items.map(item =>
    item.currentEvidence.map(e => e.text).join(' '),
  );

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.suggestedDraft) continue;

    const currentText = item.currentEvidence.map(e => e.text).join(' ');
    if (!currentText.trim()) continue;

    // Other sections' text for redundancy check (exclude self)
    const otherTexts = allItemTexts.filter((_, idx) => idx !== i).filter(Boolean);

    item.suggestionScore = scoreSuggestion(currentText, item.suggestedDraft, {
      targetRequirements: item.requirement ? [item.requirement] : [],
      otherSectionTexts: otherTexts,
      brandedTitle,
      importance: item.importance,
    });

    // When verdict is 'ask_question', provide the gap-fill question as starterQuestion
    if (item.suggestionScore.verdict === 'ask_question' && item.suggestionScore.suggestedQuestion) {
      item.starterQuestion = item.suggestionScore.suggestedQuestion;
      item.candidateInputNeeded = true;
    }
  }

  // ─── Sort ────────────────────────────────────────────────────────
  items.sort((left, right) => {
    // Primary sort: AI review items first, then must-address, then everything else
    const tierDiff = actionTierWeight(left) - actionTierWeight(right);
    if (tierDiff !== 0) return tierDiff;

    // Suggestion quality: high-scoring suggestions before low-scoring ones
    const leftQuality = left.suggestionScore?.overall ?? 5;
    const rightQuality = right.suggestionScore?.overall ?? 5;
    const qualityDiff = rightQuality - leftQuality;
    if (Math.abs(qualityDiff) >= 1) return qualityDiff > 0 ? 1 : -1;

    const bucketDiff = bucketWeight(left.bucket) - bucketWeight(right.bucket);
    if (bucketDiff !== 0) return bucketDiff;

    const categoryDiff = categoryWeight(left.category) - categoryWeight(right.category);
    if (categoryDiff !== 0) return categoryDiff;

    const actionDiff = actionWeight(left.recommendedNextStep.action) - actionWeight(right.recommendedNextStep.action);
    if (actionDiff !== 0) return actionDiff;

    const leftSource = left.source === 'job_description' ? 0 : left.source === 'benchmark' ? 1 : 2;
    const rightSource = right.source === 'job_description' ? 0 : right.source === 'benchmark' ? 1 : 2;
    if (leftSource !== rightSource) return leftSource - rightSource;

    const importanceDiff = importanceWeight(left.importance) - importanceWeight(right.importance);
    if (importanceDiff !== 0) return importanceDiff;

    const evidenceDiff = right.currentEvidence.length - left.currentEvidence.length;
    if (evidenceDiff !== 0) return evidenceDiff;

    return left.title.localeCompare(right.title);
  });

  const USER_INPUT_ACTIONS: ReadonlyArray<string> = ['answer_question', 'check_hard_requirement'];

  const summary = items.reduce<RewriteQueueSummary>((accumulator, item) => {
    accumulator.total += 1;
    if (item.bucket === 'needs_attention') accumulator.needsAttention += 1;
    if (item.bucket === 'partially_addressed') accumulator.partiallyAddressed += 1;
    if (item.bucket === 'resolved') accumulator.resolved += 1;
    if (item.category === 'hard_gap' && item.bucket !== 'resolved') accumulator.hardGapCount += 1;

    // Three-tier classification
    if (item.bucket === 'resolved') {
      accumulator.handled += 1;
    } else if (
      item.bucket === 'needs_attention' &&
      USER_INPUT_ACTIONS.includes(item.recommendedNextStep.action)
    ) {
      accumulator.needsUserInput += 1;
    } else {
      // partially_addressed, or needs_attention with a review/AI action
      accumulator.needsApproval += 1;
    }

    return accumulator;
  }, {
    total: 0,
    needsAttention: 0,
    partiallyAddressed: 0,
    resolved: 0,
    hardGapCount: 0,
    needsUserInput: 0,
    needsApproval: 0,
    handled: 0,
  });

  return {
    items,
    summary,
    nextItem: items.find((item) => item.bucket !== 'resolved') ?? items[0] ?? null,
  };
}
