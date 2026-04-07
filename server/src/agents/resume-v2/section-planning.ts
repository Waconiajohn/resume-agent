import type {
  CandidateIntelligenceOutput,
  GapAnalysisOutput,
  RequirementWorkItem,
  ResumeCustomSection,
  ResumeDraftOutput,
  ResumeSectionPlanItem,
  ResumeSectionPlanSource,
} from './types.js';

const AI_SECTION_ID = 'ai_highlights';
const AI_REQUIREMENT_RE = /\b(ai|artificial intelligence|genai|machine learning|llm|automation|intelligent systems)\b/i;
const TRANSFORMATION_SECTION_ID = 'transformation_highlights';
const BOARD_SECTION_ID = 'board_advisory';
const TRANSFORMATION_REQUIREMENT_RE = /\b(transform|transformation|automation|digital|modern|operating model|ai|genai)\b/i;
const BOARD_REQUIREMENT_RE = /\b(board|governance|advis|steering|operating review|executive stakeholder|scorecard)\b/i;

export interface ResumeWriterSectionStrategy {
  recommended_custom_sections: ResumeCustomSection[];
  guidance_lines: string[];
}

function normalizeSectionTitle(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function hasAIRequirementSignal(gapAnalysis: GapAnalysisOutput): boolean {
  return (gapAnalysis.requirement_work_items ?? []).some((item) => AI_REQUIREMENT_RE.test(item.requirement))
    || gapAnalysis.requirements.some((item) => AI_REQUIREMENT_RE.test(item.requirement));
}

function uniqueLines(lines: Array<string | undefined | null>, limit = 3): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const line of lines) {
    const trimmed = line?.trim();
    if (!trimmed) continue;
    const normalized = trimmed.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    results.push(trimmed.endsWith('.') ? trimmed : `${trimmed}.`);
    if (results.length >= limit) break;
  }
  return results;
}

function firstQuantifiedOutcome(candidate: CandidateIntelligenceOutput): string | null {
  const topOutcome = candidate.quantified_outcomes?.[0];
  if (!topOutcome?.outcome?.trim()) return null;
  return topOutcome.value?.trim()
    ? `${topOutcome.outcome.trim()} (${topOutcome.value.trim()})`
    : topOutcome.outcome.trim();
}

function findMatchingWorkItems(
  gapAnalysis: GapAnalysisOutput,
  pattern: RegExp,
): RequirementWorkItem[] {
  return (gapAnalysis.requirement_work_items ?? []).filter((item) => (
    pattern.test(item.requirement)
      || (item.source_evidence ? pattern.test(item.source_evidence) : false)
      || (item.best_evidence_excerpt ? pattern.test(item.best_evidence_excerpt) : false)
      || (item.target_evidence ? pattern.test(item.target_evidence) : false)
      || item.candidate_evidence.some((evidence) => pattern.test(evidence.text))
  ));
}

function matchingEvidenceLines(items: RequirementWorkItem[], limit = 3): string[] {
  return uniqueLines(
    items.flatMap((item) => [
      item.best_evidence_excerpt,
      item.target_evidence,
      ...item.candidate_evidence.map((evidence) => evidence.text),
    ]),
    limit,
  );
}

function buildTransformationSection(
  candidate: CandidateIntelligenceOutput,
  gapAnalysis: GapAnalysisOutput,
): ResumeCustomSection | null {
  const matchingItems = findMatchingWorkItems(gapAnalysis, TRANSFORMATION_REQUIREMENT_RE);
  const roleSignal = matchingItems.length > 0
    || gapAnalysis.requirements.some((item) => TRANSFORMATION_REQUIREMENT_RE.test(item.requirement));

  const aiSignals = candidate.ai_readiness?.signals
    ?.map((signal) => signal.executive_framing?.trim() || signal.evidence?.trim())
    .filter((line): line is string => typeof line === 'string' && line.length > 0) ?? [];
  const evidenceLines = matchingEvidenceLines(matchingItems, 2);
  const quantifiedOutcome = firstQuantifiedOutcome(candidate);
  const scale = candidate.operational_scale?.trim();

  const lines = uniqueLines([
    ...aiSignals,
    ...evidenceLines,
    quantifiedOutcome && scale ? `Drove transformation initiatives across ${scale} that ${quantifiedOutcome}` : undefined,
  ], 3);

  if (!roleSignal || lines.length === 0) return null;

  return {
    id: TRANSFORMATION_SECTION_ID,
    title: 'Transformation Highlights',
    kind: 'bullet_list',
    lines,
    source: 'job_match',
    recommended_for_job: true,
    rationale: 'This role rewards transformation, automation, or operating-model change leadership, so a dedicated section helps that proof stand out earlier.',
  };
}

