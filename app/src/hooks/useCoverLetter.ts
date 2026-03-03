import { useState, useCallback, useRef, useEffect } from 'react';
import { parseSSEStream } from '@/lib/sse-parser';
import { API_BASE } from '@/lib/api';

export type CoverLetterStatus = 'idle' | 'connecting' | 'running' | 'complete' | 'error';

export interface ActivityMessage {
  id: string;
  text: string;
  stage: string;
  timestamp: number;
}

interface CoverLetterState {
  status: CoverLetterStatus;
  letterDraft: string | null;
  qualityScore: number | null;
  activityMessages: ActivityMessage[];
  error: string | null;
  currentStage: string | null;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const MAX_ACTIVITY_MESSAGES = 20;

export function useCoverLetter(accessToken: string | null) {
  const [state, setState] = useState<CoverLetterState>({
    status: 'idle',
    letterDraft: null,
    qualityScore: null,
    activityMessages: [],
    error: null,
    currentStage: null,
  });

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, []);

  const addActivity = useCallback((text: string, stage: string) => {
    if (!mountedRef.current) return;
    setState((prev) => ({
      ...prev,
      activityMessages: [
        ...prev.activityMessages.slice(-(MAX_ACTIVITY_MESSAGES - 1)),
        { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text, stage, timestamp: Date.now() },
      ],
    }));
  }, []);

  const handleSSEEvent = useCallback(
    (eventType: string, rawData: string) => {
      if (!mountedRef.current) return;

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(rawData) as Record<string, unknown>;
      } catch {
        return;
      }

      switch (eventType) {
        case 'stage_start':
          setState((prev) => ({ ...prev, currentStage: data.stage as string }));
          addActivity(data.message as string, data.stage as string);
          break;

        case 'stage_complete':
          addActivity(data.message as string, data.stage as string);
          break;

        case 'transparency':
          addActivity(data.message as string, data.stage as string);
          break;

        case 'letter_draft':
          setState((prev) => ({
            ...prev,
            letterDraft: data.letter as string,
            qualityScore: typeof data.quality_score === 'number' ? data.quality_score : prev.qualityScore,
          }));
          break;

        case 'letter_complete':
          setState((prev) => ({
            ...prev,
            status: 'complete',
            letterDraft: data.letter as string,
            qualityScore: data.quality_score as number,
          }));
          // Pipeline done — close connection
          abortRef.current?.abort();
          break;

        case 'pipeline_error':
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: data.error as string,
          }));
          abortRef.current?.abort();
          break;

        case 'pipeline_complete':
          // Fallback terminal event
          setState((prev) => ({
            ...prev,
            status: prev.letterDraft ? 'complete' : prev.status,
          }));
          abortRef.current?.abort();
          break;

        case 'heartbeat':
          // Keep-alive, no state change
          break;

        default:
          break;
      }
    },
    [addActivity],
  );

  const connectSSE = useCallback(
    (sessionId: string) => {
      if (!accessToken) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState((prev) => ({ ...prev, status: 'connecting' }));

      fetch(`${API_BASE}/cover-letter/${sessionId}/stream`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok || !response.body) {
            if (mountedRef.current) {
              setState((prev) => ({
                ...prev,
                status: 'error',
                error: `Connection failed (${response.status})`,
              }));
            }
            return;
          }

          if (mountedRef.current) {
            setState((prev) => ({ ...prev, status: 'running' }));
            reconnectAttemptsRef.current = 0;
          }

          try {
            for await (const msg of parseSSEStream(response.body)) {
              if (controller.signal.aborted) break;
              handleSSEEvent(msg.event, msg.data);
            }
          } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') return;
            console.error('[useCoverLetter] SSE stream error:', err);
          }

          // Stream ended — attempt reconnect if not intentionally aborted and not complete
          if (!controller.signal.aborted && mountedRef.current) {
            setState((prev) => {
              if (prev.status === 'complete' || prev.status === 'error') return prev;
              // Reconnect with backoff
              if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
                const delay = Math.pow(2, reconnectAttemptsRef.current) * 1000;
                reconnectAttemptsRef.current += 1;
                reconnectTimerRef.current = setTimeout(() => {
                  if (mountedRef.current && sessionIdRef.current) {
                    connectSSE(sessionIdRef.current);
                  }
                }, delay);
                return prev;
              }
              return { ...prev, status: 'error', error: 'Connection lost' };
            });
          }
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          console.error('[useCoverLetter] SSE fetch error:', err);
          if (mountedRef.current) {
            setState((prev) => ({
              ...prev,
              status: 'error',
              error: 'Failed to connect',
            }));
          }
        });
    },
    [accessToken, handleSSEEvent],
  );

  const startPipeline = useCallback(
    async (
      sessionId: string,
      resumeText: string,
      jobDescription: string,
      companyName: string,
    ): Promise<boolean> => {
      if (!accessToken) return false;

      sessionIdRef.current = sessionId;
      reconnectAttemptsRef.current = 0;

      setState({
        status: 'connecting',
        letterDraft: null,
        qualityScore: null,
        activityMessages: [],
        error: null,
        currentStage: null,
      });

      try {
        const res = await fetch(`${API_BASE}/cover-letter/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            session_id: sessionId,
            resume_text: resumeText,
            job_description: jobDescription,
            company_name: companyName,
          }),
        });

        if (!res.ok) {
          const body = await res.text();
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: `Failed to start pipeline (${res.status}): ${body}`,
          }));
          return false;
        }

        // Connect to SSE stream
        connectSSE(sessionId);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: message,
        }));
        return false;
      }
    },
    [accessToken, connectSSE],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    sessionIdRef.current = null;
    reconnectAttemptsRef.current = 0;
    setState({
      status: 'idle',
      letterDraft: null,
      qualityScore: null,
      activityMessages: [],
      error: null,
      currentStage: null,
    });
  }, []);

  return {
    ...state,
    startPipeline,
    reset,
  };
}
