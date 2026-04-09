import type {
  CandidateIntelligence,
  RequirementSource,
  RequirementWorkItem,
  ResumeCustomSection,
  ResumeDraft,
} from '@/types/resume-v2';
import { buildResumeSectionPlan, getResumeCustomSectionMap } from '@/lib/resume-section-plan';

export type ResumeWorkflowStepKind =
  | 'executive_summary'
  | 'selected_accomplishments'
  | 'experience_role'
  | 'core_competencies'
  | 'custom_section';

export interface ResumeWorkflowRequirementViewModel {
  requirement: string;
  source: RequirementSource;
  whyItMatters: string;
  evidencePreview?: string;
}

export interface ResumeWorkflowSectionStepViewModel {
  id: string;
  kind: ResumeWorkflowStepKind;
  title: string;
  shortTitle: string;
  sectionKey: string;
  stepNumber: number;
  totalSteps: number;
  order: number;
  currentContent: string;
  currentContentLabel: string;
  sectionRationale: string;
  needsToDo: string[];
  whyThisWorks: string[];
  topRequirements: ResumeWorkflowRequirementViewModel[];
  experienceIndex?: number;
  customSectionId?: string;
}

export interface ResumeWorkflowSectionSummaryViewModel {
  id: string;
  title: string;
  enabled: boolean;
  order: number;
}

export interface ResumeSectionWorkflowViewModel {
  sections: ResumeWorkflowSectionSummaryViewModel[];
  steps: ResumeWorkflowSectionStepViewModel[];
}

export interface ResumeSectionDraftVariantContent {
  kind: 'paragraph' | 'bullet_list' | 'keyword_list' | 'role_block';
  paragraph?: string;
  lines?: string[];
  scopeStatement?: string;
}

export interface ResumeSectionDraftVariant {
  id: 'safer' | 'recommended' | 'stronger';
  label: string;
  helper: string;
  content: ResumeSectionDraftVariantContent;
}

export interface ResumeSectionDraftResult {
  recommendedVariantId: ResumeSectionDraftVariant['id'];
  variants: ResumeSectionDraftVariant[];
  whyItWorks: string[];
  strengtheningNote?: string;
}

function dedupeInOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  items.forEach((item) => {
    const normalized = normalize(item);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(item.trim());
  });

  return result;
}

function normalizeDraftSentence(text: string): string {
  return text
    .replace(/\[[^\]]{2,80}\]\s*:?\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function ensureSentenceEnding(text: string): string {
  const trimmed = normalizeDraftSentence(text);
  if (!trimmed) return '';
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function parseParagraphSentences(text: string): string[] {
  return dedupeInOrder(
    text
      .split(/(?<=[.!?])\s+/)
      .map(ensureSentenceEnding)
      .filter(Boolean),
  );
}

function parseResumeLines(text: string): string[] {
  return dedupeInOrder(
    text
      .split('\n')
      .map((line) => line.replace(/^[•*-]\s*/, ''))
      .map(normalizeDraftSentence)
      .filter(Boolean),
  );
}

function requirementScore(text: string, requirements: string[]): number {
  return requirements.reduce((best, requirement) => (
    Math.max(best, overlapScore(text, requirement))
  ), 0);
}

function pickBestItemsPreservingOrder(items: string[], requirements: string[], maxItems: number): string[] {
  if (items.length <= maxItems) return items;

  const scored = items.map((item, index) => ({
    item,
    index,
    score: requirementScore(item, requirements),
  }));
  const hasAnySignal = scored.some((entry) => entry.score > 0);
  const selected = (hasAnySignal ? scored : scored.slice())
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, maxItems)
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.item);

  return selected;
}

function buildFallbackWhyItWorks(step: ResumeWorkflowSectionStepViewModel): string[] {
  const primaryRequirement = step.topRequirements[0]?.requirement;
  const guidance = primaryRequirement
    ? `It keeps ${primaryRequirement} visible in this section without adding unsupported claims.`
    : 'It stays grounded in what is already on the page.';

  return dedupeInOrder([
    ...step.whyThisWorks,
    guidance,
    'It gives you a complete section draft to react to instead of stopping the workflow.',
  ]).slice(0, 4);
}

