/**
 * V2StreamingDisplay — Output display for the v2 pipeline
 *
 * Two layout modes:
 *   1. Processing mode — minimal status card while the tailored resume is being built
 *   2. Resume mode — full-width centered document with inline editing
 */

import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { Loader2, AlertCircle, Undo2, Redo2, ChevronDown, ChevronUp } from 'lucide-react';
import type { V2PipelineData, V2Stage, ResumeDraft, BulletConfidence, RequirementSource, ResumeReviewState } from '@/types/resume-v2';
import type { GapCoachingResponse, PreScores, GapCoachingCard as GapCoachingCardType } from '@/types/resume-v2';
import type { CoachingThreadSnapshot, FinalReviewChatContext, MasterPromotionItem, PostReviewPolishState } from '@/types/resume-v2';
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
import { REVIEW_STATE_DISPLAY } from './utils/review-state-labels';
import { buildRewriteQueue } from '@/lib/rewrite-queue';
import { canonicalRequirementSignals } from '@/lib/resume-requirement-signals';
import { scrollToAndFocusTarget } from './useStrategyThread';

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
  onBulletEdit?: (section: string, index: number, newText: string) => void;
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
  buildChatContext?: (requirement: string) => GapChatContext;
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
  ) => Promise<import('@/hooks/useBulletEnhance').EnhanceResult | null>;
  /** Job application URL — when present and pipeline is complete, shows the Apply to This Job button */
  jobUrl?: string;
  /** Access token for the link-resume API call in ExportBar */
  accessToken?: string | null;
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
      });
    });
  });

  return items.sort((a, b) => a.order - b.order);
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
            {items.length} {items.length === 1 ? 'line still needs attention.' : 'lines still need attention.'} Fix these directly on the resume.
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
            Show on Resume
          </button>
        </div>
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
  jobUrl,
  accessToken,
}: V2StreamingDisplayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Active bullet for inline editing
  const [activeBullet, setActiveBullet] = useState<{
    section: string;
    index: number;
    requirements: string[];
    bulletText: string;
    reviewState: ResumeReviewState;
    requirementSource?: RequirementSource;
    evidenceFound: string;
  } | null>(initialActiveBullet ? { ...initialActiveBullet, bulletText: '', reviewState: 'supported' as ResumeReviewState, evidenceFound: '' } : null);

  useEffect(() => {
    setActiveBullet(initialActiveBullet ? { ...initialActiveBullet, bulletText: '', reviewState: 'supported' as ResumeReviewState, evidenceFound: '' } : null);
  }, [initialActiveBullet]);

  const displayResume = editableResume ?? data.assembly?.final_resume ?? data.resumeDraft;
  const hasResume = displayResume !== null && displayResume !== undefined;
  const baselineResume = data.assembly?.final_resume ?? data.resumeDraft ?? null;
  const attentionItems = useMemo(() => (
    displayResume ? buildAttentionReviewItems(displayResume, baselineResume) : []
  ), [baselineResume, displayResume]);
  const [attentionIndex, setAttentionIndex] = useState(0);

  // Bullet click handler for cross-referencing
  const handleBulletClick = useCallback((
    bulletText: string,
    section: string,
    bulletIndex: number,
    requirements: string[],
    reviewState?: ResumeReviewState,
    requirementSource?: RequirementSource,
    evidenceFound?: string,
  ) => {
    setActiveBullet((prev) => {
      if (prev?.section === section && prev?.index === bulletIndex) return null;
      return {
        section,
        index: bulletIndex,
        requirements,
        bulletText,
        reviewState: reviewState ?? 'supported' as ResumeReviewState,
        requirementSource,
        evidenceFound: evidenceFound ?? '',
      };
    });
  }, []);

  const openAttentionItem = useCallback((index: number) => {
    const item = attentionItems[index];
    if (!item) return;
    setAttentionIndex(index);
    setActiveBullet({
      section: item.section,
      index: item.index,
      requirements: item.requirements,
      bulletText: item.text,
      reviewState: 'strengthen' as ResumeReviewState,
      evidenceFound: '',
    });
    window.requestAnimationFrame(() => {
      scrollToAndFocusTarget(item.selector);
    });
  }, [attentionItems]);

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

  // Reset gate when re-running
  useEffect(() => {
    if (isRerunning) setHasPassedReadyGate(false);
  }, [isRerunning]);

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
  const rewriteQueue = useMemo(() => {
    if (!data.jobIntelligence || !data.gapAnalysis) return null;
    return buildRewriteQueue({
      jobIntelligence: data.jobIntelligence,
      gapAnalysis: data.gapAnalysis,
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

    const proofCount = attentionItems.filter((item) => item.priority === 0).length;
    const validateCount = attentionItems.filter((item) => item.priority === 1).length;
    const strengthenCount = attentionItems.filter((item) => item.priority === 2).length;

    if (proofCount > 0) {
      const remainder = validateCount + strengthenCount;
      return `${proofCount} line${proofCount === 1 ? '' : 's'} still ${proofCount === 1 ? 'needs' : 'need'} your story${remainder > 0 ? `, and ${remainder} more still need attention` : ''}.`;
    }

    if (validateCount > 0) {
      return `${validateCount} line${validateCount === 1 ? '' : 's'} still ${validateCount === 1 ? 'needs' : 'need'} a fit check${strengthenCount > 0 ? `, and ${strengthenCount} more could be stronger` : ''}.`;
    }

    return `Your resume is looking good \u2014 ${strengthenCount} line${strengthenCount === 1 ? '' : 's'} could still be stronger.`;
  }, [attentionItems]);
  const compactAttentionNextAction = useMemo(() => {
    const topItem = attentionItems[0];
    if (!topItem) return undefined;
    return `Start with the bullet marked '${topItem.statusLabel.toLowerCase()}' in ${topItem.locationLabel}.`;
  }, [attentionItems]);

  // ─── Unified layout — single ScoringReport above the branch split ────────
  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto relative">
      {/* Scoring report — single instance, persists across layout transitions */}
      {/* Scoring report — only show outside the editing state (it moves into each variant below) */}
      {data.preScores && data.assembly && !(canShowResumeDocument && hasPassedReadyGate) && (
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
            {data.preScores && data.assembly && (
              <div className="mx-auto max-w-[900px] px-6 pt-4">
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
            <div className="mx-auto max-w-[900px] px-6 py-8 space-y-6">
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
              {displayResume && (
                <AnimatedCard index={0}>
                  <div className="bg-white rounded-lg shadow-[0_4px_32px_rgba(0,0,0,0.45)] overflow-hidden">
                    <ResumeDocumentCard resume={displayResume} requirementCatalog={data.gapAnalysis?.requirements ?? []} activeBullet={activeBullet} onBulletClick={canInteract ? handleBulletClick : undefined} onBulletEdit={canInteract ? onBulletEdit : undefined} onBulletRemove={canInteract ? onBulletRemove : undefined} />
                  </div>
                </AnimatedCard>
              )}
              {activeBullet && gapChat && buildChatContext && (
                <BulletCoachingPanel bulletText={activeBullet.bulletText} section={activeBullet.section} bulletIndex={activeBullet.index} requirements={activeBullet.requirements} reviewState={activeBullet.reviewState} requirementSource={activeBullet.requirementSource} evidenceFound={activeBullet.evidenceFound} gapChat={gapChat} chatContext={buildChatContext(activeBullet.requirements[0] ?? activeBullet.bulletText)} onApplyToResume={(s, idx, newText) => onBulletEdit?.(s, idx, newText)} onRemoveBullet={(s, idx) => onBulletRemove?.(s, idx)} onClose={() => setActiveBullet(null)} onBulletEnhance={onBulletEnhance} />
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
          <div className="hidden lg:flex h-full">
            <ResumeEditorLayout
              leftPanel={
                <div className="space-y-4">
                  {data.preScores && data.assembly && (
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
                  {canShowUndoBar && (
                    <div className="flex items-center gap-2 px-2 py-2 rounded-lg bg-[var(--surface-1)] border border-[var(--line-soft)]">
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
                  {attentionItems.length > 0 && (
                    <AttentionReviewStrip items={attentionItems} currentIndex={attentionIndex} nextActionCue={compactAttentionNextAction} onOpenCurrent={() => openAttentionItem(attentionIndex)} onNext={() => openAttentionItem((attentionIndex + 1) % attentionItems.length)} onPrevious={() => openAttentionItem((attentionIndex - 1 + attentionItems.length) % attentionItems.length)} />
                  )}
                  {pendingEdit && <ReviewInboxCard pendingEdit={pendingEdit} />}
                  {activeBullet && gapChat && buildChatContext && (
                    <BulletCoachingPanel bulletText={activeBullet.bulletText} section={activeBullet.section} bulletIndex={activeBullet.index} requirements={activeBullet.requirements} reviewState={activeBullet.reviewState} requirementSource={activeBullet.requirementSource} evidenceFound={activeBullet.evidenceFound} gapChat={gapChat} chatContext={buildChatContext(activeBullet.requirements[0] ?? activeBullet.bulletText)} onApplyToResume={(s, idx, newText) => onBulletEdit?.(s, idx, newText)} onRemoveBullet={(s, idx) => onBulletRemove?.(s, idx)} onClose={() => setActiveBullet(null)} onBulletEnhance={onBulletEnhance} />
                  )}
                  {pendingEdit && !activeBullet && (
                    <DiffView key={pendingEdit.originalText + pendingEdit.section} edit={pendingEdit} onAccept={handleAcceptEdit} onReject={onRejectEdit} />
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
              }
              rightPanel={
                <div className="mx-auto max-w-[900px]">
                  {displayResume && (
                    <AnimatedCard index={0}>
                      <div className="bg-white rounded-lg shadow-[0_4px_32px_rgba(0,0,0,0.45)] overflow-hidden">
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
        <div className="mx-auto max-w-[720px] px-6 py-8">
          <ResumeReadyScreen
            jobMatchPercent={jobBreakdown.coverage_score}
            benchmarkMatchPercent={benchmarkBreakdown.coverage_score}
            strengthSummary={data.gapAnalysis?.strength_summary ?? ''}
            flaggedBulletCount={attentionItems.length}
            companyName={data.jobIntelligence?.company_name}
            roleTitle={data.jobIntelligence?.role_title}
            hasScoreData={!!data.gapAnalysis?.score_breakdown}
            onStartEditing={() => setHasPassedReadyGate(true)}
          />
        </div>
      ) : (
        /* Processing layout (pipeline running, no resume yet) */
        <div className="mx-auto max-w-[720px] px-6 py-8">
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
