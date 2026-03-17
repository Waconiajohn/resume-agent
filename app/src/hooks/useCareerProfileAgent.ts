import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useOnboarding } from '@/hooks/useOnboarding';
import type { CareerProfileV2 } from '@/types/career-profile';
import {
  buildCareerProfileSummary,
  deriveCareerProfileDashboardState,
  deriveCareerProfileSignals,
  deriveCareerProfileStory,
} from '@/components/career-iq/career-profile-summary';

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export function useCareerProfileAgent() {
  const [profile, setProfile] = useState<CareerProfileV2 | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const refreshProfile = useCallback(async (): Promise<CareerProfileV2 | null> => {
    setProfileLoading(true);
    setProfileError(null);

    try {
      const token = await getAccessToken();
      if (!token) {
        setProfile(null);
        return null;
      }

      const res = await fetch(`${API_BASE}/platform-context/career-profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        setProfileError(`Failed to load Career Profile (${res.status})`);
        return null;
      }

      const data = await res.json() as { career_profile?: CareerProfileV2 | null };
      const nextProfile = data.career_profile ?? null;
      setProfile(nextProfile);
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem('platform_context_summary');
      }
      return nextProfile;
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Failed to load Career Profile');
      return null;
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const onboarding = useOnboarding({
    onComplete: () => {
      void refreshProfile();
    },
  });

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const createCareerProfileSession = useCallback(async (): Promise<string | null> => {
    const token = await getAccessToken();
    if (!token) {
      setProfileError('Not authenticated');
      return null;
    }

    const res = await fetch(`${API_BASE}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({} as { error?: string }));
      setProfileError(body.error ?? `Failed to create Career Profile session (${res.status})`);
      return null;
    }

    const data = await res.json() as { session?: { id?: string } };
    return typeof data.session?.id === 'string' ? data.session.id : null;
  }, []);

  const startAssessment = useCallback(async (resumeText?: string): Promise<boolean> => {
    const sessionId = await createCareerProfileSession();
    if (!sessionId) return false;
    return onboarding.startAssessment(sessionId, resumeText);
  }, [createCareerProfileSession, onboarding]);

  const story = useMemo(() => deriveCareerProfileStory(profile), [profile]);
  const signals = useMemo(() => deriveCareerProfileSignals(profile), [profile]);
  const dashboardState = useMemo(() => deriveCareerProfileDashboardState(profile), [profile]);
  const summary = useMemo(() => buildCareerProfileSummary(profile), [profile]);

  return {
    profile,
    profileLoading,
    profileError,
    refreshProfile,
    startAssessment,
    story,
    signals,
    dashboardState,
    summary,
    hasStarted: dashboardState !== 'new-user' || onboarding.status !== 'idle',
    isComplete: dashboardState === 'strong',
    loading: profileLoading || onboarding.status === 'connecting',
    onboarding,
  };
}