export function buildFallbackSectionDraftResult(
  step: ResumeWorkflowSectionStepViewModel,
  options?: { note?: string },
): ResumeSectionDraftResult {
  const requirements = uniqueRequirements(step.topRequirements.map((entry) => entry.requirement));
  const paragraphSentences = parseParagraphSentences(step.currentContent);
  const resumeLines = parseResumeLines(step.currentContent);

  if (step.kind === 'executive_summary') {
    const sentences = paragraphSentences.length > 0
      ? paragraphSentences
      : [ensureSentenceEnding(step.currentContent)].filter(Boolean);
    const saferSentences = pickBestItemsPreservingOrder(sentences, requirements, Math.min(3, sentences.length || 1));
    const recommendedSentences = pickBestItemsPreservingOrder(sentences, requirements, Math.min(4, sentences.length || 1));
    const strongerSentences = pickBestItemsPreservingOrder(sentences, requirements, Math.min(5, sentences.length || 1));

    return {
      recommendedVariantId: 'recommended',
      variants: [
        {
          id: 'safer',
          label: 'Safer version',
          helper: 'Keeps the opening tighter and conservative.',
          content: { kind: 'paragraph', paragraph: saferSentences.join(' ') || step.currentContent.trim() },
        },
        {
          id: 'recommended',
          label: 'Recommended version',
          helper: 'Best grounded version from the current resume.',
          content: { kind: 'paragraph', paragraph: recommendedSentences.join(' ') || step.currentContent.trim() },
        },
        {
          id: 'stronger',
          label: 'Stronger version if true',
          helper: 'Uses the fullest grounded version already supported here.',
          content: { kind: 'paragraph', paragraph: strongerSentences.join(' ') || step.currentContent.trim() },
        },
      ],
      whyItWorks: buildFallbackWhyItWorks(step),
      strengtheningNote: options?.note ?? 'If you have a sharper metric, scope detail, or leadership signal, add it after you apply this version.',
    };
  }

  if (step.kind === 'selected_accomplishments') {
    const lines = resumeLines;
    const saferLines = pickBestItemsPreservingOrder(lines, requirements, Math.min(2, lines.length || 1));
    const recommendedLines = pickBestItemsPreservingOrder(lines, requirements, Math.min(3, lines.length || 1));
    const strongerLines = pickBestItemsPreservingOrder(lines, requirements, Math.min(4, lines.length || 1));

    return {
      recommendedVariantId: 'recommended',
      variants: [
        {
          id: 'safer',
          label: 'Safer version',
          helper: 'Leads with the most defensible proof points.',
          content: { kind: 'bullet_list', lines: saferLines.length > 0 ? saferLines : lines },
        },
        {
          id: 'recommended',
          label: 'Recommended version',
          helper: 'Keeps the strongest bullets visible early.',
          content: { kind: 'bullet_list', lines: recommendedLines.length > 0 ? recommendedLines : lines },
        },
        {
          id: 'stronger',
          label: 'Stronger version if true',
          helper: 'Uses the fullest grounded proof already present.',
          content: { kind: 'bullet_list', lines: strongerLines.length > 0 ? strongerLines : lines },
        },
      ],
      whyItWorks: buildFallbackWhyItWorks(step),
      strengtheningNote: options?.note ?? 'If one of these bullets has a better metric or clearer ownership, tighten that line after you apply it.',
    };
  }

  if (step.kind === 'core_competencies') {
    const phrases = dedupeInOrder(
      step.currentContent
        .split(',')
        .map((phrase) => normalizeDraftSentence(phrase))
        .filter(Boolean),
    );
    const ranked = pickBestItemsPreservingOrder(phrases, requirements, Math.min(8, phrases.length || 1));

    return {
      recommendedVariantId: 'recommended',
      variants: [
        {
          id: 'safer',
          label: 'Safer version',
          helper: 'A tighter keyword list grounded in the current resume.',
          content: { kind: 'keyword_list', lines: ranked.slice(0, Math.min(6, ranked.length || 1)) },
        },
        {
          id: 'recommended',
          label: 'Recommended version',
          helper: 'The clearest ATS-friendly set from the current section.',
          content: { kind: 'keyword_list', lines: ranked },
        },
        {
          id: 'stronger',
          label: 'Stronger version if true',
          helper: 'Keeps the full grounded list that still fits this role.',
          content: { kind: 'keyword_list', lines: ranked },
        },
      ],
      whyItWorks: buildFallbackWhyItWorks(step),
      strengtheningNote: options?.note ?? 'If a higher-value keyword belongs here, swap it in after you apply this version.',
    };
  }

  if (step.kind === 'experience_role') {
    const [scopeStatement, ...lines] = resumeLines;
    const rankedLines = pickBestItemsPreservingOrder(lines, requirements, Math.min(4, lines.length || 1));

    return {
      recommendedVariantId: 'recommended',
      variants: [
        {
          id: 'safer',
          label: 'Safer version',
          helper: 'Keeps the role block concise and defensible.',
          content: {
            kind: 'role_block',
            scopeStatement,
            lines: rankedLines.slice(0, Math.min(3, rankedLines.length || 1)),
          },
        },
        {
          id: 'recommended',
          label: 'Recommended version',
          helper: 'Uses the clearest current scope and proof points.',
          content: {
            kind: 'role_block',
            scopeStatement,
            lines: rankedLines.length > 0 ? rankedLines : lines,
          },
        },
        {
          id: 'stronger',
          label: 'Stronger version if true',
          helper: 'Keeps the fullest grounded version of the role block.',
          content: {
            kind: 'role_block',
            scopeStatement,
            lines: rankedLines.length > 0 ? rankedLines : lines,
          },
        },
      ],
      whyItWorks: buildFallbackWhyItWorks(step),
      strengtheningNote: options?.note ?? 'If this role can support clearer scope, budget, team size, or business impact, add that after you apply this version.',
    };
  }

  const customLines = resumeLines;
  const customParagraph = parseParagraphSentences(step.currentContent).join(' ') || step.currentContent.trim();
  const useBullets = customLines.length > 1;

  return {
    recommendedVariantId: 'recommended',
    variants: [
      {
        id: 'safer',
        label: 'Safer version',
        helper: 'Keeps the section grounded in the current resume.',
        content: useBullets
          ? { kind: 'bullet_list', lines: customLines.slice(0, Math.min(3, customLines.length || 1)) }
          : { kind: 'paragraph', paragraph: customParagraph },
      },
      {
        id: 'recommended',
        label: 'Recommended version',
        helper: 'Best grounded version from the current section.',
        content: useBullets
          ? { kind: 'bullet_list', lines: customLines }
          : { kind: 'paragraph', paragraph: customParagraph },
      },
      {
        id: 'stronger',
        label: 'Stronger version if true',
        helper: 'Keeps the fullest grounded version already present here.',
        content: useBullets
          ? { kind: 'bullet_list', lines: customLines }
          : { kind: 'paragraph', paragraph: customParagraph },
      },
    ],
    whyItWorks: buildFallbackWhyItWorks(step),
    strengtheningNote: options?.note ?? 'If this section needs a sharper proof point, add it after you apply this version.',
  };
}

