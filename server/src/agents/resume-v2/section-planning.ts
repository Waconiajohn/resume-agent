import type {
  CandidateIntelligenceOutput,
  GapAnalysisOutput,
  ResumeCustomSection,
  ResumeDraftOutput,
  ResumeSectionPlanItem,
  ResumeSectionPlanSource,
} from './types.js';

const AI_SECTION_ID = 'ai_highlights';
const AI_REQUIREMENT_RE = /\b(ai|artificial intelligence|genai|machine learning|llm|automation|intelligent systems)\b/i;

function normalizeSectionTitle(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function hasAIRequirementSignal(gapAnalysis: GapAnalysisOutput): boolean {
  return (gapAnalysis.requirement_work_items ?? []).some((item) => AI_REQUIREMENT_RE.test(item.requirement))
    || gapAnalysis.requirements.some((item) => AI_REQUIREMENT_RE.test(item.requirement));
}

function buildAISection(
  candidate: CandidateIntelligenceOutput,
  gapAnalysis: GapAnalysisOutput,
): ResumeCustomSection | null {
  const readiness = candidate.ai_readiness;
  if (!readiness || readiness.strength === 'none') return null;

  const lines = readiness.signals
    .map((signal) => signal.executive_framing?.trim() || signal.evidence?.trim())
    .filter((line): line is string => typeof line === 'string' && line.length > 0)
    .filter((line, index, all) => all.findIndex((candidateLine) => candidateLine.toLowerCase() === line.toLowerCase()) === index)
    .slice(0, 3);

  if (lines.length === 0 && readiness.summary.trim().length === 0) return null;

  const roleNeedsAI = hasAIRequirementSignal(gapAnalysis);
  return {
    id: AI_SECTION_ID,
    title: roleNeedsAI ? 'AI Leadership & Transformation' : 'AI & Automation Leadership',
    kind: 'bullet_list',
    lines: lines.length > 0 ? lines : [readiness.summary.trim()],
    summary: readiness.summary.trim() || undefined,
    source: 'ai_readiness',
    recommended_for_job: roleNeedsAI,
    rationale: roleNeedsAI
      ? 'This role explicitly rewards AI, automation, or digital-transformation leadership.'
      : 'AI-adjacent leadership signals are present and may strengthen the story for the right roles.',
  };
}

function hasContent(draft: ResumeDraftOutput, sectionId: string, customSections: ResumeCustomSection[]): boolean {
  switch (sectionId) {
    case 'executive_summary':
      return draft.executive_summary.content.trim().length > 0;
    case 'selected_accomplishments':
      return draft.selected_accomplishments.length > 0;
    case 'core_competencies':
      return draft.core_competencies.length > 0;
    case 'professional_experience':
      return draft.professional_experience.length > 0;
    case 'earlier_career':
      return (draft.earlier_career?.length ?? 0) > 0;
    case 'education':
      return draft.education.length > 0;
    case 'certifications':
      return draft.certifications.length > 0;
    default:
      return customSections.some((section) => section.id === sectionId && ((section.summary?.trim().length ?? 0) > 0 || section.lines.length > 0));
  }
}

function buildRecommendedSectionPlan(
  draft: ResumeDraftOutput,
  customSections: ResumeCustomSection[],
  aiSection: ResumeCustomSection | null,
): ResumeSectionPlanItem[] {
  const standardOrder = draft.selected_accomplishments.length > 0
    ? ['executive_summary', 'selected_accomplishments', 'core_competencies', 'professional_experience', 'earlier_career', 'education', 'certifications']
    : ['executive_summary', 'core_competencies', 'professional_experience', 'earlier_career', 'education', 'certifications'];

  const aiPosition = aiSection?.recommended_for_job
    ? 2
    : draft.selected_accomplishments.length > 0 ? 3 : 2;
  const orderedIds = [...standardOrder];
  if (aiSection) {
    orderedIds.splice(Math.min(aiPosition, orderedIds.length), 0, AI_SECTION_ID);
  }

  const titles: Record<string, string> = {
    executive_summary: 'Executive Summary',
    selected_accomplishments: 'Selected Accomplishments',
    core_competencies: 'Core Competencies',
    professional_experience: 'Professional Experience',
    earlier_career: 'Earlier Career',
    education: 'Education',
    certifications: 'Certifications',
  };

  const rationales: Record<string, string> = {
    executive_summary: 'Lead with identity and the clearest version of the why-me story.',
    selected_accomplishments: 'Bring the strongest proof points above the fold.',
    core_competencies: 'Keep ATS language and executive themes visible early.',
    professional_experience: 'Anchor every claim in credible chronology and scope.',
    earlier_career: 'Preserve continuity without crowding the current story.',
    education: 'Keep relevant credentials available for scanning and compliance checks.',
    certifications: 'Show certifications only when they help this search.',
  };

  const plan: ResumeSectionPlanItem[] = orderedIds.map((sectionId, index) => {
    if (sectionId === AI_SECTION_ID && aiSection) {
      return {
        id: AI_SECTION_ID,
        type: 'ai_highlights',
        title: aiSection.title,
        enabled: hasContent(draft, AI_SECTION_ID, customSections),
        order: index,
        source: aiSection.source ?? 'ai_readiness',
        recommended_for_job: aiSection.recommended_for_job,
        rationale: aiSection.rationale,
        is_custom: true,
      };
    }

    return {
      id: sectionId,
      type: sectionId as ResumeSectionPlanItem['type'],
      title: titles[sectionId] ?? normalizeSectionTitle(sectionId, 'Section'),
      enabled: hasContent(draft, sectionId, customSections),
      order: index,
      source: sectionId === 'selected_accomplishments' ? 'job_match' : 'default',
      recommended_for_job: sectionId === 'selected_accomplishments' ? draft.selected_accomplishments.length > 0 : undefined,
      rationale: rationales[sectionId],
      is_custom: false,
    };
  });

  for (const section of customSections) {
    if (section.id === AI_SECTION_ID) continue;
    plan.push({
      id: section.id,
      type: 'custom',
      title: section.title,
      enabled: hasContent(draft, section.id, customSections),
      order: plan.length,
      source: section.source ?? 'user_added',
      recommended_for_job: section.recommended_for_job,
      rationale: section.rationale,
      is_custom: true,
    });
  }

  return plan.map((item, index) => ({ ...item, order: index }));
}

export function applySectionPlanning(
  draft: ResumeDraftOutput,
  candidate: CandidateIntelligenceOutput,
  gapAnalysis: GapAnalysisOutput,
): ResumeDraftOutput {
  const existingCustomSections = Array.isArray(draft.custom_sections) ? draft.custom_sections : [];
  const aiSection = buildAISection(candidate, gapAnalysis);

  const customSections = aiSection
    ? [
        ...existingCustomSections.filter((section) => section.id !== AI_SECTION_ID),
        aiSection,
      ]
    : existingCustomSections;

  return {
    ...draft,
    custom_sections: customSections,
    section_plan: buildRecommendedSectionPlan(draft, customSections, aiSection),
  };
}
