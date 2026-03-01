/**
 * usePipelineStateManager.ts
 *
 * Centralises all useState and useRef declarations for the agent pipeline.
 * Returns all state values, setters, refs, and a reset function.
 */

import { useState, useRef, useCallback } from 'react';
import type {
  ChatMessage,
  ToolStatus,
  AskUserPromptData,
  PhaseGateData,
  PipelineStage,
  PositioningQuestion,
  QualityScores,
  DraftReadinessUpdate,
  WorkflowReplanUpdate,
  PipelineActivitySnapshot,
} from '@/types/session';
import type { FinalResume } from '@/types/resume';
import type { PanelType, PanelData, SectionWorkbenchContext } from '@/types/panels';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function emptyPipelineActivity(): PipelineActivitySnapshot {
  return {
    processing_state: 'idle',
    stage: null,
    stage_started_at: null,
    last_progress_at: null,
    last_heartbeat_at: null,
    last_backend_activity_at: null,
    last_stage_duration_ms: null,
    current_activity_message: null,
    current_activity_source: null,
    expected_next_action: null,
  };
}

// ─── Return type ──────────────────────────────────────────────────────────────

export interface PipelineStateManager {
  // ── Connection state ────────────────────────────────────────────────────────
  connected: boolean;
  setConnected: React.Dispatch<React.SetStateAction<boolean>>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;

  // ── Processing state ────────────────────────────────────────────────────────
  isProcessing: boolean;
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>;
  sessionComplete: boolean;
  setSessionComplete: React.Dispatch<React.SetStateAction<boolean>>;
  currentPhase: string;
  setCurrentPhase: React.Dispatch<React.SetStateAction<string>>;
  pipelineStage: PipelineStage | null;
  setPipelineStage: React.Dispatch<React.SetStateAction<PipelineStage | null>>;
  isPipelineGateActive: boolean;
  setIsPipelineGateActive: React.Dispatch<React.SetStateAction<boolean>>;
  stalledSuspected: boolean;
  setStalledSuspected: React.Dispatch<React.SetStateAction<boolean>>;
  lastBackendActivityAt: string | null;
  setLastBackendActivityAt: React.Dispatch<React.SetStateAction<string | null>>;
  pipelineActivityMeta: PipelineActivitySnapshot;
  setPipelineActivityMeta: React.Dispatch<React.SetStateAction<PipelineActivitySnapshot>>;

  // ── Message + streaming state ────────────────────────────────────────────────
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  streamingText: string;
  setStreamingText: React.Dispatch<React.SetStateAction<string>>;
  tools: ToolStatus[];
  setTools: React.Dispatch<React.SetStateAction<ToolStatus[]>>;

  // ── Gate state ───────────────────────────────────────────────────────────────
  askPrompt: AskUserPromptData | null;
  setAskPrompt: React.Dispatch<React.SetStateAction<AskUserPromptData | null>>;
  phaseGate: PhaseGateData | null;
  setPhaseGate: React.Dispatch<React.SetStateAction<PhaseGateData | null>>;

  // ── Panel state ──────────────────────────────────────────────────────────────
  panelType: PanelType | null;
  setPanelType: React.Dispatch<React.SetStateAction<PanelType | null>>;
  panelData: PanelData | null;
  setPanelData: React.Dispatch<React.SetStateAction<PanelData | null>>;

  // ── Section / resume state ───────────────────────────────────────────────────
  resume: FinalResume | null;
  setResume: React.Dispatch<React.SetStateAction<FinalResume | null>>;
  sectionDraft: { section: string; content: string } | null;
  setSectionDraft: React.Dispatch<
    React.SetStateAction<{ section: string; content: string } | null>
  >;
  approvedSections: Record<string, string>;
  setApprovedSections: React.Dispatch<React.SetStateAction<Record<string, string>>>;

  // ── Pipeline-specific state ──────────────────────────────────────────────────
  positioningQuestion: PositioningQuestion | null;
  setPositioningQuestion: React.Dispatch<React.SetStateAction<PositioningQuestion | null>>;
  positioningProfileFound: { profile: unknown; updated_at: string } | null;
  setPositioningProfileFound: React.Dispatch<
    React.SetStateAction<{ profile: unknown; updated_at: string } | null>
  >;
  blueprintReady: unknown;
  setBlueprintReady: React.Dispatch<React.SetStateAction<unknown>>;
  qualityScores: QualityScores | null;
  setQualityScores: React.Dispatch<React.SetStateAction<QualityScores | null>>;
  draftReadiness: DraftReadinessUpdate | null;
  setDraftReadiness: React.Dispatch<React.SetStateAction<DraftReadinessUpdate | null>>;
  workflowReplan: WorkflowReplanUpdate | null;
  setWorkflowReplan: React.Dispatch<React.SetStateAction<WorkflowReplanUpdate | null>>;

