import { useState, useCallback, useRef, useEffect } from 'react';
import { parseSSEStream } from '@/lib/sse-parser';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';

export type LinkedInContentStatus =
  | 'idle'
  | 'connecting'
  | 'running'
  | 'topic_selection'
  | 'post_review'
  | 'complete'
  | 'error';

export interface ActivityMessage {
  id: string;
  text: string;
  stage: string;
  timestamp: number;
}

export interface TopicSuggestion {
  id: string;
  topic: string;
  hook: string;
  rationale: string;
  expertise_area: string;
  evidence_refs: string[];
}

export interface PostQualityScores {
  authenticity: number;
  engagement_potential: number;
  keyword_density: number;
}

interface LinkedInContentState {
  status: LinkedInContentStatus;
  topics: TopicSuggestion[];
  postDraft: string | null;
  postHashtags: string[];
  qualityScores: PostQualityScores | null;
  activityMessages: ActivityMessage[];
  error: string | null;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const MAX_ACTIVITY_MESSAGES = 50;

export function useLinkedInContent() {
  const [state, setState] = useState<LinkedInContentState>({
    status: 'idle',
    topics: [],
    postDraft: null,
    postHashtags: [],
    qualityScores: null,
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
        { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text, stage, timestamp: Date.now() },
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
          addActivity(data.message as string, data.stage as string);
          break;

        case 'stage_complete':
          addActivity(data.message as string, data.stage as string);
          break;

        case 'transparency':
          addActivity(data.message as string, data.stage as string);
          break;

        case 'topics_ready':
          setState((prev) => ({
            ...prev,
            status: 'topic_selection',
            topics: (data.topics as TopicSuggestion[]) ?? [],
          }));
          break;

        case 'post_draft_ready':
          setState((prev) => ({
            ...prev,
            status: 'post_review',
            postDraft: data.post as string,
            postHashtags: (data.hashtags as string[]) ?? [],
            qualityScores: (data.quality_scores as PostQualityScores) ?? null,
          }));
          break;

        case 'post_revised':
          setState((prev) => ({
            ...prev,
            postDraft: data.post as string,
            postHashtags: (data.hashtags as string[]) ?? prev.postHashtags,
            qualityScores: (data.quality_scores as PostQualityScores) ?? prev.qualityScores,
          }));
          break;

        case 'pipeline_gate': {
          const gateName = data.gate as string | undefined;
          if (gateName === 'topic_selection') {
            setState((prev) => ({ ...prev, status: 'topic_selection' }));
          } else if (gateName === 'post_review') {
            setState((prev) => ({ ...prev, status: 'post_review' }));
          }
          break;
        }

        case 'content_complete':
          setState((prev) => ({
            ...prev,
            status: 'complete',
            postDraft: (data.post as string) ?? prev.postDraft,
            postHashtags: (data.hashtags as string[]) ?? prev.postHashtags,
            qualityScores: (data.quality_scores as PostQualityScores) ?? prev.qualityScores,
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

      fetch(`${API_BASE}/linkedin-content/${sessionId}/stream`, {
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
            console.error('[useLinkedInContent] SSE stream error:', err);
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
          console.error('[useLinkedInContent] SSE fetch error:', err);
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

  const startContentPipeline = useCallback(async (): Promise<boolean> => {
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
      topics: [],
      postDraft: null,
      postHashtags: [],
      qualityScores: null,
      activityMessages: [],
      error: null,
    });

    try {
      const res = await fetch(`${API_BASE}/linkedin-content/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ session_id: sessionId }),
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
  }, [connectSSE]);

  const selectTopic = useCallback(async (topicId: string): Promise<boolean> => {
    const sessionId = sessionIdRef.current;
    const token = accessTokenRef.current;
    if (!sessionId || !token) return false;

    try {
      const res = await fetch(`${API_BASE}/linkedin-content/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ session_id: sessionId, response: { topic_id: topicId } }),
      });

      if (!res.ok) return false;
      setState((prev) => ({ ...prev, status: 'running' }));
      connectSSE(sessionId);
      return true;
    } catch {
      return false;
    }
  }, [connectSSE]);

  const approvePost = useCallback(async (): Promise<boolean> => {
    const sessionId = sessionIdRef.current;
    const token = accessTokenRef.current;
    if (!sessionId || !token) return false;

    try {
      const res = await fetch(`${API_BASE}/linkedin-content/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ session_id: sessionId, response: { approved: true } }),
      });

      if (!res.ok) return false;
      setState((prev) => ({ ...prev, status: 'running' }));
      connectSSE(sessionId);
      return true;
    } catch {
      return false;
    }
  }, [connectSSE]);

  const requestRevision = useCallback(async (feedback: string): Promise<boolean> => {
    const sessionId = sessionIdRef.current;
    const token = accessTokenRef.current;
    if (!sessionId || !token) return false;

    try {
      const res = await fetch(`${API_BASE}/linkedin-content/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ session_id: sessionId, response: { approved: false, feedback } }),
      });

      if (!res.ok) return false;
      setState((prev) => ({ ...prev, status: 'running' }));
      connectSSE(sessionId);
      return true;
    } catch {
      return false;
    }
  }, [connectSSE]);

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
      topics: [],
      postDraft: null,
      postHashtags: [],
      qualityScores: null,
      activityMessages: [],
      error: null,
    });
  }, []);

  return {
    ...state,
    startContentPipeline,
    selectTopic,
    approvePost,
    requestRevision,
    reset,
  };
}
