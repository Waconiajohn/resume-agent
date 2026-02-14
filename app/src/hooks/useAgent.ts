import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChatMessage, ToolStatus, AskUserPromptData, PhaseGateData } from '@/types/session';
import type { FinalResume } from '@/types/resume';
import type { PanelType } from '@/types/panels';

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
  const [panelData, setPanelData] = useState<Record<string, unknown> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const messageIdRef = useRef(0);

  const nextId = useCallback(() => {
    messageIdRef.current += 1;
    return `msg-${messageIdRef.current}`;
  }, []);

  // Connect to SSE
  useEffect(() => {
    if (!sessionId || !accessToken) return;

    const es = new EventSource(`/api/sessions/${sessionId}/sse?token=${accessToken}`);
    eventSourceRef.current = es;

    es.addEventListener('connected', () => {
      setConnected(true);
      setError(null);
    });

    es.addEventListener('text_delta', (e) => {
      const data = JSON.parse(e.data);
      setIsProcessing(false);
      setStreamingText((prev) => prev + data.content);
    });

    es.addEventListener('text_complete', (e) => {
      const data = JSON.parse(e.data);
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
      setTools((prev) => [
        ...prev,
        { name: data.tool_name, description: data.description, status: 'running' },
      ]);
    });

    es.addEventListener('tool_complete', (e) => {
      const data = JSON.parse(e.data);
      setTools((prev) =>
        prev.map((t) =>
          t.name === data.tool_name && t.status === 'running'
            ? { ...t, status: 'complete', summary: data.summary }
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
      setPanelData(data.data);
    });

    es.addEventListener('phase_change', (e) => {
      const data = JSON.parse(e.data);
      setCurrentPhase(data.to_phase);
      setPhaseGate(null);
      setPanelData(null);
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
      setResume((prev) => {
        const base = prev ?? {
          summary: '',
          experience: [],
          skills: {},
          education: [],
          certifications: [],
          ats_score: 0,
        };
        return { ...base, [data.section]: data.content };
      });
    });

    es.addEventListener('export_ready', (e) => {
      const data = JSON.parse(e.data);
      setResume(data.resume);
    });

    es.addEventListener('error', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        setError(data.message);
      } catch {
        setError('Connection lost');
      }
    });

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [sessionId, accessToken, nextId]);

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
