import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanelRight } from 'lucide-react';
import { ChatDrawer } from './ChatDrawer';
import { PositioningProfileChoice } from './PositioningProfileChoice';
import { ResumePanel } from './ResumePanel';
import { InterviewLayout } from './InterviewLayout';
import { ReviewModeToolbar } from './ReviewModeToolbar';
import { ModeTransition } from './ModeTransition';
import { SafePanelContent } from './panels/panel-renderer';
import { LiveResumeDocument } from './panels/LiveResumeDocument';
import { LiveResumeDocumentErrorBoundary } from './panels/LiveResumeDocumentErrorBoundary';
import { ContextPanel } from './panels/ContextPanel';
import { runPanelPayloadSmokeChecks } from './panels/panel-smoke';
import { WorkspaceShell } from './workspace/WorkspaceShell';
import { useUIMode } from '@/hooks/useUIMode';
import { QuestionsNodeSummary } from '@/components/QuestionsNodeSummary';
import { SectionsNodeSummary } from '@/components/SectionsNodeSummary';
import { useToast } from '@/components/Toast';
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
  formatPendingGateLabelForWorkspace,
  getSectionsBundleNavDetail,
  getSectionsBundleNavDetailFromSummary,
  buildReplanNodeDetailMap,
  computeNodeStatuses,
  renderNodeContentPlaceholder,
} from '@/lib/coach-screen-utils';
import { decodeUserIdFromAccessToken } from '@/lib/auth-scoped-storage';

