import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChatMessage, ToolStatus, AskUserPromptData, PhaseGateData, PipelineStage, PositioningQuestion, QualityScores, CategoryProgress } from '@/types/session';
import type { FinalResume } from '@/types/resume';
import type { PanelType, PanelData } from '@/types/panels';
import { parseSSEStream } from '@/lib/sse-parser';

const MAX_RECONNECT_ATTEMPTS = 5;
const MAX_TOOL_STATUS_ENTRIES = 20;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeParse(data: string): Record<string, any> | null {
  try {
    return JSON.parse(data);
  } catch {
    console.warn('[useAgent] Failed to parse SSE data:', data?.substring(0, 200));
    return null;
  }
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
  const [qualityScores, setQualityScores] = useState<QualityScores | null>(null);
  // Ref mirror so pipeline_complete handler can read latest quality scores
  const qualityScoresRef = useRef<QualityScores | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Accumulate all section content for building FinalResume at pipeline_complete
  const sectionsMapRef = useRef<Record<string, string>>({});
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
  const staleCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stalePipelineNoticeRef = useRef<boolean>(false);

  const nextId = useCallback(() => {
    messageIdRef.current += 1;
    return `msg-${messageIdRef.current}`;
  }, []);

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
    }
  }, []);

  // Reset derived score state on session change so completion metrics can't leak across sessions.
  useEffect(() => {
    qualityScoresRef.current = null;
    setQualityScores(null);
    setIsPipelineGateActive(false);
    stalePipelineNoticeRef.current = false;
  }, [sessionId]);

  // Connect to SSE with fetch-based streaming
  useEffect(() => {
    if (!sessionId || !accessToken) return;

    function connectSSE() {
      // Update ref so handleDisconnect always uses the latest version
      connectSSERef.current = connectSSE;

      // Abort any existing connection
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      fetch(`/api/sessions/${sessionId}/sse`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
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

              switch (msg.event) {
                case 'connected': {
                  setConnected(true);
                  setError(null);
                  reconnectAttemptsRef.current = 0;
                  break;
                }

                case 'session_restore': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  if (data.current_phase) {
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
                    // Restore gate-active state for interactive panels, but only if
                    // the pipeline is actually running (not completed/errored).
                    // After server restart, runningPipelines is empty and the gate
                    // may already be resolved server-side.
                    const gateTypes = ['questionnaire', 'section_review', 'blueprint_review', 'positioning_interview'];
                    const pipelineRunning = data.pipeline_status === 'running';
                    setIsPipelineGateActive(
                      pipelineRunning && gateTypes.includes(data.last_panel_type as string),
                    );
                  }
                  // On restore, clear processing state — the agent loop isn't running
                  setIsProcessing(false);
                  // Restore pending phase gate so the user can confirm/reject after reconnect
                  if (data.pending_phase_transition && data.pending_tool_call_id) {
                    setPhaseGate({
                      toolCallId: data.pending_tool_call_id as string,
                      currentPhase: data.current_phase as string,
                      nextPhase: data.pending_phase_transition as string,
                      phaseSummary: 'Phase complete (restored after reconnect)',
                      nextPhasePreview: '',
                    });
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
                  setIsPipelineGateActive(false);
                  setError(errorMsg as string);
                  setIsProcessing(false);
                  break;
                }

                case 'heartbeat': {
                  // No-op, just keeps connection alive
                  break;
                }

                case 'stage_start': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  lastProgressTimestampRef.current = Date.now();
                  staleNoticeActiveRef.current = false;
                  setIsPipelineGateActive(false);
                  setPipelineStage(data.stage as PipelineStage);
                  setCurrentPhase(data.stage as string);
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

                case 'stage_complete': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  lastProgressTimestampRef.current = Date.now();
                  staleNoticeActiveRef.current = false;
                  setPipelineStage(data.stage as PipelineStage);
                  setIsProcessing(false);
                  if (data.duration_ms) {
                    console.log(`[pipeline] ${data.stage} completed in ${(data.duration_ms as number / 1000).toFixed(1)}s`);
                  }
                  break;
                }

                case 'positioning_question': {
                  const data = safeParse(msg.data);
                  if (!data) break;
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
                  break;
                }

                case 'questionnaire': {
                  const data = safeParse(msg.data);
                  if (!data) break;
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
                  break;
                }

                case 'positioning_profile_found': {
                  const data = safeParse(msg.data);
                  if (!data) break;
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
                  break;
                }

                case 'section_draft': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  lastProgressTimestampRef.current = Date.now();
                  staleNoticeActiveRef.current = false;
                  setIsProcessing(false);
                  setIsPipelineGateActive(true);
                  const section = data.section as string;
                  const content = data.content as string;
                  setSectionDraft({ section, content });
                  sectionsMapRef.current[section] = content;
                  // Show section review panel
                  setPanelType('section_review' as PanelType);
                  setPanelData({
                    type: 'section_review',
                    section,
                    content,
                  } as PanelData);
                  break;
                }

                case 'section_revised': {
                  // Revision from quality review — update resume preview, no approval needed
                  const data = safeParse(msg.data);
                  if (!data) break;
                  lastProgressTimestampRef.current = Date.now();
                  staleNoticeActiveRef.current = false;
                  const section = data.section as string;
                  const content = data.content as string;
                  setSectionDraft({ section, content });
                  sectionsMapRef.current[section] = content;
                  break;
                }

                case 'section_approved': {
                  // Acknowledgement only — no state update needed
                  break;
                }

                case 'quality_scores': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  lastProgressTimestampRef.current = Date.now();
                  staleNoticeActiveRef.current = false;
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

                case 'revision_start': {
                  const data = safeParse(msg.data);
                  if (!data) break;
                  lastProgressTimestampRef.current = Date.now();
                  staleNoticeActiveRef.current = false;
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
                  lastProgressTimestampRef.current = Date.now();
                  staleNoticeActiveRef.current = false;
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
                  lastProgressTimestampRef.current = Date.now();
                  staleNoticeActiveRef.current = false;
                  setIsPipelineGateActive(false);
                  setIsProcessing(false);
                  setError(data.error as string ?? 'Pipeline error');
                  break;
                }

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
      // Use functional state read to avoid stale closure over isProcessing
      setIsProcessing((currentlyProcessing) => {
        if (currentlyProcessing && Date.now() - lastProgressTimestampRef.current > STALE_THRESHOLD_MS) {
          if (!staleNoticeActiveRef.current) {
            console.warn('[useAgent] Stale processing detected — no progress events for 120s. Resetting once.');
            staleNoticeActiveRef.current = true;
            setMessages((prev) => [
              ...prev,
              {
                id: nextId(),
                role: 'system',
                content: 'Session appears stalled. You can send a message to retry or refresh the page.',
                timestamp: new Date().toISOString(),
              },
            ]);
          }
          return false; // reset isProcessing
        }
        return currentlyProcessing; // no change
      });
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
  }, [sessionId, accessToken, nextId, flushDeltaBuffer, handleDisconnect]);

  // Fallback status poll: when SSE is disconnected, keep pipeline stage/gate state synchronized.
  useEffect(() => {
    if (!sessionId || !accessToken || sessionComplete) return;
    let cancelled = false;

    const restoreCompletionFromSession = async () => {
      const sessionRes = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
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
      setIsPipelineGateActive(false);
      setIsProcessing(false);
    };

    const pollStatus = async () => {
      if (cancelled || connected) return;
      try {
        const res = await fetch(`/api/pipeline/status?session_id=${encodeURIComponent(sessionId)}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
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
          setIsProcessing(false);
          return;
        }

        if (data.running) {
          if (data.pipeline_stage) {
            setPipelineStage(data.pipeline_stage as PipelineStage);
            setCurrentPhase(data.pipeline_stage);
          }
          if (data.pending_gate) {
            setIsPipelineGateActive(true);
          }
        } else {
          setIsPipelineGateActive(false);
          setIsProcessing(false);
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
  }, [sessionId, accessToken, connected, sessionComplete, nextId, setIsPipelineGateActive]);

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
    isPipelineGateActive,
    setIsPipelineGateActive,
  };
}
