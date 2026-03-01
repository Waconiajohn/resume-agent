/**
 * useSSEConnection.ts
 *
 * Manages the SSE fetch connection lifecycle: connect, disconnect, reconnect
 * with exponential backoff, and delta buffer flushing.
 */

import { useCallback } from 'react';
import { parseSSEStream } from '@/lib/sse-parser';
import { API_BASE } from '@/lib/api';
import type { PipelineStateManager } from '@/hooks/usePipelineStateManager';
import type { MarkPipelineProgressFn } from '@/hooks/useSSEEventHandlers';

const MAX_RECONNECT_ATTEMPTS = 5;

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns connect / disconnect helpers and a flush-delta-buffer callback.
 * The caller is responsible for invoking connectSSE() inside a useEffect.
 */
export function useSSEConnection(
  sessionId: string | null,
  state: PipelineStateManager,
  markPipelineProgress: MarkPipelineProgressFn,
  handleSSEEvent: (eventType: string, rawData: string) => void,
) {
  // Flush delta buffer to state (rAF-based text streaming)
  const flushDeltaBuffer = useCallback(() => {
    if (state.deltaBufferRef.current) {
      const buffered = state.deltaBufferRef.current;
      state.deltaBufferRef.current = '';
      state.setStreamingText((prev) => prev + buffered);
    }
    state.rafIdRef.current = null;
  }, [state]);

  // Abort the current connection (used by complete handler and reconnect)
  const abortCurrentConnection = useCallback(() => {
    if (state.abortControllerRef.current) {
      state.abortControllerRef.current.abort();
      state.abortControllerRef.current = null;
    }
    state.setConnected(false);
  }, [state]);

  // Reconnect with exponential backoff
  const handleDisconnect = useCallback(() => {
    state.setConnected(false);
    // Clear in-flight state before reconnecting to avoid stale UI
    state.setStreamingText('');
    state.setTools([]);
    state.setAskPrompt(null);
    state.patchPipelineActivityMeta({
      processing_state: state.isProcessingRef.current ? 'reconnecting' : 'idle',
      current_activity_message: state.isProcessingRef.current
        ? 'Live connection dropped. Reconnecting to resume workflow stream...'
        : 'Live connection disconnected. Reconnecting...',
      current_activity_source: 'system',
      expected_next_action: state.isProcessingRef.current
        ? 'Reconnect to resume live stage updates'
        : null,
    });

    if (!state.mountedRef.current) return;

    if (state.reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
      const delay = Math.pow(2, state.reconnectAttemptsRef.current) * 1000; // 1s, 2s, 4s, 8s, 16s
      state.reconnectAttemptsRef.current += 1;
      state.reconnectTimerRef.current = setTimeout(() => {
        if (state.mountedRef.current) {
          state.connectSSERef.current?.();
        }
      }, delay);
    } else {
      state.setError('Connection lost');
      state.patchPipelineActivityMeta({
        processing_state: 'error',
        current_activity_message:
          'Live workflow connection could not be restored after multiple retries.',
        current_activity_source: 'system',
        expected_next_action:
          'Use Reconnect or Refresh State to confirm the pipeline status',
      });
    }
  }, [state]);

  // Main connect function (assigned to connectSSERef for use in handleDisconnect)
  const connectSSE = useCallback(() => {
    // Update ref so handleDisconnect always uses the latest version
    state.connectSSERef.current = connectSSE;

    // Abort any existing connection
    if (state.abortControllerRef.current) {
      state.abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    state.abortControllerRef.current = controller;

    state.patchPipelineActivityMeta({
      processing_state: 'reconnecting',
      current_activity_message: 'Connecting to the live workflow stream...',
      current_activity_source: 'system',
      expected_next_action: 'Receive backend stage updates',
    });

    const token = state.accessTokenRef.current;
    if (!token) {
      state.setError('Not authenticated');
      return;
    }

    fetch(`${API_BASE}/sessions/${sessionId}/sse`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          console.error(
            '[useAgent] SSE fetch failed:',
            response.status,
            response.statusText,
          );
          state.setError(`Connection failed (${response.status})`);
          controller.abort();
          handleDisconnect();
          return;
        }

        if (!response.body) {
          console.error('[useAgent] SSE response has no body');
          state.setError('Connection failed (no response body)');
          controller.abort();
          handleDisconnect();
          return;
        }

        try {
          for await (const msg of parseSSEStream(response.body)) {
            if (controller.signal.aborted) break;
            const backendEventAt = new Date().toISOString();
            state.setLastBackendActivityAt(backendEventAt);
            state.setStalledSuspected(false);
            state.setPipelineActivityMeta((prev) => ({
              ...prev,
              last_backend_activity_at: backendEventAt,
              ...(msg.event === 'heartbeat'
                ? { last_heartbeat_at: backendEventAt }
                : {}),
            }));

            handleSSEEvent(msg.event, msg.data);
          }
        } catch (err) {
          // AbortError is expected when we intentionally close the connection
          if (err instanceof DOMException && err.name === 'AbortError') {
            return;
          }
          console.error('[useAgent] SSE stream error:', err);
        }

        // Stream ended (server closed connection or network drop) — attempt reconnect
        if (!controller.signal.aborted && state.mountedRef.current) {
          handleDisconnect();
        }
      })
      .catch((err) => {
        // AbortError is expected during cleanup
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        console.error('[useAgent] SSE fetch error:', err);
        handleDisconnect();
      });
  }, [sessionId, state, handleSSEEvent, handleDisconnect]);

  // Manual reconnect (clears backoff state and reconnects immediately)
  const reconnectStreamNow = useCallback(() => {
    if (!state.mountedRef.current) return;
    if (state.reconnectTimerRef.current) {
      clearTimeout(state.reconnectTimerRef.current);
      state.reconnectTimerRef.current = null;
    }
    state.reconnectAttemptsRef.current = 0;
    state.staleNoticeActiveRef.current = false;
    state.stalePipelineNoticeRef.current = false;
    state.setStalledSuspected(false);
    state.setError(null);
    state.setConnected(false);
    state.patchPipelineActivityMeta({
      current_activity_message: 'Reconnecting to the live workflow stream...',
      current_activity_source: 'system',
      expected_next_action: 'Receive live backend updates',
    });
    if (state.abortControllerRef.current) {
      state.abortControllerRef.current.abort();
      state.abortControllerRef.current = null;
    }
    state.connectSSERef.current?.();
  }, [state]);

  return {
    connectSSE,
    handleDisconnect,
    flushDeltaBuffer,
    abortCurrentConnection,
    reconnectStreamNow,
  };
}
