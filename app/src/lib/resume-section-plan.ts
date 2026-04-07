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
export type ResumeCustomSectionPresetId =
  | 'board_advisory'
  | 'selected_projects'
  | 'speaking_publications'
  | 'transformation_highlights'
  | 'custom';

export interface ResumeCustomSectionPreset {
  id: ResumeCustomSectionPresetId;
  title: string;
  rationale: string;
}

export interface ResumeSectionStarterSuggestion {
  text: string;
  support?: string;
}

export interface ResumeSectionDraftSuggestion {
  lines: string[];
  support?: string[];
}

export interface ResumeCustomSectionPresetRecommendation {
  presetId: ResumeCustomSectionPresetId;
  title: string;
  whyNow: string;
  readyLineCount: number;
}

export interface ResumeCustomSectionAddition {
  sectionId: string;
  resume: ResumeDraft;
  lines: string[];
  title: string;
  presetId?: ResumeCustomSectionPresetId;
}

export const RESUME_CUSTOM_SECTION_PRESETS: ResumeCustomSectionPreset[] = [
  {
    id: 'board_advisory',
    title: 'Board & Advisory Experience',
    rationale: 'Highlight board-facing work, governance leadership, or advisory roles that strengthen executive credibility.',
  },
  {
    id: 'selected_projects',
    title: 'Selected Projects',
    rationale: 'Create a home for transformations, turnarounds, launches, or strategic initiatives that deserve their own spotlight.',
  },
  {
    id: 'speaking_publications',
    title: 'Speaking & Publications',
    rationale: 'Show conferences, thought leadership, media, or publications that reinforce market credibility.',
  },
  {
    id: 'transformation_highlights',
    title: 'Transformation Highlights',
    rationale: 'Call out cross-functional change work, operating-model redesign, or digital transformation wins above the fold.',
  },
];

const CUSTOM_SECTION_RECOMMENDATION_RULES: Record<Exclude<ResumeCustomSectionPresetId, 'custom'>, {
  requirementPatterns: RegExp[];
  whyNow: string;
}> = {
  board_advisory: {
    requirementPatterns: [/\bboard\b/i, /\bgovernance\b/i, /\badvis/i, /\bsteering\b/i, /\boperating review\b/i, /\bexecutive stakeholder\b/i],
    whyNow: 'Board-facing or governance-heavy leadership can strengthen the executive story for this role.',
  },
  selected_projects: {
    requirementPatterns: [/\blaunch/i, /\bprogram/i, /\binitiative/i, /\bturnaround\b/i, /\btransformation\b/i, /\bportfolio\b/i],
    whyNow: 'This role benefits from giving major initiatives their own spotlight instead of burying them inside chronology.',
  },
  speaking_publications: {
    requirementPatterns: [/\bthought leadership\b/i, /\bspeaking\b/i, /\bconference\b/i, /\bpublication\b/i, /\bmarket presence\b/i],
    whyNow: 'Thought leadership can reinforce external credibility and executive presence for this search.',
  },
  transformation_highlights: {
    requirementPatterns: [/\btransform/i, /\bautomation\b/i, /\bdigital\b/i, /\boperating model\b/i, /\bmodern/i, /\bai\b/i, /\bgenai\b/i],
    whyNow: 'The role is signaling transformation, automation, or AI change leadership, and this section can make that proof easier to see.',
  },
};

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

function slugifySectionId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function uniqueSuggestionTexts(suggestions: ResumeSectionStarterSuggestion[]): ResumeSectionStarterSuggestion[] {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = suggestion.text.toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueDraftSuggestions(suggestions: ResumeSectionDraftSuggestion[]): ResumeSectionDraftSuggestion[] {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const normalizedLines = suggestion.lines
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const key = normalizedLines.join('\n').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    suggestion.lines = normalizedLines;
    suggestion.support = suggestion.support?.filter((value) => value.trim().length > 0);
    return normalizedLines.length > 0;
  });
}

function stripTrailingPeriod(value: string): string {
  return value.trim().replace(/[.]+$/, '');
}

