import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

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
  const cacheKey = `prior_result_${productSlug}_${sessionId ?? 'latest'}`;
  const [priorResult, setPriorResult] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    const clearCachedResult = () => {
      sessionStorage.removeItem(cacheKey);
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

    let cached: T | null = null;
    try {
      const cachedValue = sessionStorage.getItem(cacheKey);
      cached = cachedValue ? (JSON.parse(cachedValue) as T) : null;
    } catch {
      cached = null;
    }

    setPriorResult(cached);
    if (cached) {
      setLoading(false);
      void supabase.auth.getSession().then(({ data: { session } }) => {
        if (!mounted.current) return;
        if (!session?.access_token) {
          clearCachedResult();
        }
      });
      return () => {
        mounted.current = false;
      };
    }

    const endpoint = sessionId
      ? `/api/${productSlug}/reports/session/${sessionId}`
      : `/api/${productSlug}/reports/latest`;

    setLoading(true);
    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token ?? '';
        if (!token) {
          if (!mounted.current) return;
          clearCachedResult();
          setLoading(false);
          return;
        }

        const response = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!mounted.current) return;
        if (response.status === 404 || !response.ok) {
          clearCachedResult();
          setLoading(false);
          return;
        }

        const json = await response.json() as { report?: T; feature_disabled?: boolean } | null;
        if (json && 'feature_disabled' in json) {
          clearCachedResult();
          setLoading(false);
          return;
        }

        const report = (json as { report?: T } | null)?.report ?? null;
        setPriorResult(report);
        if (report) {
          sessionStorage.setItem(cacheKey, JSON.stringify(report));
        } else {
          sessionStorage.removeItem(cacheKey);
        }
        setLoading(false);
      } catch {
        if (mounted.current) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted.current = false;
    };
  }, [cacheKey, productSlug, sessionId, skip]);

  const clearPrior = useCallback(() => {
    sessionStorage.removeItem(cacheKey);
    setPriorResult(null);
  }, [cacheKey]);

  return { priorResult, loading, clearPrior };
}
