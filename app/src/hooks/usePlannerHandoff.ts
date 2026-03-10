import { useState, useCallback, useRef } from 'react';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlannerProfile {
  id: string;
  name: string;
  firm: string;
  specializations: string[];
  geographic_regions: string[];
  bio: string;
}

export interface QualificationResult {
  passed: boolean;
  checks: Record<string, boolean>;
  failure_reasons: string[];
}

export interface ReferralRecord {
  id: string;
  planner_id: string;
  status: string;
  created_at: string;
}

export type HandoffPhase =
  | 'idle'
  | 'qualifying'
  | 'matching'
  | 'referring'
  | 'complete'
  | 'disqualified'
  | 'error';

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function getAuthHeader(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function usePlannerHandoff() {
  const [phase, setPhase] = useState<HandoffPhase>('idle');
  const [qualification, setQualification] = useState<QualificationResult | null>(null);
  const [planners, setPlanners] = useState<PlannerProfile[]>([]);
  const [referral, setReferral] = useState<ReferralRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Capture qualification inputs for reuse in selectPlanner
  const assetRangeRef = useRef<string>('');
  const geographyRef = useRef<string>('');

  const qualify = useCallback(async (
    optIn: boolean,
    assetRange: string,
    geography: string,
  ): Promise<void> => {
    const token = await getAuthHeader();
    if (!token) {
      setError('Not authenticated');
      setPhase('error');
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError('Not authenticated');
      setPhase('error');
      return;
    }

    assetRangeRef.current = assetRange;
    geographyRef.current = geography;

    setPhase('qualifying');
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/planner-handoff/qualify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: user.id,
          opt_in: optIn,
          asset_range: assetRange,
          geography,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        setError(`Qualification failed (${res.status}): ${body}`);
        setPlanners([]);
        setPhase('error');
        return;
      }

      const result = (await res.json()) as QualificationResult;
      setQualification(result);

      if (result.passed) {
        setPhase('matching');

        const matchRes = await fetch(`${API_BASE}/planner-handoff/match`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ geography, asset_range: assetRange }),
        });

        if (!matchRes.ok) {
          const body = await matchRes.text();
          setError(`Matching failed (${matchRes.status}): ${body}`);
          setPlanners([]);
          setPhase('error');
          return;
        }

        const matchResult = (await matchRes.json()) as { planners?: PlannerProfile[] };
        setPlanners(matchResult.planners ?? []);
      } else {
        setPlanners([]);
        setPhase('disqualified');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setPlanners([]);
      setPhase('error');
    }
  }, []);

  const selectPlanner = useCallback(async (plannerId: string): Promise<void> => {
    const token = await getAuthHeader();
    if (!token) {
      setError('Not authenticated');
      setPhase('error');
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError('Not authenticated');
      setPhase('error');
      return;
    }

    setPhase('referring');

    try {
      const res = await fetch(`${API_BASE}/planner-handoff/refer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: user.id,
          planner_id: plannerId,
          opt_in: true,
          asset_range: assetRangeRef.current,
          geography: geographyRef.current,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        setError(`Referral failed (${res.status}): ${body}`);
        setPhase('error');
        return;
      }

      const result = (await res.json()) as { referral?: ReferralRecord; error?: string };
      if (result.referral) {
        setReferral(result.referral);
        setPhase('complete');
      } else {
        setError(result.error ?? 'Referral failed');
        setPhase('error');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setPhase('error');
    }
  }, []);

  const reset = useCallback((): void => {
    assetRangeRef.current = '';
    geographyRef.current = '';
    setPhase('idle');
    setQualification(null);
    setPlanners([]);
    setReferral(null);
    setError(null);
  }, []);

  return {
    phase,
    qualification,
    planners,
    referral,
    error,
    qualify,
    selectPlanner,
    reset,
  };
}
