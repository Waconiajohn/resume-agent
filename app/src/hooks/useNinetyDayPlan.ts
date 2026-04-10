import { useState, useCallback, useRef, useEffect } from 'react';
import { parseSSEStream } from '@/lib/sse-parser';
import { API_BASE } from '@/lib/api';
import { createProductSession } from '@/lib/create-product-session';
import { safeString, safeNumber } from '@/lib/safe-cast';

import type { ActivityMessage } from '@/types/activity';

export type { ActivityMessage };
export type NinetyDayPlanStatus = 'idle' | 'connecting' | 'running' | 'stakeholder_review' | 'complete' | 'error';

export interface StakeholderReviewData {
  stakeholder_map: unknown[];
  quick_wins: unknown[];
  role_context: unknown;
}

interface NinetyDayPlanState {
  status: NinetyDayPlanStatus;
  report: string | null;
  qualityScore: number | null;
  activityMessages: ActivityMessage[];
  error: string | null;
  currentStage: string | null;
  stakeholderReviewData: StakeholderReviewData | null;
  pendingGate: string | null;
}

export interface NinetyDayPlanInput {
  resumeText: string;
  targetRole: string;
  targetCompany: string;
  targetIndustry?: string;
  reportingTo?: string;
  teamSize?: string;
  jobApplicationId?: string;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const MAX_ACTIVITY_MESSAGES = 50;

function normalizeStakeholderMap(value: unknown): StakeholderReviewData['stakeholder_map'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const raw = item as Record<string, unknown>;
    const nameOrRole = safeString(raw.name_or_role).trim();
    if (!nameOrRole) return [];
    return [{
      name_or_role: nameOrRole,
      relationship_type: safeString(raw.relationship_type).trim(),
      priority: safeString(raw.priority).trim(),
      engagement_strategy: safeString(raw.engagement_strategy).trim(),
    }];
  });
}

function normalizeQuickWins(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const raw = item as Record<string, unknown>;
    const description = safeString(raw.description).trim();
    if (!description) return [];
    return [{
      description,
      impact: safeString(raw.impact).trim(),
      effort: safeString(raw.effort).trim(),
    }];
  });
}

function normalizeRoleContext(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const targetRole = safeString(raw.target_role).trim();
  const targetCompany = safeString(raw.target_company).trim();
  const targetIndustry = safeString(raw.target_industry).trim();
  if (!targetRole && !targetCompany && !targetIndustry) return null;
  return {
    target_role: targetRole,
    target_company: targetCompany,
    target_industry: targetIndustry,
  };
}

export function useNinetyDayPlan() {
  const [state, setState] = useState<NinetyDayPlanState>({
    status: 'idle',
    report: null,
    qualityScore: null,
    activityMessages: [],
    error: null,
    currentStage: null,
    stakeholderReviewData: null,
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

        case 'research_complete': {
          const stakeholders = safeNumber(data.stakeholder_count);
          const quickWins = safeNumber(data.quick_win_count);
          const learningPriorities = safeNumber(data.learning_priority_count);
          addActivity(
            `Research complete: ${stakeholders} stakeholders, ${quickWins} quick wins, ${learningPriorities} learning priorities`,
            'research',
          );
          break;
        }

        case 'stakeholder_review_ready': {
          setState((prev) => ({
            ...prev,
            stakeholderReviewData: {
              stakeholder_map: normalizeStakeholderMap(data.stakeholder_map),
              quick_wins: normalizeQuickWins(data.quick_wins),
              role_context: normalizeRoleContext(data.role_context),
            },
          }));
          break;
        }

        case 'pipeline_gate': {
          const gateName = data.gate === 'stakeholder_review' ? 'stakeholder_review' : undefined;
          if (gateName === 'stakeholder_review') {
            setState((prev) => ({ ...prev, status: 'stakeholder_review', pendingGate: gateName }));
          }
          break;
        }

        case 'phase_drafted': {
          const phase = safeNumber(data.phase);
          const title = safeString(data.title);
          const activityCount = safeNumber(data.activity_count);
          addActivity(`Phase ${phase / 30} drafted: ${title} (${activityCount} activities)`, 'planning');
          break;
        }

        case 'phase_complete': {
          const phase = safeNumber(data.phase);
          const title = safeString(data.title);
          const milestoneCount = safeNumber(data.milestone_count);
          addActivity(`Phase ${phase / 30} complete: ${title} (${milestoneCount} milestones)`, 'planning');
          break;
        }

        case 'plan_complete':
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
        .catch((err: unknown) => {
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

      setState({
        status: 'connecting',
        report: null,
        qualityScore: null,
        activityMessages: [],
        error: null,
        currentStage: null,
        stakeholderReviewData: null,
        pendingGate: null,
      });

      try {
        const { accessToken, session } = await createProductSession({
          productType: 'ninety_day_plan',
          jobApplicationId: input.jobApplicationId,
        });
        accessTokenRef.current = accessToken;
        sessionIdRef.current = session.id;
        reconnectAttemptsRef.current = 0;

        const res = await fetch(`${API_BASE}/ninety-day-plan/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            session_id: session.id,
            resume_text: input.resumeText,
            target_role: input.targetRole,
            target_company: input.targetCompany,
            target_industry: input.targetIndustry,
            reporting_to: input.reportingTo,
            team_size: input.teamSize,
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
        const res = await fetch(`${API_BASE}/ninety-day-plan/respond`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ session_id: sessionId, gate, response }),
        });
        if (!res.ok) {
          console.error('[useNinetyDayPlan] Gate respond failed:', res.status);
          return false;
        }
        // Transition back to running after responding
        setState((prev) => ({ ...prev, status: 'running', pendingGate: null }));
        return true;
      } catch (err) {
        console.error('[useNinetyDayPlan] Gate respond error:', err);
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
      stakeholderReviewData: null,
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
