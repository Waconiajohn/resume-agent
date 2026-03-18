import type {
  BenchmarkCandidate,
  CoachingThreadSnapshot,
  FinalReviewResult,
  GapAnalysis,
  GapCoachingCard,
  GapChatMessage,
  JobIntelligence,
  RequirementGap,
  ResumeDraft,
  RewriteQueueCategory,
  RewriteQueueEvidence,
  RewriteQueueItem,
  RewriteQueueSource,
  RewriteQueueSummary,
} from '@/types/resume-v2';

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[.,;:!?]+$/, '');
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

  const matchesRequirement = (requirements: string[] | undefined) => (
    (requirements ?? []).some((item) => normalize(item) === normalizedRequirement)
  );

  if (matchesRequirement(resume.executive_summary.addresses_requirements)) {
    evidence.push({
      text: resume.executive_summary.content,
      source: 'resume',
      section: 'Executive Summary',
      isNew: resume.executive_summary.is_new,
    });
  }

  for (const accomplishment of resume.selected_accomplishments) {
    if (matchesRequirement(accomplishment.addresses_requirements)) {
      evidence.push({
        text: accomplishment.content,
        source: 'resume',
        section: 'Selected Accomplishments',
        isNew: accomplishment.is_new,
      });
    }
  }

  for (const experience of resume.professional_experience) {
    if (matchesRequirement(experience.scope_statement_addresses_requirements)) {
      evidence.push({
        text: experience.scope_statement,
        source: 'resume',
        section: `Professional Experience - ${experience.company}`,
        isNew: experience.scope_statement_is_new ?? false,
      });
    }

    for (const bullet of experience.bullets) {
      if (matchesRequirement(bullet.addresses_requirements)) {
        evidence.push({
          text: bullet.text,
          source: 'resume',
          section: `Professional Experience - ${experience.company}`,
          isNew: bullet.is_new,
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
    if (competency?.evidence_from_jd) {
      evidence.push({
        text: competency.evidence_from_jd,
        source: 'job_description',
      });
    } else if (args.requirement.source_evidence) {
      evidence.push({
        text: args.requirement.source_evidence,
        source: 'job_description',
      });
    }
  }

  if (source === 'benchmark' && args.requirement.source_evidence) {
    evidence.push({
      text: args.requirement.source_evidence,
      source: 'benchmark',
    });
  }

  if (source === 'benchmark' && evidence.length === 0 && args.benchmarkCandidate) {
    evidence.push({
      text: args.benchmarkCandidate.ideal_profile_summary,
      source: 'benchmark',
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

export function buildRewriteQueue(args: {
  jobIntelligence: JobIntelligence;
  gapAnalysis: GapAnalysis;
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

  const items = args.gapAnalysis.requirements.map((requirement) => {
    const normalizedRequirement = normalize(requirement.requirement);
    const source = requirement.source ?? (requirement.score_domain === 'benchmark' ? 'benchmark' : 'job_description');
    const coachingCard = coachingLookup.get(normalizedRequirement);
    const acceptedLanguage = resolvedLanguage(args.gapChatSnapshot, requirement.requirement);
    const latestAssistant = latestAssistantMessage(args.gapChatSnapshot, requirement.requirement);
    const liveEvidence = collectResumeEvidenceForRequirement(args.currentResume, requirement.requirement);
    const inferredEvidence = Array.isArray(requirement.evidence)
      ? requirement.evidence.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
    const sourceEvidence = sourceEvidenceForRequirement({
      requirement,
      jobIntelligence: args.jobIntelligence,
      benchmarkCandidate: args.benchmarkCandidate,
    });
    const isHardRequirement = hardRequirementText(requirement.requirement, sourceEvidence);
    const hasSuggestedLanguage = Boolean(latestAssistant?.suggestedLanguage);

    const status: RewriteQueueItem['status'] = requirement.classification === 'strong'
      ? 'already_covered'
      : acceptedLanguage || liveEvidence.some((item) => item.isNew)
        ? 'partially_addressed'
        : requirement.classification === 'partial' || liveEvidence.length > 0 || latestAssistant?.needsCandidateInput || Boolean(latestAssistant?.currentQuestion)
          ? 'needs_more_evidence'
          : 'not_addressed';

    const category = categoryForRequirement({
      source,
      status,
      liveEvidenceCount: liveEvidence.length,
      inferredEvidenceCount: inferredEvidence.length,
      hasSuggestedLanguage,
      isHardRequirement,
    });

    const recommendedNextStep = status === 'already_covered'
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

    const aiPlan = category === 'hard_gap'
      ? 'We will confirm whether you truly have this requirement. If you do, we will add proof. If you do not, we will keep it visible as a real risk.'
      : category === 'benchmark_stretch'
        ? 'We are checking whether you have adjacent experience that can truthfully strengthen this stretch item without distracting from the core job fit.'
        : category === 'quick_win'
          ? 'We already found nearby evidence or a draft line we can strengthen quickly with one focused question and a cleaner rewrite.'
          : 'We need one or two better details before this becomes believable resume proof.';

    const userInstruction = category === 'hard_gap'
      ? 'Confirm whether you actually have this requirement. Do not stretch it. If you do not have it, leave it marked as a real risk.'
      : category === 'benchmark_stretch'
        ? 'Only work this if it is real and supportable. Core job-description fit comes first.'
        : status === 'already_covered'
          ? 'Read the current proof on the resume and make sure it still belongs in the strongest place.'
          : 'Answer the next question or review the proposed edit. Accept it only if it is fully accurate and supportable.';

    return {
      id: `requirement:${source}:${normalizedRequirement}`,
      kind: 'requirement' as const,
      source,
      category,
      title: requirement.requirement,
      status,
      bucket: bucketForItem(status, category),
      isResolved: status === 'already_covered',
      whyItMatters: whyRequirementMatters(source, sourceEvidence),
      aiPlan,
      userInstruction,
      currentEvidence: liveEvidence.length > 0
        ? liveEvidence
        : inferredEvidence.map((text) => ({ text, source: 'resume' as const })),
      sourceEvidence,
      recommendedNextStep,
      requirement: requirement.requirement,
      importance: requirement.importance,
      classification: requirement.classification,
      candidateInputNeeded: latestAssistant?.needsCandidateInput ?? false,
      coachingReasoning: coachingCard?.ai_reasoning ?? requirement.strategy?.ai_reasoning,
      starterQuestion: latestAssistant?.currentQuestion ?? coachingCard?.interview_questions?.[0]?.question,
      riskNote: category === 'hard_gap'
        ? 'If this is truly missing, keep it visible as a real risk instead of forcing it into the resume.'
        : undefined,
    };
  }).sort((left, right) => {
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

  const summary = items.reduce<RewriteQueueSummary>((accumulator, item) => {
    accumulator.total += 1;
    if (item.bucket === 'needs_attention') accumulator.needsAttention += 1;
    if (item.bucket === 'partially_addressed') accumulator.partiallyAddressed += 1;
    if (item.bucket === 'resolved') accumulator.resolved += 1;
    if (item.category === 'hard_gap' && item.bucket !== 'resolved') accumulator.hardGapCount += 1;
    return accumulator;
  }, {
    total: 0,
    needsAttention: 0,
    partiallyAddressed: 0,
    resolved: 0,
    hardGapCount: 0,
  });

  return {
    items,
    summary,
    nextItem: items.find((item) => item.bucket !== 'resolved') ?? items[0] ?? null,
  };
}
