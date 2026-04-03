import { useState, useCallback, useRef, useEffect } from 'react';
import { parseSSEStream } from '@/lib/sse-parser';
import { API_BASE } from '@/lib/api';
import { createProductSession } from '@/lib/create-product-session';
import { safeString, safeNumber } from '@/lib/safe-cast';
import type { ActivityMessage } from '@/types/activity';

export type { ActivityMessage };

// ─── Types matching server/src/agents/salary-negotiation/simulation/types.ts ─

export type NegotiationRoundType =
  | 'initial_offer_delivery'
  | 'pushback_base_cap'
  | 'equity_leverage'
  | 'final_counter'
  | 'closing_pressure';

export type NegotiationOutcome = 'excellent' | 'good' | 'needs_work' | 'missed';

export interface NegotiationRound {
  index: number;
  type: NegotiationRoundType;
  employer_position: string;
  context?: string;
}

export interface RoundEvaluation {
  round_index: number;
  round_type: NegotiationRoundType;
  employer_position: string;
  candidate_response: string;
  scores: {
    acknowledgment: number;
    data_support: number;
    specificity: number;
    tone: number;
  };
  overall_score: number;
  outcome: NegotiationOutcome;
  strengths: string[];
  improvements: string[];
  coaching_note?: string;
}

export interface SimulationSummary {
  overall_score: number;
  total_rounds: number;
  outcome_summary: string;
  strengths: string[];
  areas_for_improvement: string[];
  coaching_takeaway: string;
}

export type NegotiationSimulationStatus =
  | 'idle'
  | 'connecting'
  | 'running'
  | 'awaiting_response'
  | 'complete'
  | 'error';

export type NegotiationSimulationMode = 'full' | 'practice';

interface NegotiationSimulationHookState {
  status: NegotiationSimulationStatus;
  currentRound: NegotiationRound | null;
  pendingEvaluation: RoundEvaluation | null;
  evaluations: RoundEvaluation[];
  activityMessages: ActivityMessage[];
  summary: SimulationSummary | null;
  error: string | null;
}

export interface NegotiationSimulationInput {
  offerCompany: string;
  offerRole: string;
  offerBaseSalary?: number;
  offerTotalComp?: number;
  offerEquityDetails?: string;
  mode: NegotiationSimulationMode;
  marketResearch?: Record<string, unknown>;
  leveragePoints?: Record<string, unknown>[];
  candidateTargets?: {
    targetBase?: number;
    walkAwayBase?: number;
  };
}

const MAX_RECONNECT_ATTEMPTS = 3;
const MAX_ACTIVITY_MESSAGES = 80;

function parseRound(data: Record<string, unknown>): NegotiationRound | null {
  const round = data.round as Record<string, unknown> | null;
  if (!round) return null;
  return {
    index: safeNumber(round.index),
    type: safeString(round.type) as NegotiationRoundType,
    employer_position: safeString(round.employer_position),
    context: round.context ? safeString(round.context) : undefined,
  };
}

function parseEvaluation(data: Record<string, unknown>): RoundEvaluation | null {
  const ev = data.evaluation as Record<string, unknown> | null;
  if (!ev) return null;
  const scores = (ev.scores as Record<string, unknown>) ?? {};
  return {
    round_index: safeNumber(ev.round_index),
    round_type: safeString(ev.round_type) as NegotiationRoundType,
    employer_position: safeString(ev.employer_position),
    candidate_response: safeString(ev.candidate_response),
    scores: {
      acknowledgment: safeNumber(scores.acknowledgment),
      data_support: safeNumber(scores.data_support),
      specificity: safeNumber(scores.specificity),
      tone: safeNumber(scores.tone),
    },
    overall_score: safeNumber(ev.overall_score),
    outcome: safeString(ev.outcome) as NegotiationOutcome,
    strengths: Array.isArray(ev.strengths) ? ev.strengths.map(String) : [],
    improvements: Array.isArray(ev.improvements) ? ev.improvements.map(String) : [],
    coaching_note: ev.coaching_note ? safeString(ev.coaching_note) : undefined,
  };
}

function parseSummary(data: Record<string, unknown>): SimulationSummary | null {
  const s = data.summary as Record<string, unknown> | null;
  if (!s) return null;
  return {
    overall_score: safeNumber(s.overall_score),
    total_rounds: safeNumber(s.total_rounds),
    outcome_summary: safeString(s.outcome_summary),
    strengths: Array.isArray(s.strengths) ? s.strengths.map(String) : [],
    areas_for_improvement: Array.isArray(s.areas_for_improvement) ? s.areas_for_improvement.map(String) : [],
    coaching_takeaway: safeString(s.coaching_takeaway),
  };
}

