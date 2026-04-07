import type {
  BulletConfidence,
  FramingGuardrail,
  NextBestAction,
  ProofLevel,
  RequirementEvidence,
  RequirementSource,
  RequirementWorkItem,
  ResumeContentOrigin,
  ResumeDraft,
  ResumeReviewState,
  ResumeSupportOrigin,
} from '@/types/resume-v2';

export interface OptimisticResumeEditMetadata {
  requirement?: string;
  requirements?: string[];
  reviewState?: ResumeReviewState;
  requirementSource?: RequirementSource;
  evidenceFound?: string;
  workItemId?: string;
  proofLevel?: ProofLevel;
  framingGuardrail?: FramingGuardrail;
  nextBestAction?: NextBestAction;
}

interface OptimisticProgressState {
  reviewState: ResumeReviewState;
  confidence: BulletConfidence;
  proofLevel: ProofLevel;
  framingGuardrail: FramingGuardrail;
  nextBestAction: NextBestAction;
  contentOrigin: ResumeContentOrigin;
  supportOrigin: ResumeSupportOrigin;
  evidence: RequirementEvidence;
}

interface ResumeEditTarget {
  section: string;
  index?: number;
  originalText?: string;
  newText: string;
  metadata?: OptimisticResumeEditMetadata;
}

interface TrackedResumeLine {
  is_new: boolean;
  addresses_requirements: string[];
  primary_target_requirement?: string;
  primary_target_source?: RequirementSource;
  target_evidence?: string;
  confidence: BulletConfidence;
  review_state?: ResumeReviewState;
  evidence_found: string;
  requirement_source: RequirementSource;
  content_origin?: ResumeContentOrigin;
  support_origin?: ResumeSupportOrigin;
  work_item_id?: string;
  proof_level?: ProofLevel;
  framing_guardrail?: FramingGuardrail;
  next_best_action?: NextBestAction;
}

