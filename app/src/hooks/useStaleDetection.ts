/**
 * useStaleDetection.ts
 *
 * Watches for processing stalls: fires every 10 seconds while mounted,
 * checks whether no confirmed backend progress has arrived for 120 seconds,
 * and sets stalledSuspected + emits a system message if so.
 */

import { useEffect } from 'react';
import type { PipelineStateManager } from '@/hooks/usePipelineStateManager';

const STALE_THRESHOLD_MS = 120_000; // 2 minutes — first warning at 2 min
const CHECK_INTERVAL_MS = 10_000;   // 10 seconds

/**
 * Must be called inside the same useEffect that mounts the SSE connection
 * (so the interval is cleaned up together with the connection), OR independently
 * — the hook stores its interval ID in state.staleCheckIntervalRef and cleans
 * up on unmount.
 *
 * The interval is started when this hook mounts and cleared on unmount.
 */
export function useStaleDetection(state: PipelineStateManager): void {
  useEffect(() => {
    state.staleCheckIntervalRef.current = setInterval(() => {
      if (!state.mountedRef.current) return;
      if (
        state.isProcessingRef.current &&
        Date.now() - state.lastProgressTimestampRef.current > STALE_THRESHOLD_MS
      ) {
        if (!state.staleNoticeActiveRef.current) {
          state.staleNoticeActiveRef.current = true;
          state.setStalledSuspected(true);
          state.setPipelineActivityMeta((prev) => ({
            ...prev,
            current_activity_message:
              'No confirmed backend progress was detected for a while. The pipeline may be stalled.',
            current_activity_source: 'system',
            expected_next_action:
              'Use Reconnect or Refresh State to confirm pipeline status',
          }));
          state.setMessages((prev) => [
            ...prev,
            {
              id: state.nextId(),
              role: 'system',
              content:
                'Processing looks stalled (no confirmed backend updates for a while). Try reconnecting or refreshing the page. If the pipeline is waiting for input, check the center workspace for a questionnaire or review step.',
              timestamp: new Date().toISOString(),
            },
          ]);
        }
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      if (state.staleCheckIntervalRef.current) {
        clearInterval(state.staleCheckIntervalRef.current);
        state.staleCheckIntervalRef.current = null;
      }
    };
    // state is a stable object from usePipelineStateManager — intentionally
    // excluded from deps to avoid spurious re-subscriptions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
