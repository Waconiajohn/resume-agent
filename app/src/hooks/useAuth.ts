import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

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
