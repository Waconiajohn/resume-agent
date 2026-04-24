/**
 * useNetworking — Phase 2.3f thin networking-message peer-tool hook.
 *
 * Mirrors useFollowUpEmail / useThankYouNote. Single recipient,
 * single message per session, one review gate.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { parseSSEStream } from '@/lib/sse-parser';
import { API_BASE } from '@/lib/api';
import { createProductSession } from '@/lib/create-product-session';
import { safeString } from '@/lib/safe-cast';

import type { ActivityMessage } from '@/types/activity';

export type { ActivityMessage };

export type NetworkingStatus =
  | 'idle'
  | 'connecting'
  | 'running'
  | 'message_review'
  | 'complete'
  | 'error';

export type RecipientType =
  | 'former_colleague'
  | 'second_degree'
  | 'cold'
  | 'referrer'
  | 'other';

export type MessagingMethod = 'connection_request' | 'inmail' | 'group_message';

export const MESSAGING_METHOD_CHAR_CAP: Record<MessagingMethod, number> = {
  connection_request: 300,
  inmail: 1900,
  group_message: 8000,
};

export interface NetworkingMessageDraft {
  recipient_name: string;
  recipient_type: RecipientType;
  recipient_title?: string;
  recipient_company?: string;
  recipient_linkedin_url?: string;
  messaging_method: MessagingMethod;
  goal: string;
  context?: string;
  message_markdown: string;
  char_count: number;
}

export interface StartNetworkingInput {
  applicationId: string;
  resumeText: string;
  recipientName: string;
  recipientType: RecipientType;
  recipientTitle?: string;
  recipientCompany?: string;
  recipientLinkedinUrl?: string;
  messagingMethod?: MessagingMethod;
  goal: string;
  context?: string;
}

export type MessageReviewResponse =
  | true
  | 'approved'
  | { feedback: string }
  | { edited_content: string };

interface HookState {
  status: NetworkingStatus;
  draft: NetworkingMessageDraft | null;
  activityMessages: ActivityMessage[];
  error: string | null;
  currentStage: string | null;
  pendingGate: string | null;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const MAX_ACTIVITY_MESSAGES = 30;
const MESSAGE_REVIEW_GATE = 'message_review' as const;

function asGateName(value: unknown): typeof MESSAGE_REVIEW_GATE | null {
  return value === MESSAGE_REVIEW_GATE ? MESSAGE_REVIEW_GATE : null;
}

function normalizeDraft(raw: unknown): NetworkingMessageDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const charCount = typeof r.char_count === 'number' ? r.char_count : Number(r.char_count);
  return {
    recipient_name: safeString(r.recipient_name),
    recipient_type: safeString(r.recipient_type, 'other') as RecipientType,
    recipient_title: typeof r.recipient_title === 'string' ? r.recipient_title : undefined,
    recipient_company: typeof r.recipient_company === 'string' ? r.recipient_company : undefined,
    recipient_linkedin_url:
      typeof r.recipient_linkedin_url === 'string' ? r.recipient_linkedin_url : undefined,
    messaging_method: safeString(r.messaging_method, 'connection_request') as MessagingMethod,
    goal: safeString(r.goal),
    context: typeof r.context === 'string' ? r.context : undefined,
    message_markdown: safeString(r.message_markdown),
    char_count: Number.isFinite(charCount) ? charCount : safeString(r.message_markdown).length,
  };
}

export function useNetworking() {
  const [state, setState] = useState<HookState>({
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
          setState((prev) => ({ ...prev, currentStage: safeString(data.stage) }));
          addActivity(safeString(data.message), safeString(data.stage));
          break;

        case 'stage_complete':
          addActivity(safeString(data.message), safeString(data.stage));
          break;

        case 'transparency':
          addActivity(safeString(data.message), safeString(data.stage));
          break;

        case 'message_draft_ready': {
          const draft = normalizeDraft(data.draft);
          if (draft) setState((prev) => ({ ...prev, draft }));
          break;
        }

        case 'pipeline_gate': {
          const gate = asGateName(data.gate);
          if (gate) {
            setState((prev) => ({ ...prev, status: 'message_review', pendingGate: gate }));
          }
          break;
        }

        case 'message_complete': {
          const draft = normalizeDraft(data.draft);
          setState((prev) => ({
            ...prev,
            status: 'complete',
            draft: draft ?? prev.draft,
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

      fetch(`${API_BASE}/networking-message/${sessionId}/stream`, {
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
            console.error('[useNetworking] SSE stream error:', err);
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
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          console.error('[useNetworking] SSE fetch error:', err);
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
    async (input: StartNetworkingInput): Promise<boolean> => {
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
          productType: 'networking_message',
          jobApplicationId: input.applicationId,
        });
        accessTokenRef.current = accessToken;
        sessionIdRef.current = session.id;
        reconnectAttemptsRef.current = 0;

        const res = await fetch(`${API_BASE}/networking-message/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            session_id: session.id,
            job_application_id: input.applicationId,
            resume_text: input.resumeText,
            recipient_name: input.recipientName,
            recipient_type: input.recipientType,
            recipient_title: input.recipientTitle,
            recipient_company: input.recipientCompany,
            recipient_linkedin_url: input.recipientLinkedinUrl,
            messaging_method: input.messagingMethod,
            goal: input.goal,
            context: input.context,
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
    async (gate: string, response: MessageReviewResponse): Promise<boolean> => {
      const sessionId = sessionIdRef.current;
      const token = accessTokenRef.current;
      if (!sessionId || !token) return false;

      try {
        const res = await fetch(`${API_BASE}/networking-message/respond`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ session_id: sessionId, gate, response }),
        });
        if (!res.ok) {
          console.error('[useNetworking] Gate respond failed:', res.status);
          return false;
        }
        // Approve / collection-revise / whole-report edit all trigger a
        // rerun or completion. Any object-shaped edited_content also clears
        // the gate server-side with no rerun.
        const triggersRerun =
          response === true
          || response === 'approved'
          || (typeof response === 'object' && 'feedback' in response && typeof response.feedback === 'string');
        if (triggersRerun) {
          setState((prev) => ({ ...prev, status: 'running', pendingGate: null }));
        }
        return true;
      } catch (err) {
        console.error('[useNetworking] Gate respond error:', err);
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
      draft: null,
      activityMessages: [],
      error: null,
      currentStage: null,
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
