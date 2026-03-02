import { useEffect, useMemo, useRef, useState } from 'react';
import { ChatPanel } from './ChatPanel';
import { PositioningProfileChoice } from './PositioningProfileChoice';
import { WorkflowStatsRail } from './WorkflowStatsRail';
import { GlassCard } from './GlassCard';
import { GlassButton } from './GlassButton';
import { ResumePanel } from './ResumePanel';
import { SafePanelContent } from './panels/panel-renderer';
import { runPanelPayloadSmokeChecks } from './panels/panel-smoke';
import { WorkspaceShell } from './workspace/WorkspaceShell';
import { QuestionsNodeSummary } from '@/components/QuestionsNodeSummary';
import { SectionsNodeSummary } from '@/components/SectionsNodeSummary';
import { BenchmarkInspectorCard } from '@/components/BenchmarkInspectorCard';
import {
  ErrorBanner,
  WorkflowErrorBanner,
  PipelineActivityBanner,
  RuntimeRecoveryBanner,
  WorkflowActionBanner,
  WorkflowReplanBanner,
  WorkflowPreferencesCard,
} from '@/components/CoachScreenBanners';
import { useWorkspaceNavigation } from '@/hooks/useWorkspaceNavigation';
import { useWorkflowSession } from '@/hooks/useWorkflowSession';
import { PROCESS_STEP_CONTRACTS, processStepFromPhase, processStepFromWorkflowNode } from '@/constants/process-contract';
import { PHASE_LABELS } from '@/constants/phases';
import type {
  ChatMessage,
  ToolStatus,
  AskUserPromptData,
  PhaseGateData,
  DraftReadinessUpdate,
  WorkflowReplanUpdate,
  PipelineActivitySnapshot,
} from '@/types/session';
import type { FinalResume } from '@/types/resume';
import type { PanelType, PanelData } from '@/types/panels';
import {
  WORKFLOW_NODES,
  panelDataToWorkflowNode,
  phaseToWorkflowNode,
  type WorkflowNodeStatus,
  type WorkspaceNodeSnapshot,
  type WorkflowNodeKey,
} from '@/types/workflow';
import {
  type SnapshotMap,
  loadSnapshotMap,
  persistSnapshotMap,
  nodeTitle,
  formatPendingGateLabelForWorkspace,
  defaultEvidenceTargetForMode,
  formatReadinessPriorityLabel,
  formatRelativeShort,
  formatDurationShort,
  formatMsDurationShort,
  getSectionsBundleNavDetail,
  getSectionsBundleNavDetailFromSummary,
  buildReplanNodeDetailMap,
  computeNodeStatuses,
  renderNodeContentPlaceholder,
} from '@/lib/coach-screen-utils';

interface CoachScreenProps {
  sessionId?: string | null;
  accessToken?: string | null;
  messages: ChatMessage[];
  streamingText: string;
  tools: ToolStatus[];
  askPrompt: AskUserPromptData | null;
  phaseGate: PhaseGateData | null;
  currentPhase: string;
  isProcessing: boolean;
  connected?: boolean;
  lastBackendActivityAt?: string | null;
  stalledSuspected?: boolean;
  sessionComplete?: boolean;
  resume: FinalResume | null;
  panelType: PanelType | null;
  panelData: PanelData | null;
  error: string | null;
  onSendMessage: (content: string) => void | Promise<void>;
  isPipelineGateActive?: boolean;
  onPipelineRespond?: (gate: string, response: unknown) => void;
  positioningProfileFound?: { profile: unknown; updated_at: string } | null;
  onSaveCurrentResumeAsBase?: (
    mode: 'default' | 'alternate',
  ) => Promise<{ success: boolean; message: string }>;
  approvedSections?: Record<string, string>;
  onDismissSuggestion?: (id: string) => void;
  onRestartPipelineFromLastInputs?: (sessionId: string) => Promise<{ success: boolean; message: string }>;
  liveDraftReadiness?: DraftReadinessUpdate | null;
  liveWorkflowReplan?: WorkflowReplanUpdate | null;
  pipelineActivity?: PipelineActivitySnapshot | null;
  onReconnectStream?: () => void;
}

