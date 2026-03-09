import { useState, useCallback, useRef, useEffect } from 'react';
import { parseSSEStream } from '@/lib/sse-parser';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { safeString } from '@/lib/safe-cast';

export type CounterOfferStatus =
  | 'idle'
  | 'connecting'
  | 'running'
  | 'waiting_for_response'
  | 'evaluating'
  | 'complete'
  | 'error';

import type { ActivityMessage } from '@/types/activity';

export type { ActivityMessage };

export interface EmployerPushback {
  round: number;
  round_type: string;
  employer_statement: string;
  employer_tactic: string;
  coaching_hint: string;
}

export interface UserResponseEvaluation {
  round: number;
  user_response: string;
  scores: {
    confidence: number;
    value_anchoring: number;
    specificity: number;
    collaboration: number;
  };
  overall_score: number;
  what_worked: string[];
  what_to_improve: string[];
  coach_note: string;
}

export interface SimulationSummary {
  overall_score: number;
  total_rounds: number;
  best_round: number;
  strengths: string[];
  areas_for_improvement: string[];
  recommendation: string;
}

export interface StartCounterOfferInput {
  resumeText: string;
  offerCompany: string;
  offerRole: string;
  offerBaseSalary?: number;
  offerTotalComp?: number;
  targetSalary?: number;
  mode: 'full' | 'single_round';
  roundType?: string;
}

interface CounterOfferSimState {
  status: CounterOfferStatus;
  currentPushback: EmployerPushback | null;
  evaluations: UserResponseEvaluation[];
  summary: SimulationSummary | null;
  error: string | null;
  activityMessages: ActivityMessage[];
}

const MAX_RECONNECT_ATTEMPTS = 3;
const MAX_ACTIVITY_MESSAGES = 50;

export function useCounterOfferSim() {
  const [state, setState] = useState<CounterOfferSimState>({
    status: 'idle',
    currentPushback: null,
    evaluations: [],
    summary: null,
    error: null,
    activityMessages: [],
  });

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const statusRef = useRef(state.status);
  statusRef.current = state.status;
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);

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
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          message: text,
          stage,
          timestamp: Date.now(),
        },
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
          addActivity(safeString(data.message), safeString(data.stage));
          break;

        case 'stage_complete':
          addActivity(safeString(data.message), safeString(data.stage));
          break;

        case 'transparency':
          addActivity(safeString(data.message), safeString(data.stage));
          break;

        case 'pushback_presented': {
          const pushback = (data as { pushback: EmployerPushback }).pushback;
          setState((prev) => ({
            ...prev,
            status: 'waiting_for_response',
            currentPushback: {
              round: pushback.round,
              round_type: pushback.round_type,
              employer_statement: pushback.employer_statement,
              employer_tactic: pushback.employer_tactic,
              coaching_hint: pushback.coaching_hint,
            },
          }));
          break;
        }

        case 'response_evaluated': {
          const evaluation = (data as { evaluation: UserResponseEvaluation }).evaluation;
          setState((prev) => ({
            ...prev,
            status: 'running',
            evaluations: [
              ...prev.evaluations,
              {
                round: evaluation.round,
                user_response: evaluation.user_response,
                scores: evaluation.scores,
                overall_score: evaluation.overall_score,
                what_worked: evaluation.what_worked,
                what_to_improve: evaluation.what_to_improve,
                coach_note: evaluation.coach_note,
              },
            ],
          }));
          break;
        }

        case 'simulation_complete': {
          const summary = data as unknown as SimulationSummary;
          setState((prev) => ({
            ...prev,
            status: 'complete',
            summary: {
              overall_score: summary.overall_score,
              total_rounds: summary.total_rounds,
              best_round: summary.best_round,
              strengths: summary.strengths,
              areas_for_improvement: summary.areas_for_improvement,
              recommendation: summary.recommendation,
            },
          }));
          abortRef.current?.abort();
          break;
        }

        case 'pipeline_error':
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: safeString(data.error, 'Pipeline error'),
          }));
          abortRef.current?.abort();
          break;

        case 'pipeline_complete':
          setState((prev) => {
            if (prev.status === 'complete' || prev.status === 'error') return prev;
            return { ...prev, status: 'complete' };
          });
          abortRef.current?.abort();
          break;

        case 'heartbeat':
          break;

        default:
          break;
      }
    },
    [addActivity],
  );

  const connectSSE = useCallback(
    (sessionId: string) => {
      const token = accessTokenRef.current;
      if (!token) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      fetch(`${API_BASE}/counter-offer-sim/${sessionId}/stream`, {
        headers: { Authorization: `Bearer ${token}` },
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
            console.error('[useCounterOfferSim] SSE stream error:', err);
          }

          if (!controller.signal.aborted && mountedRef.current) {
            setState((prev) => {
              if (prev.status === 'complete' || prev.status === 'error') return prev;
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
          console.error('[useCounterOfferSim] SSE fetch error:', err);
          if (mountedRef.current) {
            setState((prev) => ({
              ...prev,
              status: 'error',
              error: 'Failed to connect',
            }));
          }
        });
    },
    [handleSSEEvent],
  );

  const startSimulation = useCallback(
    async (input: StartCounterOfferInput): Promise<void> => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token ?? null;
      if (!token) {
        setState((prev) => ({ ...prev, status: 'error', error: 'Not authenticated' }));
        return;
      }
      accessTokenRef.current = token;

      const sessionId = crypto.randomUUID();
      sessionIdRef.current = sessionId;
      reconnectAttemptsRef.current = 0;

      setState({
        status: 'connecting',
        currentPushback: null,
        evaluations: [],
        summary: null,
        error: null,
        activityMessages: [],
      });

      try {
        const res = await fetch(`${API_BASE}/counter-offer-sim/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            session_id: sessionId,
            resume_text: input.resumeText,
            offer_company: input.offerCompany,
            offer_role: input.offerRole,
            offer_base_salary: input.offerBaseSalary,
            offer_total_comp: input.offerTotalComp,
            target_salary: input.targetSalary,
            mode: input.mode,
            round_type: input.roundType,
          }),
        });

        if (!res.ok) {
          const body = await res.text();
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: `Failed to start (${res.status}): ${body}`,
          }));
          return;
        }

        connectSSE(sessionId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setState((prev) => ({ ...prev, status: 'error', error: message }));
      }
    },
    [connectSSE],
  );

  const submitResponse = useCallback(async (response: string): Promise<void> => {
    const sessionId = sessionIdRef.current;
    const token = accessTokenRef.current;
    if (!sessionId || !token) return;

    setState((prev) => ({ ...prev, status: 'evaluating' }));

    try {
      const res = await fetch(`${API_BASE}/counter-offer-sim/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          session_id: sessionId,
          gate: 'counter_offer_response',
          response,
        }),
      });

      if (!res.ok) {
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: `Failed to submit response (${res.status})`,
        }));
      }
      // SSE stream continues automatically — do not reconnect
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState((prev) => ({ ...prev, status: 'error', error: message }));
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    sessionIdRef.current = null;
    accessTokenRef.current = null;
    reconnectAttemptsRef.current = 0;
    setState({
      status: 'idle',
      currentPushback: null,
      evaluations: [],
      summary: null,
      error: null,
      activityMessages: [],
    });
  }, []);

  return {
    ...state,
    startSimulation,
    submitResponse,
    reset,
  };
}
