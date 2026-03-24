/**
 * V2StreamingDisplay — Output display for the v2 pipeline
 *
 * Two layout modes:
 *   1. Processing mode — minimal status bar only (no stage cards, no split panels)
 *   2. Resume mode — full-width centered document with inline editing
 *
 * The left panel (RewriteQueuePanel) and Live AI Review column are intentionally
 * not rendered. The SuggestionsBadge overlay (built separately) provides coaching
 * access without a persistent side panel.
 */

import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { Loader2, AlertCircle, Undo2, Redo2, ChevronDown, ChevronUp } from 'lucide-react';
import { ProcessingStatusBar } from './ProcessingStatusBar';
import type { V2PipelineData, V2Stage, ResumeDraft, InlineSuggestion } from '@/types/resume-v2';
import type { GapCoachingResponse, PreScores, GapCoachingCard as GapCoachingCardType } from '@/types/resume-v2';
import type { CoachingThreadSnapshot, FinalReviewChatContext, MasterPromotionItem, PostReviewPolishState } from '@/types/resume-v2';
import type { EditAction, PendingEdit } from '@/hooks/useInlineEdit';
import { ResumeDocumentCard } from './cards/ResumeDocumentCard';
import type { LiveScores } from '@/hooks/useLiveScoring';
import { InlineEditToolbar } from './InlineEditToolbar';
import { DiffView } from './DiffView';
import type { HiringManagerReviewResult, HiringManagerConcern } from '@/hooks/useHiringManagerReview';
import type { GapChatHook } from '@/hooks/useGapChat';
import type { FinalReviewChatHook } from '@/hooks/useFinalReviewChat';
import type { GapChatContext } from '@/types/resume-v2';
import { ReviewInboxCard } from './cards/ReviewInboxCard';
import { ResumeWorkspaceRail } from './ResumeWorkspaceRail';
import { buildRewriteQueue } from '@/lib/rewrite-queue';
import { SuggestionsBadge } from './SuggestionsBadge';
import { useInlineSuggestions } from '@/hooks/useInlineSuggestions';

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
}: V2StreamingDisplayProps) {
  // ── Inline suggestions ────────────────────────────────────────────────────
  const {
    suggestions,
    pendingCount,
    allResolved,
    accept: acceptSuggestion,
    reject: rejectSuggestion,
    scrollToNext,
    handleSuggestionEvent,
    containerRef,
  } = useInlineSuggestions();

  // Sync incoming suggestions from SSE into the suggestion hook state
  const prevSuggestionsRef = useRef<InlineSuggestion[]>([]);
  useEffect(() => {
    const incoming = data.inlineSuggestions;
    if (incoming === prevSuggestionsRef.current || incoming.length === 0) return;
    prevSuggestionsRef.current = incoming;
    handleSuggestionEvent({ suggestions: incoming });
  }, [data.inlineSuggestions, handleSuggestionEvent]);

  // Toolbar position state (for text-selection inline editing)
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number; bottom: number } | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [selectedSection, setSelectedSection] = useState('');

  // Active bullet for inline editing
  const [activeBullet, setActiveBullet] = useState<{
    section: string;
    index: number;
    requirements: string[];
  } | null>(null);

  const displayResume = editableResume ?? data.assembly?.final_resume ?? data.resumeDraft;
  const hasResume = displayResume !== null && displayResume !== undefined;

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

  // Show the full-width resume document once a draft exists.
  // Don't show it while re-running — the old assembly data persists and would be stale.
  const canShowResumeDocument = hasResume && !isRerunning;

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

  // ─── Full-width layout (resume exists) ───────────────────────────────────
  // Left panel (RewriteQueuePanel) and Live AI Review column are intentionally
  // not rendered here. They are preserved but not displayed in this layout.
  // The SuggestionsBadge overlay (built separately) provides the entry point
  // into inline coaching without a persistent side panel.
  if (canShowResumeDocument) {
    return (
      <div ref={containerRef} className="flex-1 overflow-y-auto relative">
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

          {/* Resume document with inline editing */}
          {displayResume && (
            <AnimatedCard index={0}>
              {/* Paper-on-desk document card */}
              <div className="bg-white rounded-lg shadow-[0_4px_32px_rgba(0,0,0,0.45)] overflow-hidden">
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
                  inlineSuggestions={suggestions}
                  onAcceptSuggestion={acceptSuggestion}
                  onRejectSuggestion={rejectSuggestion}
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

          {/* Below resume: workspace rail — collapsed by default */}
          {isComplete && data.assembly && displayResume && (
            <CollapsibleWorkspaceRail>
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
              verificationDetail={data.verificationDetail}
              gapAnalysis={data.gapAnalysis}
            />
            </CollapsibleWorkspaceRail>
          )}
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

        {/* SuggestionsBadge — fixed bottom-right overlay showing suggestion count */}
        <SuggestionsBadge
          pendingCount={pendingCount}
          isProcessing={!isComplete && data.inlineSuggestions.length === 0}
          processingStatus={null}
          allResolved={allResolved}
          onScrollToNext={scrollToNext}
          onExport={() => {
            // Export is handled by ResumeWorkspaceRail — scroll to it
            const rail = containerRef.current?.querySelector('[data-workspace-rail]');
            rail?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        />
      </div>
    );
  }

  // ─── Processing layout (pipeline running, no resume yet) ─────────────────
  // Shows a minimal status bar only — no stage cards, no phase dividers, no checklists.
  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto relative"
    >
      <div className="mx-auto max-w-[900px] px-6 py-8">
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

        {/* Minimal processing status bar */}
        <div
          className="bg-white/5 border border-white/10 rounded-2xl px-6 py-8"
        >
          <ProcessingStatusBar
            status={getStageStatusLabel(data.stage, isComplete)}
            progress={getStageProgressPercent(data.stage)}
            isComplete={isComplete}
          />
        </div>
      </div>
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

/** One-line status label shown in the processing status bar */
function getStageStatusLabel(stage: V2Stage, isComplete: boolean): string {
  if (isComplete) return 'Ready — review your suggestions below';
  switch (stage) {
    case 'intake':
    case 'analysis': return 'Reading your resume...';
    case 'strategy': return 'Building your positioning strategy...';
    case 'writing': return 'Drafting your resume...';
    case 'verification': return 'Running quality checks...';
    case 'assembly': return 'Preparing your suggestions...';
    case 'complete': return 'Ready — review your suggestions below';
    default: return 'Working on it...';
  }
}

/** 0–100 progress value for the processing status bar progress track */
function getStageProgressPercent(stage: V2Stage): number {
  switch (stage) {
    case 'intake': return 8;
    case 'analysis': return 25;
    case 'strategy': return 50;
    case 'writing': return 70;
    case 'verification': return 87;
    case 'assembly': return 95;
    case 'complete': return 100;
    default: return 0;
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
