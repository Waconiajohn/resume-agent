import type {
  CandidateIntelligence,
  RequirementWorkItem,
  ResumeCustomSection,
  ResumeDraft,
  ResumeSectionPlanItem,
  ResumeSectionPlanSource,
  ResumeSectionType,
} from '@/types/resume-v2';

const STANDARD_SECTION_ORDER: Array<{
  id: string;
  type: ResumeSectionType;
  title: string;
}> = [
  { id: 'executive_summary', type: 'executive_summary', title: 'Executive Summary' },
  { id: 'core_competencies', type: 'core_competencies', title: 'Core Competencies' },
  { id: 'selected_accomplishments', type: 'selected_accomplishments', title: 'Selected Accomplishments' },
  { id: 'professional_experience', type: 'professional_experience', title: 'Professional Experience' },
  { id: 'earlier_career', type: 'earlier_career', title: 'Earlier Career' },
  { id: 'education', type: 'education', title: 'Education' },
  { id: 'certifications', type: 'certifications', title: 'Certifications' },
];
type AIReadinessSignal = NonNullable<CandidateIntelligence['ai_readiness']>['signals'][number];

function hasSectionContent(resume: ResumeDraft, type: ResumeSectionType): boolean {
  switch (type) {
    case 'executive_summary':
      return resume.executive_summary.content.trim().length > 0;
    case 'core_competencies':
      return Array.isArray(resume.core_competencies) && resume.core_competencies.length > 0;
    case 'selected_accomplishments':
      return Array.isArray(resume.selected_accomplishments) && resume.selected_accomplishments.length > 0;
    case 'professional_experience':
      return Array.isArray(resume.professional_experience) && resume.professional_experience.length > 0;
    case 'earlier_career':
      return (resume.earlier_career?.length ?? 0) > 0;
    case 'education':
      return Array.isArray(resume.education) && resume.education.length > 0;
    case 'certifications':
      return Array.isArray(resume.certifications) && resume.certifications.length > 0;
    case 'ai_highlights':
    case 'custom':
      return false;
  }
}

function normalizeSectionTitle(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function normalizeCustomSection(section: ResumeCustomSection): ResumeCustomSection {
  return {
    id: section.id,
    title: normalizeSectionTitle(section.title, 'Custom Section'),
    kind: section.kind === 'paragraph' ? 'paragraph' : 'bullet_list',
    lines: Array.isArray(section.lines)
      ? section.lines.filter((line): line is string => typeof line === 'string' && line.trim().length > 0)
      : [],
    summary: typeof section.summary === 'string' && section.summary.trim().length > 0
      ? section.summary
      : undefined,
    source: section.source,
    recommended_for_job: section.recommended_for_job === true,
    rationale: typeof section.rationale === 'string' && section.rationale.trim().length > 0
      ? section.rationale
      : undefined,
  };
}

export function normalizeResumeCustomSections(resume: ResumeDraft): ResumeCustomSection[] {
  const customSections = Array.isArray(resume.custom_sections) ? resume.custom_sections : [];
  return customSections
    .filter((section): section is ResumeCustomSection => Boolean(section) && typeof section === 'object')
    .map(normalizeCustomSection)
    .filter((section) => section.id.trim().length > 0);
}

export function buildResumeSectionPlan(resume: ResumeDraft): ResumeSectionPlanItem[] {
  const existingPlan = Array.isArray(resume.section_plan) ? resume.section_plan : [];
  const customSections = normalizeResumeCustomSections(resume);
  const planById = new Map(
    existingPlan
      .filter((item): item is ResumeSectionPlanItem => Boolean(item) && typeof item === 'object' && typeof item.id === 'string')
      .map((item) => [item.id, item]),
  );

  const standardItems = STANDARD_SECTION_ORDER.map((section, index) => {
    const existing = planById.get(section.id);
    return {
      id: section.id,
      type: section.type,
      title: normalizeSectionTitle(existing?.title, section.title),
      enabled: typeof existing?.enabled === 'boolean' ? existing.enabled : hasSectionContent(resume, section.type),
      order: typeof existing?.order === 'number' ? existing.order : index,
      source: existing?.source ?? 'default',
      recommended_for_job: existing?.recommended_for_job,
      rationale: existing?.rationale,
      is_custom: false,
    } satisfies ResumeSectionPlanItem;
  });

  const customItems = customSections.map((section, index) => {
    const existing = planById.get(section.id);
    return {
      id: section.id,
      type: section.id === 'ai_highlights' ? 'ai_highlights' : 'custom',
      title: normalizeSectionTitle(existing?.title, section.title),
      enabled: typeof existing?.enabled === 'boolean' ? existing.enabled : true,
      order: typeof existing?.order === 'number' ? existing.order : standardItems.length + index,
      source: existing?.source ?? section.source ?? 'user_added',
      recommended_for_job: existing?.recommended_for_job ?? section.recommended_for_job,
      rationale: existing?.rationale ?? section.rationale,
      is_custom: true,
    } satisfies ResumeSectionPlanItem;
  });

  return [...standardItems, ...customItems]
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
    .map((item, index) => ({ ...item, order: index }));
}

export function getEnabledResumeSectionPlan(resume: ResumeDraft): ResumeSectionPlanItem[] {
  return buildResumeSectionPlan(resume).filter((item) => item.enabled);
}

function cloneResume(resume: ResumeDraft, sectionPlan: ResumeSectionPlanItem[], customSections?: ResumeCustomSection[]): ResumeDraft {
  return {
    ...resume,
    section_plan: sectionPlan,
    custom_sections: customSections ?? normalizeResumeCustomSections(resume),
  };
}

export function moveResumeSection(resume: ResumeDraft, sectionId: string, direction: 'up' | 'down'): ResumeDraft {
  const plan = buildResumeSectionPlan(resume);
  const currentIndex = plan.findIndex((item) => item.id === sectionId);
  if (currentIndex === -1) return resume;
  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= plan.length) return resume;
  const next = [...plan];
  [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]];
  return cloneResume(resume, next.map((item, index) => ({ ...item, order: index })));
}