function uniqueRequirements(requirements: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const resolved: string[] = [];
  requirements.forEach((requirement) => {
    const trimmed = requirement?.trim();
    if (!trimmed) return;
    const key = normalize(trimmed);
    if (seen.has(key)) return;
    seen.add(key);
    resolved.push(trimmed);
  });
  return resolved;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function overlapScore(left: string, right: string): number {
  const leftTokens = new Set(normalize(left).split(/\s+/).filter(Boolean));
  const rightTokens = new Set(normalize(right).split(/\s+/).filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let overlap = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) overlap += 1;
  });

  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function importanceWeight(value: RequirementWorkItem['importance']): number {
  if (value === 'must_have') return 3;
  if (value === 'important') return 2;
  return 1;
}

function proofLevelWeight(value: RequirementWorkItem['proof_level']): number {
  switch (value) {
    case 'direct':
      return 3;
    case 'adjacent':
      return 2;
    case 'inferable':
      return 1;
    case 'none':
    default:
      return 0;
  }
}

function claimStrengthWeight(value: RequirementWorkItem['current_claim_strength']): number {
  switch (value) {
    case 'code_red':
      return 4;
    case 'strengthen':
      return 3;
    case 'confirm_fit':
      return 2;
    case 'supported_rewrite':
      return 1;
    case 'supported':
    default:
      return 0;
  }
}

function sourcePriorityWeight(
  kind: ResumeWorkflowStepKind,
  item: RequirementWorkItem,
): number {
  if (item.source === 'job_description') {
    switch (kind) {
      case 'executive_summary':
        return 8;
      case 'selected_accomplishments':
      case 'experience_role':
        return 7;
      case 'core_competencies':
        return 9;
      case 'custom_section':
      default:
        return 6;
    }
  }

  switch (kind) {
    case 'executive_summary':
      return item.proof_level === 'direct' ? 3 : 0;
    case 'selected_accomplishments':
    case 'experience_role':
      return item.proof_level === 'none' ? 0 : 2;
    case 'core_competencies':
      return 0;
    case 'custom_section':
    default:
      return 1;
  }
}

