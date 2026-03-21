import { useState, useCallback, useRef, useEffect } from 'react';
import { parseSSEStream } from '@/lib/sse-parser';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { safeNumber, safeString, safeStringArray } from '@/lib/safe-cast';

export type MockInterviewStatus =
  | 'idle'
  | 'connecting'
  | 'running'
  | 'waiting_for_answer'
  | 'evaluating'
  | 'complete'
  | 'error';

import type { ActivityMessage } from '@/types/activity';

export type { ActivityMessage };

export interface InterviewQuestion {
  index: number;
  type: 'behavioral' | 'technical' | 'situational';
  question: string;
  context?: string;
}

export interface AnswerEvaluation {
  question_index: number;
  question_type: string;
  question: string;
  answer: string;
  scores: {
    star_completeness: number;
    relevance: number;
    impact: number;
    specificity: number;
  };
  overall_score: number;
  strengths: string[];
  improvements: string[];
  model_answer_hint?: string;
}

export interface SimulationSummary {
  overall_score: number;
  total_questions: number;
  strengths: string[];
  areas_for_improvement: string[];
  recommendation: string;
}

export interface StartSimulationInput {
  resumeText: string;
  jobDescription?: string;
  companyName?: string;
  mode: 'full' | 'practice';
  questionType?: 'behavioral' | 'technical' | 'situational';
}

interface MockInterviewState {
  status: MockInterviewStatus;
  currentQuestion: InterviewQuestion | null;
  evaluations: AnswerEvaluation[];
  summary: SimulationSummary | null;
  error: string | null;
  activityMessages: ActivityMessage[];
}

const MAX_RECONNECT_ATTEMPTS = 3;
const MAX_ACTIVITY_MESSAGES = 50;

function sanitizeTextList(value: unknown): string[] {
  return safeStringArray(value).map((item) => item.trim()).filter(Boolean);
}

function sanitizeQuestionType(value: unknown): InterviewQuestion['type'] {
  return value === 'technical' || value === 'situational' ? value : 'behavioral';
}

function sanitizeQuestion(value: unknown): InterviewQuestion | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const question = safeString(candidate.question);
  if (!question) return null;

  return {
    index: safeNumber(candidate.index),
    type: sanitizeQuestionType(candidate.type),
    question,
    context: safeString(candidate.context) || undefined,
  };
}

function sanitizeEvaluation(value: unknown): AnswerEvaluation | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const question = safeString(candidate.question);
  const answer = safeString(candidate.answer);
  if (!question || !answer) return null;

  const scores = (candidate.scores && typeof candidate.scores === 'object'
    ? candidate.scores
    : {}) as Record<string, unknown>;

  return {
    question_index: safeNumber(candidate.question_index),
    question_type: safeString(candidate.question_type),
    question,
    answer,
    scores: {
      star_completeness: safeNumber(scores.star_completeness),
      relevance: safeNumber(scores.relevance),
      impact: safeNumber(scores.impact),
      specificity: safeNumber(scores.specificity),
    },
    overall_score: safeNumber(candidate.overall_score),
    strengths: sanitizeTextList(candidate.strengths),
    improvements: sanitizeTextList(candidate.improvements),
    model_answer_hint: safeString(candidate.model_answer_hint) || undefined,
  };
}

function sanitizeSummary(value: unknown): SimulationSummary | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const recommendation = safeString(candidate.recommendation);
  if (!recommendation) return null;

  return {
    overall_score: safeNumber(candidate.overall_score),
    total_questions: safeNumber(candidate.total_questions),
    strengths: sanitizeTextList(candidate.strengths),
    areas_for_improvement: sanitizeTextList(candidate.areas_for_improvement),
    recommendation,
  };
}

export function useMockInterview() {
  const [state, setState] = useState<MockInterviewState>({
    status: 'idle',
    currentQuestion: null,
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

        case 'question_presented': {
          const question = sanitizeQuestion(data.question);
          if (!question) break;
          setState((prev) => ({
            ...prev,
            status: 'waiting_for_answer',
            currentQuestion: question,
          }));
          break;
        }

        case 'answer_evaluated': {
          const evaluation = sanitizeEvaluation(data.evaluation);
          if (!evaluation) break;
          setState((prev) => ({
            ...prev,
            status: 'running',
            evaluations: [...prev.evaluations, evaluation],
          }));
          break;
        }

        case 'simulation_complete': {
          const summary = sanitizeSummary(data.summary);
          if (!summary) break;
          setState((prev) => ({
            ...prev,
            status: 'complete',
            summary,
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

      fetch(`${API_BASE}/mock-interview/${sessionId}/stream`, {
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
            console.error('[useMockInterview] SSE stream error:', err);
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
          console.error('[useMockInterview] SSE fetch error:', err);
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
    async (input: StartSimulationInput): Promise<void> => {
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
        currentQuestion: null,
        evaluations: [],
        summary: null,
        error: null,
        activityMessages: [],
      });

      try {
        const res = await fetch(`${API_BASE}/mock-interview/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            session_id: sessionId,
            resume_text: input.resumeText,
            job_description: input.jobDescription,
            company_name: input.companyName,
            mode: input.mode,
            question_type: input.questionType,
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

  const submitAnswer = useCallback(async (answer: string): Promise<void> => {
    const sessionId = sessionIdRef.current;
    const token = accessTokenRef.current;
    if (!sessionId || !token) return;

    setState((prev) => ({ ...prev, status: 'evaluating' }));

    try {
      const res = await fetch(`${API_BASE}/mock-interview/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          session_id: sessionId,
          gate: 'mock_interview_answer',
          response: answer,
        }),
      });

      if (!res.ok) {
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: `Failed to submit answer (${res.status})`,
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
      currentQuestion: null,
      evaluations: [],
      summary: null,
      error: null,
      activityMessages: [],
    });
  }, []);

  return {
    ...state,
    startSimulation,
    submitAnswer,
    reset,
  };
}
