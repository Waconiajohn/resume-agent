import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChatMessage, ToolStatus, AskUserPromptData, PhaseGateData } from '@/types/session';
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
  const [error, setError] = useState<string | null>(null);
  const [panelType, setPanelType] = useState<PanelType | null>(null);
  const [panelData, setPanelData] = useState<PanelData | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messageIdRef = useRef(0);

  // Track last text_complete content to deduplicate
  const lastTextCompleteRef = useRef<string>('');

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

  // Reconnect with exponential backoff
  const handleDisconnect = useCallback((connectFn: () => void) => {
    setConnected(false);

    if (!mountedRef.current) return;

    if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
      const delay = Math.pow(2, reconnectAttemptsRef.current) * 1000; // 1s, 2s, 4s, 8s, 16s
      reconnectAttemptsRef.current += 1;
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          connectFn();
        }
      }, delay);
    } else {
      setError('Connection lost');
    }
  }, []);

  // Connect to SSE with fetch-based streaming
  useEffect(() => {
    if (!sessionId || !accessToken) return;

    function connectSSE() {
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
            handleDisconnect(connectSSE);
            return;
          }

          if (!response.body) {
            console.error('[useAgent] SSE response has no body');
            setError('Connection failed (no response body)');
            handleDisconnect(connectSSE);
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
                    const restored: ChatMessage[] = (data.messages as Array<{ role: string; content: string }>).map((m, i) => ({
                      id: `restored-${i}`,
                      role: m.role as 'user' | 'assistant',
                      content: m.content,
                      timestamp: new Date().toISOString(),
                    }));
                    setMessages(restored);
                    messageIdRef.current = restored.length;
                  }
                  if (data.last_panel_type && data.last_panel_data) {
                    setPanelType(data.last_panel_type as PanelType);
                    setPanelData({ type: data.last_panel_type, ...(data.last_panel_data as Record<string, unknown>) } as PanelData);
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
                  // Deduplicate text_complete events
                  if (data.content === lastTextCompleteRef.current) break;
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
                  setPanelType(data.panel_type as PanelType);
                  // Tag panel data with type for discriminated union
                  setPanelData({ type: data.panel_type, ...data.data } as PanelData);
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

                case 'complete': {
                  // Abort the connection on session complete
                  controller.abort();
                  abortControllerRef.current = null;
                  setConnected(false);
                  break;
                }

                case 'error': {
                  const data = safeParse(msg.data);
                  setError(data?.message as string ?? 'Connection lost');
                  break;
                }

                case 'heartbeat': {
                  // No-op, just keeps connection alive
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
            handleDisconnect(connectSSE);
          }
        })
        .catch((err) => {
          // AbortError is expected during cleanup
          if (err instanceof DOMException && err.name === 'AbortError') {
            return;
          }
          console.error('[useAgent] SSE fetch error:', err);
          handleDisconnect(connectSSE);
        });
    }

    mountedRef.current = true;
    connectSSE();

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
      // Clean up tool removal timers
      for (const timer of toolCleanupTimersRef.current) {
        clearTimeout(timer);
      }
      toolCleanupTimersRef.current.clear();
      reconnectAttemptsRef.current = 0;
    };
  }, [sessionId, accessToken, nextId, flushDeltaBuffer, handleDisconnect]);

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

  const clearAskPrompt = useCallback(() => {
    setAskPrompt(null);
  }, []);

  const clearPhaseGate = useCallback(() => {
    setPhaseGate(null);
  }, []);

  return {
    messages,
    streamingText,
    tools,
    askPrompt,
    phaseGate,
    currentPhase,
    isProcessing,
    resume,
    connected,
    error,
    panelType,
    panelData,
    addUserMessage,
    clearAskPrompt,
    clearPhaseGate,
  };
}