function buildBoardSection(
  candidate: CandidateIntelligenceOutput,
  gapAnalysis: GapAnalysisOutput,
): ResumeCustomSection | null {
  const matchingItems = findMatchingWorkItems(gapAnalysis, BOARD_REQUIREMENT_RE);
  const roleSignal = matchingItems.length > 0
    || gapAnalysis.requirements.some((item) => BOARD_REQUIREMENT_RE.test(item.requirement));

  const hiddenEvidence = (candidate.hidden_accomplishments ?? []).filter((item) => BOARD_REQUIREMENT_RE.test(item));
  const lines = uniqueLines([
    ...matchingEvidenceLines(matchingItems, 2),
    ...hiddenEvidence,
  ], 3);

  if (!roleSignal || lines.length === 0) return null;

  return {
    id: BOARD_SECTION_ID,
    title: 'Board & Advisory Experience',
    kind: 'bullet_list',
    lines,
    source: 'job_match',
    recommended_for_job: true,
    rationale: 'Board-facing or governance-heavy roles read faster when the advisory, steering, or executive decision-support work has its own focused section.',
  };
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

function buildRecommendedCustomSections(
  candidate: CandidateIntelligenceOutput,
  gapAnalysis: GapAnalysisOutput,
): ResumeCustomSection[] {
  return [
    buildAISection(candidate, gapAnalysis),
    buildTransformationSection(candidate, gapAnalysis),
    buildBoardSection(candidate, gapAnalysis),
  ].filter((section): section is ResumeCustomSection => Boolean(section));
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
  const prioritizedCustomSections = customSections.filter((section) => section.id !== AI_SECTION_ID && section.recommended_for_job);
  const optionalCustomSections = customSections.filter((section) => section.id !== AI_SECTION_ID && !section.recommended_for_job);

  const orderedIds: string[] = ['executive_summary'];
  if (draft.selected_accomplishments.length > 0) {
    orderedIds.push('selected_accomplishments');
  }
  if (aiSection?.recommended_for_job) {
    orderedIds.push(AI_SECTION_ID);
  }
  if (prioritizedCustomSections.length > 0) {
    orderedIds.push(...prioritizedCustomSections.map((section) => section.id));
  }
  orderedIds.push(
    'core_competencies',
    ...(aiSection && !aiSection.recommended_for_job ? [AI_SECTION_ID] : []),
    'professional_experience',
    'earlier_career',
    'education',
    'certifications',
  );

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

    const customSection = prioritizedCustomSections.find((section) => section.id === sectionId);
    if (customSection) {
      return {
        id: customSection.id,
        type: 'custom',
        title: customSection.title,
        enabled: hasContent(draft, customSection.id, customSections),
        order: index,
        source: customSection.source ?? 'job_match',
        recommended_for_job: customSection.recommended_for_job,
        rationale: customSection.rationale,
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

  for (const section of optionalCustomSections) {
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

function buildWriterSectionGuidanceLines(section: ResumeCustomSection): string[] {
  const evidenceLines = uniqueLines([
    section.summary,
    ...section.lines,
  ], 3);

  if (evidenceLines.length === 0) {
    return [`Use this section only if the draft already carries strong proof for "${section.title}".`];
  }

  return evidenceLines.map((line, index) => `Evidence ${index + 1}: ${line}`);
}

export function applySectionPlanning(
  draft: ResumeDraftOutput,
  candidate: CandidateIntelligenceOutput,
  gapAnalysis: GapAnalysisOutput,
): ResumeDraftOutput {
  const existingCustomSections = Array.isArray(draft.custom_sections) ? draft.custom_sections : [];
  const recommendedCustomSections = buildRecommendedCustomSections(candidate, gapAnalysis);
  const customSectionMap = new Map(existingCustomSections.map((section) => [section.id, section]));
  for (const recommendedSection of recommendedCustomSections) {
    const existing = customSectionMap.get(recommendedSection.id);
    customSectionMap.set(recommendedSection.id, existing ? { ...recommendedSection, ...existing } : recommendedSection);
  }
  const customSections = Array.from(customSectionMap.values());
  const aiSection = customSections.find((section) => section.id === AI_SECTION_ID) ?? null;

  return {
    ...draft,
    custom_sections: customSections,
    section_plan: buildRecommendedSectionPlan(draft, customSections, aiSection),
  };
}

export function buildWriterSectionStrategy(
  candidate: CandidateIntelligenceOutput,
  gapAnalysis: GapAnalysisOutput,
): ResumeWriterSectionStrategy {
  const recommendedCustomSections = buildRecommendedCustomSections(candidate, gapAnalysis);
  const guidance_lines: string[] = [
    'Open with Executive Summary first. If you have 3-4 spectacular proof points, follow with Selected Accomplishments.',
    'Treat dedicated highlight sections as proof-above-the-fold content. Place recommended custom sections before Core Competencies and Professional Experience so recruiters see the strongest role-specific story early.',
    'Keep Core Competencies above Professional Experience so ATS and recruiters still see the role language early, but do not let competencies crowd out stronger proof sections.',
  ];

  for (const section of recommendedCustomSections) {
    guidance_lines.push(
      `If the evidence supports it, include a dedicated "${section.title}" section before Professional Experience. Why: ${section.rationale}`,
    );
    guidance_lines.push(...buildWriterSectionGuidanceLines(section));
  }

  if (recommendedCustomSections.length === 0) {
    guidance_lines.push('Do not force extra custom sections unless the candidate has enough grounded evidence for them to feel intentional and useful.');
  }

  return {
    recommended_custom_sections: recommendedCustomSections,
    guidance_lines,
  };
}
