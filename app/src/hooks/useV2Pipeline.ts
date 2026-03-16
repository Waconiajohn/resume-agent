/**
 * useV2Pipeline — SSE streaming hook for Resume v2 pipeline
 *
 * Connects to the v2 pipeline SSE endpoint, accumulates agent outputs
 * as they arrive, and provides the full pipeline state to the UI.
 *
 * Usage:
 *   const { data, isComplete, isConnected, error, start } = useV2Pipeline(accessToken);
 *   start(resumeText, jobDescription);
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { API_BASE } from '@/lib/api';
import { parseSSEStream } from '@/lib/sse-parser';
import type { GapCoachingResponse, PreScores, V2PersistedDraftState, V2PipelineData, V2SSEEvent, V2Stage } from '@/types/resume-v2';

const INITIAL_DATA: V2PipelineData = {
  sessionId: '',
  stage: 'intake',
  jobIntelligence: null,
  candidateIntelligence: null,
  benchmarkCandidate: null,
  gapAnalysis: null,
  gapCoachingCards: null,
  preScores: null,
  narrativeStrategy: null,
  resumeDraft: null,
  assembly: null,
  error: null,
  stageMessages: [],
};

export function useV2Pipeline(accessToken: string | null) {
  const [data, setData] = useState<V2PipelineData>(INITIAL_DATA);
  const [isConnected, setIsConnected] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleEvent = useCallback((event: V2SSEEvent) => {
    setData(prev => {
      switch (event.type) {
        case 'stage_start':
          return {
            ...prev,
            stage: event.stage,
            stageMessages: [...prev.stageMessages, { stage: event.stage, message: event.message, type: 'start' as const }],
          };

        case 'stage_complete':
          return {
            ...prev,
            stageMessages: [...prev.stageMessages, { stage: event.stage, message: event.message, type: 'complete' as const, duration_ms: event.duration_ms }],
          };

        case 'job_intelligence':
          return { ...prev, jobIntelligence: event.data };

        case 'candidate_intelligence':
          return { ...prev, candidateIntelligence: event.data };

        case 'benchmark_candidate':
          return { ...prev, benchmarkCandidate: event.data };

        case 'gap_analysis':
          return { ...prev, gapAnalysis: event.data };

        case 'pre_scores':
          return { ...prev, preScores: event.data };

        case 'gap_coaching':
          return { ...prev, gapCoachingCards: event.data };

        case 'narrative_strategy':
          return { ...prev, narrativeStrategy: event.data };

        case 'resume_draft':
          return { ...prev, resumeDraft: event.data };

        case 'verification_complete':
          return prev; // Scores come through assembly_complete

        case 'assembly_complete':
          return { ...prev, assembly: event.data };

        case 'pipeline_complete':
          return { ...prev, stage: 'complete' as V2Stage };

        case 'pipeline_error':
          return { ...prev, error: event.error };

        default:
          return prev;
      }
    });

    if (event.type === 'pipeline_complete') {
      setIsComplete(true);
    }
  }, []);

  const connectSSE = useCallback(async (sessionId: string) => {
    if (!accessToken) return;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`${API_BASE}/pipeline/${sessionId}/stream`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        setData(prev => ({ ...prev, error: `Stream connection failed: ${response.status}` }));
        return;
      }

      setIsConnected(true);

      for await (const msg of parseSSEStream(response.body)) {
        if (controller.signal.aborted) break;

        if (msg.event === 'heartbeat') continue;
        if (msg.event !== 'pipeline' || !msg.data) continue;

        try {
          const parsed = JSON.parse(msg.data) as V2SSEEvent;
          handleEvent(parsed);
        } catch {
          // Skip malformed events
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setData(prev => ({ ...prev, error: err instanceof Error ? err.message : 'Connection lost' }));
    } finally {
      setIsConnected(false);
    }
  }, [accessToken, handleEvent]);

  const start = useCallback(async (
    resumeText: string,
    jobDescription: string,
    options?: {
      userContext?: string;
      gapCoachingResponses?: GapCoachingResponse[];
      preScores?: PreScores | null;
    },
  ) => {
    if (!accessToken) return;
    // isStarting guard: covers the brief window between user submit and SSE connection.
    // Once SSE connects, isStarting becomes false and the UI switches to streaming display,
    // making duplicate submissions impossible through the normal UX flow.
    if (isStarting) return;

    // Reset state
    setData(INITIAL_DATA);
    setIsComplete(false);
    setIsStarting(true);
    abortRef.current?.abort();

    try {
      const response = await fetch(`${API_BASE}/pipeline/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          resume_text: resumeText,
          job_description: jobDescription,
          user_context: options?.userContext,
          gap_coaching_responses: options?.gapCoachingResponses,
          pre_scores: options?.preScores ?? undefined,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const msg = (body as { error?: string }).error ?? `Failed to start pipeline: ${response.status}`;
        setData(prev => ({ ...prev, error: msg }));
        return;
      }

      const result = (await response.json()) as { session_id: string };
      setData(prev => ({ ...prev, sessionId: result.session_id }));

      // Connect to SSE stream
      void connectSSE(result.session_id);
    } catch (err) {
      setData(prev => ({ ...prev, error: err instanceof Error ? err.message : 'Failed to start' }));
    } finally {
      setIsStarting(false);
    }
  }, [accessToken, isStarting, connectSSE]);

  const integrateKeyword = useCallback(async (keyword: string, resumeText: string, jobDescription: string): Promise<{
    original_text: string;
    revised_text: string;
    section: string;
    explanation: string;
  } | null> => {
    if (!accessToken || !data.sessionId) return null;

    try {
      const response = await fetch(`${API_BASE}/pipeline/${data.sessionId}/integrate-keyword`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ keyword, resume_text: resumeText, job_description: jobDescription }),
      });

      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }, [accessToken, data.sessionId]);

  const loadSession = useCallback(async (sessionId: string): Promise<{
    resume_text: string;
    job_description: string;
    draftState: V2PersistedDraftState | null;
  } | false> => {
    if (!accessToken) return false;

    try {
      const response = await fetch(`${API_BASE}/pipeline/${sessionId}/result`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) return false;

      const body = await response.json() as {
        version?: string;
        pipeline_data?: {
          jobIntelligence: V2PipelineData['jobIntelligence'];
          candidateIntelligence: V2PipelineData['candidateIntelligence'];
          benchmarkCandidate: V2PipelineData['benchmarkCandidate'];
          gapAnalysis: V2PipelineData['gapAnalysis'];
          preScores: V2PipelineData['preScores'];
          narrativeStrategy: V2PipelineData['narrativeStrategy'];
          resumeDraft: V2PipelineData['resumeDraft'];
          assembly: V2PipelineData['assembly'];
        };
        draft_state?: V2PersistedDraftState | null;
        inputs?: { resume_text: string; job_description: string };
      };

      if (body.version !== 'v2' || !body.pipeline_data) return false;

      const pd = body.pipeline_data;
      setData({
        sessionId,
        stage: 'complete',
        jobIntelligence: pd.jobIntelligence ?? null,
        candidateIntelligence: pd.candidateIntelligence ?? null,
        benchmarkCandidate: pd.benchmarkCandidate ?? null,
        gapAnalysis: pd.gapAnalysis ?? null,
        gapCoachingCards: null, // Not persisted — coaching is a live interaction
        preScores: pd.preScores ?? null,
        narrativeStrategy: pd.narrativeStrategy ?? null,
        resumeDraft: pd.resumeDraft ?? null,
        assembly: pd.assembly ?? null,
        error: null,
        stageMessages: [],
      });
      setIsComplete(true);
      setIsConnected(false);

      return {
        ...(body.inputs ?? { resume_text: '', job_description: '' }),
        draftState: body.draft_state ?? null,
      };
    } catch {
      return false;
    }
  }, [accessToken]);

  const saveDraftState = useCallback(async (
    sessionId: string,
    draftState: V2PersistedDraftState | null,
  ): Promise<boolean> => {
    if (!accessToken) return false;

    try {
      const response = await fetch(`${API_BASE}/pipeline/${sessionId}/draft-state`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ draft_state: draftState }),
      });

      return response.ok;
    } catch {
      return false;
    }
  }, [accessToken]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setData(INITIAL_DATA);
    setIsConnected(false);
    setIsComplete(false);
    setIsStarting(false);
  }, []);

  return {
    data,
    isConnected,
    isComplete,
    isStarting,
    error: data.error,
    start,
    reset,
    loadSession,
    saveDraftState,
    integrateKeyword,
  };
}
