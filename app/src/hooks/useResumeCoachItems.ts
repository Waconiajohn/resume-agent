/**
 * useResumeCoachItems — Unified Document-Order Item List
 *
 * Walks the resume in reading order (top to bottom) and produces a flat
 * array of CoachItem objects. Each item represents a coachable resume line
 * enriched with rewrite queue data, work item metadata, and section-aware
 * enhance actions.
 *
 * Replaces: attentionItems, sectionCoachTargets, rewriteQueue counter.
 * Still uses rewriteQueue internally for suggestedDraft and suggestionScore.
 */

import { useMemo } from 'react';
import type {
  ResumeDraft,
  ResumeReviewState,
  RequirementSource,
  ProofLevel,
  NextBestAction,
  FramingGuardrail,
  SuggestionScore,
  RewriteQueueItem,
  BulletConfidence,
} from '@/types/resume-v2';
import type { EnhanceActionConfig, SectionType, EnhanceAction } from '@/lib/section-enhance-config';
import { getEnhanceActionsForSection, getDefaultEnhanceAction, deriveSectionType } from '@/lib/section-enhance-config';

export interface CoachItem {
  id: string;
  section: string;
  index: number;
  sectionType: SectionType;
  text: string;
  status: 'needs_attention' | 'reviewed' | 'strong';
  reviewState: ResumeReviewState;
  requirements: string[];
  requirementSource?: RequirementSource;
  evidenceFound: string;
  workItemId?: string;
  proofLevel?: ProofLevel;
  nextBestAction?: NextBestAction;
  framingGuardrail?: FramingGuardrail;
  isAIEnhanced?: boolean;
  suggestedDraft?: string;
  suggestionScore?: SuggestionScore;
  enhanceActions: EnhanceActionConfig[];
  defaultEnhanceAction: EnhanceAction;
  documentOrder: number;
  sectionLabel: string;
  locationLabel: string;
  canRemove: boolean;
  confidence: BulletConfidence;
}

function resolveStatus(
  reviewState: ResumeReviewState | undefined,
  confidence: BulletConfidence | undefined,
): CoachItem['status'] {
  if (!reviewState) return 'strong';
  if (reviewState === 'supported' || reviewState === 'supported_rewrite') return 'strong';
  if (reviewState === 'code_red') return 'needs_attention';
  if (reviewState === 'strengthen' || reviewState === 'confirm_fit') return 'needs_attention';
  if (confidence === 'needs_validation' || confidence === 'partial') return 'needs_attention';
  return 'strong';
}

function findQueueItem(
  requirement: string | undefined,
  queueItems: RewriteQueueItem[] | undefined,
): RewriteQueueItem | undefined {
  if (!requirement || !queueItems?.length) return undefined;
  const normalized = requirement.trim().toLowerCase();
  return queueItems.find(item =>
    item.requirement?.trim().toLowerCase() === normalized
    || item.title.trim().toLowerCase() === normalized,
  );
}

