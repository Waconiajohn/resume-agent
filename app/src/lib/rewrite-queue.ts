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
  RewriteQueueEvidence,
  RewriteQueueItem,
  RewriteQueueSource,
  RewriteQueueSummary,
} from '@/types/resume-v2';

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[.,;:!?]+$/, '');
}

function bucketForStatus(status: RewriteQueueItem['status']): RewriteQueueItem['bucket'] {
  if (status === 'already_covered') return 'resolved';
  if (status === 'partially_addressed') return 'partially_addressed';
  return 'needs_attention';
}

function sourceLabel(source: RewriteQueueSource): string {
  if (source === 'job_description') return 'job description';
  if (source === 'benchmark') return 'benchmark';
  return 'final review';
}

function importanceWeight(importance?: RequirementGap['importance']): number {
  if (importance === 'must_have') return 0;
  if (importance === 'important') return 1;
  return 2;
}

function severityWeight(severity?: RewriteQueueItem['severity']): number {
  if (severity === 'critical') return 0;
  if (severity === 'moderate') return 1;
  return 2;
}

function bucketWeight(bucket: RewriteQueueItem['bucket']): number {
  if (bucket === 'needs_attention') return 0;
  if (bucket === 'partially_addressed') return 1;
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

function extractTargetSectionEvidence(resume: ResumeDraft | null | undefined, section: string | undefined): RewriteQueueEvidence[] {
  if (!resume || !section) return [];
  const sectionLower = section.toLowerCase();

  if (sectionLower.includes('summary')) {
    return [{
      text: resume.executive_summary.content,
      source: 'resume',
      section: 'Executive Summary',
      isNew: resume.executive_summary.is_new,
    }];
  }

  if (sectionLower.includes('accomplishment')) {
    return resume.selected_accomplishments.slice(0, 2).map((item) => ({
      text: item.content,
      source: 'resume' as const,
      section: 'Selected Accomplishments',
      isNew: item.is_new,
    }));
  }

  for (const experience of resume.professional_experience) {
    if (sectionLower.includes(experience.company.toLowerCase()) || sectionLower.includes(experience.title.toLowerCase())) {
      return [
        {
          text: experience.scope_statement,
          source: 'resume' as const,
          section: `Professional Experience - ${experience.company}`,
          isNew: experience.scope_statement_is_new ?? false,
        },
        ...experience.bullets.slice(0, 2).map((bullet) => ({
          text: bullet.text,
          source: 'resume' as const,
          section: `Professional Experience - ${experience.company}`,
          isNew: bullet.is_new,
        })),
      ].filter((item) => item.text.trim().length > 0);
    }
  }

  return [];
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

function whyRequirementMatters(source: RewriteQueueSource, sourceEvidence: RewriteQueueEvidence[]): string {
  if (sourceEvidence.length > 0) {
    return sourceEvidence[0].text;
  }
  if (source === 'job_description') {
    return 'This comes directly from the target job description and affects fit and ATS coverage.';
  }
  if (source === 'benchmark') {
    return 'This is a benchmark expectation that improves competitiveness against stronger candidates.';
  }
  return 'This issue affects the final interview-readiness verdict.';
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

  const requirementItems: RewriteQueueItem[] = args.gapAnalysis.requirements.map((requirement) => {
    const normalizedRequirement = normalize(requirement.requirement);
    const source = requirement.source ?? (requirement.score_domain === 'benchmark' ? 'benchmark' : 'job_description');
    const coachingCard = coachingLookup.get(normalizedRequirement);
    const acceptedLanguage = resolvedLanguage(args.gapChatSnapshot, requirement.requirement);
    const latestAssistant = latestAssistantMessage(args.gapChatSnapshot, requirement.requirement);
    const liveEvidence = collectResumeEvidenceForRequirement(args.currentResume, requirement.requirement);
    const sourceEvidence = sourceEvidenceForRequirement({
      requirement,
      jobIntelligence: args.jobIntelligence,
      benchmarkCandidate: args.benchmarkCandidate,
    });

    const status: RewriteQueueItem['status'] = requirement.classification === 'strong'
      ? 'already_covered'
      : acceptedLanguage || liveEvidence.some((item) => item.isNew)
        ? 'partially_addressed'
        : requirement.classification === 'partial' || latestAssistant?.needsCandidateInput || Boolean(latestAssistant?.currentQuestion)
          ? 'needs_more_evidence'
          : 'not_addressed';

    const recommendedNextStep = status === 'already_covered'
      ? {
          action: 'view_in_resume' as const,
          label: 'View in Resume',
          detail: 'Confirm the existing evidence is still the strongest proof for this requirement.',
        }
      : latestAssistant?.suggestedLanguage
        ? {
            action: 'review_edit' as const,
            label: 'Review Edit',
            detail: 'A suggested rewrite is ready to send into the diff review.',
          }
        : {
            action: 'open_coaching' as const,
            label: status === 'not_addressed' ? 'Close This Gap' : 'Answer One Question',
            detail: status === 'not_addressed'
              ? `Open coaching and find truthful, like-kind evidence for this ${sourceLabel(source)} requirement.`
              : 'Open coaching to gather one more detail and strengthen the proof.',
          };

    return {
      id: `requirement:${source}:${normalizedRequirement}`,
      kind: 'requirement',
      source,
      title: requirement.requirement,
      status,
      bucket: bucketForStatus(status),
      isResolved: status === 'already_covered',
      whyItMatters: whyRequirementMatters(source, sourceEvidence),
      currentEvidence: liveEvidence.length > 0
        ? liveEvidence
        : requirement.evidence.map((text) => ({ text, source: 'resume' as const })),
      sourceEvidence,
      recommendedNextStep,
      requirement: requirement.requirement,
      importance: requirement.importance,
      classification: requirement.classification,
      candidateInputNeeded: latestAssistant?.needsCandidateInput ?? false,
      coachingReasoning: coachingCard?.ai_reasoning ?? requirement.strategy?.ai_reasoning,
      starterQuestion: latestAssistant?.currentQuestion ?? coachingCard?.interview_questions?.[0]?.question,
    };
  });

  const finalReviewItems: RewriteQueueItem[] = (args.finalReviewResult?.concerns ?? []).map((concern) => {
    const relatedEvidence = concern.related_requirement
      ? collectResumeEvidenceForRequirement(args.currentResume, concern.related_requirement)
      : [];
    const sectionEvidence = relatedEvidence.length > 0
      ? []
      : extractTargetSectionEvidence(args.currentResume, concern.target_section);
    const latestAssistant = latestAssistantMessage(args.finalReviewChatSnapshot, concern.id);
    const isResolved = (args.resolvedFinalReviewConcernIds ?? []).includes(concern.id);

    const status: RewriteQueueItem['status'] = isResolved
      ? 'already_covered'
      : resolvedLanguage(args.finalReviewChatSnapshot, concern.id) || relatedEvidence.some((item) => item.isNew)
        ? 'partially_addressed'
        : concern.requires_candidate_input || latestAssistant?.needsCandidateInput || Boolean(concern.clarifying_question)
          ? 'needs_more_evidence'
          : 'not_addressed';

    const recommendedNextStep = isResolved
      ? {
          action: 'verify' as const,
          label: 'Verify Outcome',
          detail: 'Check that the accepted edit still reads naturally in the draft.',
        }
      : concern.suggested_resume_edit
        ? {
            action: 'review_suggested_fix' as const,
            label: 'Review Suggested Fix',
            detail: 'A concrete rewrite is already available for this hiring-manager concern.',
          }
        : {
            action: 'open_coaching' as const,
            label: concern.requires_candidate_input ? 'Answer Clarifying Question' : 'Open Coaching',
            detail: concern.requires_candidate_input
              ? 'Give one specific detail so the concern can be turned into a truthful resume edit.'
              : 'Open coaching to produce a stronger, more credible fix.',
          };

    return {
      id: `final_review:${normalize(concern.id)}`,
      kind: 'final_review',
      source: 'final_review',
      title: concern.related_requirement ?? concern.observation,
      status,
      bucket: bucketForStatus(status),
      isResolved,
      whyItMatters: concern.why_it_hurts,
      currentEvidence: relatedEvidence.length > 0 ? relatedEvidence : sectionEvidence,
      sourceEvidence: [{ text: concern.observation, source: 'final_review' }],
      recommendedNextStep,
      concernId: concern.id,
      relatedRequirement: concern.related_requirement,
      targetSection: concern.target_section,
      severity: concern.severity,
      candidateInputNeeded: concern.requires_candidate_input || latestAssistant?.needsCandidateInput,
      coachingReasoning: concern.fix_strategy,
      starterQuestion: latestAssistant?.currentQuestion ?? concern.clarifying_question,
    };
  });

  const items = [...finalReviewItems, ...requirementItems].sort((left, right) => {
    const bucketDiff = bucketWeight(left.bucket) - bucketWeight(right.bucket);
    if (bucketDiff !== 0) return bucketDiff;

    const severityDiff = severityWeight(left.severity) - severityWeight(right.severity);
    if (severityDiff !== 0) return severityDiff;

    const leftSource = left.source === 'final_review' ? -1 : left.source === 'job_description' ? 0 : 1;
    const rightSource = right.source === 'final_review' ? -1 : right.source === 'job_description' ? 0 : 1;
    if (leftSource !== rightSource) return leftSource - rightSource;

    const importanceDiff = importanceWeight(left.importance) - importanceWeight(right.importance);
    if (importanceDiff !== 0) return importanceDiff;

    return left.title.localeCompare(right.title);
  });

  const summary = items.reduce<RewriteQueueSummary>((accumulator, item) => {
    accumulator.total += 1;
    if (item.bucket === 'needs_attention') accumulator.needsAttention += 1;
    if (item.bucket === 'partially_addressed') accumulator.partiallyAddressed += 1;
    if (item.bucket === 'resolved') accumulator.resolved += 1;
    return accumulator;
  }, {
    total: 0,
    needsAttention: 0,
    partiallyAddressed: 0,
    resolved: 0,
  });

  return {
    items,
    summary,
    nextItem: items.find((item) => item.bucket !== 'resolved') ?? items[0] ?? null,
  };
}
