import { useState, useCallback, useRef, useEffect } from 'react';
import { parseSSEStream } from '@/lib/sse-parser';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { safeString, safeNumber } from '@/lib/safe-cast';

export interface SavedCalendarReport {
  id: string;
  target_role: string;
  target_industry: string;
  quality_score: number;
  coherence_score: number;
  post_count: number;
  created_at: string;
}

export interface SavedCalendarReportFull extends SavedCalendarReport {
  report_markdown: string;
  themes: unknown[];
  content_mix: Record<string, unknown>;
  posts: unknown[];
}

import type { ActivityMessage } from '@/types/activity';

export type { ActivityMessage };
export type ContentCalendarStatus = 'idle' | 'connecting' | 'running' | 'complete' | 'error';

export interface StructuredPost {
  day: number;
  day_of_week: string;
  content_type: string;
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  posting_time: string;
  quality_score: number;
  word_count: number;
}

interface ContentCalendarState {
  status: ContentCalendarStatus;
  report: string | null;
  posts: StructuredPost[];
  qualityScore: number | null;
  postCount: number | null;
  activityMessages: ActivityMessage[];
  error: string | null;
  currentStage: string | null;
  savedReports: SavedCalendarReport[];
  reportsLoading: boolean;
}

export interface ContentCalendarInput {
  resumeText: string;
  targetRole?: string;
  targetIndustry?: string;
  postsPerWeek?: number;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const MAX_ACTIVITY_MESSAGES = 40;

function normalizeHashtags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeStructuredPost(value: unknown): StructuredPost | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const day = safeNumber(raw.day, Number.NaN);
  if (Number.isNaN(day)) return null;

  return {
    day,
    day_of_week: safeString(raw.day_of_week),
    content_type: safeString(raw.content_type),
    hook: safeString(raw.hook),
    body: safeString(raw.body),
    cta: safeString(raw.cta),
    hashtags: normalizeHashtags(raw.hashtags),
    posting_time: safeString(raw.posting_time),
    quality_score: safeNumber(raw.quality_score),
    word_count: safeNumber(raw.word_count),
  };
}

function normalizeStructuredPosts(value: unknown): StructuredPost[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .map((post) => normalizeStructuredPost(post))
    .filter((post): post is StructuredPost => post !== null);
}

function normalizeSavedReport(value: unknown): SavedCalendarReport | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = safeString(raw.id);
  const createdAt = safeString(raw.created_at);
  if (!id || !createdAt) return null;
  return {
    id,
    target_role: safeString(raw.target_role),
    target_industry: safeString(raw.target_industry),
    quality_score: safeNumber(raw.quality_score),
    coherence_score: safeNumber(raw.coherence_score),
    post_count: safeNumber(raw.post_count),
    created_at: createdAt,
  };
}

function normalizeSavedReports(payload: unknown): SavedCalendarReport[] {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((report) => normalizeSavedReport(report))
    .filter((report): report is SavedCalendarReport => report !== null);
}

