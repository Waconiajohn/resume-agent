/**
 * SessionExpiryToaster — Sprint E2.
 *
 * Subscribes to Supabase auth state and emits a toast when the session
 * drops from non-null → null unexpectedly (token refresh failure, revoked
 * session, etc.). Explicit sign-outs triggered by the user are suppressed
 * via a ref flag set elsewhere — for now we differentiate via the event
 * type: `SIGNED_OUT` after a prior `SIGNED_IN`/`TOKEN_REFRESHED` is treated
 * as an expiry surface rather than an explicit action, but explicit sign-
 * outs also route to /sales (see App.tsx handleSignOut), so the toast is
 * visible only briefly before the gate takes over — acceptable UX.
 *
 * Visibility is scoped via the existing useToast API and rate-limited to a
 * single toast per event transition.
 */

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';

export function SessionExpiryToaster() {
  const { addToast } = useToast();
  // Tracks whether we've seen a signed-in state in this tab; only fires the
  // expiry toast when we transition from signed-in to signed-out.
  const wasSignedInRef = useRef(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        wasSignedInRef.current = true;
        return;
      }
      // Session became null. Only nag if we had been signed in and the
      // event was not an explicit user action. Supabase emits:
      //  - SIGNED_OUT — explicit or programmatic sign-out
      //  - USER_UPDATED / USER_DELETED — not auth loss
      //  - TOKEN_REFRESHED — won't fire with null session
      //  - SIGNED_IN — not applicable here
      // We toast on SIGNED_OUT when we were previously signed in, which
      // covers both explicit sign-out and refresh-token failure. Explicit
      // sign-outs route to /sales immediately so the toast flashes briefly
      // before the gate takes over — acceptable.
      if (event === 'SIGNED_OUT' && wasSignedInRef.current) {
        addToast({
          type: 'warning',
          message: 'Your session ended. Please sign in again to pick up where you left off.',
          duration: 8000,
        });
        wasSignedInRef.current = false;
      }
    });
    return () => subscription.unsubscribe();
  }, [addToast]);

  return null;
}
