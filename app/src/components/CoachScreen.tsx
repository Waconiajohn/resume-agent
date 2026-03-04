import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanelRight } from 'lucide-react';
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
import { WorkflowPreferencesCard } from '@/components/CoachScreenBanners';
import { useToast } from '@/components/Toast';
import type { ActivityMessage } from '@/components/IntelligenceActivityFeed';
import { useWorkspaceNavigation } from '@/hooks/useWorkspaceNavigation';
import { useWorkflowSession } from '@/hooks/useWorkflowSession';
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
  const [evidenceTargetDraft, setEvidenceTargetDraft] = useState<number>(8);
  const [localSnapshots, setLocalSnapshots] = useState<SnapshotMap>({});
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const prevPanelDataRef = useRef<PanelData | null>(null);
  const { addToast } = useToast();

  useEffect(() => {
    runPanelPayloadSmokeChecks();
  }, []);

  // Auto-open context panel when an interaction gate fires.
  // Auto-close only when the gate is cleared AND panel data is no longer an
  // interactive type. This prevents the panel from briefly closing during
  // intermediate gate responses (e.g. Apply on a suggestion sends a gate
  // response that optimistically clears isPipelineGateActive, but the
  // section_review panel data persists until the server sends a new event).
  useEffect(() => {
    if (isPipelineGateActive) {
      setContextPanelOpen(true);
    } else if (panelData) {
      const interactiveTypes = new Set([
        'section_review',
        'questionnaire',
        'blueprint_review',
        'positioning_interview',
      ]);
      if (!interactiveTypes.has(panelData.type)) {
        setContextPanelOpen(false);
      }
      // else: keep open — panel data is still interactive even though gate
      // was momentarily cleared (e.g. intermediate suggestion Apply).
    } else {
      setContextPanelOpen(false);
    }
  }, [isPipelineGateActive, panelData]);

  // ── Toast notifications (non-workflow-dependent) ──────────────
  // Error toast (replaces ErrorBanner)
  useEffect(() => {
    if (error) {
      addToast({ type: 'error', message: error });
    }
  }, [error, addToast]);

  // Workflow replan toast (replaces WorkflowReplanBanner)
  useEffect(() => {
    if (!liveWorkflowReplan) return;
    if (liveWorkflowReplan.state === 'in_progress') {
      addToast({ type: 'info', message: liveWorkflowReplan.message ?? 'Applying updated benchmark assumptions...' });
    } else if (liveWorkflowReplan.state === 'completed') {
      addToast({ type: 'success', message: `Benchmark replan applied (v${liveWorkflowReplan.benchmark_edit_version}).` });
    }
  }, [liveWorkflowReplan, addToast]);

  // Runtime recovery toast (replaces RuntimeRecoveryBanner)
  const prevStalledRef = useRef(false);
  useEffect(() => {
    const shouldShow = Boolean(stalledSuspected) || (!connected && Boolean(isProcessing));
    if (shouldShow && !prevStalledRef.current) {
      addToast({
        type: 'error',
        message: stalledSuspected
          ? 'Processing may be stalled. Try reconnecting.'
          : 'Live connection disconnected while processing.',
        duration: 8000,
        action: onReconnectStream
          ? <button type="button" onClick={onReconnectStream} className="mt-1 rounded bg-white/10 px-2.5 py-1 text-xs font-medium text-white/80 transition-colors hover:bg-white/20">Reconnect</button>
          : undefined,
      });
    }
    prevStalledRef.current = shouldShow;
  }, [stalledSuspected, connected, isProcessing, onReconnectStream, addToast]);

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

  // ── Workflow-dependent toast notifications ──────────────
  // Workflow error toast (replaces WorkflowErrorBanner)
  useEffect(() => {
    if (workflowSession.error) {
      addToast({ type: 'warning', message: 'Having trouble loading the latest workflow state.' });
    }
  }, [workflowSession.error, addToast]);

  // Workflow action toast (replaces WorkflowActionBanner)
  useEffect(() => {
    if (workflowSession.actionError) {
      addToast({ type: 'error', message: workflowSession.actionError });
    } else if (workflowSession.actionMessage) {
      addToast({ type: 'success', message: workflowSession.actionMessage });
    }
  }, [workflowSession.actionMessage, workflowSession.actionError, addToast]);

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

  const liveSnapshotCapturedAt = useMemo(
    () => new Date().toISOString(),
    // Re-stamp only when the content that defines the snapshot changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panelData, resume, activeNode],
  );

  const liveSnapshot: WorkspaceNodeSnapshot = useMemo(
    () => ({
      nodeKey: activeNode,
      panelType,
      panelData,
      resume,
      capturedAt: liveSnapshotCapturedAt,
      currentPhase: effectiveCurrentPhase,
      isGateActive: Boolean(isPipelineGateActive),
    }),
    [activeNode, panelType, panelData, resume, liveSnapshotCapturedAt, effectiveCurrentPhase, isPipelineGateActive],
  );

  const selectedSnapshot = selectedNode === activeNode
    ? liveSnapshot
    : (mergedSnapshots[selectedNode] ?? null);

  const isViewingLiveNode = selectedNode === activeNode;
  const displayPanelType = selectedSnapshot?.panelType ?? null;
  const displayPanelData = selectedSnapshot?.panelData ?? null;
  const displayResume = selectedSnapshot?.resume ?? resume;
  const effectivePipelineActivity = pipelineActivity ?? workflowSession.summary?.pipeline_activity_status ?? null;

  const draftReadiness = liveDraftReadiness ?? workflowSession.summary?.draft_readiness ?? null;
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

  const refreshWorkflowState = useCallback(async () => {
    await workflowSession.refreshSummary();
    const nodesToRefresh = new Set<WorkflowNodeKey>([selectedNode, activeNode]);
    await Promise.all(Array.from(nodesToRefresh).map((node) => workflowSession.refreshNode(node)));
  }, [workflowSession.refreshSummary, workflowSession.refreshNode, selectedNode, activeNode]);

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
      {/* Document fills all available space */}
      <div className="min-h-0 flex-1">
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

      {/* Slide-over context panel (fixed, doesn't affect layout) */}
      <ContextPanel
        isOpen={contextPanelOpen}
        onClose={toggleContextPanel}
        title={contextPanelTitle}
      >
        {/* Positioning profile choice (relocated from banner zone) */}
        {positioningProfileFound && onPipelineRespond && !profileChoiceMade && (
          <div className="border-b border-white/[0.08] px-4 py-3">
            <PositioningProfileChoice
              updatedAt={positioningProfileFound.updated_at}
              onChoice={(choice) => {
                onPipelineRespond('positioning_profile_choice', choice);
                setProfileChoiceMade(true);
              }}
            />
          </div>
        )}

        {/* Draft readiness summary (relocated from main view) */}
        {draftReadiness && (
          <details className="border-b border-white/[0.08]">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 select-none hover:bg-white/[0.03]">
              <span className={`h-2 w-2 shrink-0 rounded-full ${draftReadiness.ready ? 'bg-emerald-400' : 'bg-white/40'}`} />
              <span className="text-xs font-medium text-white/85">
                {draftReadiness.ready ? 'Ready To Draft' : 'Building Evidence'}
              </span>
              <span className="ml-auto text-[11px] text-white/40">
                {Math.round(draftReadiness.coverage_score)}% coverage
              </span>
            </summary>
            <div className="px-4 pb-3">
              <GlassCard className={`px-3 py-2.5 ${draftReadiness.ready ? 'border-emerald-300/25 bg-emerald-400/[0.05]' : ''}`}>
                <p className="text-xs text-white/65">
                  {draftReadiness.evidence_count} evidence items · {Math.round(draftReadiness.coverage_score)}% / {Math.round(draftReadiness.coverage_threshold)}% coverage · {draftReadiness.workflow_mode.replace('_', ' ')}
                </p>
                {draftReadiness.gap_breakdown && draftReadiness.gap_breakdown.total > 0 && (
                  <p className="mt-1.5 text-xs text-white/55">
                    <span className="text-emerald-200/75">{draftReadiness.gap_breakdown.strong} strong</span> · <span className="text-amber-200/75">{draftReadiness.gap_breakdown.partial} partial</span> · <span className="text-rose-200/75">{draftReadiness.gap_breakdown.gap} gaps</span>
                  </p>
                )}
              </GlassCard>
            </div>
          </details>
        )}

        {/* Benchmark inspector (relocated from main view) */}
        {selectedNode === 'benchmark' && (
          <div className="border-b border-white/[0.08]">
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
          </div>
        )}

        {/* Workflow preferences (relocated from main view) */}
        <div className="border-b border-white/[0.08]">
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
        </div>

        {/* Panel content */}
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

      {/* Floating button to open context panel when closed */}
      {!contextPanelOpen && (displayPanelData || isPipelineGateActive) && (
        <button
          type="button"
          onClick={toggleContextPanel}
          className="fixed right-4 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/[0.12] bg-[#0d1117]/90 p-2.5 text-white/60 shadow-lg backdrop-blur-xl transition-all hover:border-white/[0.2] hover:bg-[#0d1117] hover:text-white/90"
          aria-label="Open context panel"
        >
          <PanelRight className="h-5 w-5" />
        </button>
      )}

      {/* Mobile stats rail */}
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

      {/* Chat drawer with activity feed */}
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
        activityMessages={activityMessages}
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
