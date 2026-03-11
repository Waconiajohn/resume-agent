import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface UsePriorResultOptions {
  /** Product API slug (e.g., 'executive-bio', 'case-study') */
  productSlug: string;
  /** Skip loading (e.g., when pipeline is already running) */
  skip?: boolean;
}

interface UsePriorResultReturn<T = Record<string, unknown>> {
  priorResult: T | null;
  loading: boolean;
  clearPrior: () => void;
}

export function usePriorResult<T = Record<string, unknown>>({
  productSlug,
  skip = false,
}: UsePriorResultOptions): UsePriorResultReturn<T> {
  const cacheKey = `prior_result_${productSlug}`;
  const [priorResult, setPriorResult] = useState<T | null>(() => {
    try {
      const cached = sessionStorage.getItem(cacheKey);
      return cached ? (JSON.parse(cached) as T) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    if (skip) return;

    // If already cached, don't re-fetch
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return;

    setLoading(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
      const token = session?.access_token ?? '';
      return fetch(`/api/${productSlug}/reports/latest`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    })
      .then((r) => {
        if (r.status === 404) return null; // No prior result — not an error
        if (!r.ok) return null;
        return r.json() as Promise<{ report: T } | null>;
      })
      .then((data) => {
        if (!mounted.current) return;
        const report = (data as { report?: T } | null)?.report ?? null;
        setPriorResult(report);
        if (report) {
          sessionStorage.setItem(cacheKey, JSON.stringify(report));
        }
        setLoading(false);
      })
      .catch(() => {
        if (mounted.current) setLoading(false);
      });

    return () => {
      mounted.current = false;
    };
  }, [productSlug, skip, cacheKey]);

  const clearPrior = useCallback(() => {
    sessionStorage.removeItem(cacheKey);
    setPriorResult(null);
  }, [cacheKey]);

  return { priorResult, loading, clearPrior };
}
