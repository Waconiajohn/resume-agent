/**
 * V2StreamingDisplay — Output display for the v2 pipeline
 *
 * Two layout modes:
 *   1. Processing mode — minimal status card while the role-specific resume is being built
 *   2. Resume mode — full-width centered document with inline editing
 */

import React, { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { Loader2, AlertCircle, Undo2, Redo2, ChevronDown, ChevronUp, ArrowRight, Download } from 'lucide-react';
import type { V2PipelineData, V2Stage, ResumeDraft, BulletConfidence, ClarificationMemoryEntry, FramingGuardrail, NextBestAction, ProofLevel, RequirementSource, ResumeReviewState } from '@/types/resume-v2';
import type { GapCoachingResponse, PreScores, GapCoachingCard as GapCoachingCardType } from '@/types/resume-v2';
import type { CoachingThreadSnapshot, FinalReviewChatContext, GapChatTargetInput, MasterPromotionItem, PostReviewPolishState, SuggestionScore, RewriteQueueItem } from '@/types/resume-v2';
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
import { ResumeStructurePlannerCard } from './cards/ResumeStructurePlannerCard';
import { ResumeSectionWorkflowPanel } from './workflow/ResumeSectionWorkflowPanel';
import { REVIEW_STATE_DISPLAY } from './utils/review-state-labels';
import { buildRewriteQueue } from '@/lib/rewrite-queue';
import { canonicalRequirementSignals } from '@/lib/resume-requirement-signals';
import { scrollToAndFocusTarget } from './useStrategyThread';
import { buildCustomSectionDraftSuggestions, buildCustomSectionPresetRecommendations, buildResumeSectionPlan, getEnabledResumeSectionPlan, getResumeCustomSectionMap } from '@/lib/resume-section-plan';
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
  finalReviewWarningsAcknowledged?: boolean;
  onAcknowledgeFinalReviewWarnings?: () => void;
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
  /** True when this bullet was AI-generated/enhanced (is_new on the source ResumeBullet). */
  isAIEnhanced?: boolean;
}

/** Look up the suggestion score for an active bullet from the rewrite queue. */
function findSuggestionScore(
  activeBullet: CoachTarget | null,
  queueItems: RewriteQueueItem[] | undefined,
): SuggestionScore | undefined {
  if (!activeBullet || !queueItems?.length) return undefined;
  const req = activeBullet.requirements[0];
  if (!req) return undefined;
  const normalizedReq = req.trim().toLowerCase();
  const match = queueItems.find(item =>
    item.requirement?.trim().toLowerCase() === normalizedReq
    || item.title.trim().toLowerCase() === normalizedReq
  );
  return match?.suggestionScore;
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

function truncatePreview(text: string, maxLength = 120): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
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

function GuidedNextStepCard({
  title,
  reason,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
  note,
}: {
  title: string;
  reason: string;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  note?: string;
}) {
  return (
    <div className="shell-panel px-3 py-3 sm:px-4 sm:py-4">
      <p className="eyebrow-label">Start Here</p>
      <h3 className="mt-2 text-base font-semibold text-[var(--text-strong)]">
        {title}
      </h3>
      <p className="mt-1.5 text-[13px] leading-5 text-[var(--text-soft)]">
        {reason}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onPrimaryAction}
          className="rounded-lg bg-[var(--link)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white transition-opacity hover:opacity-95"
        >
          {primaryActionLabel}
        </button>
        {secondaryActionLabel && onSecondaryAction && (
          <button
            type="button"
            onClick={onSecondaryAction}
            className="rounded-lg border border-[var(--line-soft)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)] transition-colors hover:bg-[var(--surface-0)] hover:text-[var(--text-strong)]"
          >
            {secondaryActionLabel}
          </button>
        )}
      </div>
      {note && (
        <p className="mt-3 text-[12px] leading-5 text-[var(--text-soft)]">
          {note}
        </p>
      )}
    </div>
  );
}


