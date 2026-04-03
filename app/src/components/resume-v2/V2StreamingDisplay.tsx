/**
 * V2StreamingDisplay — Output display for the v2 pipeline
 *
 * Two layout modes:
 *   1. Processing mode — minimal status card while the tailored resume is being built
 *   2. Resume mode — full-width centered document with inline editing
 */

import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { Loader2, AlertCircle, Undo2, Redo2, ChevronDown, ChevronUp, CheckCircle, Check, X, TrendingUp, Target, Lightbulb, ShieldCheck } from 'lucide-react';
import type { V2PipelineData, V2Stage, ResumeDraft, BulletConfidence, RequirementSource, ResumeReviewState } from '@/types/resume-v2';
import type { GapCoachingResponse, PreScores, GapCoachingCard as GapCoachingCardType, GapAnalysis, BenchmarkCandidate, NarrativeStrategy, AssemblyResult, VerificationDetail } from '@/types/resume-v2';
import type { CoachingThreadSnapshot, FinalReviewChatContext, MasterPromotionItem, PostReviewPolishState } from '@/types/resume-v2';
import type { EditAction, PendingEdit } from '@/hooks/useInlineEdit';
import { ResumeDocumentCard } from './cards/ResumeDocumentCard';
import type { LiveScores } from '@/hooks/useLiveScoring';
import { DiffView } from './DiffView';
import type { HiringManagerReviewResult, HiringManagerConcern } from '@/hooks/useHiringManagerReview';
import type { GapChatHook } from '@/hooks/useGapChat';
import type { FinalReviewChatHook } from '@/hooks/useFinalReviewChat';
import type { GapChatContext } from '@/types/resume-v2';
import type { FinalReviewTargetMatch } from './utils/final-review-target';
import { ReviewInboxCard } from './cards/ReviewInboxCard';
import { ResumeFinalReviewPanel, ResumeWorkspaceRail } from './ResumeWorkspaceRail';
import { ScoringReport, ScoringReportDetailsDisclosure } from './ScoringReport';
import { GapOverviewCard } from './cards/GapOverviewCard';
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

// ─── OriginalScoresCard ───────────────────────────────────────────────────────
// Shows the pre-optimization ATS score + full two-column keyword breakdown.

interface OriginalScoresCardProps {
  preScores: PreScores;
  /** When true (resume mode), renders as a collapsible card */
  collapsible?: boolean;
}

const KEYWORD_INITIAL_LIMIT = 8;

