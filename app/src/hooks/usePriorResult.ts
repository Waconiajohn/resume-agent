import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  buildAuthScopedSessionStorageKey,
  readJsonFromSessionStorage,
  removeSessionStorageKey,
  writeJsonToSessionStorage,
} from '@/lib/auth-scoped-storage';

interface UsePriorResultOptions {
  /** Product API slug (e.g., 'executive-bio', 'case-study') */
  productSlug: string;
  /** Skip loading (e.g., when pipeline is already running) */
  skip?: boolean;
  /** Fetch an exact saved result for a specific product session */
  sessionId?: string;
}

interface UsePriorResultReturn<T = Record<string, unknown>> {
  priorResult: T | null;
  loading: boolean;
  clearPrior: () => void;
}

export function usePriorResult<T = Record<string, unknown>>({
  productSlug,
  skip = false,
  sessionId,
}: UsePriorResultOptions): UsePriorResultReturn<T> {
  const [priorResult, setPriorResult] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);
  const activeCacheKeyRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    mounted.current = true;

    const clearCachedResult = (cacheKey: string | null) => {
      if (cacheKey) removeSessionStorageKey(cacheKey);
      if (mounted.current) {
        setPriorResult(null);
      }
    };

    if (skip) {
      setLoading(false);
      return () => {
        mounted.current = false;
      };
    }

    const endpoint = sessionId
      ? `/api/${productSlug}/reports/session/${sessionId}`
      : `/api/${productSlug}/reports/latest`;

    const loadPriorResult = async (sessionOverride?: {
      access_token?: string | null;
      user?: { id?: string | null } | null;
    } | null) => {
      const requestId = ++requestIdRef.current;
      try {
        const session = sessionOverride === undefined
          ? (await supabase.auth.getSession()).data.session
          : sessionOverride;
        const token = session?.access_token ?? '';
        const userId = session?.user?.id ?? null;
        const cacheKey = buildAuthScopedSessionStorageKey(`prior_result:${productSlug}`, userId, sessionId ?? 'latest');
        activeCacheKeyRef.current = cacheKey;
        const cached = readJsonFromSessionStorage<T>(cacheKey);

        setPriorResult(cached);
        setLoading(Boolean(token) && !cached);

        if (!token) {
          if (!mounted.current) return;
          clearCachedResult(cacheKey);
          setLoading(false);
          return;
        }

        if (cached) {
          setLoading(false);
          return;
        }

        const response = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!mounted.current || requestId !== requestIdRef.current) return;
        if (response.status === 404 || !response.ok) {
          clearCachedResult(cacheKey);
          setLoading(false);
          return;
        }

        const json = await response.json() as { report?: T; feature_disabled?: boolean } | null;
        if (json && 'feature_disabled' in json) {
          clearCachedResult(cacheKey);
          setLoading(false);
          return;
        }

        const report = (json as { report?: T } | null)?.report ?? null;
        setPriorResult(report);
        if (report) {
          writeJsonToSessionStorage(cacheKey, report);
        } else {
          removeSessionStorageKey(cacheKey);
        }
        setLoading(false);
      } catch {
        if (mounted.current) {
          setLoading(false);
        }
      }
    };

    void loadPriorResult();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadPriorResult(session);
    });

    return () => {
      mounted.current = false;
      subscription.unsubscribe();
    };
  }, [productSlug, sessionId, skip]);

  const clearPrior = useCallback(() => {
    removeSessionStorageKey(activeCacheKeyRef.current ?? '');
    setPriorResult(null);
  }, []);

  return { priorResult, loading, clearPrior };
}
