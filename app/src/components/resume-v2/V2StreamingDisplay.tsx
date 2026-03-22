/**
 * V2StreamingDisplay — Accumulating output display for the v2 pipeline
 *
 * Two layout modes:
 *   1. Streaming mode — single-column, analysis cards stream in
 *   2. Split-screen mode — left: requirements checklist, right: resume + inline editing
 *
 * The split-screen activates once the resume exists (after gap coaching gate).
 */

import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Briefcase, Compass, Shield, Undo2, Redo2, ChevronDown } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { GlassButton } from '../GlassButton';
import type { V2PipelineData, V2Stage, ResumeDraft, JobIntelligence, CandidateIntelligence, BenchmarkCandidate, NarrativeStrategy } from '@/types/resume-v2';
import type { GapCoachingResponse, PreScores, GapCoachingCard as GapCoachingCardType } from '@/types/resume-v2';
import type { CoachingThreadSnapshot, FinalReviewChatContext, MasterPromotionItem, PostReviewPolishState } from '@/types/resume-v2';
import type { EditAction, PendingEdit } from '@/hooks/useInlineEdit';
import { JobIntelligenceCard } from './cards/JobIntelligenceCard';
import { CandidateIntelligenceCard } from './cards/CandidateIntelligenceCard';
import { BenchmarkCandidateCard } from './cards/BenchmarkCandidateCard';
import { UnifiedGapAnalysisCard } from './cards/UnifiedGapAnalysisCard';
import { NarrativeStrategyCard } from './cards/NarrativeStrategyCard';
import { ResumeDocumentCard } from './cards/ResumeDocumentCard';
import type { LiveScores } from '@/hooks/useLiveScoring';
import { InlineEditToolbar } from './InlineEditToolbar';
import { DiffView } from './DiffView';
import { PreScoreReportCard } from './cards/PreScoreReportCard';
import { RewriteQueuePanel } from './panels/RewriteQueuePanel';
import type { HiringManagerReviewResult, HiringManagerConcern } from '@/hooks/useHiringManagerReview';
import type { GapChatHook } from '@/hooks/useGapChat';
import type { FinalReviewChatHook } from '@/hooks/useFinalReviewChat';
import type { GapChatContext } from '@/types/resume-v2';
import { scrollToBullet } from './useStrategyThread';
import { ReviewInboxCard } from './cards/ReviewInboxCard';
import { ResumeWorkspaceRail } from './ResumeWorkspaceRail';
import { ResumeAiWorklogCard } from './ResumeAiWorklogCard';
import { buildRewriteQueue } from '@/lib/rewrite-queue';

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
  workspaceMode?: 'analysis' | 'workspace';
  onOpenWorkspace?: () => void;
}

const STAGE_ORDER: V2Stage[] = ['intake', 'analysis', 'strategy', 'writing', 'verification', 'assembly', 'complete'];

function StageIndicator({ stage, currentStage, isComplete }: { stage: V2Stage; currentStage: V2Stage; isComplete: boolean }) {
  const stageIdx = STAGE_ORDER.indexOf(stage);
  const currentIdx = STAGE_ORDER.indexOf(currentStage);

  if (isComplete || currentIdx > stageIdx) {
    return <CheckCircle2 className="h-4 w-4 text-[#b5dec2] shrink-0" />;
  }
  if (currentIdx === stageIdx) {
    return <Loader2 className="h-4 w-4 text-[#afc4ff] shrink-0 motion-safe:animate-spin" />;
  }
  return <div className="h-4 w-4 rounded-full border border-white/20 shrink-0" />;
}

function StageBanner({ label, icon: Icon, stage, currentStage, isComplete }: {
  label: string;
  icon: typeof Briefcase;
  stage: V2Stage;
  currentStage: V2Stage;
  isComplete: boolean;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <StageIndicator stage={stage} currentStage={currentStage} isComplete={isComplete} />
      <Icon className="h-4 w-4 text-white/50" />
      <span className="text-sm font-medium text-white/70">{label}</span>
    </div>
  );
}