function normalizeLooseText(value: string | undefined | null): string {
  return (value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeRequirementKey(value: string | undefined | null): string {
  return normalizeLooseText(value);
}

function uniqueRequirements(requirements: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const resolved: string[] = [];
  for (const requirement of requirements) {
    const trimmed = requirement?.trim();
    if (!trimmed) continue;
    const key = normalizeRequirementKey(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    resolved.push(trimmed);
  }
  return resolved;
}

function deriveOptimisticProgress(
  metadata: OptimisticResumeEditMetadata | undefined,
  current: {
    reviewState?: ResumeReviewState;
    proofLevel?: ProofLevel;
    framingGuardrail?: FramingGuardrail;
    nextBestAction?: NextBestAction;
    evidenceFound?: string;
  },
  newText: string,
): OptimisticProgressState | null {
  const currentReviewState = metadata?.reviewState ?? current.reviewState;
  const currentProofLevel = metadata?.proofLevel ?? current.proofLevel;
  const currentFramingGuardrail = metadata?.framingGuardrail ?? current.framingGuardrail;
  const currentNextBestAction = metadata?.nextBestAction ?? current.nextBestAction;
  const evidenceFound = metadata?.evidenceFound?.trim() || current.evidenceFound?.trim() || '';
  const evidenceText = evidenceFound || newText.trim();

  if (
    currentReviewState === 'code_red'
    || currentProofLevel === 'none'
    || currentFramingGuardrail === 'blocked'
    || currentNextBestAction === 'answer'
    || currentNextBestAction === 'remove'
  ) {
    return {
      reviewState: 'strengthen',
      confidence: 'partial',
      proofLevel: 'adjacent',
      framingGuardrail: 'reframe',
      nextBestAction: 'tighten',
      contentOrigin: 'resume_rewrite',
      supportOrigin: evidenceFound ? 'original_resume' : 'user_confirmed_context',
      evidence: {
        text: evidenceText,
        source_type: evidenceFound ? 'uploaded_resume' : 'interview_context',
        evidence_strength: evidenceFound ? 'direct' : 'adjacent',
      },
    };
  }

  if (
    currentReviewState === 'strengthen'
    || currentReviewState === 'confirm_fit'
    || currentReviewState === 'supported'
    || currentReviewState === 'supported_rewrite'
    || currentProofLevel === 'adjacent'
    || currentProofLevel === 'inferable'
    || currentNextBestAction === 'tighten'
    || currentNextBestAction === 'quantify'
    || currentNextBestAction === 'confirm'
    || currentNextBestAction === 'accept'
  ) {
    return {
      reviewState: 'supported_rewrite',
      confidence: 'strong',
      proofLevel: 'direct',
      framingGuardrail: 'exact',
      nextBestAction: 'accept',
      contentOrigin: 'resume_rewrite',
      supportOrigin: evidenceFound ? 'original_resume' : 'user_confirmed_context',
      evidence: {
        text: evidenceText,
        source_type: evidenceFound ? 'uploaded_resume' : 'interview_context',
        evidence_strength: 'direct',
      },
    };
  }

  return null;
}

function buildEvidenceText(
  metadata: OptimisticResumeEditMetadata | undefined,
  currentEvidence: string,
  fallbackText: string,
): string {
  return metadata?.evidenceFound?.trim() || currentEvidence.trim() || fallbackText.trim();
}

function updateTrackedLine<T extends TrackedResumeLine>(
  line: T,
  newText: string,
  metadata?: OptimisticResumeEditMetadata,
): T {
  const requirements = uniqueRequirements([
    ...(line.addresses_requirements ?? []),
    metadata?.requirement,
    ...(metadata?.requirements ?? []),
  ]);
  const progress = deriveOptimisticProgress(metadata, {
    reviewState: line.review_state,
    proofLevel: line.proof_level,
    framingGuardrail: line.framing_guardrail,
    nextBestAction: line.next_best_action,
    evidenceFound: line.evidence_found,
  }, newText);
  const evidenceFound = buildEvidenceText(metadata, line.evidence_found, newText);

  return {
    ...line,
    is_new: true,
    addresses_requirements: requirements,
    primary_target_requirement: metadata?.requirement ?? line.primary_target_requirement ?? requirements[0],
    primary_target_source: metadata?.requirementSource ?? line.primary_target_source ?? line.requirement_source,
    target_evidence: line.target_evidence?.trim() ? line.target_evidence : (evidenceFound || undefined),
    confidence: progress?.confidence ?? line.confidence,
    review_state: progress?.reviewState ?? line.review_state,
    evidence_found: evidenceFound,
    requirement_source: metadata?.requirementSource ?? line.requirement_source,
    content_origin: progress?.contentOrigin ?? line.content_origin,
    support_origin: progress?.supportOrigin ?? line.support_origin,
    work_item_id: metadata?.workItemId ?? line.work_item_id,
    proof_level: progress?.proofLevel ?? line.proof_level,
    framing_guardrail: progress?.framingGuardrail ?? line.framing_guardrail,
    next_best_action: progress?.nextBestAction ?? line.next_best_action,
  };
}

function parseCustomSectionKey(section: string): string | null {
  return section.startsWith('custom_section:') ? section.slice('custom_section:'.length) : null;
}

function sectionMatches(sectionLower: string, candidates: string[]): boolean {
  return candidates.some((candidate) => candidate && sectionLower.includes(candidate.toLowerCase()));
}

export function applyOptimisticResumeEdit(
  resume: ResumeDraft,
  target: ResumeEditTarget,
): ResumeDraft {
  const metadata = target.metadata;
  const sectionLower = target.section.toLowerCase();
  const targetIndex = target.index;
  const oldText = target.originalText;
  const matchesText = (value: string) => typeof oldText === 'string' && value === oldText;

  if (target.section === 'executive_summary' || sectionMatches(sectionLower, ['executive summary', 'summary'])) {
    const nextRequirements = uniqueRequirements([
      ...(resume.executive_summary.addresses_requirements ?? []),
      metadata?.requirement,
      ...(metadata?.requirements ?? []),
    ]);
    const shouldUpdate = target.section === 'executive_summary'
      ? targetIndex === undefined || targetIndex === 0
      : matchesText(resume.executive_summary.content);

    if (shouldUpdate) {
      return {
        ...resume,
        executive_summary: {
          ...resume.executive_summary,
          content: target.newText,
          is_new: true,
          addresses_requirements: nextRequirements,
        },
      };
    }
  }

  if (target.section === 'core_competencies' || sectionMatches(sectionLower, ['core competencies', 'competencies'])) {
    return {
      ...resume,
      core_competencies: resume.core_competencies.map((item, itemIndex) => {
        const shouldUpdate = target.section === 'core_competencies'
          ? itemIndex === targetIndex
          : matchesText(item);
        return shouldUpdate ? target.newText : item;
      }),
    };
  }

  if (target.section === 'selected_accomplishments' || sectionMatches(sectionLower, ['selected accomplishments', 'accomplishments'])) {
    return {
      ...resume,
      selected_accomplishments: resume.selected_accomplishments.map((item, itemIndex) => {
        const shouldUpdate = target.section === 'selected_accomplishments'
          ? itemIndex === targetIndex
          : matchesText(item.content);
        if (!shouldUpdate) return item;
        return {
          ...updateTrackedLine(item, target.newText, metadata),
          content: target.newText,
        };
      }),
    };
  }

  if (target.section === 'professional_experience' || sectionMatches(sectionLower, ['professional experience'])) {
    return {
      ...resume,
      professional_experience: resume.professional_experience.map((experience, experienceIndex) => {
        const sectionMatchesExperience = target.section === 'professional_experience'
          ? true
          : sectionLower.includes(experience.company.toLowerCase()) || sectionLower === 'professional_experience';
        if (!sectionMatchesExperience) return experience;

        const targetExperienceIndex = targetIndex !== undefined ? Math.floor(targetIndex / 100) : undefined;
        const targetBulletIndex = targetIndex !== undefined ? targetIndex % 100 : undefined;
        const shouldUpdateScopeStatement = target.section === 'professional_experience'
          ? targetIndex === -1
          : matchesText(experience.scope_statement);

        return {
          ...experience,
          scope_statement: shouldUpdateScopeStatement
            ? target.newText
            : experience.scope_statement,
          scope_statement_is_new: shouldUpdateScopeStatement
            ? true
            : experience.scope_statement_is_new,
          scope_statement_addresses_requirements: shouldUpdateScopeStatement
            ? uniqueRequirements([
                ...(experience.scope_statement_addresses_requirements ?? []),
                metadata?.requirement,
                ...(metadata?.requirements ?? []),
              ])
            : experience.scope_statement_addresses_requirements,
          bullets: experience.bullets.map((bullet, bulletIndex) => {
            const shouldUpdateBullet = target.section === 'professional_experience'
              ? experienceIndex === targetExperienceIndex && bulletIndex === targetBulletIndex
              : matchesText(bullet.text);
            if (!shouldUpdateBullet) return bullet;
            return {
              ...updateTrackedLine(bullet, target.newText, metadata),
              text: target.newText,
            };
          }),
        };
      }),
    };
  }

  const customSectionId = parseCustomSectionKey(target.section);
  if (customSectionId) {
    return {
      ...resume,
      custom_sections: (resume.custom_sections ?? []).map((customSection) => {
        if (customSection.id !== customSectionId) return customSection;
        if ((targetIndex ?? 0) < 0) {
          return {
            ...customSection,
            summary: target.newText,
          };
        }
        return {
          ...customSection,
          lines: customSection.lines.map((line, lineIndex) => (
            lineIndex === targetIndex ? target.newText : line
          )),
        };
      }),
    };
  }

  if (typeof oldText !== 'string') {
    return resume;
  }

  const markEditedText = (value: string) => (value === oldText ? target.newText : value);

  return {
    ...resume,
    header: {
      ...resume.header,
      branded_title: markEditedText(resume.header.branded_title),
    },
    executive_summary: {
      ...resume.executive_summary,
      content: markEditedText(resume.executive_summary.content),
      is_new: resume.executive_summary.content === oldText ? true : resume.executive_summary.is_new,
      addresses_requirements: resume.executive_summary.content === oldText
        ? uniqueRequirements([
            ...(resume.executive_summary.addresses_requirements ?? []),
            metadata?.requirement,
            ...(metadata?.requirements ?? []),
          ])
        : resume.executive_summary.addresses_requirements,
    },
    core_competencies: resume.core_competencies.map(markEditedText),
    selected_accomplishments: resume.selected_accomplishments.map((item) => (
      item.content === oldText
        ? {
            ...updateTrackedLine(item, target.newText, metadata),
            content: target.newText,
          }
        : item
    )),
    professional_experience: resume.professional_experience.map((experience) => ({
      ...experience,
      scope_statement: experience.scope_statement === oldText ? target.newText : experience.scope_statement,
      scope_statement_is_new: experience.scope_statement === oldText ? true : experience.scope_statement_is_new,
      scope_statement_addresses_requirements: experience.scope_statement === oldText
        ? uniqueRequirements([
            ...(experience.scope_statement_addresses_requirements ?? []),
            metadata?.requirement,
            ...(metadata?.requirements ?? []),
          ])
        : experience.scope_statement_addresses_requirements,
      bullets: experience.bullets.map((bullet) => (
        bullet.text === oldText
          ? {
              ...updateTrackedLine(bullet, target.newText, metadata),
              text: target.newText,
            }
          : bullet
      )),
    })),
    education: resume.education.map((education) => ({
      ...education,
      degree: markEditedText(education.degree),
      institution: markEditedText(education.institution),
    })),
    certifications: resume.certifications.map(markEditedText),
  };
}

export function applyOptimisticRequirementWorkItemProgress(
  workItems: RequirementWorkItem[] | null | undefined,
  newText: string,
  metadata?: OptimisticResumeEditMetadata,
): RequirementWorkItem[] | null {
  if (!workItems) return null;
  if (!metadata) return workItems;

  const requirementKeys = uniqueRequirements([
    metadata.requirement,
    ...(metadata.requirements ?? []),
  ]).map((requirement) => normalizeRequirementKey(requirement));
  const fallbackEvidence = metadata.evidenceFound?.trim() || newText.trim();
  const progress = deriveOptimisticProgress(metadata, {
    reviewState: metadata.reviewState,
    proofLevel: metadata.proofLevel,
    framingGuardrail: metadata.framingGuardrail,
    nextBestAction: metadata.nextBestAction,
    evidenceFound: metadata.evidenceFound,
  }, newText);

  let changed = false;
  const nextItems = workItems.map((item) => {
    const isMatch = metadata.workItemId
      ? item.id === metadata.workItemId
      : requirementKeys.includes(normalizeRequirementKey(item.requirement));
    if (!isMatch) return item;
    changed = true;

    const evidenceText = item.best_evidence_excerpt?.trim()
      || item.candidate_evidence.find((evidence) => evidence.text.trim())?.text.trim()
      || fallbackEvidence;
    const nextEvidence = evidenceText && !item.candidate_evidence.some((evidence) => (
      normalizeLooseText(evidence.text) === normalizeLooseText(evidenceText)
    ))
      ? [...item.candidate_evidence, progress?.evidence ?? {
          text: evidenceText,
          source_type: 'interview_context',
          evidence_strength: 'adjacent',
        }]
      : item.candidate_evidence;

    return {
      ...item,
      candidate_evidence: nextEvidence,
      best_evidence_excerpt: evidenceText || item.best_evidence_excerpt,
      recommended_bullet: newText,
      target_evidence: item.target_evidence || evidenceText || undefined,
      proof_level: progress?.proofLevel ?? item.proof_level,
      framing_guardrail: progress?.framingGuardrail ?? item.framing_guardrail,
      current_claim_strength: progress?.reviewState ?? item.current_claim_strength,
      next_best_action: progress?.nextBestAction ?? item.next_best_action,
    };
  });

  return changed ? nextItems : workItems;
}