function benchmarkPenalty(
  kind: ResumeWorkflowStepKind,
  item: RequirementWorkItem,
): number {
  if (item.source !== 'benchmark') return 0;

  let penalty = 0;
  if (item.importance === 'nice_to_have') penalty += 2;
  if (item.proof_level === 'none') penalty += 3;

  if (kind === 'executive_summary') {
    if (item.category === 'benchmark_certification' || item.category === 'benchmark_differentiator') {
      penalty += 2;
    }
    if (item.current_claim_strength === 'confirm_fit') {
      penalty += 1;
    }
  }

  if (kind === 'core_competencies') {
    penalty += 2;
  }

  return penalty;
}

function shouldIncludeBenchmarkSupport(
  kind: ResumeWorkflowStepKind,
  item: RequirementWorkItem,
  prioritizedJobCount: number,
): boolean {
  if (item.source !== 'benchmark') return false;
  if (item.proof_level === 'none') return false;
  if (item.importance === 'nice_to_have' && item.proof_level !== 'direct') return false;
  if (kind === 'core_competencies') return false;
  if (kind === 'executive_summary') {
    if (prioritizedJobCount >= 2) return false;
    if (item.category === 'benchmark_differentiator' || item.category === 'benchmark_certification') {
      return false;
    }
  }
  return true;
}

function sectionNeedsToDo(kind: ResumeWorkflowStepKind, requirements: string[]): string[] {
  const primary = requirements[0];
  const secondary = requirements[1];

  switch (kind) {
    case 'executive_summary':
      return [
        'Make it obvious who you are and why this role fits.',
        primary ? `Show ${primary} early in the paragraph.` : 'Show your strongest business value early.',
        secondary ? `Support it with proof around ${secondary}.` : 'Support it with concrete proof, not generic claims.',
      ];
    case 'selected_accomplishments':
      return [
        'Bring the strongest proof points above the fold.',
        primary ? `Make this section clearly prove ${primary}.` : 'Lead with proof that matters most for the role.',
        secondary ? `Use another bullet to support ${secondary}.` : 'Use bullets with scope, outcome, or a defensible metric.',
      ];
    case 'experience_role':
      return [
        'Show what you owned, how big it was, and what changed.',
        primary ? `Make this role clearly prove ${primary}.` : 'Tie this role to the most important job needs.',
        'Keep the wording concrete and easy to defend in an interview.',
      ];
    case 'core_competencies':
      return [
        'Surface the clearest ATS keywords for this role.',
        primary ? `Make sure ${primary} is visible.` : 'Keep only the keywords that help this search.',
        'Keep it crisp and keyword-based, not sentence-based.',
      ];
    case 'custom_section':
    default:
      return [
        'Use this section to strengthen the overall story.',
        primary ? `Make it clearly support ${primary}.` : 'Keep the proof grounded and role-relevant.',
        'Avoid overlap with sections above it.',
      ];
  }
}

function whyThisMatters(kind: ResumeWorkflowStepKind, requirement: string, source: RequirementSource): string {
  const sourceLead = source === 'benchmark'
    ? 'Stronger candidates for roles like this usually show'
    : 'The job description is asking for';

  switch (kind) {
    case 'executive_summary':
      return `${sourceLead} ${requirement} near the top of the resume, so the reader understands the fit immediately.`;
    case 'selected_accomplishments':
      return `${sourceLead} ${requirement} with visible proof points early in the document.`;
    case 'experience_role':
      return `${sourceLead} ${requirement} inside the work history, not just in the opening story.`;
    case 'core_competencies':
      return `${sourceLead} ${requirement} in the keyword language recruiters scan first.`;
    case 'custom_section':
    default:
      return `${sourceLead} ${requirement} somewhere in the story, and this section can help carry that proof.`;
  }
}

