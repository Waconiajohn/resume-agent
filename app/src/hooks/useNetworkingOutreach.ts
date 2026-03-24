import { useState, useCallback, useRef, useEffect } from 'react';
import { parseSSEStream } from '@/lib/sse-parser';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { safeString } from '@/lib/safe-cast';

import type { ActivityMessage } from '@/types/activity';
import type { SequenceReviewData } from '@/types/panels';

export type { ActivityMessage };
export type NetworkingOutreachStatus = 'idle' | 'connecting' | 'running' | 'sequence_review' | 'complete' | 'error';

interface NetworkingOutreachState {
  status: NetworkingOutreachStatus;
  report: string | null;
  qualityScore: number | null;
  messageCount: number | null;
  activityMessages: ActivityMessage[];
  error: string | null;
  currentStage: string | null;
  sequenceReviewData: SequenceReviewData | null;
}

export interface NetworkingOutreachReferralContext {
  company: string;
  bonus_amount: string;
  bonus_currency?: string;
  bonus_details?: string;
  job_title?: string;
  contact_name?: string;
  contact_title?: string;
}

export interface NetworkingOutreachInput {
  resumeText: string;
  messagingMethod?: 'group_message' | 'connection_request' | 'inmail';
  targetInput: {
    target_name: string;
    target_title: string;
    target_company: string;
    target_linkedin_url?: string;
    context_notes?: string;
  };
  referralContext?: NetworkingOutreachReferralContext;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const MAX_ACTIVITY_MESSAGES = 40;

export function useNetworkingOutreach() {
  const [state, setState] = useState<NetworkingOutreachState>({
    status: 'idle',
    report: null,
    qualityScore: null,
    messageCount: null,
    activityMessages: [],
    error: null,
    currentStage: null,
    sequenceReviewData: null,
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

        case 'message_progress': {
          const messageType = safeString(data.message_type);
          const status = safeString(data.status);
          const label = messageType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          if (status === 'drafting') {
            addActivity(`Drafting ${label}...`, 'writing');
          } else if (status === 'complete') {
            addActivity(`${label} complete`, 'writing');
          }
          break;
        }

        case 'sequence_review_ready': {
          const rawMessages = Array.isArray(data.messages) ? data.messages : [];
          setState((prev) => ({
            ...prev,
            sequenceReviewData: {
              messages: rawMessages.map((m: Record<string, unknown>) => ({
                type: safeString(m.type),
                subject: safeString(m.subject),
                body: safeString(m.body),
                char_count: typeof m.char_count === 'number' ? m.char_count : 0,
                timing: safeString(m.timing),
                quality_score: typeof m.quality_score === 'number' ? m.quality_score : 0,
              })),
              target_name: safeString(data.target_name),
              target_company: safeString(data.target_company),
              quality_score: typeof data.quality_score === 'number' ? data.quality_score : 0,
            },
          }));
          break;
        }

        case 'pipeline_gate': {
          const gateName = typeof data.gate === 'string' ? data.gate : undefined;
          if (gateName === 'sequence_review') {
            setState((prev) => ({ ...prev, status: 'sequence_review' }));
          }
          break;
        }

        case 'sequence_complete':
          setState((prev) => ({
            ...prev,
            status: 'complete',
            report: safeString(data.report),
            qualityScore: typeof data.quality_score === 'number' ? data.quality_score : prev.qualityScore,
            messageCount: typeof data.message_count === 'number' ? data.message_count : prev.messageCount,
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

      fetch(`${API_BASE}/networking-outreach/${sessionId}/stream`, {
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
            console.error('[useNetworkingOutreach] SSE stream error:', err);
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
          console.error('[useNetworkingOutreach] SSE fetch error:', err);
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
    async (input: NetworkingOutreachInput): Promise<boolean> => {
      if (statusRef.current !== 'idle') return false;
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? null;
      if (!token) {
        setState((prev) => ({ ...prev, status: 'error', error: 'Not authenticated' }));
        return false;
      }
      accessTokenRef.current = token;

      const sessionId = crypto.randomUUID();
      sessionIdRef.current = sessionId;
      reconnectAttemptsRef.current = 0;

      setState({
        status: 'connecting',
        report: null,
        qualityScore: null,
        messageCount: null,
        activityMessages: [],
        error: null,
        currentStage: null,
        sequenceReviewData: null,
      });

      try {
        const res = await fetch(`${API_BASE}/networking-outreach/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            session_id: sessionId,
            resume_text: input.resumeText,
            messaging_method: input.messagingMethod ?? 'group_message',
            target_input: input.targetInput,
            ...(input.referralContext ? { referral_context: input.referralContext } : {}),
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

        connectSSE(sessionId);
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
        const res = await fetch(`${API_BASE}/networking-outreach/respond`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ session_id: sessionId, gate, response }),
        });
        if (!res.ok) {
          console.error('[useNetworkingOutreach] Gate respond failed:', res.status);
          return false;
        }
        // Transition back to running and reconnect the SSE stream to receive
        // events from the resumed pipeline.
        setState((prev) => ({ ...prev, status: 'running' }));
        if (sessionId) connectSSE(sessionId);
        return true;
      } catch (err) {
        console.error('[useNetworkingOutreach] Gate respond error:', err);
        return false;
      }
    },
    [connectSSE],
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
      messageCount: null,
      activityMessages: [],
      error: null,
      currentStage: null,
      sequenceReviewData: null,
    });
  }, []);

  return {
    ...state,
    startPipeline,
    respondToGate,
    reset,
  };
}
