import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, History, X } from 'lucide-react';
import { ChatPanel } from './ChatPanel';
import { PositioningProfileChoice } from './PositioningProfileChoice';
import { WorkflowStatsRail } from './WorkflowStatsRail';
import { GlassCard } from './GlassCard';
import { GlassButton } from './GlassButton';
import { ResumePanel } from './ResumePanel';
import { SafePanelContent } from './panels/panel-renderer';
import { runPanelPayloadSmokeChecks } from './panels/panel-smoke';
import { WorkspaceShell } from './workspace/WorkspaceShell';
import { useWorkspaceNavigation } from '@/hooks/useWorkspaceNavigation';
import { useWorkflowSession } from '@/hooks/useWorkflowSession';
import { PHASE_LABELS } from '@/constants/phases';
import type { ChatMessage, ToolStatus, AskUserPromptData, PhaseGateData } from '@/types/session';
import type { FinalResume } from '@/types/resume';
import type { PanelType, PanelData } from '@/types/panels';
import {
  WORKFLOW_NODES,
  panelDataToWorkflowNode,
  phaseToWorkflowNode,
  workflowNodeIndex,
  type WorkflowNodeStatus,
  type WorkspaceNodeSnapshot,
  type WorkflowNodeKey,
} from '@/types/workflow';

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
  sessionComplete?: boolean;
  resume: FinalResume | null;
  panelType: PanelType | null;
  panelData: PanelData | null;
  error: string | null;
  onSendMessage: (content: string) => void;
  isPipelineGateActive?: boolean;
  onPipelineRespond?: (gate: string, response: unknown) => void;
  positioningProfileFound?: { profile: unknown; updated_at: string } | null;
  onSaveCurrentResumeAsBase?: (
    mode: 'default' | 'alternate',
  ) => Promise<{ success: boolean; message: string }>;
  approvedSections?: Record<string, string>;
}

type SnapshotMap = Partial<Record<WorkflowNodeKey, WorkspaceNodeSnapshot>>;

function snapshotsStorageKey(sessionId: string) {
  return `resume-agent:workspace-snapshots:${sessionId}`;
}

function loadSnapshotMap(sessionId: string): SnapshotMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(snapshotsStorageKey(sessionId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SnapshotMap;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

function persistSnapshotMap(sessionId: string, map: SnapshotMap) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(snapshotsStorageKey(sessionId), JSON.stringify(map));
  } catch {
    // Best effort
  }
}

function nodeTitle(nodeKey: WorkflowNodeKey): string {
  return WORKFLOW_NODES.find((node) => node.key === nodeKey)?.label ?? 'Workspace';
}

function renderNodeContentPlaceholder(nodeKey: WorkflowNodeKey, isActiveNode: boolean) {
  return (
    <div className="h-full p-3 md:p-4">
      <GlassCard className="h-full p-6">
        <div className="mb-2 flex items-center gap-2 text-white/78">
          <History className="h-4 w-4 text-white/45" />
          <h3 className="text-sm font-semibold">{nodeTitle(nodeKey)}</h3>
        </div>
        <p className="max-w-xl text-sm text-white/56">
          {isActiveNode
            ? 'Your coach is working on this step. Results will appear here shortly.'
            : 'This step hasn\'t been reached yet. Continue your session to see results here.'}
        </p>
      </GlassCard>
    </div>
  );
}

