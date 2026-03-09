import { useState, useCallback, useRef, useEffect } from 'react';
import { parseSSEStream } from '@/lib/sse-parser';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';

import type { ActivityMessage } from '@/types/activity';

export type { ActivityMessage };
export type NinetyDayPlanStatus = 'idle' | 'connecting' | 'running' | 'complete' | 'error';

interface NinetyDayPlanState {
  status: NinetyDayPlanStatus;
  report: string | null;
  qualityScore: number | null;
  activityMessages: ActivityMessage[];
  error: string | null;
  currentStage: string | null;
}

export interface NinetyDayPlanInput {
  resumeText: string;
  targetRole: string;
  targetCompany: string;
  targetIndustry?: string;
  reportingTo?: string;
  teamSize?: string;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const MAX_ACTIVITY_MESSAGES = 50;

export function useNinetyDayPlan() {
  const [state, setState] = useState<NinetyDayPlanState>({
    status: 'idle',
    report: null,
    qualityScore: null,
    activityMessages: [],
    error: null,
    currentStage: null,
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
          setState((prev) => ({ ...prev, currentStage: data.stage as string }));
          addActivity(data.message as string, data.stage as string);
          break;

        case 'stage_complete':
          addActivity(data.message as string, data.stage as string);
          break;

        case 'transparency':
          addActivity(data.message as string, data.stage as string);
          break;

        case 'research_complete': {
          const stakeholders = data.stakeholder_count as number;
          const quickWins = data.quick_win_count as number;
          const learningPriorities = data.learning_priority_count as number;
          addActivity(
            `Research complete: ${stakeholders} stakeholders, ${quickWins} quick wins, ${learningPriorities} learning priorities`,
            'research',
          );
          break;
        }

        case 'phase_drafted': {
          const phase = data.phase as number;
          const title = data.title as string;
          const activityCount = data.activity_count as number;
          addActivity(`Phase ${phase / 30} drafted: ${title} (${activityCount} activities)`, 'planning');
          break;
        }

        case 'phase_complete': {
          const phase = data.phase as number;
          const title = data.title as string;
          const milestoneCount = data.milestone_count as number;
          addActivity(`Phase ${phase / 30} complete: ${title} (${milestoneCount} milestones)`, 'planning');
          break;
        }

        case 'plan_complete':
          setState((prev) => ({
            ...prev,
            status: 'complete',
            report: data.report as string,
            qualityScore: typeof data.quality_score === 'number' ? data.quality_score : prev.qualityScore,
          }));
          abortRef.current?.abort();
          break;

        case 'pipeline_error':
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: data.error as string,
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

      fetch(`${API_BASE}/ninety-day-plan/${sessionId}/stream`, {
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
            console.error('[useNinetyDayPlan] SSE stream error:', err);
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
          console.error('[useNinetyDayPlan] SSE fetch error:', err);
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
    async (input: NinetyDayPlanInput): Promise<boolean> => {
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
      });

      try {
        const res = await fetch(`${API_BASE}/ninety-day-plan/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            session_id: sessionId,
            resume_text: input.resumeText,
            target_role: input.targetRole,
            target_company: input.targetCompany,
            target_industry: input.targetIndustry,
            reporting_to: input.reportingTo,
            team_size: input.teamSize,
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
    });
  }, []);

  return {
    ...state,
    startPipeline,
    reset,
  };
}