function buildCurrentContent(kind: ResumeWorkflowStepKind, resume: ResumeDraft, options?: {
  experienceIndex?: number;
  customSection?: ResumeCustomSection;
}): { content: string; label: string } {
  switch (kind) {
    case 'executive_summary':
      return {
        content: resume.executive_summary.content.trim(),
        label: 'Current summary',
      };
    case 'selected_accomplishments':
      return {
        content: resume.selected_accomplishments
          .map((item) => item.content.trim())
          .filter(Boolean)
          .join('\n'),
        label: 'Current bullets',
      };
    case 'core_competencies':
      return {
        content: resume.core_competencies.filter(Boolean).join(', '),
        label: 'Current competencies',
      };
    case 'experience_role': {
      const experience = typeof options?.experienceIndex === 'number'
        ? resume.professional_experience[options.experienceIndex]
        : undefined;
      if (!experience) return { content: '', label: 'Current role draft' };
      return {
        content: [
          experience.scope_statement.trim(),
          ...experience.bullets.map((bullet) => bullet.text.trim()).filter(Boolean),
        ].filter(Boolean).join('\n'),
        label: 'Current role draft',
      };
    }
    case 'custom_section':
    default: {
      const customSection = options?.customSection;
      if (!customSection) return { content: '', label: 'Current section draft' };
      return {
        content: [customSection.summary?.trim(), ...customSection.lines.map((line) => line.trim())]
          .filter(Boolean)
          .join('\n'),
        label: 'Current section draft',
      };
    }
  }
}

function rankRequirementsForStep(args: {
  kind: ResumeWorkflowStepKind;
  title: string;
  content: string;
  workItems: RequirementWorkItem[];
}): ResumeWorkflowRequirementViewModel[] {
  const { kind, title, content, workItems } = args;
  const sectionText = `${title} ${content}`.trim();
  const ranked = workItems
    .map((item) => {
      const evidenceCorpus = [
        item.requirement,
        item.source_evidence,
        item.best_evidence_excerpt,
        item.target_evidence,
        ...item.candidate_evidence.map((evidence) => evidence.text),
      ]
        .filter(Boolean)
        .join(' ');

      const titleOverlap = overlapScore(sectionText, item.requirement);
      const contentOverlap = overlapScore(content, item.requirement);
      const evidenceOverlap = overlapScore(content, evidenceCorpus);
      const lexicalScore = (titleOverlap * 5) + (contentOverlap * 4) + (evidenceOverlap * 3);

      let score = lexicalScore;
      score += sourcePriorityWeight(kind, item);
      score += importanceWeight(item.importance) * 2.5;
      score += proofLevelWeight(item.proof_level) * (kind === 'selected_accomplishments' || kind === 'experience_role' ? 2.5 : 2);
      score += claimStrengthWeight(item.current_claim_strength) * (item.source === 'job_description' ? 1.5 : 1);
      score -= benchmarkPenalty(kind, item);

      return { item, score };
    })
    .sort((left, right) => (
      right.score - left.score
      || importanceWeight(right.item.importance) - importanceWeight(left.item.importance)
      || left.item.requirement.localeCompare(right.item.requirement)
    ));

  const prioritizedJobItems = ranked
    .filter(({ item }) => item.source === 'job_description')
    .slice(0, kind === 'core_competencies' ? 3 : 2);

  const supportingBenchmarkItems = ranked
    .filter(({ item }) => shouldIncludeBenchmarkSupport(kind, item, prioritizedJobItems.length))
    .slice(0, kind === 'executive_summary' ? 1 : 2);

  const eligibleRankedItems = ranked.filter(({ item }) => (
    item.source === 'job_description'
    || shouldIncludeBenchmarkSupport(kind, item, prioritizedJobItems.length)
  ));

  const selectedItems = dedupeInOrder([
    ...prioritizedJobItems.map(({ item }) => item.id),
    ...supportingBenchmarkItems.map(({ item }) => item.id),
    ...eligibleRankedItems.map(({ item }) => item.id),
  ])
    .map((id) => eligibleRankedItems.find(({ item }) => item.id === id)?.item)
    .filter((item): item is RequirementWorkItem => Boolean(item))
    .slice(0, 3);

  return selectedItems
    .map((item) => ({
      requirement: item.requirement,
      source: item.source,
      whyItMatters: whyThisMatters(kind, item.requirement, item.source),
      evidencePreview: item.best_evidence_excerpt ?? item.target_evidence ?? item.candidate_evidence[0]?.text,
    }));
}

function defaultSectionRationale(kind: ResumeWorkflowStepKind, title: string): string {
  switch (kind) {
    case 'executive_summary':
      return 'Lead with identity and the clearest why-me story for this role.';
    case 'selected_accomplishments':
      return 'Bring the strongest proof points above the fold.';
    case 'experience_role':
      return `Use ${title} to show scope, ownership, and results clearly.`;
    case 'core_competencies':
      return 'Keep the most useful search keywords visible near the top.';
    case 'custom_section':
    default:
      return `${title} should strengthen the story without repeating the sections above it.`;
  }
}