function BenchmarkInspectorCard({
  panelData,
  onSaveAssumptions,
  isSaving,
}: {
  panelData: PanelData | null;
  onSaveAssumptions?: (assumptions: Record<string, unknown>, note?: string) => Promise<{ success: boolean; message: string }>;
  isSaving?: boolean;
}) {
  const researchPanel = panelData?.type === 'research_dashboard' ? panelData : null;
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [companyValue, setCompanyValue] = useState(researchPanel?.company?.company_name ?? '');
  const [seniorityValue, setSeniorityValue] = useState(researchPanel?.jd_requirements?.seniority_level ?? '');
  const [mustHavesText, setMustHavesText] = useState((researchPanel?.jd_requirements?.must_haves ?? []).join('\n'));
  const [keywordsText, setKeywordsText] = useState((researchPanel?.benchmark?.language_keywords ?? []).join('\n'));
  const [differentiatorsText, setDifferentiatorsText] = useState((researchPanel?.benchmark?.competitive_differentiators ?? []).join('\n'));
  const [idealSummary, setIdealSummary] = useState(researchPanel?.benchmark?.ideal_candidate_summary ?? '');

  useEffect(() => {
    if (!researchPanel) return;
    setCompanyValue(researchPanel.company?.company_name ?? '');
    setSeniorityValue(researchPanel.jd_requirements?.seniority_level ?? '');
    setMustHavesText((researchPanel.jd_requirements?.must_haves ?? []).join('\n'));
    setKeywordsText((researchPanel.benchmark?.language_keywords ?? []).join('\n'));
    setDifferentiatorsText((researchPanel.benchmark?.competitive_differentiators ?? []).join('\n'));
    setIdealSummary(researchPanel.benchmark?.ideal_candidate_summary ?? '');
    setNote('');
    setSaveMessage(null);
    setSaveError(null);
  }, [researchPanel]);

  if (!researchPanel) return null;

  const companyName = researchPanel.company?.company_name ?? 'Unknown company';
  const seniority = researchPanel.jd_requirements?.seniority_level ?? 'Not inferred yet';
  const mustHaveCount = researchPanel.jd_requirements?.must_haves?.length ?? 0;
  const keywordCount = researchPanel.benchmark?.language_keywords?.length ?? 0;
  const differentiatorCount = researchPanel.benchmark?.competitive_differentiators?.length ?? 0;

  const handleSave = async () => {
    if (!onSaveAssumptions) return;
    setSaveMessage(null);
    setSaveError(null);
    const assumptions = {
      company_name: companyValue.trim(),
      seniority_level: seniorityValue.trim(),
      must_haves: mustHavesText.split('\n').map((s) => s.trim()).filter(Boolean),
      benchmark_keywords: keywordsText.split('\n').map((s) => s.trim()).filter(Boolean),
      competitive_differentiators: differentiatorsText.split('\n').map((s) => s.trim()).filter(Boolean),
      ideal_candidate_summary: idealSummary.trim(),
    };
    const result = await onSaveAssumptions(assumptions, note.trim() || undefined);
    if (result.success) {
      setSaveMessage(result.message);
      setEditing(false);
    } else {
      setSaveError(result.message);
    }
  };

  return (
    <GlassCard className="mb-3 p-4">
      <div className="mb-2 flex items-center gap-2">
        <History className="h-4 w-4 text-[#afc4ff]/70" />
        <h3 className="text-sm font-semibold text-white/88">Benchmark Inspector</h3>
        <div className="ml-auto flex items-center gap-2">
          <GlassButton
            type="button"
            variant="ghost"
            onClick={() => setEditing((prev) => !prev)}
            className="h-auto px-2 py-1 text-[11px]"
          >
            {editing ? 'Close' : 'Edit Assumptions'}
          </GlassButton>
        </div>
      </div>
      <p className="mb-3 text-xs text-white/56">
        These are the current inferred benchmark assumptions driving positioning decisions. You can edit and save them to mark downstream steps stale for regeneration.
      </p>
      {saveMessage && (
        <div className="mb-3 rounded-lg border border-emerald-300/20 bg-emerald-400/[0.06] px-3 py-2 text-xs text-emerald-100/85">
          {saveMessage}
        </div>
      )}
      {saveError && (
        <div className="mb-3 rounded-lg border border-red-300/20 bg-red-400/[0.06] px-3 py-2 text-xs text-red-100/85">
          {saveError}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">Company</div>
          <div className="mt-1 text-xs text-white/84">{companyName}</div>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">Seniority</div>
          <div className="mt-1 text-xs text-white/84">{seniority}</div>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">Must-Haves</div>
          <div className="mt-1 text-xs text-white/84">{mustHaveCount}</div>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">Benchmark Keywords</div>
          <div className="mt-1 text-xs text-white/84">{keywordCount}</div>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 sm:col-span-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">Competitive Differentiators</div>
          <div className="mt-1 text-xs text-white/84">{differentiatorCount}</div>
        </div>
      </div>
      {editing && (
        <div className="mt-3 space-y-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs text-white/65">
              <span className="mb-1 block">Company</span>
              <input
                value={companyValue}
                onChange={(e) => setCompanyValue(e.target.value)}
                className="w-full rounded-lg border border-white/[0.12] bg-white/[0.03] px-2.5 py-2 text-xs text-white/90 outline-none focus:border-[#afc4ff]/40"
              />
            </label>
            <label className="text-xs text-white/65">
              <span className="mb-1 block">Seniority</span>
              <input
                value={seniorityValue}
                onChange={(e) => setSeniorityValue(e.target.value)}
                className="w-full rounded-lg border border-white/[0.12] bg-white/[0.03] px-2.5 py-2 text-xs text-white/90 outline-none focus:border-[#afc4ff]/40"
              />
            </label>
          </div>
          <label className="block text-xs text-white/65">
            <span className="mb-1 block">Must-Haves (one per line)</span>
            <textarea
              value={mustHavesText}
              onChange={(e) => setMustHavesText(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-white/[0.12] bg-white/[0.03] px-2.5 py-2 text-xs text-white/90 outline-none focus:border-[#afc4ff]/40"
            />
          </label>
          <label className="block text-xs text-white/65">
            <span className="mb-1 block">Benchmark Keywords (one per line)</span>
            <textarea
              value={keywordsText}
              onChange={(e) => setKeywordsText(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-white/[0.12] bg-white/[0.03] px-2.5 py-2 text-xs text-white/90 outline-none focus:border-[#afc4ff]/40"
            />
          </label>
          <label className="block text-xs text-white/65">
            <span className="mb-1 block">Competitive Differentiators (one per line)</span>
            <textarea
              value={differentiatorsText}
              onChange={(e) => setDifferentiatorsText(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-white/[0.12] bg-white/[0.03] px-2.5 py-2 text-xs text-white/90 outline-none focus:border-[#afc4ff]/40"
            />
          </label>
          <label className="block text-xs text-white/65">
            <span className="mb-1 block">Ideal Candidate Summary</span>
            <textarea
              value={idealSummary}
              onChange={(e) => setIdealSummary(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-white/[0.12] bg-white/[0.03] px-2.5 py-2 text-xs text-white/90 outline-none focus:border-[#afc4ff]/40"
            />
          </label>
          <label className="block text-xs text-white/65">
            <span className="mb-1 block">Note (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border border-white/[0.12] bg-white/[0.03] px-2.5 py-2 text-xs text-white/90 outline-none focus:border-[#afc4ff]/40"
              placeholder="Why you are changing these assumptions"
            />
          </label>
          <div className="flex justify-end gap-2">
            <GlassButton
              type="button"
              variant="ghost"
              onClick={() => { setEditing(false); setNote(''); }}
              className="h-auto px-3 py-2 text-xs"
            >
              Cancel
            </GlassButton>
            <GlassButton
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="h-auto px-3 py-2 text-xs"
            >
              {isSaving ? 'Saving...' : 'Save Assumptions'}
            </GlassButton>
          </div>
        </div>
      )}
    </GlassCard>
  );
}

function computeNodeStatuses(
  activeNode: WorkflowNodeKey,
  snapshots: SnapshotMap,
  isProcessing: boolean,
  isGateActive: boolean,
  sessionComplete?: boolean,
): Record<WorkflowNodeKey, WorkflowNodeStatus> {
  const activeIndex = workflowNodeIndex(activeNode);
  const result = {} as Record<WorkflowNodeKey, WorkflowNodeStatus>;

  for (const node of WORKFLOW_NODES) {
    const index = workflowNodeIndex(node.key);
    const hasSnapshot = Boolean(snapshots[node.key]);

    let status: WorkflowNodeStatus = 'locked';
    if (index <= activeIndex) status = 'ready';
    if (hasSnapshot) status = 'complete';
    if (node.key === activeNode) {
      status = isGateActive ? 'blocked' : (isProcessing ? 'in_progress' : (hasSnapshot ? 'complete' : 'ready'));
    }
    if (sessionComplete && hasSnapshot) {
      status = 'complete';
    }
    result[node.key] = status;
  }

  return result;
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
}: CoachScreenProps) {
  const [profileChoiceMade, setProfileChoiceMade] = useState(false);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [localSnapshots, setLocalSnapshots] = useState<SnapshotMap>({});
  const prevPanelDataRef = useRef<PanelData | null>(null);

  useEffect(() => {
    runPanelPayloadSmokeChecks();
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
    const nextSnapshot: WorkspaceNodeSnapshot = {
      nodeKey,
      panelType,
      panelData,
      resume,
      capturedAt: panelDataChanged ? new Date().toISOString() : (localSnapshots[nodeKey]?.capturedAt ?? new Date().toISOString()),
      currentPhase,
      isGateActive: Boolean(isPipelineGateActive),
    };
    setLocalSnapshots((prev) => ({
      ...prev,
      [nodeKey]: nextSnapshot,
    }));
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
    () => WORKFLOW_NODES.map((node) => ({
      ...node,
      status: nodeStatuses[node.key],
      hasSnapshot: Boolean(mergedSnapshots[node.key])
        || Boolean(workflowSession.summary?.latest_artifacts.some((artifact) => artifact.node_key === node.key)),
    })),
    [nodeStatuses, mergedSnapshots, workflowSession.summary],
  );

  const liveSnapshot: WorkspaceNodeSnapshot = {
    nodeKey: activeNode,
    panelType,
    panelData,
    resume,
    capturedAt: new Date().toISOString(),
    currentPhase,
    isGateActive: Boolean(isPipelineGateActive),
  };

  const selectedSnapshot = selectedNode === activeNode
    ? liveSnapshot
    : (mergedSnapshots[selectedNode] ?? null);

  const isViewingLiveNode = selectedNode === activeNode;
  const displayPanelType = selectedSnapshot?.panelType ?? null;
  const displayPanelData = selectedSnapshot?.panelData ?? null;
  const displayResume = selectedSnapshot?.resume ?? resume;
  const displayPhase = selectedSnapshot?.currentPhase ?? currentPhase;

  const errorBanner = error && !errorDismissed && (
    <div className="mx-3 mt-3 flex items-start gap-2 rounded-lg border border-red-300/28 bg-red-500/[0.08] px-4 py-2.5 backdrop-blur-xl">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300/80" aria-hidden="true" />
      <p className="flex-1 text-sm text-red-100/90">{error}</p>
      <button
        type="button"
        onClick={() => setErrorDismissed(true)}
        aria-label="Dismiss error"
        className="shrink-0 rounded p-0.5 text-red-300/60 transition-colors hover:bg-white/[0.06] hover:text-red-300/90"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );

  const workflowErrorBanner = workflowSession.error && (
    <div className="mx-3 mt-3 rounded-lg border border-amber-300/18 bg-amber-300/[0.06] px-4 py-2 text-xs text-amber-100/90">
      Having trouble loading the latest data. Please refresh the page.
    </div>
  );

  const workflowActionBanner = (workflowSession.actionMessage || workflowSession.actionError) && (
    <div
      className={`mx-3 mt-3 rounded-lg border px-4 py-2 text-xs ${
        workflowSession.actionError
          ? 'border-red-300/20 bg-red-400/[0.06] text-red-100/90'
          : 'border-emerald-300/20 bg-emerald-400/[0.06] text-emerald-100/90'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="flex-1">{workflowSession.actionError ?? workflowSession.actionMessage}</span>
        <button
          type="button"
          onClick={workflowSession.clearActionMessage}
          className="rounded p-0.5 text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white/85"
          aria-label="Dismiss workflow message"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );

  const profileChoice = positioningProfileFound && onPipelineRespond && !profileChoiceMade && (
    <div className="px-3 pt-3">
      <PositioningProfileChoice
        updatedAt={positioningProfileFound.updated_at}
        onChoice={(choice) => {
          onPipelineRespond('positioning_profile_choice', choice);
          setProfileChoiceMade(true);
        }}
      />
    </div>
  );

  const mainPanel = (
    <div className="flex h-full min-h-0 flex-col">
      {errorBanner}
      {workflowErrorBanner}
      {workflowActionBanner}
      {profileChoice}
      <div className="min-h-0 flex-1 p-3 md:p-4">
        <div className="flex h-full min-h-0 flex-col">
          <div className="mb-2 flex items-center gap-2 px-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
              Your Resume Progress
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

          {selectedNode === 'benchmark' && (
            <BenchmarkInspectorCard
              panelData={displayPanelData}
              onSaveAssumptions={workflowSession.saveBenchmarkAssumptions}
              isSaving={workflowSession.isSavingBenchmarkAssumptions}
            />
          )}

          <GlassCard className="min-h-0 flex-1 overflow-hidden">
            {displayPanelData ? (
              <SafePanelContent
                panelType={displayPanelType}
                panelData={displayPanelData}
                resume={displayResume}
                isProcessing={isViewingLiveNode ? isProcessing : false}
                onSendMessage={isViewingLiveNode ? onSendMessage : undefined}
                onPipelineRespond={isViewingLiveNode ? onPipelineRespond : undefined}
                onSaveCurrentResumeAsBase={isViewingLiveNode ? onSaveCurrentResumeAsBase : undefined}
              />
            ) : displayResume ? (
              <ResumePanel resume={displayResume} />
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
        currentPhase={currentPhase}
        isProcessing={isProcessing}
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
          currentPhase={currentPhase}
          isProcessing={isProcessing}
          sessionComplete={sessionComplete}
          error={error}
          panelData={panelData}
          resume={resume}
          compact={false}
        />
      </div>
      <div className="lg:hidden">
        <WorkflowStatsRail
          currentPhase={currentPhase}
          isProcessing={isProcessing}
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
        onReturn: returnToActiveNode,
        onGenerateDraftNow: workflowSession.generateDraftNow,
        isGenerateDraftNowPending: workflowSession.isGenerateDraftNowPending,
      }}
      main={mainPanel}
      side={sidePanel}
      footerRail={footerRail}
    />
  );
}
