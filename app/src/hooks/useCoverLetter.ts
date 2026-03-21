import { useState, useCallback, useRef, useEffect } from 'react';
import { parseSSEStream } from '@/lib/sse-parser';
import { API_BASE } from '@/lib/api';
import { safeString, safeNumber } from '@/lib/safe-cast';

import type { ActivityMessage } from '@/types/activity';

export type { ActivityMessage };
export type CoverLetterStatus = 'idle' | 'connecting' | 'running' | 'letter_review' | 'complete' | 'error';

export interface LetterReviewData {
  letter_draft: string;
  quality_score?: number;
}

interface CoverLetterState {
  status: CoverLetterStatus;
  letterDraft: string | null;
  qualityScore: number | null;
  activityMessages: ActivityMessage[];
  error: string | null;
  currentStage: string | null;
  letterReviewData: LetterReviewData | null;
  pendingGate: string | null;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const MAX_ACTIVITY_MESSAGES = 20;

function normalizeLetterReviewData(value: Record<string, unknown>): LetterReviewData {
  return {
    letter_draft: safeString(value.letter_draft),
    quality_score: value.quality_score == null ? undefined : safeNumber(value.quality_score),
  };
}

export function useCoverLetter(accessToken: string | null) {
  const [state, setState] = useState<CoverLetterState>({
    status: 'idle',
    letterDraft: null,
    qualityScore: null,
    activityMessages: [],
    error: null,
    currentStage: null,
    letterReviewData: null,
    pendingGate: null,
  });

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const statusRef = useRef(state.status);
  statusRef.current = state.status;
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
        { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, message: text, stage, timestamp: Date.now() },
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
          setState((prev) => ({ ...prev, currentStage: safeString(data.stage) }));
          addActivity(safeString(data.message), safeString(data.stage));
          break;

        case 'stage_complete':
          addActivity(safeString(data.message), safeString(data.stage));
          break;

        case 'transparency':
          addActivity(safeString(data.message), safeString(data.stage));
          break;

        case 'letter_draft':
          setState((prev) => ({
            ...prev,
            letterDraft: safeString(data.letter),
            qualityScore: typeof data.quality_score === 'number' ? data.quality_score : prev.qualityScore,
          }));
          break;

        case 'letter_review_ready': {
          setState((prev) => ({
            ...prev,
            letterReviewData: normalizeLetterReviewData(data),
          }));
          break;
        }

        case 'pipeline_gate': {
          const gateName = data.gate === 'letter_review' ? 'letter_review' : undefined;
          if (gateName === 'letter_review') {
            setState((prev) => ({ ...prev, status: 'letter_review', pendingGate: gateName }));
          }
          break;
        }

        case 'letter_complete':
          setState((prev) => ({
            ...prev,
            status: 'complete',
            letterDraft: safeString(data.letter) || prev.letterDraft,
            qualityScore: data.quality_score == null ? prev.qualityScore : safeNumber(data.quality_score, prev.qualityScore ?? 0),
          }));
          // Pipeline done — close connection
          abortRef.current?.abort();
          break;

        case 'pipeline_error':
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: safeString(data.error, 'Pipeline error'),
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
      tone: 'formal' | 'conversational' | 'bold' = 'formal',
    ): Promise<boolean> => {
      if (statusRef.current !== 'idle') return false;
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
        letterReviewData: null,
        pendingGate: null,
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
            tone,
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

  const respondToGate = useCallback(
    async (gate: string, response: unknown): Promise<boolean> => {
      const sessionId = sessionIdRef.current;
      if (!sessionId || !accessToken) return false;

      try {
        const res = await fetch(`${API_BASE}/cover-letter/respond`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ session_id: sessionId, gate, response }),
        });
        if (!res.ok) {
          console.error('[useCoverLetter] Gate respond failed:', res.status);
          return false;
        }
        // Transition back to running and reconnect the SSE stream to receive
        // events from the resumed pipeline.
        setState((prev) => ({ ...prev, status: 'running', pendingGate: null }));
        if (sessionId) connectSSE(sessionId);
        return true;
      } catch (err) {
        console.error('[useCoverLetter] Gate respond error:', err);
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
      letterReviewData: null,
      pendingGate: null,
    });
  }, []);

  return {
    ...state,
    startPipeline,
    respondToGate,
    reset,
  };
}