  // ── Refs ─────────────────────────────────────────────────────────────────────
  qualityScoresRef: React.MutableRefObject<QualityScores | null>;
  accessTokenRef: React.MutableRefObject<string | null>;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  sectionsMapRef: React.MutableRefObject<Record<string, string>>;
  sectionContextRef: React.MutableRefObject<{
    section: string;
    context: SectionWorkbenchContext;
  } | null>;
  dismissedSuggestionIdsRef: React.MutableRefObject<Set<string>>;
  messageIdRef: React.MutableRefObject<number>;
  lastTextCompleteRef: React.MutableRefObject<string>;
  lastSeqRef: React.MutableRefObject<number>;
  reconnectAttemptsRef: React.MutableRefObject<number>;
  reconnectTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  deltaBufferRef: React.MutableRefObject<string>;
  rafIdRef: React.MutableRefObject<number | null>;
  mountedRef: React.MutableRefObject<boolean>;
  toolCleanupTimersRef: React.MutableRefObject<Set<ReturnType<typeof setTimeout>>>;
  lastProgressTimestampRef: React.MutableRefObject<number>;
  staleNoticeActiveRef: React.MutableRefObject<boolean>;
  isProcessingRef: React.MutableRefObject<boolean>;
  staleCheckIntervalRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>;
  stalePipelineNoticeRef: React.MutableRefObject<boolean>;
  connectSSERef: React.MutableRefObject<(() => void) | null>;

  // ── Helpers ───────────────────────────────────────────────────────────────────
  nextId: () => string;
  patchPipelineActivityMeta: (patch: Partial<PipelineActivitySnapshot>) => void;
  resetState: (sessionId: string | null) => void;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function usePipelineStateManager(
  accessToken: string | null,
): PipelineStateManager {
  // ── Connection ────────────────────────────────────────────────────────────
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Processing ────────────────────────────────────────────────────────────
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<string>('onboarding');
  const [pipelineStage, setPipelineStage] = useState<PipelineStage | null>(null);
  const [isPipelineGateActive, setIsPipelineGateActive] = useState(false);
  const [stalledSuspected, setStalledSuspected] = useState(false);
  const [lastBackendActivityAt, setLastBackendActivityAt] = useState<string | null>(null);
  const [pipelineActivityMeta, setPipelineActivityMeta] =
    useState<PipelineActivitySnapshot>(emptyPipelineActivity);

  // ── Messages + streaming ──────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [tools, setTools] = useState<ToolStatus[]>([]);

  // ── Gates ─────────────────────────────────────────────────────────────────
  const [askPrompt, setAskPrompt] = useState<AskUserPromptData | null>(null);
  const [phaseGate, setPhaseGate] = useState<PhaseGateData | null>(null);

  // ── Panel ─────────────────────────────────────────────────────────────────
  const [panelType, setPanelType] = useState<PanelType | null>(null);
  const [panelData, setPanelData] = useState<PanelData | null>(null);

  // ── Resume / sections ─────────────────────────────────────────────────────
  const [resume, setResume] = useState<FinalResume | null>(null);
  const [sectionDraft, setSectionDraft] = useState<{
    section: string;
    content: string;
  } | null>(null);
  const [approvedSections, setApprovedSections] = useState<Record<string, string>>({});

  // ── Pipeline-specific ─────────────────────────────────────────────────────
  const [positioningQuestion, setPositioningQuestion] =
    useState<PositioningQuestion | null>(null);
  const [positioningProfileFound, setPositioningProfileFound] = useState<{
    profile: unknown;
    updated_at: string;
  } | null>(null);
  const [blueprintReady, setBlueprintReady] = useState<unknown>(null);
  const [qualityScores, setQualityScores] = useState<QualityScores | null>(null);
  const [draftReadiness, setDraftReadiness] = useState<DraftReadinessUpdate | null>(null);
  const [workflowReplan, setWorkflowReplan] = useState<WorkflowReplanUpdate | null>(null);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const qualityScoresRef = useRef<QualityScores | null>(null);
  const accessTokenRef = useRef<string | null>(accessToken);
  const abortControllerRef = useRef<AbortController | null>(null);
  const sectionsMapRef = useRef<Record<string, string>>({});
  const sectionContextRef = useRef<{
    section: string;
    context: SectionWorkbenchContext;
  } | null>(null);
  const dismissedSuggestionIdsRef = useRef<Set<string>>(new Set());
  const messageIdRef = useRef(0);
  const lastTextCompleteRef = useRef<string>('');
  const lastSeqRef = useRef<number>(0);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deltaBufferRef = useRef('');
  const rafIdRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const toolCleanupTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const lastProgressTimestampRef = useRef<number>(Date.now());
  const staleNoticeActiveRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);
  const staleCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stalePipelineNoticeRef = useRef<boolean>(false);
  const connectSSERef = useRef<(() => void) | null>(null);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const nextId = useCallback(() => {
    messageIdRef.current += 1;
    return `msg-${messageIdRef.current}`;
  }, []);

