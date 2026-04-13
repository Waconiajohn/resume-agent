/**
 * V2StreamingDisplay — Output display for the v2 pipeline
 *
 * Two layout modes:
 *   1. Processing mode — minimal status card while the role-specific resume is being built
 *   2. Resume mode — full-width centered document with inline editing
 */

import React, { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { Loader2, AlertCircle, Undo2, Redo2, ChevronDown, ChevronUp, Download } from 'lucide-react';
import type { V2PipelineData, V2Stage, ResumeDraft, BulletConfidence, ClarificationMemoryEntry, FramingGuardrail, NextBestAction, ProofLevel, RequirementSource, ResumeReviewState } from '@/types/resume-v2';
import type { GapCoachingResponse, PreScores, GapCoachingCard as GapCoachingCardType } from '@/types/resume-v2';
import type { CoachingThreadSnapshot, FinalReviewChatContext, GapChatTargetInput, MasterPromotionItem, PostReviewPolishState } from '@/types/resume-v2';
import { useResumeCoachItems } from '@/hooks/useResumeCoachItems';
import type { CoachItem } from '@/hooks/useResumeCoachItems';
import { ResumeCoachPanel } from './panels/ResumeCoachPanel';
import { deriveSectionType } from '@/lib/section-enhance-config';
import type { EditAction, PendingEdit } from '@/hooks/useInlineEdit';
import { ResumeDocumentCard } from './cards/ResumeDocumentCard';
import { BulletCoachingPanel } from './cards/BulletCoachingPanel';
import type { LiveScores } from '@/hooks/useLiveScoring';
import { DiffView } from './DiffView';
import type { HiringManagerReviewResult, HiringManagerConcern } from '@/hooks/useHiringManagerReview';
import type { GapChatHook } from '@/hooks/useGapChat';
import type { FinalReviewChatHook } from '@/hooks/useFinalReviewChat';
import type { GapChatContext } from '@/types/resume-v2';
import type { FinalReviewTargetMatch } from './utils/final-review-target';
import { ReviewInboxCard } from './cards/ReviewInboxCard';
import { ResumeFinalReviewPanel, ResumeWorkspaceRail } from './ResumeWorkspaceRail';
import { ScoringReport } from './ScoringReport';
import { ResumeEditorLayout } from './ResumeEditorLayout';
import { PipelineProgressCard } from './cards/PipelineProgressCard';
import { ResumeReadyScreen } from './cards/ResumeReadyScreen';
import { ResumeSectionWorkflowPanel } from './workflow/ResumeSectionWorkflowPanel';
import { REVIEW_STATE_DISPLAY } from './utils/review-state-labels';
import { buildRewriteQueue } from '@/lib/rewrite-queue';
import { canonicalRequirementSignals } from '@/lib/resume-requirement-signals';
import { scrollToAndFocusTarget } from './useStrategyThread';
import { buildCustomSectionPresetRecommendations, buildResumeSectionPlan, getEnabledResumeSectionPlan, getResumeCustomSectionMap } from '@/lib/resume-section-plan';
import type { OptimisticResumeEditMetadata } from '@/lib/resume-edit-progress';
import type { ResumeCustomSectionPresetId } from '@/lib/resume-section-plan';
import type {
  ResumeSectionDraftResult,
  ResumeSectionDraftVariant,
  ResumeWorkflowSectionStepViewModel,
} from '@/lib/resume-section-workflow';
import type { SectionRefineActionId } from '@/lib/section-draft-refinement';
import { buildResumeSectionWorkflowViewModel } from '@/lib/resume-section-workflow';

interface V2StreamingDisplayProps {
  data: V2PipelineData;
  isComplete: boolean;
  isConnected: boolean;
  error: string | null;
  /** Called when the user clicks "Retry Pipeline" in the error banner */
  onRetryPipeline?: () => void;
  /** The editable resume (may differ from pipeline data after user edits) */
  editableResume: ResumeDraft | null;
  /** Inline editing state */
  pendingEdit: PendingEdit | null;
  isEditing: boolean;
  editError: string | null;
  undoCount: number;
  redoCount: number;
  onBulletEdit?: (section: string, index: number, newText: string, metadata?: OptimisticResumeEditMetadata) => void;
  onBulletRemove?: (section: string, index: number) => void;
  onRequestEdit: (selectedText: string, section: string, action: EditAction, customInstruction?: string, editContext?: import('@/hooks/useInlineEdit').EditContext) => void;
  onAcceptEdit: (editedText: string) => void;
  onRejectEdit: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onAddContext: (context: string) => void;
  isRerunning: boolean;
  liveScores: LiveScores | null;
  isScoring: boolean;
  gapCoachingCards: GapCoachingCardType[] | null;
  onRespondGapCoaching: (responses: GapCoachingResponse[]) => void;
  preScores: PreScores | null;
  onIntegrateKeyword?: (keyword: string) => void;
  previousResume?: ResumeDraft | null;
  onDismissChanges?: () => void;
  hiringManagerResult?: HiringManagerReviewResult | null;
  resolvedFinalReviewConcernIds?: string[];
  isFinalReviewStale?: boolean;
  isHiringManagerLoading?: boolean;
  hiringManagerError?: string | null;
  onRequestHiringManagerReview?: () => void;
  onApplyHiringManagerRecommendation?: (
    concern: HiringManagerConcern,
    languageOverride?: string,
    candidateInputUsed?: boolean,
  ) => void;
  gapChat?: GapChatHook | null;
  gapChatSnapshot?: CoachingThreadSnapshot | null;
  buildChatContext?: (target: string | GapChatTargetInput) => GapChatContext;
  finalReviewChat?: FinalReviewChatHook | null;
  finalReviewChatSnapshot?: CoachingThreadSnapshot | null;
  buildFinalReviewChatContext?: (concern: HiringManagerConcern) => FinalReviewChatContext | null;
  resolveFinalReviewTarget?: (concern: HiringManagerConcern) => FinalReviewTargetMatch | null;
  onPreviewFinalReviewTarget?: (concern: HiringManagerConcern) => void;
  postReviewPolish?: PostReviewPolishState;
  masterSaveMode?: 'session_only' | 'master_resume';
  onChangeMasterSaveMode?: (mode: 'session_only' | 'master_resume') => void;
  onSaveCurrentToMaster?: () => void;
  isSavingToMaster?: boolean;
  masterSaveStatus?: {
    tone: 'neutral' | 'success' | 'error';
    message: string;
  };
  promotableMasterItems?: MasterPromotionItem[];
  selectedMasterPromotionIds?: string[];
  onToggleMasterPromotionItem?: (itemId: string) => void;
  onSelectAllMasterPromotionItems?: () => void;
  onClearMasterPromotionItems?: () => void;
  /** Callback for AI-assist actions tied to resume coaching surfaces */
  onGapAssist?: (
    requirement: string,
    classification: string,
    action: 'strengthen' | 'add_metrics' | 'rewrite',
    currentDraft: string,
    evidence: string[],
    aiReasoning?: string,
    signal?: AbortSignal,
  ) => Promise<string | null>;
  /** Dev-only seed used by the visual harness to open a specific resume line */
  initialActiveBullet?: {
    section: string;
    index: number;
    requirements: string[];
  } | null;
  /** AI enhancement handler threaded down to BulletCoachingPanel */
  onBulletEnhance?: (
    action: string,
    bulletText: string,
    requirement: string,
    evidence?: string,
    context?: Partial<GapChatContext>,
  ) => Promise<import('@/hooks/useBulletEnhance').EnhanceResult | null>;
  onMoveSection?: (sectionId: string, direction: 'up' | 'down') => void;
  onToggleSection?: (sectionId: string, enabled: boolean) => void;
  onAddAISection?: () => {
    sectionId: string;
    title: string;
    lines: string[];
    resume: ResumeDraft;
  } | null;
  onAddCustomSection?: (
    title: string,
    lines: string[],
    presetId?: ResumeCustomSectionPresetId,
  ) => {
    sectionId: string;
    title: string;
    lines: string[];
    presetId?: ResumeCustomSectionPresetId;
    resume: ResumeDraft;
  } | null;
  onRemoveCustomSection?: (sectionId: string) => void;
  /** Job application URL — when present and pipeline is complete, shows the Apply to This Job button */
  jobUrl?: string;
  /** Access token for the link-resume API call in ExportBar */
  accessToken?: string | null;
  clarificationMemory?: ClarificationMemoryEntry[];
  sectionDrafts?: Record<string, {
    status: 'idle' | 'loading' | 'ready' | 'error';
    result: ResumeSectionDraftResult | null;
    error: string | null;
    isRefining?: boolean;
    refinementActionId?: SectionRefineActionId | null;
    refinementError?: string | null;
  }>;
  onGenerateSectionDraft?: (args: {
    step: ResumeWorkflowSectionStepViewModel;
    force?: boolean;
  }) => Promise<ResumeSectionDraftResult | null>;
  onRefineSectionDraft?: (
    step: ResumeWorkflowSectionStepViewModel,
    actionId: SectionRefineActionId,
    workingDraft: string,
  ) => Promise<void>;
  onApplySectionDraft?: (
    step: ResumeWorkflowSectionStepViewModel,
    variant: ResumeSectionDraftVariant,
  ) => void;
}

interface AttentionReviewItem {
  id: string;
  section: string;
  index: number;
  selector: string;
  text: string;
  locationLabel: string;
  statusLabel: string;
  statusClassName: string;
  priority: number;
  order: number;
  requirements: string[];
  reviewState: ResumeReviewState;
  requirementSource?: RequirementSource;
  evidenceFound: string;
  workItemId?: string;
  proofLevel?: ProofLevel;
  nextBestAction?: NextBestAction;
}

interface SectionCoachTarget {
  id: string;
  label: string;
  helperText: string;
  section: string;
  index: number;
  bulletText: string;
  requirements: string[];
  reviewState: ResumeReviewState;
  requirementSource?: RequirementSource;
  evidenceFound: string;
  sourceEvidence?: string;
  workItemId?: string;
  proofLevel?: ProofLevel;
  framingGuardrail?: FramingGuardrail;
  nextBestAction?: NextBestAction;
  canRemove: boolean;
}

interface CoachTarget {
  id: string;
  section: string;
  index: number;
  requirements: string[];
  bulletText: string;
  reviewState: ResumeReviewState;
  requirementSource?: RequirementSource;
  evidenceFound: string;
  sourceEvidence?: string;
  workItemId?: string;
  proofLevel?: ProofLevel;
  framingGuardrail?: FramingGuardrail;
  nextBestAction?: NextBestAction;
  canRemove: boolean;
  locationLabel: string;
  autoReuseClarificationId?: string;
}

function AnimatedCard({ children, index = 0 }: { children: ReactNode; index?: number }) {
  return (
    <div
      className="motion-safe:animate-[card-enter_500ms_ease-out_forwards] motion-safe:opacity-0"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {children}
    </div>
  );
}

function dedupePhraseList(items: string[] | null | undefined): string[] {
  if (!items?.length) return [];
  const seen = new Set<string>();
  return items.filter((item) => {
    const normalized = item.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function chatContextLabelForSection(section: string): string {
  switch (section) {
    case 'executive_summary':
      return 'Executive summary';
    case 'core_competencies':
      return 'Core competencies';
    case 'selected_accomplishments':
      return 'Selected accomplishments';
    case 'professional_experience':
      return 'Professional experience';
    default:
      return section.startsWith('custom_section:') ? 'Custom section' : 'Resume line';
  }
}

function getAttentionStatusMeta(
  reviewState: ResumeReviewState | undefined,
  confidence: BulletConfidence,
  requirementSource?: RequirementSource,
): { label: string; className: string; priority: number } {
  const resolvedReviewState = reviewState
    ?? (confidence === 'needs_validation' && requirementSource === 'benchmark'
      ? 'confirm_fit'
      : confidence === 'needs_validation'
        ? 'code_red'
        : confidence === 'partial'
          ? 'strengthen'
          : 'supported');

  if (resolvedReviewState === 'code_red') {
    return {
      label: REVIEW_STATE_DISPLAY.code_red.label,
      className: 'resume-attention-status resume-attention-status--code-red',
      priority: 0,
    };
  }

  if (resolvedReviewState === 'confirm_fit') {
    return {
      label: REVIEW_STATE_DISPLAY.confirm_fit.label,
      className: 'resume-attention-status resume-attention-status--benchmark',
      priority: 1,
    };
  }

  if (resolvedReviewState === 'strengthen') {
    return {
      label: REVIEW_STATE_DISPLAY.strengthen.label,
      className: 'resume-attention-status resume-attention-status--partial',
      priority: 2,
    };
  }

  return {
    label: 'Review',
    className: 'resume-attention-status resume-attention-status--neutral',
    priority: 3,
  };
}

function resolveCoachReviewState(
  reviewState: ResumeReviewState | undefined,
  confidence: BulletConfidence | undefined,
  requirementSource: RequirementSource | undefined,
  fallback: ResumeReviewState = 'strengthen',
): ResumeReviewState {
  if (reviewState) return reviewState;
  if (confidence === 'needs_validation' && requirementSource === 'benchmark') return 'confirm_fit';
  if (confidence === 'needs_validation') return 'code_red';
  if (confidence === 'partial') return 'strengthen';
  if (confidence === 'strong') return 'supported';
  return fallback;
}

function buildAttentionReviewItems(
  resume: ResumeDraft,
  baselineResume?: ResumeDraft | null,
): AttentionReviewItem[] {
  const items: AttentionReviewItem[] = [];
  let order = 0;

  resume.selected_accomplishments.forEach((bullet, index) => {
    const reviewState = bullet.review_state
      ?? (bullet.confidence === 'needs_validation' && bullet.requirement_source === 'benchmark'
        ? 'confirm_fit'
        : bullet.confidence === 'needs_validation'
          ? 'code_red'
          : bullet.confidence === 'partial'
            ? 'strengthen'
            : 'supported');
    if (reviewState === 'supported' || reviewState === 'supported_rewrite') return;
    const baselineText = baselineResume?.selected_accomplishments[index]?.content;
    if (baselineText && baselineText !== bullet.content) return;
    const status = getAttentionStatusMeta(reviewState, bullet.confidence, bullet.requirement_source);
    items.push({
      id: `selected_accomplishments-${index}`,
      section: 'selected_accomplishments',
      index,
      selector: `[data-bullet-id="selected_accomplishments-${index}"]`,
      text: bullet.content,
      locationLabel: 'Selected Accomplishments',
      statusLabel: status.label,
      statusClassName: status.className,
      priority: status.priority,
      order: order++,
      requirements: canonicalRequirementSignals(
        bullet.primary_target_requirement,
        bullet.addresses_requirements,
      ),
      reviewState,
      requirementSource: bullet.requirement_source,
      evidenceFound: bullet.evidence_found ?? '',
      workItemId: bullet.work_item_id,
      proofLevel: bullet.proof_level,
      nextBestAction: bullet.next_best_action,
    });
  });

  resume.professional_experience.forEach((experience, experienceIndex) => {
    const bullets = Array.isArray(experience.bullets) ? experience.bullets : [];
    bullets.forEach((bullet, bulletOffset) => {
      const reviewState = bullet.review_state
        ?? (bullet.confidence === 'needs_validation' && bullet.requirement_source === 'benchmark'
          ? 'confirm_fit'
          : bullet.confidence === 'needs_validation'
            ? 'code_red'
            : bullet.confidence === 'partial'
              ? 'strengthen'
              : 'supported');
      if (reviewState === 'supported' || reviewState === 'supported_rewrite') return;
      const index = experienceIndex * 100 + bulletOffset;
      const baselineText = baselineResume?.professional_experience[experienceIndex]?.bullets[bulletOffset]?.text;
      if (baselineText && baselineText !== bullet.text) return;
      const status = getAttentionStatusMeta(reviewState, bullet.confidence, bullet.requirement_source);
      items.push({
        id: `professional_experience-${index}`,
        section: 'professional_experience',
        index,
        selector: `[data-bullet-id="professional_experience-${index}"]`,
        text: bullet.text,
        locationLabel: `${experience.title} · ${experience.company}`,
        statusLabel: status.label,
        statusClassName: status.className,
        priority: status.priority,
        order: order++,
        requirements: canonicalRequirementSignals(
          bullet.primary_target_requirement,
          bullet.addresses_requirements,
        ),
        reviewState,
        requirementSource: bullet.requirement_source,
        evidenceFound: bullet.evidence_found ?? '',
        workItemId: bullet.work_item_id,
        proofLevel: bullet.proof_level,
        nextBestAction: bullet.next_best_action,
      });
    });
  });

  return items.sort((a, b) => a.priority - b.priority || a.order - b.order);
}

function normalizeCueKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function overlapScore(left: string, right: string): number {
  const leftTokens = new Set(normalizeCueKey(left).split(' ').filter(Boolean));
  const rightTokens = new Set(normalizeCueKey(right).split(' ').filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let overlapCount = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) overlapCount += 1;
  });

  return overlapCount / Math.max(leftTokens.size, rightTokens.size);
}

function isAIRequirement(value: string): boolean {
  return /\b(ai|artificial intelligence|genai|llm|machine learning|automation|intelligent automation)\b/i.test(value);
}

function importancePriority(importance: 'must_have' | 'important' | 'nice_to_have'): number {
  if (importance === 'must_have') return 0;
  if (importance === 'important') return 1;
  return 2;
}

function formatRequirementFocus(requirements: string[]): string {
  if (requirements.length === 0) return '';
  if (requirements.length === 1) return requirements[0];
  if (requirements.length === 2) return `${requirements[0]} and ${requirements[1]}`;
  return `${requirements[0]}, ${requirements[1]}, and ${requirements[2]}`;
}

function reviewStateNeedsAttention(value: ResumeReviewState | undefined): boolean {
  return value === 'code_red' || value === 'confirm_fit' || value === 'strengthen';
}

function describeNextBestAction(action: NextBestAction | undefined, lineLabel: string): string {
  switch (action) {
    case 'answer':
      return `Answer one concrete question before this ${lineLabel} is safe to keep.`;
    case 'confirm':
      return `Make sure this ${lineLabel} is the most honest fit before you keep it.`;
    case 'quantify':
      return `Add scope, business impact, or one defensible metric to this ${lineLabel}.`;
    case 'tighten':
      return `Sharpen this ${lineLabel} so the role fit is obvious right away.`;
    case 'accept':
      return `The structure is right — make the wording stronger only if it improves clarity.`;
    case 'remove':
      return `Remove this ${lineLabel} if it does not hold up truthfully.`;
    default:
      return `Polish this ${lineLabel} so it reads as intentional and role-relevant.`;
  }
}

function describeRecommendationPlain(item: AttentionReviewItem): string {
  switch (item.nextBestAction) {
    case 'answer':
      return 'Open this line, answer one quick question, and then use the suggested rewrite.';
    case 'quantify':
      return 'Open this line and add one defensible number or scope marker.';
    case 'confirm':
      return 'Open this line and use the safer wording unless the stronger claim is fully true.';
    case 'tighten':
      return 'Open this line and use the stronger suggested version.';
    case 'accept':
      return 'Open this line, confirm it reads honestly, and move on if it does.';
    case 'remove':
      return 'Open this line and remove it if it does not hold up.';
    default:
      return 'Open this line and let the coach suggest the cleanest truthful version.';
  }
}

function buildSectionCoachTargets(
  resume: ResumeDraft,
  workItems: NonNullable<V2PipelineData['requirementWorkItems']>,
): SectionCoachTarget[] {
  const enabledPlan = getEnabledResumeSectionPlan(resume);
  const enabledSectionIds = new Set(enabledPlan.map((item) => item.id));
  const planById = new Map(enabledPlan.map((item) => [item.id, item]));
  const rankWorkItems = (
    sectionId: string,
    sectionLabel: string,
    sectionText: string,
  ) => {
    const sectionCorpus = `${sectionLabel} ${sectionText}`.trim();

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

        let score = Math.max(
          overlapScore(sectionCorpus, item.requirement),
          overlapScore(sectionCorpus, evidenceCorpus),
        );

        if (sectionId === 'executive_summary') {
          score += item.source === 'job_description' ? 0.2 : 0.05;
          score += item.importance === 'must_have' ? 0.18 : item.importance === 'important' ? 0.08 : 0;
        }

        if (sectionId === 'core_competencies') {
          score += item.source === 'job_description' ? 0.18 : 0.04;
          score += item.importance === 'must_have' ? 0.1 : 0;
        }

        if (sectionId === 'ai_highlights' && isAIRequirement(`${item.requirement} ${item.source_evidence ?? ''}`)) {
          score += 0.4;
        }

        if (sectionId !== 'executive_summary' && sectionId !== 'core_competencies' && isAIRequirement(sectionLabel) && isAIRequirement(item.requirement)) {
          score += 0.25;
        }

        return { item, score };
      })
      .filter(({ score }) => score > 0.16)
      .sort((left, right) => (
        right.score - left.score
        || importancePriority(left.item.importance) - importancePriority(right.item.importance)
        || left.item.requirement.localeCompare(right.item.requirement)
      ));

    if (ranked.length > 0) return ranked;

    if (sectionId === 'executive_summary') {
      return [...workItems]
        .sort((left, right) => (
          importancePriority(left.importance) - importancePriority(right.importance)
          || Number(left.source !== 'job_description') - Number(right.source !== 'job_description')
          || left.requirement.localeCompare(right.requirement)
        ))
        .slice(0, 3)
        .map((item) => ({ item, score: 0 }));
    }

    if (sectionId === 'core_competencies') {
      return [...workItems]
        .filter((item) => item.source === 'job_description')
        .sort((left, right) => (
          importancePriority(left.importance) - importancePriority(right.importance)
          || left.requirement.localeCompare(right.requirement)
        ))
        .slice(0, 3)
        .map((item) => ({ item, score: 0 }));
    }

    if (sectionId === 'ai_highlights') {
      return [...workItems]
        .filter((item) => isAIRequirement(`${item.requirement} ${item.source_evidence ?? ''}`))
        .sort((left, right) => (
          importancePriority(left.importance) - importancePriority(right.importance)
          || left.requirement.localeCompare(right.requirement)
        ))
        .slice(0, 2)
        .map((item) => ({ item, score: 0 }));
    }

    return [];
  };

  const derivePrimaryGuidance = (
    rankedItems: Array<{ item: NonNullable<V2PipelineData['requirementWorkItems']>[number]; score: number }>,
    fallbackText: string,
    lineLabel: string,
  ) => {
    const primaryRanked = rankedItems.find(({ item }) => reviewStateNeedsAttention(item.current_claim_strength)) ?? rankedItems[0];
    const primaryItem = primaryRanked?.item;
    return {
      primaryItem,
      reviewState: primaryItem?.current_claim_strength ?? 'strengthen' as ResumeReviewState,
      requirementSource: primaryItem?.source,
      evidenceFound: primaryItem?.best_evidence_excerpt
        ?? primaryItem?.target_evidence
        ?? primaryItem?.candidate_evidence[0]?.text
        ?? fallbackText,
      sourceEvidence: primaryItem?.source_evidence,
      proofLevel: primaryItem?.proof_level,
      framingGuardrail: primaryItem?.framing_guardrail,
      nextBestAction: primaryItem?.next_best_action,
      nextMoveText: describeNextBestAction(primaryItem?.next_best_action, lineLabel),
    };
  };

  const targets: SectionCoachTarget[] = [];
  const planOrderFor = (sectionId: string) => planById.get(sectionId)?.order ?? Number.MAX_SAFE_INTEGER;

  const summaryText = resume.executive_summary.content.trim();
  if (summaryText) {
    const rankedItems = rankWorkItems('executive_summary', 'Executive Summary', summaryText);
    const primaryGuidance = derivePrimaryGuidance(rankedItems, summaryText, 'summary');
    const relatedRequirements = rankedItems.slice(0, 3).map(({ item }) => item.requirement);
    const sectionPlanItem = planById.get('executive_summary');
    const summaryRationale = sectionPlanItem?.rationale ?? 'Lead with identity in the clearest version of the why-me story.';
    targets.push({
      id: 'executive_summary',
      label: 'Executive Summary',
      helperText: relatedRequirements.length > 0
        ? `${summaryRationale} Then make the opening clearly support ${formatRequirementFocus(relatedRequirements)} without losing the overall why-me story. ${primaryGuidance.nextMoveText}`
        : `${summaryRationale} ${primaryGuidance.nextMoveText}`,
      section: 'executive_summary',
      index: 0,
      bulletText: summaryText,
      requirements: relatedRequirements.length > 0
        ? relatedRequirements
        : (resume.executive_summary.addresses_requirements ?? []),
      reviewState: primaryGuidance.reviewState,
      requirementSource: primaryGuidance.requirementSource,
      evidenceFound: primaryGuidance.evidenceFound,
      sourceEvidence: primaryGuidance.sourceEvidence,
      workItemId: primaryGuidance.primaryItem?.id,
      proofLevel: primaryGuidance.proofLevel,
      framingGuardrail: primaryGuidance.framingGuardrail,
      nextBestAction: primaryGuidance.nextBestAction,
      canRemove: false,
    });
  }

  const firstCompetency = resume.core_competencies.find((item) => item.trim().length > 0);
  if (firstCompetency) {
    const rankedItems = rankWorkItems('core_competencies', 'Core Competencies', resume.core_competencies.join(' '));
    const primaryGuidance = derivePrimaryGuidance(rankedItems, firstCompetency, 'competency');
    const relatedRequirements = rankedItems.slice(0, 3).map(({ item }) => item.requirement);
    const sectionPlanItem = planById.get('core_competencies');
    targets.push({
      id: 'core_competencies',
      label: 'Core Competencies',
      helperText: relatedRequirements.length > 0
        ? `${sectionPlanItem?.rationale ?? 'Keep ATS language visible early.'} Bring forward ${relatedRequirements.slice(0, 2).join(' and ')}. ${primaryGuidance.nextMoveText}`
        : `${sectionPlanItem?.rationale ?? 'Refine the keywords recruiters see first.'} ${primaryGuidance.nextMoveText}`,
      section: 'core_competencies',
      index: resume.core_competencies.findIndex((item) => item === firstCompetency),
      bulletText: firstCompetency,
      requirements: relatedRequirements,
      reviewState: primaryGuidance.reviewState,
      requirementSource: primaryGuidance.requirementSource,
      evidenceFound: primaryGuidance.evidenceFound,
      sourceEvidence: primaryGuidance.sourceEvidence,
      workItemId: primaryGuidance.primaryItem?.id,
      proofLevel: primaryGuidance.proofLevel,
      framingGuardrail: primaryGuidance.framingGuardrail,
      nextBestAction: primaryGuidance.nextBestAction,
      canRemove: true,
    });
  }

  const firstAccomplishmentIndex = resume.selected_accomplishments.findIndex((item) => item.content.trim().length > 0);
  if (firstAccomplishmentIndex >= 0) {
    const accomplishmentCorpus = resume.selected_accomplishments
      .map((item) => item.content)
      .filter((value) => value.trim().length > 0)
      .join(' ');
    const rankedItems = rankWorkItems('selected_accomplishments', 'Selected Accomplishments', accomplishmentCorpus);
    const accomplishmentCandidate = resume.selected_accomplishments.find((item) => {
      const resolved = resolveCoachReviewState(item.review_state, item.confidence, item.requirement_source, 'supported');
      return reviewStateNeedsAttention(resolved);
    }) ?? resume.selected_accomplishments[firstAccomplishmentIndex];
    const accomplishmentIndex = resume.selected_accomplishments.findIndex((item) => item === accomplishmentCandidate);
    const primaryGuidance = derivePrimaryGuidance(rankedItems, accomplishmentCandidate.content, 'accomplishment');
    const relatedRequirements = rankedItems.slice(0, 3).map(({ item }) => item.requirement);
    const accomplishmentRequirements = canonicalRequirementSignals(
      accomplishmentCandidate.primary_target_requirement,
      accomplishmentCandidate.addresses_requirements,
    );
    const sectionPlanItem = planById.get('selected_accomplishments');
    targets.push({
      id: 'selected_accomplishments',
      label: 'Selected Accomplishments',
      helperText: relatedRequirements.length > 0
        ? `${sectionPlanItem?.rationale ?? 'Use the strongest proof points above the fold.'} Make this section clearly prove ${formatRequirementFocus(relatedRequirements)} before the reader reaches the timeline. ${primaryGuidance.nextMoveText}`
        : `${sectionPlanItem?.rationale ?? 'Use the strongest proof points above the fold.'} ${primaryGuidance.nextMoveText}`,
      section: 'selected_accomplishments',
      index: accomplishmentIndex,
      bulletText: accomplishmentCandidate.content,
      requirements: relatedRequirements.length > 0 ? relatedRequirements : accomplishmentRequirements,
      reviewState: resolveCoachReviewState(
        accomplishmentCandidate.review_state,
        accomplishmentCandidate.confidence,
        accomplishmentCandidate.requirement_source,
        primaryGuidance.reviewState,
      ),
      requirementSource: accomplishmentCandidate.requirement_source ?? primaryGuidance.requirementSource,
      evidenceFound: accomplishmentCandidate.evidence_found ?? primaryGuidance.evidenceFound,
      sourceEvidence: primaryGuidance.sourceEvidence,
      workItemId: accomplishmentCandidate.work_item_id ?? primaryGuidance.primaryItem?.id,
      proofLevel: accomplishmentCandidate.proof_level ?? primaryGuidance.proofLevel,
      framingGuardrail: primaryGuidance.framingGuardrail,
      nextBestAction: accomplishmentCandidate.next_best_action ?? primaryGuidance.nextBestAction,
      canRemove: true,
    });
  }

  const experienceBulletCandidates = resume.professional_experience.flatMap((experience, experienceIndex) => (
    (Array.isArray(experience.bullets) ? experience.bullets : []).map((bullet, bulletOffset) => ({
      experience,
      bullet,
      index: experienceIndex * 100 + bulletOffset,
    }))
  ));
  const firstExperienceBullet = experienceBulletCandidates.find((item) => item.bullet.text.trim().length > 0);
  if (firstExperienceBullet) {
    const experienceCorpus = resume.professional_experience
      .flatMap((experience) => [
        experience.scope_statement,
        ...(Array.isArray(experience.bullets) ? experience.bullets.map((bullet) => bullet.text) : []),
      ])
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' ');
    const rankedItems = rankWorkItems('professional_experience', 'Professional Experience', experienceCorpus);
    const experienceCandidate = experienceBulletCandidates.find(({ bullet }) => {
      const resolved = resolveCoachReviewState(bullet.review_state, bullet.confidence, bullet.requirement_source, 'supported');
      return reviewStateNeedsAttention(resolved);
    }) ?? firstExperienceBullet;
    const primaryGuidance = derivePrimaryGuidance(rankedItems, experienceCandidate.bullet.text, 'experience bullet');
    const relatedRequirements = rankedItems.slice(0, 3).map(({ item }) => item.requirement);
    const experienceRequirements = canonicalRequirementSignals(
      experienceCandidate.bullet.primary_target_requirement,
      experienceCandidate.bullet.addresses_requirements,
    );
    const sectionPlanItem = planById.get('professional_experience');
    targets.push({
      id: 'professional_experience',
      label: 'Professional Experience',
      helperText: relatedRequirements.length > 0
        ? `${sectionPlanItem?.rationale ?? 'Let the chronology prove your strongest business wins.'} Use the recent roles to clearly prove ${formatRequirementFocus(relatedRequirements)} with concrete scope, ownership, and results. ${primaryGuidance.nextMoveText}`
        : `${sectionPlanItem?.rationale ?? 'Let the chronology prove your strongest business wins.'} ${primaryGuidance.nextMoveText}`,
      section: 'professional_experience',
      index: experienceCandidate.index,
      bulletText: experienceCandidate.bullet.text,
      requirements: relatedRequirements.length > 0 ? relatedRequirements : experienceRequirements,
      reviewState: resolveCoachReviewState(
        experienceCandidate.bullet.review_state,
        experienceCandidate.bullet.confidence,
        experienceCandidate.bullet.requirement_source,
        primaryGuidance.reviewState,
      ),
      requirementSource: experienceCandidate.bullet.requirement_source ?? primaryGuidance.requirementSource,
      evidenceFound: experienceCandidate.bullet.evidence_found ?? primaryGuidance.evidenceFound,
      sourceEvidence: primaryGuidance.sourceEvidence,
      workItemId: experienceCandidate.bullet.work_item_id ?? primaryGuidance.primaryItem?.id,
      proofLevel: experienceCandidate.bullet.proof_level ?? primaryGuidance.proofLevel,
      framingGuardrail: primaryGuidance.framingGuardrail,
      nextBestAction: experienceCandidate.bullet.next_best_action ?? primaryGuidance.nextBestAction,
      canRemove: true,
    });
  }

  const customSections = getResumeCustomSectionMap(resume);
  const customTargets: SectionCoachTarget[] = [];
  for (const [sectionId, section] of customSections.entries()) {
    if (!enabledSectionIds.has(sectionId)) continue;
    const summary = section.summary?.trim();
    const firstLine = section.lines.find((line) => line.trim().length > 0);
    const bulletText = summary ?? firstLine;
    if (!bulletText) continue;
    const rankedItems = rankWorkItems(sectionId, section.title, `${summary ?? ''} ${section.lines.join(' ')}`);
    const primaryGuidance = derivePrimaryGuidance(rankedItems, bulletText, 'section');
    const relatedRequirements = rankedItems.slice(0, 2).map(({ item }) => item.requirement);
    customTargets.push({
      id: sectionId,
      label: section.title,
      helperText: sectionId === 'ai_highlights'
        ? relatedRequirements.length > 0
          ? `${planById.get(sectionId)?.rationale ?? 'Sharpen the AI story.'} Make it clearly support ${formatRequirementFocus(relatedRequirements)}. ${primaryGuidance.nextMoveText}`
          : `${planById.get(sectionId)?.rationale ?? 'Sharpen the AI story for roles that value transformation and automation.'} ${primaryGuidance.nextMoveText}`
        : relatedRequirements.length > 0
          ? `${planById.get(sectionId)?.rationale ?? 'Use this section to reinforce the role story.'} Make it reinforce ${formatRequirementFocus(relatedRequirements)}. ${primaryGuidance.nextMoveText}`
          : `${planById.get(sectionId)?.rationale ?? 'Polish this section so it strengthens the overall story.'} ${primaryGuidance.nextMoveText}`,
      section: `custom_section:${sectionId}`,
      index: summary ? -1 : section.lines.findIndex((line) => line === firstLine),
      bulletText,
      requirements: relatedRequirements,
      reviewState: primaryGuidance.reviewState,
      requirementSource: primaryGuidance.requirementSource,
      evidenceFound: primaryGuidance.evidenceFound,
      sourceEvidence: primaryGuidance.sourceEvidence,
      workItemId: primaryGuidance.primaryItem?.id,
      proofLevel: primaryGuidance.proofLevel,
      framingGuardrail: primaryGuidance.framingGuardrail,
      nextBestAction: primaryGuidance.nextBestAction,
      canRemove: !summary,
    });
  }

  customTargets.forEach((target) => targets.push(target));

  return targets
    .filter((target) => enabledSectionIds.has(target.id))
    .sort((left, right) => (
      planOrderFor(left.id) - planOrderFor(right.id)
      || left.label.localeCompare(right.label)
    ));
}

