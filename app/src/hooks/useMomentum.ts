import { useState, useCallback, useRef, useEffect } from 'react';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MomentumWin {
  id: string;
  activity_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface MomentumSummary {
  current_streak: number;
  longest_streak: number;
  total_activities: number;
  this_week_activities: number;
  recent_wins: MomentumWin[];
}

export interface CoachingNudge {
  id: string;
  user_id: string;
  trigger_type: string;
  message: string;
  coaching_tone: string;
  dismissed: boolean;
  created_at: string;
}

export interface UseMomentumReturn {
  summary: MomentumSummary | null;
  nudges: CoachingNudge[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  logActivity: (
    activityType: string,
    relatedId?: string,
    metadata?: Record<string, unknown>,
  ) => Promise<void>;
  dismissNudge: (nudgeId: string) => Promise<void>;
  checkStalls: () => Promise<void>;
}

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function getAuthHeader(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token ?? null;
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useMomentum(): UseMomentumReturn {
  const [summary, setSummary] = useState<MomentumSummary | null>(null);
  const [nudges, setNudges] = useState<CoachingNudge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    if (!mountedRef.current) return;
    setLoading(true);
    setError(null);

    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) {
        if (mountedRef.current) {
          setError('Not authenticated');
          setLoading(false);
        }
        return;
      }

      const [summaryRes, nudgesRes] = await Promise.all([
        fetch(`${API_BASE}/momentum/summary`, { headers: authHeader }),
        fetch(`${API_BASE}/momentum/nudges`, { headers: authHeader }),
      ]);

      if (!summaryRes.ok) {
        const body = await summaryRes.text();
        if (mountedRef.current) {
          setError(`Failed to fetch momentum summary (${summaryRes.status}): ${body}`);
          setLoading(false);
        }
        return;
      }

      if (!nudgesRes.ok) {
        const body = await nudgesRes.text();
        if (mountedRef.current) {
          setError(`Failed to fetch nudges (${nudgesRes.status}): ${body}`);
          setLoading(false);
        }
        return;
      }

      const summaryData = (await summaryRes.json()) as MomentumSummary;
      const nudgesJson = (await nudgesRes.json()) as { nudges: CoachingNudge[] };
      const nudgesData = nudgesJson.nudges ?? [];

      if (mountedRef.current) {
        setSummary(summaryData);
        setNudges(nudgesData);
        setLoading(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (mountedRef.current) {
        setError(message);
        setLoading(false);
      }
    }
  }, []);

  const logActivity = useCallback(
    async (
      activityType: string,
      relatedId?: string,
      metadata?: Record<string, unknown>,
    ): Promise<void> => {
      try {
        const authHeader = await getAuthHeader();
        if (!authHeader) return;

        const res = await fetch(`${API_BASE}/momentum/log`, {
          method: 'POST',
          headers: { ...authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ activity_type: activityType, related_id: relatedId, metadata }),
        });

        if (!res.ok) return;

        // Refresh summary after logging
        await refresh();
      } catch {
        // Fail silently — activity logging is best-effort
      }
    },
    [refresh],
  );

  const dismissNudge = useCallback(async (nudgeId: string): Promise<void> => {
    // Optimistic removal
    if (mountedRef.current) {
      setNudges((prev) => prev.filter((n) => n.id !== nudgeId));
    }

    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) return;

      await fetch(`${API_BASE}/momentum/nudges/${nudgeId}/dismiss`, {
        method: 'PATCH',
        headers: authHeader,
      });
    } catch {
      // Fail silently — optimistic update already applied
    }
  }, []);

  const checkStalls = useCallback(async (): Promise<void> => {
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) return;

      const res = await fetch(`${API_BASE}/momentum/check-stalls`, {
        method: 'POST',
        headers: authHeader,
      });

      if (!res.ok) return;

      // Refresh nudges after stall check
      if (!mountedRef.current) return;
      const nudgesRes = await fetch(`${API_BASE}/momentum/nudges`, { headers: authHeader });
      if (nudgesRes.ok && mountedRef.current) {
        const nudgesJson = (await nudgesRes.json()) as { nudges: CoachingNudge[] };
        setNudges(nudgesJson.nudges ?? []);
      }
    } catch {
      // Fail silently
    }
  }, []);

  return {
    summary,
    nudges,
    loading,
    error,
    refresh,
    logActivity,
    dismissNudge,
    checkStalls,
  };
}