function OriginalScoresCard({ preScores, collapsible = false }: OriginalScoresCardProps) {
  const { ats_match, keywords_found, keywords_missing } = preScores;
  const total = keywords_found.length + keywords_missing.length;
  const [showAll, setShowAll] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const visibleFound = showAll ? keywords_found : keywords_found.slice(0, KEYWORD_INITIAL_LIMIT);
  const visibleMissing = showAll ? keywords_missing : keywords_missing.slice(0, KEYWORD_INITIAL_LIMIT);
  const hasMore = keywords_found.length > KEYWORD_INITIAL_LIMIT || keywords_missing.length > KEYWORD_INITIAL_LIMIT;

  return (
    <div
      className="bg-white rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.35)] mb-6 overflow-hidden"
      role="region"
      aria-label="Original resume analysis"
    >
      {/* Header — always visible */}
      <div className="px-6 pt-5 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mb-3">
              Your Starting Point — Original Resume Analysis
            </p>

            {/* ATS score + bar */}
            <div className="mb-1.5">
              <div className="flex items-baseline gap-2 mb-1.5">
                <span className="text-2xl font-bold tabular-nums text-neutral-800">{ats_match}%</span>
                <span className="text-sm text-neutral-500">ATS Keyword Match</span>
                <span className="text-[11px] text-neutral-400">({total} JD keywords total)</span>
              </div>
              <div
                className="h-2 w-full rounded-full bg-neutral-100 overflow-hidden"
                role="progressbar"
                aria-valuenow={ats_match}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`ATS match: ${ats_match}%`}
              >
                <div
                  className="h-full rounded-full bg-blue-400 transition-[width] duration-700 ease-out"
                  style={{ width: `${ats_match}%` }}
                />
              </div>
            </div>
          </div>
          {collapsible && (
            <button
              type="button"
              onClick={() => setCollapsed((p) => !p)}
              className="mt-1 text-neutral-400 hover:text-neutral-600 transition-colors"
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Expand original analysis' : 'Collapse original analysis'}
            >
              {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
          )}
        </div>

        {/* Keyword summary counts row */}
        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
            <Check className="h-4 w-4 shrink-0" />
            {keywords_found.length} found
          </div>
          <span className="text-neutral-300">|</span>
          <div className="flex items-center gap-1.5 text-sm text-red-400 font-medium">
            <X className="h-4 w-4 shrink-0" />
            {keywords_missing.length} missing
          </div>
        </div>
      </div>

      {/* Collapsible body */}
      {(!collapsible || !collapsed) && (
        <div className="px-6 pb-5">
          {/* Two-column keyword table */}
          {(keywords_found.length > 0 || keywords_missing.length > 0) && (
            <div>
              <div className="border border-neutral-200 rounded-lg overflow-hidden">
                {/* Column headers */}
                <div className="grid grid-cols-2 border-b border-neutral-200 bg-neutral-50">
                  <div className="px-3 py-2 flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                      Found ({keywords_found.length})
                    </span>
                  </div>
                  <div className="px-3 py-2 flex items-center gap-1.5 border-l border-neutral-200">
                    <X className="h-3.5 w-3.5 text-red-400" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                      Missing ({keywords_missing.length})
                    </span>
                  </div>
                </div>

                {/* Keyword rows */}
                <div className="grid grid-cols-2">
                  {/* Found column */}
                  <div className="py-1">
                    {visibleFound.length === 0
                      ? <p className="px-3 py-2 text-[12px] text-neutral-400 italic">None detected</p>
                      : visibleFound.map((kw, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                          <Check className="h-3 w-3 shrink-0 text-emerald-500" />
                          <span className="text-[12px] text-neutral-700">{kw}</span>
                        </div>
                      ))
                    }
                  </div>
                  {/* Missing column */}
                  <div className="py-1 border-l border-neutral-200">
                    {visibleMissing.length === 0
                      ? <p className="px-3 py-2 text-[12px] text-neutral-400 italic">All keywords present</p>
                      : visibleMissing.map((kw, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                          <X className="h-3 w-3 shrink-0 text-red-400" />
                          <span className="text-[12px] text-neutral-700">{kw}</span>
                        </div>
                      ))
                    }
                  </div>
                </div>
              </div>

              {/* Show all toggle */}
              {hasMore && (
                <button
                  type="button"
                  onClick={() => setShowAll((p) => !p)}
                  className="mt-2 flex items-center gap-1 text-[12px] text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  {showAll ? (
                    <>
                      <ChevronUp className="h-3.5 w-3.5" />
                      Show fewer keywords
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3.5 w-3.5" />
                      Show all keywords
                      {keywords_found.length + keywords_missing.length > KEYWORD_INITIAL_LIMIT * 2
                        ? ` (${keywords_found.length + keywords_missing.length - KEYWORD_INITIAL_LIMIT * 2} more)`
                        : ''}
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {!collapsible && (
            <p className="mt-4 text-[13px] text-neutral-500 leading-relaxed">
              We are now optimizing your resume to close these gaps...
            </p>
          )}
        </div>
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
}: V2StreamingDisplayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Active bullet for inline editing
  const [activeBullet, setActiveBullet] = useState<{
    section: string;
    index: number;
    requirements: string[];
  } | null>(initialActiveBullet);

  useEffect(() => {
    setActiveBullet(initialActiveBullet ?? null);
  }, [initialActiveBullet]);

  const displayResume = editableResume ?? data.assembly?.final_resume ?? data.resumeDraft;
  const hasResume = displayResume !== null && displayResume !== undefined;
  const baselineResume = data.assembly?.final_resume ?? data.resumeDraft ?? null;
  const attentionItems = useMemo(() => (
    displayResume ? buildAttentionReviewItems(displayResume, baselineResume) : []
  ), [baselineResume, displayResume]);
  const [attentionIndex, setAttentionIndex] = useState(0);

  // Bullet click handler for cross-referencing
  const handleBulletClick = useCallback((bulletText: string, section: string, bulletIndex: number, requirements: string[]) => {
    setActiveBullet((prev) => {
      if (prev?.section === section && prev?.index === bulletIndex) return null;
      return { section, index: bulletIndex, requirements };
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

  const canEdit = isComplete && displayResume !== null && displayResume !== undefined;

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
    return `Start with the ${topItem.statusLabel.toLowerCase()} line in ${topItem.locationLabel}.`;
  }, [attentionItems]);

  // ─── Unified layout — single ScoringReport above the branch split ────────
  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto relative">
      {/* Gap Overview — "Your Resume vs. This Role" — persists across all phases */}
      {!canShowResumeDocument && isComplete && data.gapAnalysis && data.preScores && (
        <div className="mx-auto max-w-[900px] px-6 pt-8">
          <GapOverviewCard
            gapAnalysis={data.gapAnalysis}
            preScores={data.preScores}
            questionCount={0}
            onBeginReview={() => {}}
            collapsed={false}
          />
        </div>
      )}

      {/* Scoring report — single instance, persists across layout transitions */}
      {data.preScores && data.assembly && (
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
          {/* Undo/redo bar */}
          {canShowUndoBar && (
            <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2 bg-[#0f141e]/85 border-b border-[var(--line-soft)]">
              <button
                type="button"
                onClick={onUndo}
                disabled={undoCount === 0}
                className="flex items-center gap-1.5 rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1.5 text-xs text-[var(--text-soft)] hover:bg-[var(--surface-1)] hover:text-[var(--text-strong)] disabled:opacity-30 transition-colors"
                title="Undo"
              >
                <Undo2 className="h-3 w-3" />
                <span>Undo</span>
                {undoCount > 0 && (
                  <span className="rounded-sm bg-[var(--surface-1)] px-1.5 py-0.5 font-mono text-[12px] text-[var(--text-soft)]">
                    {undoCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={onRedo}
                disabled={redoCount === 0}
                className="flex items-center gap-1.5 rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1.5 text-xs text-[var(--text-soft)] hover:bg-[var(--surface-1)] hover:text-[var(--text-strong)] disabled:opacity-30 transition-colors"
                title="Redo"
              >
                <Redo2 className="h-3 w-3" />
                <span>Redo</span>
                {redoCount > 0 && (
                  <span className="rounded-sm bg-[var(--surface-1)] px-1.5 py-0.5 font-mono text-[12px] text-[var(--text-soft)]">
                    {redoCount}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* Full-width centered resume document */}
          <div className="mx-auto max-w-[900px] px-6 py-8 space-y-6">
            {/* Error banners */}
            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-[#f0b8b8]/28 bg-[#f0b8b8]/[0.08] px-4 py-3 text-sm text-[#f0b8b8]/90" role="alert">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            {editError && (
              <div className="flex items-center gap-2 rounded-xl border border-[#f0b8b8]/28 bg-[#f0b8b8]/[0.08] px-4 py-3 text-sm text-[#f0b8b8]/90" role="alert">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {editError}
              </div>
            )}

            {/* Processing banner — shown while pipeline finalises after resume first appears */}
            {!isComplete && isConnected && (
              <div className="flex items-center gap-2 text-xs text-[var(--text-soft)]" role="status" aria-live="polite">
                <Loader2 className="h-3 w-3 motion-safe:animate-spin" />
                <span>{getStageMessage(data.stage)}</span>
              </div>
            )}

            {pendingEdit && <ReviewInboxCard pendingEdit={pendingEdit} />}

            {attentionItems.length > 0 && (
              <AttentionReviewStrip
                items={attentionItems}
                currentIndex={attentionIndex}
                nextActionCue={compactAttentionNextAction}
                onOpenCurrent={() => openAttentionItem(attentionIndex)}
                onNext={() => openAttentionItem((attentionIndex + 1) % attentionItems.length)}
                onPrevious={() => openAttentionItem((attentionIndex - 1 + attentionItems.length) % attentionItems.length)}
              />
            )}

            {/* Original scores card — suppressed; unified GapOverviewCard shows ATS data */}

            {/* Resume document with inline editing */}
            {displayResume && (
              <AnimatedCard index={0}>
                {/* Paper-on-desk document card */}
                <div className="bg-white rounded-lg shadow-[0_4px_32px_rgba(0,0,0,0.45)] overflow-hidden">
                  <ResumeDocumentCard
                    resume={displayResume}
                    requirementCatalog={data.gapAnalysis?.requirements ?? []}
                    activeBullet={activeBullet}
                    onBulletClick={canEdit ? handleBulletClick : undefined}
                    onBulletEdit={canEdit ? onBulletEdit : undefined}
                    onBulletRemove={canEdit ? onBulletRemove : undefined}
                    gapChat={gapChat ?? undefined}
                    buildChatContext={buildChatContext}
                    onBulletConversationClose={() => setActiveBullet(null)}
                    onBulletEnhance={onBulletEnhance}
                  />
                </div>
              </AnimatedCard>
            )}

            {/* Pending edit diff view (for text-selection edits, not inline bullet edits) */}
            {pendingEdit && !activeBullet && (
              <div className="mt-4" ref={(el) => el?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                <DiffView key={pendingEdit.originalText + pendingEdit.section} edit={pendingEdit} onAccept={handleAcceptEdit} onReject={onRejectEdit} />
              </div>
            )}

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

            {/* Below resume: workspace rail — collapsed by default */}
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
                />
              </CollapsibleWorkspaceRail>
            )}

            {isComplete && data.preScores && data.assembly && (
              <ScoringReportDetailsDisclosure
                preScores={data.preScores}
                assembly={data.assembly}
                verificationDetail={data.verificationDetail ?? null}
                gapAnalysis={data.gapAnalysis ?? null}
              />
            )}

            {/* Detailed analysis stays available, but below the working resume and review flow */}
            {isComplete && (
              <PipelineAnalysisSummary
                gapAnalysis={data.gapAnalysis}
                benchmarkCandidate={data.benchmarkCandidate}
                narrativeStrategy={data.narrativeStrategy}
                assembly={data.assembly}
                verificationDetail={data.verificationDetail}
              />
            )}
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
            <div className="flex items-center gap-2 text-xs text-[#f0d99f]/70 mb-4" role="status">
              <AlertCircle className="h-3 w-3" />
              Connection lost — waiting to reconnect...
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-[#f0b8b8]/28 bg-[#f0b8b8]/[0.08] px-4 py-3 text-sm text-[#f0b8b8]/90 mb-4" role="alert">
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


// ─── PipelineAnalysisSummary ──────────────────────────────────────────────────
// Displays the detailed pipeline analysis data between the scores and resume.
// All sections are collapsed by default.

interface PipelineAnalysisSummaryProps {
  gapAnalysis: GapAnalysis | null;
  benchmarkCandidate: BenchmarkCandidate | null;
  narrativeStrategy: NarrativeStrategy | null;
  assembly: AssemblyResult | null;
  verificationDetail: VerificationDetail | null;
}

function AnalysisSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] shadow-[0_2px_12px_rgba(0,0,0,0.18)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-[var(--surface-2)] transition-colors"
        aria-expanded={open}
      >
        <span className="shrink-0 text-[var(--text-soft)]">{icon}</span>
        <span className="flex-1 text-sm font-medium text-[var(--text-muted)]">{title}</span>
        {open
          ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-[var(--text-soft)]" />
          : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-soft)]" />
        }
      </button>
      {open && (
        <div className="border-t border-[var(--line-soft)] px-5 py-4 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

function PipelineAnalysisSummary({
  gapAnalysis,
  benchmarkCandidate,
  narrativeStrategy,
  assembly,
  verificationDetail,
}: PipelineAnalysisSummaryProps) {
  const [open, setOpen] = useState(false);
  const [showAllToneFindings, setShowAllToneFindings] = useState(false);
  const hasAnyData = gapAnalysis || benchmarkCandidate || narrativeStrategy || assembly || verificationDetail;
  if (!hasAnyData) return null;

  const truth = verificationDetail?.truth ?? null;
  const tone = verificationDetail?.tone ?? null;
  const ats = verificationDetail?.ats ?? assembly?.scores ?? null;
  const strongCount = gapAnalysis?.requirements.filter((r) => r.classification === 'strong').length ?? 0;
  const partialCount = gapAnalysis?.requirements.filter((r) => r.classification === 'partial').length ?? 0;
  const missingCount = gapAnalysis?.requirements.filter((r) => r.classification === 'missing').length ?? 0;

  return (
    <div className="mb-6" role="region" aria-label="Pipeline analysis summary">
      <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] shadow-[0_2px_12px_rgba(0,0,0,0.18)] overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-[var(--surface-2)] transition-colors"
          aria-expanded={open}
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-soft)]">Supporting Analysis</p>
            <p className="mt-1 text-sm font-medium text-[var(--text-muted)]">
              Open the full analysis if you want to inspect the benchmark, gap map, and verification details.
            </p>
          </div>
          {open
            ? <ChevronUp className="h-4 w-4 shrink-0 text-[var(--text-soft)]" />
            : <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-soft)]" />}
        </button>

        {open && (
          <div className="border-t border-[var(--line-soft)] px-1 py-3 space-y-2">
            {/* Gap Analysis Summary */}
            {gapAnalysis && (
              <AnalysisSection
                title={`Gap Analysis — ${strongCount} strong, ${partialCount} partial, ${missingCount} missing`}
                icon={<TrendingUp className="h-4 w-4" />}
              >
                {gapAnalysis.strength_summary && (
                  <p className="text-[13px] text-neutral-600 leading-relaxed">{gapAnalysis.strength_summary}</p>
                )}
                {/* Counts */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Strong Match', count: strongCount, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
                    { label: 'Partial Match', count: partialCount, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100' },
                    { label: 'Gap', count: missingCount, color: 'text-red-500', bg: 'bg-red-50 border-red-100' },
                  ].map(({ label, count, color, bg }) => (
                    <div key={label} className={`rounded-lg border px-3 py-2 text-center ${bg}`}>
                      <p className={`text-lg font-bold tabular-nums ${color}`}>{count}</p>
                      <p className="text-[11px] text-neutral-500">{label}</p>
                    </div>
                  ))}
                </div>
                {/* Critical gaps */}
                {gapAnalysis.critical_gaps.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1.5">Critical gaps to address</p>
                    <ul className="space-y-1">
                      {gapAnalysis.critical_gaps.map((gap, i) => (
                        <li key={i} className="flex items-start gap-2 text-[12px] text-neutral-600">
                          <X className="h-3 w-3 shrink-0 mt-0.5 text-red-400" />
                          {gap}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </AnalysisSection>
            )}

            {/* Benchmark Overview */}
            {benchmarkCandidate && (
              <AnalysisSection
                title="Benchmark Overview — What the ideal candidate looks like"
                icon={<Target className="h-4 w-4" />}
              >
                {benchmarkCandidate.ideal_profile_summary && (
                  <p className="text-[13px] text-neutral-600 leading-relaxed">{benchmarkCandidate.ideal_profile_summary}</p>
                )}
                {benchmarkCandidate.differentiators.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1.5">Key differentiators expected</p>
                    <ul className="space-y-1">
                      {benchmarkCandidate.differentiators.map((d, i) => (
                        <li key={i} className="flex items-start gap-2 text-[12px] text-neutral-600">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                          {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </AnalysisSection>
            )}

            {/* Narrative Strategy */}
            {narrativeStrategy && (
              <AnalysisSection
                title="Narrative Strategy — Positioning angle and Why Me story"
                icon={<Lightbulb className="h-4 w-4" />}
              >
                {narrativeStrategy.primary_narrative && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1">Positioning Angle</p>
                    <p className="text-[13px] font-medium text-blue-600 leading-relaxed">{narrativeStrategy.primary_narrative}</p>
                  </div>
                )}
                {narrativeStrategy.why_me_concise && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1">Why Me</p>
                    <p className="text-[13px] text-neutral-600 leading-relaxed italic">"{narrativeStrategy.why_me_concise}"</p>
                  </div>
                )}
                {narrativeStrategy.supporting_themes.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1.5">Supporting themes</p>
                    <div className="flex flex-wrap gap-1.5">
                      {narrativeStrategy.supporting_themes.map((theme, i) => (
                        <span
                          key={i}
                          className="rounded-md border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-600"
                        >
                          {theme}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </AnalysisSection>
            )}

            {/* Verification Results */}
            {(truth || tone || ats) && (
              <AnalysisSection
                title={`Verification Results — Truth${truth ? ` ${truth.truth_score}/100` : ''}, Tone${tone ? ` ${tone.tone_score}/100` : ''}, ATS${assembly ? ` ${assembly.scores.ats_match}%` : ''}`}
                icon={<ShieldCheck className="h-4 w-4" />}
              >
                <div className="grid grid-cols-3 gap-2">
                  {truth && (
                    <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-center">
                      <p className="text-lg font-bold tabular-nums text-blue-600">{truth.truth_score}</p>
                      <p className="text-[11px] text-neutral-500">Truth Score</p>
                      <p className="mt-0.5 text-[10px] text-neutral-400">
                        {truth.claims.filter((c) => c.confidence === 'verified').length} verified
                        {truth.flagged_items.length > 0 ? `, ${truth.flagged_items.length} flagged` : ''}
                      </p>
                    </div>
                  )}
                  {tone && (
                    <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-center">
                      <p className="text-lg font-bold tabular-nums text-amber-600">{tone.tone_score}</p>
                      <p className="text-[11px] text-neutral-500">Tone Score</p>
                      <p className="mt-0.5 text-[10px] text-neutral-400">
                        {tone.findings.length === 0 ? 'No issues' : `${tone.findings.length} finding${tone.findings.length !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                  )}
                  {assembly && (
                    <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-center">
                      <p className="text-lg font-bold tabular-nums text-emerald-600">{assembly.scores.ats_match}%</p>
                      <p className="text-[11px] text-neutral-500">ATS Match</p>
                      <p className="mt-0.5 text-[10px] text-neutral-400">After optimization</p>
                    </div>
                  )}
                </div>
                {truth && truth.claims.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[11px] uppercase tracking-wider text-neutral-400">Claim breakdown ({truth.claims.length} total)</p>
                    <div className="flex flex-wrap gap-2">
                      {(['verified', 'plausible', 'unverified', 'fabricated'] as const).map((conf) => {
                        const count = truth.claims.filter((c) => c.confidence === conf).length;
                        if (count === 0) return null;
                        const color = conf === 'verified'
                          ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
                          : conf === 'plausible'
                            ? 'text-blue-600 bg-blue-50 border-blue-100'
                            : conf === 'unverified'
                              ? 'text-amber-600 bg-amber-50 border-amber-100'
                              : 'text-red-500 bg-red-50 border-red-100';
                        return (
                          <span key={conf} className={`rounded-md border px-2 py-0.5 text-[11px] capitalize ${color}`}>
                            {count} {conf}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
                {tone && tone.findings.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[11px] uppercase tracking-wider text-neutral-400">Tone findings</p>
                    <ul className="space-y-1">
                      {(showAllToneFindings ? tone.findings : tone.findings.slice(0, 3)).map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-[12px] text-neutral-600">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                          <span>
                            <span className="font-medium">{f.section}:</span> {f.issue ?? f.text}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {tone.findings.length > 3 && (
                      <button
                        type="button"
                        onClick={() => setShowAllToneFindings((p) => !p)}
                        className="mt-1.5 flex cursor-pointer items-center gap-1 text-[11px] text-neutral-400 transition-colors hover:text-neutral-600"
                      >
                        {showAllToneFindings ? (
                          <><ChevronUp className="h-3 w-3" />Show fewer findings</>
                        ) : (
                          <><ChevronDown className="h-3 w-3" />Show all {tone.findings.length} findings</>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </AnalysisSection>
            )}
          </div>
        )}
      </div>
    </div>
  );
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