export function CoachScreen({
  sessionId = null,
  accessToken = null,
  messages,
  streamingText,
  tools,
  askPrompt,
  phaseGate,
  currentPhase,
  isProcessing,
  connected = false,
  lastBackendActivityAt = null,
  stalledSuspected = false,
  sessionComplete,
  resume,
  panelType,
  panelData,
  error,
  isPipelineGateActive,
  onSendMessage,
  onPipelineRespond,
  positioningProfileFound,
  onSaveCurrentResumeAsBase,
  approvedSections = {},
  onDismissSuggestion,
  onRestartPipelineFromLastInputs,
  liveDraftReadiness = null,
  liveWorkflowReplan = null,
  pipelineActivity = null,
  onReconnectStream,
}: CoachScreenProps) {
  const [profileChoiceMade, setProfileChoiceMade] = useState(false);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [isRestartingPipeline, setIsRestartingPipeline] = useState(false);
  const [evidenceTargetDraft, setEvidenceTargetDraft] = useState<number>(8);
  const [localSnapshots, setLocalSnapshots] = useState<SnapshotMap>({});
  const [runtimeClockMs, setRuntimeClockMs] = useState<number>(Date.now());
  const prevPanelDataRef = useRef<PanelData | null>(null);

  useEffect(() => {
    runPanelPayloadSmokeChecks();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setRuntimeClockMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setErrorDismissed(false);
  }, [error]);

  useEffect(() => {
    if (!sessionId) {
      setLocalSnapshots({});
      return;
    }
    setLocalSnapshots(loadSnapshotMap(sessionId));
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    persistSnapshotMap(sessionId, localSnapshots);
  }, [sessionId, localSnapshots]);

  // Capture the latest panel as a node snapshot so users can jump back.
  useEffect(() => {
    if (!panelData) return;
    const nodeKey = panelDataToWorkflowNode(panelData);
    if (!nodeKey) return;
    const panelDataChanged = panelData !== prevPanelDataRef.current;
    prevPanelDataRef.current = panelData;
    setLocalSnapshots((prev) => {
      const nextSnapshot: WorkspaceNodeSnapshot = {
        nodeKey,
        panelType,
        panelData,
        resume,
        capturedAt: panelDataChanged ? new Date().toISOString() : (prev[nodeKey]?.capturedAt ?? new Date().toISOString()),
        currentPhase,
        isGateActive: Boolean(isPipelineGateActive),
      };
      return {
        ...prev,
        [nodeKey]: nextSnapshot,
      };
    });
  }, [panelData, panelType, resume, currentPhase, isPipelineGateActive]);

  // Keep export snapshot refreshed when completion resume changes
  useEffect(() => {
    if (!resume || panelData?.type !== 'completion') return;
    setLocalSnapshots((prev) => {
      const existing = prev.export;
      if (!existing) return prev;
      return {
        ...prev,
        export: {
          ...existing,
          resume,
          capturedAt: new Date().toISOString(),
        },
      };
    });
  }, [resume, panelData?.type]);

  const activeNode = useMemo(
    () => panelDataToWorkflowNode(panelData) ?? phaseToWorkflowNode(currentPhase),
    [panelData, currentPhase],
  );

  const {
    selectedNode,
    canGoBack,
    canGoForward,
    goToNode,
    goBack,
    goForward,
    returnToActiveNode,
  } = useWorkspaceNavigation({
    sessionId,
    activeNode,
  });

  const workflowSession = useWorkflowSession({
    sessionId,
    accessToken,
    selectedNode,
    currentPhase,
  });
  const authoritativePipelinePhase = workflowSession.summary?.session.pipeline_stage ?? null;
  const effectiveCurrentPhase = authoritativePipelinePhase || currentPhase;

  useEffect(() => {
    if (!liveWorkflowReplan) return;
    if (liveWorkflowReplan.state !== 'completed') return;
    void workflowSession.refreshSummary();
  }, [liveWorkflowReplan, workflowSession.refreshSummary]);

  const mergedSnapshots: SnapshotMap = useMemo(
    () => ({
      ...localSnapshots,
      ...workflowSession.nodeSnapshots,
    }),
    [localSnapshots, workflowSession.nodeSnapshots],
  );

  const nodeStatuses = useMemo(
    () => {
      const local = computeNodeStatuses(
        activeNode,
        mergedSnapshots,
        isProcessing,
        Boolean(isPipelineGateActive),
        sessionComplete,
      );
      return WORKFLOW_NODES.reduce((acc, node) => {
        acc[node.key] = workflowSession.nodeStatuses[node.key] ?? local[node.key];
        return acc;
      }, {} as Record<WorkflowNodeKey, WorkflowNodeStatus>);
    },
    [
      activeNode,
      mergedSnapshots,
      isProcessing,
      isPipelineGateActive,
      sessionComplete,
      workflowSession.nodeStatuses,
    ],
  );

  const navItems = useMemo(
    () => {
      const effectiveLiveReplan = liveWorkflowReplan ?? workflowSession.summary?.replan_status ?? null;
      const effectiveDraftReadiness = liveDraftReadiness ?? workflowSession.summary?.draft_readiness ?? null;
      const replanNodeDetails = buildReplanNodeDetailMap(workflowSession.summary?.replan, effectiveLiveReplan);
      return WORKFLOW_NODES.map((node) => {
        const summaryNode = workflowSession.summary?.nodes.find((n) => n.node_key === node.key);
        const hasSnapshot = Boolean(mergedSnapshots[node.key])
          || Boolean(workflowSession.summary?.latest_artifacts.some((artifact) => artifact.node_key === node.key));
        const sectionBundleDetail = node.key === 'sections'
          ? (
              getSectionsBundleNavDetail(mergedSnapshots.sections)
              ?? getSectionsBundleNavDetailFromSummary(workflowSession.summary?.sections_bundle_review)
              ?? undefined
            )
          : undefined;
        const questionsDetail = node.key === 'questions'
          ? (() => {
              const metrics = workflowSession.summary?.question_response_metrics ?? null;
              const reuseMetrics = workflowSession.summary?.question_reuse_metrics ?? null;
              const highImpactTotal = metrics?.by_impact.high.total ?? 0;
              const highImpactAnswered = metrics?.by_impact.high.answered ?? 0;
              const highImpactRemaining = effectiveDraftReadiness?.high_impact_remaining?.filter((item) => item.priority === 'must_have').length
                ?? effectiveDraftReadiness?.high_impact_remaining?.length
                ?? 0;
              if (highImpactTotal > 0) {
                if (highImpactRemaining > 0) {
                  return `High impact ${highImpactAnswered}/${highImpactTotal} • ${highImpactRemaining} remaining`;
                }
                return `High impact ${highImpactAnswered}/${highImpactTotal}`;
              }
              if (highImpactRemaining > 0) {
                return `${highImpactRemaining} high-impact remaining`;
              }
              if ((metrics?.total ?? 0) > 0) {
                if ((reuseMetrics?.total_skipped ?? 0) > 0) {
                  return `Answered ${metrics?.answered ?? 0} • Reused ${reuseMetrics?.total_skipped}`;
                }
                return `Answered ${metrics?.answered ?? 0} • Deferred ${metrics?.deferred ?? 0}`;
              }
              if ((reuseMetrics?.total_skipped ?? 0) > 0) {
                return `Reused ${reuseMetrics?.total_skipped} repeats`;
              }
              return undefined;
            })()
          : undefined;
        const replanDetail = replanNodeDetails[node.key];
        return {
          ...node,
          status: nodeStatuses[node.key],
          hasSnapshot,
          detailLabel:
            (summaryNode?.blocking_state === 'rebuild_required' ? 'Rebuild required' : undefined)
            ?? replanDetail
            ?? questionsDetail
            ?? sectionBundleDetail,
        };
      });
    },
    [nodeStatuses, mergedSnapshots, workflowSession.summary, liveWorkflowReplan, liveDraftReadiness],
  );

  const liveSnapshot: WorkspaceNodeSnapshot = {
    nodeKey: activeNode,
    panelType,
    panelData,
    resume,
    capturedAt: new Date().toISOString(),
    currentPhase: effectiveCurrentPhase,
    isGateActive: Boolean(isPipelineGateActive),
  };

  const selectedSnapshot = selectedNode === activeNode
    ? liveSnapshot
    : (mergedSnapshots[selectedNode] ?? null);

  const isViewingLiveNode = selectedNode === activeNode;
  const displayPanelType = selectedSnapshot?.panelType ?? null;
  const displayPanelData = selectedSnapshot?.panelData ?? null;
  const displayResume = selectedSnapshot?.resume ?? resume;
  const displayPhase = isViewingLiveNode
    ? effectiveCurrentPhase
    : (selectedSnapshot?.currentPhase ?? effectiveCurrentPhase);
  const displayProcessStepKey = processStepFromWorkflowNode(selectedNode, { currentPhase: displayPhase });
  const displayProcessStep = PROCESS_STEP_CONTRACTS[displayProcessStepKey] ?? PROCESS_STEP_CONTRACTS[processStepFromPhase(displayPhase)];

  const effectivePipelineActivity = pipelineActivity ?? workflowSession.summary?.pipeline_activity_status ?? null;
  const runtimeMetricsSummary = workflowSession.summary?.runtime_metrics ?? null;

  const pipelineActivityStageElapsed = formatDurationShort(effectivePipelineActivity?.stage_started_at, runtimeClockMs);
  const pipelineActivityLastProgress = formatRelativeShort(effectivePipelineActivity?.last_progress_at, runtimeClockMs);
  const pipelineActivityLastHeartbeat = formatRelativeShort(effectivePipelineActivity?.last_heartbeat_at, runtimeClockMs);
  const pipelineActivityLastStageDuration = formatMsDurationShort(effectivePipelineActivity?.last_stage_duration_ms);
  const pipelineFirstProgressDuration = formatMsDurationShort(runtimeMetricsSummary?.first_progress_delay_ms);
  const pipelineFirstActionReadyDuration = formatMsDurationShort(runtimeMetricsSummary?.first_action_ready_delay_ms);

  const draftReadiness = liveDraftReadiness ?? workflowSession.summary?.draft_readiness ?? null;
  const draftPathDecision = workflowSession.summary?.draft_path_decision ?? null;
  const workflowPreferences = workflowSession.summary?.workflow_preferences ?? null;
  const activeWorkflowMode =
    workflowPreferences?.workflow_mode
    ?? draftReadiness?.workflow_mode
    ?? 'balanced';
  const activeMinimumEvidenceTarget =
    (typeof workflowPreferences?.minimum_evidence_target === 'number'
      ? workflowPreferences.minimum_evidence_target
      : (typeof draftReadiness?.minimum_evidence_target === 'number'
          ? draftReadiness.minimum_evidence_target
          : defaultEvidenceTargetForMode(activeWorkflowMode)));

  useEffect(() => {
    setEvidenceTargetDraft(activeMinimumEvidenceTarget);
  }, [activeMinimumEvidenceTarget, sessionId]);

  const refreshWorkflowState = async () => {
    await workflowSession.refreshSummary();
    const nodesToRefresh = new Set<WorkflowNodeKey>([selectedNode, activeNode]);
    await Promise.all(Array.from(nodesToRefresh).map((node) => workflowSession.refreshNode(node)));
  };

  const mainPanel = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-shrink-0 max-h-[40vh] overflow-y-auto">
        <ErrorBanner
          error={error}
          errorDismissed={errorDismissed}
          onDismiss={() => setErrorDismissed(true)}
        />
        <WorkflowErrorBanner
          error={workflowSession.error}
          loadingSummary={workflowSession.loadingSummary}
          loadingNode={workflowSession.loadingNode}
          onRefresh={async () => {
            await workflowSession.refreshSummary();
            await workflowSession.refreshNode(selectedNode);
          }}
        />
        <PipelineActivityBanner
          isViewingLiveNode={isViewingLiveNode}
          effectivePipelineActivity={effectivePipelineActivity}
          isProcessing={isProcessing}
          isPipelineGateActive={Boolean(isPipelineGateActive)}
          pipelineActivityStageElapsed={pipelineActivityStageElapsed}
          pipelineActivityLastStageDuration={pipelineActivityLastStageDuration}
          pipelineActivityLastProgress={pipelineActivityLastProgress}
          pipelineActivityLastHeartbeat={pipelineActivityLastHeartbeat}
          pipelineFirstProgressDuration={pipelineFirstProgressDuration}
          pipelineFirstActionReadyDuration={pipelineFirstActionReadyDuration}
        />
        <RuntimeRecoveryBanner
          stalledSuspected={Boolean(stalledSuspected)}
          connected={connected}
          isProcessing={isProcessing}
          pipelineActivityStageElapsed={pipelineActivityStageElapsed}
          pipelineActivityLastProgress={pipelineActivityLastProgress}
          onReconnectStream={onReconnectStream}
          loadingSummary={workflowSession.loadingSummary}
          loadingNode={workflowSession.loadingNode}
          selectedNode={selectedNode}
          activeNode={activeNode}
          onRefreshState={async () => {
            await workflowSession.refreshSummary();
            await workflowSession.refreshNode(selectedNode);
            await workflowSession.refreshNode(activeNode);
          }}
        />
        <WorkflowActionBanner
          actionMessage={workflowSession.actionMessage}
          actionError={workflowSession.actionError}
          actionRequiresRestart={workflowSession.actionRequiresRestart}
          sessionId={sessionId}
          isRestartingPipeline={isRestartingPipeline}
          isRestartPipelinePending={workflowSession.isRestartPipelinePending}
          isProcessing={isProcessing}
          onRestart={async () => {
            setIsRestartingPipeline(true);
            try {
              const usedWorkflowAction = await workflowSession.restartPipeline();
              if (!usedWorkflowAction.success && onRestartPipelineFromLastInputs && sessionId) {
                await onRestartPipelineFromLastInputs(sessionId);
              }
            } finally {
              setIsRestartingPipeline(false);
            }
          }}
          onDismiss={workflowSession.clearActionMessage}
        />
        <WorkflowReplanBanner
          summaryReplan={workflowSession.summary?.replan
            ? {
                ...workflowSession.summary.replan,
                rebuild_from_stage: workflowSession.summary.replan.rebuild_from_stage ?? undefined,
              }
            : null}
          summaryReplanStatus={workflowSession.summary?.replan_status ?? null}
          liveWorkflowReplan={liveWorkflowReplan ?? null}
        />
        {positioningProfileFound && onPipelineRespond && !profileChoiceMade && (
          <div className="px-3 pt-3">
            <PositioningProfileChoice
              updatedAt={positioningProfileFound.updated_at}
              onChoice={(choice) => {
                onPipelineRespond('positioning_profile_choice', choice);
                setProfileChoiceMade(true);
              }}
            />
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 p-3 md:p-4">
        <div className="flex h-full min-h-0 flex-col">
          <div className="mb-2 flex items-center gap-2 px-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
              Your Resume Progress
            </span>
            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/75">
              Step {displayProcessStep.number} of 7
            </span>
            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/70">
              {PHASE_LABELS[displayPhase] ?? displayPhase}
            </span>
            {!isViewingLiveNode && (
              <span className="rounded-full border border-white/[0.08] bg-white/[0.025] px-2 py-0.5 text-[10px] text-white/58">
                Previous version
              </span>
            )}
          </div>
          <div className="mb-2 px-1">
            <GlassCard className="px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-white/86">{displayProcessStep.title}</span>
                <span className="text-[10px] text-white/45">•</span>
                <span className="text-[11px] text-white/58">
                  {displayProcessStep.summary}
                </span>
              </div>
            </GlassCard>
          </div>

          {draftReadiness && (
            <div className="mb-2 px-1">
              <GlassCard className={`px-3 py-2.5 ${draftReadiness.ready ? 'border-emerald-300/25 bg-emerald-400/[0.05]' : ''}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                    draftReadiness.ready
                      ? 'border-emerald-300/30 bg-emerald-400/[0.10] text-emerald-100/90'
                      : 'border-white/[0.1] bg-white/[0.03] text-white/70'
                  }`}>
                    {draftReadiness.ready ? 'Ready To Draft' : 'Building Evidence'}
                  </span>
                  <span className="text-[11px] text-white/70">
                    Evidence: {draftReadiness.evidence_count}
                  </span>
                  <span className="text-[11px] text-white/60">•</span>
                  <span className="text-[11px] text-white/70">
                    Coverage {Math.round(draftReadiness.coverage_score)}% / {Math.round(draftReadiness.coverage_threshold)}%
                  </span>
                  <span className="text-[11px] text-white/60">•</span>
                  <span className="text-[11px] text-white/65">
                    {draftReadiness.workflow_mode.replace('_', ' ')}
                  </span>
                </div>
                {draftReadiness.note && (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-white/55">
                    {draftReadiness.note}
                  </p>
                )}
                {draftPathDecision && (displayPhase === 'gap_analysis' || displayPhase === 'architect' || displayPhase === 'architect_review' || displayPhase === 'section_writing' || displayPhase === 'section_review' || displayPhase === 'quality_review' || displayPhase === 'revision' || displayPhase === 'complete') && (
                  <div className={`mt-2 rounded-lg border px-2.5 py-2 ${
                    draftPathDecision.proceeding_reason === 'momentum_mode'
                      ? 'border-amber-300/18 bg-amber-400/[0.04]'
                      : 'border-emerald-300/18 bg-emerald-400/[0.04]'
                  }`}>
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span className={`rounded-full border px-1.5 py-0.5 ${
                        draftPathDecision.proceeding_reason === 'momentum_mode'
                          ? 'border-amber-300/20 bg-amber-400/[0.08] text-amber-100/85'
                          : 'border-emerald-300/20 bg-emerald-400/[0.08] text-emerald-100/85'
                      }`}>
                        {draftPathDecision.proceeding_reason === 'momentum_mode'
                          ? 'Proceeding with open items'
                          : 'Proceeding: readiness met'}
                      </span>
                      <span className="text-white/50">
                        {draftPathDecision.workflow_mode.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-white/72">
                      {draftPathDecision.message}
                    </p>
                    {(draftPathDecision.top_remaining || (draftPathDecision.blocking_reasons?.length ?? 0) > 0) && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {draftPathDecision.blocking_reasons?.includes('coverage_threshold')
                          && typeof draftPathDecision.remaining_coverage_needed === 'number'
                          && draftPathDecision.remaining_coverage_needed > 0 && (
                            <span className="rounded-full border border-sky-300/20 bg-sky-400/[0.06] px-2 py-0.5 text-[10px] text-sky-100/85">
                              +{draftPathDecision.remaining_coverage_needed}% coverage still open
                            </span>
                          )}
                        {draftPathDecision.top_remaining && (
                          <GlassButton
                            type="button"
                            variant="ghost"
                            className="h-6 px-2.5 text-[10px]"
                            onClick={() => goToNode('questions')}
                          >
                            Review: {draftPathDecision.top_remaining.requirement.length > 42
                              ? `${draftPathDecision.top_remaining.requirement.slice(0, 42)}...`
                              : draftPathDecision.top_remaining.requirement}
                          </GlassButton>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {(
                  typeof draftReadiness.remaining_evidence_needed === 'number'
                  || typeof draftReadiness.remaining_coverage_needed === 'number'
                  || typeof draftReadiness.suggested_question_count === 'number'
                ) && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {typeof draftReadiness.remaining_coverage_needed === 'number' && draftReadiness.remaining_coverage_needed > 0 && (
                      <span className="rounded-full border border-sky-300/20 bg-sky-400/[0.06] px-2 py-0.5 text-[10px] text-sky-100/85">
                        Need +{draftReadiness.remaining_coverage_needed}% coverage
                      </span>
                    )}
                    {typeof draftReadiness.suggested_question_count === 'number' && draftReadiness.suggested_question_count > 0 && (
                      <span className="rounded-full border border-white/[0.1] bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/70">
                        ~{draftReadiness.suggested_question_count} targeted question{draftReadiness.suggested_question_count === 1 ? '' : 's'} likely
                      </span>
                    )}
                    {!draftReadiness.ready && Array.isArray(draftReadiness.high_impact_remaining) && draftReadiness.high_impact_remaining.length > 0 && (
                      <GlassButton
                        type="button"
                        variant="ghost"
                        className="h-6 px-2.5 text-[10px]"
                        onClick={() => goToNode('questions')}
                      >
                        Open Questions
                      </GlassButton>
                    )}
                  </div>
                )}
                {draftReadiness.gap_breakdown && draftReadiness.gap_breakdown.total > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-white/55">
                    <span>Requirements</span>
                    <span className="rounded-full border border-emerald-300/18 bg-emerald-400/[0.05] px-2 py-0.5 text-emerald-100/80">
                      Strong {draftReadiness.gap_breakdown.strong}
                    </span>
                    <span className="rounded-full border border-amber-300/18 bg-amber-400/[0.05] px-2 py-0.5 text-amber-100/80">
                      Partial {draftReadiness.gap_breakdown.partial}
                    </span>
                    <span className="rounded-full border border-rose-300/18 bg-rose-400/[0.05] px-2 py-0.5 text-rose-100/80">
                      Gaps {draftReadiness.gap_breakdown.gap}
                    </span>
                  </div>
                )}
                {draftReadiness.evidence_quality && draftReadiness.evidence_count > 0 && (
                  <div className="mt-2 grid gap-1 sm:grid-cols-3">
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5">
                      <div className="text-[10px] uppercase tracking-[0.08em] text-white/35">Validated</div>
                      <div className="mt-0.5 text-[11px] text-white/78">
                        {draftReadiness.evidence_quality.user_validated_count}/{draftReadiness.evidence_count}
                      </div>
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5">
                      <div className="text-[10px] uppercase tracking-[0.08em] text-white/35">Metrics</div>
                      <div className="mt-0.5 text-[11px] text-white/78">
                        {draftReadiness.evidence_quality.metrics_defensible_count}/{draftReadiness.evidence_count}
                      </div>
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5">
                      <div className="text-[10px] uppercase tracking-[0.08em] text-white/35">Mapped To JD</div>
                      <div className="mt-0.5 text-[11px] text-white/78">
                        {draftReadiness.evidence_quality.mapped_requirement_evidence_count}/{draftReadiness.evidence_count}
                      </div>
                    </div>
                  </div>
                )}
                {Array.isArray(draftReadiness.high_impact_remaining) && draftReadiness.high_impact_remaining.length > 0 && (
                  <div className="mt-2">
                    <div className="text-[10px] uppercase tracking-[0.08em] text-white/40">
                      Highest-Impact Remaining Coverage
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {draftReadiness.high_impact_remaining.slice(0, 4).map((item, index) => (
                        <div
                          key={`${item.requirement}-${index}`}
                          className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-[10px] leading-relaxed text-white/75 transition-colors hover:border-white/[0.12] hover:bg-white/[0.03] cursor-pointer"
                          role="button"
                          tabIndex={0}
                          onClick={() => goToNode('questions')}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              goToNode('questions');
                            }
                          }}
                        >
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                            <span className={`rounded-full border px-1.5 py-0.5 ${
                              item.priority === 'must_have'
                                ? 'border-rose-300/25 bg-rose-400/[0.08] text-rose-100/85'
                                : item.priority === 'implicit'
                                  ? 'border-amber-300/25 bg-amber-400/[0.08] text-amber-100/85'
                                  : 'border-white/[0.1] bg-white/[0.03] text-white/60'
                            }`}>
                              {formatReadinessPriorityLabel(item.priority)}
                            </span>
                            <span className={`${
                              item.classification === 'gap' ? 'text-rose-100/80' : 'text-amber-100/80'
                            }`}>
                              {item.classification === 'gap' ? 'Gap' : 'Partial'}
                            </span>
                            {item.evidence_count > 0 && (
                              <span className="text-white/45">evidence {item.evidence_count}</span>
                            )}
                          </div>
                          <div className="mt-1 max-w-[24rem] truncate" title={item.requirement}>
                            {item.requirement}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </GlassCard>
            </div>
          )}

          <WorkflowPreferencesCard
            activeWorkflowMode={activeWorkflowMode}
            activeMinimumEvidenceTarget={activeMinimumEvidenceTarget}
            evidenceTargetDraft={evidenceTargetDraft}
            isUpdatingWorkflowPreferences={workflowSession.isUpdatingWorkflowPreferences}
            workflowPreferencesSource={workflowPreferences?.source ?? null}
            onChangeMode={async (mode) => {
              await workflowSession.updateWorkflowPreferences({ workflow_mode: mode });
            }}
            onChangeEvidenceTargetDraft={setEvidenceTargetDraft}
            onApplyEvidenceTarget={async () => {
              await workflowSession.updateWorkflowPreferences({
                minimum_evidence_target: evidenceTargetDraft,
              });
            }}
          />

          {selectedNode === 'benchmark' && (
            <BenchmarkInspectorCard
              panelData={displayPanelData}
              benchmarkEditSummary={workflowSession.summary?.benchmark_edit ?? null}
              replanSummary={workflowSession.summary?.replan ?? null}
              replanStatus={workflowSession.summary?.replan_status
                ? {
                    state: workflowSession.summary.replan_status.state,
                    benchmark_edit_version: workflowSession.summary.replan_status.benchmark_edit_version,
                  }
                : null}
              onSaveAssumptions={workflowSession.saveBenchmarkAssumptions}
              isSaving={workflowSession.isSavingBenchmarkAssumptions}
            />
          )}

          <GlassCard className="min-h-0 flex-1 overflow-y-auto">
            {displayPanelData ? (
              <SafePanelContent
                panelType={displayPanelType}
                panelData={displayPanelData}
                resume={displayResume}
                isProcessing={isViewingLiveNode ? isProcessing : false}
                onSendMessage={isViewingLiveNode ? onSendMessage : undefined}
                onPipelineRespond={isViewingLiveNode ? onPipelineRespond : undefined}
                onSaveCurrentResumeAsBase={isViewingLiveNode ? onSaveCurrentResumeAsBase : undefined}
                onDismissSuggestion={isViewingLiveNode ? onDismissSuggestion : undefined}
              />
            ) : displayResume ? (
              <ResumePanel resume={displayResume} />
            ) : selectedNode === 'questions' ? (
              <QuestionsNodeSummary
                isActiveNode={isViewingLiveNode}
                draftReadiness={draftReadiness}
                questionMetrics={workflowSession.summary?.question_response_metrics ?? null}
                questionHistory={workflowSession.summary?.question_response_history ?? null}
                questionReuseSummaries={workflowSession.summary?.question_reuse_summaries ?? null}
                questionReuseMetrics={workflowSession.summary?.question_reuse_metrics ?? null}
                onOpenQuestions={() => {
                  void workflowSession.refreshSummary();
                  void workflowSession.refreshNode('questions');
                }}
              />
            ) : selectedNode === 'sections' ? (
              <SectionsNodeSummary
                isActiveNode={isViewingLiveNode}
                bundleSummary={workflowSession.summary?.sections_bundle_review ?? null}
              />
            ) : (
              renderNodeContentPlaceholder(selectedNode, isViewingLiveNode)
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );

  const sidePanel = (
    <div className="flex h-full min-h-0 flex-col">
      <ChatPanel
        messages={messages}
        streamingText={streamingText}
        tools={tools}
        askPrompt={askPrompt}
        phaseGate={phaseGate}
        currentPhase={effectiveCurrentPhase}
        isProcessing={isProcessing}
        connected={connected}
        lastBackendActivityAt={lastBackendActivityAt}
        stalledSuspected={stalledSuspected}
        pipelineActivity={effectivePipelineActivity}
        runtimeMetrics={runtimeMetricsSummary}
        onReconnectStream={onReconnectStream}
        onRefreshWorkflowState={refreshWorkflowState}
        isRefreshingWorkflowState={workflowSession.loadingSummary || workflowSession.loadingNode}
        onSendMessage={onSendMessage}
        isPipelineGateActive={isPipelineGateActive}
        panelType={panelType}
        panelData={panelData}
        resume={resume}
        onPipelineRespond={onPipelineRespond}
        onSaveCurrentResumeAsBase={onSaveCurrentResumeAsBase}
        approvedSections={approvedSections}
        hideWorkProduct
      />
    </div>
  );

  const footerRail = (
    <>
      <div className="hidden lg:block">
        <WorkflowStatsRail
          currentPhase={effectiveCurrentPhase}
          isProcessing={isProcessing}
          isGateActive={Boolean(isPipelineGateActive)}
          stalledSuspected={Boolean(stalledSuspected)}
          pipelineActivity={effectivePipelineActivity}
          runtimeMetrics={runtimeMetricsSummary}
          sessionComplete={sessionComplete}
          error={error}
          panelData={panelData}
          resume={resume}
          compact={false}
        />
      </div>
      <div className="lg:hidden">
        <WorkflowStatsRail
          currentPhase={effectiveCurrentPhase}
          isProcessing={isProcessing}
          isGateActive={Boolean(isPipelineGateActive)}
          stalledSuspected={Boolean(stalledSuspected)}
          pipelineActivity={effectivePipelineActivity}
          runtimeMetrics={runtimeMetricsSummary}
          sessionComplete={sessionComplete}
          error={error}
          panelData={panelData}
          resume={resume}
          compact
        />
      </div>
    </>
  );

  return (
    <WorkspaceShell
      title="Resume Workspace"
      subtitle={isViewingLiveNode ? nodeTitle(selectedNode) : `${nodeTitle(selectedNode)} — Previous version`}
      nodes={navItems}
      selectedNode={selectedNode}
      activeNode={activeNode}
      canGoBack={canGoBack}
      canGoForward={canGoForward}
      onBack={goBack}
      onForward={goForward}
      onSelectNode={goToNode}
      activeGate={{
        active: Boolean(isPipelineGateActive),
        activeNode,
        label: formatPendingGateLabelForWorkspace(workflowSession.summary?.session.pending_gate ?? null),
        onReturn: returnToActiveNode,
        onGenerateDraftNow: workflowSession.summary?.replan?.requires_restart
          ? undefined
          : workflowSession.generateDraftNow,
        isGenerateDraftNowPending: workflowSession.isGenerateDraftNowPending,
      }}
      main={mainPanel}
      side={sidePanel}
      footerRail={footerRail}
    />
  );
}
