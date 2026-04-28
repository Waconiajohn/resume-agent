/**
 * useFollowUpEmail — Phase 2.3d peer-tool hook.
 *
 * Mirrors useInterviewPrep: POST /follow-up-email/start, stream via GET
 * /follow-up-email/:sessionId/stream, gate response via POST
 * /follow-up-email/respond. One gate (`email_review`) supports approve,
 * revise (multi-turn), and direct-edit.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { parseSSEStream } from '@/lib/sse-parser';
import { API_BASE } from '@/lib/api';
import { createProductSession } from '@/lib/create-product-session';
import { safeString } from '@/lib/safe-cast';

import type { ActivityMessage } from '@/types/activity';

export type { ActivityMessage };

export type FollowUpEmailStatus =
  | 'idle'
  | 'connecting'
  | 'running'
  | 'email_review'
  | 'complete'
  | 'error';

export type FollowUpTone = 'warm' | 'direct' | 'value-add';

export type FollowUpSituation =
  | 'post_interview'
  | 'no_response'
  | 'rejection_graceful'
  | 'keep_warm'
  | 'negotiation_counter';

export interface FollowUpEmailDraft {
  situation: FollowUpSituation;
  tone: FollowUpTone;
  follow_up_number: number;
  subject: string;
  body: string;
  tone_notes: string;
  timing_guidance: string;
}

interface FollowUpEmailHookState {
  status: FollowUpEmailStatus;
  draft: FollowUpEmailDraft | null;
  activityMessages: ActivityMessage[];
  error: string | null;
  currentStage: string | null;
  pendingGate: string | null;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const MAX_ACTIVITY_MESSAGES = 30;
const STREAM_IDLE_TIMEOUT_MS = 75_000;
const EMAIL_REVIEW_GATE = 'email_review' as const;

function asFollowUpGate(value: unknown): typeof EMAIL_REVIEW_GATE | null {
  return value === EMAIL_REVIEW_GATE ? EMAIL_REVIEW_GATE : null;
}

function toDraft(raw: unknown): FollowUpEmailDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const follow_up_number =
    typeof r.follow_up_number === 'number' ? r.follow_up_number : Number(r.follow_up_number);
  return {
    situation: safeString(r.situation, 'post_interview') as FollowUpSituation,
    tone: safeString(r.tone, 'warm') as FollowUpTone,
    follow_up_number: Number.isFinite(follow_up_number) ? follow_up_number : 1,
    subject: safeString(r.subject),
    body: safeString(r.body),
    tone_notes: safeString(r.tone_notes),
    timing_guidance: safeString(r.timing_guidance),
  };
}

export interface StartFollowUpEmailInput {
  jobApplicationId: string;
  followUpNumber?: number;
  tone?: FollowUpTone;
  situation?: FollowUpSituation;
  companyName?: string;
  roleTitle?: string;
  recipientName?: string;
  recipientTitle?: string;
  specificContext?: string;
}

export function useFollowUpEmail() {
  const [state, setState] = useState<FollowUpEmailHookState>({
    status: 'idle',
    draft: null,
    activityMessages: [],
    error: null,
    currentStage: null,
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
        error: 'The draft stalled while waiting for the writer. No work was lost — please try again.',
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
          setState((prev) => ({ ...prev, currentStage: safeString(data.stage) }));
          addActivity(safeString(data.message), safeString(data.stage));
          break;

        case 'stage_complete':
          addActivity(safeString(data.message), safeString(data.stage));
          break;

        case 'transparency':
          addActivity(safeString(data.message), safeString(data.stage));
          break;

        case 'email_draft_ready': {
          const draft = toDraft(data.draft);
          if (draft) {
            setState((prev) => ({ ...prev, draft }));
          }
          break;
        }

        case 'pipeline_gate': {
          const gateName = asFollowUpGate(data.gate);
          if (gateName) {
            clearIdleTimer();
            setState((prev) => ({ ...prev, status: 'email_review', pendingGate: gateName }));
          }
          break;
        }

        case 'email_complete': {
          const draft = toDraft(data.draft);
          clearIdleTimer();
          setState((prev) => ({
            ...prev,
            status: 'complete',
            draft: draft ?? prev.draft,
          }));
          abortRef.current?.abort();
          break;
        }

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
            status: prev.draft ? 'complete' : prev.status,
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

      fetch(`${API_BASE}/follow-up-email/${sessionId}/stream`, {
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
            console.error('[useFollowUpEmail] SSE stream error:', err);
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
          console.error('[useFollowUpEmail] SSE fetch error:', err);
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
    async (input: StartFollowUpEmailInput): Promise<boolean> => {
      if (statusRef.current !== 'idle') return false;

      setState({
        status: 'connecting',
        draft: null,
        activityMessages: [],
        error: null,
        currentStage: null,
        pendingGate: null,
      });

      try {
        const { accessToken, session } = await createProductSession({
          productType: 'follow_up_email',
          jobApplicationId: input.jobApplicationId,
        });
        accessTokenRef.current = accessToken;
        sessionIdRef.current = session.id;
        reconnectAttemptsRef.current = 0;

        const res = await fetch(`${API_BASE}/follow-up-email/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            session_id: session.id,
            job_application_id: input.jobApplicationId,
            follow_up_number: input.followUpNumber,
            tone: input.tone,
            situation: input.situation,
            company_name: input.companyName,
            role_title: input.roleTitle,
            recipient_name: input.recipientName,
            recipient_title: input.recipientTitle,
            specific_context: input.specificContext,
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
        const res = await fetch(`${API_BASE}/follow-up-email/respond`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ session_id: sessionId, gate, response }),
        });
        if (!res.ok) {
          console.error('[useFollowUpEmail] Gate respond failed:', res.status);
          return false;
        }
        setState((prev) => ({ ...prev, status: 'running', pendingGate: null }));
        return true;
      } catch (err) {
        console.error('[useFollowUpEmail] Gate respond error:', err);
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
      draft: null,
      activityMessages: [],
      error: null,
      currentStage: null,
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
