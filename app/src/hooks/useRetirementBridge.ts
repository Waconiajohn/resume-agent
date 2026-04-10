import { useState, useCallback, useRef, useEffect } from 'react';
import { parseSSEStream } from '@/lib/sse-parser';
import { API_BASE } from '@/lib/api';
import { createProductSession } from '@/lib/create-product-session';
import { supabase } from '@/lib/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ReadinessSignal = 'green' | 'yellow' | 'red';

export type ReadinessDimension =
  | 'income_replacement'
  | 'healthcare_bridge'
  | 'debt_profile'
  | 'retirement_savings_impact'
  | 'insurance_gaps'
  | 'tax_implications'
  | 'lifestyle_adjustment';

export interface DimensionAssessment {
  dimension: ReadinessDimension;
  signal: ReadinessSignal;
  observations: string[];
  questions_to_ask_planner: string[];
}

export interface RetirementReadinessSummary {
  dimensions: DimensionAssessment[];
  overall_readiness: ReadinessSignal;
  key_observations: string[];
  recommended_planner_topics: string[];
  shareable_summary: string;
}

export interface RetirementQuestion {
  id: string;
  question: string;
  dimension: ReadinessDimension;
}

export type AssessmentPhase =
  | 'idle'
  | 'generating_questions'
  | 'awaiting_responses'
  | 'evaluating'
  | 'complete'
  | 'error';

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function getAuthHeader(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

const MAX_RECONNECT_ATTEMPTS = 3;

export function useRetirementBridge() {
  const [phase, setPhase] = useState<AssessmentPhase>('idle');
  const [questions, setQuestions] = useState<RetirementQuestion[]>([]);
  const [summary, setSummary] = useState<RetirementReadinessSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<AssessmentPhase>('idle');

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

  const connectSSE = useCallback((sessionId: string) => {
    const token = tokenRef.current;
    if (!token) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    fetch(`${API_BASE}/retirement-bridge/${sessionId}/stream`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok || !response.body) {
          if (mountedRef.current) {
            setError(`Connection failed (${response.status})`);
            setPhase('error');
          }
          return;
        }

        // Successful connection — reset reconnect counter
        if (mountedRef.current) {
          reconnectAttemptsRef.current = 0;
        }

        try {
          for await (const msg of parseSSEStream(response.body)) {
            if (controller.signal.aborted) break;

            let data: Record<string, unknown>;
            try {
              data = JSON.parse(msg.data) as Record<string, unknown>;
            } catch {
              continue;
            }

            if (!mountedRef.current) break;

            if (msg.event === 'questions_ready') {
              const qs = data.questions as RetirementQuestion[] | undefined;
              setQuestions(qs ?? []);
              phaseRef.current = 'awaiting_responses';
              setPhase('awaiting_responses');
            } else if (msg.event === 'assessment_complete') {
              const s = data.summary as RetirementReadinessSummary | undefined;
              if (s) setSummary(s);
              phaseRef.current = 'complete';
              setPhase('complete');
              controller.abort();
            } else if (msg.event === 'pipeline_error') {
              setError(typeof data.error === 'string' ? data.error : 'Assessment failed');
              phaseRef.current = 'error';
              setPhase('error');
              controller.abort();
            } else if (msg.event === 'pipeline_complete') {
              // Terminal event — stream is done
              controller.abort();
            }
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          console.error('[useRetirementBridge] SSE stream error:', err);
        }

        // Stream ended without a terminal event — attempt reconnect
        // Don't reconnect if waiting for user input or already finished
        if (!controller.signal.aborted && mountedRef.current
            && phaseRef.current !== 'awaiting_responses'
            && phaseRef.current !== 'complete'
            && phaseRef.current !== 'error') {
          if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
            const delay = Math.pow(2, reconnectAttemptsRef.current) * 1000;
            reconnectAttemptsRef.current += 1;
            reconnectTimerRef.current = setTimeout(() => {
              if (mountedRef.current && sessionIdRef.current) {
                connectSSE(sessionIdRef.current);
              }
            }, delay);
          } else {
            setError('Connection lost');
            setPhase('error');
          }
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error('[useRetirementBridge] SSE fetch error:', err);
        if (mountedRef.current) {
          if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
            const delay = Math.pow(2, reconnectAttemptsRef.current) * 1000;
            reconnectAttemptsRef.current += 1;
            reconnectTimerRef.current = setTimeout(() => {
              if (mountedRef.current && sessionIdRef.current) {
                connectSSE(sessionIdRef.current);
              }
            }, delay);
          } else {
            setError('Failed to connect to assessment stream');
            setPhase('error');
          }
        }
      });
  }, []);

  const startAssessment = useCallback(async (): Promise<void> => {
    const token = await getAuthHeader();
    if (!token) {
      setError('Not authenticated');
      setPhase('error');
      return;
    }

    phaseRef.current = 'generating_questions';
    setPhase('generating_questions');
    setError(null);
    setQuestions([]);
    setSummary(null);

    try {
      const { accessToken, session } = await createProductSession({
        productType: 'retirement_bridge',
      });
      tokenRef.current = accessToken;
      sessionIdRef.current = session.id;

      const res = await fetch(`${API_BASE}/retirement-bridge/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ session_id: session.id }),
      });

      if (!res.ok) {
        const body = await res.text();
        if (mountedRef.current) {
          setError(`Failed to start assessment (${res.status}): ${body}`);
          setPhase('error');
        }
        return;
      }

      connectSSE(session.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (mountedRef.current) {
        setError(message);
        setPhase('error');
      }
    }
  }, [connectSSE]);

  const submitResponses = useCallback(async (
    responses: Record<string, string>,
  ): Promise<void> => {
    const sessionId = sessionIdRef.current;
    const token = tokenRef.current;
    if (!sessionId || !token) return;

    setPhase('evaluating');

    try {
      const res = await fetch(`${API_BASE}/retirement-bridge/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          session_id: sessionId,
          gate: 'retirement_assessment',
          response: responses,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        if (mountedRef.current) {
          setError(`Failed to submit responses (${res.status}): ${body}`);
          setPhase('error');
        }
      }
      // SSE stream handles state transitions from here
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (mountedRef.current) {
        setError(message);
        setPhase('error');
      }
    }
  }, []);

  const reset = useCallback((): void => {
    abortRef.current?.abort();
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    sessionIdRef.current = null;
    tokenRef.current = null;
    reconnectAttemptsRef.current = 0;
    phaseRef.current = 'idle';
    setPhase('idle');
    setQuestions([]);
    setSummary(null);
    setError(null);
  }, []);

  return {
    phase,
    questions,
    summary,
    error,
    startAssessment,
    submitResponses,
    reset,
  };
}
