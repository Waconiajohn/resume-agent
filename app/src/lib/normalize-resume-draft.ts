import type {
  AssemblyResult,
  BulletConfidence,
  RequirementSource,
  ResumeContentOrigin,
  ResumeDraft,
  ResumeExperience,
  ResumePriorityTarget,
  ResumeReviewState,
  ResumeSupportOrigin,
} from '@/types/resume-v2';

type LooseRequirementSource = RequirementSource | string | null | undefined;
type LooseBulletConfidence = BulletConfidence | string | null | undefined;
type LooseContentOrigin = ResumeContentOrigin | string | null | undefined;
type LooseSupportOrigin = ResumeSupportOrigin | string | null | undefined;
type LooseReviewState = ResumeReviewState | string | null | undefined;
type LooseBulletSource = 'original' | 'enhanced' | 'drafted' | string | null | undefined;

function normalizeRequirementSource(value: LooseRequirementSource): RequirementSource {
  return value === 'benchmark' ? 'benchmark' : 'job_description';
}

function inferConfidence(
  isNew: boolean,
  evidenceFound: string,
  addressesRequirements: string[],
  existingConfidence: LooseBulletConfidence,
  existingContentOrigin: LooseContentOrigin,
): BulletConfidence {
  if (existingConfidence === 'strong' || existingConfidence === 'partial' || existingConfidence === 'needs_validation') {
    return existingConfidence;
  }

  const normalizedOrigin = typeof existingContentOrigin === 'string' ? existingContentOrigin.trim() : '';
  if (normalizedOrigin === 'gap_closing_draft' || normalizedOrigin === 'drafted_to_close_gap') return 'needs_validation';
  if (normalizedOrigin === 'verbatim_resume' || normalizedOrigin === 'original_resume') return 'strong';
  if (normalizedOrigin === 'resume_rewrite' || normalizedOrigin === 'multi_source_synthesis' || normalizedOrigin === 'enhanced_from_resume') {
    return evidenceFound.trim().length > 0 ? 'strong' : 'partial';
  }

  if (isNew && evidenceFound.trim().length === 0) return 'needs_validation';
  if (addressesRequirements.length > 0 && evidenceFound.trim().length === 0) return 'needs_validation';
  if (evidenceFound.trim().length > 0) return 'strong';
  if (addressesRequirements.length > 0) return 'partial';
  return 'strong';
}

function normalizeBulletSource(value: LooseBulletSource): 'original' | 'enhanced' | 'drafted' | undefined {
  if (value === 'original' || value === 'enhanced' || value === 'drafted') {
    return value;
  }
  return undefined;
}

function normalizeReviewState(
  value: LooseReviewState,
  options: {
    confidence: BulletConfidence;
    requirementSource: RequirementSource;
    contentOrigin?: ResumeContentOrigin;
    primaryTargetRequirement?: string;
    targetEvidence?: string;
  },
): ResumeReviewState {
  if (
    value === 'supported'
    || value === 'supported_rewrite'
    || value === 'strengthen'
    || value === 'confirm_fit'
    || value === 'code_red'
  ) {
    return value;
  }

  const hasPrimaryTarget = typeof options.primaryTargetRequirement === 'string'
    && options.primaryTargetRequirement.trim().length > 0;
  const hasTargetEvidence = typeof options.targetEvidence === 'string'
    && options.targetEvidence.trim().length > 0;

  if (options.confidence === 'needs_validation' && options.requirementSource === 'benchmark') {
    return 'confirm_fit';
  }
  if (options.confidence === 'needs_validation') {
    return 'code_red';
  }
  if (options.requirementSource === 'benchmark' && hasPrimaryTarget && !hasTargetEvidence) {
    return 'confirm_fit';
  }
  if (options.confidence === 'partial') {
    return options.requirementSource === 'benchmark' ? 'confirm_fit' : 'strengthen';
  }
  if (
    options.contentOrigin
    && options.contentOrigin !== 'verbatim_resume'
    && hasPrimaryTarget
    && !hasTargetEvidence
  ) {
    return options.requirementSource === 'benchmark' ? 'confirm_fit' : 'strengthen';
  }
  return options.contentOrigin && options.contentOrigin !== 'verbatim_resume'
    ? 'supported_rewrite'
    : 'supported';
}

