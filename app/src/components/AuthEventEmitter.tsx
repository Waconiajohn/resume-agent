/**
 * AuthEventEmitter — Sprint B (auth hardening).
 *
 * Subscribes to Supabase's onAuthStateChange and POSTs to
 * /api/auth/events so the user's activity log captures sign-in,
 * sign-out, password recovery, and profile-update events. The backend
 * stamps the request's IP and user-agent so the user can spot a
 * sign-in from an unfamiliar device.
 *
 * Renders nothing. Mount once near the auth-aware layout root.
 *
 * TOKEN_REFRESHED is intentionally not posted — it's noisy (every 45
 * min) and the user-visible value is low. INITIAL_SESSION is also
 * skipped since it fires on every page reload for an already-signed-in
 * user, which would flood the log without adding signal.
 */

import { useEffect, useRef } from 'react';
import type { AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { API_BASE } from '@/lib/api';
import type { AuthEventType } from '@/types/auth-events';

const RECORDED_EVENTS: ReadonlyArray<AuthChangeEvent> = [
  'SIGNED_IN',
  'SIGNED_OUT',
  'PASSWORD_RECOVERY',
  'USER_UPDATED',
];

function mapEventType(event: AuthChangeEvent): AuthEventType | null {
  switch (event) {
    case 'SIGNED_IN':
      return 'signed_in';
    case 'SIGNED_OUT':
      return 'signed_out';
    case 'PASSWORD_RECOVERY':
      // PASSWORD_RECOVERY fires when the user opens the reset deep
      // link, not when they request a reset. Naming reflects that.
      return 'password_recovery_started';
    case 'USER_UPDATED':
      return 'user_updated';
    default:
      return null;
  }
}

export function AuthEventEmitter() {
  // Coalesce duplicate events fired in quick succession (Supabase emits
  // SIGNED_IN twice on some flows — once from setSession and once from
  // the OAuth redirect). 5s is a generous floor that still lets a real
  // sign-out + sign-in inside the same window through.
  const lastEventRef = useRef<{ type: AuthEventType; at: number } | null>(null);

  useEffect(() => {
    const post = async (event_type: AuthEventType, accessToken: string | null) => {
      try {
        await fetch(`${API_BASE}/auth/events`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ event_type }),
          // SIGNED_OUT fires while we still have a valid session in
          // localStorage; keepalive lets the request finish even if the
          // user navigates away mid-flight.
          keepalive: true,
        });
      } catch {
        // Best-effort. If the event doesn't land we'd rather degrade
        // silently than block the auth flow.
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!RECORDED_EVENTS.includes(event)) return;

      const mapped = mapEventType(event);
      if (!mapped) return;

      const now = Date.now();
      const last = lastEventRef.current;
      if (last && last.type === mapped && now - last.at < 5_000) return;
      lastEventRef.current = { type: mapped, at: now };

      // SIGNED_OUT: try the soon-to-be-cleared session token; if it's
      // already gone, the request is dropped server-side at auth
      // middleware. SIGNED_IN: session is fresh, token is reliable.
      let token = session?.access_token ?? null;
      if (!token && event !== 'SIGNED_OUT') {
        const { data } = await supabase.auth.getSession();
        token = data.session?.access_token ?? null;
      }
      if (!token) return;

      void post(mapped, token);
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
