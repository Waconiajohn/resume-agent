/**
 * useTodayTimeline — Phase 5 of pursuit timeline.
 *
 * Single-fetch hook for the cross-pursuit Today view. Hits the bulk endpoint
 * `/api/job-applications/timeline/all`, then runs the Today aggregator on
 * the returned payloads. The hook composes the rule engine with the
 * cross-pursuit signal aggregator — same source-of-truth as the per-pursuit
 * overview and the WhatsNextCTABar.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { TimelinePayload } from '@/lib/timeline/rules';
import {
  aggregateTodaySignals,
  type TodayAggregation,
} from '@/lib/timeline/today';

export interface UseTodayTimelineResult {
  pursuits: TimelinePayload[];
  aggregation: TodayAggregation;
  loading: boolean;
  error: string | null;
  /** Total count of items across all tiers. Used for empty-state detection. */
  totalCount: number;
  refresh: () => Promise<void>;
}

interface UseTodayTimelineOptions {
  skip?: boolean;
}

export function useTodayTimeline(
  options: UseTodayTimelineOptions = {},
): UseTodayTimelineResult {
  const { skip } = options;
  const [pursuits, setPursuits] = useState<TimelinePayload[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchAll = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      if (mountedRef.current) setError('Not authenticated');
      return;
    }

    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }

    try {
      const res = await fetch(`${API_BASE}/job-applications/timeline/all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (mountedRef.current) {
          setError(`Failed to load Today (${res.status})`);
          setPursuits([]);
        }
        return;
      }
      const body = (await res.json()) as { pursuits?: TimelinePayload[] };
      if (mountedRef.current) {
        setPursuits(Array.isArray(body.pursuits) ? body.pursuits : []);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load Today');
        setPursuits([]);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (skip) return;
    void fetchAll();
  }, [skip, fetchAll]);

  const aggregation = useMemo(() => aggregateTodaySignals(pursuits), [pursuits]);

  const totalCount = aggregation.tierA.length + aggregation.tierB.length + aggregation.tierC.length;

  return {
    pursuits,
    aggregation,
    loading,
    error,
    totalCount,
    refresh: fetchAll,
  };
}
