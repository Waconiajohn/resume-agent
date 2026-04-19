/**
 * useV3Master — fetches the authenticated user's default master resume
 * summary for the v3 intake-form "using your master" card.
 *
 * Null summary → user has no master yet → intake form shows the empty
 * resume textarea. Once the first v3 run completes, the pipeline
 * auto-initializes the master from classify output, so subsequent visits
 * will find a summary here.
 */

import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api';
import type { V3MasterSummary } from './useV3Pipeline';

export interface V3MasterState {
  summary: V3MasterSummary | null;
  loading: boolean;
  error: string | null;
  /** Force a refetch — call after a promote or auto-init. */
  refresh: () => Promise<void>;
}

export function useV3Master(accessToken: string | null): V3MasterState {
  const [summary, setSummary] = useState<V3MasterSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) {
      setSummary(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/v3-pipeline/master`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.status === 404) {
        setSummary(null);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Failed to load master (${res.status})`);
      }
      const data = (await res.json()) as { master: V3MasterSummary | null };
      setSummary(data.master);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  return { summary, loading, error, refresh: load };
}
