import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChatMessage, ToolStatus, AskUserPromptData } from '@/types/session';
import type { FinalResume } from '@/types/resume';

export function useAgent(sessionId: string | null, accessToken: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [tools, setTools] = useState<ToolStatus[]>([]);
  const [askPrompt, setAskPrompt] = useState<AskUserPromptData | null>(null);
  const [resume, setResume] = useState<FinalResume | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      setAskPrompt({
        toolCallId: data.tool_call_id,
        question: data.question,
        context: data.context,
        inputType: data.input_type,
        choices: data.choices,
        skipAllowed: data.skip_allowed,
      });
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
  }, [nextId]);

  const clearAskPrompt = useCallback(() => {
    setAskPrompt(null);
  }, []);

  return {
    messages,
    streamingText,
    tools,
    askPrompt,
    resume,
    connected,
    error,
    addUserMessage,
    clearAskPrompt,
  };
}