export function useResumeCoachItems(
  resume: ResumeDraft | null,
  queueItems: RewriteQueueItem[] | undefined,
): {
  items: CoachItem[];
  flaggedItems: CoachItem[];
  flaggedCount: number;
  totalCount: number;
} {
  return useMemo(() => {
    if (!resume) return { items: [], flaggedItems: [], flaggedCount: 0, totalCount: 0 };

    const items: CoachItem[] = [];
    let order = 0;

    // 1. Executive Summary
    if (resume.executive_summary?.content) {
      const sectionType: SectionType = 'executive_summary';
      const reqs = resume.executive_summary.addresses_requirements ?? [];
      const queueItem = findQueueItem(reqs[0], queueItems);
      const reviewState: ResumeReviewState = resume.executive_summary.is_new ? 'strengthen' : 'supported';

      items.push({
        id: 'executive_summary:0',
        section: 'executive_summary',
        index: 0,
        sectionType,
        text: resume.executive_summary.content,
        status: resolveStatus(reviewState, undefined),
        reviewState,
        requirements: reqs,
        evidenceFound: resume.executive_summary.content,
        isAIEnhanced: resume.executive_summary.is_new,
        suggestedDraft: queueItem?.suggestedDraft,
        suggestionScore: queueItem?.suggestionScore,
        enhanceActions: getEnhanceActionsForSection(sectionType),
        defaultEnhanceAction: getDefaultEnhanceAction(sectionType),
        documentOrder: order++,
        sectionLabel: 'Executive Summary',
        locationLabel: 'Executive Summary',
        canRemove: false,
        confidence: 'strong',
      });
    }

    // 2. Core Competencies
    const competencies = resume.core_competencies ?? [];
    for (let i = 0; i < competencies.length; i++) {
      const comp = competencies[i];
      if (!comp?.trim()) continue;
      const sectionType: SectionType = 'core_competency';
      items.push({
        id: `core_competencies:${i}`,
        section: 'core_competencies',
        index: i,
        sectionType,
        text: comp,
        status: 'strong',
        reviewState: 'supported',
        requirements: [],
        evidenceFound: comp,
        enhanceActions: getEnhanceActionsForSection(sectionType),
        defaultEnhanceAction: getDefaultEnhanceAction(sectionType),
        documentOrder: order++,
        sectionLabel: 'Core Competencies',
        locationLabel: 'Core Competencies',
        canRemove: false,
        confidence: 'strong',
      });
    }

    // 3. Selected Accomplishments (was 2)
    const accomplishments = resume.selected_accomplishments ?? [];
    for (let i = 0; i < accomplishments.length; i++) {
      const bullet = accomplishments[i];
      const sectionType: SectionType = 'selected_accomplishment';
      const reqs = bullet.addresses_requirements ?? [];
      const queueItem = findQueueItem(reqs[0], queueItems);

      items.push({
        id: `selected_accomplishments:${i}`,
        section: 'selected_accomplishments',
        index: i,
        sectionType,
        text: bullet.content,
        status: resolveStatus(bullet.review_state, bullet.confidence),
        reviewState: bullet.review_state ?? 'supported',
        requirements: reqs,
        requirementSource: bullet.requirement_source,
        evidenceFound: bullet.evidence_found ?? '',
        workItemId: bullet.work_item_id,
        proofLevel: bullet.proof_level,
        nextBestAction: bullet.next_best_action,
        framingGuardrail: bullet.framing_guardrail,
        isAIEnhanced: bullet.is_new,
        suggestedDraft: queueItem?.suggestedDraft,
        suggestionScore: queueItem?.suggestionScore,
        enhanceActions: getEnhanceActionsForSection(sectionType),
        defaultEnhanceAction: getDefaultEnhanceAction(sectionType),
        documentOrder: order++,
        sectionLabel: 'Selected Accomplishments',
        locationLabel: 'Selected Accomplishments',
        canRemove: true,
        confidence: bullet.confidence ?? 'strong',
      });
    }

    // 4. Professional Experience
    const experience = resume.professional_experience ?? [];
    for (let expIdx = 0; expIdx < experience.length; expIdx++) {
      const exp = experience[expIdx];
      const companyLabel = `${exp.title} — ${exp.company}`;
      const bullets = exp.bullets ?? [];

      for (let bulletIdx = 0; bulletIdx < bullets.length; bulletIdx++) {
        const bullet = bullets[bulletIdx];
        const sectionType: SectionType = 'experience_bullet';
        const compositeIndex = expIdx * 100 + bulletIdx;
        const reqs = bullet.addresses_requirements ?? [];
        const queueItem = findQueueItem(reqs[0], queueItems);

        items.push({
          id: `professional_experience:${compositeIndex}`,
          section: 'professional_experience',
          index: compositeIndex,
          sectionType,
          text: bullet.text,
          status: resolveStatus(bullet.review_state, bullet.confidence),
          reviewState: bullet.review_state ?? 'supported',
          requirements: reqs,
          requirementSource: bullet.requirement_source,
          evidenceFound: bullet.evidence_found ?? '',
          workItemId: bullet.work_item_id,
          proofLevel: bullet.proof_level,
          nextBestAction: bullet.next_best_action,
          framingGuardrail: bullet.framing_guardrail,
          isAIEnhanced: bullet.is_new,
          suggestedDraft: queueItem?.suggestedDraft,
          suggestionScore: queueItem?.suggestionScore,
          enhanceActions: getEnhanceActionsForSection(sectionType),
          defaultEnhanceAction: getDefaultEnhanceAction(sectionType),
          documentOrder: order++,
          sectionLabel: 'Professional Experience',
          locationLabel: companyLabel,
          canRemove: true,
          confidence: bullet.confidence ?? 'strong',
        });
      }
    }

    // 5. Custom Sections
    const customSections = resume.custom_sections ?? [];
    for (const cs of customSections) {
      for (let lineIdx = 0; lineIdx < cs.lines.length; lineIdx++) {
        const line = cs.lines[lineIdx];
        if (!line?.trim()) continue;
        const sectionType: SectionType = 'custom_section_line';
        items.push({
          id: `custom_section:${cs.id}:${lineIdx}`,
          section: `custom_section:${cs.id}`,
          index: lineIdx,
          sectionType,
          text: line,
          status: 'strong',
          reviewState: 'supported',
          requirements: [],
          evidenceFound: line,
          enhanceActions: getEnhanceActionsForSection(sectionType),
          defaultEnhanceAction: getDefaultEnhanceAction(sectionType),
          documentOrder: order++,
          sectionLabel: cs.title,
          locationLabel: cs.title,
          canRemove: true,
          confidence: 'strong',
        });
      }
    }

    const flaggedItems = items.filter(i => i.status === 'needs_attention');

    return {
      items,
      flaggedItems,
      flaggedCount: flaggedItems.length,
      totalCount: items.length,
    };
  }, [resume, queueItems]);
}
