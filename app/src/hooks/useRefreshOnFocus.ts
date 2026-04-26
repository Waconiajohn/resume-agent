/**
 * useRefreshOnFocus — invokes a callback when the tab regains focus.
 *
 * Used by Settings cards (SecurityCard, SessionsCard, ActivityLogCard)
 * so a change made in another tab — enrolling MFA, revoking a session,
 * a new sign-in — surfaces here when the user comes back, instead of
 * the "stale until manual refresh" experience that the Sprint B audit
 * called out.
 *
 * Throttled by `minIntervalMs` (default 30s) so a user flipping tabs
 * rapidly doesn't generate a refetch storm.
 */

import { useEffect, useRef } from 'react';

export function useRefreshOnFocus(
  refresh: () => void | Promise<void>,
  minIntervalMs: number = 30_000,
): void {
  const lastRunRef = useRef<number>(0);
  // Keep the latest refresh in a ref so the listener doesn't have to
  // re-bind every render.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastRunRef.current < minIntervalMs) return;
      lastRunRef.current = now;
      void refreshRef.current();
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [minIntervalMs]);
}
