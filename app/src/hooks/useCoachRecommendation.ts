/**
 * useCoachRecommendation — Lightweight hook for the coach's deterministic recommendation.
 *
 * Calls GET /api/coach/recommend (no LLM cost) and caches in sessionStorage.
 * Used by the workspace coach surfaces and home guidance copy.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import {
  buildAuthScopedSessionStorageKey,
  readJsonFromSessionStorage,
  removeSessionStorageKey,
  removeSessionStorageKeysWithPrefix,
  writeJsonToSessionStorage,
} from '@/lib/auth-scoped-storage';

const CACHE_NAMESPACE = 'coach_recommendation';

export interface CoachRecommendation {
  action: string;
  product: string | null;
  room: string | null;
  urgency: 'immediate' | 'soon' | 'when_ready';
  phase: string;
  phase_label: string;
  rationale: string;
}

interface UseCoachRecommendationResult {
  recommendation: CoachRecommendation | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function buildCacheKey(userId: string | null | undefined) {
  return buildAuthScopedSessionStorageKey(CACHE_NAMESPACE, userId);
}

function loadCached(userId: string | null | undefined): CoachRecommendation | null {
  return readJsonFromSessionStorage<CoachRecommendation>(buildCacheKey(userId));
}

function saveCache(userId: string | null | undefined, rec: CoachRecommendation) {
  writeJsonToSessionStorage(buildCacheKey(userId), rec);
}

export function clearCoachRecommendationCache() {
  removeSessionStorageKeysWithPrefix(CACHE_NAMESPACE);
}

export function useCoachRecommendation(): UseCoachRecommendationResult {
  const [recommendation, setRecommendation] = useState<CoachRecommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const clearRecommendationState = useCallback((userId: string | null | undefined) => {
    removeSessionStorageKey(buildCacheKey(userId));
    if (mountedRef.current) {
      setLoading(false);
      setRecommendation(null);
      setError(null);
    }
  }, []);

  const fetchRecommendation = useCallback(async (options?: {
    session?: { access_token?: string | null; user?: { id?: string | null } | null } | null;
    forceRefresh?: boolean;
  }) => {
    const requestId = ++requestIdRef.current;
    const session = options?.session === undefined
      ? (await supabase.auth.getSession()).data.session
      : options.session;
    const token = session?.access_token;
    const userId = session?.user?.id ?? null;
    const cacheKey = buildCacheKey(userId);
    const cached = options?.forceRefresh ? null : loadCached(userId);

    if (mountedRef.current) {
      setRecommendation(cached);
      setLoading(Boolean(token) && !cached);
      setError(null);
    }

    if (!token) {
      clearRecommendationState(userId);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/coach/recommend`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!mountedRef.current || requestId !== requestIdRef.current) return;

      if (!res.ok) {
        // Feature flag off returns 404 — graceful fallback
        if (res.status === 404) {
          clearRecommendationState(userId);
          return;
        }
        throw new Error(`Recommend failed (${res.status})`);
      }

      const data = await res.json() as Record<string, unknown>;
      if ('feature_disabled' in data) {
        clearRecommendationState(userId);
        return;
      }
      writeJsonToSessionStorage(cacheKey, data);
      if (mountedRef.current) {
        setRecommendation(data as unknown as CoachRecommendation);
        setLoading(false);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load recommendation');
        setLoading(false);
      }
    }
  }, [clearRecommendationState]);

  useEffect(() => {
    void fetchRecommendation();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void fetchRecommendation({ session });
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [fetchRecommendation]);

  const refresh = useCallback(() => {
    void fetchRecommendation({ forceRefresh: true });
  }, [fetchRecommendation]);

  return { recommendation, loading, error, refresh };
}