export function buildResumeSectionWorkflowViewModel(args: {
  resume: ResumeDraft;
  requirementWorkItems?: RequirementWorkItem[] | null;
  candidateIntelligence?: CandidateIntelligence | null;
}): ResumeSectionWorkflowViewModel {
  const { resume, requirementWorkItems } = args;
  const workItems = requirementWorkItems ?? [];
  const plan = buildResumeSectionPlan(resume)
    .filter((item) => item.enabled)
    .sort((left, right) => left.order - right.order);
  const customSectionMap = getResumeCustomSectionMap(resume);

  const steps: Omit<ResumeWorkflowSectionStepViewModel, 'stepNumber' | 'totalSteps'>[] = [];

  plan.forEach((item) => {
    if (item.id === 'executive_summary' && resume.executive_summary.content.trim()) {
      const current = buildCurrentContent('executive_summary', resume);
      const topRequirements = rankRequirementsForStep({
        kind: 'executive_summary',
        title: item.title,
        content: current.content,
        workItems,
      });
      steps.push({
        id: 'executive_summary',
        kind: 'executive_summary',
        title: item.title,
        shortTitle: 'Executive Summary',
        sectionKey: 'executive_summary',
        order: item.order,
        currentContent: current.content,
        currentContentLabel: current.label,
        sectionRationale: item.rationale ?? defaultSectionRationale('executive_summary', item.title),
        needsToDo: sectionNeedsToDo('executive_summary', topRequirements.map((entry) => entry.requirement)),
        whyThisWorks: [
          'It should sound like the clearest version of the opening story for this job.',
          'It should connect your identity, fit, and business value in one short paragraph.',
        ],
        topRequirements,
      });
      return;
    }

    if (item.id === 'selected_accomplishments' && resume.selected_accomplishments.length > 0) {
      const current = buildCurrentContent('selected_accomplishments', resume);
      const topRequirements = rankRequirementsForStep({
        kind: 'selected_accomplishments',
        title: item.title,
        content: current.content,
        workItems,
      });
      steps.push({
        id: 'selected_accomplishments',
        kind: 'selected_accomplishments',
        title: item.title,
        shortTitle: 'Selected Accomplishments',
        sectionKey: 'selected_accomplishments',
        order: item.order,
        currentContent: current.content,
        currentContentLabel: current.label,
        sectionRationale: item.rationale ?? defaultSectionRationale('selected_accomplishments', item.title),
        needsToDo: sectionNeedsToDo('selected_accomplishments', topRequirements.map((entry) => entry.requirement)),
        whyThisWorks: [
          'These bullets should prove the most important claims in the summary.',
          'They should make a strong reader stop and believe the fit quickly.',
        ],
        topRequirements,
      });
      return;
    }

    if (item.id === 'professional_experience') {
      resume.professional_experience.forEach((experience, index) => {
        const current = buildCurrentContent('experience_role', resume, { experienceIndex: index });
        const title = `${experience.title} · ${experience.company}`;
        const topRequirements = rankRequirementsForStep({
          kind: 'experience_role',
          title,
          content: current.content,
          workItems,
        });
        steps.push({
          id: `experience:${index}`,
          kind: 'experience_role',
          title,
          shortTitle: experience.company,
          sectionKey: 'professional_experience',
          order: item.order + index / 100,
          currentContent: current.content,
          currentContentLabel: current.label,
          sectionRationale: `Use ${experience.company} to prove the strongest current-fit evidence in the timeline.`,
          needsToDo: sectionNeedsToDo('experience_role', topRequirements.map((entry) => entry.requirement)),
          whyThisWorks: [
            'This role should show what you owned, how big it was, and what changed.',
            'The language should stay grounded enough that you could defend every claim in an interview.',
          ],
          topRequirements,
          experienceIndex: index,
        });
      });
      return;
    }

    if (item.id === 'core_competencies' && resume.core_competencies.length > 0) {
      const current = buildCurrentContent('core_competencies', resume);
      const topRequirements = rankRequirementsForStep({
        kind: 'core_competencies',
        title: item.title,
        content: current.content,
        workItems,
      });
      steps.push({
        id: 'core_competencies',
        kind: 'core_competencies',
        title: item.title,
        shortTitle: 'Core Competencies',
        sectionKey: 'core_competencies',
        order: item.order,
        currentContent: current.content,
        currentContentLabel: current.label,
        sectionRationale: item.rationale ?? defaultSectionRationale('core_competencies', item.title),
        needsToDo: sectionNeedsToDo('core_competencies', topRequirements.map((entry) => entry.requirement)),
        whyThisWorks: [
          'This section should help ATS systems and busy readers see the right themes fast.',
        ],
        topRequirements,
      });
      return;
    }

    const customSection = customSectionMap.get(item.id);
    if (customSection) {
      const current = buildCurrentContent('custom_section', resume, { customSection });
      const topRequirements = rankRequirementsForStep({
        kind: 'custom_section',
        title: customSection.title,
        content: current.content,
        workItems,
      });
      steps.push({
        id: `custom:${customSection.id}`,
        kind: 'custom_section',
        title: customSection.title,
        shortTitle: customSection.title,
        sectionKey: `custom_section:${customSection.id}`,
        order: item.order,
        currentContent: current.content,
        currentContentLabel: current.label,
        sectionRationale: item.rationale ?? customSection.rationale ?? defaultSectionRationale('custom_section', customSection.title),
        needsToDo: sectionNeedsToDo('custom_section', topRequirements.map((entry) => entry.requirement)),
        whyThisWorks: [
          'This section should add role-specific proof without repeating the sections above it.',
        ],
        topRequirements,
        customSectionId: customSection.id,
      });
    }
  });

  const orderedSteps = steps
    .sort((left, right) => left.order - right.order)
    .map((step, index, all) => ({
      ...step,
      stepNumber: index + 1,
      totalSteps: all.length,
    }));

  return {
    sections: buildResumeSectionPlan(resume)
      .sort((left, right) => left.order - right.order)
      .map((item) => ({
        id: item.id,
        title: item.title,
        enabled: item.enabled,
        order: item.order,
      })),
    steps: orderedSteps,
  };
}

