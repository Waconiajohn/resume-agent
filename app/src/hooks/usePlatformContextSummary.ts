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
import {
  buildAuthScopedSessionStorageKey,
  readJsonFromSessionStorage,
  removeSessionStorageKey,
  writeJsonToSessionStorage,
} from '@/lib/auth-scoped-storage';

export interface ContextSummaryItem {
  context_type: string;
  source_product: string;
  updated_at: string;
}

const CACHE_NAMESPACE = 'platform_context_summary';

function buildCacheKey(userId: string | null | undefined) {
  return buildAuthScopedSessionStorageKey(CACHE_NAMESPACE, userId);
}

export function usePlatformContextSummary() {
  const [items, setItems] = useState<ContextSummaryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;

    const loadSummary = async (sessionOverride?: {
      access_token?: string | null;
      user?: { id?: string | null } | null;
    } | null) => {
      const requestId = ++requestIdRef.current;
      try {
        const session = sessionOverride === undefined
          ? (await supabase.auth.getSession()).data.session
          : sessionOverride;
        const token = session?.access_token;
        const userId = session?.user?.id ?? null;
        const cacheKey = buildCacheKey(userId);
        const cached = readJsonFromSessionStorage<ContextSummaryItem[]>(cacheKey) ?? [];

        if (mounted.current && !cancelled) {
          setItems(cached);
          setLoading(Boolean(token) && cached.length === 0);
        }

        if (!token || cancelled) {
          removeSessionStorageKey(cacheKey);
          if (mounted.current && !cancelled) {
            setItems([]);
            setLoading(false);
          }
          return;
        }

        const res = await fetch('/api/platform-context/summary', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok || cancelled || requestId !== requestIdRef.current) {
          if (mounted.current && !cancelled) setLoading(false);
          return;
        }

        const data = (await res.json()) as { types?: ContextSummaryItem[]; feature_disabled?: boolean };
        if (data.feature_disabled) {
          removeSessionStorageKey(cacheKey);
          if (mounted.current && !cancelled) {
            setItems([]);
            setLoading(false);
          }
          return;
        }
        const types = data?.types ?? [];

        if (!mounted.current || cancelled || requestId !== requestIdRef.current) return;
        setItems(types);
        writeJsonToSessionStorage(cacheKey, types);
      } catch {
        // Best-effort — badge simply won't appear if the fetch fails
      } finally {
        if (mounted.current && !cancelled) setLoading(false);
      }
    };

    void loadSummary();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadSummary(session);
    });

    return () => {
      cancelled = true;
      mounted.current = false;
      subscription.unsubscribe();
    };
  }, []);

  return { items, loading };
}
