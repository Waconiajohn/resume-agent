import { useState, useCallback, useRef, useEffect } from 'react';
import { parseSSEStream } from '@/lib/sse-parser';
import { API_BASE } from '@/lib/api';
import { createProductSession } from '@/lib/create-product-session';
import { safeString, safeNumber } from '@/lib/safe-cast';

import type { ActivityMessage } from '@/types/activity';

export type { ActivityMessage };
export type ThankYouNoteStatus = 'idle' | 'connecting' | 'running' | 'note_review' | 'complete' | 'error';

export interface NoteReviewData {
  notes: unknown[];
  quality_score: number;
}

interface ThankYouNoteHookState {
  status: ThankYouNoteStatus;
  report: string | null;
  qualityScore: number | null;
  activityMessages: ActivityMessage[];
  error: string | null;
  currentStage: string | null;
  noteReviewData: NoteReviewData | null;
  pendingGate: string | null;
}

export interface InterviewerInput {
  name: string;
  title: string;
  topics_discussed: string[];
  rapport_notes?: string;
  key_questions?: string[];
}

export interface ThankYouNoteInput {
  resumeText: string;
  company: string;
  role: string;
  interviewDate?: string;
  interviewType?: string;
  interviewers: InterviewerInput[];
  jobApplicationId?: string;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const MAX_ACTIVITY_MESSAGES = 50;

function normalizeReviewNotes(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item != null && typeof item === 'object' && !Array.isArray(item));
}

function normalizeGateName(value: unknown): 'note_review' | null {
  return value === 'note_review' ? 'note_review' : null;
}

export function useThankYouNote() {
  const [state, setState] = useState<ThankYouNoteHookState>({
    status: 'idle',
    report: null,
    qualityScore: null,
    activityMessages: [],
    error: null,
    currentStage: null,
    noteReviewData: null,
    pendingGate: null,
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

        case 'note_drafted': {
          const interviewer = safeString(data.interviewer_name);
          const format = safeString(data.format);
          addActivity(`Drafted ${format} note for ${interviewer}`, 'drafting');
          break;
        }

        case 'note_complete': {
          const interviewer = safeString(data.interviewer_name);
          const qualityScore = safeNumber(data.quality_score);
          addActivity(`Quality checked note for ${interviewer} — score: ${qualityScore}`, 'quality');
          break;
        }

        case 'note_review_ready': {
          setState((prev) => ({
            ...prev,
            noteReviewData: {
              notes: normalizeReviewNotes(data.notes),
              quality_score: safeNumber(data.quality_score),
            },
          }));
          break;
        }

        case 'pipeline_gate': {
          const gateName = normalizeGateName(data.gate);
          if (gateName === 'note_review') {
            setState((prev) => ({ ...prev, status: 'note_review', pendingGate: gateName }));
          }
          break;
        }

        case 'collection_complete':
          setState((prev) => ({
            ...prev,
            status: 'complete',
            report: safeString(data.report) || prev.report,
            qualityScore:
              data.quality_score == null ? prev.qualityScore : safeNumber(data.quality_score, prev.qualityScore ?? 0),
          }));
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

      fetch(`${API_BASE}/thank-you-note/${sessionId}/stream`, {
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
            console.error('[useThankYouNote] SSE stream error:', err);
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
          console.error('[useThankYouNote] SSE fetch error:', err);
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

  const startPipeline = useCallback(
    async (input: ThankYouNoteInput): Promise<boolean> => {
      if (statusRef.current !== 'idle') return false;

      setState({
        status: 'connecting',
        report: null,
        qualityScore: null,
        activityMessages: [],
        error: null,
        currentStage: null,
        noteReviewData: null,
        pendingGate: null,
      });

      try {
        const { accessToken, session } = await createProductSession({
          productType: 'thank_you_note',
          jobApplicationId: input.jobApplicationId,
        });
        accessTokenRef.current = accessToken;
        sessionIdRef.current = session.id;
        reconnectAttemptsRef.current = 0;

        const res = await fetch(`${API_BASE}/thank-you-note/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            session_id: session.id,
            resume_text: input.resumeText,
            company: input.company,
            role: input.role,
            interview_date: input.interviewDate,
            interview_type: input.interviewType,
            interviewers: input.interviewers,
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
        const res = await fetch(`${API_BASE}/thank-you-note/respond`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ session_id: sessionId, gate, response }),
        });
        if (!res.ok) {
          console.error('[useThankYouNote] Gate respond failed:', res.status);
          return false;
        }
        // Transition back to running after responding
        setState((prev) => ({ ...prev, status: 'running', pendingGate: null }));
        return true;
      } catch (err) {
        console.error('[useThankYouNote] Gate respond error:', err);
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
      report: null,
      qualityScore: null,
      activityMessages: [],
      error: null,
      currentStage: null,
      noteReviewData: null,
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