export function useNegotiationSimulation() {
  const [state, setState] = useState<NegotiationSimulationHookState>({
    status: 'idle',
    currentRound: null,
    pendingEvaluation: null,
    evaluations: [],
    activityMessages: [],
    summary: null,
    error: null,
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

        case 'employer_position': {
          const round = parseRound(data);
          if (round) {
            setState((prev) => ({
              ...prev,
              status: 'awaiting_response',
              currentRound: round,
              pendingEvaluation: null,
            }));
            addActivity(
              `Round ${round.index + 1} — employer position presented`,
              'employer',
            );
          }
          break;
        }

        case 'round_evaluated': {
          const evaluation = parseEvaluation(data);
          if (evaluation) {
            setState((prev) => ({
              ...prev,
              status: 'running',
              pendingEvaluation: evaluation,
              evaluations: [...prev.evaluations, evaluation],
            }));
            addActivity(
              `Round ${evaluation.round_index + 1} evaluated — score: ${evaluation.overall_score}/100 (${evaluation.outcome})`,
              'evaluation',
            );
          }
          break;
        }

        case 'simulation_complete': {
          const summary = parseSummary(data);
          setState((prev) => ({
            ...prev,
            status: 'complete',
            summary,
            currentRound: null,
          }));
          abortRef.current?.abort();
          break;
        }

        case 'pipeline_error':
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: safeString(data.error, 'Simulation error'),
          }));
          abortRef.current?.abort();
          break;

        case 'pipeline_complete':
          setState((prev) => ({
            ...prev,
            status: prev.summary ? 'complete' : prev.status,
          }));
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

      setState((prev) => ({ ...prev, status: 'connecting' }));

      fetch(`${API_BASE}/negotiation-simulation/${sessionId}/stream`, {
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
            console.error('[useNegotiationSimulation] SSE stream error:', err);
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
          console.error('[useNegotiationSimulation] SSE fetch error:', err);
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
    async (input: NegotiationSimulationInput): Promise<boolean> => {
      if (statusRef.current !== 'idle') return false;

      setState({
        status: 'connecting',
        currentRound: null,
        pendingEvaluation: null,
        evaluations: [],
        activityMessages: [],
        summary: null,
        error: null,
      });

      try {
        const { accessToken, session } = await createProductSession({
          productType: 'negotiation_simulation',
        });
        accessTokenRef.current = accessToken;
        sessionIdRef.current = session.id;
        reconnectAttemptsRef.current = 0;

        const res = await fetch(`${API_BASE}/negotiation-simulation/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            session_id: session.id,
            offer_company: input.offerCompany,
            offer_role: input.offerRole,
            offer_base_salary: input.offerBaseSalary,
            offer_total_comp: input.offerTotalComp,
            offer_equity_details: input.offerEquityDetails,
            mode: input.mode,
            market_research: input.marketResearch,
            leverage_points: input.leveragePoints,
            candidate_targets: input.candidateTargets
              ? {
                  target_base: input.candidateTargets.targetBase,
                  walk_away_base: input.candidateTargets.walkAwayBase,
                }
              : undefined,
          }),
        });

        if (!res.ok) {
          const body = await res.text();
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: `Failed to start (${res.status}): ${body}`,
          }));
          return false;
        }

        connectSSE(session.id);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setState((prev) => ({ ...prev, status: 'error', error: message }));
        return false;
      }
    },
    [connectSSE],
  );

  const submitResponse = useCallback(
    async (response: string): Promise<boolean> => {
      const sessionId = sessionIdRef.current;
      const token = accessTokenRef.current;
      if (!sessionId || !token) return false;

      try {
        const res = await fetch(`${API_BASE}/negotiation-simulation/respond`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            session_id: sessionId,
            gate: 'negotiation_response',
            response,
          }),
        });
        if (!res.ok) {
          console.error('[useNegotiationSimulation] Submit response failed:', res.status);
          return false;
        }
        setState((prev) => ({
          ...prev,
          status: 'running',
          pendingEvaluation: null,
        }));
        return true;
      } catch (err) {
        console.error('[useNegotiationSimulation] Submit response error:', err);
        return false;
      }
    },
    [],
  );

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
      currentRound: null,
      pendingEvaluation: null,
      evaluations: [],
      activityMessages: [],
      summary: null,
      error: null,
    });
  }, []);

  return {
    ...state,
    startSimulation,
    submitResponse,
    reset,
  };
}
