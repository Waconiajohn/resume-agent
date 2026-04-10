import { useState, useCallback, useRef, useEffect } from 'react';
import { parseSSEStream } from '@/lib/sse-parser';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { safeString, safeNumber } from '@/lib/safe-cast';

import type { ActivityMessage } from '@/types/activity';

export type { ActivityMessage };
export type ExecutiveBioStatus = 'idle' | 'connecting' | 'running' | 'bio_review' | 'complete' | 'error';

export interface BioReviewData {
  bios: unknown[];
  final_report?: string;
  quality_score?: number;
}

interface ExecutiveBioState {
  status: ExecutiveBioStatus;
  report: string | null;
  qualityScore: number | null;
  activityMessages: ActivityMessage[];
  error: string | null;
  currentStage: string | null;
  bioReviewData: BioReviewData | null;
  pendingGate: string | null;
}

export interface ExecutiveBioInput {
  resumeText: string;
  requestedFormats?: string[];
  requestedLengths?: string[];
  targetRole?: string;
  targetIndustry?: string;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const MAX_ACTIVITY_MESSAGES = 50;

export function useExecutiveBio() {
  const [state, setState] = useState<ExecutiveBioState>({
    status: 'idle',
    report: null,
    qualityScore: null,
    activityMessages: [],
    error: null,
    currentStage: null,
    bioReviewData: null,
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

        case 'bio_drafted': {
          const format = safeString(data.format);
          const length = safeString(data.length);
          const wordCount = safeNumber(data.word_count);
          addActivity(`Drafted ${format} bio (${length}, ${wordCount} words)`, 'drafting');
          break;
        }

        case 'bio_complete': {
          const format = safeString(data.format);
          const qualityScore = safeNumber(data.quality_score);
          addActivity(`Quality checked ${format} bio — score: ${qualityScore}`, 'quality');
          break;
        }

        case 'bio_review_ready': {
          setState((prev) => ({
            ...prev,
            bioReviewData: {
              bios: Array.isArray(data.bios) ? data.bios : [],
              final_report: typeof data.final_report === 'string' ? data.final_report : undefined,
              quality_score: typeof data.quality_score === 'number' ? data.quality_score : undefined,
            },
          }));
          break;
        }

        case 'pipeline_gate': {
          const gateName = typeof data.gate === 'string' ? data.gate : undefined;
          if (gateName === 'bio_review') {
            setState((prev) => ({ ...prev, status: 'bio_review', pendingGate: gateName }));
          }
          break;
        }

        case 'collection_complete':
          setState((prev) => ({
            ...prev,
            status: 'complete',
            report: safeString(data.report),
            qualityScore: typeof data.quality_score === 'number' ? data.quality_score : prev.qualityScore,
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

      fetch(`${API_BASE}/executive-bio/${sessionId}/stream`, {
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
            console.error('[useExecutiveBio] SSE stream error:', err);
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
          console.error('[useExecutiveBio] SSE fetch error:', err);
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
    async (input: ExecutiveBioInput): Promise<boolean> => {
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
        activityMessages: [],
        error: null,
        currentStage: null,
        bioReviewData: null,
        pendingGate: null,
      });

      try {
        const res = await fetch(`${API_BASE}/executive-bio/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            session_id: sessionId,
            resume_text: input.resumeText,
            requested_formats: input.requestedFormats,
            requested_lengths: input.requestedLengths,
            target_role: input.targetRole,
            target_industry: input.targetIndustry,
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
        const res = await fetch(`${API_BASE}/executive-bio/respond`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ session_id: sessionId, gate, response }),
        });
        if (!res.ok) {
          console.error('[useExecutiveBio] Gate respond failed:', res.status);
          return false;
        }
        // Transition back to running after responding
        setState((prev) => ({ ...prev, status: 'running', pendingGate: null }));
        return true;
      } catch (err) {
        console.error('[useExecutiveBio] Gate respond error:', err);
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
      bioReviewData: null,
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