  const patchPipelineActivityMeta = useCallback(
    (patch: Partial<PipelineActivitySnapshot>) => {
      setPipelineActivityMeta((prev) => ({ ...prev, ...patch }));
    },
    [],
  );

  const resetState = useCallback(
    (sessionId: string | null) => {
      setCurrentPhase('onboarding');
      setIsProcessing(false);
      setConnected(false);
      setSessionComplete(false);
      setError(null);
      setPipelineStage(null);
      setMessages([]);
      setStreamingText('');
      setTools([]);
      setAskPrompt(null);
      setPhaseGate(null);
      setResume(null);
      setPanelType(null);
      setPanelData(null);
      setPositioningQuestion(null);
      setPositioningProfileFound(null);
      setBlueprintReady(null);
      setSectionDraft(null);
      setApprovedSections({});
      sectionsMapRef.current = {};
      lastTextCompleteRef.current = '';
      lastSeqRef.current = 0;
      qualityScoresRef.current = null;
      setDraftReadiness(null);
      setWorkflowReplan(null);
      setQualityScores(null);
      setIsPipelineGateActive(false);
      reconnectAttemptsRef.current = 0;
      lastProgressTimestampRef.current = Date.now();
      const nowIso = new Date().toISOString();
      setLastBackendActivityAt(nowIso);
      setStalledSuspected(false);
      setPipelineActivityMeta({
        ...emptyPipelineActivity(),
        last_backend_activity_at: nowIso,
        current_activity_message: sessionId
          ? 'Connecting to the live workflow stream.'
          : null,
        current_activity_source: sessionId ? 'system' : null,
        processing_state: sessionId ? 'reconnecting' : 'idle',
      });
      staleNoticeActiveRef.current = false;
      stalePipelineNoticeRef.current = false;
      sectionContextRef.current = null;
      dismissedSuggestionIdsRef.current = new Set();
      if (staleCheckIntervalRef.current) {
        clearInterval(staleCheckIntervalRef.current);
        staleCheckIntervalRef.current = null;
      }
    },
    [],
  );

  return {
    // Connection
    connected,
    setConnected,
    error,
    setError,

    // Processing
    isProcessing,
    setIsProcessing,
    sessionComplete,
    setSessionComplete,
    currentPhase,
    setCurrentPhase,
    pipelineStage,
    setPipelineStage,
    isPipelineGateActive,
    setIsPipelineGateActive,
    stalledSuspected,
    setStalledSuspected,
    lastBackendActivityAt,
    setLastBackendActivityAt,
    pipelineActivityMeta,
    setPipelineActivityMeta,

    // Messages + streaming
    messages,
    setMessages,
    streamingText,
    setStreamingText,
    tools,
    setTools,

    // Gates
    askPrompt,
    setAskPrompt,
    phaseGate,
    setPhaseGate,

    // Panel
    panelType,
    setPanelType,
    panelData,
    setPanelData,

    // Resume / sections
    resume,
    setResume,
    sectionDraft,
    setSectionDraft,
    approvedSections,
    setApprovedSections,

    // Pipeline-specific
    positioningQuestion,
    setPositioningQuestion,
    positioningProfileFound,
    setPositioningProfileFound,
    blueprintReady,
    setBlueprintReady,
    qualityScores,
    setQualityScores,
    draftReadiness,
    setDraftReadiness,
    workflowReplan,
    setWorkflowReplan,

    // Refs
    qualityScoresRef,
    accessTokenRef,
    abortControllerRef,
    sectionsMapRef,
    sectionContextRef,
    dismissedSuggestionIdsRef,
    messageIdRef,
    lastTextCompleteRef,
    lastSeqRef,
    reconnectAttemptsRef,
    reconnectTimerRef,
    deltaBufferRef,
    rafIdRef,
    mountedRef,
    toolCleanupTimersRef,
    lastProgressTimestampRef,
    staleNoticeActiveRef,
    isProcessingRef,
    staleCheckIntervalRef,
    stalePipelineNoticeRef,
    connectSSERef,

    // Helpers
    nextId,
    patchPipelineActivityMeta,
    resetState,
  };
}