export function setResumeSectionEnabled(resume: ResumeDraft, sectionId: string, enabled: boolean): ResumeDraft {
  const nextPlan = buildResumeSectionPlan(resume).map((item) => (
    item.id === sectionId ? { ...item, enabled } : item
  ));
  return cloneResume(resume, nextPlan);
}

export function removeResumeCustomSection(resume: ResumeDraft, sectionId: string): ResumeDraft {
  const customSections = normalizeResumeCustomSections(resume).filter((section) => section.id !== sectionId);
  const nextPlan = buildResumeSectionPlan(resume)
    .filter((item) => item.id !== sectionId)
    .map((item, index) => ({ ...item, order: index }));
  return cloneResume(resume, nextPlan, customSections);
}

function inferAISectionTitle(requirementWorkItems?: RequirementWorkItem[] | null): string {
  const aiSignals = (requirementWorkItems ?? []).some((item) => /\b(ai|artificial intelligence|genai|llm|automation)\b/i.test(item.requirement));
  return aiSignals ? 'AI Leadership & Transformation' : 'AI & Automation Leadership';
}

export function buildAIHighlightsSection(
  candidate: CandidateIntelligence | null | undefined,
  requirementWorkItems?: RequirementWorkItem[] | null,
): ResumeCustomSection | null {
  const readiness = candidate?.ai_readiness;
  if (!readiness || readiness.strength === 'none') return null;

  const lines = readiness.signals
    .map((signal: AIReadinessSignal) => signal.executive_framing?.trim() || signal.evidence?.trim())
    .filter((line: string | undefined): line is string => typeof line === 'string' && line.length > 0)
    .filter((line: string, index: number, all: string[]) => all.findIndex((candidateLine: string) => candidateLine.toLowerCase() === line.toLowerCase()) === index)
    .slice(0, 3);

  if (lines.length === 0 && readiness.summary.trim().length === 0) return null;

  return {
    id: 'ai_highlights',
    title: inferAISectionTitle(requirementWorkItems),
    kind: 'bullet_list',
    lines: lines.length > 0 ? lines : [readiness.summary.trim()],
    summary: readiness.summary.trim() || undefined,
    source: 'ai_readiness',
    recommended_for_job: (requirementWorkItems ?? []).some((item) => item.source === 'benchmark' || /\b(ai|genai|automation)\b/i.test(item.requirement)),
    rationale: 'Highlights AI-adjacent leadership signals already present in the candidate profile.',
  };
}

export function addOrEnableAIHighlightsSection(
  resume: ResumeDraft,
  candidate: CandidateIntelligence | null | undefined,
  requirementWorkItems?: RequirementWorkItem[] | null,
): ResumeDraft {
  const existingCustomSections = normalizeResumeCustomSections(resume);
  const existingAI = existingCustomSections.find((section) => section.id === 'ai_highlights');
  const aiSection = existingAI ?? buildAIHighlightsSection(candidate, requirementWorkItems);
  if (!aiSection) return resume;

  const nextCustomSections = existingAI
    ? existingCustomSections.map((section) => (section.id === 'ai_highlights' ? { ...section, ...aiSection } : section))
    : [...existingCustomSections, aiSection];
  const nextPlan: ResumeSectionPlanItem[] = buildResumeSectionPlan({
    ...resume,
    custom_sections: nextCustomSections,
  }).map((item) => (
    item.id === 'ai_highlights'
      ? {
          ...item,
          enabled: true,
          title: aiSection.title,
          source: 'ai_readiness' as ResumeSectionPlanSource,
          recommended_for_job: aiSection.recommended_for_job,
          rationale: aiSection.rationale,
        }
      : item
  ));

  return cloneResume(
    { ...resume, custom_sections: nextCustomSections },
    nextPlan,
    nextCustomSections,
  );
}

export function getResumeCustomSectionMap(resume: ResumeDraft): Map<string, ResumeCustomSection> {
  return new Map(normalizeResumeCustomSections(resume).map((section) => [section.id, section]));
}
