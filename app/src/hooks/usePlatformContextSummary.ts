/**
 * usePlatformContextSummary
 *
 * Fetches the platform context summary for the authenticated user and caches
 * it for the duration of the browser session. This tells the frontend which
 * AI-generated context types exist for the user so rooms can show a badge
 * indicating which context is powering their experience.
 *
 * The result is cached in sessionStorage to avoid redundant network calls as
 * the user navigates between rooms.
 */

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export interface ContextSummaryItem {
  context_type: string;
  source_product: string;
  updated_at: string;
}

const CACHE_KEY = 'platform_context_summary';

export function usePlatformContextSummary() {
  const [items, setItems] = useState<ContextSummaryItem[]>(() => {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      return cached ? (JSON.parse(cached) as ContextSummaryItem[]) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const cached = sessionStorage.getItem(CACHE_KEY);

    let cancelled = false;
    const clearCachedSummary = () => {
      sessionStorage.removeItem(CACHE_KEY);
      if (mounted.current && !cancelled) {
        setItems([]);
      }
    };

    if (!cached) {
      setLoading(true);
    }

    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token || cancelled) {
          clearCachedSummary();
          if (mounted.current && !cancelled) setLoading(false);
          return;
        }

        if (cached) {
          if (mounted.current && !cancelled) setLoading(false);
          return;
        }

        const res = await fetch('/api/platform-context/summary', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok || cancelled) {
          if (mounted.current) setLoading(false);
          return;
        }

        const data = (await res.json()) as { types?: ContextSummaryItem[]; feature_disabled?: boolean };
        if (data.feature_disabled) {
          clearCachedSummary();
          return;
        }
        const types = data?.types ?? [];

        if (!mounted.current || cancelled) return;
        setItems(types);
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(types));
      } catch {
        // Best-effort — badge simply won't appear if the fetch fails
      } finally {
        if (mounted.current && !cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, []);

  return { items, loading };
}
