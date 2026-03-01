/**
 * useAgent.ts — Thin orchestrator
 *
 * Composes the five focused hooks:
 *   1. usePipelineStateManager  — all useState + useRef declarations
 *   2. useSSEDataValidation      — pure validation utilities (no hook)
 *   3. useSSEEventHandlers       — individual SSE event handler functions
 *   4. useSSEConnection          — SSE fetch connection + backoff reconnect
 *   5. useStaleDetection         — 120s stall detector
 *
 * Public API is identical to the original monolithic useAgent.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { FinalResume } from '@/types/resume';
import type { PanelData, PanelType } from '@/types/panels';
import type {
  PipelineActivitySnapshot,
  PipelineStage,
} from '@/types/session';
import { API_BASE } from '@/lib/api';

import { usePipelineStateManager } from '@/hooks/usePipelineStateManager';
import { createSSEEventRouter } from '@/hooks/useSSEEventHandlers';
import type { MarkPipelineProgressFn } from '@/hooks/useSSEEventHandlers';
import { useSSEConnection } from '@/hooks/useSSEConnection';
import { useStaleDetection } from '@/hooks/useStaleDetection';

export function useAgent(sessionId: string | null, accessToken: string | null) {
  const state = usePipelineStateManager(accessToken);
  const hasAccessToken = Boolean(accessToken);

  // Keep accessTokenRef in sync
  useEffect(() => {
    state.accessTokenRef.current = accessToken;
  }, [accessToken, state]);

  // Keep isProcessingRef in sync
  useEffect(() => {
    state.isProcessingRef.current = state.isProcessing;
  }, [state.isProcessing, state]);

  // ── markPipelineProgress (stable callback) ────────────────────────────────
  const markPipelineProgress = useCallback<MarkPipelineProgressFn>(
    (message, source, options) => {
      const nowIso = new Date().toISOString();
      state.lastProgressTimestampRef.current = Date.now();
      state.staleNoticeActiveRef.current = false;
      state.setLastBackendActivityAt(nowIso);
      state.setStalledSuspected(false);
      state.setPipelineActivityMeta((prev) => ({
        ...prev,
        last_backend_activity_at: nowIso,
        last_progress_at: nowIso,
        current_activity_message:
          typeof message === 'string'
            ? message
            : (prev.current_activity_message ?? null),
        current_activity_source: source,
        stage:
          options?.stage !== undefined ? options.stage : prev.stage,
        stage_started_at:
          options?.stageStartedAt !== undefined
            ? options.stageStartedAt
            : prev.stage_started_at,
        expected_next_action:
          options?.expectedNextAction !== undefined
            ? options.expectedNextAction
            : prev.expected_next_action,
      }));
    },
    // state is a stable object — all setters are memoized inside usePipelineStateManager
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state],
  );

  // ── SSE connection ────────────────────────────────────────────────────────
  // We need a ref to the latest handleSSEEvent to avoid stale closures in
  // the SSE connection loop without re-mounting the connection.
  const handleSSEEventRef = useRef<(eventType: string, rawData: string) => void>(
    () => undefined,
  );

  const { connectSSE, handleDisconnect, flushDeltaBuffer, abortCurrentConnection, reconnectStreamNow } =
    useSSEConnection(
      sessionId,
      state,
      markPipelineProgress,
      // Use a stable wrapper that always calls the latest router version
      useCallback(
        (eventType: string, rawData: string) => {
          handleSSEEventRef.current(eventType, rawData);
        },
        [],
      ),
    );

  // Rebuild the SSE event router whenever its dependencies change
  useEffect(() => {
    handleSSEEventRef.current = createSSEEventRouter(
      state,
      markPipelineProgress,
      flushDeltaBuffer,
      abortCurrentConnection,
    );
  }, [state, markPipelineProgress, flushDeltaBuffer, abortCurrentConnection]);

  // ── Session reset effect ──────────────────────────────────────────────────
  useEffect(() => {
    state.resetState(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ── Mount the SSE connection effect ───────────────────────────────────────
  useEffect(() => {
    if (!sessionId || !hasAccessToken || !state.accessTokenRef.current) return;

    state.mountedRef.current = true;
    connectSSE();

    return () => {
      state.mountedRef.current = false;
      // Clean up fetch connection
      if (state.abortControllerRef.current) {
        state.abortControllerRef.current.abort();
        state.abortControllerRef.current = null;
      }
      // Clean up reconnect timer
      if (state.reconnectTimerRef.current) {
        clearTimeout(state.reconnectTimerRef.current);
        state.reconnectTimerRef.current = null;
      }
      // Clean up animation frame
      if (state.rafIdRef.current !== null) {
        cancelAnimationFrame(state.rafIdRef.current);
        state.rafIdRef.current = null;
      }
      // Clean up tool removal timers
      for (const timer of state.toolCleanupTimersRef.current) {
        clearTimeout(timer);
      }
      state.toolCleanupTimersRef.current.clear();
      state.reconnectAttemptsRef.current = 0;
    };
  // connectSSE changes identity when sessionId/state changes which is the correct
  // behaviour — we want to remount the connection on those changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, hasAccessToken, connectSSE]);

  // ── Stale detection ───────────────────────────────────────────────────────
  useStaleDetection(state);

  // ── Fallback status poll ──────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId || !hasAccessToken || !state.accessTokenRef.current || state.sessionComplete) {
      return;
    }
    let cancelled = false;

    const restoreCompletionFromSession = async () => {
      const token = state.accessTokenRef.current;
      if (!token) return;
      const sessionRes = await fetch(
        `${API_BASE}/sessions/${encodeURIComponent(sessionId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!sessionRes.ok) return;
      const payload = (await sessionRes.json().catch(() => null)) as {
        session?: {
          last_panel_type?: string | null;
          last_panel_data?: { resume?: FinalResume } | null;
        };
      } | null;
      if (cancelled) return;
      const lastPanelType = payload?.session?.last_panel_type;
      const lastPanelData = payload?.session?.last_panel_data;
      if (lastPanelType !== 'completion') return;

      const restoredResume = lastPanelData?.resume;
      if (restoredResume) {
        state.setResume(restoredResume);
        state.setPanelType('completion');
        state.setPanelData({
          type: 'completion',
          ats_score: restoredResume.ats_score,
        } as PanelData);
      }
      state.setSessionComplete(true);
      state.setPipelineStage('complete');
      state.setCurrentPhase('complete');
      state.setAskPrompt(null);
      state.setPhaseGate(null);
      state.setIsPipelineGateActive(false);
      state.setIsProcessing(false);
      state.patchPipelineActivityMeta({
        processing_state: 'complete',
        stage: 'complete',
        current_activity_message:
          'Restored final resume outputs from the completed pipeline run.',
        current_activity_source: 'restore',
        expected_next_action: 'Review the final resume and export options',
      });
    };

    const pollStatus = async () => {
      if (cancelled || state.connected) return;
      try {
        const token = state.accessTokenRef.current;
        if (!token) return;
        const res = await fetch(
          `${API_BASE}/pipeline/status?session_id=${encodeURIComponent(sessionId)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as {
          running?: boolean;
          pending_gate?: string | null;
          stale_pipeline?: boolean;
          pipeline_stage?: string | null;
        } | null;
        if (!data || cancelled) return;
        state.setLastBackendActivityAt(new Date().toISOString());
        state.setPipelineActivityMeta((prev) => ({
          ...prev,
          last_backend_activity_at: new Date().toISOString(),
        }));
        if (data.running) {
          state.setStalledSuspected(false);
        }

        if (data.stale_pipeline && !state.stalePipelineNoticeRef.current) {
          state.stalePipelineNoticeRef.current = true;
          state.setMessages((prev) => [
            ...prev,
            {
              id: state.nextId(),
              role: 'system',
              content:
                'Session state became stale. Restart the pipeline from this session to continue.',
              timestamp: new Date().toISOString(),
            },
          ]);
          state.setIsPipelineGateActive(false);
          state.setPhaseGate(null);
          state.setAskPrompt(null);
          state.setIsProcessing(false);
          state.setPipelineActivityMeta((prev) => ({
            ...prev,
            processing_state: 'idle',
            current_activity_message:
              'Pipeline state became stale. Restart the pipeline from this session to continue.',
            current_activity_source: 'poll',
            expected_next_action: 'Restart and rebuild from the workspace banner',
          }));
          return;
        }

        if (data.running) {
          if (data.pipeline_stage) {
            state.setPipelineStage(data.pipeline_stage as PipelineStage);
            state.setCurrentPhase(data.pipeline_stage);
          }
          state.setIsPipelineGateActive(Boolean(data.pending_gate));
          state.setIsProcessing(!Boolean(data.pending_gate));
          if (!data.pending_gate) {
            state.setAskPrompt(null);
            state.setPhaseGate(null);
          }
          state.setPipelineActivityMeta((prev) => ({
            ...prev,
            processing_state: data.pending_gate ? 'waiting_for_input' : 'reconnecting',
            stage: (data.pipeline_stage as PipelineStage | null) ?? prev.stage,
            current_activity_message: data.pending_gate
              ? 'Polling confirms the pipeline is waiting for your input.'
              : 'Polling confirms the pipeline is still processing while the live stream reconnects.',
            current_activity_source: 'poll',
            expected_next_action: data.pending_gate
              ? 'Complete the active workspace action'
              : 'Wait for the live stream to reconnect or use Reconnect Stream',
          }));
        } else {
          if (data.pipeline_stage) {
            state.setPipelineStage(data.pipeline_stage as PipelineStage);
            state.setCurrentPhase(data.pipeline_stage);
          }
          state.setIsPipelineGateActive(false);
          state.setAskPrompt(null);
          state.setPhaseGate(null);
          state.setIsProcessing(false);
          state.setPipelineActivityMeta((prev) => ({
            ...prev,
            processing_state:
              data.pipeline_stage === 'complete' ? 'complete' : 'idle',
            stage: (data.pipeline_stage as PipelineStage | null) ?? prev.stage,
            current_activity_message:
              data.pipeline_stage === 'complete'
                ? 'Polling confirms the pipeline run is complete.'
                : 'Polling confirms the pipeline is not actively processing.',
            current_activity_source: 'poll',
            expected_next_action:
              data.pipeline_stage === 'complete'
                ? 'Review the final resume and export'
                : null,
          }));
          if (data.pipeline_stage === 'complete' && !state.sessionComplete) {
            await restoreCompletionFromSession();
          }
        }
      } catch {
        // best effort
      }
    };

    const interval = setInterval(() => {
      void pollStatus();
    }, 12_000);
    void pollStatus();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, hasAccessToken, state.connected, state.sessionComplete]);

  // ── Derived actions ───────────────────────────────────────────────────────

  const addUserMessage = useCallback(
    (content: string) => {
      state.setMessages((prev) => [
        ...prev,
        {
          id: state.nextId(),
          role: 'user',
          content,
          timestamp: new Date().toISOString(),
        },
      ]);
      state.setTools([]);
      state.setAskPrompt(null);
      state.setPhaseGate(null);
      state.setIsProcessing(true);
    },
    [state],
  );

  const dismissSuggestion = useCallback(
    (suggestionId: string) => {
      state.dismissedSuggestionIdsRef.current.add(suggestionId);
      if (state.sectionContextRef.current?.context.suggestions) {
        const filtered = state.sectionContextRef.current.context.suggestions.filter(
          (s) => s.id !== suggestionId,
        );
        state.sectionContextRef.current = {
          ...state.sectionContextRef.current,
          context: {
            ...state.sectionContextRef.current.context,
            suggestions: filtered.length > 0 ? filtered : undefined,
          },
        };
      }
    },
    [state],
  );

  // ── Derived pipelineActivity ──────────────────────────────────────────────
  const pipelineActivity: PipelineActivitySnapshot = {
    ...state.pipelineActivityMeta,
    processing_state: state.error
      ? 'error'
      : state.sessionComplete
        ? 'complete'
        : state.stalledSuspected
          ? 'stalled_suspected'
          : !state.connected && (state.isProcessing || state.isPipelineGateActive)
            ? 'reconnecting'
            : state.isPipelineGateActive
              ? 'waiting_for_input'
              : state.isProcessing
                ? 'processing'
                : 'idle',
    stage: state.pipelineStage ?? state.pipelineActivityMeta.stage ?? null,
    last_backend_activity_at:
      state.lastBackendActivityAt ??
      state.pipelineActivityMeta.last_backend_activity_at ??
      null,
  };

  // ── Public API (identical to original useAgent return type) ───────────────
  return {
    messages: state.messages,
    streamingText: state.streamingText,
    tools: state.tools,
    askPrompt: state.askPrompt,
    phaseGate: state.phaseGate,
    currentPhase: state.currentPhase,
    isProcessing: state.isProcessing,
    setIsProcessing: state.setIsProcessing,
    resume: state.resume,
    connected: state.connected,
    lastBackendActivityAt: state.lastBackendActivityAt,
    stalledSuspected: state.stalledSuspected,
    sessionComplete: state.sessionComplete,
    error: state.error,
    panelType: state.panelType as PanelType | null,
    panelData: state.panelData,
    addUserMessage,
    pipelineStage: state.pipelineStage,
    positioningQuestion: state.positioningQuestion,
    positioningProfileFound: state.positioningProfileFound,
    blueprintReady: state.blueprintReady,
    sectionDraft: state.sectionDraft,
    qualityScores: state.qualityScores,
    draftReadiness: state.draftReadiness,
    workflowReplan: state.workflowReplan,
    pipelineActivity,
    isPipelineGateActive: state.isPipelineGateActive,
    setIsPipelineGateActive: state.setIsPipelineGateActive,
    dismissSuggestion,
    approvedSections: state.approvedSections,
    reconnectStreamNow,
  };
}
