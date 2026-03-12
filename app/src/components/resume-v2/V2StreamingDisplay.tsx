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
import { Loader2, CheckCircle2, AlertCircle, Briefcase, Compass, FileText, Shield, Undo2, Redo2 } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import type { V2PipelineData, V2Stage, ResumeDraft } from '@/types/resume-v2';
import type { StrategyApprovals } from './cards/GapAnalysisCard';
import type { EditAction, PendingEdit } from '@/hooks/useInlineEdit';
import { JobIntelligenceCard } from './cards/JobIntelligenceCard';
import { CandidateIntelligenceCard } from './cards/CandidateIntelligenceCard';
import { BenchmarkCandidateCard } from './cards/BenchmarkCandidateCard';
import { GapAnalysisCard } from './cards/GapAnalysisCard';
import { NarrativeStrategyCard } from './cards/NarrativeStrategyCard';
import { ResumeDocumentCard } from './cards/ResumeDocumentCard';
import { ScoresCard } from './cards/ScoresCard';
import { InlineEditToolbar } from './InlineEditToolbar';
import { DiffView } from './DiffView';
import { AddContextCard } from './AddContextCard';
import { ExportBar } from './ExportBar';

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
  onAcceptEdit: () => void;
  onRejectEdit: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onAddContext: (context: string) => void;
  isRerunning: boolean;
  strategyApprovals: StrategyApprovals;
  onStrategyChange: (approvals: StrategyApprovals) => void;
}

const STAGE_ORDER: V2Stage[] = ['analysis', 'strategy', 'writing', 'verification', 'assembly', 'complete'];

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