function normalizeSavedReportFull(value: unknown): SavedCalendarReportFull | null {
  const base = normalizeSavedReport(value);
  if (!base || !value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  return {
    ...base,
    report_markdown: safeString(raw.report_markdown),
    themes: Array.isArray(raw.themes) ? raw.themes : [],
    content_mix: raw.content_mix && typeof raw.content_mix === 'object' ? raw.content_mix as Record<string, unknown> : {},
    posts: Array.isArray(raw.posts) ? raw.posts : [],
  };
}

export function useContentCalendar() {
  const [state, setState] = useState<ContentCalendarState>({
    status: 'idle',
    report: null,
    posts: [],
    qualityScore: null,
    postCount: null,
    activityMessages: [],
    error: null,
    currentStage: null,
    savedReports: [],
    reportsLoading: false,
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
    void fetchReports();
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  // fetchReports is stable (useCallback with no deps that change), safe to omit
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchReports = useCallback(async (): Promise<void> => {
    if (!mountedRef.current) return;
    setState((prev) => ({ ...prev, reportsLoading: true }));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? null;
      if (!token) {
        if (mountedRef.current) {
          setState((prev) => ({ ...prev, savedReports: [], reportsLoading: false }));
        }
        return;
      }

      const res = await fetch(`${API_BASE}/content-calendar/reports`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        if (mountedRef.current) {
          setState((prev) => ({ ...prev, reportsLoading: false }));
        }
        return;
      }

      const data = (await res.json()) as { reports?: unknown; feature_disabled?: boolean };
      if (data.feature_disabled) {
        if (mountedRef.current) {
          setState((prev) => ({ ...prev, savedReports: [], reportsLoading: false }));
        }
        return;
      }
      if (mountedRef.current) {
        setState((prev) => ({
          ...prev,
          savedReports: normalizeSavedReports(data.reports),
          reportsLoading: false,
        }));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (import.meta.env.MODE !== 'test') {
        console.error('[useContentCalendar] fetchReports error:', message);
      }
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, reportsLoading: false }));
      }
    }
  }, []);

  const fetchReportById = useCallback(async (id: string): Promise<SavedCalendarReportFull | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? null;
      if (!token) return null;

      const res = await fetch(`${API_BASE}/content-calendar/reports/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) return null;

      const data = (await res.json()) as { report?: unknown };
      return normalizeSavedReportFull(data.report);
    } catch {
      return null;
    }
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

        case 'theme_identified':
          addActivity(`Theme: ${safeString(data.theme_name)} (${safeNumber(data.theme_count)} total)`, 'strategy');
          break;

        case 'post_progress': {
          const day = safeNumber(data.day);
          const total = safeNumber(data.total_days);
          const status = safeString(data.status);
          if (status === 'drafting') {
            addActivity(`Drafting post ${day}/${total}...`, 'writing');
          } else if (status === 'complete') {
            addActivity(`Post ${day}/${total} complete`, 'writing');
          }
          break;
        }

        case 'calendar_complete':
          setState((prev) => ({
            ...prev,
            status: 'complete',
            report: safeString(data.report) || prev.report,
            posts: normalizeStructuredPosts(data.posts) ?? prev.posts,
            qualityScore:
              data.quality_score == null ? prev.qualityScore : safeNumber(data.quality_score, prev.qualityScore ?? 0),
            postCount:
              data.post_count == null ? prev.postCount : safeNumber(data.post_count, prev.postCount ?? 0),
          }));
          abortRef.current?.abort();
          // Refresh the saved reports list so the new one shows in Previous Calendars
          void fetchReports();
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

      fetch(`${API_BASE}/content-calendar/${sessionId}/stream`, {
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
            console.error('[useContentCalendar] SSE stream error:', err);
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
          console.error('[useContentCalendar] SSE fetch error:', err);
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
    async (input: ContentCalendarInput): Promise<boolean> => {
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

      setState((prev) => ({
        status: 'connecting',
        report: null,
        posts: [],
        qualityScore: null,
        postCount: null,
        activityMessages: [],
        error: null,
        currentStage: null,
        savedReports: prev.savedReports,
        reportsLoading: false,
      }));

      try {
        const res = await fetch(`${API_BASE}/content-calendar/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            session_id: sessionId,
            resume_text: input.resumeText,
            target_role: input.targetRole,
            target_industry: input.targetIndustry,
            posts_per_week: input.postsPerWeek,
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
    setState((prev) => ({
      status: 'idle',
      report: null,
      posts: [],
      qualityScore: null,
      postCount: null,
      activityMessages: [],
      error: null,
      currentStage: null,
      savedReports: prev.savedReports,
      reportsLoading: false,
    }));
  }, []);

  return {
    ...state,
    startPipeline,
    reset,
    fetchReports,
    fetchReportById,
  };
}
