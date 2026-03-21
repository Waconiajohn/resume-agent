import { useState, useCallback, useRef, useEffect } from 'react';
import { parseSSEStream } from '@/lib/sse-parser';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { safeNumber, safeString } from '@/lib/safe-cast';

export type LinkedInEditorStatus =
  | 'idle'
  | 'connecting'
  | 'running'
  | 'section_review'
  | 'complete'
  | 'error';

import type { ActivityMessage } from '@/types/activity';

export type { ActivityMessage };
export type ProfileSection = 'headline' | 'about' | 'experience' | 'skills' | 'education';

export interface SectionQualityScores {
  keyword_coverage: number;
  readability: number;
  positioning_alignment: number;
}

interface LinkedInEditorState {
  status: LinkedInEditorStatus;
  currentSection: ProfileSection | null;
  sectionDrafts: Record<string, string>;
  currentDraft: string | null;
  sectionScores: Record<string, SectionQualityScores>;
  sectionsCompleted: string[];
  activityMessages: ActivityMessage[];
  error: string | null;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const MAX_ACTIVITY_MESSAGES = 50;
const PROFILE_SECTION_SET = new Set<ProfileSection>(['headline', 'about', 'experience', 'skills', 'education']);

function asProfileSection(value: unknown): ProfileSection | null {
  return typeof value === 'string' && PROFILE_SECTION_SET.has(value as ProfileSection)
    ? (value as ProfileSection)
    : null;
}

function asSectionQualityScores(value: unknown): SectionQualityScores | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  return {
    keyword_coverage: safeNumber(candidate.keyword_coverage),
    readability: safeNumber(candidate.readability),
    positioning_alignment: safeNumber(candidate.positioning_alignment),
  };
}

function asSectionDraftMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, sectionValue]) => key.trim().length > 0 && typeof sectionValue === 'string',
    ),
  );
}

export function useLinkedInEditor() {
  const [state, setState] = useState<LinkedInEditorState>({
    status: 'idle',
    currentSection: null,
    sectionDrafts: {},
    currentDraft: null,
    sectionScores: {},
    sectionsCompleted: [],
    activityMessages: [],
    error: null,
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
          addActivity(safeString(data.message), safeString(data.stage));
          break;

        case 'stage_complete':
          addActivity(safeString(data.message), safeString(data.stage));
          break;

        case 'transparency':
          addActivity(safeString(data.message), safeString(data.stage));
          break;

        case 'section_draft_ready':
          setState((prev) => {
            const section = asProfileSection(data.section);
            const scores = asSectionQualityScores(data.quality_scores);
            return {
              ...prev,
              status: 'section_review',
              currentSection: section,
              currentDraft: safeString(data.content),
              sectionScores:
                section && scores
                  ? {
                      ...prev.sectionScores,
                      [section]: scores,
                    }
                  : prev.sectionScores,
            };
          });
          break;

        case 'section_revised':
          setState((prev) => {
            const section = asProfileSection(data.section);
            const scores = asSectionQualityScores(data.quality_scores);
            return {
              ...prev,
              currentDraft: safeString(data.content),
              sectionScores:
                section && scores
                  ? {
                      ...prev.sectionScores,
                      [section]: scores,
                    }
                  : prev.sectionScores,
            };
          });
          break;

        case 'section_approved': {
          const approvedSection = asProfileSection(data.section);
          // Prefer content from the SSE event payload if available, fall back to currentDraft
          const approvedContent = typeof data.content === 'string' ? data.content : null;
          setState((prev) => ({
            ...prev,
            status: 'running',
            sectionDrafts: {
              ...prev.sectionDrafts,
              ...(approvedSection
                ? { [approvedSection]: approvedContent ?? prev.currentDraft ?? '' }
                : {}),
            },
            sectionsCompleted: !approvedSection || prev.sectionsCompleted.includes(approvedSection)
              ? prev.sectionsCompleted
              : [...prev.sectionsCompleted, approvedSection],
            currentSection: null,
            currentDraft: null,
          }));
          break;
        }

        case 'pipeline_gate':
          setState((prev) => ({ ...prev, status: 'section_review' }));
          break;

        case 'editor_complete':
          setState((prev) => ({
            ...prev,
            status: 'complete',
            sectionDrafts: {
              ...prev.sectionDrafts,
              ...asSectionDraftMap(data.sections),
            },
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

      setState((prev) => ({ ...prev, status: 'connecting' }));

      fetch(`${API_BASE}/linkedin-editor/${sessionId}/stream`, {
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
            console.error('[useLinkedInEditor] SSE stream error:', err);
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
          console.error('[useLinkedInEditor] SSE fetch error:', err);
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

  const startEditor = useCallback(
    async (currentProfile?: string): Promise<boolean> => {
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
        currentSection: null,
        sectionDrafts: {},
        currentDraft: null,
        sectionScores: {},
        sectionsCompleted: [],
        activityMessages: [],
        error: null,
      });

      try {
        const res = await fetch(`${API_BASE}/linkedin-editor/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ session_id: sessionId, current_profile: currentProfile }),
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

  const approveSection = useCallback(async (): Promise<boolean> => {
    const sessionId = sessionIdRef.current;
    const token = accessTokenRef.current;
    if (!sessionId || !token) return false;

    try {
      const res = await fetch(`${API_BASE}/linkedin-editor/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ session_id: sessionId, response: { approved: true } }),
      });

      if (!res.ok) return false;
      setState((prev) => ({ ...prev, status: 'running' }));
      return true;
    } catch {
      return false;
    }
  }, []);

  const requestSectionRevision = useCallback(async (feedback: string): Promise<boolean> => {
    const sessionId = sessionIdRef.current;
    const token = accessTokenRef.current;
    if (!sessionId || !token) return false;

    try {
      const res = await fetch(`${API_BASE}/linkedin-editor/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ session_id: sessionId, response: { approved: false, feedback } }),
      });

      if (!res.ok) return false;
      setState((prev) => ({ ...prev, status: 'running' }));
      return true;
    } catch {
      return false;
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
      currentSection: null,
      sectionDrafts: {},
      currentDraft: null,
      sectionScores: {},
      sectionsCompleted: [],
      activityMessages: [],
      error: null,
    });
  }, []);

  return {
    ...state,
    startEditor,
    approveSection,
    requestSectionRevision,
    reset,
  };
}