export function V2StreamingDisplay({
  data, isComplete, isConnected, error,
  editableResume, pendingEdit, isEditing, editError, undoCount, redoCount,
  onRequestEdit, onAcceptEdit, onRejectEdit, onUndo, onRedo,
  onAddContext, isRerunning,
  strategyApprovals, onStrategyChange,
}: V2StreamingDisplayProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);

  // Toolbar position state
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number } | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [selectedSection, setSelectedSection] = useState('');

  // Auto-scroll to bottom as new content arrives, unless user has scrolled up
  useEffect(() => {
    if (userScrolledRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data.stage, data.jobIntelligence, data.candidateIntelligence, data.benchmarkCandidate, data.gapAnalysis, data.narrativeStrategy, data.resumeDraft, data.assembly]);

  // Detect user scroll-up to stop auto-scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleScroll = () => {
      const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      userScrolledRef.current = !isAtBottom;
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // Handle text selection in resume document
  const handleTextSelect = useCallback((text: string, section: string, rect: DOMRect) => {
    setSelectedText(text);
    setSelectedSection(section);
    setToolbarPos({ top: rect.top, left: rect.left + rect.width / 2 });
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
      // Let mouseup in the resume handle new selections; only dismiss if clicking elsewhere
    };
    window.addEventListener('mousedown', handleMouseDown);
    return () => window.removeEventListener('mousedown', handleMouseDown);
  }, [toolbarPos]);

  const hasAnalysis = data.jobIntelligence || data.candidateIntelligence || data.benchmarkCandidate;
  const hasStrategy = data.gapAnalysis || data.narrativeStrategy;
  const displayResume = editableResume ?? data.assembly?.final_resume ?? data.resumeDraft;
  const hasResume = displayResume !== null && displayResume !== undefined;
  const canEdit = isComplete && displayResume !== null && displayResume !== undefined;

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto"
    >
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        {/* Connection/processing banner */}
        {!isComplete && isConnected && (
          <div className="flex items-center gap-2 text-xs text-white/40" role="status" aria-live="polite">
            <Loader2 className="h-3 w-3 motion-safe:animate-spin" />
            <span>{getStageMessage(data.stage)}</span>
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
        {hasAnalysis && (
          <section aria-label="Analysis">
            <StageBanner label="What they're looking for — and what you bring" icon={Briefcase} stage="analysis" currentStage={data.stage} isComplete={isComplete} />
            <div className="space-y-4">
              {data.jobIntelligence && (
                <GlassCard className="p-5"><JobIntelligenceCard data={data.jobIntelligence} /></GlassCard>
              )}
              {data.candidateIntelligence && (
                <GlassCard className="p-5"><CandidateIntelligenceCard data={data.candidateIntelligence} /></GlassCard>
              )}
              {data.benchmarkCandidate && (
                <GlassCard className="p-5"><BenchmarkCandidateCard data={data.benchmarkCandidate} /></GlassCard>
              )}
            </div>
          </section>
        )}

        {/* ─── Stage 2: Strategy ──────────────────────────────── */}
        {hasStrategy && (
          <section aria-label="Positioning strategy">
            <StageBanner label="Your positioning strategy" icon={Compass} stage="strategy" currentStage={data.stage} isComplete={isComplete} />
            <div className="space-y-4">
              {data.gapAnalysis && (
                <GlassCard className="p-5">
                  <GapAnalysisCard
                    data={data.gapAnalysis}
                    approvals={strategyApprovals}
                    onStrategyChange={onStrategyChange}
                    isComplete={isComplete}
                  />
                </GlassCard>
              )}
              {data.narrativeStrategy && (
                <GlassCard className="p-5"><NarrativeStrategyCard data={data.narrativeStrategy} /></GlassCard>
              )}
            </div>
          </section>
        )}

        {/* ─── Add Context (after strategy, when complete) ───── */}
        {isComplete && data.gapAnalysis && (
          <AddContextCard onSubmit={onAddContext} loading={isRerunning} />
        )}

        {/* ─── Stage 3+4+5: Resume ────────────────────────────── */}
        {hasResume && (
          <section aria-label="Your resume">
            <StageBanner label="Your resume" icon={FileText} stage="writing" currentStage={data.stage} isComplete={isComplete} />

            {/* Undo/redo bar (only when editing is available) */}
            {canEdit && (undoCount > 0 || redoCount > 0) && (
              <div className="flex items-center gap-1 mb-3">
                <button
                  type="button"
                  onClick={onUndo}
                  disabled={undoCount === 0}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-white/50 hover:bg-white/[0.06] disabled:opacity-30"
                  title="Undo"
                >
                  <Undo2 className="h-3 w-3" /> Undo
                </button>
                <button
                  type="button"
                  onClick={onRedo}
                  disabled={redoCount === 0}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-white/50 hover:bg-white/[0.06] disabled:opacity-30"
                  title="Redo"
                >
                  <Redo2 className="h-3 w-3" /> Redo
                </button>
              </div>
            )}

            {/* Scores (show when assembly is complete) */}
            {data.assembly && (
              <div className="mb-4">
                <ScoresCard scores={data.assembly.scores} quickWins={data.assembly.quick_wins} />
              </div>
            )}

            {/* Pending edit diff view */}
            {pendingEdit && (
              <div className="mb-4">
                <DiffView edit={pendingEdit} onAccept={onAcceptEdit} onReject={onRejectEdit} />
              </div>
            )}

            {/* Editing spinner */}
            {isEditing && (
              <div className="flex items-center gap-2 mb-4 text-xs text-white/40">
                <Loader2 className="h-3 w-3 motion-safe:animate-spin" />
                AI is editing...
              </div>
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
            )}
          </section>
        )}

        {/* ─── Completion ─────────────────────────────────────── */}
        {isComplete && data.assembly && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-[#b5dec2]/20 bg-[#b5dec2]/[0.06] px-4 py-3 text-sm text-[#b5dec2]/90" role="status">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Resume complete. Select any text above to edit with AI.
            </div>
            {displayResume && (
              <ExportBar
                resume={displayResume}
                companyName={data.jobIntelligence?.company_name}
                jobTitle={data.jobIntelligence?.role_title}
                atsScore={data.assembly.scores.ats_match}
              />
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

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