function clarificationMatchesAttentionItem(
  entry: ClarificationMemoryEntry,
  item: AttentionReviewItem,
): boolean {
  const requirementHit = item.requirements.some((requirement) => (
    overlapScore(requirement, entry.topic) >= 0.35
      || overlapScore(requirement, entry.userInput) >= 0.24
  ));
  const evidenceHit = item.evidenceFound
    ? overlapScore(item.evidenceFound, entry.userInput) >= 0.24
    : false;
  const lineHit = overlapScore(item.text, entry.userInput) >= 0.24;
  return requirementHit || evidenceHit || lineHit;
}

function buildResumeLineSelector(section: string, index: number): string {
  return `[data-resume-line="${section}:${index}"]`;
}

export function V2StreamingDisplay({
  data, isComplete, isConnected, error,
  editableResume, pendingEdit, isEditing, editError, undoCount, redoCount,
  onBulletEdit, onBulletRemove,
  onRequestEdit: _onRequestEdit, onAcceptEdit, onRejectEdit, onUndo, onRedo,
  onAddContext: _onAddContext, isRerunning,
  liveScores: _liveScores, isScoring: _isScoring,
  gapCoachingCards, onRespondGapCoaching: _onRespondGapCoaching, preScores: _preScores, onIntegrateKeyword: _onIntegrateKeyword,
  previousResume: _previousResume, onDismissChanges: _onDismissChanges,
  hiringManagerResult, resolvedFinalReviewConcernIds = [], isFinalReviewStale = false,
  isHiringManagerLoading, hiringManagerError,
  onRequestHiringManagerReview, onApplyHiringManagerRecommendation,
  gapChat, gapChatSnapshot, buildChatContext,
  finalReviewChat, finalReviewChatSnapshot, buildFinalReviewChatContext, resolveFinalReviewTarget, onPreviewFinalReviewTarget, postReviewPolish,
  masterSaveMode: _masterSaveMode = 'session_only',
  onChangeMasterSaveMode: _onChangeMasterSaveMode,
  onSaveCurrentToMaster: _onSaveCurrentToMaster,
  isSavingToMaster: _isSavingToMaster = false,
  masterSaveStatus: _masterSaveStatus,
  promotableMasterItems: _promotableMasterItems = [],
  selectedMasterPromotionIds: _selectedMasterPromotionIds = [],
  onToggleMasterPromotionItem: _onToggleMasterPromotionItem,
  onSelectAllMasterPromotionItems: _onSelectAllMasterPromotionItems,
  onClearMasterPromotionItems: _onClearMasterPromotionItems,
  onGapAssist: _onGapAssist,
  initialActiveBullet = null,
  onBulletEnhance,
  onMoveSection,
  onToggleSection,
  onAddAISection,
  onAddCustomSection,
  onRemoveCustomSection,
  jobUrl,
  accessToken,
  clarificationMemory = [],
  sectionDrafts = {},
  onGenerateSectionDraft,
  onRefineSectionDraft,
  onApplySectionDraft,
  onRetryPipeline,
}: V2StreamingDisplayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const coachingPanelRef = useRef<HTMLDivElement | null>(null);
  const structurePlannerRef = useRef<HTMLDivElement | null>(null);

  // Active bullet for inline editing
  const [activeBullet, setActiveBullet] = useState<CoachTarget | null>(initialActiveBullet ? {
    id: `initial:${initialActiveBullet.section}:${initialActiveBullet.index}`,
    ...initialActiveBullet,
    bulletText: '',
    reviewState: 'supported' as ResumeReviewState,
    evidenceFound: '',
    canRemove: true,
    locationLabel: chatContextLabelForSection(initialActiveBullet.section),
  } : null);
  const [initialFlaggedCount, setInitialFlaggedCount] = useState(0);
  const [visitedItems, setVisitedItems] = useState<Set<string>>(new Set());

  const markVisited = useCallback((section: string, index: number) => {
    setVisitedItems(prev => new Set(prev).add(`${section}:${index}`));
  }, []);
  const [showStructurePlanner, setShowStructurePlanner] = useState(false);
  const [hasCompletedStructureStep, setHasCompletedStructureStep] = useState(false);
  const [sectionJourneyIndex, setSectionJourneyIndex] = useState(0);
  // True only after the user explicitly confirms structure and enters the section-by-section workflow.
  // When false, currentWorkflowStep is always null so Coach mode is the default entry state.
  const [hasStartedSectionWorkflow, setHasStartedSectionWorkflow] = useState(false);

  useEffect(() => {
    setActiveBullet(initialActiveBullet ? {
      id: `initial:${initialActiveBullet.section}:${initialActiveBullet.index}`,
      ...initialActiveBullet,
      bulletText: '',
      reviewState: 'supported' as ResumeReviewState,
      evidenceFound: '',
      canRemove: true,
      locationLabel: chatContextLabelForSection(initialActiveBullet.section),
    } : null);
  }, [initialActiveBullet]);

  const displayResume = editableResume ?? data.assembly?.final_resume ?? data.resumeDraft;
  const hasResume = displayResume !== null && displayResume !== undefined;
  const baselineResume = data.assembly?.final_resume ?? data.resumeDraft ?? null;
  const attentionItems = useMemo(() => (
    displayResume ? buildAttentionReviewItems(displayResume, baselineResume) : []
  ), [baselineResume, displayResume]);
  const rememberedAttentionItemIds = useMemo(() => new Set(
    clarificationMemory.flatMap((entry) => (
      attentionItems
        .filter((item) => clarificationMatchesAttentionItem(entry, item))
        .map((item) => item.id)
    ))
  ), [attentionItems, clarificationMemory]);
  const sectionCoachTargets = useMemo(() => (
    displayResume
      ? buildSectionCoachTargets(
          displayResume,
          data.requirementWorkItems ?? data.gapAnalysis?.requirement_work_items ?? [],
        )
      : []
  ), [data.gapAnalysis?.requirement_work_items, data.requirementWorkItems, displayResume]);
  useEffect(() => {
    if (!activeBullet || activeBullet.bulletText.trim().length > 0) return;

    const attentionMatch = attentionItems.find((item) => (
      item.section === activeBullet.section && item.index === activeBullet.index
    ));
    if (attentionMatch) {
      setActiveBullet((prev) => {
        if (!prev || prev.section !== attentionMatch.section || prev.index !== attentionMatch.index || prev.bulletText.trim().length > 0) {
          return prev;
        }
        return {
          ...prev,
          requirements: prev.requirements.length > 0 ? prev.requirements : attentionMatch.requirements,
          bulletText: attentionMatch.text,
          reviewState: attentionMatch.reviewState,
          requirementSource: attentionMatch.requirementSource,
          evidenceFound: attentionMatch.evidenceFound,
          workItemId: attentionMatch.workItemId,
          proofLevel: attentionMatch.proofLevel,
          nextBestAction: attentionMatch.nextBestAction,
        };
      });
      return;
    }

    const sectionMatch = sectionCoachTargets.find((target) => (
      target.section === activeBullet.section && target.index === activeBullet.index
    ));
    if (!sectionMatch) return;

    setActiveBullet((prev) => {
      if (!prev || prev.section !== sectionMatch.section || prev.index !== sectionMatch.index || prev.bulletText.trim().length > 0) {
        return prev;
      }
      return {
        ...prev,
        requirements: prev.requirements.length > 0 ? prev.requirements : sectionMatch.requirements,
        bulletText: sectionMatch.bulletText,
        reviewState: sectionMatch.reviewState,
        requirementSource: sectionMatch.requirementSource,
        evidenceFound: sectionMatch.evidenceFound,
        sourceEvidence: sectionMatch.sourceEvidence,
        workItemId: sectionMatch.workItemId,
        proofLevel: sectionMatch.proofLevel,
        framingGuardrail: sectionMatch.framingGuardrail,
        nextBestAction: sectionMatch.nextBestAction,
        canRemove: sectionMatch.canRemove,
      };
    });
  }, [activeBullet, attentionItems, sectionCoachTargets]);
  const fullSectionPlan = useMemo(() => (
    displayResume ? buildResumeSectionPlan(displayResume) : []
  ), [displayResume]);
  const sectionWorkflow = useMemo(() => (
    displayResume
      ? buildResumeSectionWorkflowViewModel({
          resume: displayResume,
          requirementWorkItems: data.requirementWorkItems ?? data.gapAnalysis?.requirement_work_items ?? [],
          candidateIntelligence: data.candidateIntelligence,
        })
      : { sections: [], steps: [] }
  ), [data.candidateIntelligence, data.gapAnalysis?.requirement_work_items, data.requirementWorkItems, displayResume]);
  const hiddenRecommendedSections = useMemo(() => (
    fullSectionPlan.filter((item) => item.recommended_for_job && !item.enabled)
  ), [fullSectionPlan]);
  const missingStructureRecommendations = useMemo(() => (
    displayResume
      ? buildCustomSectionPresetRecommendations(
          data.candidateIntelligence,
          data.requirementWorkItems ?? data.gapAnalysis?.requirement_work_items ?? [],
          fullSectionPlan.map((item) => item.id),
        )
      : []
  ), [
    data.candidateIntelligence,
    data.gapAnalysis?.requirement_work_items,
    data.requirementWorkItems,
    displayResume,
    fullSectionPlan,
  ]);
  const canShowStructurePlanner = Boolean(
    displayResume && onMoveSection && onToggleSection && onAddAISection && onAddCustomSection && onRemoveCustomSection && !activeBullet,
  );
  const _needsStructureStep = canShowStructurePlanner && !hasCompletedStructureStep;
  const workflowNeedsStructureStep = canShowStructurePlanner && !hasCompletedStructureStep;
  const currentWorkflowStep = useMemo(() => {
    if (sectionWorkflow.steps.length === 0) return null;
    if (sectionJourneyIndex < 0 || sectionJourneyIndex >= sectionWorkflow.steps.length) return null;
    return sectionWorkflow.steps[sectionJourneyIndex];
  }, [sectionJourneyIndex, sectionWorkflow.steps]);
  // True only when the user has explicitly entered the section-by-section workflow.
  // currentWorkflowStep may be non-null (valid index) before this is true — we rely on
  // isWorkflowActive to gate whether the workflow panel is shown.
  const isWorkflowActive = hasStartedSectionWorkflow && currentWorkflowStep !== null;
  // Bullet click handler for cross-referencing
  const handleBulletClick = useCallback((
    bulletText: string,
    section: string,
    bulletIndex: number,
    requirements: string[],
    reviewState: ResumeReviewState,
    requirementSource: RequirementSource | undefined,
    evidenceFound: string,
    workItemId?: string,
    proofLevel?: ProofLevel,
    nextBestAction?: NextBestAction,
    canRemove?: boolean,
  ) => {
    setActiveBullet((prev) => {
      if (prev?.section === section && prev?.index === bulletIndex) return null;
      return {
        id: `resume:${section}:${bulletIndex}`,
        section,
        index: bulletIndex,
        requirements,
        bulletText,
        reviewState,
        requirementSource,
        evidenceFound,
        workItemId,
        proofLevel,
        nextBestAction,
        canRemove: canRemove ?? true,
        locationLabel: chatContextLabelForSection(section),
      };
    });
  }, []);

  const _openAttentionItem = useCallback((index: number, options?: { autoReuseClarificationId?: string }) => {
    const item = attentionItems[index];
    if (!item) return;
    setActiveBullet({
      id: `attention:${item.id}`,
      section: item.section,
      index: item.index,
      requirements: item.requirements,
      bulletText: item.text,
      reviewState: item.reviewState,
      requirementSource: item.requirementSource,
      evidenceFound: item.evidenceFound,
      sourceEvidence: undefined,
      workItemId: item.workItemId,
      proofLevel: item.proofLevel,
      framingGuardrail: undefined,
      nextBestAction: item.nextBestAction,
      canRemove: true,
      locationLabel: item.locationLabel,
      autoReuseClarificationId: options?.autoReuseClarificationId,
    });
    window.requestAnimationFrame(() => {
      scrollToAndFocusTarget(buildResumeLineSelector(item.section, item.index));
    });
  }, [attentionItems]);

  const openSectionCoachTarget = useCallback((target: SectionCoachTarget) => {
    setActiveBullet({
      id: `section:${target.section}:${target.index}`,
      section: target.section,
      index: target.index,
      requirements: target.requirements,
      bulletText: target.bulletText,
      reviewState: target.reviewState,
      requirementSource: target.requirementSource,
      evidenceFound: target.evidenceFound,
      sourceEvidence: target.sourceEvidence,
      workItemId: target.workItemId,
      proofLevel: target.proofLevel,
      framingGuardrail: target.framingGuardrail,
      nextBestAction: target.nextBestAction,
      canRemove: target.canRemove,
      locationLabel: target.label,
    });
  }, []);

  const openNewCustomSectionInCoach = useCallback((result: {
    sectionId: string;
    title: string;
    lines: string[];
    resume: ResumeDraft;
  }) => {
    const workItems = data.requirementWorkItems ?? data.gapAnalysis?.requirement_work_items ?? [];
    const target = buildSectionCoachTargets(result.resume, workItems)
      .find((candidate) => candidate.section === `custom_section:${result.sectionId}`);

    if (target) {
      openSectionCoachTarget(target);
      window.requestAnimationFrame(() => {
        scrollToAndFocusTarget(`[data-section="${result.sectionId}"]`);
      });
      return;
    }

    const firstLine = result.lines.find((line) => line.trim().length > 0);
    const bulletText = firstLine ?? result.title;
    setActiveBullet({
      id: `custom:${result.sectionId}`,
      section: `custom_section:${result.sectionId}`,
      index: firstLine ? result.lines.findIndex((line) => line === firstLine) : -1,
      requirements: [],
      bulletText,
      reviewState: 'strengthen',
      requirementSource: undefined,
      evidenceFound: bulletText,
      sourceEvidence: undefined,
      workItemId: undefined,
      proofLevel: undefined,
      framingGuardrail: undefined,
      nextBestAction: 'tighten',
      canRemove: true,
      locationLabel: result.title,
    });
    window.requestAnimationFrame(() => {
      scrollToAndFocusTarget(`[data-section="${result.sectionId}"]`);
    });
  }, [data.gapAnalysis?.requirement_work_items, data.requirementWorkItems, openSectionCoachTarget]);

  const handleAddAISectionAndOpen = useCallback(() => {
    const result = onAddAISection?.();
    if (result) {
      openNewCustomSectionInCoach(result);
    }
  }, [onAddAISection, openNewCustomSectionInCoach]);

  const handleAddCustomSectionAndOpen = useCallback((title: string, lines: string[], presetId?: ResumeCustomSectionPresetId) => {
    const result = onAddCustomSection?.(title, lines, presetId);
    if (result) {
      openNewCustomSectionInCoach(result);
    }
  }, [onAddCustomSection, openNewCustomSectionInCoach]);

  const handleConfirmStructureStep = useCallback(() => {
    setHasCompletedStructureStep(true);
    setShowStructurePlanner(false);
    setSectionJourneyIndex(0);
    setHasStartedSectionWorkflow(true);
    setActiveBullet(null);
  }, []);

  const handleShowStructurePlan = useCallback(() => {
    setShowStructurePlanner(true);
    setHasCompletedStructureStep(false);
    setActiveBullet(null);
  }, []);

  // Clear activeBullet after accepting an edit (inline panel should close)
  const handleAcceptEdit = useCallback((editedText: string) => {
    onAcceptEdit(editedText);
    setActiveBullet(null);
  }, [onAcceptEdit]);
  const advanceSectionJourney = useCallback(() => {
    setSectionJourneyIndex((current) => {
      if (sectionWorkflow.steps.length === 0) return 0;
      return Math.min(current + 1, sectionWorkflow.steps.length);
    });
  }, [sectionWorkflow.steps.length]);
  const handleApplyWorkflowVariant = useCallback((variant: ResumeSectionDraftVariant) => {
    if (!currentWorkflowStep || !onApplySectionDraft) return;
    onApplySectionDraft(currentWorkflowStep, variant);
    setActiveBullet(null);
    advanceSectionJourney();
  }, [advanceSectionJourney, currentWorkflowStep, onApplySectionDraft]);
  // Tracks when the coaching panel closed because the user applied an edit
  // (vs. clicking the X button). Used to gate the auto-advance effect below.
  // justCompletedEditRef removed — auto-advance now handled directly by advanceToNextItem()

  // ── Rewrite queue (moved here so coachData can consume its items) ─────────
  const rewriteQueue = useMemo(() => {
    if (!data.jobIntelligence || !data.gapAnalysis) return null;
    return buildRewriteQueue({
      jobIntelligence: data.jobIntelligence,
      gapAnalysis: data.gapAnalysis,
      requirementWorkItems: data.requirementWorkItems,
      currentResume: displayResume,
      benchmarkCandidate: data.benchmarkCandidate,
      gapCoachingCards,
      gapChatSnapshot,
      finalReviewResult: hiringManagerResult ?? null,
      finalReviewChatSnapshot,
      resolvedFinalReviewConcernIds,
    });
  }, [
    data.benchmarkCandidate,
    data.gapAnalysis,
    data.jobIntelligence,
    displayResume,
    finalReviewChatSnapshot,
    gapChatSnapshot,
    gapCoachingCards,
    hiringManagerResult,
    resolvedFinalReviewConcernIds,
  ]);

  // ── Unified coach item list (new architecture) ───────────────────────────
  const coachData = useResumeCoachItems(displayResume ?? null, rewriteQueue?.items);

  // Snapshot the initial flagged count when the user first enters review mode
  // (either via handleStartReviewing or by clicking a bullet directly).
  useEffect(() => {
    if (initialFlaggedCount === 0 && activeBullet && coachData.flaggedCount > 0) {
      setInitialFlaggedCount(coachData.flaggedCount);
    }
  }, [activeBullet, coachData.flaggedCount, initialFlaggedCount]);

  const sectionSummaries = useMemo(() => {
    const groups = new Map<string, { label: string; flagged: number; total: number }>();
    for (const item of coachData.items) {
      const key = item.sectionLabel;
      const existing = groups.get(key) ?? { label: key, flagged: 0, total: 0 };
      existing.total++;
      if (item.status === 'needs_attention') existing.flagged++;
      groups.set(key, existing);
    }
    return [...groups.entries()].map(([key, groupData]) => ({
      key,
      label: groupData.label,
      flaggedCount: groupData.flagged,
      totalCount: groupData.total,
      status: groupData.flagged === 0 ? 'strong' as const : groupData.flagged === groupData.total ? 'needs_attention' as const : 'mixed' as const,
    }));
  }, [coachData.items]);

  const sectionProgress = useMemo(() => {
    const progress: Record<string, { flagged: number; total: number }> = {};
    for (const item of coachData.items) {
      const key = item.section.startsWith('professional_experience') ? 'professional_experience' : item.section;
      if (!progress[key]) progress[key] = { flagged: 0, total: 0 };
      progress[key].total++;
      if (item.status === 'needs_attention') progress[key].flagged++;
    }
    return progress;
  }, [coachData.items]);

  const currentFlaggedPosition = useMemo(() => {
    if (!activeBullet) return 0;
    const key = `${activeBullet.section}:${activeBullet.index}`;
    const idx = coachData.flaggedItems.findIndex(item => item.id === key);
    return idx >= 0 ? idx + 1 : 0;
  }, [activeBullet, coachData.flaggedItems]);

  // ── Navigation callbacks ──────────────────────────────────────────────────
  const navigateToFlaggedItem = useCallback((item: CoachItem) => {
    setActiveBullet({
      id: item.id,
      section: item.section,
      index: item.index,
      requirements: item.requirements,
      bulletText: item.text,
      reviewState: item.reviewState,
      requirementSource: item.requirementSource,
      evidenceFound: item.evidenceFound,
      workItemId: item.workItemId,
      proofLevel: item.proofLevel,
      framingGuardrail: item.framingGuardrail,
      nextBestAction: item.nextBestAction,
      canRemove: item.canRemove,
      locationLabel: item.locationLabel,
    });
    window.requestAnimationFrame(() => {
      scrollToAndFocusTarget(buildResumeLineSelector(item.section, item.index));
    });
  }, []);

  const handlePrevItem = useCallback(() => {
    if (currentFlaggedPosition <= 1) return;
    const prevItem = coachData.flaggedItems[currentFlaggedPosition - 2];
    if (prevItem) navigateToFlaggedItem(prevItem);
  }, [currentFlaggedPosition, coachData.flaggedItems, navigateToFlaggedItem]);

  const handleNextItem = useCallback(() => {
    if (currentFlaggedPosition === 0) return; // not in flagged list
    if (currentFlaggedPosition >= coachData.flaggedCount) return;
    const nextItem = coachData.flaggedItems[currentFlaggedPosition];
    if (nextItem) navigateToFlaggedItem(nextItem);
  }, [currentFlaggedPosition, coachData.flaggedCount, coachData.flaggedItems, navigateToFlaggedItem]);

  const handleSectionMiniMapClick = useCallback((sectionKey: string) => {
    const firstInSection = coachData.flaggedItems.find(item => item.sectionLabel === sectionKey);
    if (firstInSection) {
      navigateToFlaggedItem(firstInSection);
    }
  }, [coachData.flaggedItems, navigateToFlaggedItem]);

  // Activate the first flagged item using the new coachData list
  const handleStartReviewing = useCallback(() => {
    if (initialFlaggedCount === 0 && coachData.flaggedCount > 0) {
      setInitialFlaggedCount(coachData.flaggedCount);
    }
    const firstFlagged = coachData.flaggedItems[0];
    if (firstFlagged) {
      navigateToFlaggedItem(firstFlagged);
    }
  }, [coachData.flaggedItems, coachData.flaggedCount, initialFlaggedCount, navigateToFlaggedItem]);

  /** After applying an edit, advance directly to the next unvisited flagged item.
   *  No intermediate null state — one setActiveBullet call, no flash. */
  const advanceToNextItem = useCallback((justEditedSection: string, justEditedIndex: number) => {
    const justEditedKey = `${justEditedSection}:${justEditedIndex}`;
    markVisited(justEditedSection, justEditedIndex);

    const currentIdx = coachData.flaggedItems.findIndex(item => item.id === justEditedKey);

    // Find the next unvisited item after current position
    const updatedVisited = new Set(visitedItems).add(justEditedKey);
    const nextUnvisited = coachData.flaggedItems.find(
      (item, idx) => idx > currentIdx && !updatedVisited.has(item.id),
    );

    if (nextUnvisited) {
      navigateToFlaggedItem(nextUnvisited);
    } else {
      // All items visited or at the end — go to completion
      setActiveBullet(null);
    }
  }, [coachData.flaggedItems, navigateToFlaggedItem, markVisited, visitedItems]);

  const handleCoachApplyToResume = useCallback((section: string, index: number, newText: string, metadata?: OptimisticResumeEditMetadata) => {
    onBulletEdit?.(section, index, newText, metadata);
    advanceToNextItem(section, index);
  }, [onBulletEdit, advanceToNextItem]);
  const handleCoachRemoveBullet = useCallback((section: string, index: number) => {
    onBulletRemove?.(section, index);
    advanceToNextItem(section, index);
  }, [onBulletRemove, advanceToNextItem]);

  // Bullet clicking and direct editing: available as soon as the resume is visible
  const canInteract = displayResume !== null && displayResume !== undefined;
  // Full coaching features (undo bar, gap coaching panel): gated on pipeline completion
  const canEdit = isComplete && canInteract;

  const canShowUndoBar = canEdit && (undoCount > 0 || redoCount > 0);

  // A1/A2: Clear activeBullet when re-running (stale state from previous run)
  useEffect(() => {
    if (isRerunning) {
      setActiveBullet(null);
    }
  }, [isRerunning]);

  // M3: Scroll to coaching panel when a bullet is activated
  // B3: Escape key closes inline edit panel
  useEffect(() => {
    if (!activeBullet) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveBullet(null);
        onRejectEdit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeBullet, onRejectEdit]);

  // Auto-advance is now handled directly in handleCoachApplyToResume/handleCoachRemoveBullet
  // via advanceToNextItem() — no intermediate null state, no timer, no flash.

  // Scroll to top when scoring report data arrives so it's visible
  useEffect(() => {
    if (data.assembly && containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [data.assembly]);

  // Show the full-width resume document once a draft exists.
  // Don't show it while re-running — the old assembly data persists and would be stale.
  const canShowResumeDocument = hasResume && !isRerunning;

  // Beat 2 gate — user must click through the "Resume Is Ready" screen before editing
  const [hasPassedReadyGate, setHasPassedReadyGate] = useState(false);

  // Reset gate when re-running
  useEffect(() => {
    if (isRerunning) {
      setHasPassedReadyGate(false);
      setHasCompletedStructureStep(false);
      setShowStructurePlanner(false);
      setHasStartedSectionWorkflow(false);
    }
  }, [isRerunning]);
  useEffect(() => {
    if (!hasPassedReadyGate) {
      setHasCompletedStructureStep(false);
      setShowStructurePlanner(false);
      setSectionJourneyIndex(0);
      setHasStartedSectionWorkflow(false);
      return;
    }

    // Structure planner is no longer shown automatically on entry.
    // It opens only when the user explicitly clicks "Adjust section structure".
    // Mark the structure step as complete immediately so the Coach/Waiting view
    // is the default entry state.
    if (!canShowStructurePlanner) {
      setHasCompletedStructureStep(true);
      setShowStructurePlanner(false);
    } else if (!hasCompletedStructureStep) {
      setHasCompletedStructureStep(true);
    }
  }, [canShowStructurePlanner, hasCompletedStructureStep, hasPassedReadyGate]);
  useEffect(() => {
    if (sectionWorkflow.steps.length === 0) {
      if (sectionJourneyIndex !== 0) {
        setSectionJourneyIndex(0);
      }
      return;
    }

    if (sectionJourneyIndex > sectionWorkflow.steps.length) {
      setSectionJourneyIndex(sectionWorkflow.steps.length);
    }
  }, [sectionJourneyIndex, sectionWorkflow.steps.length]);
  useEffect(() => {
    if (activeBullet && hasPassedReadyGate && coachingPanelRef.current) {
      scrollToAndFocusTarget(buildResumeLineSelector(activeBullet.section, activeBullet.index));
      coachingPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      coachingPanelRef.current.focus();
    }
  }, [activeBullet, hasPassedReadyGate]);
  useEffect(() => {
    if (!hasPassedReadyGate || workflowNeedsStructureStep || activeBullet || !isWorkflowActive || !currentWorkflowStep || !onGenerateSectionDraft) {
      return;
    }
    const currentDraftState = sectionDrafts[currentWorkflowStep.id];
    if (
      currentDraftState?.status === 'ready'
      || currentDraftState?.status === 'loading'
      || currentDraftState?.status === 'error'
    ) return;
    void onGenerateSectionDraft({ step: currentWorkflowStep });
  }, [
    activeBullet,
    currentWorkflowStep,
    hasPassedReadyGate,
    isWorkflowActive,
    onGenerateSectionDraft,
    sectionDrafts,
    workflowNeedsStructureStep,
  ]);
  const handleReadyGateStartEditing = useCallback(() => {
    queueMicrotask(() => {
      setHasPassedReadyGate(true);
    });
  }, []);

  const jobBreakdown = data.gapAnalysis?.score_breakdown?.job_description ?? {
    addressed: 0,
    total: 0,
    partial: 0,
    missing: 0,
    coverage_score: 0,
  };
  const benchmarkBreakdown = data.gapAnalysis?.score_breakdown?.benchmark ?? {
    addressed: 0,
    total: 0,
    partial: 0,
    missing: 0,
    coverage_score: 0,
  };
  const keywordPhrasesFound = dedupePhraseList(
    postReviewPolish?.result?.keywords_found
      ?? data.verificationDetail?.ats.keywords_found
      ?? data.preScores?.keywords_found
      ?? [],
  );
  const keywordPhrasesMissing = dedupePhraseList(
    postReviewPolish?.result?.keywords_missing
      ?? data.verificationDetail?.ats.keywords_missing
      ?? data.preScores?.keywords_missing
      ?? [],
  );
  const keywordMatchPercent = useMemo(() => {
    const verifiedScore = postReviewPolish?.result?.ats_score ?? data.verificationDetail?.ats.match_score;
    if (typeof verifiedScore === 'number' && Number.isFinite(verifiedScore)) {
      return Math.round(verifiedScore);
    }

    const assemblyScore = data.assembly?.scores.ats_match;
    const preScore = data.preScores?.keyword_match_score ?? data.preScores?.ats_match;
    const hasPhraseEvidence = keywordPhrasesFound.length > 0 || keywordPhrasesMissing.length > 0;

    if (typeof assemblyScore === 'number' && Number.isFinite(assemblyScore) && (assemblyScore > 0 || !hasPhraseEvidence)) {
      return Math.round(assemblyScore);
    }

    if (typeof preScore === 'number' && Number.isFinite(preScore)) {
      return Math.round(preScore);
    }

    if (typeof assemblyScore === 'number' && Number.isFinite(assemblyScore)) {
      return Math.round(assemblyScore);
    }

    return null;
  }, [
    data.assembly?.scores.ats_match,
    data.preScores?.ats_match,
    data.preScores?.keyword_match_score,
    data.verificationDetail?.ats.match_score,
    keywordPhrasesFound.length,
    keywordPhrasesMissing.length,
    postReviewPolish?.result?.ats_score,
  ]);
  const hasKeywordReportData = Boolean(
    data.gapAnalysis?.score_breakdown
      || typeof keywordMatchPercent === 'number'
      || keywordPhrasesFound.length > 0
      || keywordPhrasesMissing.length > 0,
  );
  const readyGateActionSummary = useMemo(() => {
    const workItems = data.requirementWorkItems ?? data.gapAnalysis?.requirement_work_items ?? [];
    const lines: string[] = [];

    if (canShowStructurePlanner) {
      lines.push('Choose the sections and order first so the strongest proof shows up in the right place before you edit the wording.');
    } else if (hiddenRecommendedSections.length > 0) {
      lines.push(`Before line editing, re-enable ${hiddenRecommendedSections.slice(0, 2).map((item) => item.title).join(' and ')} so the strongest proof shows up earlier in the resume.`);
    } else if (missingStructureRecommendations.length > 0) {
      lines.push(`Before line editing, review whether ${missingStructureRecommendations.slice(0, 2).map((item) => item.title).join(' and ')} should be added so the story is structured for this role from the start.`);
    }

    if (workItems.length === 0) return lines.slice(0, 3);

    const unresolved = workItems.filter((item) => (
      item.current_claim_strength !== 'supported' && item.current_claim_strength !== 'supported_rewrite'
    ));
    if (unresolved.length === 0) {
      lines.push('Most requirements are already grounded. Use the editor to make a final polish pass and confirm the strongest wording.');
      return lines.slice(0, 3);
    }

    const answerCount = unresolved.filter((item) => item.next_best_action === 'answer').length;
    const confirmCount = unresolved.filter((item) => item.next_best_action === 'confirm').length;
    const quantifyCount = unresolved.filter((item) => item.next_best_action === 'quantify').length;
    const tightenCount = unresolved.filter((item) => item.next_best_action === 'tighten').length;
    if (answerCount > 0) {
      lines.push(
        answerCount === 1
          ? '1 requirement still needs a concrete example or missing detail before its claim is safe to add to the resume.'
          : `${answerCount} requirements still need concrete examples and/or missing details before those claims are safe to add to the resume.`,
      );
    }
    if (confirmCount > 0) {
      lines.push(
        confirmCount === 1
          ? '1 claim that would make your resume look more like a top candidate still needs more verification before we should include it.'
          : `${confirmCount} claims that would make your resume look more like a top candidate still need more verification before we should include them.`,
      );
    }
    if (quantifyCount + tightenCount > 0) {
      const total = quantifyCount + tightenCount;
      lines.push(`${total} line${total === 1 ? '' : 's'} can get stronger with sharper wording, clearer scope, or one defensible metric.`);
    }
    return lines.slice(0, 3);
  }, [
    canShowStructurePlanner,
    data.gapAnalysis?.requirement_work_items,
    data.requirementWorkItems,
    hiddenRecommendedSections,
    missingStructureRecommendations,
  ]);
  const readyGatePrimaryActionLabel = 'Start Reviewing →';

  // Health score: use keyword match when available, fall back to requirement coverage
  const _healthScore = useMemo(() => {
    if (typeof keywordMatchPercent === 'number') return keywordMatchPercent;
    const queueSummary = rewriteQueue?.summary;
    if (queueSummary && queueSummary.total > 0) {
      return Math.round((queueSummary.handled / queueSummary.total) * 100);
    }
    return null;
  }, [keywordMatchPercent, rewriteQueue?.summary]);

  const unresolvedCriticalConcerns = useMemo(() => (
    hiringManagerResult?.concerns.filter((concern) => (
      concern.severity === 'critical' && !resolvedFinalReviewConcernIds.includes(concern.id)
    )).length ?? 0
  ), [hiringManagerResult, resolvedFinalReviewConcernIds]);
  const compactReviewStatusLabel = useMemo(() => {
    if (!onRequestHiringManagerReview) return undefined;
    if (!hiringManagerResult) return 'Not run';
    if (isFinalReviewStale) return 'Needs rerun';
    if (unresolvedCriticalConcerns > 0) {
      return `${unresolvedCriticalConcerns} critical left`;
    }
    return 'Ready';
  }, [
    hiringManagerResult,
    isFinalReviewStale,
    onRequestHiringManagerReview,
    unresolvedCriticalConcerns,
  ]);
  const compactAttentionSummary = useMemo(() => {
    if (attentionItems.length === 0) {
      return `Your Resume Is Complete \u2014 all lines verified.`;
    }

    const reusableAnswerCount = attentionItems.filter((item) => rememberedAttentionItemIds.has(item.id)).length;
    const proofCount = attentionItems.filter((item) => item.priority === 0 && !rememberedAttentionItemIds.has(item.id)).length;
    const validateCount = attentionItems.filter((item) => item.priority === 1).length;
    const strengthenCount = attentionItems.filter((item) => item.priority === 2).length;

    if (proofCount > 0) {
      const remainder = validateCount + strengthenCount;
      const reusableLead = reusableAnswerCount > 0
        ? `${reusableAnswerCount} line${reusableAnswerCount === 1 ? '' : 's'} can already be strengthened from your earlier answers, and `
        : '';
      return `${reusableLead}${proofCount} line${proofCount === 1 ? '' : 's'} still ${proofCount === 1 ? 'needs' : 'need'} your story${remainder > 0 ? `, and ${remainder} more still need attention` : ''}.`;
    }

    if (reusableAnswerCount > 0) {
      return `${reusableAnswerCount} line${reusableAnswerCount === 1 ? '' : 's'} can already be strengthened from your earlier answers${validateCount > 0 ? `, and ${validateCount} still ${validateCount === 1 ? 'needs' : 'need'} a fit check` : strengthenCount > 0 ? `, and ${strengthenCount} more could be stronger` : ''}.`;
    }

    if (validateCount > 0) {
      return `${validateCount} line${validateCount === 1 ? '' : 's'} still ${validateCount === 1 ? 'needs' : 'need'} a fit check${strengthenCount > 0 ? `, and ${strengthenCount} more could be stronger` : ''}.`;
    }

    return `Your resume is looking good \u2014 ${strengthenCount} line${strengthenCount === 1 ? '' : 's'} could still be stronger.`;
  }, [attentionItems, rememberedAttentionItemIds]);
  const compactAttentionNextAction = useMemo(() => {
    const topItem = attentionItems[0];
    if (!topItem) return undefined;
    const primaryRequirement = topItem.requirements[0];
    if (rememberedAttentionItemIds.has(topItem.id)) {
      return primaryRequirement
        ? `Open the line in ${topItem.locationLabel}. We already have a useful detail for ${primaryRequirement} from an earlier answer.`
        : `Open the line in ${topItem.locationLabel}. We already have a useful detail from an earlier answer.`;
    }
    const nextAction = describeRecommendationPlain(topItem);
    return primaryRequirement
      ? `Open the line in ${topItem.locationLabel}. We are strengthening how this resume shows ${primaryRequirement}. ${nextAction}`
      : `Open the line in ${topItem.locationLabel}. ${nextAction}`;
  }, [attentionItems, rememberedAttentionItemIds]);
  const isShowingStructurePlan = !activeBullet && canShowStructurePlanner && (!hasCompletedStructureStep || showStructurePlanner);
  const showDesktopFinalReview = Boolean(
    !activeBullet
      && hasCompletedStructureStep
      && !showStructurePlanner
      && !currentWorkflowStep
      && isComplete
      && displayResume
      && onRequestHiringManagerReview,
  );

  // ─── Unified layout — single ScoringReport above the branch split ────────
  return (
    <div ref={containerRef} className={`flex-1 overflow-y-auto relative${canShowResumeDocument && hasPassedReadyGate ? ' lg:overflow-hidden' : ''}`}>
      {/* Scoring report — three instances: one here (non-editing state), one in mobile layout, one in desktop left panel */}
      {data.preScores && data.assembly && !canShowResumeDocument && (
        <div className="mx-auto max-w-[900px] px-6 pt-4">
          <ScoringReport
            preScores={data.preScores}
            assembly={data.assembly}
            verificationDetail={data.verificationDetail ?? null}
            gapAnalysis={data.gapAnalysis ?? null}
            compact={canShowResumeDocument}
            compactReviewStatusLabel={canShowResumeDocument ? compactReviewStatusLabel : undefined}
            compactAttentionSummary={canShowResumeDocument ? compactAttentionSummary : undefined}
            compactAttentionNextAction={canShowResumeDocument ? compactAttentionNextAction : undefined}
            renderDetails={!canShowResumeDocument}
          />
        </div>
      )}

      {canShowResumeDocument && hasPassedReadyGate ? (
        <>
          {/* ── Mobile / tablet: single-column layout (existing behavior) ── */}
          <div className="flex flex-col lg:hidden">
            {canShowUndoBar && (
              <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2 bg-[#0f141e]/85 border-b border-[var(--line-soft)]">
                <button type="button" onClick={onUndo} disabled={undoCount === 0} className="flex items-center gap-1.5 rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1.5 text-xs text-[var(--text-soft)] hover:bg-[var(--surface-1)] hover:text-[var(--text-strong)] disabled:opacity-30 transition-colors" title="Undo">
                  <Undo2 className="h-3 w-3" /><span>Undo</span>
                  {undoCount > 0 && <span className="rounded-sm bg-[var(--surface-1)] px-1.5 py-0.5 font-mono text-[12px] text-[var(--text-soft)]">{undoCount}</span>}
                </button>
                <button type="button" onClick={onRedo} disabled={redoCount === 0} className="flex items-center gap-1.5 rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1.5 text-xs text-[var(--text-soft)] hover:bg-[var(--surface-1)] hover:text-[var(--text-strong)] disabled:opacity-30 transition-colors" title="Redo">
                  <Redo2 className="h-3 w-3" /><span>Redo</span>
                  {redoCount > 0 && <span className="rounded-sm bg-[var(--surface-1)] px-1.5 py-0.5 font-mono text-[12px] text-[var(--text-soft)]">{redoCount}</span>}
                </button>
              </div>
            )}
            <div className="mx-auto max-w-[900px] px-4 py-5 space-y-4 sm:px-6 sm:py-8 sm:space-y-6">
              {error && (
                <div className="rounded-xl border border-[var(--badge-red-text)]/28 bg-[var(--badge-red-bg)] px-4 py-3 text-sm text-[var(--badge-red-text)]/90" role="alert">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />{error}
                  </div>
                  {onRetryPipeline && (
                    <button
                      type="button"
                      onClick={onRetryPipeline}
                      className="mt-3 rounded-lg bg-white/10 hover:bg-white/20 px-4 py-2 text-sm font-medium text-white transition-colors"
                    >
                      Retry Pipeline
                    </button>
                  )}
                </div>
              )}
              {editError && (
                <div className="flex items-center gap-2 rounded-xl border border-[var(--badge-red-text)]/28 bg-[var(--badge-red-bg)] px-4 py-3 text-sm text-[var(--badge-red-text)]/90" role="alert">
                  <AlertCircle className="h-4 w-4 shrink-0" />{editError}
                </div>
              )}
              {!isComplete && isConnected && (
                <div className="flex items-center gap-2 text-xs text-[var(--text-soft)]" role="status" aria-live="polite">
                  <Loader2 className="h-3 w-3 motion-safe:animate-spin" /><span>{getStageMessage(data.stage)}</span>
                </div>
              )}
              {pendingEdit && <ReviewInboxCard pendingEdit={pendingEdit} />}
              {!activeBullet && displayResume && (isShowingStructurePlan || isWorkflowActive) && (
                <div ref={structurePlannerRef}>
                  <ResumeSectionWorkflowPanel
                    resume={displayResume}
                    workflow={sectionWorkflow}
                    candidateIntelligence={data.candidateIntelligence}
                    requirementWorkItems={data.requirementWorkItems}
                    structureConfirmed={!isShowingStructurePlan}
                    currentStep={isWorkflowActive ? currentWorkflowStep : null}
                    draftState={isWorkflowActive && currentWorkflowStep ? sectionDrafts[currentWorkflowStep.id] : undefined}
                    onMoveSection={onMoveSection!}
                    onToggleSection={onToggleSection!}
                    onAddAISection={handleAddAISectionAndOpen}
                    onAddCustomSection={handleAddCustomSectionAndOpen}
                    onRemoveCustomSection={onRemoveCustomSection!}
                    onConfirmStructure={handleConfirmStructureStep}
                    onGenerateDraft={() => {
                      if (currentWorkflowStep) {
                        void onGenerateSectionDraft?.({ step: currentWorkflowStep, force: true });
                      }
                    }}
                    onRefineDraft={async (actionId, workingDraft) => {
                      if (currentWorkflowStep) {
                        await onRefineSectionDraft?.(currentWorkflowStep, actionId, workingDraft);
                      }
                    }}
                    onApplyVariant={handleApplyWorkflowVariant}
                    onShowStructurePlan={handleShowStructurePlan}
                  />
                </div>
              )}
              {displayResume && (
                <AnimatedCard index={0}>
                  <div className="resume-paper-shell overflow-hidden">
                    <ResumeDocumentCard resume={displayResume} requirementCatalog={data.gapAnalysis?.requirements ?? []} activeBullet={activeBullet} onBulletClick={canInteract ? handleBulletClick : undefined} sectionProgress={sectionProgress} />
                  </div>
                </AnimatedCard>
              )}
              {activeBullet && gapChat && buildChatContext && (
                <>
                  {/* Backdrop — lg:hidden ensures fixed positioning can't leak onto desktop */}
                  <div
                    className="mobile-coaching-overlay lg:hidden"
                    onClick={() => setActiveBullet(null)}
                    aria-hidden="true"
                  />
                  {/* Bottom sheet */}
                  <div className="mobile-coaching-sheet lg:hidden" role="dialog" aria-modal="true" aria-label="Bullet coaching">
                    <BulletCoachingPanel bulletText={activeBullet.bulletText} section={activeBullet.section} bulletIndex={activeBullet.index} requirements={activeBullet.requirements} reviewState={activeBullet.reviewState} requirementSource={activeBullet.requirementSource} evidenceFound={activeBullet.evidenceFound} sourceEvidence={activeBullet.sourceEvidence} proofLevel={activeBullet.proofLevel} framingGuardrail={activeBullet.framingGuardrail} nextBestAction={activeBullet.nextBestAction} canRemove={activeBullet.canRemove ?? true} initialReuseClarificationId={activeBullet.autoReuseClarificationId} gapChat={gapChat} chatContext={buildChatContext({ requirement: activeBullet.requirements[0], requirements: activeBullet.requirements, lineText: activeBullet.bulletText, section: activeBullet.section, index: activeBullet.index, reviewState: activeBullet.reviewState, evidenceFound: activeBullet.evidenceFound, workItemId: activeBullet.workItemId })} onApplyToResume={handleCoachApplyToResume} onRemoveBullet={handleCoachRemoveBullet} onClose={() => setActiveBullet(null)} onSkip={() => advanceToNextItem(activeBullet.section, activeBullet.index)} onBulletEnhance={onBulletEnhance} sectionType={deriveSectionType(activeBullet.section)} />
                  </div>
                </>
              )}
              {pendingEdit && !activeBullet && (
                <div className="mt-4" ref={(el) => el?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                  <DiffView key={pendingEdit.originalText + pendingEdit.section} edit={pendingEdit} onAccept={handleAcceptEdit} onReject={onRejectEdit} />
                </div>
              )}
              {showDesktopFinalReview && (
                <ResumeFinalReviewPanel hiringManagerResult={hiringManagerResult ?? null} resolvedFinalReviewConcernIds={resolvedFinalReviewConcernIds} isFinalReviewStale={isFinalReviewStale} isHiringManagerLoading={isHiringManagerLoading} hiringManagerError={hiringManagerError} companyName={data.jobIntelligence?.company_name} jobTitle={data.jobIntelligence?.role_title} onRequestHiringManagerReview={onRequestHiringManagerReview} onApplyHiringManagerRecommendation={onApplyHiringManagerRecommendation} finalReviewChat={finalReviewChat} buildFinalReviewChatContext={buildFinalReviewChatContext} resolveConcernTarget={resolveFinalReviewTarget} onPreviewConcernTarget={onPreviewFinalReviewTarget} isEditing={isEditing} />
              )}
              {isComplete && data.assembly && displayResume && (
                <CollapsibleWorkspaceRail>
                  <ResumeWorkspaceRail displayResume={displayResume} companyName={data.jobIntelligence?.company_name} jobTitle={data.jobIntelligence?.role_title} atsScore={data.assembly.scores.ats_match} hiringManagerResult={hiringManagerResult ?? null} resolvedFinalReviewConcernIds={resolvedFinalReviewConcernIds} isFinalReviewStale={isFinalReviewStale} queueSummary={rewriteQueue?.summary ?? { total: 0, needsAttention: 0, partiallyAddressed: 0, resolved: 0, hardGapCount: 0, needsUserInput: 0, needsApproval: 0, handled: 0 }} nextQueueItemLabel={rewriteQueue?.nextItem?.title} jobUrl={jobUrl} sessionId={data.sessionId} accessToken={accessToken} />
                </CollapsibleWorkspaceRail>
              )}
            </div>
          </div>

          {/* ── Desktop: two-panel layout ── */}
          <div className="hidden h-full px-4 py-4 lg:flex xl:px-5 xl:py-5">
            <ResumeEditorLayout
              leftPanel={
                <ResumeCoachPanel
                  flaggedCount={coachData.flaggedCount}
                  reviewedCount={visitedItems.size}
                  currentPosition={currentFlaggedPosition}
                  sectionSummaries={sectionSummaries}
                  isActive={!!activeBullet}
                  isComplete={initialFlaggedCount > 0 && coachData.flaggedItems.every(item => visitedItems.has(item.id))}
                  onStartReviewing={handleStartReviewing}
                  onPrevItem={handlePrevItem}
                  onNextItem={handleNextItem}
                  onSectionClick={handleSectionMiniMapClick}
                  onStructurePlan={canShowStructurePlanner ? handleShowStructurePlan : undefined}
                  onExportDocx={() => document.querySelector<HTMLButtonElement>('[data-export-docx]')?.click()}
                  onExportPdf={() => document.querySelector<HTMLButtonElement>('[data-export-pdf]')?.click()}
                  onRequestFinalReview={onRequestHiringManagerReview}
                  onDoneReviewing={() => setActiveBullet(null)}
                  error={error ?? editError ?? null}
                  onRetryPipeline={onRetryPipeline}
                >
                  {showDesktopFinalReview ? (
                    <ResumeFinalReviewPanel
                      hiringManagerResult={hiringManagerResult ?? null}
                      resolvedFinalReviewConcernIds={resolvedFinalReviewConcernIds}
                      isFinalReviewStale={isFinalReviewStale}
                      isHiringManagerLoading={isHiringManagerLoading}
                      hiringManagerError={hiringManagerError}
                      companyName={data.jobIntelligence?.company_name}
                      jobTitle={data.jobIntelligence?.role_title}
                      onRequestHiringManagerReview={onRequestHiringManagerReview}
                      onApplyHiringManagerRecommendation={onApplyHiringManagerRecommendation}
                      finalReviewChat={finalReviewChat}
                      buildFinalReviewChatContext={buildFinalReviewChatContext}
                      resolveConcernTarget={resolveFinalReviewTarget}
                      onPreviewConcernTarget={onPreviewFinalReviewTarget}
                      isEditing={isEditing}
                    />
                  ) : activeBullet && gapChat && buildChatContext ? (
                    <div ref={coachingPanelRef} tabIndex={-1} className="outline-none">
                      <BulletCoachingPanel
                        bulletText={activeBullet.bulletText}
                        section={activeBullet.section}
                        bulletIndex={activeBullet.index}
                        requirements={activeBullet.requirements}
                        reviewState={activeBullet.reviewState}
                        requirementSource={activeBullet.requirementSource}
                        evidenceFound={activeBullet.evidenceFound}
                        sourceEvidence={activeBullet.sourceEvidence}
                        proofLevel={activeBullet.proofLevel}
                        framingGuardrail={activeBullet.framingGuardrail}
                        nextBestAction={activeBullet.nextBestAction}
                        canRemove={activeBullet.canRemove ?? true}
                        initialReuseClarificationId={activeBullet.autoReuseClarificationId}
                        gapChat={gapChat}
                        chatContext={buildChatContext({ requirement: activeBullet.requirements[0], requirements: activeBullet.requirements, lineText: activeBullet.bulletText, section: activeBullet.section, index: activeBullet.index, reviewState: activeBullet.reviewState, evidenceFound: activeBullet.evidenceFound, workItemId: activeBullet.workItemId })}
                        onApplyToResume={handleCoachApplyToResume}
                        onRemoveBullet={handleCoachRemoveBullet}
                        onClose={() => setActiveBullet(null)}
                        onSkip={() => advanceToNextItem(activeBullet.section, activeBullet.index)}
                        onBulletEnhance={onBulletEnhance}
                        sectionType={deriveSectionType(activeBullet.section)}
                      />
                    </div>
                  ) : isShowingStructurePlan || isWorkflowActive ? (
                    displayResume ? (
                      <div ref={structurePlannerRef}>
                        <ResumeSectionWorkflowPanel
                          resume={displayResume}
                          workflow={sectionWorkflow}
                          candidateIntelligence={data.candidateIntelligence}
                          requirementWorkItems={data.requirementWorkItems}
                          structureConfirmed={!isShowingStructurePlan}
                          currentStep={isWorkflowActive ? currentWorkflowStep : null}
                          draftState={isWorkflowActive && currentWorkflowStep ? sectionDrafts[currentWorkflowStep.id] : undefined}
                          onMoveSection={onMoveSection!}
                          onToggleSection={onToggleSection!}
                          onAddAISection={handleAddAISectionAndOpen}
                          onAddCustomSection={handleAddCustomSectionAndOpen}
                          onRemoveCustomSection={onRemoveCustomSection!}
                          onConfirmStructure={handleConfirmStructureStep}
                          onGenerateDraft={() => {
                            if (currentWorkflowStep) {
                              void onGenerateSectionDraft?.({ step: currentWorkflowStep, force: true });
                            }
                          }}
                          onRefineDraft={async (actionId, workingDraft) => {
                            if (currentWorkflowStep) {
                              await onRefineSectionDraft?.(currentWorkflowStep, actionId, workingDraft);
                            }
                          }}
                          onApplyVariant={handleApplyWorkflowVariant}
                          onShowStructurePlan={handleShowStructurePlan}
                        />
                      </div>
                    ) : null
                  ) : null}
                </ResumeCoachPanel>
              }
              rightPanel={
                <div className="mx-auto max-w-[940px]">
                  {displayResume && (
                    <AnimatedCard index={0}>
                      <div className="resume-paper-shell overflow-hidden">
                        <ResumeDocumentCard resume={displayResume} requirementCatalog={data.gapAnalysis?.requirements ?? []} activeBullet={activeBullet} onBulletClick={canInteract ? handleBulletClick : undefined} sectionProgress={sectionProgress} />
                      </div>
                    </AnimatedCard>
                  )}
                  {isComplete && data.assembly && displayResume && (
                    <div className="mt-4">
                      <CollapsibleWorkspaceRail>
                        <ResumeWorkspaceRail displayResume={displayResume} companyName={data.jobIntelligence?.company_name} jobTitle={data.jobIntelligence?.role_title} atsScore={data.assembly.scores.ats_match} hiringManagerResult={hiringManagerResult ?? null} resolvedFinalReviewConcernIds={resolvedFinalReviewConcernIds} isFinalReviewStale={isFinalReviewStale} queueSummary={rewriteQueue?.summary ?? { total: 0, needsAttention: 0, partiallyAddressed: 0, resolved: 0, hardGapCount: 0, needsUserInput: 0, needsApproval: 0, handled: 0 }} nextQueueItemLabel={rewriteQueue?.nextItem?.title} jobUrl={jobUrl} sessionId={data.sessionId} accessToken={accessToken} />
                      </CollapsibleWorkspaceRail>
                    </div>
                  )}
                </div>
              }
            />
          </div>
        </>
      ) : canShowResumeDocument && !hasPassedReadyGate ? (
        /* Beat 2 — "Your Resume Is Ready" gate screen */
        <div className="mx-auto max-w-[980px] px-4 py-5 sm:px-6 sm:py-8">
          <ResumeReadyScreen
            keywordMatchPercent={keywordMatchPercent}
            beforeKeywordMatchPercent={data.preScores?.keyword_match_score ?? data.preScores?.ats_match ?? null}
            requirementCoveragePercent={jobBreakdown.coverage_score}
            benchmarkMatchPercent={benchmarkBreakdown.coverage_score}
            keywordsFound={keywordPhrasesFound}
            keywordsMissing={keywordPhrasesMissing}
            strengthSummary={data.gapAnalysis?.strength_summary ?? ''}
            flaggedBulletCount={attentionItems.length}
            actionSummaryLines={readyGateActionSummary}
            companyName={data.jobIntelligence?.company_name}
            roleTitle={data.jobIntelligence?.role_title}
            hasScoreData={hasKeywordReportData}
            primaryActionLabel={readyGatePrimaryActionLabel}
            requirementsAddressed={data.gapAnalysis?.score_breakdown?.job_description?.addressed}
            requirementsTotal={data.gapAnalysis?.score_breakdown?.job_description?.total}
            hasExecutiveSummary={Boolean(displayResume?.executive_summary?.content?.trim())}
            onStartEditing={handleReadyGateStartEditing}
          />
        </div>
      ) : (
        /* Processing layout (pipeline running, no resume yet) */
        <div className="mx-auto max-w-[720px] px-4 py-6 sm:px-6 sm:py-8">
          {/* Connection lost notice */}
          {!isComplete && !isConnected && data.stage !== 'intake' && (
            <div className="flex items-center gap-2 text-xs text-[var(--badge-amber-text)]/70 mb-4" role="status">
              <AlertCircle className="h-3 w-3" />
              Connection lost — waiting to reconnect...
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-[var(--badge-red-text)]/28 bg-[var(--badge-red-bg)] px-4 py-3 text-sm text-[var(--badge-red-text)]/90 mb-4" role="alert">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
              {onRetryPipeline && (
                <button
                  type="button"
                  onClick={onRetryPipeline}
                  className="mt-3 rounded-lg bg-white/10 hover:bg-white/20 px-4 py-2 text-sm font-medium text-white transition-colors"
                >
                  Retry Pipeline
                </button>
              )}
            </div>
          )}

          <PipelineProgressCard
            stage={data.stage}
            isComplete={isComplete}
            companyAndRole={data.jobIntelligence ? `${data.jobIntelligence.company_name} — ${data.jobIntelligence.role_title}` : null}
          />
        </div>
      )}
    </div>
  );
}

function getStageMessage(stage: V2Stage): string {
  switch (stage) {
    case 'intake': return 'Reading your background...';
    case 'analysis': return 'Reading the role, the benchmark, and the strongest proof already on your resume...';
    case 'strategy': return 'Building the requirement map and lining it up against the current resume...';
    case 'clarification': return 'Surfacing the missing proof, strongest nearby evidence, and the best questions to close the gaps...';
    case 'writing': return 'Improving one requirement at a time and drafting edits you can review inline...';
    case 'verification': return 'Running final review and checking tone, evidence, and accuracy...';
    case 'assembly': return 'Preparing the latest approved draft for export...';
    case 'complete': return 'Your polished resume is ready';
    default: return 'Working on it...';
  }
}

// ─── CollapsibleWorkspaceRail ─────────────────────────────────────────────────
// Wraps the ResumeWorkspaceRail in a collapsible section defaulting to closed.
// Shows only a thin "Export & Details" toggle bar when collapsed.

function CollapsibleWorkspaceRail({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mt-4 rounded-xl border border-[var(--line-soft)] overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-1)] transition-colors"
        aria-expanded={isOpen}
        aria-controls="workspace-rail-content"
      >
        <span className="font-medium tracking-wide uppercase">Export &amp; Details</span>
        {isOpen ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        )}
      </button>
      {isOpen && (
        <div id="workspace-rail-content">
          {children}
        </div>
      )}
    </div>
  );
}
