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

const STORAGE_KEY = 'careeriq_linkedin_profile';
const DEBOUNCE_MS = 1_000;

const EMPTY_PROFILE: LinkedInProfile = { headline: '', about: '' };

function loadFromStorage(): LinkedInProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_PROFILE;
    const parsed = JSON.parse(raw) as Partial<LinkedInProfile>;
    return {
      headline: parsed.headline ?? '',
      about: parsed.about ?? '',
    };
  } catch {
    return EMPTY_PROFILE;
  }
}

function saveToStorage(profile: LinkedInProfile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // localStorage may be full or unavailable
  }
}

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export function useLinkedInProfile() {
  const [profile, setProfile] = useState<LinkedInProfile>(loadFromStorage);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialLoadDone = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Load from server on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const token = await getAccessToken();
        if (!token || cancelled) {
          setLoading(false);
          initialLoadDone.current = true;
          return;
        }

        const res = await fetch(`${API_BASE}/platform-context/linkedin-profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (cancelled) return;

        if (res.ok) {
          const data = (await res.json()) as { linkedin_profile: LinkedInProfile | null };
          if (data.linkedin_profile) {
            setProfile(data.linkedin_profile);
            saveToStorage(data.linkedin_profile);
          }
        }
      } catch {
        // Server unavailable — use localStorage data
      } finally {
        if (!cancelled) {
          setLoading(false);
          initialLoadDone.current = true;
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
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

      saveToStorage(profile);
      return true;
    } catch {
      setError('Failed to save. Please try again.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [profile]);

  // Sync localStorage on every change
  useEffect(() => {
    if (!initialLoadDone.current) return;
    saveToStorage(profile);
  }, [profile]);

  // Debounced auto-save to server
  useEffect(() => {
    if (!initialLoadDone.current) return;

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
        saveToStorage(profile);
      } catch {
        // Best-effort auto-save
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [profile]);

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
