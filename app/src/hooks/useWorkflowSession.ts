import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PanelData, PanelType } from '@/types/panels';
import type { FinalResume } from '@/types/resume';
import type { PositioningQuestion, CategoryProgress } from '@/types/session';
import type { WorkflowReplanUpdate } from '@/types/session';
import type {
  WorkflowNodeKey,
  WorkflowNodeStatus,
  WorkspaceNodeSnapshot,
} from '@/types/workflow';
import { API_BASE } from '../lib/api';

interface WorkflowSummaryNode {
  node_key: WorkflowNodeKey;
  status: WorkflowNodeStatus;
  active_version: number | null;
  updated_at: string;
  meta: Record<string, unknown> | null;
  blocking_state: 'rebuild_required' | null;
}

interface WorkflowSummaryResponse {
  session: {
    id: string;
    pipeline_stage: string | null;
    pipeline_status: string | null;
    pending_gate: string | null;
    updated_at: string | null;
    active_node: WorkflowNodeKey;
    last_panel_type?: string | null;
  };
  nodes: WorkflowSummaryNode[];
  latest_artifacts: Array<{
    id: string;
    node_key: WorkflowNodeKey;
    artifact_type: string;
    version: number;
    created_at: string;
  }>;
  workflow_preferences: {
    workflow_mode: 'fast_draft' | 'balanced' | 'deep_dive';
    minimum_evidence_target: number | null;
    source: 'workflow_preferences' | 'pipeline_start_request' | 'default';
    version: number | null;
    created_at: string | null;
  };
  replan: {
    pending: boolean;
    reason: 'benchmark_assumptions_updated';
    stale_nodes: WorkflowNodeKey[];
    requires_restart: boolean;
    rebuild_from_stage: string | null;
    benchmark_edit_version: number | null;
    current_stage: string | null;
  } | null;
  draft_readiness: {
    evidence_count: number;
    minimum_evidence_target: number;
    coverage_score: number;
    coverage_threshold: number;
    ready: boolean;
    workflow_mode: 'fast_draft' | 'balanced' | 'deep_dive';
    stage: string;
    note?: string;
    version: number | null;
    created_at: string | null;
  } | null;
  sections_bundle_review: {
    review_strategy: 'per_section' | 'bundled';
    current_review_bundle_key: 'headline' | 'core_experience' | 'supporting' | null;
    total_bundles: number;
    completed_bundles: number;
    bundles: Array<{
      key: 'headline' | 'core_experience' | 'supporting';
      label: string;
      total_sections: number;
      review_required: number;
      reviewed_required: number;
      status: 'pending' | 'in_progress' | 'complete' | 'auto_approved';
    }>;
    version: number | null;
    created_at: string | null;
  } | null;
  replan_status: (WorkflowReplanUpdate & {
    version: number | null;
    created_at: string | null;
  }) | null;
}

interface WorkflowNodeArtifactsResponse {
  session_id: string;
  node_key: WorkflowNodeKey;
  artifacts: Array<{
    id: string;
    node_key: WorkflowNodeKey;
    artifact_type: string;
    version: number;
    payload: unknown;
    created_by: string;
    created_at: string;
  }>;
}

interface UseWorkflowSessionOptions {
  sessionId: string | null;
  accessToken: string | null;
  selectedNode: WorkflowNodeKey;
  currentPhase?: string;
}

interface UseWorkflowSessionResult {
  summary: WorkflowSummaryResponse | null;
  nodeStatuses: Partial<Record<WorkflowNodeKey, WorkflowNodeStatus>>;
  nodeSnapshots: Partial<Record<WorkflowNodeKey, WorkspaceNodeSnapshot>>;
  loadingSummary: boolean;
  loadingNode: boolean;
  error: string | null;
  actionMessage: string | null;
  actionError: string | null;
  actionRequiresRestart: boolean;
  isSavingBenchmarkAssumptions: boolean;
  isUpdatingWorkflowPreferences: boolean;
  isGenerateDraftNowPending: boolean;
  isRestartPipelinePending: boolean;
  refreshSummary: () => Promise<void>;
  refreshNode: (nodeKey: WorkflowNodeKey) => Promise<void>;
  saveBenchmarkAssumptions: (
    assumptions: Record<string, unknown>,
    note?: string,
  ) => Promise<{ success: boolean; message: string; requiresRestart?: boolean }>;
  updateWorkflowPreferences: (payload: {
    workflow_mode?: 'fast_draft' | 'balanced' | 'deep_dive';
    minimum_evidence_target?: number;
  }) => Promise<{ success: boolean; message: string }>;
  generateDraftNow: () => Promise<{ success: boolean; message: string }>;
  restartPipeline: () => Promise<{ success: boolean; message: string }>;
  clearActionMessage: () => void;
}

