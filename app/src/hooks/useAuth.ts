import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import type { SocialAuthProvider } from '@/lib/auth-providers';

// How often to proactively refresh the session (45 min, before the 60-min default expiry).
const REFRESH_INTERVAL_MS = 45 * 60 * 1000;
// Refresh immediately on tab focus if the session expires within this window.
const REFRESH_THRESHOLD_MS = 10 * 60 * 1000;
// Skip refresh side-effects in E2E mock auth mode — refreshSession is not stubbed there.
const IS_MOCK_AUTH = import.meta.env.VITE_E2E_MOCK_AUTH === 'true';

function readStringField(value: unknown, field: string): string | null {
  if (!value || typeof value !== 'object' || !(field in value)) return null;
  const fieldValue = (value as Record<string, unknown>)[field];
  return typeof fieldValue === 'string' && fieldValue.trim() ? fieldValue : null;
}

function getOAuthStartErrorMessage(payload: unknown, status: number): string {
  return readStringField(payload, 'msg')
    ?? readStringField(payload, 'message')
    ?? readStringField(payload, 'error_description')
    ?? readStringField(payload, 'error')
    ?? `Unable to start social sign-in. Supabase returned HTTP ${status}.`;
}

async function startOAuthRedirect(url: string): Promise<{ error: unknown }> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      redirect: 'manual',
      headers: { Accept: 'application/json' },
    });

    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      window.location.assign(url);
      return { error: null };
    }

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      return { error: new Error(getOAuthStartErrorMessage(payload, response.status)) };
    }

    const redirectUrl = readStringField(payload, 'url');
    if (redirectUrl) {
      window.location.assign(redirectUrl);
      return { error: null };
    }

    window.location.assign(url);
    return { error: null };
  } catch {
    return {
      error: new Error(
        'Unable to verify that sign-in option right now. Use email and password for now, or try again in a minute.',
      ),
    };
  }
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // True when a token refresh failed and the session is still hanging on but
  // about to expire. Surfaced via SessionDegradedBanner so the user can sign
  // in again proactively instead of being booted mid-task by the next 401.
  // Cleared on TOKEN_REFRESHED or sign-out.
  const [sessionDegraded, setSessionDegraded] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mountedRef.current) return;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    }).catch((err: unknown) => {
      if (!mountedRef.current) return;
      console.error('Failed to get auth session:', err);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mountedRef.current) return;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        setSessionDegraded(false);
      }
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
        if (!mountedRef.current) return;
        if (error) {
          console.warn('Session refresh failed:', error.message);
          setSessionDegraded(true);
        } else {
          setSessionDegraded(false);
        }
      } catch (err) {
        if (!mountedRef.current) return;
        console.warn('Session refresh error:', err);
        setSessionDegraded(true);
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
        if (expiresAt === undefined) return;
        if (expiresAt * 1000 - Date.now() >= REFRESH_THRESHOLD_MS) return;
        const { error } = await supabase.auth.refreshSession();
        if (!mountedRef.current) return;
        if (error) {
          console.warn('Visibility refresh failed:', error.message);
          setSessionDegraded(true);
        } else {
          setSessionDegraded(false);
        }
      } catch (err) {
        if (!mountedRef.current) return;
        console.warn('Visibility refresh error:', err);
        setSessionDegraded(true);
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
      options: {
        emailRedirectTo: `${window.location.origin}/workspace`,
        data: metadata
          ? {
              full_name: `${metadata.firstName} ${metadata.lastName}`,
              first_name: metadata.firstName,
              last_name: metadata.lastName,
              phone: metadata.phone,
            }
          : undefined,
      },
    });
    return { error };
  };

  const signInWithProvider = async (provider: SocialAuthProvider) => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/workspace`,
        queryParams: provider === 'azure' ? { prompt: 'select_account' } : undefined,
        skipBrowserRedirect: true,
      },
    });

    if (error) return { error };
    if (!data.url) {
      return { error: new Error('Unable to start social sign-in. Supabase did not return an authorization URL.') };
    }

    return startOAuthRedirect(data.url);
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
    setSessionDegraded(false);
  };

  const clearSessionDegraded = () => setSessionDegraded(false);

  const displayName = user?.user_metadata?.full_name
    ?? user?.email?.split('@')[0]
    ?? 'there';

  return {
    user,
    session,
    loading,
    displayName,
    sessionDegraded,
    clearSessionDegraded,
    signInWithEmail,
    signUpWithEmail,
    signInWithProvider,
    updateProfile,
    signOut,
  };
}
