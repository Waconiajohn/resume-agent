import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChatDrawer } from './ChatDrawer';
import { PositioningProfileChoice } from './PositioningProfileChoice';
import { WorkflowStatsRail } from './WorkflowStatsRail';
import { GlassCard } from './GlassCard';
import { ResumePanel } from './ResumePanel';
import { SafePanelContent } from './panels/panel-renderer';
import { LiveResumeDocument } from './panels/LiveResumeDocument';
import { LiveResumeDocumentErrorBoundary } from './panels/LiveResumeDocumentErrorBoundary';
import { ContextPanel } from './panels/ContextPanel';
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
import type { ActivityMessage } from '@/components/IntelligenceActivityFeed';
import { useWorkspaceNavigation } from '@/hooks/useWorkspaceNavigation';
import { useWorkflowSession } from '@/hooks/useWorkflowSession';
import { PROCESS_STEP_CONTRACTS, processStepFromPhase, processStepFromWorkflowNode } from '@/constants/process-contract';
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
import type { PanelType, PanelData, QualityDashboardData } from '@/types/panels';
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
  formatRelativeShort,
  formatDurationShort,
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
  sectionDrafts?: Record<string, string>;
  sectionDraftsVersion?: number;
  sectionBuildOrder?: string[];
  onDismissSuggestion?: (id: string) => void;
  onLocalSectionEdit?: (sectionKey: string, content: string) => void;
  onRestartPipelineFromLastInputs?: (sessionId: string) => Promise<{ success: boolean; message: string }>;
  liveDraftReadiness?: DraftReadinessUpdate | null;
  liveWorkflowReplan?: WorkflowReplanUpdate | null;
  pipelineActivity?: PipelineActivitySnapshot | null;
  onReconnectStream?: () => void;
  activityMessages?: ActivityMessage[];
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
  sectionDrafts = {},
  sectionDraftsVersion = 0,
  sectionBuildOrder = [],
  onDismissSuggestion,
  onLocalSectionEdit,
  onRestartPipelineFromLastInputs,
  liveDraftReadiness = null,
  liveWorkflowReplan = null,
  pipelineActivity = null,
  onReconnectStream,
  activityMessages = [],
}: CoachScreenProps) {
  const [profileChoiceMade, setProfileChoiceMade] = useState(false);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [isRestartingPipeline, setIsRestartingPipeline] = useState(false);
  const [evidenceTargetDraft, setEvidenceTargetDraft] = useState<number>(8);
  const [localSnapshots, setLocalSnapshots] = useState<SnapshotMap>({});
  const [runtimeClockMs, setRuntimeClockMs] = useState<number>(Date.now());
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const prevPanelDataRef = useRef<PanelData | null>(null);

  useEffect(() => {
    runPanelPayloadSmokeChecks();
  }, []);

  // Auto-open context panel when an interaction gate fires; auto-close when resolved
  useEffect(() => {
    if (isPipelineGateActive) {
      setContextPanelOpen(true);
    } else {
      setContextPanelOpen(false);
    }
  }, [isPipelineGateActive]);

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

  const pipelineActivityStageElapsed = formatDurationShort(effectivePipelineActivity?.stage_started_at, runtimeClockMs);
  const pipelineActivityLastProgress = formatRelativeShort(effectivePipelineActivity?.last_progress_at, runtimeClockMs);

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

  const toggleContextPanel = useCallback(() => {
    setContextPanelOpen((prev) => !prev);
  }, []);

  // Derive the currently-active section key from the panel data or section draft
  const activeSectionKey = useMemo(() => {
    if (displayPanelData?.type === 'section_review') {
      return displayPanelData.section ?? null;
    }
    return null;
  }, [displayPanelData]);

  // Context panel title derived from panel type
  const contextPanelTitle = useMemo(() => {
    if (!displayPanelData) return 'Context';
    switch (displayPanelData.type) {
      case 'questionnaire': return 'Questionnaire';
      case 'section_review': return 'Section Review';
      case 'blueprint_review': return 'Blueprint Review';
      case 'positioning_interview': return 'Positioning Interview';
      case 'quality_dashboard': return 'Quality Dashboard';
      case 'completion': return 'Completion';
      default: return 'Context';
    }
  }, [displayPanelData]);

  // Derive quality data from panel data for the document overlay
  const qualityOverlayData = useMemo<QualityDashboardData | null>(() => {
    // Check current and all snapshot panels for quality dashboard data
    if (displayPanelData?.type === 'quality_dashboard') {
      return displayPanelData as QualityDashboardData;
    }
    // Check if completion panel has scores
    if (displayPanelData?.type === 'completion') {
      if (typeof displayPanelData.ats_score === 'number') {
        return {
          ats_score: displayPanelData.ats_score,
          keyword_coverage: displayPanelData.keyword_coverage,
          authenticity_score: displayPanelData.authenticity_score,
        };
      }
    }
    // Check snapshots for a quality dashboard
    const qualitySnapshot = mergedSnapshots.quality;
    if (qualitySnapshot?.panelData?.type === 'quality_dashboard') {
      return qualitySnapshot.panelData as QualityDashboardData;
    }
    return null;
  }, [displayPanelData, mergedSnapshots]);

  // Handle inline section edits from the live document
  const handleEditSection = useCallback(
    (sectionKey: string, newContent: string) => {
      // If a section review gate is active for this section, respond via pipeline
      if (
        isViewingLiveNode
        && isPipelineGateActive
        && displayPanelData?.type === 'section_review'
        && displayPanelData.section === sectionKey
        && onPipelineRespond
      ) {
        const reviewToken = displayPanelData.review_token;
        onPipelineRespond(`section_review_${sectionKey}`, {
          approved: false,
          edited_content: newContent,
          review_token: reviewToken,
        });
      } else {
        // Update locally for post-pipeline edits
        onLocalSectionEdit?.(sectionKey, newContent);
      }
    },
    [isViewingLiveNode, isPipelineGateActive, displayPanelData, onPipelineRespond, onLocalSectionEdit],
  );

  const mainPanel = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
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
          messages={activityMessages}
          isProcessing={isProcessing}
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
            <span className="text-sm font-medium text-white/85">
              Step {displayProcessStep.number} · {displayProcessStep.title}
            </span>
            {!isViewingLiveNode && (
              <span className="text-xs italic text-white/45">previous version</span>
            )}
          </div>

          {draftReadiness && (
            <div className="mb-2 px-1">
              <GlassCard className={`px-3 py-2.5 ${draftReadiness.ready ? 'border-emerald-300/25 bg-emerald-400/[0.05]' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${draftReadiness.ready ? 'bg-emerald-400' : 'bg-white/40'}`} />
                  <span className="text-xs font-medium text-white/85">
                    {draftReadiness.ready ? 'Ready To Draft' : 'Building Evidence'}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-white/65">
                  {draftReadiness.evidence_count} evidence items · {Math.round(draftReadiness.coverage_score)}% / {Math.round(draftReadiness.coverage_threshold)}% coverage · {draftReadiness.workflow_mode.replace('_', ' ')}
                  {typeof draftReadiness.remaining_coverage_needed === 'number' && draftReadiness.remaining_coverage_needed > 0 && (
                    <> · <span className="text-sky-200/80">need +{draftReadiness.remaining_coverage_needed}%</span></>
                  )}
                  {typeof draftReadiness.suggested_question_count === 'number' && draftReadiness.suggested_question_count > 0 && (
                    <> · ~{draftReadiness.suggested_question_count} question{draftReadiness.suggested_question_count === 1 ? '' : 's'} likely</>
                  )}
                </p>
                {draftReadiness.note && (
                  <p className="mt-1 text-xs leading-relaxed text-white/50">
                    {draftReadiness.note}
                  </p>
                )}
                {draftPathDecision && (displayPhase === 'gap_analysis' || displayPhase === 'architect' || displayPhase === 'architect_review' || displayPhase === 'section_writing' || displayPhase === 'section_review' || displayPhase === 'quality_review' || displayPhase === 'revision' || displayPhase === 'complete') && (
                  <p className={`mt-2 text-xs leading-relaxed ${
                    draftPathDecision.proceeding_reason === 'momentum_mode' ? 'text-amber-100/75' : 'text-emerald-100/75'
                  }`}>
                    {draftPathDecision.proceeding_reason === 'momentum_mode' ? 'Proceeding with open items' : 'Readiness met'} — {draftPathDecision.message}
                    {draftPathDecision.blocking_reasons?.includes('coverage_threshold')
                      && typeof draftPathDecision.remaining_coverage_needed === 'number'
                      && draftPathDecision.remaining_coverage_needed > 0 && (
                        <> · <span className="text-sky-200/80">+{draftPathDecision.remaining_coverage_needed}% coverage still open</span></>
                      )}
                  </p>
                )}
                {draftReadiness.gap_breakdown && draftReadiness.gap_breakdown.total > 0 && (
                  <p className="mt-1.5 text-xs text-white/55">
                    Requirements: <span className="text-emerald-200/75">{draftReadiness.gap_breakdown.strong} strong</span> · <span className="text-amber-200/75">{draftReadiness.gap_breakdown.partial} partial</span> · <span className="text-rose-200/75">{draftReadiness.gap_breakdown.gap} gaps</span>
                  </p>
                )}
                {draftReadiness.evidence_quality && draftReadiness.evidence_count > 0 && (
                  <p className="mt-1 text-xs text-white/50">
                    Validated {draftReadiness.evidence_quality.user_validated_count}/{draftReadiness.evidence_count} · Metrics {draftReadiness.evidence_quality.metrics_defensible_count}/{draftReadiness.evidence_count} · Mapped {draftReadiness.evidence_quality.mapped_requirement_evidence_count}/{draftReadiness.evidence_count}
                  </p>
                )}
                {Array.isArray(draftReadiness.high_impact_remaining) && draftReadiness.high_impact_remaining.length > 0 && (
                  <div className="mt-2">
                    <div className="text-[11px] uppercase tracking-[0.08em] text-white/40">
                      Highest-Impact Remaining
                    </div>
                    <ul className="mt-1 space-y-1">
                      {draftReadiness.high_impact_remaining.slice(0, 4).map((item, index) => (
                        <li
                          key={`${item.requirement}-${index}`}
                          className="flex items-start gap-2 text-xs text-white/70 cursor-pointer transition-colors hover:text-white/85"
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
                          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                            item.priority === 'must_have'
                              ? 'bg-rose-400'
                              : item.priority === 'implicit'
                                ? 'bg-amber-400'
                                : 'bg-white/40'
                          }`} />
                          <span className="min-w-0">
                            <span className={item.classification === 'gap' ? 'text-rose-200/75' : 'text-amber-200/75'}>
                              {item.classification === 'gap' ? 'Gap' : 'Partial'}
                            </span>
                            {' · '}
                            <span className="truncate" title={item.requirement}>{item.requirement}</span>
                            {item.evidence_count > 0 && (
                              <span className="text-white/40"> · {item.evidence_count} evidence</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
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

          {/* Two-column layout: Live Document + Context Panel */}
          <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-white/[0.06]">
            {/* Left: Always-visible live resume document */}
            <div className="min-h-0 min-w-0 flex-1">
              <LiveResumeDocumentErrorBoundary>
                <LiveResumeDocument
                  sectionOrder={sectionBuildOrder}
                  sectionContent={sectionDrafts}
                  sectionDraftsVersion={sectionDraftsVersion}
                  approvedSections={approvedSections}
                  activeSectionKey={activeSectionKey}
                  onEditSection={handleEditSection}
                  resume={displayResume}
                  isProcessing={isViewingLiveNode ? isProcessing : false}
                  sessionComplete={sessionComplete}
                  qualityData={qualityOverlayData}
                />
              </LiveResumeDocumentErrorBoundary>
            </div>

            {/* Right: Context panel for interactions */}
            <ContextPanel
              isOpen={contextPanelOpen}
              onClose={toggleContextPanel}
              title={contextPanelTitle}
            >
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
            </ContextPanel>
          </div>
        </div>
      </div>
      </div>
      <div className="flex-shrink-0 lg:hidden">
        <WorkflowStatsRail
          currentPhase={effectiveCurrentPhase}
          isProcessing={isProcessing}
          isGateActive={Boolean(isPipelineGateActive)}
          stalledSuspected={Boolean(stalledSuspected)}
          pipelineActivity={effectivePipelineActivity}
          sessionComplete={sessionComplete}
          error={error}
          panelData={panelData}
          resume={resume}
          compact
        />
      </div>
      <ChatDrawer
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
      />
    </div>
  );

  const footerRail = (
    <WorkflowStatsRail
      currentPhase={effectiveCurrentPhase}
      isProcessing={isProcessing}
      isGateActive={Boolean(isPipelineGateActive)}
      stalledSuspected={Boolean(stalledSuspected)}
      pipelineActivity={effectivePipelineActivity}
      sessionComplete={sessionComplete}
      error={error}
      panelData={panelData}
      resume={resume}
      compact={false}
    />
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
      footerRail={footerRail}
    />
  );
}
