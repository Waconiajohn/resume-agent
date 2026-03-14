/**
 * V2StreamingDisplay — Accumulating output display for the v2 pipeline
 *
 * Shows each agent's output as it arrives:
 *   1. "What they're looking for" — Job Intelligence
 *   2. "What you bring" — Candidate Intelligence
 *   3. "The benchmark" — Benchmark Candidate
 *   4. "Your positioning" — Gap Analysis + Narrative Strategy
 *   5. "Your resume" — Full draft + scores
 *
 * Output accumulates. Nothing replaces. User can scroll up while later stages generate.
 * When pipeline is complete, inline AI editing is available on the resume.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Briefcase, Compass, FileText, Shield, Undo2, Redo2, ChevronDown } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import type { V2PipelineData, V2Stage, ResumeDraft } from '@/types/resume-v2';
import type { GapCoachingResponse, PreScores, GapCoachingCard as GapCoachingCardType } from '@/types/resume-v2';
import type { EditAction, PendingEdit } from '@/hooks/useInlineEdit';
import { JobIntelligenceCard } from './cards/JobIntelligenceCard';
import { CandidateIntelligenceCard } from './cards/CandidateIntelligenceCard';
import { BenchmarkCandidateCard } from './cards/BenchmarkCandidateCard';
import { UnifiedGapAnalysisCard } from './cards/UnifiedGapAnalysisCard';
import { PositioningAssessmentCard } from './cards/PositioningAssessmentCard';
import { StrategyAuditCard } from './cards/StrategyAuditCard';
import { NarrativeStrategyCard } from './cards/NarrativeStrategyCard';
import { StrategyPlacementCard } from './cards/StrategyPlacementCard';
import { ResumeDocumentCard } from './cards/ResumeDocumentCard';
import { ScoresCard } from './cards/ScoresCard';
import { KeywordScoreDashboard } from './cards/KeywordScoreDashboard';
import type { LiveScores } from '@/hooks/useLiveScoring';
import { InlineEditToolbar } from './InlineEditToolbar';
import { DiffView } from './DiffView';
import { AddContextCard } from './AddContextCard';
import { ExportBar } from './ExportBar';
import { WhatChangedCard } from './cards/WhatChangedCard';

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
  onRequestEdit: (selectedText: string, section: string, action: EditAction, customInstruction?: string) => void;
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
  /** Resume from the previous run — when present, show the WhatChanged card after re-run completes */
  previousResume?: ResumeDraft | null;
  onDismissChanges?: () => void;
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

/** Thin divider that labels a new phase group */
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

/** Three-dot loading indicator for in-progress stages with no output yet */
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

