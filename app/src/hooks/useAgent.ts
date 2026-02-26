import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  ChatMessage,
  ToolStatus,
  AskUserPromptData,
  PhaseGateData,
  PipelineStage,
  PositioningQuestion,
  QualityScores,
  CategoryProgress,
  DraftReadinessUpdate,
  WorkflowReplanUpdate,
  PipelineActivitySnapshot,
} from '@/types/session';
import type { FinalResume } from '@/types/resume';
import type { PanelType, PanelData, SectionWorkbenchContext, SectionSuggestion } from '@/types/panels';
import { parseSSEStream } from '@/lib/sse-parser';
import { requestNotificationPermission, sendGateNotification } from '@/lib/notifications';
import { API_BASE } from '../lib/api';

const MAX_RECONNECT_ATTEMPTS = 5;
const MAX_TOOL_STATUS_ENTRIES = 20;

const SUGGESTION_LIMITS = {
  max_count: 5,
  max_question_text_chars: 300,
  max_context_chars: 200,
  max_option_label_chars: 40,
  max_id_chars: 80,
};

const VALID_INTENTS = new Set([
  'address_requirement', 'weave_evidence', 'integrate_keyword',
  'quantify_bullet', 'tighten', 'strengthen_verb', 'align_positioning',
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeParse(data: string): Record<string, any> | null {
  try {
    return JSON.parse(data);
  } catch {
    console.warn('[useAgent] Failed to parse SSE data:', data?.substring(0, 200));
    return null;
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean);
}

function asGapClassification(value: unknown): 'strong' | 'partial' | 'gap' {
  if (value === 'strong' || value === 'partial' || value === 'gap') return value;
  return 'gap';
}

function asPriorityTier(value: unknown): 'high' | 'medium' | 'low' {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  return 'low';
}

function asReplanStaleNodes(value: unknown): WorkflowReplanUpdate['stale_nodes'] {
  if (!Array.isArray(value)) return undefined;
  const nodes = value.filter((v): v is NonNullable<WorkflowReplanUpdate['stale_nodes']>[number] => (
    v === 'gaps'
    || v === 'questions'
    || v === 'blueprint'
    || v === 'sections'
    || v === 'quality'
    || v === 'export'
  ));
  return nodes.length > 0 ? nodes : undefined;
}

function emptyPipelineActivity(): PipelineActivitySnapshot {
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

function sanitizeSectionContextPayload(
  data: Record<string, unknown>,
): { section: string; context: SectionWorkbenchContext } | null {
  const section = typeof data.section === 'string' ? data.section : '';
  if (!section) return null;

  const evidenceRaw = Array.isArray(data.evidence) ? data.evidence : [];
  const keywordsRaw = Array.isArray(data.keywords) ? data.keywords : [];
  const gapsRaw = Array.isArray(data.gap_mappings) ? data.gap_mappings : [];

  const context: SectionWorkbenchContext = {
    context_version: Number.isFinite(data.context_version as number)
      ? Math.max(0, Math.floor(data.context_version as number))
      : 0,
    generated_at:
      typeof data.generated_at === 'string'
        ? data.generated_at
        : new Date().toISOString(),
    blueprint_slice:
      data.blueprint_slice && typeof data.blueprint_slice === 'object' && !Array.isArray(data.blueprint_slice)
        ? (data.blueprint_slice as Record<string, unknown>)
        : {},
    evidence: evidenceRaw
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
      .map((item, idx) => {
        const scopeMetrics: Record<string, string> = {};
        if (item.scope_metrics && typeof item.scope_metrics === 'object' && !Array.isArray(item.scope_metrics)) {
          for (const [k, v] of Object.entries(item.scope_metrics as Record<string, unknown>)) {
            if (typeof k === 'string' && typeof v === 'string') {
              scopeMetrics[k] = v;
            }
          }
        }
        return {
          id:
            typeof item.id === 'string' && item.id.trim()
              ? item.id.trim()
              : `evidence_${idx + 1}`,
          situation: typeof item.situation === 'string' ? item.situation : '',
          action: typeof item.action === 'string' ? item.action : '',
          result: typeof item.result === 'string' ? item.result : '',
          metrics_defensible: Boolean(item.metrics_defensible),
          user_validated: Boolean(item.user_validated),
          mapped_requirements: asStringArray(item.mapped_requirements),
          scope_metrics: scopeMetrics,
        };
      }),
    keywords: keywordsRaw
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
      .map((item) => ({
        keyword: typeof item.keyword === 'string' ? item.keyword : '',
        target_density: Number.isFinite(item.target_density as number)
          ? Math.max(0, item.target_density as number)
          : 0,
        current_count: Number.isFinite(item.current_count as number)
          ? Math.max(0, item.current_count as number)
          : 0,
      }))
      .filter((item) => item.keyword.length > 0),
    gap_mappings: gapsRaw
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
      .map((item) => ({
        requirement: typeof item.requirement === 'string' ? item.requirement : '',
        classification: asGapClassification(item.classification),
      }))
      .filter((item) => item.requirement.length > 0),
    section_order: asStringArray(data.section_order),
    sections_approved: asStringArray(data.sections_approved),
    review_strategy: data.review_strategy === 'bundled' ? 'bundled' : 'per_section',
    review_required_sections: asStringArray(data.review_required_sections),
    auto_approved_sections: asStringArray(data.auto_approved_sections),
    current_review_bundle_key:
      data.current_review_bundle_key === 'headline'
      || data.current_review_bundle_key === 'core_experience'
      || data.current_review_bundle_key === 'supporting'
        ? data.current_review_bundle_key
        : undefined,
    review_bundles: Array.isArray(data.review_bundles)
      ? data.review_bundles
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
          .map((item) => ({
            key:
              item.key === 'headline' || item.key === 'core_experience' || item.key === 'supporting'
                ? item.key
                : 'supporting',
            label: typeof item.label === 'string' ? item.label : 'Bundle',
            total_sections: Number.isFinite(item.total_sections as number) ? Math.max(0, Math.floor(item.total_sections as number)) : 0,
            review_required: Number.isFinite(item.review_required as number) ? Math.max(0, Math.floor(item.review_required as number)) : 0,
            reviewed_required: Number.isFinite(item.reviewed_required as number) ? Math.max(0, Math.floor(item.reviewed_required as number)) : 0,
            status:
              item.status === 'complete' || item.status === 'in_progress' || item.status === 'auto_approved'
                ? item.status
                : 'pending',
          }))
      : undefined,
  };

  const suggestionsRaw = Array.isArray(data.suggestions) ? data.suggestions : [];
  const suggestions: SectionSuggestion[] = suggestionsRaw
    .filter((item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === 'object' && !Array.isArray(item)
      && typeof item.question_text === 'string'
      && typeof item.intent === 'string' && VALID_INTENTS.has(item.intent as string)
      && typeof item.target_id === 'string' && (item.target_id as string).length > 0
    )
    .slice(0, SUGGESTION_LIMITS.max_count)
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id.slice(0, SUGGESTION_LIMITS.max_id_chars) : '',
      intent: item.intent as SectionSuggestion['intent'],
      question_text: typeof item.question_text === 'string'
        ? item.question_text.slice(0, SUGGESTION_LIMITS.max_question_text_chars)
        : '',
      ...(typeof item.context === 'string'
        ? { context: item.context.slice(0, SUGGESTION_LIMITS.max_context_chars) }
        : {}),
      ...(typeof item.target_id === 'string'
        ? { target_id: item.target_id.slice(0, SUGGESTION_LIMITS.max_id_chars) }
        : {}),
      options: Array.isArray(item.options)
        ? (item.options as Array<Record<string, unknown>>)
            .filter((o): o is Record<string, unknown> => Boolean(o) && typeof o === 'object')
            .slice(0, 4)
            .map((o) => ({
              id: typeof o.id === 'string' ? o.id.slice(0, SUGGESTION_LIMITS.max_id_chars) : '',
              label: typeof o.label === 'string' ? o.label.slice(0, SUGGESTION_LIMITS.max_option_label_chars) : '',
              action: (o.action === 'skip' ? 'skip' : 'apply') as 'apply' | 'skip',
            }))
        : [],
      priority: Number.isFinite(item.priority as number) ? Math.max(0, item.priority as number) : 0,
      priority_tier: asPriorityTier(item.priority_tier),
      resolved_when: item.resolved_when && typeof item.resolved_when === 'object' && !Array.isArray(item.resolved_when)
        ? {
            type: (['keyword_present', 'evidence_referenced', 'requirement_addressed', 'always_recheck'].includes(
              (item.resolved_when as Record<string, unknown>).type as string,
            )
              ? (item.resolved_when as Record<string, unknown>).type
              : 'always_recheck') as SectionSuggestion['resolved_when']['type'],
            target_id: typeof (item.resolved_when as Record<string, unknown>).target_id === 'string'
              ? ((item.resolved_when as Record<string, unknown>).target_id as string).slice(0, SUGGESTION_LIMITS.max_id_chars)
              : '',
          }
        : { type: 'always_recheck' as const, target_id: '' },
    }))
    .filter((s) => s.id.length > 0 && s.question_text.length > 0);

  if (suggestions.length > 0) {
    context.suggestions = suggestions;
  }

  return { section, context };
}

export function useAgent(sessionId: string | null, accessToken: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [tools, setTools] = useState<ToolStatus[]>([]);
  const [askPrompt, setAskPrompt] = useState<AskUserPromptData | null>(null);
  const [phaseGate, setPhaseGate] = useState<PhaseGateData | null>(null);
  const [currentPhase, setCurrentPhase] = useState<string>('onboarding');
  const [isProcessing, setIsProcessing] = useState(false);
  const [resume, setResume] = useState<FinalResume | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastBackendActivityAt, setLastBackendActivityAt] = useState<string | null>(null);
  const [stalledSuspected, setStalledSuspected] = useState(false);
  const [pipelineActivityMeta, setPipelineActivityMeta] = useState<PipelineActivitySnapshot>(emptyPipelineActivity);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelType, setPanelType] = useState<PanelType | null>(null);
  const [panelData, setPanelData] = useState<PanelData | null>(null);
  const [pipelineStage, setPipelineStage] = useState<PipelineStage | null>(null);
  const [isPipelineGateActive, setIsPipelineGateActive] = useState(false);
  const [positioningQuestion, setPositioningQuestion] = useState<PositioningQuestion | null>(null);
  const [positioningProfileFound, setPositioningProfileFound] = useState<{ profile: unknown; updated_at: string } | null>(null);
  const [blueprintReady, setBlueprintReady] = useState<unknown>(null);
  const [sectionDraft, setSectionDraft] = useState<{ section: string; content: string } | null>(null);
  const [approvedSections, setApprovedSections] = useState<Record<string, string>>({});
  const [qualityScores, setQualityScores] = useState<QualityScores | null>(null);
  const [draftReadiness, setDraftReadiness] = useState<DraftReadinessUpdate | null>(null);
  const [workflowReplan, setWorkflowReplan] = useState<WorkflowReplanUpdate | null>(null);
  // Ref mirror so pipeline_complete handler can read latest quality scores
  const qualityScoresRef = useRef<QualityScores | null>(null);
  const accessTokenRef = useRef<string | null>(accessToken);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Accumulate all section content for building FinalResume at pipeline_complete
  const sectionsMapRef = useRef<Record<string, string>>({});
  // Store the latest section workbench context, emitted before section_draft
  const sectionContextRef = useRef<{ section: string; context: SectionWorkbenchContext } | null>(null);
  // Track dismissed suggestion IDs so they survive context version updates
  const dismissedSuggestionIdsRef = useRef<Set<string>>(new Set());
  const messageIdRef = useRef(0);

  // Track last text_complete content to deduplicate
  const lastTextCompleteRef = useRef<string>('');
  const lastSeqRef = useRef<number>(0);

  // Reconnection tracking
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // text_delta batching with requestAnimationFrame
  const deltaBufferRef = useRef('');
  const rafIdRef = useRef<number | null>(null);

  // Guard against reconnect firing after unmount
  const mountedRef = useRef(true);

  // Track timeout IDs for auto-removing completed tools
  const toolCleanupTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Stale-processing detector: track last pipeline progress event time.
  // Heartbeats should not count as progress, otherwise stalled pipelines never trip the detector.
  const lastProgressTimestampRef = useRef<number>(Date.now());
  // Prevent repeated stale notices while a single stall is ongoing.
  const staleNoticeActiveRef = useRef<boolean>(false);
  // Ref mirror of isProcessing for reading inside interval callbacks without closing over stale state.
  const isProcessingRef = useRef<boolean>(false);
  const staleCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stalePipelineNoticeRef = useRef<boolean>(false);
  const hasAccessToken = Boolean(accessToken);

  const nextId = useCallback(() => {
    messageIdRef.current += 1;
    return `msg-${messageIdRef.current}`;
  }, []);

  const patchPipelineActivityMeta = useCallback((patch: Partial<PipelineActivitySnapshot>) => {
    setPipelineActivityMeta((prev) => ({
      ...prev,
      ...patch,
    }));
  }, []);

  const markPipelineProgress = useCallback((
    message: string | null | undefined,
    source: PipelineActivitySnapshot['current_activity_source'],
    options?: {
      stage?: PipelineStage | null;
      stageStartedAt?: string | null;
      expectedNextAction?: string | null;
    },
  ) => {
    const nowIso = new Date().toISOString();
    lastProgressTimestampRef.current = Date.now();
    staleNoticeActiveRef.current = false;
    setLastBackendActivityAt(nowIso);
    setStalledSuspected(false);
    setPipelineActivityMeta((prev) => ({
      ...prev,
      last_backend_activity_at: nowIso,
      last_progress_at: nowIso,
      current_activity_message: typeof message === 'string' ? message : (prev.current_activity_message ?? null),
      current_activity_source: source,
      stage: options?.stage !== undefined ? options.stage : prev.stage,
      stage_started_at: options?.stageStartedAt !== undefined ? options.stageStartedAt : prev.stage_started_at,
      expected_next_action:
        options?.expectedNextAction !== undefined ? options.expectedNextAction : prev.expected_next_action,
    }));
  }, []);

  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  // Flush delta buffer to state
  const flushDeltaBuffer = useCallback(() => {
    if (deltaBufferRef.current) {
      const buffered = deltaBufferRef.current;
      deltaBufferRef.current = '';
      setStreamingText((prev) => prev + buffered);
    }
    rafIdRef.current = null;
  }, []);

  // Ref to hold the latest connectSSE function so handleDisconnect never closes over a stale version
  const connectSSERef = useRef<(() => void) | null>(null);

  // Reconnect with exponential backoff
  const handleDisconnect = useCallback(() => {
    setConnected(false);
    // Clear in-flight state before reconnecting to avoid stale UI
    setStreamingText('');
    setTools([]);
    setAskPrompt(null);
    patchPipelineActivityMeta({
      processing_state: isProcessingRef.current ? 'reconnecting' : 'idle',
      current_activity_message: isProcessingRef.current
        ? 'Live connection dropped. Reconnecting to resume workflow stream...'
        : 'Live connection disconnected. Reconnecting...',
      current_activity_source: 'system',
      expected_next_action: isProcessingRef.current
        ? 'Reconnect to resume live stage updates'
        : null,
    });

    if (!mountedRef.current) return;

    if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
      const delay = Math.pow(2, reconnectAttemptsRef.current) * 1000; // 1s, 2s, 4s, 8s, 16s
      reconnectAttemptsRef.current += 1;
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          connectSSERef.current?.();
        }
      }, delay);
    } else {
      setError('Connection lost');
      patchPipelineActivityMeta({
        processing_state: 'error',
        current_activity_message: 'Live workflow connection could not be restored after multiple retries.',
        current_activity_source: 'system',
        expected_next_action: 'Use Reconnect or Refresh State to confirm the pipeline status',
      });
    }
  }, [patchPipelineActivityMeta]);

  // Reset derived score state on session change so completion metrics can't leak across sessions.
  useEffect(() => {
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
      current_activity_message: sessionId ? 'Connecting to the live workflow stream.' : null,
      current_activity_source: sessionId ? 'system' : null,
      processing_state: sessionId ? 'reconnecting' : 'idle',
    });
    staleNoticeActiveRef.current = false;
    stalePipelineNoticeRef.current = false;
    sectionContextRef.current = null;
    dismissedSuggestionIdsRef.current = new Set();
  }, [sessionId]);

  // Connect to SSE with fetch-based streaming
  useEffect(() => {
    if (!sessionId || !hasAccessToken || !accessTokenRef.current) return;

    function connectSSE() {
      // Update ref so handleDisconnect always uses the latest version
      connectSSERef.current = connectSSE;

      // Abort any existing connection
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      patchPipelineActivityMeta({
        processing_state: 'reconnecting',
        current_activity_message: 'Connecting to the live workflow stream...',
        current_activity_source: 'system',
        expected_next_action: 'Receive backend stage updates',
      });
      const token = accessTokenRef.current;
      if (!token) {
        setError('Not authenticated');
        return;
      }

      fetch(`${API_BASE}/sessions/${sessionId}/sse`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            console.error('[useAgent] SSE fetch failed:', response.status, response.statusText);
            setError(`Connection failed (${response.status})`);
            handleDisconnect();
            return;
          }

          if (!response.body) {
            console.error('[useAgent] SSE response has no body');
            setError('Connection failed (no response body)');
            handleDisconnect();
            return;
          }

          try {
            for await (const msg of parseSSEStream(response.body)) {
              if (controller.signal.aborted) break;
              const backendEventAt = new Date().toISOString();
              setLastBackendActivityAt(backendEventAt);
              setStalledSuspected(false);
              setPipelineActivityMeta((prev) => ({
                ...prev,
                last_backend_activity_at: backendEventAt,
                ...(msg.event === 'heartbeat' ? { last_heartbeat_at: backendEventAt } : {}),
              }));

              switch (msg.event) {
                case 'connected': {
                  setConnected(true);
                  setError(null);
                  reconnectAttemptsRef.current = 0;
                  patchPipelineActivityMeta({
                    processing_state: isProcessingRef.current ? 'processing' : 'idle',
                    current_activity_message: isProcessingRef.current
                      ? 'Live stream connected. Waiting for the next backend update...'
                      : 'Live stream connected.',
                    current_activity_source: 'system',
                  });
                  break;
                }

                case 'session_restore': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  const pipelineRunning = data.pipeline_status === 'running';
                  const pendingGate = typeof data.pending_gate === 'string' ? data.pending_gate : null;
                  if (data.pipeline_stage && typeof data.pipeline_stage === 'string') {
                    setPipelineStage(data.pipeline_stage as PipelineStage);
                    setCurrentPhase(data.pipeline_stage as string);
                  } else if (data.current_phase) {
                    setCurrentPhase(data.current_phase as string);
                  }
                  if (Array.isArray(data.messages) && data.messages.length) {
                    try {
                      const restored: ChatMessage[] = (data.messages as Array<{ role: string; content: string }>)
                        .filter((m) => m && typeof m.role === 'string' && typeof m.content === 'string')
                        .map((m, i) => ({
                          id: `restored-${i}`,
                          role: m.role as 'user' | 'assistant',
                          content: m.content,
                          timestamp: new Date().toISOString(),
                        }));
                      setMessages(restored);
                      messageIdRef.current = restored.length;
                    } catch (err) {
                      console.error('[useAgent] Failed to restore messages:', err);
                    }
                  }
                  if (data.last_panel_type && data.last_panel_data) {
                    setPanelType(data.last_panel_type as PanelType);
                    const panelPayload = data.last_panel_data as Record<string, unknown>;
                    setPanelData({ type: data.last_panel_type, ...panelPayload } as PanelData);
                    // Restore resume data from completion panel (persisted by export_resume)
                    if (data.last_panel_type === 'completion' && panelPayload.resume) {
                      setResume(panelPayload.resume as FinalResume);
                    }
                  }
                  // Restore processing state as best-effort until SSE or the status poll confirms the latest state.
                  setIsPipelineGateActive(Boolean(pipelineRunning && pendingGate));
                  setIsProcessing(Boolean(pipelineRunning && !pendingGate));
                  setAskPrompt(null);
                  patchPipelineActivityMeta({
                    processing_state: pendingGate
                      ? 'waiting_for_input'
                      : (pipelineRunning ? 'reconnecting' : 'idle'),
                    stage:
                      typeof data.pipeline_stage === 'string'
                        ? (data.pipeline_stage as PipelineStage)
                        : null,
                    current_activity_message:
                      pendingGate
                        ? 'Session restored. Waiting for your input on the current workflow action.'
                        : (pipelineRunning
                            ? 'Session restored. Waiting for live backend updates.'
                            : 'Session restored.'),
                    current_activity_source: 'restore',
                    expected_next_action: pendingGate
                      ? 'Complete the active workflow action in the workspace'
                      : null,
                  });
                  // Restore pending phase gate so the user can confirm/reject after reconnect
                  if (data.pending_phase_transition && data.pending_tool_call_id) {
                    const restorePhase = (typeof data.pipeline_stage === 'string' ? data.pipeline_stage : data.current_phase) as string;
                    setPhaseGate({
                      toolCallId: data.pending_tool_call_id as string,
                      currentPhase: restorePhase,
                      nextPhase: data.pending_phase_transition as string,
                      phaseSummary: 'Phase complete (restored after reconnect)',
                      nextPhasePreview: '',
                    });
                  } else {
                    setPhaseGate(null);
                  }
                  break;
                }

                case 'text_delta': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  setIsProcessing(false);
                  // Accumulate deltas in buffer, flush via rAF
                  deltaBufferRef.current += data.content;
                  if (rafIdRef.current === null) {
                    rafIdRef.current = requestAnimationFrame(flushDeltaBuffer);
                  }
                  break;
                }

                case 'text_complete': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  // Deduplicate: prefer server sequence number, fall back to content equality
                  if (typeof data.seq === 'number') {
                    if (data.seq <= lastSeqRef.current) break;
                    lastSeqRef.current = data.seq;
                  } else {
                    if (data.content === lastTextCompleteRef.current) break;
                  }
                  lastTextCompleteRef.current = data.content;

                  // Flush any remaining buffered deltas before completing
                  if (deltaBufferRef.current) {
                    deltaBufferRef.current = '';
                    if (rafIdRef.current !== null) {
                      cancelAnimationFrame(rafIdRef.current);
                      rafIdRef.current = null;
                    }
                  }

                  setMessages((prev) => [
                    ...prev,
                    {
                      id: nextId(),
                      role: 'assistant',
                      content: data.content,
                      timestamp: new Date().toISOString(),
                    },
                  ]);
                  setStreamingText('');
                  setIsProcessing(false);
                  break;
                }

                case 'tool_start': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  // Cap tool status array
                  setTools((prev) => {
                    const next = [
                      ...prev,
                      { name: data.tool_name, description: data.description, status: 'running' as const },
                    ];
                    return next.length > MAX_TOOL_STATUS_ENTRIES ? next.slice(-MAX_TOOL_STATUS_ENTRIES) : next;
                  });
                  break;
                }

                case 'tool_complete': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  const toolName = data.tool_name as string;
                  setTools((prev) =>
                    prev.map((t) =>
                      t.name === toolName && t.status === 'running'
                        ? { ...t, status: 'complete' as const, summary: data.summary as string }
                        : t,
                    ),
                  );
                  // Auto-remove completed tool after 3s
                  const timer = setTimeout(() => {
                    if (!mountedRef.current) return;
                    setTools((prev) => prev.filter((t) => !(t.name === toolName && t.status === 'complete')));
                    toolCleanupTimersRef.current.delete(timer);
                  }, 3000);
                  toolCleanupTimersRef.current.add(timer);
                  break;
                }

                case 'ask_user': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  patchPipelineActivityMeta({
                    processing_state: 'waiting_for_input',
                    current_activity_message: 'A response is required in the right-column chat before the workflow can continue.',
                    current_activity_source: 'gate',
                    expected_next_action: 'Answer the prompt in this chat panel',
                  });
                  setIsProcessing(false);
                  setAskPrompt({
                    toolCallId: data.tool_call_id,
                    question: data.question,
                    context: data.context,
                    inputType: data.input_type,
                    choices: data.choices,
                    skipAllowed: data.skip_allowed,
                  });
                  break;
                }

                case 'phase_gate': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  patchPipelineActivityMeta({
                    processing_state: 'waiting_for_input',
                    current_activity_message: 'Phase transition confirmation is waiting for your input.',
                    current_activity_source: 'gate',
                    expected_next_action: 'Confirm the phase transition in this chat panel',
                  });
                  setIsProcessing(false);
                  setPhaseGate({
                    toolCallId: data.tool_call_id,
                    currentPhase: data.current_phase,
                    nextPhase: data.next_phase,
                    phaseSummary: data.phase_summary,
                    nextPhasePreview: data.next_phase_preview,
                  });
                  break;
                }

                case 'right_panel_update': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  const incomingType = data.panel_type as PanelType;
                  setPanelType(incomingType);

                  // Merge strategies for specific panel types
                  setPanelData((prev) => {
                    const incoming = { type: incomingType, ...data.data } as PanelData;

                    // Merge onboarding_summary to preserve stat cards
                    if (incomingType === 'onboarding_summary' && prev?.type === 'onboarding_summary') {
                      return { ...prev, ...incoming } as PanelData;
                    }

                    // Accumulate live_resume changes for same section
                    if (incomingType === 'live_resume' && prev?.type === 'live_resume') {
                      const prevData = prev as PanelData & { active_section?: string; changes?: unknown[] };
                      const incomingData = incoming as PanelData & { active_section?: string; changes?: unknown[] };
                      if (prevData.active_section === incomingData.active_section && incomingData.changes) {
                        const existingChanges = prevData.changes ?? [];
                        const newChanges = incomingData.changes ?? [];
                        // Deduplicate by original text
                        const existingOriginals = new Set(
                          (existingChanges as Array<{ original?: string }>).map(c => c.original ?? '')
                        );
                        const merged = [
                          ...existingChanges,
                          ...(newChanges as Array<{ original?: string }>).filter(c => !existingOriginals.has(c.original ?? ''))
                        ];
                        return { ...incomingData, changes: merged } as PanelData;
                      }
                    }

                    return incoming;
                  });

                  break;
                }

                case 'phase_change': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  patchPipelineActivityMeta({
                    processing_state: data.to_phase === 'complete' ? 'complete' : 'processing',
                    current_activity_message: `Phase changed to ${String(data.to_phase).replace(/_/g, ' ')}.`,
                    current_activity_source: 'system',
                    expected_next_action: null,
                  });
                  setCurrentPhase(data.to_phase);
                  setPhaseGate(null);
                  // Clear stale state on phase change
                  setAskPrompt(null);
                  setTools([]);
                  break;
                }

                case 'transparency': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  markPipelineProgress(
                    typeof data.message === 'string' ? data.message : 'Backend is working on this step.',
                    'transparency',
                    {
                      stage:
                        data.stage === 'intake'
                        || data.stage === 'positioning'
                        || data.stage === 'research'
                        || data.stage === 'gap_analysis'
                        || data.stage === 'architect'
                        || data.stage === 'architect_review'
                        || data.stage === 'section_writing'
                        || data.stage === 'section_review'
                        || data.stage === 'quality_review'
                        || data.stage === 'revision'
                        || data.stage === 'complete'
                          ? (data.stage as PipelineStage)
                          : undefined,
                    },
                  );
                  setIsProcessing(true);
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: nextId(),
                      role: 'system',
                      content: data.message,
                      timestamp: new Date().toISOString(),
                    },
                  ]);
                  break;
                }

                case 'resume_update': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  // Normalize content - coerce object to string
                  const content =
                    typeof data.content === 'object' && data.content !== null
                      ? JSON.stringify(data.content)
                      : data.content;
                  setResume((prev) => {
                    const base = prev ?? {
                      summary: '',
                      experience: [],
                      skills: {},
                      education: [],
                      certifications: [],
                      ats_score: 0,
                    };
                    return { ...base, [data.section]: content };
                  });
                  break;
                }

                case 'export_ready': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  setResume(data.resume);
                  break;
                }

                case 'section_status': {
                  // Emitted by confirm_section and propose_section_edit — tracked server-side
                  break;
                }

                case 'score_change': {
                  // Emitted by emit_score — tracked server-side
                  break;
                }

                case 'complete': {
                  // Session finished — stop processing, mark complete, close connection
                  const cData = safeParse(msg.data);
                  markPipelineProgress(
                    'Session complete. Final outputs are ready.',
                    'stage_complete',
                    {
                      stage: 'complete',
                      expectedNextAction: 'Review the final resume and export options',
                    },
                  );
                  setIsPipelineGateActive(false);
                  setIsProcessing(false);
                  setSessionComplete(true);
                  setCurrentPhase('complete');
                  // Switch right panel to completion with export buttons
                  setPanelType('completion');
                  setPanelData({
                    type: 'completion',
                    ats_score: (cData?.ats_score as number) ?? undefined,
                    requirements_addressed: (cData?.requirements_addressed as number) ?? undefined,
                    sections_rewritten: (cData?.sections_rewritten as number) ?? undefined,
                  });
                  controller.abort();
                  abortControllerRef.current = null;
                  setConnected(false);
                  break;
                }

                case 'error': {
                  const data = safeParse(msg.data);
                  let errorMsg = data?.message ?? data?.error?.message ?? 'Something went wrong';
                  // Strip raw JSON that may have leaked through
                  if (typeof errorMsg === 'string' && errorMsg.startsWith('{')) {
                    errorMsg = 'Something went wrong processing your message. Please try again.';
                  }
                  markPipelineProgress(
                    typeof errorMsg === 'string' ? `Session error: ${errorMsg}` : 'Session error',
                    'system',
                    {
                      expectedNextAction: 'Reconnect or refresh the workspace before retrying',
                    },
                  );
                  setIsPipelineGateActive(false);
                  setError(errorMsg as string);
                  setIsProcessing(false);
                  break;
                }

                case 'heartbeat': {
                  if (isProcessingRef.current) {
                    setPipelineActivityMeta((prev) => ({
                      ...prev,
                      current_activity_message:
                        prev.processing_state !== 'waiting_for_input'
                          ? (prev.current_activity_message ?? 'Backend heartbeat received. Processing is still running.')
                          : prev.current_activity_message,
                      current_activity_source:
                        prev.processing_state !== 'waiting_for_input'
                          ? (prev.current_activity_source ?? 'system')
                          : prev.current_activity_source,
                    }));
                  }
                  break;
                }

                case 'stage_start': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  const stageStartAt = new Date().toISOString();
                  markPipelineProgress(
                    typeof data.message === 'string' ? data.message : 'Starting next workflow step.',
                    'stage_start',
                    {
                      stage: data.stage as PipelineStage,
                      stageStartedAt: stageStartAt,
                    },
                  );
                  setIsPipelineGateActive(false);
                  setPipelineStage(data.stage as PipelineStage);
                  setCurrentPhase(data.stage as string);
                  setIsProcessing(true);
                  setPipelineActivityMeta((prev) => ({
                    ...prev,
                    last_stage_duration_ms: null,
                  }));
                  if (data.stage === 'intake') {
                    requestNotificationPermission();
                  }
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: nextId(),
                      role: 'system',
                      content: data.message,
                      timestamp: new Date().toISOString(),
                    },
                  ]);
                  break;
                }

                case 'stage_complete': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  markPipelineProgress(
                    typeof data.message === 'string' ? data.message : 'Workflow step completed.',
                    'stage_complete',
                    {
                      stage: data.stage as PipelineStage,
                    },
                  );
                  setPipelineStage(data.stage as PipelineStage);
                  setIsProcessing(false);
                  setPipelineActivityMeta((prev) => ({
                    ...prev,
                    last_stage_duration_ms: Number.isFinite(data.duration_ms as number)
                      ? Math.max(0, Number(data.duration_ms))
                      : prev.last_stage_duration_ms ?? null,
                  }));
                  if (data.duration_ms && import.meta.env.DEV) {
                    console.log(`[pipeline] ${data.stage} completed in ${(data.duration_ms as number / 1000).toFixed(1)}s`);
                  }
                  break;
                }

                case 'positioning_question': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  markPipelineProgress(
                    'Step 3 question is ready. Waiting for your answer.',
                    'gate',
                    {
                      stage: 'positioning',
                      expectedNextAction: 'Answer the Why Me question in the workspace',
                    },
                  );
                  setIsProcessing(false);
                  setIsPipelineGateActive(true);
                  const q = data.question as PositioningQuestion;
                  setPositioningQuestion(q);
                  // Show in right panel
                  setPanelType('positioning_interview');
                  setPanelData({
                    type: 'positioning_interview',
                    current_question: q,
                    questions_total: (data.questions_total as number) ?? q.question_number,
                    questions_answered: q.question_number - 1,
                    category_progress: data.category_progress as CategoryProgress[] | undefined,
                    encouraging_text: q.encouraging_text,
                  } as PanelData);
                  sendGateNotification('Interview question is ready');
                  break;
                }

                case 'questionnaire': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  markPipelineProgress(
                    typeof data.title === 'string' && data.title.trim().length > 0
                      ? `${data.title} is ready for your input.`
                      : 'A questionnaire is ready for your input.',
                    'gate',
                    {
                      expectedNextAction: 'Complete the questionnaire in the workspace',
                    },
                  );
                  setIsProcessing(false);
                  setIsPipelineGateActive(true);
                  setPanelType('questionnaire');
                  setPanelData({
                    type: 'questionnaire',
                    questionnaire_id: data.questionnaire_id,
                    schema_version: data.schema_version,
                    stage: data.stage,
                    title: data.title,
                    subtitle: data.subtitle,
                    questions: data.questions,
                    current_index: data.current_index ?? 0,
                  } as PanelData);
                  sendGateNotification('A questionnaire is ready for you');
                  break;
                }

                case 'positioning_profile_found': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  setIsPipelineGateActive(true);
                  markPipelineProgress(
                    'A saved positioning profile is available. Choose whether to use it, update it, or start fresh.',
                    'gate',
                    {
                      stage: 'positioning',
                      expectedNextAction: 'Choose how to start Step 3',
                    },
                  );
                  setIsProcessing(false);
                  setPositioningProfileFound({
                    profile: data.profile,
                    updated_at: data.updated_at,
                  });
                  break;
                }

                case 'blueprint_ready': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  markPipelineProgress(
                    'Step 5 blueprint is ready for review.',
                    'gate',
                    {
                      stage: 'architect_review',
                      expectedNextAction: 'Review and approve the blueprint in the workspace',
                    },
                  );
                  setIsProcessing(false);
                  setIsPipelineGateActive(true);
                  setBlueprintReady(data.blueprint);
                  // Show in right panel
                  const bp = data.blueprint as Record<string, unknown>;
                  setPanelType('blueprint_review');
                  setPanelData({
                    type: 'blueprint_review',
                    target_role: (bp.target_role as string) ?? '',
                    positioning_angle: (bp.positioning_angle as string) ?? '',
                    section_plan: bp.section_plan as { order: string[]; rationale: string },
                    age_protection: bp.age_protection as { flags: Array<{ item: string; risk: string; action: string }>; clean: boolean },
                    evidence_allocation_count: ((bp.evidence_allocation as Record<string, unknown>)?.selected_accomplishments as unknown[] ?? []).length,
                    keyword_count: Object.keys((bp.keyword_map as Record<string, unknown>) ?? {}).length,
                  } as PanelData);
                  sendGateNotification('Blueprint is ready for your review');
                  break;
                }

                case 'section_context': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  const sanitized = sanitizeSectionContextPayload(data);
                  if (!sanitized) break;
                  // Only accept if version is strictly greater than current for the same section
                  const current = sectionContextRef.current;
                  if (current && current.section === sanitized.section
                      && sanitized.context.context_version <= current.context.context_version) {
                    break; // Ignore stale or same-version context
                  }
                  // Filter out previously dismissed suggestions (IDs persist across version updates)
                  const dismissed = dismissedSuggestionIdsRef.current;
                  if (dismissed.size > 0 && sanitized.context.suggestions) {
                    const filtered = sanitized.context.suggestions.filter((s) => !dismissed.has(s.id));
                    sanitized.context.suggestions = filtered.length > 0 ? filtered : undefined;
                  }
                  sectionContextRef.current = sanitized;
                  break;
                }

                case 'section_draft': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  markPipelineProgress(
                    typeof data.section === 'string'
                      ? `Section draft ready: ${data.section}`
                      : 'A section draft is ready for review.',
                    'gate',
                    {
                      stage: 'section_review',
                      expectedNextAction: 'Review the section draft in Step 6',
                    },
                  );
                  setIsProcessing(false);
                  setIsPipelineGateActive(true);
                  const section = data.section as string;
                  const content = data.content as string;
                  setSectionDraft({ section, content });
                  sectionsMapRef.current[section] = content;
                  const contextForSection =
                    sectionContextRef.current?.section === section
                      ? sectionContextRef.current.context
                      : null;
                  // Show section review panel, merging in the latest workbench context
                  setPanelType('section_review' as PanelType);
                  setPanelData({
                    type: 'section_review',
                    section,
                    content,
                    review_token: (data.review_token as string | undefined) ?? undefined,
                    ...(contextForSection ? { context: contextForSection } : {}),
                  } as PanelData);
                  sendGateNotification('Section is ready for review');
                  break;
                }

                case 'section_revised': {
                  // Revision from quality review — update resume preview, no approval needed
                  const data = safeParse(msg.data);
                  if (!data) break;
                  markPipelineProgress(
                    typeof data.section === 'string'
                      ? `Updated section after quality review: ${data.section}`
                      : 'Updated a section after quality review.',
                    'system',
                    {
                      stage: 'revision',
                    },
                  );
                  const section = data.section as string;
                  const content = data.content as string;
                  setSectionDraft({ section, content });
                  sectionsMapRef.current[section] = content;
                  break;
                }

                case 'section_approved': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  const section = data.section as string;
                  if (section && sectionsMapRef.current[section]) {
                    setApprovedSections((prev) => ({ ...prev, [section]: sectionsMapRef.current[section] }));
                  }
                  break;
                }

                case 'quality_scores': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  markPipelineProgress(
                    'Step 7 quality review scores are ready.',
                    'system',
                    {
                      stage: 'quality_review',
                    },
                  );
                  const scores = data.scores as QualityScores;
                  setQualityScores(scores);
                  qualityScoresRef.current = scores;
                  // Show quality dashboard with 6-dimension scores
                  setPanelType('quality_dashboard');
                  setPanelData({
                    type: 'quality_dashboard',
                    ats_score: scores.ats_score,
                    authenticity_score: scores.authenticity,
                    hiring_manager: {
                      pass: scores.hiring_manager_impact >= 4,
                      checklist_total: scores.hiring_manager_impact,
                      checklist_max: 5,
                    },
                    keyword_coverage: scores.requirement_coverage,
                  } as PanelData);
                  break;
                }

                case 'draft_readiness_update': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  const gapBreakdownRaw = data.gap_breakdown && typeof data.gap_breakdown === 'object' && !Array.isArray(data.gap_breakdown)
                    ? (data.gap_breakdown as Record<string, unknown>)
                    : null;
                  const evidenceQualityRaw = data.evidence_quality && typeof data.evidence_quality === 'object' && !Array.isArray(data.evidence_quality)
                    ? (data.evidence_quality as Record<string, unknown>)
                    : null;
                  const highImpactRemaining: DraftReadinessUpdate['high_impact_remaining'] = Array.isArray(data.high_impact_remaining)
                    ? data.high_impact_remaining
                        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
                        .map((item) => {
                          const priority: 'must_have' | 'implicit' | 'nice_to_have' =
                            item.priority === 'must_have' || item.priority === 'implicit' || item.priority === 'nice_to_have'
                              ? item.priority
                              : 'nice_to_have';
                          return {
                            requirement: typeof item.requirement === 'string' ? item.requirement : '',
                            classification: (item.classification === 'partial' ? 'partial' : 'gap') as 'partial' | 'gap',
                            priority,
                            evidence_count: Number.isFinite(item.evidence_count as number) ? Math.max(0, Number(item.evidence_count)) : 0,
                          };
                        })
                        .filter((item) => item.requirement.length > 0)
                    : undefined;
                  const blockingReasons = Array.isArray(data.blocking_reasons)
                    ? data.blocking_reasons.filter((reason): reason is 'coverage_threshold' => (
                      reason === 'coverage_threshold'
                    ))
                    : undefined;
                  setDraftReadiness({
                    stage: (data.stage as PipelineStage) ?? 'gap_analysis',
                    workflow_mode: (data.workflow_mode === 'fast_draft' || data.workflow_mode === 'deep_dive'
                      ? data.workflow_mode
                      : 'balanced'),
                    evidence_count: Number.isFinite(data.evidence_count as number) ? Number(data.evidence_count) : 0,
                    minimum_evidence_target: Number.isFinite(data.minimum_evidence_target as number) ? Number(data.minimum_evidence_target) : 0,
                    coverage_score: Number.isFinite(data.coverage_score as number) ? Number(data.coverage_score) : 0,
                    coverage_threshold: Number.isFinite(data.coverage_threshold as number) ? Number(data.coverage_threshold) : 0,
                    ready: data.ready === true,
                    remaining_evidence_needed: Number.isFinite(data.remaining_evidence_needed as number)
                      ? Math.max(0, Number(data.remaining_evidence_needed))
                      : undefined,
                    remaining_coverage_needed: Number.isFinite(data.remaining_coverage_needed as number)
                      ? Math.max(0, Number(data.remaining_coverage_needed))
                      : undefined,
                    blocking_reasons: blockingReasons,
                    gap_breakdown: gapBreakdownRaw
                      ? {
                          total: Number.isFinite(gapBreakdownRaw.total as number) ? Math.max(0, Number(gapBreakdownRaw.total)) : 0,
                          strong: Number.isFinite(gapBreakdownRaw.strong as number) ? Math.max(0, Number(gapBreakdownRaw.strong)) : 0,
                          partial: Number.isFinite(gapBreakdownRaw.partial as number) ? Math.max(0, Number(gapBreakdownRaw.partial)) : 0,
                          gap: Number.isFinite(gapBreakdownRaw.gap as number) ? Math.max(0, Number(gapBreakdownRaw.gap)) : 0,
                        }
                      : undefined,
                    evidence_quality: evidenceQualityRaw
                      ? {
                          user_validated_count: Number.isFinite(evidenceQualityRaw.user_validated_count as number)
                            ? Math.max(0, Number(evidenceQualityRaw.user_validated_count))
                            : 0,
                          metrics_defensible_count: Number.isFinite(evidenceQualityRaw.metrics_defensible_count as number)
                            ? Math.max(0, Number(evidenceQualityRaw.metrics_defensible_count))
                            : 0,
                          mapped_requirement_evidence_count: Number.isFinite(evidenceQualityRaw.mapped_requirement_evidence_count as number)
                            ? Math.max(0, Number(evidenceQualityRaw.mapped_requirement_evidence_count))
                            : 0,
                        }
                      : undefined,
                    high_impact_remaining: highImpactRemaining,
                    suggested_question_count: Number.isFinite(data.suggested_question_count as number)
                      ? Math.max(0, Number(data.suggested_question_count))
                      : undefined,
                    note: typeof data.note === 'string' ? data.note : undefined,
                  });
                  break;
                }

                case 'workflow_replan_requested': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  markPipelineProgress(
                    typeof data.message === 'string'
                      ? data.message
                      : 'Benchmark assumptions changed. Downstream work will replan at the next safe checkpoint.',
                    'system',
                    {
                      stage: (data.current_stage as PipelineStage | undefined),
                      expectedNextAction: data.requires_restart === true
                        ? 'Restart and rebuild from the workspace banner'
                        : 'Wait for the pipeline to reach a safe checkpoint',
                    },
                  );
                  setWorkflowReplan({
                    state: 'requested',
                    reason: 'benchmark_assumptions_updated',
                    benchmark_edit_version: Number.isFinite(data.benchmark_edit_version as number)
                      ? Number(data.benchmark_edit_version)
                      : 0,
                    rebuild_from_stage: 'gap_analysis',
                    requires_restart: data.requires_restart === true,
                    current_stage: ((data.current_stage as PipelineStage | undefined) ?? 'research'),
                    stale_nodes: asReplanStaleNodes(data.stale_nodes),
                    message: typeof data.message === 'string' ? data.message : undefined,
                    updated_at: new Date().toISOString(),
                  });
                  break;
                }

                case 'workflow_replan_started': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  markPipelineProgress(
                    typeof data.message === 'string'
                      ? data.message
                      : 'Applying benchmark updates and rebuilding downstream steps.',
                    'system',
                    {
                      stage: (data.current_stage as PipelineStage | undefined),
                    },
                  );
                  setWorkflowReplan((prev) => ({
                    state: 'in_progress',
                    reason: 'benchmark_assumptions_updated',
                    benchmark_edit_version: Number.isFinite(data.benchmark_edit_version as number)
                      ? Number(data.benchmark_edit_version)
                      : (prev?.benchmark_edit_version ?? 0),
                    rebuild_from_stage: 'gap_analysis',
                    requires_restart: prev?.requires_restart,
                    current_stage: ((data.current_stage as PipelineStage | undefined) ?? prev?.current_stage ?? 'research'),
                    phase:
                      (data.phase === 'apply_benchmark_overrides'
                        || data.phase === 'refresh_gap_analysis'
                        || data.phase === 'rebuild_blueprint')
                        ? data.phase
                        : prev?.phase,
                    stale_nodes: asReplanStaleNodes(data.stale_nodes) ?? prev?.stale_nodes,
                    message: typeof data.message === 'string' ? data.message : undefined,
                    updated_at: new Date().toISOString(),
                  }));
                  break;
                }

                case 'workflow_replan_completed': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  markPipelineProgress(
                    typeof data.message === 'string'
                      ? data.message
                      : 'Benchmark replan completed for the current run.',
                    'system',
                    {
                      stage: (data.current_stage as PipelineStage | undefined),
                    },
                  );
                  setWorkflowReplan((prev) => ({
                    state: 'completed',
                    reason: 'benchmark_assumptions_updated',
                    benchmark_edit_version: Number.isFinite(data.benchmark_edit_version as number)
                      ? Number(data.benchmark_edit_version)
                      : (prev?.benchmark_edit_version ?? 0),
                    rebuild_from_stage: 'gap_analysis',
                    requires_restart: false,
                    current_stage: ((data.current_stage as PipelineStage | undefined) ?? prev?.current_stage ?? 'research'),
                    phase: prev?.phase,
                    rebuilt_through_stage:
                      (data.rebuilt_through_stage === 'research'
                        || data.rebuilt_through_stage === 'gap_analysis'
                        || data.rebuilt_through_stage === 'architect')
                        ? data.rebuilt_through_stage
                        : prev?.rebuilt_through_stage,
                    stale_nodes: asReplanStaleNodes(data.stale_nodes) ?? prev?.stale_nodes,
                    message: typeof data.message === 'string' ? data.message : undefined,
                    updated_at: new Date().toISOString(),
                  }));
                  break;
                }

                case 'revision_start': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  markPipelineProgress(
                    'Applying quality-review revisions to resume sections.',
                    'system',
                    {
                      stage: 'revision',
                    },
                  );
                  setIsProcessing(true);
                  const instructionCount = Array.isArray(data.instructions) ? data.instructions.length : 0;
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: nextId(),
                      role: 'system',
                      content: `Revising ${instructionCount} sections based on quality review...`,
                      timestamp: new Date().toISOString(),
                    },
                  ]);
                  break;
                }

                case 'system_message': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  const content = (data.content as string | undefined)?.trim();
                  if (!content) break;
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: nextId(),
                      role: 'system',
                      content,
                      timestamp: new Date().toISOString(),
                    },
                  ]);
                  break;
                }

                case 'section_error': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  const section = (data.section as string | undefined) ?? 'section';
                  const err = (data.error as string | undefined) ?? 'Unknown error';
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: nextId(),
                      role: 'system',
                      content: `Section issue (${section}): ${err}. Fallback content was used so the pipeline could continue.`,
                      timestamp: new Date().toISOString(),
                    },
                  ]);
                  break;
                }

                case 'pipeline_complete': {
                  const data = safeParse(msg.data);
                  markPipelineProgress(
                    'Resume pipeline complete. Final resume and export checks are ready.',
                    'stage_complete',
                    {
                      stage: 'complete',
                      expectedNextAction: 'Review Step 7 results and export your resume',
                    },
                  );
                  setIsPipelineGateActive(false);
                  setIsProcessing(false);
                  setSessionComplete(true);
                  setPipelineStage('complete');
                  // Prefer server-assembled structured resume payload.
                  if (data?.resume && typeof data.resume === 'object') {
                    setResume(data.resume as FinalResume);
                  } else {
                    // Fallback: Build from section text if structured payload is missing.
                    const sections = sectionsMapRef.current;
                    const contactInfo = data?.contact_info as FinalResume['contact_info'] | undefined;
                    const companyName = data?.company_name as string | undefined;
                    const builtResume: FinalResume = {
                      contact_info: contactInfo ?? undefined,
                      company_name: companyName ?? undefined,
                      summary: sections.summary ?? '',
                      experience: [],
                      skills: {},
                      education: [],
                      certifications: [],
                      selected_accomplishments: sections.selected_accomplishments ?? '',
                      ats_score: 0,
                      section_order: Object.keys(sections),
                      _raw_sections: sections,
                    };
                    setResume(builtResume);
                  }

                  setPanelType('completion');
                  setPanelData({
                    type: 'completion',
                    ats_score: (data?.resume as { ats_score?: number } | undefined)?.ats_score,
                    keyword_coverage: qualityScoresRef.current?.requirement_coverage,
                    authenticity_score: qualityScoresRef.current?.authenticity,
                    export_validation: data?.export_validation as {
                      passed: boolean;
                      findings: Array<{ section: string; issue: string; instruction: string; priority: 'high' | 'medium' | 'low' }>;
                    } | undefined,
                  } as PanelData);
                  break;
                }

                case 'pipeline_error': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  markPipelineProgress(
                    typeof data.error === 'string' ? `Pipeline error: ${data.error}` : 'Pipeline error',
                    'system',
                    {
                      stage:
                        data.stage === 'intake'
                        || data.stage === 'positioning'
                        || data.stage === 'research'
                        || data.stage === 'gap_analysis'
                        || data.stage === 'architect'
                        || data.stage === 'architect_review'
                        || data.stage === 'section_writing'
                        || data.stage === 'section_review'
                        || data.stage === 'quality_review'
                        || data.stage === 'revision'
                        || data.stage === 'complete'
                          ? (data.stage as PipelineStage)
                          : undefined,
                      expectedNextAction: 'Reconnect or refresh state before restarting the pipeline',
                    },
                  );
                  setIsPipelineGateActive(false);
                  setIsProcessing(false);
                  setError(data.error as string ?? 'Pipeline error');
                  break;
                }

                case 'draft_path_decision':
                case 'questionnaire_reuse_summary':
                  // Handled via workflow REST API, not SSE — ignore silently.
                  break;

                default: {
                  console.warn('[useAgent] Unknown SSE event:', msg.event);
                  break;
                }
              }
            }
          } catch (err) {
            // AbortError is expected when we intentionally close the connection
            if (err instanceof DOMException && err.name === 'AbortError') {
              return;
            }
            console.error('[useAgent] SSE stream error:', err);
          }

          // Stream ended (server closed connection or network drop) — attempt reconnect
          if (!controller.signal.aborted && mountedRef.current) {
            handleDisconnect();
          }
        })
        .catch((err) => {
          // AbortError is expected during cleanup
          if (err instanceof DOMException && err.name === 'AbortError') {
            return;
          }
          console.error('[useAgent] SSE fetch error:', err);
          handleDisconnect();
        });
    }

    mountedRef.current = true;
    connectSSE();

    // Stale-processing detector: check every 10s if processing has stalled
    const STALE_THRESHOLD_MS = 120_000; // 2 min — first warning at 2 min
    staleCheckIntervalRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      if (isProcessingRef.current && Date.now() - lastProgressTimestampRef.current > STALE_THRESHOLD_MS) {
        if (!staleNoticeActiveRef.current) {
          staleNoticeActiveRef.current = true;
          setStalledSuspected(true);
          setPipelineActivityMeta((prev) => ({
            ...prev,
            current_activity_message:
              'No confirmed backend progress was detected for a while. The pipeline may be stalled.',
            current_activity_source: 'system',
            expected_next_action: 'Use Reconnect or Refresh State to confirm pipeline status',
          }));
          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: 'system',
              content: 'Processing looks stalled (no confirmed backend updates for a while). Try reconnecting or refreshing the page. If the pipeline is waiting for input, check the center workspace for a questionnaire or review step.',
              timestamp: new Date().toISOString(),
            },
          ]);
        }
      }
    }, 10_000);

    return () => {
      mountedRef.current = false;
      // Clean up fetch connection
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      // Clean up reconnect timer
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      // Clean up animation frame
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      // Clean up stale-processing detector
      if (staleCheckIntervalRef.current) {
        clearInterval(staleCheckIntervalRef.current);
        staleCheckIntervalRef.current = null;
      }
      // Clean up tool removal timers
      for (const timer of toolCleanupTimersRef.current) {
        clearTimeout(timer);
      }
      toolCleanupTimersRef.current.clear();
      reconnectAttemptsRef.current = 0;
    };
  }, [sessionId, hasAccessToken, nextId, flushDeltaBuffer, handleDisconnect, markPipelineProgress, patchPipelineActivityMeta]);

  // Fallback status poll: when SSE is disconnected, keep pipeline stage/gate state synchronized.
  useEffect(() => {
    if (!sessionId || !hasAccessToken || !accessTokenRef.current || sessionComplete) return;
    let cancelled = false;

    const restoreCompletionFromSession = async () => {
      const token = accessTokenRef.current;
      if (!token) return;
      const sessionRes = await fetch(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!sessionRes.ok) return;
      const payload = await sessionRes.json().catch(() => null) as {
        session?: {
          last_panel_type?: string | null;
          last_panel_data?: { resume?: FinalResume } | null;
        };
      } | null;
      if (cancelled) return;
      const lastPanelType = payload?.session?.last_panel_type;
      const lastPanelData = payload?.session?.last_panel_data;
      if (lastPanelType !== 'completion') return;

      const restoredResume = lastPanelData?.resume;
      if (restoredResume) {
        setResume(restoredResume);
        setPanelType('completion');
        setPanelData({
          type: 'completion',
          ats_score: restoredResume.ats_score,
        } as PanelData);
      }
      setSessionComplete(true);
      setPipelineStage('complete');
      setCurrentPhase('complete');
      setAskPrompt(null);
      setPhaseGate(null);
      setIsPipelineGateActive(false);
      setIsProcessing(false);
      patchPipelineActivityMeta({
        processing_state: 'complete',
        stage: 'complete',
        current_activity_message: 'Restored final resume outputs from the completed pipeline run.',
        current_activity_source: 'restore',
        expected_next_action: 'Review the final resume and export options',
      });
    };

    const pollStatus = async () => {
      if (cancelled || connected) return;
      try {
        const token = accessTokenRef.current;
        if (!token) return;
        const res = await fetch(`${API_BASE}/pipeline/status?session_id=${encodeURIComponent(sessionId)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => null) as {
          running?: boolean;
          pending_gate?: string | null;
          stale_pipeline?: boolean;
          pipeline_stage?: string | null;
        } | null;
        if (!data || cancelled) return;
        setLastBackendActivityAt(new Date().toISOString());
        setPipelineActivityMeta((prev) => ({
          ...prev,
          last_backend_activity_at: new Date().toISOString(),
        }));
        if (data.running) {
          setStalledSuspected(false);
        }

        if (data.stale_pipeline && !stalePipelineNoticeRef.current) {
          stalePipelineNoticeRef.current = true;
          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: 'system',
              content: 'Session state became stale. Restart the pipeline from this session to continue.',
              timestamp: new Date().toISOString(),
            },
          ]);
          setIsPipelineGateActive(false);
          setPhaseGate(null);
          setAskPrompt(null);
          setIsProcessing(false);
          setPipelineActivityMeta((prev) => ({
            ...prev,
            processing_state: 'idle',
            current_activity_message: 'Pipeline state became stale. Restart the pipeline from this session to continue.',
            current_activity_source: 'poll',
            expected_next_action: 'Restart and rebuild from the workspace banner',
          }));
          return;
        }

        if (data.running) {
          if (data.pipeline_stage) {
            setPipelineStage(data.pipeline_stage as PipelineStage);
            setCurrentPhase(data.pipeline_stage);
          }
          setIsPipelineGateActive(Boolean(data.pending_gate));
          setIsProcessing(!Boolean(data.pending_gate));
          if (!data.pending_gate) {
            setAskPrompt(null);
            setPhaseGate(null);
          }
          setPipelineActivityMeta((prev) => ({
            ...prev,
            processing_state: data.pending_gate ? 'waiting_for_input' : 'reconnecting',
            stage: (data.pipeline_stage as PipelineStage | null) ?? prev.stage,
            current_activity_message: data.pending_gate
              ? 'Polling confirms the pipeline is waiting for your input.'
              : 'Polling confirms the pipeline is still processing while the live stream reconnects.',
            current_activity_source: 'poll',
            expected_next_action: data.pending_gate
              ? 'Complete the active workspace action'
              : 'Wait for the live stream to reconnect or use Reconnect Stream',
          }));
        } else {
          if (data.pipeline_stage) {
            setPipelineStage(data.pipeline_stage as PipelineStage);
            setCurrentPhase(data.pipeline_stage);
          }
          setIsPipelineGateActive(false);
          setAskPrompt(null);
          setPhaseGate(null);
          setIsProcessing(false);
          setPipelineActivityMeta((prev) => ({
            ...prev,
            processing_state: data.pipeline_stage === 'complete' ? 'complete' : 'idle',
            stage: (data.pipeline_stage as PipelineStage | null) ?? prev.stage,
            current_activity_message: data.pipeline_stage === 'complete'
              ? 'Polling confirms the pipeline run is complete.'
              : 'Polling confirms the pipeline is not actively processing.',
            current_activity_source: 'poll',
            expected_next_action: data.pipeline_stage === 'complete'
              ? 'Review the final resume and export'
              : null,
          }));
          if (data.pipeline_stage === 'complete' && !sessionComplete) {
            await restoreCompletionFromSession();
          }
        }
      } catch {
        // best effort
      }
    };

    const interval = setInterval(() => {
      void pollStatus();
    }, 12_000);
    void pollStatus();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId, hasAccessToken, connected, sessionComplete, nextId, setIsPipelineGateActive, patchPipelineActivityMeta]);

  // Mark a suggestion as dismissed so it is filtered out of future context versions
  const dismissSuggestion = useCallback((suggestionId: string) => {
    dismissedSuggestionIdsRef.current.add(suggestionId);
    // Also remove from the current in-memory context so UI reflects immediately
    if (sectionContextRef.current?.context.suggestions) {
      const filtered = sectionContextRef.current.context.suggestions.filter((s) => s.id !== suggestionId);
      sectionContextRef.current = {
        ...sectionContextRef.current,
        context: {
          ...sectionContextRef.current.context,
          suggestions: filtered.length > 0 ? filtered : undefined,
        },
      };
    }
  }, []);

  const addUserMessage = useCallback((content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: nextId(),
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      },
    ]);
    // Clear previous tool statuses for new round
    setTools([]);
    setAskPrompt(null);
    setPhaseGate(null);
    setIsProcessing(true);
  }, [nextId]);

  const reconnectStreamNow = useCallback(() => {
    if (!mountedRef.current) return;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    staleNoticeActiveRef.current = false;
    stalePipelineNoticeRef.current = false;
    setStalledSuspected(false);
    setError(null);
    setConnected(false);
    patchPipelineActivityMeta({
      current_activity_message: 'Reconnecting to the live workflow stream...',
      current_activity_source: 'system',
      expected_next_action: 'Receive live backend updates',
    });
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // connectSSE reads the latest refs and safely aborts any stale connection before starting.
    connectSSERef.current?.();
  }, [patchPipelineActivityMeta]);

  const pipelineActivity: PipelineActivitySnapshot = {
    ...pipelineActivityMeta,
    processing_state: error
      ? 'error'
      : sessionComplete
        ? 'complete'
        : stalledSuspected
          ? 'stalled_suspected'
          : (!connected && (isProcessing || isPipelineGateActive))
            ? 'reconnecting'
            : isPipelineGateActive
              ? 'waiting_for_input'
              : isProcessing
                ? 'processing'
                : 'idle',
    stage: pipelineStage ?? pipelineActivityMeta.stage ?? null,
    last_backend_activity_at: lastBackendActivityAt ?? pipelineActivityMeta.last_backend_activity_at ?? null,
  };

  return {
    messages,
    streamingText,
    tools,
    askPrompt,
    phaseGate,
    currentPhase,
    isProcessing,
    setIsProcessing,
    resume,
    connected,
    lastBackendActivityAt,
    stalledSuspected,
    sessionComplete,
    error,
    panelType,
    panelData,
    addUserMessage,
    pipelineStage,
    positioningQuestion,
    positioningProfileFound,
    blueprintReady,
    sectionDraft,
    qualityScores,
    draftReadiness,
    workflowReplan,
    pipelineActivity,
    isPipelineGateActive,
    setIsPipelineGateActive,
    dismissSuggestion,
    approvedSections,
    reconnectStreamNow,
  };
}