function PhaseDivider({ label }: { label: string }) {
  return (
    <div className="relative flex items-center gap-4 py-2 animate-[card-enter_500ms_ease-out_forwards]">
      <div className="flex-1 border-t border-white/[0.06]" />
      <span className="shrink-0 text-[11px] font-medium tracking-widest uppercase text-white/30 select-none">
        {label}
      </span>
      <div className="flex-1 border-t border-white/[0.06]" />
    </div>
  );
}

function StagePendingDots() {
  return (
    <div className="flex items-center gap-1.5 py-3 px-1" aria-label="Loading" role="status">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1.5 w-1.5 rounded-full bg-[#afc4ff]/60 animate-[dot-bounce_1.4s_ease-in-out_infinite]"
          style={{ animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </div>
  );
}

function LiveStageSummary({ stage, isActive }: { stage: V2Stage; isActive: boolean }) {
  const content = stage === 'analysis'
    ? {
        eyebrow: 'AI analysis in progress',
        title: 'We are reading the role and your current resume',
        detail: 'We are pulling direct requirements from the job description, adding benchmark signals the posting may have missed, and collecting the best proof already on your resume.',
        checklist: [
          'Read the strongest proof already on the resume',
          'Pull direct requirements from the job description',
          'Add benchmark expectations for a strong executive match',
          'Keep the progress visible long enough for you to follow it',
        ],
      }
    : {
        eyebrow: 'AI strategy in progress',
        title: 'We are building the requirement map',
        detail: 'Next we line each requirement up against the current resume so you can see what is already covered, what is only partial, and what still needs a better draft.',
        checklist: [
          'Map each requirement to current resume evidence',
          'Mark covered, partial, and missing requirements',
          'Prepare the first issue to fix with editable AI help',
          'Keep the next action visible instead of flashing it past you',
        ],
      };
  const [visibleChecklistCount, setVisibleChecklistCount] = useState(1);

  useEffect(() => {
    setVisibleChecklistCount(1);
    if (!isActive || content.checklist.length <= 1) return;

    const interval = window.setInterval(() => {
      setVisibleChecklistCount((current) => {
        if (current >= content.checklist.length) {
          window.clearInterval(interval);
          return current;
        }
        return current + 1;
      });
    }, 1200);

    return () => window.clearInterval(interval);
  }, [content.checklist.length, isActive, stage]);

  return (
    <div className="room-shell border border-[#afc4ff]/16 bg-[radial-gradient(circle_at_top_left,rgba(175,196,255,0.12),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] px-5 py-5">
      <p className="eyebrow-label text-[#c9d7ff]/72">{content.eyebrow}</p>
      <p className="mt-2 text-lg font-semibold text-white/88">{content.title}</p>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">{content.detail}</p>

      <div className="mt-4 support-callout border-[#afc4ff]/16 bg-[#afc4ff]/[0.05] px-4 py-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[#c9d7ff]/72">
          <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
          Live progress
        </div>
        <div className="mt-3 space-y-2">
          {content.checklist.slice(0, visibleChecklistCount).map((item, index) => {
            const isNewest = index === visibleChecklistCount - 1 && visibleChecklistCount < content.checklist.length;
            return (
              <div key={item} className="flex items-start gap-3 text-sm leading-6 text-white/76">
                <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${isNewest ? 'bg-[#afc4ff]' : 'bg-[#b5dec2]/80'}`} />
                <span>{item}</span>
              </div>
            );
          })}
        </div>
        {visibleChecklistCount < content.checklist.length && (
          <p className="mt-3 text-xs leading-5 text-white/48">
            More live updates will appear here as the analysis moves forward.
          </p>
        )}
      </div>
    </div>
  );
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

export function V2StreamingDisplay({
  data, isComplete, isConnected, error,
  editableResume, pendingEdit, isEditing, editError, undoCount, redoCount,
  onRequestEdit, onAcceptEdit, onRejectEdit, onUndo, onRedo,
  onAddContext, isRerunning,
  liveScores, isScoring,
  gapCoachingCards, onRespondGapCoaching, preScores, onIntegrateKeyword,
  previousResume, onDismissChanges,
  hiringManagerResult, resolvedFinalReviewConcernIds = [], isFinalReviewStale = false, finalReviewWarningsAcknowledged = false, onAcknowledgeFinalReviewWarnings,
  isHiringManagerLoading, hiringManagerError,
  onRequestHiringManagerReview, onApplyHiringManagerRecommendation,
  gapChat, gapChatSnapshot, buildChatContext,
  finalReviewChat, finalReviewChatSnapshot, buildFinalReviewChatContext, postReviewPolish,
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
  workspaceMode = 'workspace',
  onOpenWorkspace,
}: V2StreamingDisplayProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const analysisSectionRef = useRef<HTMLElement>(null);
  const strategySectionRef = useRef<HTMLElement>(null);
  const userScrolledRef = useRef(false);

  const [showScrollPill, setShowScrollPill] = useState(false);

  // Toolbar position state (for text selection editing)
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number; bottom: number } | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [selectedSection, setSelectedSection] = useState('');

  // Split-screen: active bullet for cross-referencing
  const [activeBullet, setActiveBullet] = useState<{
    section: string;
    index: number;
    requirements: string[];
  } | null>(null);

  const displayResume = editableResume ?? data.assembly?.final_resume ?? data.resumeDraft;
  const hasResume = displayResume !== null && displayResume !== undefined;

  useEffect(() => {
    if (userScrolledRef.current || hasResume) return;
    if (data.stage === 'analysis') {
      analysisSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (data.stage === 'strategy') {
      strategySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [data.stage, hasResume]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleScroll = () => {
      const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      userScrolledRef.current = !isAtBottom;
      setShowScrollPill(!isAtBottom && !isComplete && !hasResume);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [isComplete, hasResume]);

  useEffect(() => {
    if (isComplete) setShowScrollPill(false);
  }, [isComplete]);

  useEffect(() => {
    if (userScrolledRef.current && !isComplete && !hasResume) {
      setShowScrollPill(true);
    }
  }, [data.stage, data.jobIntelligence, data.candidateIntelligence, data.benchmarkCandidate, data.gapAnalysis, data.narrativeStrategy, data.resumeDraft, data.assembly, isComplete, hasResume]);

  const scrollToBottom = useCallback(() => {
    userScrolledRef.current = false;
    setShowScrollPill(false);
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleTextSelect = useCallback((text: string, section: string, rect: DOMRect) => {
    setSelectedText(text);
    setSelectedSection(section);
    setToolbarPos({ top: rect.top, left: rect.left + rect.width / 2, bottom: rect.bottom });
  }, []);

  const dismissToolbar = useCallback(() => {
    setToolbarPos(null);
    setSelectedText('');
    setSelectedSection('');
    window.getSelection()?.removeAllRanges();
  }, []);

  const handleToolbarAction = useCallback((action: EditAction, customInstruction?: string) => {
    dismissToolbar();
    onRequestEdit(selectedText, selectedSection, action, customInstruction);
  }, [selectedText, selectedSection, onRequestEdit, dismissToolbar]);

  useEffect(() => {
    if (!toolbarPos) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[role="toolbar"]')) return;
      if (target.closest('[data-section]')) return;
      dismissToolbar();
    };
    window.addEventListener('mousedown', handleMouseDown);
    return () => window.removeEventListener('mousedown', handleMouseDown);
  }, [toolbarPos, dismissToolbar]);

  // Bullet click handler for cross-referencing
  const handleBulletClick = useCallback((bulletText: string, section: string, bulletIndex: number, requirements: string[]) => {
    setActiveBullet((prev) => {
      if (prev?.section === section && prev?.index === bulletIndex) return null;
      return { section, index: bulletIndex, requirements };
    });
  }, []);

  // A4: Clear activeBullet after accepting an edit (inline panel should close)
  const handleAcceptEdit = useCallback((editedText: string) => {
    onAcceptEdit(editedText);
    setActiveBullet(null);
  }, [onAcceptEdit]);

  // Left panel: click a requirement to scroll to the addressing bullet
  const handleRequirementClick = useCallback((requirement: string) => {
    scrollToBullet(requirement);
  }, []);

  const hasAnalysis = data.jobIntelligence || data.candidateIntelligence || data.benchmarkCandidate;
  const hasStrategy = data.gapAnalysis || data.narrativeStrategy;
  const canEdit = isComplete && displayResume !== null && displayResume !== undefined;

  const currentStageIdx = STAGE_ORDER.indexOf(data.stage);
  const analysisRunning = !isComplete && data.stage === 'analysis' && !hasAnalysis;
  const strategyRunning = !isComplete && currentStageIdx >= STAGE_ORDER.indexOf('strategy') && !hasStrategy;
  const resumeRunning = !isComplete && (data.stage === 'writing' || data.stage === 'verification' || data.stage === 'assembly') && !hasResume;

  const canShowUndoBar = canEdit && (undoCount > 0 || redoCount > 0);

  // A1/A2: Clear activeBullet when re-running (stale state from previous run)
  useEffect(() => {
    if (isRerunning) {
      setActiveBullet(null);
    }
  }, [isRerunning]);

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

  // Can we show the split-screen? Need resume + core positioning data for the left panel
  // A2: Don't show split-screen while re-running (old assembly data persists)
  // C4: benchmarkCandidate not required — left panel degrades gracefully without it
  const canOfferSplitScreen = Boolean(hasResume && !isRerunning && data.jobIntelligence && data.gapAnalysis);
  const canShowSplitScreen = canOfferSplitScreen && workspaceMode === 'workspace';

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
  const unresolvedCriticalConcerns = hiringManagerResult
    ? hiringManagerResult.concerns.filter((concern) => (
      concern.severity === 'critical' && !resolvedFinalReviewConcernIds.includes(concern.id)
    ))
    : [];
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

  // ─── Split-screen layout (resume exists) ──────────────────────────────────
  if (canShowSplitScreen) {
    return (
      <div ref={containerRef} className="flex-1 overflow-hidden relative flex flex-col">
        {/* Sticky undo/redo bar */}
        {canShowUndoBar && (
          <div className="flex items-center gap-2 px-4 py-2 bg-[#0f141e]/85 border-b border-white/[0.06] shrink-0">
            <button
              type="button"
              onClick={onUndo}
              disabled={undoCount === 0}
              className="flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-xs text-white/50 hover:bg-white/[0.06] hover:text-white/80 disabled:opacity-30 transition-colors"
              title="Undo"
            >
              <Undo2 className="h-3 w-3" />
              <span>Undo</span>
              {undoCount > 0 && (
                <span className="rounded-sm bg-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-white/40">
                  {undoCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={redoCount === 0}
              className="flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-xs text-white/50 hover:bg-white/[0.06] hover:text-white/80 disabled:opacity-30 transition-colors"
              title="Redo"
            >
              <Redo2 className="h-3 w-3" />
              <span>Redo</span>
              {redoCount > 0 && (
                <span className="rounded-sm bg-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-white/40">
                  {redoCount}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Split-screen: left rewrite queue + right resume */}
        <div className="flex-1 flex min-h-0 flex-col xl:flex-row">
          {/* ─── Left panel: Unified rewrite queue ─── */}
          <div className="border-b border-white/[0.06] xl:border-b-0 xl:border-r xl:w-[46%] xl:relative max-h-[55vh] xl:max-h-none">
            <div className="h-full overflow-y-auto xl:absolute xl:inset-0">
              <RewriteQueuePanel
                jobIntelligence={data.jobIntelligence!}
                positioningAssessment={data.assembly?.positioning_assessment ?? null}
                gapAnalysis={data.gapAnalysis!}
                benchmarkCandidate={data.benchmarkCandidate ?? null}
                currentResume={displayResume}
                gapCoachingCards={gapCoachingCards}
                gapChat={gapChat}
                gapChatSnapshot={gapChatSnapshot}
                buildChatContext={buildChatContext}
                finalReviewResult={hiringManagerResult ?? null}
                finalReviewChat={finalReviewChat}
                finalReviewChatSnapshot={finalReviewChatSnapshot}
                buildFinalReviewChatContext={buildFinalReviewChatContext}
                resolvedFinalReviewConcernIds={resolvedFinalReviewConcernIds}
                onRequirementClick={handleRequirementClick}
                onRequestEdit={canEdit ? onRequestEdit : undefined}
                onApplyFinalReviewRecommendation={onApplyHiringManagerRecommendation}
                onRequestHiringManagerReview={onRequestHiringManagerReview}
                isEditing={isEditing}
              />
            </div>
          </div>

          {/* ─── Right panel: Resume + editing + tools ─── */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
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

              <div className="space-y-4">
                <ResumeAiWorklogCard
                  currentResume={displayResume}
                  jobIntelligence={data.jobIntelligence ?? null}
                  benchmarkCandidate={data.benchmarkCandidate ?? null}
                  gapAnalysis={data.gapAnalysis ?? null}
                  nextQueueItem={rewriteQueue?.nextItem ?? null}
                  queueSummary={rewriteQueue?.summary ?? { needsAttention: 0, partiallyAddressed: 0, resolved: 0, hardGapCount: 0 }}
                  hasFinalReview={Boolean(hiringManagerResult)}
                  isFinalReviewStale={isFinalReviewStale}
                  unresolvedCriticalCount={unresolvedCriticalConcerns.length}
                  postReviewPolish={postReviewPolish}
                />
              </div>

              {pendingEdit && <ReviewInboxCard pendingEdit={pendingEdit} />}

              {/* Verification spinner */}
              {!isComplete && (data.stage === 'verification' || data.stage === 'assembly') && (
                <div className="flex items-center gap-2 mb-4 text-xs text-white/40">
                  <Shield className="h-3 w-3" />
                  Checking every claim for accuracy and polishing the tone...
                </div>
              )}

              {/* Processing banner */}
              {!isComplete && isConnected && (
                <div className="flex items-center gap-2 text-xs text-white/40" role="status" aria-live="polite">
                  <Loader2 className="h-3 w-3 motion-safe:animate-spin" />
                  <span>{getStageMessage(data.stage)}</span>
                </div>
              )}

              {/* Resume document with inline editing */}
              {displayResume && (
                <AnimatedCard index={1}>
                  <GlassCard className="p-6">
                    {canEdit && (
                      <div className="mb-4 space-y-1 border-b border-white/[0.04] pb-3 text-xs text-white/38">
                        <p>Click a bullet to improve the wording, add proof, or review a suggested change.</p>
                        <p>Use text selection when you want a custom rewrite on a specific phrase.</p>
                      </div>
                    )}
                    <ResumeDocumentCard
                      resume={displayResume}
                      onTextSelect={canEdit ? handleTextSelect : undefined}
                      activeBullet={activeBullet}
                      onBulletClick={canEdit ? handleBulletClick : undefined}
                      pendingEdit={pendingEdit}
                      isEditing={isEditing}
                      onAcceptEdit={handleAcceptEdit}
                      onRejectEdit={onRejectEdit}
                      onRequestEdit={canEdit ? onRequestEdit : undefined}
                    />
                  </GlassCard>
                </AnimatedCard>
              )}

              {resumeRunning && <StagePendingDots />}

              {/* Pending edit diff view (for text-selection edits, not inline bullet edits) */}
              {pendingEdit && !activeBullet && (
                <div className="mt-4" ref={(el) => el?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                  <DiffView key={pendingEdit.originalText + pendingEdit.section} edit={pendingEdit} onAccept={handleAcceptEdit} onReject={onRejectEdit} />
                </div>
              )}

              {/* ─── Below resume: final review, export, and secondary controls ─── */}
              {isComplete && data.assembly && displayResume && (
                <ResumeWorkspaceRail
                  displayResume={displayResume}
                  pendingEdit={pendingEdit}
                  assembly={data.assembly}
                  companyName={data.jobIntelligence?.company_name}
                  jobTitle={data.jobIntelligence?.role_title}
                  atsScore={data.assembly.scores.ats_match}
                  hiringManagerResult={hiringManagerResult ?? null}
                  resolvedFinalReviewConcernIds={resolvedFinalReviewConcernIds}
                  isFinalReviewStale={isFinalReviewStale}
                  isHiringManagerLoading={isHiringManagerLoading}
                  hiringManagerError={hiringManagerError}
                  onRequestHiringManagerReview={onRequestHiringManagerReview}
                  onApplyHiringManagerRecommendation={onApplyHiringManagerRecommendation}
                  finalReviewChat={finalReviewChat}
                  buildFinalReviewChatContext={buildFinalReviewChatContext}
                  isEditing={isEditing}
                  queueSummary={rewriteQueue?.summary ?? { needsAttention: 0, partiallyAddressed: 0, resolved: 0, hardGapCount: 0 }}
                  nextQueueItemLabel={rewriteQueue?.nextItem?.title}
                  jobBreakdown={{
                    addressed: jobBreakdown.addressed,
                    total: jobBreakdown.total,
                    partial: jobBreakdown.partial,
                    missing: jobBreakdown.missing,
                    coverageScore: jobBreakdown.coverage_score,
                  }}
                  benchmarkBreakdown={{
                    addressed: benchmarkBreakdown.addressed,
                    total: benchmarkBreakdown.total,
                    partial: benchmarkBreakdown.partial,
                    missing: benchmarkBreakdown.missing,
                    coverageScore: benchmarkBreakdown.coverage_score,
                  }}
                  postReviewPolish={postReviewPolish}
                  finalReviewWarningsAcknowledged={finalReviewWarningsAcknowledged}
                  onAcknowledgeFinalReviewWarnings={onAcknowledgeFinalReviewWarnings}
                  onAddContext={onAddContext}
                  isRerunning={isRerunning}
                  masterSaveMode={masterSaveMode}
                  onChangeMasterSaveMode={onChangeMasterSaveMode}
                  onSaveCurrentToMaster={onSaveCurrentToMaster}
                  isSavingToMaster={isSavingToMaster}
                  masterSaveStatus={masterSaveStatus}
                  promotableMasterItems={promotableMasterItems}
                  selectedMasterPromotionIds={selectedMasterPromotionIds}
                  onToggleMasterPromotionItem={onToggleMasterPromotionItem}
                  onSelectAllMasterPromotionItems={onSelectAllMasterPromotionItems}
                  onClearMasterPromotionItems={onClearMasterPromotionItems}
                  jobIntelligence={data.jobIntelligence}
                  candidateIntelligence={data.candidateIntelligence}
                  benchmarkCandidate={data.benchmarkCandidate}
                  narrativeStrategy={data.narrativeStrategy}
                  isComplete={isComplete}
                  liveScores={liveScores}
                  isScoring={isScoring}
                  onIntegrateKeyword={onIntegrateKeyword}
                  preScores={preScores}
                  previousResume={previousResume}
                  onDismissChanges={onDismissChanges}
                />
              )}
            </div>
          </div>
        </div>

        {/* Floating toolbar (text selection) */}
        {canEdit && (
          <InlineEditToolbar
            position={toolbarPos}
            isEditing={isEditing}
            onAction={handleToolbarAction}
            onDismiss={dismissToolbar}
          />
        )}
      </div>
    );
  }

  // ─── Streaming layout (single column, before resume exists) ──────────────
  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto relative"
    >
      {canShowUndoBar && (
        <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2 bg-[#0f141e]/85 border-b border-white/[0.06]">
          <button
            type="button"
            onClick={onUndo}
            disabled={undoCount === 0}
            className="flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-xs text-white/50 hover:bg-white/[0.06] hover:text-white/80 disabled:opacity-30 transition-colors"
            title="Undo"
          >
            <Undo2 className="h-3 w-3" />
            <span>Undo</span>
            {undoCount > 0 && (
              <span className="rounded-sm bg-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-white/40">
                {undoCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={redoCount === 0}
            className="flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-xs text-white/50 hover:bg-white/[0.06] hover:text-white/80 disabled:opacity-30 transition-colors"
            title="Redo"
          >
            <Redo2 className="h-3 w-3" />
            <span>Redo</span>
            {redoCount > 0 && (
              <span className="rounded-sm bg-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-white/40">
                {redoCount}
              </span>
            )}
          </button>
        </div>
      )}

      <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        {/* Connection/processing banner */}
        {!isComplete && isConnected && (
          <div className="flex items-center gap-2 text-xs text-white/40" role="status" aria-live="polite">
            <Loader2 className="h-3 w-3 motion-safe:animate-spin" />
            <span>{getStageMessage(data.stage)}</span>
          </div>
        )}

        {!isComplete && !isConnected && data.stage !== 'intake' && (
          <div className="flex items-center gap-2 text-xs text-[#f0d99f]/70" role="status">
            <AlertCircle className="h-3 w-3" />
            Connection lost — waiting to reconnect...
          </div>
        )}

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

        {/* ─── Stage 1: Analysis ──────────────────────────────── */}
        {(hasAnalysis || analysisRunning) && (
            <section aria-label="Analysis" ref={analysisSectionRef}>
            <StageBanner label="AI is analyzing the role and your resume" icon={Briefcase} stage="analysis" currentStage={data.stage} isComplete={isComplete} />
            <div className="space-y-4">
              {data.stage === 'analysis' && !isComplete && (
                <AnimatedCard index={0}>
                  <LiveStageSummary stage="analysis" isActive={data.stage === 'analysis'} />
                </AnimatedCard>
              )}
              {hasAnalysis && data.stage === 'analysis' && !isComplete && (
                <div className="support-callout px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/38">Findings collected so far</p>
                  <p className="mt-2 text-sm leading-6 text-white/58">
                    These are intermediate findings that have already been collected. AI is still working, so let the live progress panel guide the pacing while these continue to fill in.
                  </p>
                </div>
              )}
              {data.jobIntelligence && (
                <AnimatedCard index={1}>
                  <GlassCard className="p-5"><JobIntelligenceCard data={data.jobIntelligence} isLive={data.stage === 'analysis' && !isComplete} /></GlassCard>
                </AnimatedCard>
              )}
              {data.candidateIntelligence && (
                <AnimatedCard index={2}>
                  <GlassCard className="p-5"><CandidateIntelligenceCard data={data.candidateIntelligence} isLive={data.stage === 'analysis' && !isComplete} /></GlassCard>
                </AnimatedCard>
              )}
              {data.benchmarkCandidate && (
                <AnimatedCard index={3}>
                  <GlassCard className="p-5"><BenchmarkCandidateCard data={data.benchmarkCandidate} isLive={data.stage === 'analysis' && !isComplete} /></GlassCard>
                </AnimatedCard>
              )}
              {data.stage === 'analysis' && !isComplete && <StagePendingDots />}
            </div>
          </section>
        )}

        {/* ─── Stage 2: Strategy ──────────────────────────────── */}
        {(hasStrategy || strategyRunning) && (
          <>
            <PhaseDivider label="Strategy & Positioning" />
            <section aria-label="Positioning strategy" ref={strategySectionRef}>
              <StageBanner label="AI is building your requirement map" icon={Compass} stage="strategy" currentStage={data.stage} isComplete={isComplete} />
              <div className="space-y-4">
                {data.stage === 'strategy' && !isComplete && (
                  <AnimatedCard index={0}>
                    <LiveStageSummary stage="strategy" isActive={data.stage === 'strategy'} />
                  </AnimatedCard>
                )}
                {hasStrategy && data.stage === 'strategy' && !isComplete && (
                  <div className="support-callout px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-white/38">Map building so far</p>
                    <p className="mt-2 text-sm leading-6 text-white/58">
                      The requirement map is still being assembled. Treat the panels below as work in progress while the live activity panel keeps walking through what AI is doing next.
                    </p>
                  </div>
                )}
                {data.gapAnalysis && (
                  <AnimatedCard index={1}>
                    <GlassCard className="p-5">
                      <UnifiedGapAnalysisCard
                        key={gapCoachingCards?.length ?? 0}
                        gapAnalysis={data.gapAnalysis}
                        gapCoachingCards={gapCoachingCards}
                        companyName={data.jobIntelligence?.company_name}
                        roleTitle={data.jobIntelligence?.role_title}
                        onRespondGapCoaching={onRespondGapCoaching}
                        onRequestEdit={canEdit ? onRequestEdit : undefined}
                        currentResume={displayResume}
                        isComplete={isComplete}
                        positioningAssessment={data.assembly?.positioning_assessment}
                      />
                    </GlassCard>
                  </AnimatedCard>
                )}
                {preScores && data.gapAnalysis && !isComplete && (
                  <AnimatedCard index={2}>
                    <PreScoreReportCard preScores={preScores} />
                  </AnimatedCard>
                )}
                {data.narrativeStrategy && (
                  <AnimatedCard index={3}>
                    <GlassCard className="p-5"><NarrativeStrategyCard data={data.narrativeStrategy} isLive={data.stage === 'strategy' && !isComplete} /></GlassCard>
                  </AnimatedCard>
                )}
                {data.stage === 'strategy' && !isComplete && <StagePendingDots />}
              </div>
            </section>
          </>
        )}

        {canOfferSplitScreen && workspaceMode === 'analysis' && (
          <>
            <PhaseDivider label="Next Step" />
            <section aria-label="Guided editing handoff">
              <GlassCard className="p-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="eyebrow-label">Ready to start guided editing</p>
                    <h2 className="text-xl font-semibold text-white/90">Finish reading first, then move into the side-by-side workspace.</h2>
                    <p className="max-w-3xl text-sm leading-6 text-white/62">
                      We finished the analysis and built the requirement map. Stay here as long as you want, then open the guided workspace when you are ready to fix the resume one requirement at a time.
                    </p>
                  </div>

                  <div className="support-callout px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-white/38">What changes in the next step</p>
                    <div className="mt-3 space-y-2 text-sm leading-6 text-white/68">
                      <p>You will see each requirement, the current proof on the resume, and a better draft you can edit or apply inline.</p>
                      <p>The analysis above will stay available until you choose to move on, so nothing disappears while you are still reading it.</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <GlassButton type="button" onClick={onOpenWorkspace}>
                      Open Guided Editing Workspace
                    </GlassButton>
                    <p className="text-xs leading-5 text-white/45">
                      No rush. Keep reading this analysis until you are ready.
                    </p>
                  </div>
                </div>
              </GlassCard>
            </section>
          </>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Floating "scroll to bottom" pill */}
      {showScrollPill && (
        <div className="sticky bottom-6 flex justify-center pointer-events-none">
          <button
            type="button"
            onClick={scrollToBottom}
            className="pointer-events-auto flex items-center gap-1.5 rounded-md border border-white/[0.12] bg-white/10 px-3.5 py-2 text-xs font-medium uppercase tracking-[0.1em] text-white/70 shadow-lg hover:bg-white/[0.15] hover:text-white/90 transition-colors animate-[pill-appear_200ms_ease-out_forwards]"
            aria-label="Scroll to new content"
          >
            <ChevronDown className="h-3 w-3" />
            New content
          </button>
        </div>
      )}

      {/* Floating toolbar */}
      {canEdit && (
        <InlineEditToolbar
          position={toolbarPos}
          isEditing={isEditing}
          onAction={handleToolbarAction}
          onDismiss={dismissToolbar}
        />
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
