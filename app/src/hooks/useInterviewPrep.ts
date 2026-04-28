import { useState, useCallback, useRef, useEffect } from 'react';
import { parseSSEStream } from '@/lib/sse-parser';
import { API_BASE } from '@/lib/api';
import { createProductSession } from '@/lib/create-product-session';
import { safeNumber, safeString } from '@/lib/safe-cast';

import type { ActivityMessage } from '@/types/activity';

export type { ActivityMessage };
export type InterviewPrepStatus = 'idle' | 'connecting' | 'running' | 'star_stories_review' | 'complete' | 'error';

export interface StarStoriesReviewData {
  report: string;
  quality_score: number;
}

interface InterviewPrepState {
  status: InterviewPrepStatus;
  report: string | null;
  qualityScore: number | null;
  activityMessages: ActivityMessage[];
  error: string | null;
  currentStage: string | null;
  starStoriesReviewData: StarStoriesReviewData | null;
  pendingGate: string | null;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const MAX_ACTIVITY_MESSAGES = 30;
const STREAM_IDLE_TIMEOUT_MS = 90_000;
const STAR_STORIES_GATE = 'star_stories_review' as const;

const RAW_AGENT_ROUND_RE = /^(?:writer|researcher|analyst|runner)\s*:?\s*round\s+\d+\/\d+/i;

const SECTION_LABELS: Record<string, string> = {
  company_research: 'company intelligence',
  elevator_pitch: 'elevator pitch',
  requirements_fit: 'top role requirements and proof points',
  technical_questions: 'role-specific interview answers',
  behavioral_questions: 'behavioral story bank',
  three_two_one: '3-2-1 interview strategy',
  why_me: 'Why Me career story',
  thirty_sixty_ninety: '30-60-90 plan',
  final_tips: 'final interview strategy',
};

function sanitizeActivityMessage(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || RAW_AGENT_ROUND_RE.test(trimmed)) return null;

  const normalized = trimmed
    .replace(/^(Writer|Researcher)(?=[A-Z])/i, '$1: ')
    .replace(/^(?:writer|researcher)\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized || RAW_AGENT_ROUND_RE.test(normalized)) return null;
  return normalized;
}

function sectionProgressMessage(section: string, status: string): string | null {
  const label = SECTION_LABELS[section] ?? section.replace(/_/g, ' ');
  if (status === 'writing') {
    if (section === 'requirements_fit') return 'Mapping your proof to the top requirements in the role.';
    if (section === 'why_me') return 'Finding the memorable Why Me story that should stick in the interview.';
    return `Building ${label}.`;
  }
  if (status === 'reviewing') return `Checking ${label} for specificity and overclaims.`;
  if (status === 'complete') return `${label.charAt(0).toUpperCase()}${label.slice(1)} is ready.`;
  return null;
}

function asInterviewPrepGate(value: unknown): typeof STAR_STORIES_GATE | null {
  return value === STAR_STORIES_GATE ? STAR_STORIES_GATE : null;
}

