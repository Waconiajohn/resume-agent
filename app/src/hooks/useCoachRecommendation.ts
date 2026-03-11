/**
 * useCoachRecommendation — Lightweight hook for the coach's deterministic recommendation.
 *
 * Calls GET /api/coach/recommend (no LLM cost) and caches in sessionStorage.
 * Used by CoachBanner (sidebar) and CoachSpotlight (dashboard) for the nudge.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';

const CACHE_KEY = 'coach_recommendation';

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

function loadCached(): CoachRecommendation | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw) as CoachRecommendation;
  } catch { /* ignore corrupt cache */ }
  return null;
}

function saveCache(rec: CoachRecommendation) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(rec)); } catch { /* ignore */ }
}

export function clearCoachRecommendationCache() {
  try { sessionStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

export function useCoachRecommendation(): UseCoachRecommendationResult {
  const [cached] = useState(loadCached);
  const [recommendation, setRecommendation] = useState<CoachRecommendation | null>(cached);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchRecommendation = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      if (mountedRef.current) {
        setLoading(false);
        setRecommendation(null);
      }
      return;
    }

    if (mountedRef.current) setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/coach/recommend`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        // Feature flag off returns 404 — graceful fallback
        if (res.status === 404) {
          if (mountedRef.current) { setLoading(false); setRecommendation(null); }
          return;
        }
        throw new Error(`Recommend failed (${res.status})`);
      }

      const data = await res.json() as Record<string, unknown>;
      if ('feature_disabled' in data) {
        if (mountedRef.current) { setLoading(false); setRecommendation(null); }
        return;
      }
      saveCache(data as unknown as CoachRecommendation);
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
  }, []);

  // Fetch on mount (if no cache)
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    void fetchRecommendation();
  }, [fetchRecommendation]);

  const refresh = useCallback(() => {
    clearCoachRecommendationCache();
    void fetchRecommendation();
  }, [fetchRecommendation]);

  return { recommendation, loading, error, refresh };
}