// Stable default prop references to avoid unnecessary re-renders
const EMPTY_APPROVED: Record<string, string> = {};
const EMPTY_DRAFTS: Record<string, string> = {};
const EMPTY_BUILD_ORDER: string[] = [];

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
  sectionBuildOrder?: string[];
  onDismissSuggestion?: (id: string) => void;
  onLocalSectionEdit?: (sectionKey: string, content: string) => void;
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
  approvedSections = EMPTY_APPROVED,
  sectionDrafts = EMPTY_DRAFTS,
  sectionBuildOrder = EMPTY_BUILD_ORDER,
  onDismissSuggestion,
  onLocalSectionEdit,
  liveDraftReadiness = null,
  liveWorkflowReplan = null,
  pipelineActivity = null,
  onReconnectStream,
}: CoachScreenProps) {
  const [profileChoiceMade, setProfileChoiceMade] = useState(false);
  const [localSnapshots, setLocalSnapshots] = useState<SnapshotMap>({});
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const prevPanelDataRef = useRef<PanelData | null>(null);
  const { addToast } = useToast();
  const storageUserId = useMemo(() => decodeUserIdFromAccessToken(accessToken), [accessToken]);

  // Stable ref for onReconnectStream so toast action buttons aren't stale
  const reconnectRef = useRef(onReconnectStream);
  reconnectRef.current = onReconnectStream;

  useEffect(() => {
    runPanelPayloadSmokeChecks();
  }, []);

  // Auto-open context panel when an interaction gate fires.
  // In interview mode, panel content renders inline — no ContextPanel auto-open needed.
  // Auto-close only when the gate is cleared AND panel data is no longer an
  // interactive type. This prevents the panel from briefly closing during
  // intermediate gate responses (e.g. Apply on a suggestion sends a gate
  // response that optimistically clears isPipelineGateActive, but the
  // section_review panel data persists until the server sends a new event).
  // Note: uiMode is checked via autoOpenGuardRef so this effect can run
  // before uiMode is defined in the component body. The ref is updated below.
  const autoOpenGuardRef = useRef<'interview' | 'review' | 'edit' | null>(null);
  useEffect(() => {
    // In interview mode, InterviewLayout handles panel content inline
    if (autoOpenGuardRef.current === 'interview') {
      setContextPanelOpen(false);
      return;
    }
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
      addToast({ type: 'info', message: liveWorkflowReplan.message ?? 'Updating your resume strategy based on your changes...' });
    } else if (liveWorkflowReplan.state === 'completed') {
      addToast({ type: 'success', message: 'Your changes have been applied. Your resume is being updated.' });
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
          ? <button type="button" onClick={() => reconnectRef.current?.()} className="mt-1 rounded bg-[var(--accent-muted)] px-2.5 py-1 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-1)]">Reconnect</button>
          : undefined,
      });
    }
    prevStalledRef.current = shouldShow;
    // onReconnectStream omitted — accessed via stable reconnectRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stalledSuspected, connected, isProcessing, addToast]);

  useEffect(() => {
    if (!sessionId) {
      setLocalSnapshots({});
      return;
    }
    setLocalSnapshots(loadSnapshotMap(sessionId, storageUserId));
  }, [sessionId, storageUserId]);

  useEffect(() => {
    if (!sessionId) return;
    persistSnapshotMap(sessionId, storageUserId, localSnapshots);
  }, [sessionId, storageUserId, localSnapshots]);

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
    goToNode,
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
  const prevWorkflowErrorRef = useRef<string | null>(null);
  useEffect(() => {
    const errStr = workflowSession.error ? String(workflowSession.error) : null;
    if (errStr && errStr !== prevWorkflowErrorRef.current) {
      addToast({ type: 'warning', message: 'Having trouble loading the latest workflow state.' });
    }
    prevWorkflowErrorRef.current = errStr;
  }, [workflowSession.error, addToast]);

  // Workflow action toast (replaces WorkflowActionBanner)
  const prevActionMsgRef = useRef<string | null>(null);
  const prevActionErrRef = useRef<string | null>(null);
  useEffect(() => {
    if (workflowSession.actionError && workflowSession.actionError !== prevActionErrRef.current) {
      addToast({ type: 'error', message: workflowSession.actionError });
    } else if (workflowSession.actionMessage && workflowSession.actionMessage !== prevActionMsgRef.current) {
      addToast({ type: 'success', message: workflowSession.actionMessage });
    }
    prevActionMsgRef.current = workflowSession.actionMessage ?? null;
    prevActionErrRef.current = workflowSession.actionError ?? null;
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

  const uiMode = useUIMode({
    effectiveCurrentPhase,
    isViewingLiveNode,
    selectedSnapshot,
  });
  autoOpenGuardRef.current = uiMode;

  // Close context panel when entering interview mode
  useEffect(() => {
    if (uiMode === 'interview') {
      setContextPanelOpen(false);
    }
  }, [uiMode]);

  const displayPanelType = selectedSnapshot?.panelType ?? null;
  const displayPanelData = selectedSnapshot?.panelData ?? null;
  const displayResume = selectedSnapshot?.resume ?? resume;
  const effectivePipelineActivity = pipelineActivity ?? workflowSession.summary?.pipeline_activity_status ?? null;

  const draftReadiness = liveDraftReadiness ?? workflowSession.summary?.draft_readiness ?? null;

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
    if (!displayPanelData) return 'Details';
    switch (displayPanelData.type) {
      case 'questionnaire': return 'Questions';
      case 'section_review': return 'Review This Section';
      case 'blueprint_review': return 'Your Resume Plan';
      case 'positioning_interview': return 'Your Story';
      case 'quality_dashboard': return 'Quality Score';
      case 'completion': return 'Your Resume Is Ready!';
      default: return 'Details';
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

  // ── Review mode handlers (Story 4) ──────────────────────
  const reviewModeActive = uiMode === 'review'
    && isViewingLiveNode
    && isPipelineGateActive
    && displayPanelData?.type === 'section_review';

  const handleApproveSection = useCallback(() => {
    if (!reviewModeActive || !displayPanelData || !onPipelineRespond) return;
    onPipelineRespond(`section_review_${displayPanelData.section}`, {
      approved: true,
      review_token: displayPanelData.review_token,
    });
  }, [reviewModeActive, displayPanelData, onPipelineRespond]);

  const handleQuickFixSection = useCallback((feedback: string) => {
    if (!reviewModeActive || !displayPanelData || !onPipelineRespond) return;
    onPipelineRespond(`section_review_${displayPanelData.section}`, {
      approved: false,
      feedback,
      review_token: displayPanelData.review_token,
    });
  }, [reviewModeActive, displayPanelData, onPipelineRespond]);

  const mainPanel = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <ModeTransition uiMode={uiMode}>
          {uiMode === 'interview' ? (
            <InterviewLayout
              effectiveCurrentPhase={effectiveCurrentPhase}
              panelType={displayPanelType}
              panelData={displayPanelData}
              resume={displayResume}
              isProcessing={isViewingLiveNode ? isProcessing : false}
              onSendMessage={isViewingLiveNode ? onSendMessage : undefined}
              onPipelineRespond={isViewingLiveNode ? onPipelineRespond : undefined}
              onSaveCurrentResumeAsBase={isViewingLiveNode ? onSaveCurrentResumeAsBase : undefined}
              onDismissSuggestion={isViewingLiveNode ? onDismissSuggestion : undefined}
              positioningProfileFound={positioningProfileFound}
              onProfileChoice={onPipelineRespond ? (choice) => {
                onPipelineRespond('positioning_profile_choice', choice);
                setProfileChoiceMade(true);
              } : undefined}
            />
          ) : (
            <>
              {/* Review mode progress toolbar */}
              {uiMode === 'review' && (
                <ReviewModeToolbar
                  sectionBuildOrder={sectionBuildOrder}
                  approvedSections={approvedSections}
                  activeSectionKey={activeSectionKey}
                  isProcessing={isViewingLiveNode ? isProcessing : false}
                />
              )}

              {/* Edit mode hint */}
              <LiveResumeDocumentErrorBoundary>
                <LiveResumeDocument
                  sectionOrder={sectionBuildOrder}
                  sectionContent={sectionDrafts}
                  approvedSections={approvedSections}
                  activeSectionKey={activeSectionKey}
                  onEditSection={handleEditSection}
                  resume={displayResume}
                  isProcessing={isViewingLiveNode ? isProcessing : false}
                  sessionComplete={sessionComplete}
                  qualityData={qualityOverlayData}
                  reviewMode={reviewModeActive}
                  reviewSection={reviewModeActive ? displayPanelData?.section : undefined}
                  reviewToken={reviewModeActive ? displayPanelData?.review_token : undefined}
                  onApproveSection={handleApproveSection}
                  onQuickFixSection={handleQuickFixSection}
                  editModeHint={uiMode === 'edit'}
                />
              </LiveResumeDocumentErrorBoundary>

              {/* Slide-over context panel (review/edit modes only) */}
              <ContextPanel
                isOpen={contextPanelOpen}
                onClose={toggleContextPanel}
                title={contextPanelTitle}
              >
                {/* Positioning profile choice */}
                {positioningProfileFound && onPipelineRespond && !profileChoiceMade && (
                  <div className="border-b border-[var(--line-soft)] px-4 py-3">
                    <PositioningProfileChoice
                      updatedAt={positioningProfileFound.updated_at}
                      onChoice={(choice) => {
                        onPipelineRespond('positioning_profile_choice', choice);
                        setProfileChoiceMade(true);
                      }}
                    />
                  </div>
                )}

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
                  className="fixed right-4 top-1/2 z-20 -translate-y-1/2 rounded-full border border-[var(--line-soft)] bg-[var(--bg-1)]/90 p-2.5 text-[var(--text-soft)] shadow-lg backdrop-blur-xl transition-all hover:border-[var(--line-strong)] hover:bg-[var(--bg-1)] hover:text-[var(--text-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/45"
                  aria-label="Open context panel"
                >
                  <PanelRight className="h-5 w-5" />
                </button>
              )}
            </>
          )}
        </ModeTransition>
      </div>

      {/* Chat drawer — all modes */}
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

  return (
    <WorkspaceShell
      nodes={navItems}
      selectedNode={selectedNode}
      activeNode={activeNode}
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
    />
  );
}
