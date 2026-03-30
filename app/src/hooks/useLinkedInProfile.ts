/**
 * useLinkedInProfile
 *
 * Loads and saves the user's LinkedIn headline and About section.
 * Persists via /api/platform-context/linkedin-profile (PUT/GET).
 * Falls back to localStorage for a snappy load experience.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { API_BASE } from '@/lib/api';

export interface LinkedInProfile {
  headline: string;
  about: string;
}

const STORAGE_NAMESPACE = 'careeriq_linkedin_profile';
const LEGACY_STORAGE_KEY = STORAGE_NAMESPACE;
const ANONYMOUS_STORAGE_SCOPE = 'anon';
const DEBOUNCE_MS = 1_000;

const EMPTY_PROFILE: LinkedInProfile = { headline: '', about: '' };

function hasProfileContent(profile: LinkedInProfile) {
  return Boolean(profile.headline.trim() || profile.about.trim());
}

function getStorageKey(userId: string | null) {
  return `${STORAGE_NAMESPACE}:${userId ?? ANONYMOUS_STORAGE_SCOPE}`;
}

function normalizeProfile(parsed: unknown): LinkedInProfile {
  const source = (parsed ?? {}) as Partial<LinkedInProfile>;
  return {
    headline: source.headline ?? '',
    about: source.about ?? '',
  };
}

function loadProfileFromStorageKey(key: string): LinkedInProfile | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return normalizeProfile(JSON.parse(raw));
  } catch {
    return null;
  }
}

function saveToStorageForUser(userId: string | null, profile: LinkedInProfile) {
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(profile));
  } catch {
    // localStorage may be full or unavailable
  }
}

function loadFromStorage(userId: string | null): LinkedInProfile {
  const scopedProfile = loadProfileFromStorageKey(getStorageKey(userId));
  if (scopedProfile) return scopedProfile;

  if (!userId) {
    const legacyProfile = loadProfileFromStorageKey(LEGACY_STORAGE_KEY);
    if (legacyProfile) {
      saveToStorageForUser(null, legacyProfile);
      try {
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch {
        // ignore storage cleanup errors
      }
      return legacyProfile;
    }
  }

  return EMPTY_PROFILE;
}

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export function useLinkedInProfile() {
  const [profile, setProfile] = useState<LinkedInProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeUserId, setActiveUserId] = useState<string | null | undefined>(undefined);
  const initialLoadDone = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const activeLoadId = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function loadForSession(userIdOverride?: string | null, tokenOverride?: string | null) {
      const loadId = ++activeLoadId.current;
      initialLoadDone.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setLoading(true);
      setError(null);

      try {
        let resolvedUserId = userIdOverride ?? null;
        let resolvedToken = tokenOverride ?? null;

        if (userIdOverride === undefined) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          resolvedUserId = session?.user?.id ?? null;
          resolvedToken = session?.access_token ?? null;
        }

        if (cancelled || loadId !== activeLoadId.current) return;

        setActiveUserId(resolvedUserId);
        const localProfile = loadFromStorage(resolvedUserId);
        setProfile(localProfile);

        if (!resolvedUserId || !resolvedToken) {
          initialLoadDone.current = true;
          setLoading(false);
          return;
        }

        const res = await fetch(`${API_BASE}/platform-context/linkedin-profile`, {
          headers: { Authorization: `Bearer ${resolvedToken}` },
        });

        if (cancelled || loadId !== activeLoadId.current) return;

        if (res.ok) {
          const data = (await res.json()) as { linkedin_profile: LinkedInProfile | null };
          if (data.linkedin_profile) {
            setProfile(data.linkedin_profile);
            saveToStorageForUser(resolvedUserId, data.linkedin_profile);
          } else if (hasProfileContent(localProfile)) {
            await fetch(`${API_BASE}/platform-context/linkedin-profile`, {
              method: 'PUT',
              headers: {
                Authorization: `Bearer ${resolvedToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(localProfile),
            });
          }
        }
      } catch {
        // Server unavailable — use the scoped local draft.
      } finally {
        if (!cancelled && loadId === activeLoadId.current) {
          setLoading(false);
          initialLoadDone.current = true;
        }
      }
    }

    void loadForSession(undefined, undefined);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadForSession(session?.user?.id ?? null, session?.access_token ?? null);
    });

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      subscription.unsubscribe();
    };
  }, []);

  const updateField = useCallback(
    (field: keyof LinkedInProfile, value: string) => {
      setProfile((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        setError('Not authenticated');
        return false;
      }

      const res = await fetch(`${API_BASE}/platform-context/linkedin-profile`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(profile),
      });

      if (!res.ok) {
        setError('Failed to save. Please try again.');
        return false;
      }

      saveToStorageForUser(activeUserId ?? null, profile);
      return true;
    } catch {
      setError('Failed to save. Please try again.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [profile]);

  useEffect(() => {
    if (activeUserId === undefined) return;
    if (!initialLoadDone.current) return;
    saveToStorageForUser(activeUserId, profile);
  }, [activeUserId, profile]);

  useEffect(() => {
    if (activeUserId === undefined) return;
    if (!initialLoadDone.current) return;
    if (!activeUserId) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;

        await fetch(`${API_BASE}/platform-context/linkedin-profile`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          },
          body: JSON.stringify(profile),
        });
        saveToStorageForUser(activeUserId, profile);
      } catch {
        // Best-effort auto-save
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [activeUserId, profile]);

  const hasContent = profile.headline.trim().length > 0 || profile.about.trim().length > 0;

  return {
    profile,
    updateField,
    save,
    loading,
    saving,
    error,
    hasContent,
  };
}