function normalizeLooseText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeContentOrigin(
  value: LooseContentOrigin,
  options: {
    confidence: BulletConfidence;
    source?: LooseBulletSource;
    evidenceFound: string;
    currentText: string;
    isNew: boolean;
  },
): ResumeContentOrigin {
  if (
    value === 'verbatim_resume'
    || value === 'resume_rewrite'
    || value === 'multi_source_synthesis'
    || value === 'gap_closing_draft'
  ) {
    return value;
  }

  if (value === 'original_resume') return 'verbatim_resume';
  if (value === 'enhanced_from_resume') return 'resume_rewrite';
  if (value === 'drafted_to_close_gap') return 'gap_closing_draft';

  const normalizedSource = normalizeBulletSource(options.source);
  if (normalizedSource === 'original') return 'verbatim_resume';
  if (normalizedSource === 'drafted') return 'gap_closing_draft';
  if (normalizedSource === 'enhanced') {
    return options.evidenceFound.trim().length > 0 ? 'resume_rewrite' : 'multi_source_synthesis';
  }

  const normalizedText = normalizeLooseText(options.currentText);
  const normalizedEvidence = normalizeLooseText(options.evidenceFound);
  if (normalizedText && normalizedEvidence && normalizedText === normalizedEvidence) {
    return 'verbatim_resume';
  }

  if (options.confidence === 'needs_validation' && options.evidenceFound.trim().length === 0) {
    return 'gap_closing_draft';
  }
  if (options.evidenceFound.trim().length > 0) {
    return options.isNew ? 'multi_source_synthesis' : 'resume_rewrite';
  }
  if (options.confidence === 'partial') return 'resume_rewrite';
  return 'verbatim_resume';
}

function normalizeSupportOrigin(value: LooseSupportOrigin, evidenceFound: string, confidence: BulletConfidence): ResumeSupportOrigin {
  if (
    value === 'original_resume'
    || value === 'adjacent_resume_inference'
    || value === 'user_confirmed_context'
    || value === 'not_found'
  ) {
    return value;
  }

  if (evidenceFound.trim().length > 0) return 'original_resume';
  if (confidence === 'partial') return 'adjacent_resume_inference';
  return 'not_found';
}

function normalizeRequirements(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function normalizeExperienceEntry(entry: ResumeExperience): ResumeExperience {
  const bullets = Array.isArray(entry?.bullets) ? entry.bullets : [];

  return {
    ...entry,
    company: typeof entry?.company === 'string' ? entry.company : '',
    title: typeof entry?.title === 'string' ? entry.title : '',
    start_date: typeof entry?.start_date === 'string' ? entry.start_date : '',
    end_date: typeof entry?.end_date === 'string' ? entry.end_date : '',
    scope_statement: typeof entry?.scope_statement === 'string' ? entry.scope_statement : '',
    bullets: bullets.map((bullet) => {
      const evidenceFound = typeof bullet?.evidence_found === 'string' ? bullet.evidence_found : '';
      const addressesRequirements = normalizeRequirements(bullet?.addresses_requirements);
      const isNew = Boolean(bullet?.is_new);
      const confidence = inferConfidence(isNew, evidenceFound, addressesRequirements, bullet?.confidence, bullet?.content_origin);
      const primaryTargetRequirement = typeof bullet?.primary_target_requirement === 'string'
        ? bullet.primary_target_requirement
        : addressesRequirements[0] ?? undefined;
      const targetEvidence = typeof bullet?.target_evidence === 'string'
        ? bullet.target_evidence
        : '';

      return {
        ...bullet,
        text: typeof bullet?.text === 'string' ? bullet.text : '',
        is_new: isNew,
        addresses_requirements: addressesRequirements,
        primary_target_requirement: primaryTargetRequirement,
        primary_target_source: normalizeRequirementSource(
          bullet?.primary_target_source ?? bullet?.requirement_source,
        ),
        target_evidence: targetEvidence,
        evidence_found: evidenceFound,
        requirement_source: normalizeRequirementSource(bullet?.requirement_source),
        source: normalizeBulletSource((bullet as { source?: LooseBulletSource })?.source),
        confidence,
        content_origin: normalizeContentOrigin(
          bullet?.content_origin,
          {
            confidence,
            source: (bullet as { source?: LooseBulletSource })?.source,
            evidenceFound,
            currentText: typeof bullet?.text === 'string' ? bullet.text : '',
            isNew,
          },
        ),
        support_origin: normalizeSupportOrigin(
          bullet?.support_origin,
          evidenceFound,
          confidence,
        ),
        review_state: normalizeReviewState((bullet as { review_state?: LooseReviewState })?.review_state, {
          confidence,
          requirementSource: normalizeRequirementSource(bullet?.requirement_source),
          contentOrigin: normalizeContentOrigin(
            bullet?.content_origin,
            {
              confidence,
              source: (bullet as { source?: LooseBulletSource })?.source,
              evidenceFound,
              currentText: typeof bullet?.text === 'string' ? bullet.text : '',
              isNew,
            },
          ),
          primaryTargetRequirement,
          targetEvidence,
        }),
      };
    }),
  };
}

function normalizeSelectedAccomplishmentTargets(value: unknown): ResumePriorityTarget[] {
  return Array.isArray(value)
    ? value
      .filter((item): item is ResumePriorityTarget => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        requirement: typeof item.requirement === 'string' ? item.requirement : '',
        source: normalizeRequirementSource(item.source),
        importance:
          item.importance === 'must_have' || item.importance === 'important' || item.importance === 'nice_to_have'
            ? item.importance
            : 'important',
        source_evidence: typeof item.source_evidence === 'string' ? item.source_evidence : undefined,
      }))
      .filter((item) => item.requirement.trim().length > 0)
    : [];
}