export function V2StreamingDisplay({
  data, isComplete, isConnected, error,
  editableResume, pendingEdit, isEditing, editError, undoCount, redoCount,
  onBulletEdit, onBulletRemove,
  onRequestEdit, onAcceptEdit, onRejectEdit, onUndo, onRedo,
  onAddContext, isRerunning,
  liveScores, isScoring,
  gapCoachingCards, onRespondGapCoaching, preScores, onIntegrateKeyword,
  previousResume, onDismissChanges,
  hiringManagerResult, resolvedFinalReviewConcernIds = [], isFinalReviewStale = false, finalReviewWarningsAcknowledged = false, onAcknowledgeFinalReviewWarnings,
  isHiringManagerLoading, hiringManagerError,
  onRequestHiringManagerReview, onApplyHiringManagerRecommendation,
  gapChat, gapChatSnapshot, buildChatContext,
  finalReviewChat, finalReviewChatSnapshot, buildFinalReviewChatContext, resolveFinalReviewTarget, onPreviewFinalReviewTarget, postReviewPolish,
  masterSaveMode = 'session_only',
  onChangeMasterSaveMode,
  onSaveCurrentToMaster,
  isSavingToMaster = false,
  masterSaveStatus,
  promotableMasterItems = [],
  selectedMasterPromotionIds = [],
  onToggleMasterPromotionItem,
  onSelectAllMasterPromotionItems,
  onClearMasterPromotionItems,
  onGapAssist,
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
    fullSectionPlan.filter((item) => item.recommended_for_job && item.enabled === false)
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
  const needsStructureStep = canShowStructurePlanner && !hasCompletedStructureStep;
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
    isAIEnhanced?: boolean,
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
        isAIEnhanced,
      };
    });
  }, []);

  const openAttentionItem = useCallback((index: number, options?: { autoReuseClarificationId?: string }) => {
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
  const justCompletedEditRef = useRef(false);

  const handleCoachApplyToResume = useCallback((section: string, index: number, newText: string, metadata?: OptimisticResumeEditMetadata) => {
    justCompletedEditRef.current = true;
    onBulletEdit?.(section, index, newText, metadata);
  }, [onBulletEdit]);
  const handleCoachRemoveBullet = useCallback((section: string, index: number) => {
    justCompletedEditRef.current = true;
    onBulletRemove?.(section, index);
  }, [onBulletRemove]);

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

  // Auto-advance: when the coaching panel closes after an edit (not the X button),
  // wait 500ms then activate the next unresolved item.
  const prevActiveBulletRef = useRef<CoachTarget | null>(null);
  useEffect(() => {
    const wasActive = prevActiveBulletRef.current !== null;
    const isNowNull = activeBullet === null;
    prevActiveBulletRef.current = activeBullet;

    if (!wasActive || !isNowNull) return;
    if (!justCompletedEditRef.current) return;
    justCompletedEditRef.current = false;

    const queueSummary = rewriteQueue?.summary;
    const hasItemsLeft = (queueSummary?.needsUserInput ?? 0) + (queueSummary?.needsApproval ?? 0) > 0;
    if (!hasItemsLeft) return;

    const timerId = window.setTimeout(() => {
      handleStartReviewing();
    }, 500);
    return () => window.clearTimeout(timerId);
  // handleStartReviewing is stable (useCallback) — include all referenced values
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBullet]);

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
  const readyGatePrimaryActionLabel = canShowStructurePlanner
    ? 'Review Sections First'
    : 'Start Editing My Resume';
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
  // Health score: use keyword match when available, fall back to requirement coverage
  const healthScore = useMemo(() => {
    if (typeof keywordMatchPercent === 'number') return keywordMatchPercent;
    const queueSummary = rewriteQueue?.summary;
    if (queueSummary && queueSummary.total > 0) {
      return Math.round((queueSummary.handled / queueSummary.total) * 100);
    }
    return null;
  }, [keywordMatchPercent, rewriteQueue?.summary]);

  // Activate the first non-resolved rewrite queue item (transitions Coach → Editor mode)
  const handleStartReviewing = useCallback(() => {
    const nextQueueItem = rewriteQueue?.nextItem;
    if (!nextQueueItem) return;

    // Try to find a matching section coach target by requirement
    const matchingTarget = sectionCoachTargets.find((target) =>
      target.requirements.some((req) =>
        req.toLowerCase().trim() === nextQueueItem.title.toLowerCase().trim(),
      ),
    );
    if (matchingTarget) {
      openSectionCoachTarget(matchingTarget);
      window.requestAnimationFrame(() => {
        scrollToAndFocusTarget(buildResumeLineSelector(matchingTarget.section, matchingTarget.index));
      });
      return;
    }

    // Fall back to the first attention item
    if (attentionItems.length > 0) {
      openAttentionItem(0);
    }
  }, [attentionItems, openAttentionItem, openSectionCoachTarget, rewriteQueue?.nextItem, sectionCoachTargets]);

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
                <div className="flex items-center gap-2 rounded-xl border border-[var(--badge-red-text)]/28 bg-[var(--badge-red-bg)] px-4 py-3 text-sm text-[var(--badge-red-text)]/90" role="alert">
                  <AlertCircle className="h-4 w-4 shrink-0" />{error}
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
                    <ResumeDocumentCard resume={displayResume} requirementCatalog={data.gapAnalysis?.requirements ?? []} activeBullet={activeBullet} onBulletClick={canInteract ? handleBulletClick : undefined} onBulletEdit={canInteract ? onBulletEdit : undefined} onBulletRemove={canInteract ? onBulletRemove : undefined} />
                  </div>
                </AnimatedCard>
              )}
              {activeBullet && gapChat && buildChatContext && (
                <BulletCoachingPanel bulletText={activeBullet.bulletText} section={activeBullet.section} bulletIndex={activeBullet.index} requirements={activeBullet.requirements} reviewState={activeBullet.reviewState} requirementSource={activeBullet.requirementSource} evidenceFound={activeBullet.evidenceFound} sourceEvidence={activeBullet.sourceEvidence} proofLevel={activeBullet.proofLevel} framingGuardrail={activeBullet.framingGuardrail} nextBestAction={activeBullet.nextBestAction} canRemove={activeBullet.canRemove ?? true} initialReuseClarificationId={activeBullet.autoReuseClarificationId} isAIEnhanced={activeBullet.isAIEnhanced} suggestionScore={findSuggestionScore(activeBullet, rewriteQueue?.items)} gapChat={gapChat} chatContext={buildChatContext({ requirement: activeBullet.requirements[0], requirements: activeBullet.requirements, lineText: activeBullet.bulletText, section: activeBullet.section, index: activeBullet.index, reviewState: activeBullet.reviewState, evidenceFound: activeBullet.evidenceFound, workItemId: activeBullet.workItemId })} onApplyToResume={handleCoachApplyToResume} onRemoveBullet={handleCoachRemoveBullet} onClose={() => setActiveBullet(null)} onBulletEnhance={onBulletEnhance} />
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
                  <ResumeWorkspaceRail displayResume={displayResume} companyName={data.jobIntelligence?.company_name} jobTitle={data.jobIntelligence?.role_title} atsScore={data.assembly.scores.ats_match} hiringManagerResult={hiringManagerResult ?? null} resolvedFinalReviewConcernIds={resolvedFinalReviewConcernIds} isFinalReviewStale={isFinalReviewStale} queueSummary={rewriteQueue?.summary ?? { total: 0, needsAttention: 0, partiallyAddressed: 0, resolved: 0, hardGapCount: 0, needsUserInput: 0, needsApproval: 0, handled: 0 }} nextQueueItemLabel={rewriteQueue?.nextItem?.title} finalReviewWarningsAcknowledged={finalReviewWarningsAcknowledged} onAcknowledgeFinalReviewWarnings={onAcknowledgeFinalReviewWarnings} jobUrl={jobUrl} sessionId={data.sessionId} accessToken={accessToken} />
                </CollapsibleWorkspaceRail>
              )}
            </div>
          </div>

          {/* ── Desktop: two-panel layout ── */}
          <div className="hidden h-full px-4 py-4 lg:flex xl:px-5 xl:py-5">
            <ResumeEditorLayout
              leftPanel={(() => {
                const queueSummary = rewriteQueue?.summary ?? null;
                // 3-mode panel applies only in the editing phase (past structure step, no active section workflow step, no active bullet)
                const isInEditingPhase = hasCompletedStructureStep && !isShowingStructurePlan && !isWorkflowActive && !activeBullet && !showDesktopFinalReview;
                const isReviewerMode = isInEditingPhase && queueSummary !== null && queueSummary.needsUserInput === 0 && queueSummary.needsApproval <= 2;
                const isCoachMode = isInEditingPhase && !isReviewerMode;

                const headerTitle = activeBullet
                  ? activeBullet.locationLabel
                  : showDesktopFinalReview
                    ? 'Final review'
                  : isShowingStructurePlan
                    ? 'Section plan'
                    : isWorkflowActive && currentWorkflowStep
                      ? currentWorkflowStep.title
                      : isReviewerMode
                        ? 'Ready to Export'
                      : isCoachMode
                        ? 'Resume Coach'
                        : 'Review the final draft';
                const headerSummary = activeBullet
                  ? 'Use the suggestions below, apply the one that feels true, and then move on.'
                  : showDesktopFinalReview
                    ? 'Review the strongest hiring-manager concerns before you export or keep polishing lines.'
                  : isShowingStructurePlan
                    ? 'Choose the sections and order before you polish the wording. When the structure looks right, start at the top and work down the resume.'
                    : isWorkflowActive && currentWorkflowStep
                      ? 'Review the full section draft, choose the version that feels right, and then move to the next section.'
                      : isReviewerMode
                        ? "You've addressed the key items."
                      : isCoachMode
                        ? 'Click any highlighted item or use the button below to begin.'
                        : 'Use final review when the draft already looks right and you want one last hiring-manager check before export.';

                return (
                  <div className="flex flex-col h-full">
                    <div className="shrink-0 border-b border-[var(--line-soft)] px-4 py-4">
                      <div className="space-y-3">
                        <p className="eyebrow-label">Resume Coach</p>
                        <h2 className="text-base font-semibold text-[var(--text-strong)]">
                          {headerTitle}
                        </h2>
                        <p className="text-sm leading-6 text-[var(--text-soft)]">
                          {headerSummary}
                        </p>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-3 py-3">
                      {(error || editError) && (
                        <div className="flex items-center gap-2 rounded-xl border border-[var(--badge-red-text)]/28 bg-[var(--badge-red-bg)] px-4 py-3 text-sm text-[var(--badge-red-text)]/90 mb-3" role="alert">
                          <AlertCircle className="h-4 w-4 shrink-0" />{error ?? editError}
                        </div>
                      )}
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
                        <div ref={coachingPanelRef}>
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
                            isAIEnhanced={activeBullet.isAIEnhanced}
                            suggestionScore={findSuggestionScore(activeBullet, rewriteQueue?.items)}
                            gapChat={gapChat}
                            chatContext={buildChatContext({ requirement: activeBullet.requirements[0], requirements: activeBullet.requirements, lineText: activeBullet.bulletText, section: activeBullet.section, index: activeBullet.index, reviewState: activeBullet.reviewState, evidenceFound: activeBullet.evidenceFound, workItemId: activeBullet.workItemId })}
                            onApplyToResume={handleCoachApplyToResume}
                            onRemoveBullet={handleCoachRemoveBullet}
                            onClose={() => setActiveBullet(null)}
                            onBulletEnhance={onBulletEnhance}
                          />
                        </div>
                      ) : isCoachMode ? (
                        /* ── State 2: WAITING — entry state ── */
                        <div className="flex flex-col h-full">
                          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
                            {typeof healthScore === 'number' ? (
                              <>
                                <div className="text-4xl font-bold text-[var(--text-strong)] mb-1">{healthScore}%</div>
                                <div className="text-sm text-[var(--text-soft)] mb-6">Resume Health</div>
                                <div className="w-full max-w-[200px] h-2 bg-[var(--surface-1)] rounded-full mb-8">
                                  <div
                                    className="h-2 rounded-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500"
                                    style={{ width: `${healthScore}%` }}
                                  />
                                </div>
                              </>
                            ) : (
                              <div className="mb-8" />
                            )}

                            <p className="text-[var(--text-soft)] text-sm mb-6 leading-relaxed">
                              Click any highlighted item on your resume to start editing.
                            </p>

                            {queueSummary && (
                              <div className="space-y-2 text-sm w-full max-w-[240px] mb-8">
                                {queueSummary.needsUserInput > 0 && (
                                  <div className="flex items-center gap-2 text-[var(--text-soft)]">
                                    <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                                    <span>{queueSummary.needsUserInput} item{queueSummary.needsUserInput === 1 ? '' : 's'} need your input</span>
                                  </div>
                                )}
                                {queueSummary.needsApproval > 0 && (
                                  <div className="flex items-center gap-2 text-[var(--text-soft)]">
                                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                                    <span>{queueSummary.needsApproval} item{queueSummary.needsApproval === 1 ? '' : 's'} want your approval</span>
                                  </div>
                                )}
                                <div className="flex items-center gap-2 text-[var(--text-soft)]">
                                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                                  <span>{queueSummary.handled} item{queueSummary.handled === 1 ? '' : 's'} handled</span>
                                </div>
                              </div>
                            )}

                            {(queueSummary?.needsUserInput ?? 0) + (queueSummary?.needsApproval ?? 0) > 0 && (
                              <button
                                type="button"
                                onClick={handleStartReviewing}
                                className="w-full max-w-[240px] py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors"
                              >
                                Review Next Item →
                              </button>
                            )}
                          </div>

                          <div className="shrink-0 px-6 py-4 border-t border-[var(--line-soft)]">
                            <button
                              type="button"
                              onClick={handleShowStructurePlan}
                              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-soft)] transition-colors"
                            >
                              Adjust section structure
                            </button>
                          </div>
                        </div>
                      ) : isReviewerMode ? (
                        /* ── Reviewer Mode: all critical items addressed ── */
                        <div className="space-y-6 py-2">
                          {typeof healthScore === 'number' && (
                            <div className="text-center">
                              <div className="text-5xl font-bold text-[var(--text-strong)]">{healthScore}%</div>
                              <div className="text-sm text-[var(--text-soft)] mt-1">Resume health</div>
                              <div className="h-1.5 bg-[var(--surface-1)] rounded-full mt-3 overflow-hidden">
                                <div
                                  className="h-1.5 bg-green-500 rounded-full transition-all duration-500"
                                  style={{ width: `${healthScore}%` }}
                                />
                              </div>
                            </div>
                          )}
                          {displayResume && (
                            <div className="space-y-2">
                              <button
                                type="button"
                                onClick={() => {
                                  // Trigger DOCX download via ExportBar if available, otherwise open the workspace rail
                                  const docxBtn = document.querySelector<HTMLButtonElement>('[data-export-docx]');
                                  docxBtn?.click();
                                }}
                                className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 transition-colors"
                              >
                                <Download className="h-4 w-4" />
                                Download DOCX
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const pdfBtn = document.querySelector<HTMLButtonElement>('[data-export-pdf]');
                                  pdfBtn?.click();
                                }}
                                className="w-full flex items-center justify-center gap-2 rounded-lg border border-[var(--line-soft)] px-4 py-2.5 text-sm font-medium text-[var(--text-strong)] hover:bg-[var(--surface-1)] transition-colors"
                              >
                                <Download className="h-4 w-4" />
                                Download PDF
                              </button>
                            </div>
                          )}
                          {queueSummary && queueSummary.needsApproval > 0 && (
                            <p className="text-sm text-[var(--text-soft)]">
                              {queueSummary.needsApproval} more item{queueSummary.needsApproval === 1 ? '' : 's'} could push it higher.{' '}
                              <button
                                type="button"
                                onClick={handleStartReviewing}
                                className="text-blue-400 hover:text-blue-300 underline-offset-2 hover:underline transition-colors"
                              >
                                Keep going
                              </button>
                            </p>
                          )}
                          {canShowStructurePlanner && (
                            <button
                              type="button"
                              onClick={handleShowStructurePlan}
                              className="w-full rounded-lg border border-[var(--line-soft)] px-4 py-2 text-sm text-[var(--text-soft)] hover:text-[var(--text-strong)] hover:bg-[var(--surface-1)] transition-colors"
                            >
                              Review section structure
                            </button>
                          )}
                        </div>
                      ) : (
                        /* ── Default: section plan / section draft steps ── */
                        <div className="space-y-4">
                          {displayResume && (
                            <div ref={structurePlannerRef}>
                              <ResumeSectionWorkflowPanel
                                resume={displayResume}
                                workflow={sectionWorkflow}
                                candidateIntelligence={data.candidateIntelligence}
                                requirementWorkItems={data.requirementWorkItems}
                                structureConfirmed={!isShowingStructurePlan}
                                currentStep={currentWorkflowStep}
                                draftState={currentWorkflowStep ? sectionDrafts[currentWorkflowStep.id] : undefined}
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
                          {!displayResume && isComplete && (
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
                          )}
                          {isComplete && data.assembly && displayResume && (
                            <CollapsibleWorkspaceRail>
                              <ResumeWorkspaceRail
                                displayResume={displayResume}
                                companyName={data.jobIntelligence?.company_name}
                                jobTitle={data.jobIntelligence?.role_title}
                                atsScore={data.assembly.scores.ats_match}
                                hiringManagerResult={hiringManagerResult ?? null}
                                resolvedFinalReviewConcernIds={resolvedFinalReviewConcernIds}
                                isFinalReviewStale={isFinalReviewStale}
                                queueSummary={rewriteQueue?.summary ?? { total: 0, needsAttention: 0, partiallyAddressed: 0, resolved: 0, hardGapCount: 0, needsUserInput: 0, needsApproval: 0, handled: 0 }}
                                nextQueueItemLabel={rewriteQueue?.nextItem?.title}
                                finalReviewWarningsAcknowledged={finalReviewWarningsAcknowledged}
                                onAcknowledgeFinalReviewWarnings={onAcknowledgeFinalReviewWarnings}
                                jobUrl={jobUrl}
                                sessionId={data.sessionId}
                                accessToken={accessToken}
                              />
                            </CollapsibleWorkspaceRail>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
              rightPanel={
                <div className="mx-auto max-w-[940px]">
                  {displayResume && (
                    <AnimatedCard index={0}>
                      <div className="resume-paper-shell overflow-hidden">
                        <ResumeDocumentCard resume={displayResume} requirementCatalog={data.gapAnalysis?.requirements ?? []} activeBullet={activeBullet} onBulletClick={canInteract ? handleBulletClick : undefined} onBulletEdit={canInteract ? onBulletEdit : undefined} onBulletRemove={canInteract ? onBulletRemove : undefined} />
                      </div>
                    </AnimatedCard>
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
            <div className="flex items-center gap-2 rounded-xl border border-[var(--badge-red-text)]/28 bg-[var(--badge-red-bg)] px-4 py-3 text-sm text-[var(--badge-red-text)]/90 mb-4" role="alert">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
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