export function renderSectionDraftVariantText(content: ResumeSectionDraftVariantContent): string {
  switch (content.kind) {
    case 'paragraph':
      return content.paragraph?.trim() ?? '';
    case 'keyword_list':
      return (content.lines ?? []).join(', ').trim();
    case 'bullet_list':
      return (content.lines ?? []).join('\n').trim();
    case 'role_block':
      return [content.scopeStatement?.trim(), ...(content.lines ?? []).map((line) => line.trim())]
        .filter(Boolean)
        .join('\n');
    default:
      return '';
  }
}

export function replaceSectionDraftVariantText(
  variant: ResumeSectionDraftVariant,
  nextText: string,
): ResumeSectionDraftVariant {
  const trimmed = nextText.trim();

  if (variant.content.kind === 'paragraph') {
    return {
      ...variant,
      content: {
        ...variant.content,
        paragraph: trimmed,
      },
    };
  }

  if (variant.content.kind === 'keyword_list') {
    const lines = trimmed
      .split(/[\n,]/)
      .map((line) => line.replace(/^[•*-]\s*/, '').trim())
      .filter(Boolean);
    return {
      ...variant,
      content: {
        ...variant.content,
        lines,
      },
    };
  }

  if (variant.content.kind === 'bullet_list') {
    const lines = trimmed
      .split('\n')
      .map((line) => line.replace(/^[•*-]\s*/, '').trim())
      .filter(Boolean);
    return {
      ...variant,
      content: {
        ...variant.content,
        lines,
      },
    };
  }

  const lines = trimmed
    .split('\n')
    .map((line) => line.replace(/^[•*-]\s*/, '').trim())
    .filter(Boolean);
  const [scopeStatement, ...bulletLines] = lines;
  return {
    ...variant,
    content: {
      ...variant.content,
      scopeStatement: scopeStatement ?? '',
      lines: bulletLines,
    },
  };
}

