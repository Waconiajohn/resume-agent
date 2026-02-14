import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChatMessage, ToolStatus, AskUserPromptData, PhaseGateData } from '@/types/session';
import type { FinalResume } from '@/types/resume';
import type { PanelType, PanelData } from '@/types/panels';

const MAX_RECONNECT_ATTEMPTS = 5;
const MAX_TOOL_STATUS_ENTRIES = 20;

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
  const eventSourceRef = useRef<EventSource | null>(null);
  const messageIdRef = useRef(0);

  // 3C: Track last text_complete content to deduplicate
  const lastTextCompleteRef = useRef<string>('');

  // 3B: Reconnection tracking
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 3L: text_delta batching with requestAnimationFrame
  const deltaBufferRef = useRef('');
  const rafIdRef = useRef<number | null>(null);

  const nextId = useCallback(() => {
    messageIdRef.current += 1;
    return `msg-${messageIdRef.current}`;
  }, []);

  // 3L: Flush delta buffer to state
  const flushDeltaBuffer = useCallback(() => {
    if (deltaBufferRef.current) {
      const buffered = deltaBufferRef.current;
      deltaBufferRef.current = '';
      setStreamingText((prev) => prev + buffered);
    }
    rafIdRef.current = null;
  }, []);

  // Connect to SSE with reconnection (3B)
  useEffect(() => {
    if (!sessionId || !accessToken) return;

    function connectSSE() {
      const es = new EventSource(`/api/sessions/${sessionId}/sse?token=${accessToken}`);
      eventSourceRef.current = es;

      es.addEventListener('connected', () => {
        setConnected(true);
        setError(null);
        // 3B: Reset reconnect counter on successful connect
        reconnectAttemptsRef.current = 0;
      });

      es.addEventListener('text_delta', (e) => {
        const data = JSON.parse(e.data);
        setIsProcessing(false);
        // 3L: Accumulate deltas in buffer, flush via rAF
        deltaBufferRef.current += data.content;
        if (rafIdRef.current === null) {
          rafIdRef.current = requestAnimationFrame(flushDeltaBuffer);
        }
      });

      es.addEventListener('text_complete', (e) => {
        const data = JSON.parse(e.data);
        // 3C: Deduplicate text_complete events
        if (data.content === lastTextCompleteRef.current) return;
        lastTextCompleteRef.current = data.content;

        // 3L: Flush any remaining buffered deltas before completing
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
      });

      es.addEventListener('tool_start', (e) => {
        const data = JSON.parse(e.data);
        // 3M: Cap tool status array
        setTools((prev) => {
          const next = [
            ...prev,
            { name: data.tool_name, description: data.description, status: 'running' as const },
          ];
          return next.length > MAX_TOOL_STATUS_ENTRIES ? next.slice(-MAX_TOOL_STATUS_ENTRIES) : next;
        });
      });

      es.addEventListener('tool_complete', (e) => {
        const data = JSON.parse(e.data);
        setTools((prev) =>
          prev.map((t) =>
            t.name === data.tool_name && t.status === 'running'
              ? { ...t, status: 'complete' as const, summary: data.summary }
              : t,
          ),
        );
      });

      es.addEventListener('ask_user', (e) => {
        const data = JSON.parse(e.data);
        setIsProcessing(false);
        setAskPrompt({
          toolCallId: data.tool_call_id,
          question: data.question,
          context: data.context,
          inputType: data.input_type,
          choices: data.choices,
          skipAllowed: data.skip_allowed,
        });
      });

      es.addEventListener('phase_gate', (e) => {
        const data = JSON.parse(e.data);
        setIsProcessing(false);
        setPhaseGate({
          toolCallId: data.tool_call_id,
          currentPhase: data.current_phase,
          nextPhase: data.next_phase,
          phaseSummary: data.phase_summary,
          nextPhasePreview: data.next_phase_preview,
        });
      });

      es.addEventListener('right_panel_update', (e) => {
        const data = JSON.parse(e.data);
        setPanelType(data.panel_type as PanelType);
        // 3A: Tag panel data with type for discriminated union
        setPanelData({ type: data.panel_type, ...data.data } as PanelData);
      });

      es.addEventListener('phase_change', (e) => {
        const data = JSON.parse(e.data);
        setCurrentPhase(data.to_phase);
        setPhaseGate(null);
        // 3P: Clear stale state on phase change
        setAskPrompt(null);
        setTools([]);
      });

      es.addEventListener('transparency', (e) => {
        const data = JSON.parse(e.data);
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
      });

      es.addEventListener('resume_update', (e) => {
        const data = JSON.parse(e.data);
        // 3O: Normalize content - coerce object to string
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
      });

      es.addEventListener('export_ready', (e) => {
        const data = JSON.parse(e.data);
        setResume(data.resume);
      });

      // 3Q: Close EventSource on session complete
      es.addEventListener('complete', () => {
        es.close();
        eventSourceRef.current = null;
        setConnected(false);
      });

      es.addEventListener('error', (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data);
          setError(data.message);
        } catch {
          setError('Connection lost');
        }
      });

      // 3B: Reconnect with exponential backoff on connection error
      es.onerror = () => {
        setConnected(false);
        es.close();
        eventSourceRef.current = null;

        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.pow(2, reconnectAttemptsRef.current) * 1000; // 1s, 2s, 4s, 8s, 16s
          reconnectAttemptsRef.current += 1;
          reconnectTimerRef.current = setTimeout(() => {
            connectSSE();
          }, delay);
        } else {
          setError('Connection lost');
        }
      };
    }

    connectSSE();

    return () => {
      // Clean up EventSource
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      // Clean up reconnect timer
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      // 3L: Clean up animation frame
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      reconnectAttemptsRef.current = 0;
    };
  }, [sessionId, accessToken, nextId, flushDeltaBuffer]);

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
