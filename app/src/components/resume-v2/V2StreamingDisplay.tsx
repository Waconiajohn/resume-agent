/**
 * V2StreamingDisplay — Output display for the v2 pipeline
 *
 * Two layout modes:
 *   1. Processing mode — minimal status card while the tailored resume is being built
 *   2. Resume mode — full-width centered document with inline editing
 */

import React, { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { Loader2, AlertCircle, Undo2, Redo2, ChevronDown, ChevronUp } from 'lucide-react';
import type { V2PipelineData, V2Stage, ResumeDraft, BulletConfidence, ClarificationMemoryEntry, FramingGuardrail, NextBestAction, ProofLevel, RequirementSource, ResumeReviewState } from '@/types/resume-v2';
import type { GapCoachingResponse, PreScores, GapCoachingCard as GapCoachingCardType } from '@/types/resume-v2';
import type { CoachingThreadSnapshot, FinalReviewChatContext, GapChatTargetInput, MasterPromotionItem, PostReviewPolishState } from '@/types/resume-v2';
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
import { REVIEW_STATE_DISPLAY } from './utils/review-state-labels';
import { buildRewriteQueue } from '@/lib/rewrite-queue';
import { canonicalRequirementSignals } from '@/lib/resume-requirement-signals';
import { scrollToAndFocusTarget } from './useStrategyThread';
import { buildCustomSectionPresetRecommendations, buildResumeSectionPlan, getEnabledResumeSectionPlan, getResumeCustomSectionMap } from '@/lib/resume-section-plan';
import type { OptimisticResumeEditMetadata } from '@/lib/resume-edit-progress';
import type { ResumeCustomSectionPresetId } from '@/lib/resume-section-plan';

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

interface GuidedStartStep {
  id: string;
  label: string;
  title: string;
  description: string;
  actionLabel: string;
  onSelect: () => void;
}

interface ClarificationCue {
  id: string;
  requirement: string;
  question: string;
  affectedCount: number;
  targetIndex: number | null;
}

interface RememberedEvidenceCue {
  id: string;
  topic: string;
  answer: string;
  primaryFamily?: string | null;
  affectedCount: number;
  targetIndex: number | null;
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

function summarizeEvidencePreview(text: string | undefined): string {
  const trimmed = text?.trim();
  if (!trimmed) return 'We still need stronger proof from the resume or interview.';
  return truncatePreview(trimmed, 140);
}

function describeMissingPlain(args: {
  nextBestAction?: NextBestAction;
  reviewState: ResumeReviewState;
}): string {
  const { nextBestAction, reviewState } = args;
  switch (nextBestAction) {
    case 'answer':
      return 'One concrete detail, example, or number before this line is safe to keep.';
    case 'quantify':
      return 'A metric, budget, team size, timeline, or business result.';
    case 'confirm':
      return 'A safer version of the claim unless the strongest wording is definitely true.';
    case 'tighten':
      return 'A cleaner, sharper connection to what the job is asking for.';
    case 'accept':
      return 'Nothing major. This line may already be okay.';
    case 'remove':
      return 'A truthful reason to keep this line. If not, it should come out.';
    default:
      break;
  }

  if (reviewState === 'code_red') return 'A real proof point before this line is safe.';
  if (reviewState === 'confirm_fit') return 'A safer way to phrase the claim.';
  if (reviewState === 'strengthen') return 'A clearer scope marker, impact statement, or stronger wording.';
  return 'A quick polish pass.';
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

  const summaryText = resume.executive_summary.content.trim();
  if (summaryText) {
    const rankedItems = rankWorkItems('executive_summary', 'Executive Summary', summaryText);
    const primaryGuidance = derivePrimaryGuidance(rankedItems, summaryText, 'summary');
    const relatedRequirements = rankedItems.slice(0, 3).map(({ item }) => item.requirement);
    const sectionPlanItem = planById.get('executive_summary');
    targets.push({
      id: 'executive_summary',
      label: 'Executive Summary',
      helperText: relatedRequirements.length > 0
        ? `${sectionPlanItem?.rationale ?? 'Lead with identity and fit.'} Bring forward ${formatRequirementFocus(relatedRequirements)} so the opening story maps faster to the role. ${primaryGuidance.nextMoveText}`
        : `${sectionPlanItem?.rationale ?? 'Tighten the first impression and opening story.'} ${primaryGuidance.nextMoveText}`,
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

  const customSections = getResumeCustomSectionMap(resume);
  const customTargets: Array<{ target: SectionCoachTarget; score: number }> = [];
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
      target: {
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
      },
      score: (rankedItems[0]?.score ?? 0) + (planById.get(sectionId)?.recommended_for_job ? 0.25 : 0),
    });
  }

  customTargets
    .sort((left, right) => right.score - left.score || left.target.label.localeCompare(right.target.label))
    .slice(0, 2)
    .forEach(({ target }) => targets.push(target));

  return targets.slice(0, 4);
}

function buildClarificationCues(
  workItems: NonNullable<V2PipelineData['requirementWorkItems']>,
  attentionItems: AttentionReviewItem[],
  clarificationMemory: ClarificationMemoryEntry[],
): ClarificationCue[] {
  return workItems
    .filter((item) => item.next_best_action === 'answer' && item.clarifying_question?.trim())
    .map((item) => {
      const normalizedRequirement = normalizeCueKey(item.requirement);
      const matches = attentionItems.filter((attentionItem) => (
        (item.id && attentionItem.workItemId === item.id)
          || attentionItem.requirements.some((requirement) => normalizeCueKey(requirement) === normalizedRequirement)
      ));

      return {
        id: item.id,
        requirement: item.requirement,
        question: item.clarifying_question!.trim(),
        affectedCount: matches.length,
        targetIndex: matches.length > 0
          ? attentionItems.findIndex((candidate) => candidate.id === matches[0].id)
          : null,
      } satisfies ClarificationCue;
    })
    .filter((cue) => {
      const relatedItem = workItems.find((item) => item.id === cue.id);
      return !clarificationMemory.some((entry) => {
        const requirementHit = overlapScore(entry.topic, cue.requirement) >= 0.35;
        const answerHit = relatedItem
          ? (
              overlapScore(entry.userInput, relatedItem.requirement) >= 0.24
              || (relatedItem.best_evidence_excerpt ? overlapScore(entry.userInput, relatedItem.best_evidence_excerpt) >= 0.24 : false)
              || relatedItem.candidate_evidence.some((evidence) => overlapScore(entry.userInput, evidence.text) >= 0.24)
            )
          : false;
        return requirementHit || answerHit;
      });
    })
    .sort((left, right) => right.affectedCount - left.affectedCount || left.requirement.localeCompare(right.requirement))
    .slice(0, 3);
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

function buildRememberedEvidenceCues(
  clarificationMemory: ClarificationMemoryEntry[],
  attentionItems: AttentionReviewItem[],
): RememberedEvidenceCue[] {
  return clarificationMemory
    .map((entry) => {
      const matches = attentionItems.filter((item) => clarificationMatchesAttentionItem(entry, item));

      return {
        id: entry.id,
        topic: entry.topic,
        answer: entry.userInput,
        primaryFamily: entry.primaryFamily,
        affectedCount: matches.length,
        targetIndex: matches.length > 0
          ? attentionItems.findIndex((candidate) => candidate.id === matches[0].id)
          : null,
      } satisfies RememberedEvidenceCue;
    })
    .filter((cue) => cue.affectedCount > 0)
    .sort((left, right) => right.affectedCount - left.affectedCount || left.topic.localeCompare(right.topic))
    .slice(0, 3);
}

function buildResumeLineSelector(section: string, index: number): string {
  return `[data-resume-line="${section}:${index}"]`;
}

function SectionCoachCard({
  targets,
  onOpenTarget,
}: {
  targets: SectionCoachTarget[];
  onOpenTarget: (target: SectionCoachTarget) => void;
}) {
  if (targets.length === 0) return null;

  return (
    <div className="guide-support-panel px-3 py-3 sm:px-4 sm:py-4">
      <p className="eyebrow-label">Polish Next</p>
      <h3 className="mt-2 text-base font-semibold text-[var(--text-strong)]">Tighten the sections recruiters notice first</h3>
      <p className="mt-1.5 text-[13px] leading-5 text-[var(--text-soft)]">
        Once the structure feels right, these sections give you the fastest visible improvement.
      </p>
      <div className="mt-3 space-y-2 sm:mt-4">
        {targets.map((target) => (
          <button
            key={target.id}
            type="button"
            onClick={() => onOpenTarget(target)}
            className="block w-full rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2.5 text-left hover:bg-[var(--surface-0)] transition-colors sm:px-3.5 sm:py-3"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
              {target.label}
            </p>
            <p className="mt-1 text-sm font-medium leading-relaxed text-[var(--text-strong)]">
              {target.bulletText}
            </p>
            <p className="mt-2 text-xs leading-5 text-[var(--text-soft)]">
              {target.helperText}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

function ClarificationCueCard({
  cues,
  onOpenCue,
}: {
  cues: ClarificationCue[];
  onOpenCue: (cue: ClarificationCue) => void;
}) {
  if (cues.length === 0) return null;

  return (
    <div className="guide-support-panel px-3 py-3 sm:px-4 sm:py-4">
      <p className="eyebrow-label">One Good Answer</p>
      <h3 className="mt-2 text-base font-semibold text-[var(--text-strong)]">A single detail could strengthen multiple lines</h3>
      <p className="mt-1.5 text-[13px] leading-5 text-[var(--text-soft)]">
        These are the only details we still need. If you already answered one elsewhere, reuse it instead of starting from scratch.
      </p>
      <div className="mt-3 space-y-2 sm:mt-4">
        {cues.map((cue) => (
          <button
            key={cue.id}
            type="button"
            onClick={() => onOpenCue(cue)}
            className="block w-full rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2.5 text-left hover:bg-[var(--surface-0)] transition-colors sm:px-3.5 sm:py-3"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
              {cue.affectedCount > 0
                ? `Could strengthen ${cue.affectedCount} ${cue.affectedCount === 1 ? 'line' : 'lines'}`
                : cue.requirement}
            </p>
            <p className="mt-1 text-sm font-medium leading-relaxed text-[var(--text-strong)]">
              {cue.question}
            </p>
            <p className="mt-2 text-xs leading-5 text-[var(--text-soft)]">
              {cue.requirement}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

function RememberedEvidenceCard({
  cues,
  onOpenCue,
}: {
  cues: RememberedEvidenceCue[];
  onOpenCue: (cue: RememberedEvidenceCue) => void;
}) {
  if (cues.length === 0) return null;

  return (
    <div className="guide-support-panel px-3 py-3 sm:px-4 sm:py-4">
      <p className="eyebrow-label">Use What We Know</p>
      <h3 className="mt-2 text-base font-semibold text-[var(--text-strong)]">Start with proof you already confirmed</h3>
      <p className="mt-1.5 text-[13px] leading-5 text-[var(--text-soft)]">
        These details are already trustworthy. Reuse them before giving the app anything new.
      </p>
      <div className="mt-3 space-y-2 sm:mt-4">
        {cues.map((cue) => {
          const content = (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
                {cue.affectedCount > 0
                  ? `Could strengthen ${cue.affectedCount} ${cue.affectedCount === 1 ? 'line' : 'lines'}`
                  : cue.topic}
              </p>
              <p className="mt-1 text-sm font-medium leading-relaxed text-[var(--text-strong)]">
                {cue.topic}
                {cue.primaryFamily ? ` • ${cue.primaryFamily}` : ''}
              </p>
              <p className="mt-2 text-xs leading-5 text-[var(--text-soft)]">
                {cue.answer}
              </p>
            </>
          );

          if (cue.targetIndex === null) {
            return (
              <div
                key={cue.id}
                className="rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2.5 sm:px-3.5 sm:py-3"
              >
                {content}
              </div>
            );
          }

          return (
            <button
              key={cue.id}
              type="button"
              onClick={() => onOpenCue(cue)}
              className="block w-full rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2.5 text-left hover:bg-[var(--surface-0)] transition-colors sm:px-3.5 sm:py-3"
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GuidedStartCard({
  steps,
}: {
  steps: GuidedStartStep[];
}) {
  if (steps.length === 0) return null;

  return (
    <div className="shell-panel px-3 py-3 sm:px-4 sm:py-4">
      <p className="eyebrow-label">Start Here</p>
      <h3 className="mt-2 text-base font-semibold text-[var(--text-strong)]">Do this first</h3>
      <p className="mt-1.5 text-[13px] leading-5 text-[var(--text-soft)]">
        Start with the first move. Once that is done, the next step will be easier and more obvious.
      </p>
      <div className="mt-3 space-y-2 sm:mt-4">
        {steps.length > 0 && (
          <button
            type="button"
            onClick={steps[0].onSelect}
            className="block w-full rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-3 text-left hover:bg-[var(--surface-0)] transition-colors sm:px-4"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
              First move · {steps[0].label}
            </p>
            <p className="mt-1 text-sm font-medium leading-relaxed text-[var(--text-strong)]">
              {steps[0].title}
            </p>
            <p className="mt-2 text-xs leading-5 text-[var(--text-soft)]">
              {steps[0].description}
            </p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--link)]">
              {steps[0].actionLabel}
            </p>
          </button>
        )}
        {steps.length > 1 && (
          <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-3 sm:px-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
              After that
            </p>
            <div className="mt-2 space-y-2">
              {steps.slice(1).map((step) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={step.onSelect}
                  className="flex w-full items-start justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[var(--surface-0)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
                      {step.label}
                    </p>
                    <p className="mt-1 text-sm font-medium leading-relaxed text-[var(--text-strong)]">
                      {step.title}
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--link)]">
                    {step.actionLabel}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MobileResumeScoreSummary({
  resumeScore,
  nextAction,
  flaggedCount,
  onToggleFullReport,
  isExpanded,
}: {
  resumeScore: number;
  nextAction: string;
  flaggedCount: number;
  onToggleFullReport: () => void;
  isExpanded: boolean;
}) {
  return (
    <div className="shell-panel px-3 py-3 sm:px-4 sm:py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow-label">Resume Score</p>
          <div className="mt-2 flex items-end gap-3">
            <span className="text-[2rem] font-semibold leading-none text-[var(--text-strong)]">
              {resumeScore}%
            </span>
            <span className="rounded-full border border-[var(--line-soft)] bg-[var(--surface-0)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
              {flaggedCount > 0 ? `${flaggedCount} lines still need review` : 'Ready for final review'}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleFullReport}
          className="rounded-lg border border-[var(--line-soft)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)] transition-colors hover:bg-[var(--surface-0)] hover:text-[var(--text-strong)]"
        >
          {isExpanded ? 'Hide Full Report' : 'Full Scoring Report'}
        </button>
      </div>
      <div className="mt-3 rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
          Do this next
        </p>
        <p className="mt-1.5 text-sm leading-6 text-[var(--text-muted)]">
          {nextAction}
        </p>
      </div>
    </div>
  );
}

function AttentionReviewStrip({
  items,
  currentIndex,
  nextActionCue,
  onOpenCurrent,
  onNext,
  onPrevious,
}: {
  items: AttentionReviewItem[];
  currentIndex: number;
  nextActionCue?: string;
  onOpenCurrent: () => void;
  onNext: () => void;
  onPrevious: () => void;
}) {
  const current = items[currentIndex];
  if (!current) return null;

  return (
    <div
      data-testid="attention-review-strip"
      className="rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)]/90 px-4 py-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-soft)]">
            Review Attention Lines
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {items.length} {items.length === 1 ? 'line still needs attention.' : 'lines still need attention.'} Click a bullet on the resume to review it here.
          </p>
          {nextActionCue && (
            <p className="mt-2 text-xs text-[var(--text-soft)]">
              Next best action: {nextActionCue}
            </p>
          )}
        </div>
        <div className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-0)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
          {currentIndex + 1} of {items.length}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className={current.statusClassName}>
            {current.statusLabel}
          </span>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
            {current.locationLabel}
          </p>
          <p data-testid="attention-review-current-text" className="mt-2 text-sm leading-relaxed text-[var(--text-strong)]">
            {current.text}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrevious}
            className="rounded-md border border-[var(--line-soft)] px-3 py-1.5 text-xs font-medium text-[var(--text-soft)] hover:bg-[var(--surface-0)] hover:text-[var(--text-strong)] transition-colors"
          >
            Previous Line
          </button>
          <button
            type="button"
            onClick={onNext}
            className="rounded-md border border-[var(--line-soft)] px-3 py-1.5 text-xs font-medium text-[var(--text-soft)] hover:bg-[var(--surface-0)] hover:text-[var(--text-strong)] transition-colors"
          >
            Next Line
          </button>
          <button
            type="button"
            onClick={onOpenCurrent}
            className="rounded-md bg-[var(--accent-muted)] px-3 py-1.5 text-xs font-semibold text-[var(--text-strong)] hover:bg-[var(--surface-0)] transition-colors"
          >
            Jump to bullet
          </button>
        </div>
      </div>
    </div>
  );
}

function DesktopPriorityLineCard({
  item,
  index,
  total,
  onOpen,
  onNext,
}: {
  item: AttentionReviewItem;
  index: number;
  total: number;
  onOpen: () => void;
  onNext: () => void;
}) {
  const primaryRequirement = item.requirements[0] ?? 'Strengthen this line for the job';
  const missingSummary = describeMissingPlain({
    nextBestAction: item.nextBestAction,
    reviewState: item.reviewState,
  });
  const recommendation = describeRecommendationPlain(item);

  return (
    <div className="resume-guide-queue-card">
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--text-soft)]">
        Start here
      </p>
      <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--text-strong)]">
        {primaryRequirement}
      </p>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
        Where this shows up
      </p>
      <p className="mt-1 text-sm leading-relaxed text-[var(--text-strong)]">
        {item.locationLabel}
      </p>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
        What I found already
      </p>
      <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
        {summarizeEvidencePreview(item.evidenceFound || item.text)}
      </p>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
        What is still missing
      </p>
      <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
        {missingSummary}
      </p>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
        What I recommend
      </p>
      <p className="mt-1 text-sm leading-relaxed text-[var(--text-strong)]">
        {recommendation}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="rounded-lg bg-[var(--accent-muted)] px-3.5 py-2 text-xs font-semibold text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-0)]"
        >
          Work on this line
        </button>
        {total > 1 && (
          <button
            type="button"
            onClick={onNext}
            className="rounded-lg border border-[var(--line-soft)] px-3.5 py-2 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-0)] hover:text-[var(--text-strong)]"
          >
            Show another line
          </button>
        )}
      </div>
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
}: V2StreamingDisplayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const coachingPanelRef = useRef<HTMLDivElement | null>(null);
  const structurePlannerRef = useRef<HTMLDivElement | null>(null);

  // Active bullet for inline editing
  const [activeBullet, setActiveBullet] = useState<{
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
    canRemove?: boolean;
    autoReuseClarificationId?: string;
  } | null>(initialActiveBullet ? { ...initialActiveBullet, bulletText: '', reviewState: 'supported' as ResumeReviewState, evidenceFound: '' } : null);
  const [showDesktopScoringDetails, setShowDesktopScoringDetails] = useState(false);

  useEffect(() => {
    setActiveBullet(initialActiveBullet ? { ...initialActiveBullet, bulletText: '', reviewState: 'supported' as ResumeReviewState, evidenceFound: '' } : null);
  }, [initialActiveBullet]);

  const displayResume = editableResume ?? data.assembly?.final_resume ?? data.resumeDraft;
  const hasResume = displayResume !== null && displayResume !== undefined;
  const baselineResume = data.assembly?.final_resume ?? data.resumeDraft ?? null;
  const attentionItems = useMemo(() => (
    displayResume ? buildAttentionReviewItems(displayResume, baselineResume) : []
  ), [baselineResume, displayResume]);
  const clarificationCues = useMemo(() => (
    buildClarificationCues(
      (data.requirementWorkItems ?? data.gapAnalysis?.requirement_work_items ?? []),
      attentionItems,
      clarificationMemory,
    )
  ), [attentionItems, clarificationMemory, data.gapAnalysis?.requirement_work_items, data.requirementWorkItems]);
  const rememberedEvidenceCues = useMemo(() => (
    buildRememberedEvidenceCues(clarificationMemory, attentionItems)
  ), [attentionItems, clarificationMemory]);
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
  const [attentionIndex, setAttentionIndex] = useState(0);
  const currentDesktopPriorityItem = attentionItems[attentionIndex] ?? null;

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
        canRemove,
      };
    });
  }, []);

  const openAttentionItem = useCallback((index: number, options?: { autoReuseClarificationId?: string }) => {
    const item = attentionItems[index];
    if (!item) return;
    setAttentionIndex(index);
    setActiveBullet({
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
      autoReuseClarificationId: options?.autoReuseClarificationId,
    });
    window.requestAnimationFrame(() => {
      scrollToAndFocusTarget(buildResumeLineSelector(item.section, item.index));
    });
  }, [attentionItems]);

  const openSectionCoachTarget = useCallback((target: SectionCoachTarget) => {
    setActiveBullet({
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

  const openClarificationCue = useCallback((cue: ClarificationCue) => {
    if (cue.targetIndex !== null && cue.targetIndex >= 0) {
      openAttentionItem(cue.targetIndex);
      return;
    }
    if (attentionItems.length > 0) {
      openAttentionItem(0);
    }
  }, [attentionItems.length, openAttentionItem]);

  const focusStructurePlanner = useCallback(() => {
    structurePlannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  // Clear activeBullet after accepting an edit (inline panel should close)
  const handleAcceptEdit = useCallback((editedText: string) => {
    onAcceptEdit(editedText);
    setActiveBullet(null);
  }, [onAcceptEdit]);

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

  useEffect(() => {
    if (attentionIndex < attentionItems.length) return;
    setAttentionIndex(0);
  }, [attentionIndex, attentionItems.length]);

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
  const [showMobileFullScoringReport, setShowMobileFullScoringReport] = useState(false);

  // Reset gate when re-running
  useEffect(() => {
    if (isRerunning) {
      setHasPassedReadyGate(false);
      setShowMobileFullScoringReport(false);
    }
  }, [isRerunning]);
  useEffect(() => {
    if (activeBullet && hasPassedReadyGate && coachingPanelRef.current) {
      scrollToAndFocusTarget(buildResumeLineSelector(activeBullet.section, activeBullet.index));
      coachingPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeBullet, hasPassedReadyGate]);
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
  const keywordMatchPercent = Math.round(
    postReviewPolish?.result?.ats_score
      ?? data.verificationDetail?.ats.match_score
      ?? data.assembly?.scores.ats_match
      ?? 0,
  );
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
  const readyGateActionSummary = useMemo(() => {
    const workItems = data.requirementWorkItems ?? data.gapAnalysis?.requirement_work_items ?? [];
    const lines: string[] = [];

    if (hiddenRecommendedSections.length > 0) {
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
      lines.push(`${answerCount} requirement${answerCount === 1 ? '' : 's'} still need one concrete example or missing detail before the claim is safe to keep.`);
    }
    if (confirmCount > 0) {
      lines.push(`${confirmCount} benchmark-style claim${confirmCount === 1 ? '' : 's'} need an honest fit check before you keep them as written.`);
    }
    if (quantifyCount + tightenCount > 0) {
      const total = quantifyCount + tightenCount;
      lines.push(`${total} line${total === 1 ? '' : 's'} can get stronger with sharper wording, clearer scope, or one defensible metric.`);
    }
    return lines.slice(0, 3);
  }, [
    data.gapAnalysis?.requirement_work_items,
    data.requirementWorkItems,
    hiddenRecommendedSections,
    missingStructureRecommendations,
  ]);
  const readyGatePrimaryActionLabel = hiddenRecommendedSections.length > 0 || missingStructureRecommendations.length > 0
    ? 'Review Structure First'
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
        ? `Start in ${topItem.locationLabel}. We already have useful proof for "${primaryRequirement}" from an earlier answer.`
        : `Start in ${topItem.locationLabel}. We already have useful proof from an earlier answer.`;
    }
    const nextAction = describeRecommendationPlain(topItem);
    return primaryRequirement
      ? `Start in ${topItem.locationLabel}. We are strengthening "${primaryRequirement}". ${nextAction}`
      : `Start in ${topItem.locationLabel}. ${nextAction}`;
  }, [attentionItems, rememberedAttentionItemIds]);
  const mobileNextActionSummary = compactAttentionNextAction
    ?? 'Run final review on this resume to catch any last hiring-manager, ATS, or credibility issues before export.';
  const guidedStartSteps = useMemo<GuidedStartStep[]>(() => {
    const steps: GuidedStartStep[] = [];

    if (hiddenRecommendedSections.length > 0 || missingStructureRecommendations.length > 0) {
      const hiddenTitles = hiddenRecommendedSections.slice(0, 2).map((item) => item.title);
      const missingTitles = missingStructureRecommendations.slice(0, 2).map((item) => item.title);
      const titles = hiddenTitles.length > 0 ? hiddenTitles : missingTitles;
      steps.push({
        id: 'structure',
        label: 'Structure',
        title: hiddenRecommendedSections.length > 0 ? 'Review the structure first' : 'Check the recommended sections first',
        description: hiddenRecommendedSections.length > 0
          ? `Turn ${titles.join(' and ')} back on before polishing lines so the strongest proof shows up earlier.`
          : `Consider adding ${titles.join(' and ')} before line editing so the first draft is shaped for this role from the start.`,
        actionLabel: 'Jump to structure planner',
        onSelect: focusStructurePlanner,
      });
    }

    const rememberedCue = rememberedEvidenceCues[0];
    if (rememberedCue) {
      steps.push({
        id: 'remembered-proof',
        label: 'Reuse proof',
        title: `Reuse your earlier answer about ${rememberedCue.topic}`,
        description: `This confirmed detail can already strengthen ${rememberedCue.affectedCount} ${rememberedCue.affectedCount === 1 ? 'line' : 'lines'} without asking you anything new.`,
        actionLabel: 'Open matching line',
        onSelect: () => {
          if (rememberedCue.targetIndex !== null) {
            openAttentionItem(rememberedCue.targetIndex, { autoReuseClarificationId: rememberedCue.id });
          }
        },
      });
    }

    const clarificationCue = clarificationCues[0];
    if (clarificationCue) {
      steps.push({
        id: 'clarification',
        label: 'Missing proof',
        title: 'Answer one question with real business detail',
        description: `${clarificationCue.question} ${clarificationCue.affectedCount > 0 ? `This could strengthen ${clarificationCue.affectedCount} ${clarificationCue.affectedCount === 1 ? 'line' : 'lines'}.` : ''}`.trim(),
        actionLabel: 'Go to the right line',
        onSelect: () => openClarificationCue(clarificationCue),
      });
    }

    const sectionTarget = sectionCoachTargets[0];
    if (sectionTarget) {
      steps.push({
        id: `section-${sectionTarget.id}`,
        label: 'Section polish',
        title: `Polish ${sectionTarget.label}`,
        description: sectionTarget.helperText,
        actionLabel: 'Open section coach',
        onSelect: () => openSectionCoachTarget(sectionTarget),
      });
    }

    const attentionItem = attentionItems[0];
    if (attentionItem && steps.length < 4) {
      steps.push({
        id: `line-${attentionItem.id}`,
        label: 'Priority line',
        title: `Fix ${attentionItem.locationLabel} next`,
        description: `${attentionItem.statusLabel}: ${attentionItem.text}`,
        actionLabel: 'Jump to line',
        onSelect: () => openAttentionItem(0),
      });
    }

    const seen = new Set<string>();
    return steps.filter((step) => {
      if (seen.has(step.id)) return false;
      seen.add(step.id);
      return true;
    }).slice(0, 3);
  }, [
    attentionItems,
    clarificationCues,
    focusStructurePlanner,
    hiddenRecommendedSections,
    missingStructureRecommendations,
    openAttentionItem,
    openClarificationCue,
    openSectionCoachTarget,
    rememberedEvidenceCues,
    sectionCoachTargets,
  ]);
  const hasStructureFirstWork = hiddenRecommendedSections.length > 0 || missingStructureRecommendations.length > 0;
  const canShowStructurePlanner = Boolean(
    displayResume && onMoveSection && onToggleSection && onAddAISection && onAddCustomSection && onRemoveCustomSection && !activeBullet,
  );
  const secondarySupportMode = !activeBullet && !hasStructureFirstWork
    ? rememberedEvidenceCues.length > 0
      ? 'remembered'
      : clarificationCues.length > 0
        ? 'clarification'
        : sectionCoachTargets.length > 0
          ? 'section'
          : attentionItems.length > 0
            ? 'queue'
            : null
    : null;

  const renderSecondarySupportPanel = () => {
    if (activeBullet) return null;
    if (guidedStartSteps.length > 0) return null;

    if (secondarySupportMode === 'remembered') {
      return (
        <RememberedEvidenceCard
          cues={rememberedEvidenceCues}
          onOpenCue={(cue) => {
            if (cue.targetIndex !== null) openAttentionItem(cue.targetIndex, { autoReuseClarificationId: cue.id });
          }}
        />
      );
    }

    if (secondarySupportMode === 'clarification') {
      return (
        <ClarificationCueCard
          cues={clarificationCues}
          onOpenCue={openClarificationCue}
        />
      );
    }

    if (secondarySupportMode === 'section') {
      return (
        <SectionCoachCard
          targets={sectionCoachTargets}
          onOpenTarget={openSectionCoachTarget}
        />
      );
    }

    if (secondarySupportMode === 'queue') {
      return (
        <div className="guide-support-panel px-3 py-3 sm:px-4 sm:py-4">
          <p className="eyebrow-label">Priority Lines</p>
          <h3 className="mt-2 text-base font-semibold text-[var(--text-strong)]">Fix the lines that change the story fastest</h3>
          <p className="mt-1.5 text-[13px] leading-5 text-[var(--text-soft)]">
            If you do not need structure work first, start with one of these high-impact edits.
          </p>
          {attentionItems.length > 0 ? (
            <div className="mt-3 space-y-2 sm:mt-4">
              {attentionItems.slice(0, 3).map((item) => {
                const itemIndex = attentionItems.findIndex((candidate) => candidate.id === item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openAttentionItem(itemIndex)}
                    className="block w-full rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2.5 text-left hover:bg-[var(--surface-0)] transition-colors sm:px-3.5 sm:py-3"
                  >
                    <span className={item.statusClassName}>{item.statusLabel}</span>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
                      {item.locationLabel}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--text-strong)]">
                      {item.text}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2.5 text-sm text-[var(--text-soft)] sm:mt-4 sm:px-3.5 sm:py-3">
              The strongest version is already visible. Use the structure planner above if you want to change the section story before export.
            </div>
          )}
        </div>
      );
    }

    return null;
  };

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
            {!activeBullet && data.preScores && data.assembly && (
              <div className="mx-auto max-w-[900px] px-6 pt-4">
                <div className="space-y-3">
                  <MobileResumeScoreSummary
                    resumeScore={keywordMatchPercent}
                    nextAction={mobileNextActionSummary}
                    flaggedCount={attentionItems.length}
                    isExpanded={showMobileFullScoringReport}
                    onToggleFullReport={() => setShowMobileFullScoringReport((current) => !current)}
                  />
                  {showMobileFullScoringReport && (
                    <ScoringReport
                      preScores={data.preScores}
                      assembly={data.assembly}
                      verificationDetail={data.verificationDetail ?? null}
                      gapAnalysis={data.gapAnalysis ?? null}
                      compact
                      compactReviewStatusLabel={compactReviewStatusLabel}
                      compactAttentionSummary={compactAttentionSummary}
                      compactAttentionNextAction={compactAttentionNextAction}
                    />
                  )}
                </div>
              </div>
            )}
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
              {attentionItems.length > 0 && (
                <AttentionReviewStrip items={attentionItems} currentIndex={attentionIndex} nextActionCue={compactAttentionNextAction} onOpenCurrent={() => openAttentionItem(attentionIndex)} onNext={() => openAttentionItem((attentionIndex + 1) % attentionItems.length)} onPrevious={() => openAttentionItem((attentionIndex - 1 + attentionItems.length) % attentionItems.length)} />
              )}
              {!activeBullet && hasStructureFirstWork && (
                <GuidedStartCard steps={guidedStartSteps} />
              )}
              {canShowStructurePlanner && hasStructureFirstWork && (
                <div ref={structurePlannerRef}>
                  <ResumeStructurePlannerCard
                    resume={displayResume!}
                    candidateIntelligence={data.candidateIntelligence}
                    requirementWorkItems={data.requirementWorkItems}
                    onMoveSection={onMoveSection!}
                    onToggleSection={onToggleSection!}
                    onAddAISection={handleAddAISectionAndOpen}
                    onAddCustomSection={handleAddCustomSectionAndOpen}
                    onRemoveCustomSection={onRemoveCustomSection!}
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
              {!activeBullet && !hasStructureFirstWork && (
                <GuidedStartCard steps={guidedStartSteps} />
              )}
              {canShowStructurePlanner && !hasStructureFirstWork && (
                <div ref={structurePlannerRef}>
                  <ResumeStructurePlannerCard
                    resume={displayResume!}
                    candidateIntelligence={data.candidateIntelligence}
                    requirementWorkItems={data.requirementWorkItems}
                    onMoveSection={onMoveSection!}
                    onToggleSection={onToggleSection!}
                    onAddAISection={handleAddAISectionAndOpen}
                    onAddCustomSection={handleAddCustomSectionAndOpen}
                    onRemoveCustomSection={onRemoveCustomSection!}
                  />
                </div>
              )}
              {!hasStructureFirstWork && renderSecondarySupportPanel()}
              {activeBullet && gapChat && buildChatContext && (
                <BulletCoachingPanel bulletText={activeBullet.bulletText} section={activeBullet.section} bulletIndex={activeBullet.index} requirements={activeBullet.requirements} reviewState={activeBullet.reviewState} requirementSource={activeBullet.requirementSource} evidenceFound={activeBullet.evidenceFound} sourceEvidence={activeBullet.sourceEvidence} proofLevel={activeBullet.proofLevel} framingGuardrail={activeBullet.framingGuardrail} nextBestAction={activeBullet.nextBestAction} canRemove={activeBullet.canRemove ?? true} initialReuseClarificationId={activeBullet.autoReuseClarificationId} gapChat={gapChat} chatContext={buildChatContext({ requirement: activeBullet.requirements[0], requirements: activeBullet.requirements, lineText: activeBullet.bulletText, section: activeBullet.section, index: activeBullet.index, reviewState: activeBullet.reviewState, evidenceFound: activeBullet.evidenceFound, workItemId: activeBullet.workItemId })} onApplyToResume={(s, idx, newText, metadata) => onBulletEdit?.(s, idx, newText, metadata)} onRemoveBullet={(s, idx) => onBulletRemove?.(s, idx)} onClose={() => setActiveBullet(null)} onBulletEnhance={onBulletEnhance} />
              )}
              {pendingEdit && !activeBullet && (
                <div className="mt-4" ref={(el) => el?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                  <DiffView key={pendingEdit.originalText + pendingEdit.section} edit={pendingEdit} onAccept={handleAcceptEdit} onReject={onRejectEdit} />
                </div>
              )}
              {isComplete && displayResume && (
                <ResumeFinalReviewPanel hiringManagerResult={hiringManagerResult ?? null} resolvedFinalReviewConcernIds={resolvedFinalReviewConcernIds} isFinalReviewStale={isFinalReviewStale} isHiringManagerLoading={isHiringManagerLoading} hiringManagerError={hiringManagerError} companyName={data.jobIntelligence?.company_name} jobTitle={data.jobIntelligence?.role_title} onRequestHiringManagerReview={onRequestHiringManagerReview} onApplyHiringManagerRecommendation={onApplyHiringManagerRecommendation} finalReviewChat={finalReviewChat} buildFinalReviewChatContext={buildFinalReviewChatContext} resolveConcernTarget={resolveFinalReviewTarget} onPreviewConcernTarget={onPreviewFinalReviewTarget} isEditing={isEditing} />
              )}
              {isComplete && data.assembly && displayResume && (
                <CollapsibleWorkspaceRail>
                  <ResumeWorkspaceRail displayResume={displayResume} companyName={data.jobIntelligence?.company_name} jobTitle={data.jobIntelligence?.role_title} atsScore={data.assembly.scores.ats_match} hiringManagerResult={hiringManagerResult ?? null} resolvedFinalReviewConcernIds={resolvedFinalReviewConcernIds} isFinalReviewStale={isFinalReviewStale} queueSummary={rewriteQueue?.summary ?? { needsAttention: 0, partiallyAddressed: 0, resolved: 0, hardGapCount: 0 }} nextQueueItemLabel={rewriteQueue?.nextItem?.title} finalReviewWarningsAcknowledged={finalReviewWarningsAcknowledged} onAcknowledgeFinalReviewWarnings={onAcknowledgeFinalReviewWarnings} jobUrl={jobUrl} sessionId={data.sessionId} accessToken={accessToken} />
                </CollapsibleWorkspaceRail>
              )}
            </div>
          </div>

          {/* ── Desktop: two-panel layout ── */}
          <div className="hidden h-full px-4 py-4 lg:flex xl:px-5 xl:py-5">
            <ResumeEditorLayout
              leftPanel={(() => {
                const activeLinePreview = activeBullet ? truncatePreview(activeBullet.bulletText) : null;
                const activeLineContext = activeBullet?.requirements[0]
                  ?? activeBullet?.sourceEvidence
                  ?? activeBullet?.evidenceFound
                  ?? null;

                return (
                  <div className="flex flex-col h-full">
                    {/* Fixed header — always visible */}
                    <div className="shrink-0 border-b border-[var(--line-soft)] px-4 py-4">
                      {(() => {
                        const flaggedCount = attentionItems.length;
                        const leftRailHeadline = activeBullet
                          ? `Working in ${chatContextLabelForSection(activeBullet.section)}`
                          : hasStructureFirstWork
                            ? 'Start with the sections'
                            : flaggedCount > 0
                              ? 'We will fix the biggest job needs one by one'
                              : 'Your draft is ready for the final polish';
                        const leftRailSummary = activeBullet
                          ? 'I will show what the job needs, what I found, what is still missing, and the best wording to use.'
                          : hasStructureFirstWork
                            ? 'Turn on, remove, or reorder the sections that will help this role most before changing lines.'
                            : flaggedCount > 0
                              ? 'Open the next line and I will help you strengthen it in plain English.'
                              : 'Use the coach only if you want to tighten a line before export.';

                        return (
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <p className="eyebrow-label">Requirement Coach</p>
                              <div className="flex flex-wrap items-end justify-between gap-3">
                                <p className="text-base font-semibold text-[var(--text-strong)]">
                                  {leftRailHeadline}
                                </p>
                                {!activeBullet && data.preScores && data.assembly && (
                                  <button
                                    type="button"
                                    onClick={() => setShowDesktopScoringDetails((current) => !current)}
                                    className="rounded-full border border-[var(--line-soft)] bg-[var(--surface-0)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--text-strong)]"
                                  >
                                    {showDesktopScoringDetails ? 'Hide full scoring report' : 'See full scoring report'}
                                  </button>
                                )}
                              </div>
                              <p className="text-sm leading-6 text-[var(--text-soft)]">
                                {leftRailSummary}
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {flaggedCount > 0 && (
                                <span className="rounded-full border border-[var(--line-soft)] bg-[var(--surface-0)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
                                  {flaggedCount} {flaggedCount === 1 ? 'line still needs work' : 'lines still need work'}
                                </span>
                              )}
                              {hasStructureFirstWork && !activeBullet && (
                                <span className="rounded-full border border-[var(--line-soft)] bg-[var(--surface-0)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
                                  Structure first
                                </span>
                              )}
                              {activeBullet?.requirements[0] && (
                                <span className="rounded-full border border-[var(--line-soft)] bg-[var(--surface-0)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
                                  Fixing: {truncatePreview(activeBullet.requirements[0], 58)}
                                </span>
                              )}
                            </div>

                            {activeBullet && activeLinePreview && (
                              <div className="resume-guide-focus-card">
                                <p className="resume-guide-focus-card__label">
                                  Current line · {chatContextLabelForSection(activeBullet.section)}
                                </p>
                                <p className="resume-guide-focus-card__title">{activeLinePreview}</p>
                                {activeLineContext && (
                                  <p className="resume-guide-focus-card__body">
                                    Current requirement: {truncatePreview(activeLineContext, 96)}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {!activeBullet && currentDesktopPriorityItem && (
                        <div className="mt-4">
                          <DesktopPriorityLineCard
                            item={currentDesktopPriorityItem}
                            index={attentionIndex}
                            total={attentionItems.length}
                            onOpen={() => openAttentionItem(attentionIndex)}
                            onNext={() => openAttentionItem((attentionIndex + 1) % attentionItems.length)}
                          />
                        </div>
                      )}
                    </div>

                    {/* Main content — one thing at a time */}
                    <div className="flex-1 overflow-y-auto px-3 py-3">
                      {(error || editError) && (
                        <div className="flex items-center gap-2 rounded-xl border border-[var(--badge-red-text)]/28 bg-[var(--badge-red-bg)] px-4 py-3 text-sm text-[var(--badge-red-text)]/90 mb-3" role="alert">
                          <AlertCircle className="h-4 w-4 shrink-0" />{error ?? editError}
                        </div>
                      )}
                      {activeBullet && gapChat && buildChatContext ? (
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
                            gapChat={gapChat}
                            chatContext={buildChatContext({ requirement: activeBullet.requirements[0], requirements: activeBullet.requirements, lineText: activeBullet.bulletText, section: activeBullet.section, index: activeBullet.index, reviewState: activeBullet.reviewState, evidenceFound: activeBullet.evidenceFound, workItemId: activeBullet.workItemId })}
                            onApplyToResume={(s, idx, newText, metadata) => onBulletEdit?.(s, idx, newText, metadata)}
                            onRemoveBullet={(s, idx) => onBulletRemove?.(s, idx)}
                            onClose={() => setActiveBullet(null)}
                            onBulletEnhance={onBulletEnhance}
                          />
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {showDesktopScoringDetails && data.preScores && data.assembly && (
                            <div className="guide-support-panel px-3 py-3 sm:px-4 sm:py-4">
                              <p className="eyebrow-label">Scoring details</p>
                              <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">See the full keyword, fit, and before/after report</p>
                              <p className="mt-1.5 text-[13px] leading-5 text-[var(--text-soft)]">
                                Use the full report when you want the detailed keyword and phrasing breakdown behind the current score.
                              </p>
                              <div className="mt-4">
                                <ScoringReport
                                  preScores={data.preScores}
                                  assembly={data.assembly}
                                  verificationDetail={data.verificationDetail ?? null}
                                  gapAnalysis={data.gapAnalysis ?? null}
                                  renderSummary={false}
                                />
                              </div>
                            </div>
                          )}
                          <GuidedStartCard steps={guidedStartSteps} />
                          {canShowStructurePlanner && (
                            <div ref={structurePlannerRef}>
                              <ResumeStructurePlannerCard
                                resume={displayResume!}
                                candidateIntelligence={data.candidateIntelligence}
                                requirementWorkItems={data.requirementWorkItems}
                                onMoveSection={onMoveSection!}
                                onToggleSection={onToggleSection!}
                                onAddAISection={handleAddAISectionAndOpen}
                                onAddCustomSection={handleAddCustomSectionAndOpen}
                                onRemoveCustomSection={onRemoveCustomSection!}
                              />
                            </div>
                          )}
                          {renderSecondarySupportPanel()}
                          {isComplete && displayResume && (
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
                                queueSummary={rewriteQueue?.summary ?? { needsAttention: 0, partiallyAddressed: 0, resolved: 0, hardGapCount: 0 }}
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
            hasScoreData={!!data.gapAnalysis?.score_breakdown}
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