export function applySectionDraftVariantToResume(args: {
  resume: ResumeDraft;
  step: ResumeWorkflowSectionStepViewModel;
  variant: ResumeSectionDraftVariant;
}): ResumeDraft {
  const { resume, step, variant } = args;
  const requirementList = uniqueRequirements(step.topRequirements.map((entry) => entry.requirement));

  if (step.kind === 'executive_summary') {
    return {
      ...resume,
      executive_summary: {
        ...resume.executive_summary,
        content: renderSectionDraftVariantText(variant.content),
        is_new: true,
        addresses_requirements: uniqueRequirements([
          ...(resume.executive_summary.addresses_requirements ?? []),
          ...requirementList,
        ]),
      },
    };
  }

  if (step.kind === 'core_competencies') {
    const items = (variant.content.lines ?? [])
      .map((line) => line.trim())
      .filter(Boolean);
    return {
      ...resume,
      core_competencies: items.length > 0 ? items : resume.core_competencies,
    };
  }

  if (step.kind === 'selected_accomplishments') {
    const lines = (variant.content.lines ?? [])
      .map((line) => line.replace(/^[•*-]\s*/, '').trim())
      .filter(Boolean);
    if (lines.length === 0) return resume;
    return {
      ...resume,
      selected_accomplishments: lines.map((line, index) => {
        const previous = resume.selected_accomplishments[index];
        return {
          content: line,
          is_new: true,
          addresses_requirements: requirementList,
          primary_target_requirement: requirementList[0],
          primary_target_source: step.topRequirements[0]?.source ?? previous?.primary_target_source ?? 'job_description',
          target_evidence: previous?.target_evidence ?? step.topRequirements[0]?.evidencePreview,
          source: 'enhanced' as const,
          confidence: 'strong' as const,
          review_state: 'supported_rewrite' as const,
          evidence_found: previous?.evidence_found ?? step.topRequirements[0]?.evidencePreview ?? line,
          requirement_source: step.topRequirements[0]?.source ?? previous?.requirement_source ?? 'job_description',
          content_origin: 'resume_rewrite' as const,
          support_origin: 'original_resume' as const,
          work_item_id: previous?.work_item_id,
          proof_level: 'direct' as const,
          framing_guardrail: 'exact' as const,
          next_best_action: 'accept' as const,
        };
      }),
    };
  }

  if (step.kind === 'experience_role' && typeof step.experienceIndex === 'number') {
    return {
      ...resume,
      professional_experience: resume.professional_experience.map((experience, index) => {
        if (index !== step.experienceIndex) return experience;
        const nextScopeStatement = variant.content.scopeStatement?.trim() || experience.scope_statement;
        const nextBullets = (variant.content.lines ?? [])
          .map((line) => line.replace(/^[•*-]\s*/, '').trim())
          .filter(Boolean);
        return {
          ...experience,
          scope_statement: nextScopeStatement,
          scope_statement_is_new: nextScopeStatement !== experience.scope_statement ? true : experience.scope_statement_is_new,
          scope_statement_addresses_requirements: uniqueRequirements([
            ...(experience.scope_statement_addresses_requirements ?? []),
            ...requirementList,
          ]),
          bullets: nextBullets.length > 0
            ? nextBullets.map((line, bulletIndex) => {
                const previous = experience.bullets[bulletIndex];
                return {
                  text: line,
                  is_new: true,
                  addresses_requirements: requirementList,
                  primary_target_requirement: requirementList[0],
                  primary_target_source: step.topRequirements[0]?.source ?? previous?.primary_target_source ?? 'job_description',
                  target_evidence: previous?.target_evidence ?? step.topRequirements[0]?.evidencePreview,
                  source: 'enhanced' as const,
                  confidence: 'strong' as const,
                  review_state: 'supported_rewrite' as const,
                  evidence_found: previous?.evidence_found ?? step.topRequirements[0]?.evidencePreview ?? line,
                  requirement_source: step.topRequirements[0]?.source ?? previous?.requirement_source ?? 'job_description',
                  content_origin: 'resume_rewrite' as const,
                  support_origin: 'original_resume' as const,
                  work_item_id: previous?.work_item_id,
                  proof_level: 'direct' as const,
                  framing_guardrail: 'exact' as const,
                  next_best_action: 'accept' as const,
                };
              })
            : experience.bullets,
        };
      }),
    };
  }

  if (step.kind === 'custom_section' && step.customSectionId) {
    return {
      ...resume,
      custom_sections: (resume.custom_sections ?? []).map((section) => {
        if (section.id !== step.customSectionId) return section;
        if (variant.content.kind === 'paragraph') {
          return {
            ...section,
            summary: variant.content.paragraph?.trim() ?? section.summary,
          };
        }
        return {
          ...section,
          lines: (variant.content.lines ?? []).map((line) => line.replace(/^[•*-]\s*/, '').trim()).filter(Boolean),
          summary: variant.content.scopeStatement ?? section.summary,
        };
      }),
    };
  }

  return resume;
}