export function useInterviewPrep() {
  const [state, setState] = useState<InterviewPrepState>({
    status: 'idle',
    report: null,
    qualityScore: null,
    activityMessages: [],
    error: null,
    currentStage: null,
    starStoriesReviewData: null,
    pendingGate: null,
  });

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const statusRef = useRef(state.status);
  statusRef.current = state.status;
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const markStreamStalled = useCallback(() => {
    if (!mountedRef.current) return;
    abortRef.current?.abort();
    setState((prev) => {
      if (prev.status !== 'connecting' && prev.status !== 'running') return prev;
      return {
        ...prev,
        status: 'error',
        error: 'Interview prep stalled while waiting for the writer. No work was lost — please try again.',
      };
    });
  }, []);

  const armIdleTimer = useCallback(() => {
    clearIdleTimer();
    idleTimerRef.current = setTimeout(markStreamStalled, STREAM_IDLE_TIMEOUT_MS);
  }, [clearIdleTimer, markStreamStalled]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearIdleTimer();
      abortRef.current?.abort();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [clearIdleTimer]);

  const addActivity = useCallback((text: string, stage: string) => {
    if (!mountedRef.current) return;
    const message = sanitizeActivityMessage(text);
    if (!message) return;
    setState((prev) => ({
      ...prev,
      activityMessages: [
        ...prev.activityMessages.slice(-(MAX_ACTIVITY_MESSAGES - 1)),
        { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, message, stage, timestamp: Date.now() },
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

        case 'section_progress': {
          const section = safeString(data.section);
          const progressStatus = safeString(data.status);
          if (!section) break;
          const message = sectionProgressMessage(section, progressStatus);
          if (message) {
            addActivity(message, 'writing');
          }
          break;
        }

        case 'star_stories_review_ready': {
          const report = safeString(data.report);
          setState((prev) => ({
            ...prev,
            starStoriesReviewData: {
              report,
              quality_score: safeNumber(data.quality_score),
            },
          }));
          break;
        }

        case 'pipeline_gate': {
          const gateName = asInterviewPrepGate(data.gate);
          if (gateName) {
            clearIdleTimer();
            setState((prev) => ({ ...prev, status: 'star_stories_review', pendingGate: gateName }));
          }
          break;
        }

        case 'report_complete':
          clearIdleTimer();
          setState((prev) => {
            const report = safeString(data.report);
            return {
              ...prev,
              status: 'complete',
              report: report || prev.report,
              qualityScore:
                data.quality_score == null ? prev.qualityScore : safeNumber(data.quality_score, prev.qualityScore ?? 0),
            };
          });
          abortRef.current?.abort();
          break;

        case 'pipeline_error':
          clearIdleTimer();
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: safeString(data.error, 'Pipeline error'),
          }));
          abortRef.current?.abort();
          break;

        case 'pipeline_complete':
          clearIdleTimer();
          setState((prev) => ({
            ...prev,
            status: prev.report ? 'complete' : prev.status,
          }));
          abortRef.current?.abort();
          break;

        case 'heartbeat':
          break;

        default:
          break;
      }
    },
    [addActivity, clearIdleTimer],
  );

  const connectSSE = useCallback(
    (sessionId: string) => {
      const token = accessTokenRef.current;
      if (!token) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState((prev) => ({ ...prev, status: 'connecting' }));

      fetch(`${API_BASE}/interview-prep/${sessionId}/stream`, {
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
            armIdleTimer();
          }

          try {
            for await (const msg of parseSSEStream(response.body)) {
              if (controller.signal.aborted) break;
              armIdleTimer();
              handleSSEEvent(msg.event, msg.data);
            }
          } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') return;
            console.error('[useInterviewPrep] SSE stream error:', err);
          }

          if (!controller.signal.aborted && mountedRef.current) {
            clearIdleTimer();
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
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          console.error('[useInterviewPrep] SSE fetch error:', err);
          if (mountedRef.current) {
            setState((prev) => ({
              ...prev,
              status: 'error',
              error: 'Failed to connect',
            }));
          }
        });
    },
    [armIdleTimer, clearIdleTimer, handleSSEEvent],
  );

  const startPipeline = useCallback(
    async (input: {
      resumeText: string;
      jobDescription: string;
      companyName: string;
      roleTitle?: string;
      jobApplicationId?: string;
    }): Promise<boolean> => {
      if (statusRef.current !== 'idle') return false;

      setState({
        status: 'connecting',
        report: null,
        qualityScore: null,
        activityMessages: [],
        error: null,
        currentStage: null,
        starStoriesReviewData: null,
        pendingGate: null,
      });

      try {
        const { accessToken, session } = await createProductSession({
          productType: 'interview_prep',
          jobApplicationId: input.jobApplicationId,
        });
        accessTokenRef.current = accessToken;
        sessionIdRef.current = session.id;
        reconnectAttemptsRef.current = 0;

        const res = await fetch(`${API_BASE}/interview-prep/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            session_id: session.id,
            resume_text: input.resumeText,
            job_description: input.jobDescription,
            company_name: input.companyName,
            role_title: input.roleTitle,
            job_application_id: input.jobApplicationId,
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

  const respondToGate = useCallback(
    async (gate: string, response: unknown): Promise<boolean> => {
      const sessionId = sessionIdRef.current;
      const token = accessTokenRef.current;
      if (!sessionId || !token) return false;

      try {
        const res = await fetch(`${API_BASE}/interview-prep/respond`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ session_id: sessionId, gate, response }),
        });
        if (!res.ok) {
          console.error('[useInterviewPrep] Gate respond failed:', res.status);
          return false;
        }
        // Transition back to running after responding
        setState((prev) => ({ ...prev, status: 'running', pendingGate: null }));
        return true;
      } catch (err) {
        console.error('[useInterviewPrep] Gate respond error:', err);
        return false;
      }
    },
    [],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    clearIdleTimer();
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    sessionIdRef.current = null;
    accessTokenRef.current = null;
    reconnectAttemptsRef.current = 0;
    setState({
      status: 'idle',
      report: null,
      qualityScore: null,
      activityMessages: [],
      error: null,
      currentStage: null,
      starStoriesReviewData: null,
      pendingGate: null,
    });
  }, [clearIdleTimer]);

  return {
    ...state,
    startPipeline,
    respondToGate,
    reset,
  };
}