export function normalizeResumeDraft(resume: ResumeDraft | null | undefined): ResumeDraft | null {
  if (!resume) return null;

  const selectedAccomplishments = Array.isArray(resume.selected_accomplishments) ? resume.selected_accomplishments : [];
  const professionalExperience = Array.isArray(resume.professional_experience) ? resume.professional_experience : [];

  return {
    ...resume,
    header: {
      name: typeof resume.header?.name === 'string' ? resume.header.name : '',
      phone: typeof resume.header?.phone === 'string' ? resume.header.phone : '',
      email: typeof resume.header?.email === 'string' ? resume.header.email : '',
      linkedin: typeof resume.header?.linkedin === 'string' ? resume.header.linkedin : undefined,
      branded_title: typeof resume.header?.branded_title === 'string' ? resume.header.branded_title : '',
    },
    executive_summary: {
      content: typeof resume.executive_summary?.content === 'string' ? resume.executive_summary.content : '',
      is_new: Boolean(resume.executive_summary?.is_new),
      addresses_requirements: normalizeRequirements(resume.executive_summary?.addresses_requirements),
    },
    core_competencies: Array.isArray(resume.core_competencies)
      ? resume.core_competencies.filter((item): item is string => typeof item === 'string')
      : [],
    selected_accomplishments: selectedAccomplishments.map((item) => {
      const evidenceFound = typeof item?.evidence_found === 'string' ? item.evidence_found : '';
      const addressesRequirements = normalizeRequirements(item?.addresses_requirements);
      const isNew = Boolean(item?.is_new);
      const confidence = inferConfidence(isNew, evidenceFound, addressesRequirements, item?.confidence, item?.content_origin);
      const primaryTargetRequirement = typeof item?.primary_target_requirement === 'string'
        ? item.primary_target_requirement
        : addressesRequirements[0] ?? undefined;
      const targetEvidence = typeof item?.target_evidence === 'string'
        ? item.target_evidence
        : '';

      return {
        ...item,
        content: typeof item?.content === 'string' ? item.content : '',
        is_new: isNew,
        addresses_requirements: addressesRequirements,
        primary_target_requirement: primaryTargetRequirement,
        primary_target_source: normalizeRequirementSource(
          item?.primary_target_source ?? item?.requirement_source,
        ),
        target_evidence: targetEvidence,
        evidence_found: evidenceFound,
        requirement_source: normalizeRequirementSource(item?.requirement_source),
        source: normalizeBulletSource((item as { source?: LooseBulletSource })?.source),
        confidence,
        content_origin: normalizeContentOrigin(
          item?.content_origin,
          {
            confidence,
            source: (item as { source?: LooseBulletSource })?.source,
            evidenceFound,
            currentText: typeof item?.content === 'string' ? item.content : '',
            isNew,
          },
        ),
        support_origin: normalizeSupportOrigin(
          item?.support_origin,
          evidenceFound,
          confidence,
        ),
        review_state: normalizeReviewState((item as { review_state?: LooseReviewState })?.review_state, {
          confidence,
          requirementSource: normalizeRequirementSource(item?.requirement_source),
          contentOrigin: normalizeContentOrigin(
            item?.content_origin,
            {
              confidence,
              source: (item as { source?: LooseBulletSource })?.source,
              evidenceFound,
              currentText: typeof item?.content === 'string' ? item.content : '',
              isNew,
            },
          ),
          primaryTargetRequirement,
          targetEvidence,
        }),
      };
    }),
    selected_accomplishment_targets: normalizeSelectedAccomplishmentTargets(resume.selected_accomplishment_targets),
    professional_experience: professionalExperience.map((entry) => normalizeExperienceEntry(entry)),
    earlier_career: Array.isArray(resume.earlier_career)
      ? resume.earlier_career.filter((entry): entry is NonNullable<ResumeDraft['earlier_career']>[number] => Boolean(entry)).map((entry) => ({
          company: typeof entry.company === 'string' ? entry.company : '',
          title: typeof entry.title === 'string' ? entry.title : '',
          dates: typeof entry.dates === 'string' ? entry.dates : '',
        }))
      : [],
    education: Array.isArray(resume.education)
      ? resume.education.filter((entry): entry is ResumeDraft['education'][number] => Boolean(entry)).map((entry) => ({
          degree: typeof entry.degree === 'string' ? entry.degree : '',
          institution: typeof entry.institution === 'string' ? entry.institution : '',
          year: typeof entry.year === 'string' ? entry.year : undefined,
        }))
      : [],
    certifications: Array.isArray(resume.certifications)
      ? resume.certifications.filter((item): item is string => typeof item === 'string')
      : [],
  };
}

export function normalizeAssemblyResult(assembly: AssemblyResult | null | undefined): AssemblyResult | null {
  if (!assembly) return null;

  return {
    ...assembly,
    final_resume: normalizeResumeDraft(assembly.final_resume) ?? assembly.final_resume,
  };
}