function buildHeaders(accessToken: string | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isLateBenchmarkEditStage(stage: string | null | undefined): boolean {
  return stage === 'section_writing'
    || stage === 'section_review'
    || stage === 'quality_review'
    || stage === 'revision'
    || stage === 'complete';
}

function buildBlueprintReviewPanelData(payload: unknown): PanelData | null {
  const bp = asRecord(payload);
  if (!bp) return null;
  const sectionPlan = asRecord(bp.section_plan);
  const ageProtection = asRecord(bp.age_protection);
  const evidenceAllocation = asRecord(bp.evidence_allocation);
  const keywordMap = asRecord(bp.keyword_map);
  const selectedAccomplishments = Array.isArray(evidenceAllocation?.selected_accomplishments)
    ? evidenceAllocation?.selected_accomplishments
    : [];
  return {
    type: 'blueprint_review',
    target_role: typeof bp.target_role === 'string' ? bp.target_role : '',
    positioning_angle: typeof bp.positioning_angle === 'string' ? bp.positioning_angle : '',
    section_plan: {
      order: Array.isArray(sectionPlan?.order)
        ? sectionPlan.order.filter((x): x is string => typeof x === 'string')
        : [],
      rationale: typeof sectionPlan?.rationale === 'string' ? sectionPlan.rationale : '',
    },
    age_protection: {
      flags: Array.isArray(ageProtection?.flags)
        ? ageProtection.flags
            .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
            .map((item) => ({
              item: typeof item.item === 'string' ? item.item : '',
              risk: typeof item.risk === 'string' ? item.risk : '',
              action: typeof item.action === 'string' ? item.action : '',
            }))
        : [],
      clean: Boolean(ageProtection?.clean),
    },
    evidence_allocation_count: selectedAccomplishments.length,
    keyword_count: keywordMap ? Object.keys(keywordMap).length : 0,
  } as PanelData;
}

function buildQualityPanelData(payload: unknown): PanelData | null {
  const scores = asRecord(payload);
  if (!scores) return null;
  const ats = typeof scores.ats_score === 'number' ? scores.ats_score : undefined;
  const coverage = typeof scores.requirement_coverage === 'number' ? scores.requirement_coverage : undefined;
  const authenticity = typeof scores.authenticity === 'number' ? scores.authenticity : undefined;
  const hiringImpact = typeof scores.hiring_manager_impact === 'number' ? scores.hiring_manager_impact : undefined;
  return {
    type: 'quality_dashboard',
    ats_score: ats,
    authenticity_score: authenticity,
    keyword_coverage: coverage,
    hiring_manager: hiringImpact == null
      ? undefined
      : {
          pass: hiringImpact >= 4,
          checklist_total: hiringImpact,
          checklist_max: 5,
        },
  } as PanelData;
}

function buildQuestionnairePanelDataFromEvent(payload: unknown): PanelData | null {
  const event = asRecord(payload);
  if (!event) return null;
  return {
    type: 'questionnaire',
    questionnaire_id: typeof event.questionnaire_id === 'string' ? event.questionnaire_id : '',
    schema_version: typeof event.schema_version === 'number' ? event.schema_version : 1,
    stage: typeof event.stage === 'string' ? event.stage : 'unknown',
    title: typeof event.title === 'string' ? event.title : 'Questionnaire',
    subtitle: typeof event.subtitle === 'string' ? event.subtitle : undefined,
    questions: Array.isArray(event.questions) ? event.questions : [],
    current_index: typeof event.current_index === 'number' ? event.current_index : 0,
  } as PanelData;
}

function buildPositioningPanelDataFromEvent(payload: unknown): PanelData | null {
  const event = asRecord(payload);
  const question = asRecord(event?.question);
  if (!event || !question) return null;
  const questionNumber = typeof question.question_number === 'number' ? question.question_number : 1;
  return {
    type: 'positioning_interview',
    current_question: question as unknown as PositioningQuestion,
    questions_total: typeof event.questions_total === 'number' ? event.questions_total : questionNumber,
    questions_answered: Math.max(0, questionNumber - 1),
    category_progress: Array.isArray(event.category_progress)
      ? event.category_progress as unknown as CategoryProgress[]
      : undefined,
    encouraging_text: typeof question.encouraging_text === 'string' ? question.encouraging_text : undefined,
  } as PanelData;
}

function buildCompletionSnapshot(payload: unknown, nodeKey: WorkflowNodeKey, currentPhase: string): WorkspaceNodeSnapshot | null {
  const data = asRecord(payload);
  const resume = asRecord(data?.resume) as FinalResume | null;
  if (!resume) return null;
  return {
    nodeKey,
    panelType: 'completion',
    panelData: {
      type: 'completion',
      ats_score: typeof resume.ats_score === 'number' ? resume.ats_score : undefined,
    } as PanelData,
    resume,
    capturedAt: new Date().toISOString(),
    currentPhase,
    isGateActive: false,
  };
}

function snapshotFromArtifact(
  nodeKey: WorkflowNodeKey,
  artifact: WorkflowNodeArtifactsResponse['artifacts'][number],
  currentPhase: string,
): WorkspaceNodeSnapshot | null {
  const { artifact_type: artifactType, payload, created_at } = artifact;

  if (artifactType.startsWith('panel_')) {
    const panelType = artifactType.slice('panel_'.length) as PanelType;
    const panelPayload = asRecord(payload);
    if (!panelPayload) return null;
    return {
      nodeKey,
      panelType,
      panelData: { type: panelType, ...panelPayload } as PanelData,
      resume: null,
      capturedAt: created_at,
      currentPhase,
      isGateActive: false,
    };
  }

  if (artifactType === 'questionnaire') {
    const panelData = buildQuestionnairePanelDataFromEvent(payload);
    if (!panelData) return null;
    return {
      nodeKey,
      panelType: 'questionnaire',
      panelData,
      resume: null,
      capturedAt: created_at,
      currentPhase,
      isGateActive: false,
    };
  }

  if (artifactType === 'positioning_question') {
    const panelData = buildPositioningPanelDataFromEvent(payload);
    if (!panelData) return null;
    return {
      nodeKey,
      panelType: 'positioning_interview',
      panelData,
      resume: null,
      capturedAt: created_at,
      currentPhase,
      isGateActive: false,
    };
  }

  if (artifactType === 'blueprint') {
    const panelData = buildBlueprintReviewPanelData(payload);
    if (!panelData) return null;
    return {
      nodeKey,
      panelType: 'blueprint_review',
      panelData,
      resume: null,
      capturedAt: created_at,
      currentPhase,
      isGateActive: false,
    };
  }

  if (artifactType === 'section_review') {
    const panelPayload = asRecord(payload);
    if (!panelPayload) return null;
    return {
      nodeKey,
      panelType: 'section_review',
      panelData: { type: 'section_review', ...panelPayload } as PanelData,
      resume: null,
      capturedAt: created_at,
      currentPhase,
      isGateActive: false,
    };
  }

  if (artifactType === 'quality_scores') {
    const panelData = buildQualityPanelData(payload);
    if (!panelData) return null;
    return {
      nodeKey,
      panelType: 'quality_dashboard',
      panelData,
      resume: null,
      capturedAt: created_at,
      currentPhase,
      isGateActive: false,
    };
  }

  if (artifactType === 'completion') {
    return buildCompletionSnapshot(payload, nodeKey, currentPhase);
  }

  return null;
}

export function useWorkflowSession({
  sessionId,
  accessToken,
  selectedNode,
  currentPhase = 'overview',
}: UseWorkflowSessionOptions): UseWorkflowSessionResult {
  const [summary, setSummary] = useState<WorkflowSummaryResponse | null>(null);
  const [nodeSnapshots, setNodeSnapshots] = useState<Partial<Record<WorkflowNodeKey, WorkspaceNodeSnapshot>>>({});
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingNode, setLoadingNode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionRequiresRestart, setActionRequiresRestart] = useState(false);
  const [isSavingBenchmarkAssumptions, setIsSavingBenchmarkAssumptions] = useState(false);
  const [isUpdatingWorkflowPreferences, setIsUpdatingWorkflowPreferences] = useState(false);
  const [isGenerateDraftNowPending, setIsGenerateDraftNowPending] = useState(false);
  const [isRestartPipelinePending, setIsRestartPipelinePending] = useState(false);
  const accessTokenRef = useRef<string | null>(accessToken);
  const loadedNodeVersionsRef = useRef<Partial<Record<WorkflowNodeKey, string>>>({});
  const summaryAbortRef = useRef<AbortController | null>(null);
  const nodeAbortRef = useRef<AbortController | null>(null);
  const summaryRef = useRef(summary);

  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => { summaryRef.current = summary; }, [summary]);

  useEffect(() => {
    setSummary(null);
    setNodeSnapshots({});
    setError(null);
    setActionMessage(null);
    setActionError(null);
    loadedNodeVersionsRef.current = {};
    summaryAbortRef.current?.abort();
    summaryAbortRef.current = null;
    nodeAbortRef.current?.abort();
    nodeAbortRef.current = null;
  }, [sessionId]);

  const refreshSummary = useCallback(async () => {
    if (!sessionId || !accessTokenRef.current) return;
    summaryAbortRef.current?.abort();
    const controller = new AbortController();
    summaryAbortRef.current = controller;
    setLoadingSummary(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/workflow/${encodeURIComponent(sessionId)}`, {
        headers: buildHeaders(accessTokenRef.current),
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as { error?: string }));
        setError(data.error ?? `Failed to load workflow summary (${res.status})`);
        return;
      }
      const data = await res.json() as WorkflowSummaryResponse;
      setSummary(data);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Network error loading workflow summary');
    } finally {
      setLoadingSummary(false);
    }
  }, [sessionId]);

  const refreshNode = useCallback(async (nodeKey: WorkflowNodeKey) => {
    if (!sessionId || !accessTokenRef.current) return;
    nodeAbortRef.current?.abort();
    const controller = new AbortController();
    nodeAbortRef.current = controller;
    setLoadingNode(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/workflow/${encodeURIComponent(sessionId)}/node/${encodeURIComponent(nodeKey)}`, {
        headers: buildHeaders(accessTokenRef.current),
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as { error?: string }));
        setError(data.error ?? `Failed to load workflow node (${res.status})`);
        return;
      }
      const data = await res.json() as WorkflowNodeArtifactsResponse;
      const currentPhaseForSnapshot = summaryRef.current?.session?.pipeline_stage ?? currentPhase;
      const snapshot = data.artifacts
        .map((artifact) => snapshotFromArtifact(nodeKey, artifact, currentPhaseForSnapshot ?? currentPhase))
        .find((value): value is WorkspaceNodeSnapshot => Boolean(value));

      if (snapshot) {
        setNodeSnapshots((prev) => ({ ...prev, [nodeKey]: snapshot }));
      }
      const versionKey = data.artifacts[0]
        ? `${data.artifacts[0].artifact_type}:${data.artifacts[0].version}:${data.artifacts[0].created_at}`
        : 'none';
      loadedNodeVersionsRef.current[nodeKey] = versionKey;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Network error loading workflow node');
    } finally {
      setLoadingNode(false);
    }
  }, [sessionId, currentPhase]);

  useEffect(() => {
    void refreshSummary();
  }, [refreshSummary]);

  useEffect(() => {
    if (!summary) return;
    const latestForNode = summary.latest_artifacts
      .filter((artifact) => artifact.node_key === selectedNode)
      .sort((a, b) => {
        if (a.created_at === b.created_at) return b.version - a.version;
        return a.created_at < b.created_at ? 1 : -1;
      })[0];
    const nextVersionKey = latestForNode
      ? `${latestForNode.artifact_type}:${latestForNode.version}:${latestForNode.created_at}`
      : 'none';
    if (loadedNodeVersionsRef.current[selectedNode] !== nextVersionKey) {
      void refreshNode(selectedNode);
    }
  }, [summary, selectedNode, refreshNode]);
  // Note: selectedNode is explicitly in the dep array above so refreshNode doesn't need it as a dep

  // Light polling for summary while a session is active
  useEffect(() => {
    const sessionComplete = currentPhase === 'complete';
    if (!sessionId || sessionComplete) return;
    const interval = setInterval(() => {
      void refreshSummary();
    }, 12_000);
    return () => clearInterval(interval);
  }, [sessionId, currentPhase, refreshSummary]);

  const nodeStatuses = useMemo(() => {
    const map: Partial<Record<WorkflowNodeKey, WorkflowNodeStatus>> = {};
    for (const node of summary?.nodes ?? []) {
      map[node.node_key] = node.status;
    }
    return map;
  }, [summary]);

  const saveBenchmarkAssumptions = useCallback(async (
    assumptions: Record<string, unknown>,
    note?: string,
  ) => {
    if (!sessionId || !accessTokenRef.current) {
      return { success: false, message: 'No active session.' };
    }
    setIsSavingBenchmarkAssumptions(true);
    setActionError(null);
    setActionMessage(null);
    setActionRequiresRestart(false);
    try {
      const postAssumptions = async (confirmRebuild?: boolean) => {
        const res = await fetch(`${API_BASE}/workflow/${encodeURIComponent(sessionId)}/benchmark/assumptions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...buildHeaders(accessTokenRef.current),
          },
          body: JSON.stringify({ assumptions, note, ...(confirmRebuild ? { confirm_rebuild: true } : {}) }),
        });
        const data = await res.json().catch(() => ({} as { error?: string; status?: string; code?: string; message?: string }));
        return { res, data };
      };

      let { res, data } = await postAssumptions();
      if (!res.ok && (data as { code?: string }).code === 'BENCHMARK_REBUILD_CONFIRM_REQUIRED') {
        const currentStage = summaryRef.current?.session?.pipeline_stage ?? currentPhase;
        const stageLabel = currentStage ? `Current stage: ${currentStage}. ` : '';
        const confirmationText = `${stageLabel}${(data as { message?: string }).message ?? 'This will rebuild downstream work from gap analysis onward.'}\n\nContinue?`;
        const shouldConfirm = typeof window !== 'undefined'
          ? window.confirm(confirmationText)
          : isLateBenchmarkEditStage(currentStage);
        if (!shouldConfirm) {
          const cancelled = 'Benchmark update cancelled.';
          setActionMessage(cancelled);
          return { success: false, message: cancelled, requiresRestart: false };
        }
        ({ res, data } = await postAssumptions(true));
      }
      if (!res.ok) {
        const message = (data as { message?: string; error?: string }).message
          ?? (data as { error?: string }).error
          ?? `Failed to save benchmark assumptions (${res.status})`;
        setActionError(message);
        setActionRequiresRestart(false);
        return { success: false, message, requiresRestart: false };
      }
      const typed = data as {
        applies_to_current_run?: boolean;
        apply_mode?: string;
        requires_restart?: boolean;
      };
      const message = typed.requires_restart
        ? 'Benchmark assumptions saved. Because section writing already started, restart the pipeline to rebuild downstream work consistently from gap analysis.'
        : typed.applies_to_current_run
          ? 'Benchmark assumptions saved. The current run will apply them at the next safe checkpoint and regenerate downstream steps.'
          : 'Benchmark assumptions saved. Dependent steps were marked stale.';
      setActionMessage(message);
      setActionRequiresRestart(Boolean(typed.requires_restart));
      await refreshSummary();
      await refreshNode('benchmark');
      return { success: true, message, requiresRestart: Boolean(typed.requires_restart) };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error saving benchmark assumptions';
      setActionError(message);
      setActionRequiresRestart(false);
      return { success: false, message, requiresRestart: false };
    } finally {
      setIsSavingBenchmarkAssumptions(false);
    }
  }, [sessionId, refreshNode, refreshSummary, currentPhase]);

  const generateDraftNow = useCallback(async () => {
    if (!sessionId || !accessTokenRef.current) {
      return { success: false, message: 'No active session.' };
    }
    setIsGenerateDraftNowPending(true);
    setActionError(null);
    setActionMessage(null);
    setActionRequiresRestart(false);
    try {
      const res = await fetch(`${API_BASE}/workflow/${encodeURIComponent(sessionId)}/generate-draft-now`, {
        method: 'POST',
        headers: buildHeaders(accessTokenRef.current),
      });
      const data = await res.json().catch(() => ({} as { error?: string; message?: string; status?: string }));
      if (!res.ok) {
        const message = data.message ?? data.error ?? `Failed to request draft-now (${res.status})`;
        setActionError(message);
        setActionRequiresRestart(false);
        await refreshSummary();
        return { success: false, message };
      }
      const message = data.message ?? 'Requested a faster path to draft.';
      setActionMessage(message);
      await refreshSummary();
      return { success: true, message };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error requesting draft-now';
      setActionError(message);
      setActionRequiresRestart(false);
      return { success: false, message };
    } finally {
      setIsGenerateDraftNowPending(false);
    }
  }, [sessionId, refreshSummary]);

  const updateWorkflowPreferences = useCallback(async (payload: {
    workflow_mode?: 'fast_draft' | 'balanced' | 'deep_dive';
    minimum_evidence_target?: number;
  }) => {
    if (!sessionId || !accessTokenRef.current) {
      return { success: false, message: 'No active session.' };
    }
    setIsUpdatingWorkflowPreferences(true);
    setActionError(null);
    setActionMessage(null);
    setActionRequiresRestart(false);
    try {
      const body: Record<string, unknown> = {};
      if (payload.workflow_mode) body.workflow_mode = payload.workflow_mode;
      if (typeof payload.minimum_evidence_target === 'number' && Number.isFinite(payload.minimum_evidence_target)) {
        body.minimum_evidence_target = Math.min(20, Math.max(3, Math.round(payload.minimum_evidence_target)));
      }
      const res = await fetch(`${API_BASE}/workflow/${encodeURIComponent(sessionId)}/preferences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildHeaders(accessTokenRef.current),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({} as { error?: string; message?: string; apply_mode?: string }));
      if (!res.ok) {
        const message = data.message ?? data.error ?? `Failed to update workflow preferences (${res.status})`;
        setActionError(message);
        return { success: false, message };
      }
      const message = (data as { apply_mode?: string }).apply_mode === 'next_safe_checkpoint'
        ? 'Workflow preferences saved. The current run will apply them at the next safe checkpoint.'
        : 'Workflow preferences saved.';
      setActionMessage(message);
      await refreshSummary();
      return { success: true, message };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error updating workflow preferences';
      setActionError(message);
      return { success: false, message };
    } finally {
      setIsUpdatingWorkflowPreferences(false);
    }
  }, [sessionId, refreshSummary]);

  const restartPipeline = useCallback(async () => {
    if (!sessionId || !accessTokenRef.current) {
      return { success: false, message: 'No active session.' };
    }
    setIsRestartPipelinePending(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await fetch(`${API_BASE}/workflow/${encodeURIComponent(sessionId)}/restart`, {
        method: 'POST',
        headers: buildHeaders(accessTokenRef.current),
      });
      const data = await res.json().catch(() => ({} as { error?: string; message?: string }));
      if (!res.ok) {
        const message = data.message ?? data.error ?? `Failed to restart pipeline (${res.status})`;
        setActionError(message);
        await refreshSummary();
        return { success: false, message };
      }
      const message = data.message ?? 'Restarted the pipeline from saved session inputs.';
      setActionMessage(message);
      setActionRequiresRestart(false);
      await refreshSummary();
      return { success: true, message };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error restarting pipeline';
      setActionError(message);
      return { success: false, message };
    } finally {
      setIsRestartPipelinePending(false);
    }
  }, [sessionId, refreshSummary]);

  const clearActionMessage = useCallback(() => {
    setActionMessage(null);
    setActionError(null);
    setActionRequiresRestart(false);
  }, []);

  return {
    summary,
    nodeStatuses,
    nodeSnapshots,
    loadingSummary,
    loadingNode,
    error,
    actionMessage,
    actionError,
    actionRequiresRestart,
    isSavingBenchmarkAssumptions,
    isUpdatingWorkflowPreferences,
    isGenerateDraftNowPending,
    isRestartPipelinePending,
    refreshSummary,
    refreshNode,
    saveBenchmarkAssumptions,
    updateWorkflowPreferences,
    generateDraftNow,
    restartPipeline,
    clearActionMessage,
  };
}
