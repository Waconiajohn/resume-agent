import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

// How often to proactively refresh the session (45 min, before the 60-min default expiry).
const REFRESH_INTERVAL_MS = 45 * 60 * 1000;
// Refresh immediately on tab focus if the session expires within this window.
const REFRESH_THRESHOLD_MS = 10 * 60 * 1000;
// Skip refresh side-effects in E2E mock auth mode — refreshSession is not stubbed there.
const IS_MOCK_AUTH = import.meta.env.VITE_E2E_MOCK_AUTH === 'true';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mountedRef.current) return;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    }).catch((err) => {
      if (!mountedRef.current) return;
      console.error('Failed to get auth session:', err);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mountedRef.current) return;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, []);

  // Proactive interval refresh — keeps the session alive during long editing sessions.
  useEffect(() => {
    if (IS_MOCK_AUTH) return;

    const interval = setInterval(async () => {
      try {
        const { error } = await supabase.auth.refreshSession();
        if (error) {
          console.warn('Session refresh failed:', error.message);
        }
      } catch (err) {
        console.warn('Session refresh error:', err);
      }
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  // Visibility-change refresh — catches the case where the user returns after a long absence.
  useEffect(() => {
    if (IS_MOCK_AUTH) return;

    const handleVisibility = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;
        const expiresAt = data.session.expires_at;
        if (expiresAt !== undefined && expiresAt * 1000 - Date.now() < REFRESH_THRESHOLD_MS) {
          await supabase.auth.refreshSession();
        }
      } catch {
        // Intentionally silent — best-effort refresh on tab focus.
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUpWithEmail = async (
    email: string,
    password: string,
    metadata?: { firstName: string; lastName: string; phone?: string },
  ) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: metadata
        ? {
            data: {
              full_name: `${metadata.firstName} ${metadata.lastName}`,
              first_name: metadata.firstName,
              last_name: metadata.lastName,
              phone: metadata.phone,
            },
          }
        : undefined,
    });
    return { error };
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
    return { error };
  };

  const updateProfile = async (data: { firstName: string; lastName: string }) => {
    const fullName = `${data.firstName} ${data.lastName}`;
    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName, first_name: data.firstName, last_name: data.lastName },
    });
    if (!error) {
      // Refresh user state so displayName updates immediately
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        setUser(sessionData.session.user);
      }
    }
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    if (!mountedRef.current) return;
    setSession(null);
    setUser(null);
  };

  const displayName = user?.user_metadata?.full_name
    ?? user?.email?.split('@')[0]
    ?? 'there';

  return {
    user,
    session,
    loading,
    displayName,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    updateProfile,
    signOut,
  };
}