function firstMatchingEvidence(
  workItems: RequirementWorkItem[] | null | undefined,
  patterns: RegExp[],
): string | null {
  for (const item of workItems ?? []) {
    const texts = [
      item.best_evidence_excerpt,
      item.target_evidence,
      item.recommended_bullet,
      ...item.candidate_evidence.map((evidence) => evidence.text),
      item.requirement,
    ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

    for (const text of texts) {
      if (patterns.some((pattern) => pattern.test(text))) {
        return stripTrailingPeriod(text);
      }
    }
  }
  return null;
}

function firstMatchingHiddenAccomplishment(
  candidate: CandidateIntelligence | null | undefined,
  patterns: RegExp[],
): string | null {
  for (const item of candidate?.hidden_accomplishments ?? []) {
    if (patterns.some((pattern) => pattern.test(item))) {
      return stripTrailingPeriod(item);
    }
  }
  return null;
}

function topOutcomeLine(candidate: CandidateIntelligence | null | undefined): string | null {
  const outcome = candidate?.quantified_outcomes?.[0];
  if (!outcome?.outcome?.trim()) return null;
  return outcome.value?.trim()
    ? `${stripTrailingPeriod(outcome.outcome)} (${outcome.value.trim()})`
    : stripTrailingPeriod(outcome.outcome);
}

function topExperienceBullet(candidate: CandidateIntelligence | null | undefined): string | null {
  return candidate?.experience
    ?.flatMap((experience) => experience.bullets)
    .find((bullet) => bullet.trim().length > 0)
    ?.trim() ?? null;
}

function normalizeDraftLines(lines: string[]): string[] {
  return lines
    .map((line) => line.trim())
    .filter((line, index, all) => line.length > 0 && all.findIndex((candidate) => candidate.toLowerCase() === line.toLowerCase()) === index);
}

function hasRequirementSignal(
  workItems: RequirementWorkItem[] | null | undefined,
  patterns: RegExp[],
): boolean {
  return (workItems ?? []).some((item) => {
    const haystacks = [
      item.requirement,
      item.source_evidence,
      item.best_evidence_excerpt,
      item.target_evidence,
    ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    return haystacks.some((text) => patterns.some((pattern) => pattern.test(text)));
  });
}

function buildProjectsSuggestion(candidate: CandidateIntelligence | null | undefined): ResumeSectionStarterSuggestion[] {
  const outcome = topOutcomeLine(candidate);
  const themePhrase = candidate?.career_themes?.slice(0, 2).join(' and ');
  const experienceBullet = topExperienceBullet(candidate);
  const suggestions: ResumeSectionStarterSuggestion[] = [];

  if (outcome && themePhrase) {
    suggestions.push({
      text: `Led ${themePhrase.toLowerCase()} initiatives that ${outcome}.`,
      support: outcome,
    });
  }
  if (experienceBullet) {
    suggestions.push({
      text: stripTrailingPeriod(experienceBullet) + '.',
      support: experienceBullet,
    });
  }
  return uniqueSuggestionTexts(suggestions).slice(0, 3);
}

function buildProjectsDraftSuggestions(
  candidate: CandidateIntelligence | null | undefined,
): ResumeSectionDraftSuggestion[] {
  const outcome = topOutcomeLine(candidate);
  const themePhrase = candidate?.career_themes?.slice(0, 2).join(' and ');
  const experienceBullet = topExperienceBullet(candidate);
  const drafts: ResumeSectionDraftSuggestion[] = [];

  const primaryLines = normalizeDraftLines([
    outcome && themePhrase ? `Led ${themePhrase.toLowerCase()} initiatives that ${outcome}.` : '',
    experienceBullet ? stripTrailingPeriod(experienceBullet) + '.' : '',
  ]);
  if (primaryLines.length > 0) {
    drafts.push({
      lines: primaryLines,
      support: [outcome, experienceBullet].filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
    });
  }

  return uniqueDraftSuggestions(drafts).slice(0, 2);
}

function buildTransformationSuggestion(
  candidate: CandidateIntelligence | null | undefined,
  workItems: RequirementWorkItem[] | null | undefined,
): ResumeSectionStarterSuggestion[] {
  const suggestions: ResumeSectionStarterSuggestion[] = [];
  const aiFraming = candidate?.ai_readiness?.signals
    ?.map((signal) => signal.executive_framing?.trim() || signal.evidence?.trim())
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  const outcome = topOutcomeLine(candidate);
  const scale = candidate?.operational_scale?.trim();
  const transformationEvidence = firstMatchingEvidence(workItems, [
    /\btransform/i,
    /\bmodern/i,
    /\boperating model/i,
    /\bautomation/i,
    /\bdigital/i,
  ]);

  if (aiFraming?.[0]) {
    suggestions.push({
      text: stripTrailingPeriod(aiFraming[0]) + '.',
      support: aiFraming[0],
    });
  }
  if (transformationEvidence && scale) {
    suggestions.push({
      text: `Led transformation work across ${scale} while ${stripTrailingPeriod(transformationEvidence).replace(/^[A-Z]/, (char) => char.toLowerCase())}.`,
      support: transformationEvidence,
    });
  }
  if (outcome && scale) {
    suggestions.push({
      text: `Drove transformation initiatives across ${scale} that ${outcome}.`,
      support: outcome,
    });
  }
  return uniqueSuggestionTexts(suggestions).slice(0, 3);
}

function buildTransformationDraftSuggestions(
  candidate: CandidateIntelligence | null | undefined,
  workItems: RequirementWorkItem[] | null | undefined,
): ResumeSectionDraftSuggestion[] {
  const aiFraming = candidate?.ai_readiness?.signals
    ?.map((signal) => signal.executive_framing?.trim() || signal.evidence?.trim())
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  const outcome = topOutcomeLine(candidate);
  const scale = candidate?.operational_scale?.trim();
  const transformationEvidence = firstMatchingEvidence(workItems, [
    /\btransform/i,
    /\bmodern/i,
    /\boperating model/i,
    /\bautomation/i,
    /\bdigital/i,
  ]);
  const drafts: ResumeSectionDraftSuggestion[] = [];

  const primaryLines = normalizeDraftLines([
    aiFraming?.[0] ? stripTrailingPeriod(aiFraming[0]) + '.' : '',
    transformationEvidence && scale
      ? `Led transformation work across ${scale} while ${stripTrailingPeriod(transformationEvidence).replace(/^[A-Z]/, (char) => char.toLowerCase())}.`
      : '',
    outcome && scale ? `Drove transformation initiatives across ${scale} that ${outcome}.` : '',
  ]);

  if (primaryLines.length > 0) {
    drafts.push({
      lines: primaryLines,
      support: [aiFraming?.[0], transformationEvidence, outcome].filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
    });
  }

  return uniqueDraftSuggestions(drafts).slice(0, 2);
}

function buildBoardSuggestion(
  candidate: CandidateIntelligence | null | undefined,
  workItems: RequirementWorkItem[] | null | undefined,
): ResumeSectionStarterSuggestion[] {
  const boardEvidence = firstMatchingEvidence(workItems, [
    /\bboard\b/i,
    /\badvis/i,
    /\bsteering\b/i,
    /\bgovernance\b/i,
    /\boperating review\b/i,
    /\bscorecard\b/i,
    /\bexecutive stakeholder\b/i,
    /\bpe-backed\b/i,
  ]) ?? firstMatchingHiddenAccomplishment(candidate, [
    /\bboard\b/i,
    /\badvis/i,
    /\bgovernance\b/i,
    /\boperating review\b/i,
    /\bscorecard\b/i,
  ]);
  const scale = candidate?.operational_scale?.trim();

  if (!boardEvidence) return [];

  return uniqueSuggestionTexts([
    {
      text: scale
        ? `Delivered operating reviews and executive decision support across ${scale}, using ${stripTrailingPeriod(boardEvidence).replace(/^[A-Z]/, (char) => char.toLowerCase())}.`
        : stripTrailingPeriod(boardEvidence) + '.',
      support: boardEvidence,
    },
  ]);
}

function buildBoardDraftSuggestions(
  candidate: CandidateIntelligence | null | undefined,
  workItems: RequirementWorkItem[] | null | undefined,
): ResumeSectionDraftSuggestion[] {
  const boardEvidence = firstMatchingEvidence(workItems, [
    /\bboard\b/i,
    /\badvis/i,
    /\bsteering\b/i,
    /\bgovernance\b/i,
    /\boperating review\b/i,
    /\bscorecard\b/i,
    /\bexecutive stakeholder\b/i,
    /\bpe-backed\b/i,
  ]) ?? firstMatchingHiddenAccomplishment(candidate, [
    /\bboard\b/i,
    /\badvis/i,
    /\bgovernance\b/i,
    /\boperating review\b/i,
    /\bscorecard\b/i,
  ]);
  const scale = candidate?.operational_scale?.trim();
  const outcome = topOutcomeLine(candidate);
  if (!boardEvidence) return [];

  const lines = normalizeDraftLines([
    scale
      ? `Delivered operating reviews and executive decision support across ${scale}, using ${stripTrailingPeriod(boardEvidence).replace(/^[A-Z]/, (char) => char.toLowerCase())}.`
      : stripTrailingPeriod(boardEvidence) + '.',
    outcome ? `Helped leadership teams act on performance signals that ${outcome}.` : '',
  ]);

  return uniqueDraftSuggestions([
    {
      lines,
      support: [boardEvidence, outcome].filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
    },
  ]);
}

function buildSpeakingSuggestion(
  candidate: CandidateIntelligence | null | undefined,
  workItems: RequirementWorkItem[] | null | undefined,
): ResumeSectionStarterSuggestion[] {
  const evidence = firstMatchingHiddenAccomplishment(candidate, [
    /\bspeak/i,
    /\bkeynote/i,
    /\bpanel/i,
    /\bpublish/i,
    /\bpublication/i,
    /\barticle/i,
    /\bconference/i,
  ]) ?? firstMatchingEvidence(workItems, [
    /\bspeak/i,
    /\bkeynote/i,
    /\bpanel/i,
    /\bpublish/i,
    /\bpublication/i,
    /\barticle/i,
    /\bconference/i,
  ]);

  return evidence
    ? [{ text: stripTrailingPeriod(evidence) + '.', support: evidence }]
    : [];
}

function buildSpeakingDraftSuggestions(
  candidate: CandidateIntelligence | null | undefined,
  workItems: RequirementWorkItem[] | null | undefined,
): ResumeSectionDraftSuggestion[] {
  const evidence = firstMatchingHiddenAccomplishment(candidate, [
    /\bspeak/i,
    /\bkeynote/i,
    /\bpanel/i,
    /\bpublish/i,
    /\bpublication/i,
    /\barticle/i,
    /\bconference/i,
  ]) ?? firstMatchingEvidence(workItems, [
    /\bspeak/i,
    /\bkeynote/i,
    /\bpanel/i,
    /\bpublish/i,
    /\bpublication/i,
    /\barticle/i,
    /\bconference/i,
  ]);

  if (!evidence) return [];

  return uniqueDraftSuggestions([
    {
      lines: [stripTrailingPeriod(evidence) + '.'],
      support: [evidence],
    },
  ]);
}

export function buildCustomSectionDraftSuggestions(
  candidate: CandidateIntelligence | null | undefined,
  workItems: RequirementWorkItem[] | null | undefined,
  presetId: ResumeCustomSectionPresetId,
): ResumeSectionDraftSuggestion[] {
  switch (presetId) {
    case 'selected_projects':
      return buildProjectsDraftSuggestions(candidate);
    case 'transformation_highlights':
      return buildTransformationDraftSuggestions(candidate, workItems);
    case 'board_advisory':
      return buildBoardDraftSuggestions(candidate, workItems);
    case 'speaking_publications':
      return buildSpeakingDraftSuggestions(candidate, workItems);
    case 'custom':
      return [];
  }
}

export function buildCustomSectionPresetRecommendations(
  candidate: CandidateIntelligence | null | undefined,
  workItems: RequirementWorkItem[] | null | undefined,
  existingSectionIds: string[] = [],
): ResumeCustomSectionPresetRecommendation[] {
  const existingIds = new Set(existingSectionIds);
  const recommendations: ResumeCustomSectionPresetRecommendation[] = [];

  for (const preset of RESUME_CUSTOM_SECTION_PRESETS) {
    if (preset.id === 'custom') continue;
    if (existingIds.has(preset.id)) continue;

    const draftSuggestions = buildCustomSectionDraftSuggestions(candidate, workItems, preset.id);
    if (draftSuggestions.length === 0) continue;

    const rule = CUSTOM_SECTION_RECOMMENDATION_RULES[preset.id];
    const roleSignal = hasRequirementSignal(workItems, rule.requirementPatterns);
    const readyLineCount = draftSuggestions[0]?.lines.length ?? 0;

    if (!roleSignal && readyLineCount < 2 && preset.id !== 'board_advisory' && preset.id !== 'speaking_publications') {
      continue;
    }

    recommendations.push({
      presetId: preset.id,
      title: preset.title,
      whyNow: roleSignal
        ? rule.whyNow
        : `We already have enough grounded evidence to draft this section now, without asking the user to start from scratch.`,
      readyLineCount,
    });
  }

  return recommendations.sort((a, b) => b.readyLineCount - a.readyLineCount || a.title.localeCompare(b.title));
}

export function buildCustomSectionStarterSuggestions(
  candidate: CandidateIntelligence | null | undefined,
  workItems: RequirementWorkItem[] | null | undefined,
  presetId: ResumeCustomSectionPresetId,
): ResumeSectionStarterSuggestion[] {
  const draftSuggestions = buildCustomSectionDraftSuggestions(candidate, workItems, presetId);
  if (draftSuggestions.length > 0) {
    return uniqueSuggestionTexts(
      draftSuggestions.map((suggestion) => ({
        text: suggestion.lines[0] ?? '',
        support: suggestion.support?.[0],
      })),
    );
  }

  switch (presetId) {
    case 'selected_projects':
      return buildProjectsSuggestion(candidate);
    case 'transformation_highlights':
      return buildTransformationSuggestion(candidate, workItems);
    case 'board_advisory':
      return buildBoardSuggestion(candidate, workItems);
    case 'speaking_publications':
      return buildSpeakingSuggestion(candidate, workItems);
    case 'custom':
      return [];
  }
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

function buildUniqueCustomSectionId(
  customSections: ResumeCustomSection[],
  title: string,
  presetId?: ResumeCustomSectionPresetId,
): string {
  const preferredId = presetId && presetId !== 'custom'
    ? presetId
    : slugifySectionId(title) || 'custom_section';
  const existingIds = new Set(customSections.map((section) => section.id));
  if (!existingIds.has(preferredId)) return preferredId;

  let suffix = 2;
  let candidate = `${preferredId}_${suffix}`;
  while (existingIds.has(candidate)) {
    suffix += 1;
    candidate = `${preferredId}_${suffix}`;
  }
  return candidate;
}

export function prepareResumeCustomSectionAddition(
  resume: ResumeDraft,
  options: {
    title: string;
    firstLine?: string;
    lines?: string[];
    presetId?: ResumeCustomSectionPresetId;
  },
): ResumeCustomSectionAddition | null {
  const customSections = normalizeResumeCustomSections(resume);
  const normalizedTitle = normalizeSectionTitle(options.title, 'Custom Section');
  const normalizedLines = normalizeDraftLines(options.lines ?? (options.firstLine ? [options.firstLine] : []));
  if (normalizedLines.length === 0) return null;

  const preset = options.presetId
    ? RESUME_CUSTOM_SECTION_PRESETS.find((candidate) => candidate.id === options.presetId)
    : undefined;
  const id = buildUniqueCustomSectionId(customSections, normalizedTitle, options.presetId);
  const nextCustomSections = [
    ...customSections,
    {
      id,
      title: normalizedTitle,
      kind: 'bullet_list' as const,
      lines: normalizedLines,
      source: 'user_added' as ResumeSectionPlanSource,
      rationale: preset?.rationale,
    },
  ];

  const seededPlan = buildResumeSectionPlan({
    ...resume,
    custom_sections: nextCustomSections,
  });
  const insertedIndex = seededPlan.findIndex((item) => item.id === id);
  const professionalExperienceIndex = seededPlan.findIndex((item) => item.id === 'professional_experience');

  if (insertedIndex === -1) {
    return {
      sectionId: id,
      resume: cloneResume({ ...resume, custom_sections: nextCustomSections }, seededPlan, nextCustomSections),
      lines: normalizedLines,
      title: normalizedTitle,
      presetId: options.presetId,
    };
  }

  const nextPlan = [...seededPlan];
  const [insertedItem] = nextPlan.splice(insertedIndex, 1);
  nextPlan.splice(
    professionalExperienceIndex === -1 ? nextPlan.length : professionalExperienceIndex,
    0,
    {
      ...insertedItem,
      enabled: true,
      title: normalizedTitle,
      source: 'user_added',
      rationale: preset?.rationale ?? insertedItem.rationale,
    },
  );

  return {
    sectionId: id,
    resume: cloneResume(
      { ...resume, custom_sections: nextCustomSections },
      nextPlan.map((item, index) => ({ ...item, order: index })),
      nextCustomSections,
    ),
    lines: normalizedLines,
    title: normalizedTitle,
    presetId: options.presetId,
  };
}

export function addResumeCustomSection(
  resume: ResumeDraft,
  options: {
    title: string;
    firstLine?: string;
    lines?: string[];
    presetId?: ResumeCustomSectionPresetId;
  },
): ResumeDraft {
  return prepareResumeCustomSectionAddition(resume, options)?.resume ?? resume;
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