/** Wraps a card in a fade-in + slide-up animation with a staggered delay */
function AnimatedCard({ children, index = 0 }: { children: React.ReactNode; index?: number }) {
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
}: V2StreamingDisplayProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);

  // Scroll-to-bottom pill state
  const [showScrollPill, setShowScrollPill] = useState(false);

  // Toolbar position state
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number; bottom: number } | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [selectedSection, setSelectedSection] = useState('');

  // Auto-scroll to bottom as new content arrives, unless user has scrolled up
  useEffect(() => {
    if (userScrolledRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data.stage, data.jobIntelligence, data.candidateIntelligence, data.benchmarkCandidate, data.gapAnalysis, data.narrativeStrategy, data.resumeDraft, data.assembly]);

  // Detect user scroll-up: stop auto-scroll and show the "new content" pill
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleScroll = () => {
      const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      userScrolledRef.current = !isAtBottom;
      // Only show the pill when the user has scrolled up AND the pipeline is still running
      setShowScrollPill(!isAtBottom && !isComplete);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [isComplete]);

  // Hide pill once pipeline completes
  useEffect(() => {
    if (isComplete) setShowScrollPill(false);
  }, [isComplete]);

  // Show pill when new content arrives below and user is scrolled up
  useEffect(() => {
    if (userScrolledRef.current && !isComplete) {
      setShowScrollPill(true);
    }
  }, [data.stage, data.jobIntelligence, data.candidateIntelligence, data.benchmarkCandidate, data.gapAnalysis, data.narrativeStrategy, data.resumeDraft, data.assembly, isComplete]);

  const scrollToBottom = useCallback(() => {
    userScrolledRef.current = false;
    setShowScrollPill(false);
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Handle text selection in resume document
  const handleTextSelect = useCallback((text: string, section: string, rect: DOMRect) => {
    setSelectedText(text);
    setSelectedSection(section);
    setToolbarPos({ top: rect.top, left: rect.left + rect.width / 2, bottom: rect.bottom });
  }, []);

  // Dismiss toolbar
  const dismissToolbar = useCallback(() => {
    setToolbarPos(null);
    setSelectedText('');
    setSelectedSection('');
    window.getSelection()?.removeAllRanges();
  }, []);

  // Handle toolbar action
  const handleToolbarAction = useCallback((action: EditAction, customInstruction?: string) => {
    dismissToolbar();
    onRequestEdit(selectedText, selectedSection, action, customInstruction);
  }, [selectedText, selectedSection, onRequestEdit, dismissToolbar]);

  // Dismiss toolbar when clicking outside resume (mousedown on non-resume areas)
  useEffect(() => {
    if (!toolbarPos) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[role="toolbar"]')) return; // Don't dismiss when clicking toolbar itself
      if (target.closest('[data-section]')) return; // Let mouseup handle new selections
      dismissToolbar();
    };
    window.addEventListener('mousedown', handleMouseDown);
    return () => window.removeEventListener('mousedown', handleMouseDown);
  }, [toolbarPos, dismissToolbar]);

  const hasAnalysis = data.jobIntelligence || data.candidateIntelligence || data.benchmarkCandidate;
  const hasStrategy = data.gapAnalysis || data.narrativeStrategy;
  const displayResume = editableResume ?? data.assembly?.final_resume ?? data.resumeDraft;
  const hasResume = displayResume !== null && displayResume !== undefined;
  const canEdit = isComplete && displayResume !== null && displayResume !== undefined;

  // Determine which stage is currently loading but has no output yet
  const currentStageIdx = STAGE_ORDER.indexOf(data.stage);
  const analysisRunning = !isComplete && data.stage === 'analysis' && !hasAnalysis;
  const strategyRunning = !isComplete && currentStageIdx >= STAGE_ORDER.indexOf('strategy') && !hasStrategy;
  const resumeRunning = !isComplete && (data.stage === 'writing' || data.stage === 'verification' || data.stage === 'assembly') && !hasResume;

  const canShowUndoBar = canEdit && (undoCount > 0 || redoCount > 0);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto relative"
    >
      {/* Sticky undo/redo bar — only when editing history exists */}
      {canShowUndoBar && (
        <div className="sticky top-0 z-10 flex items-center gap-1 px-4 py-1.5 bg-[#0f141e]/80 backdrop-blur-md border-b border-white/[0.06]">
          <button
            type="button"
            onClick={onUndo}
            disabled={undoCount === 0}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-white/50 hover:bg-white/[0.06] hover:text-white/80 disabled:opacity-30 transition-colors"
            title="Undo"
          >
            <Undo2 className="h-3 w-3" />
            <span>Undo</span>
            {undoCount > 0 && (
              <span className="rounded bg-white/[0.08] px-1 py-0.5 font-mono text-[10px] text-white/40">
                {undoCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={redoCount === 0}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-white/50 hover:bg-white/[0.06] hover:text-white/80 disabled:opacity-30 transition-colors"
            title="Redo"
          >
            <Redo2 className="h-3 w-3" />
            <span>Redo</span>
            {redoCount > 0 && (
              <span className="rounded bg-white/[0.08] px-1 py-0.5 font-mono text-[10px] text-white/40">
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

        {/* Disconnected banner */}
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
          <section aria-label="Analysis">
            <StageBanner label="What they're looking for — and what you bring" icon={Briefcase} stage="analysis" currentStage={data.stage} isComplete={isComplete} />
            <div className="space-y-4">
              {data.jobIntelligence && (
                <AnimatedCard index={0}>
                  <GlassCard className="p-5"><JobIntelligenceCard data={data.jobIntelligence} /></GlassCard>
                </AnimatedCard>
              )}
              {data.candidateIntelligence && (
                <AnimatedCard index={1}>
                  <GlassCard className="p-5"><CandidateIntelligenceCard data={data.candidateIntelligence} /></GlassCard>
                </AnimatedCard>
              )}
              {data.benchmarkCandidate && (
                <AnimatedCard index={2}>
                  <GlassCard className="p-5"><BenchmarkCandidateCard data={data.benchmarkCandidate} /></GlassCard>
                </AnimatedCard>
              )}
              {analysisRunning && <StagePendingDots />}
            </div>
          </section>
        )}

        {/* ─── Stage 2: Strategy ──────────────────────────────── */}
        {(hasStrategy || strategyRunning) && (
          <>
            <PhaseDivider label="Strategy & Positioning" />
            <section aria-label="Positioning strategy">
              <StageBanner label="Your positioning strategy" icon={Compass} stage="strategy" currentStage={data.stage} isComplete={isComplete} />
              <div className="space-y-4">
                {data.gapAnalysis && (
                  <AnimatedCard index={0}>
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
                      />
                    </GlassCard>
                  </AnimatedCard>
                )}
                {data.narrativeStrategy && (
                  <AnimatedCard index={2}>
                    <GlassCard className="p-5"><NarrativeStrategyCard data={data.narrativeStrategy} /></GlassCard>
                  </AnimatedCard>
                )}
                {data.narrativeStrategy?.gap_positioning_map && data.narrativeStrategy.gap_positioning_map.length > 0 && (
                  <AnimatedCard index={3}>
                    <GlassCard className="p-5 border-[#b5dec2]/15">
                      <StrategyPlacementCard positioningMap={data.narrativeStrategy.gap_positioning_map} />
                    </GlassCard>
                  </AnimatedCard>
                )}
                {strategyRunning && <StagePendingDots />}
              </div>
            </section>
          </>
        )}

        {/* ─── Add Context (after strategy, when complete) ───── */}
        {isComplete && data.gapAnalysis && (
          <AnimatedCard index={0}>
            <AddContextCard onSubmit={onAddContext} loading={isRerunning} />
          </AnimatedCard>
        )}

        {/* ─── What Changed (after re-run, before resume) ─────── */}
        {isComplete && previousResume && displayResume && onDismissChanges && (
          <AnimatedCard index={0}>
            <WhatChangedCard
              previousResume={previousResume}
              currentResume={displayResume}
              onDismiss={onDismissChanges}
            />
          </AnimatedCard>
        )}

        {/* ─── Stage 3+4+5: Resume ────────────────────────────── */}
        {(hasResume || resumeRunning) && (
          <>
            <PhaseDivider label="Your Resume" />
            <section aria-label="Your resume">
              <StageBanner label="Your resume" icon={FileText} stage="writing" currentStage={data.stage} isComplete={isComplete} />

              {/* Scores (show when assembly is complete) */}
              {data.assembly && (
                <AnimatedCard index={0}>
                  <div className="mb-4">
                    {isComplete ? (
                      <KeywordScoreDashboard
                        pipelineScores={data.assembly.scores}
                        liveScores={liveScores}
                        quickWins={data.assembly.quick_wins}
                        isScoring={isScoring}
                        onIntegrateKeyword={onIntegrateKeyword}
                      />
                    ) : (
                      <ScoresCard scores={data.assembly.scores} quickWins={data.assembly.quick_wins} />
                    )}
                  </div>
                </AnimatedCard>
              )}

              {/* Verification spinner (during pipeline) */}
              {!isComplete && (data.stage === 'verification' || data.stage === 'assembly') && (
                <div className="flex items-center gap-2 mb-4 text-xs text-white/40">
                  <Shield className="h-3 w-3" />
                  Verifying accuracy, ATS compliance, and tone...
                </div>
              )}

              {/* Resume document */}
              {displayResume && (
                <AnimatedCard index={data.assembly ? 1 : 0}>
                  <GlassCard className="p-6">
                    {canEdit && (
                      <div className="mb-4 text-xs text-white/30 border-b border-white/[0.04] pb-2">
                        Select text to edit with AI
                      </div>
                    )}
                    <ResumeDocumentCard
                      resume={displayResume}
                      onTextSelect={canEdit ? handleTextSelect : undefined}
                    />
                  </GlassCard>
                </AnimatedCard>
              )}

              {/* Dots when resume stage is running but resume hasn't appeared yet */}
              {resumeRunning && <StagePendingDots />}

              {/* Editing spinner — below resume so user sees it inline */}
              {isEditing && (
                <div className="flex items-center gap-2 mt-4 text-xs text-white/40">
                  <Loader2 className="h-3 w-3 motion-safe:animate-spin" />
                  AI is editing...
                </div>
              )}

              {/* Pending edit diff view — below resume, auto-scrolls into view */}
              {pendingEdit && (
                <div className="mt-4" ref={(el) => el?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                  <DiffView key={pendingEdit.originalText + pendingEdit.section} edit={pendingEdit} onAccept={onAcceptEdit} onReject={onRejectEdit} />
                </div>
              )}
            </section>
          </>
        )}

        {/* ─── Completion ─────────────────────────────────────── */}
        {isComplete && data.assembly && (
          <>
            <PhaseDivider label="Assessment & Export" />
            <div className="space-y-4">
              {data.assembly.positioning_assessment && data.gapAnalysis && (
                <AnimatedCard index={0}>
                  <StrategyAuditCard
                    positioningAssessment={data.assembly.positioning_assessment}
                    gapAnalysis={data.gapAnalysis}
                  />
                </AnimatedCard>
              )}
              {data.assembly.positioning_assessment && (
                <AnimatedCard index={1}>
                  <PositioningAssessmentCard
                    assessment={data.assembly.positioning_assessment}
                    preScores={preScores}
                    companyName={data.jobIntelligence?.company_name}
                    roleTitle={data.jobIntelligence?.role_title}
                  />
                </AnimatedCard>
              )}
              <AnimatedCard index={2}>
                <div className="flex items-center gap-2 rounded-xl border border-[#b5dec2]/20 bg-[#b5dec2]/[0.06] px-4 py-3 text-sm text-[#b5dec2]/90" role="status">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Resume complete. Select any text above to edit with AI.
                </div>
              </AnimatedCard>
              {displayResume && (
                <AnimatedCard index={3}>
                  <ExportBar
                    resume={displayResume}
                    companyName={data.jobIntelligence?.company_name}
                    jobTitle={data.jobIntelligence?.role_title}
                    atsScore={data.assembly.scores.ats_match}
                  />
                </AnimatedCard>
              )}
            </div>
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
            className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-white/10 backdrop-blur-md px-3.5 py-1.5 text-xs font-medium text-white/70 shadow-lg hover:bg-white/[0.15] hover:text-white/90 transition-colors animate-[pill-appear_200ms_ease-out_forwards]"
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
    case 'intake': return 'Starting pipeline...';
    case 'analysis': return 'Analyzing the job and your background...';
    case 'strategy': return 'Building your positioning strategy...';
    case 'writing': return 'Writing your resume...';
    case 'verification': return 'Verifying accuracy, ATS compliance, and tone...';
    case 'assembly': return 'Assembling final resume...';
    case 'complete': return 'Complete';
    default: return 'Processing...';
  }
}
