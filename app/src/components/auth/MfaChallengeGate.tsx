/**
 * MfaChallengeGate — Sprint B (auth hardening).
 *
 * Sits between AuthGate and the rest of the app. After a successful
 * password sign-in, if the user has verified TOTP factors and the
 * session is still at AAL1, this overlay forces a 6-digit code before
 * the app renders. Backend RLS doesn't currently enforce AAL2 anywhere
 * — the gate is the actual second factor.
 *
 * Mounted at the top of the authenticated layout in App.tsx. Renders
 * `null` when MFA is not required, so it has zero cost for users
 * without enrolled factors.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck, Loader2, LogOut } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { GlassInput } from '@/components/GlassInput';
import { supabase } from '@/lib/supabase';
import {
  challengeAndVerify,
  getAalState,
  listVerifiedFactors,
  recordMfaEvent,
  type VerifiedFactor,
} from '@/lib/mfa';

interface MfaChallengeGateProps {
  /**
   * Whether a session currently exists. The gate only checks AAL when
   * authenticated; it stays inert during the AuthGate / sign-out states.
   */
  hasSession: boolean;
  /** Lets the user bail out of the challenge by signing out. */
  onSignOut: () => void | Promise<void>;
}

export function MfaChallengeGate({ hasSession, onSignOut }: MfaChallengeGateProps) {
  const [required, setRequired] = useState(false);
  const [factor, setFactor] = useState<VerifiedFactor | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cancel any in-flight check if the user signs out so we don't flash
  // the gate on a freshly-cleared session.
  const checkRef = useRef<AbortController | null>(null);

  const refreshAal = useCallback(async () => {
    if (!hasSession) {
      setRequired(false);
      setFactor(null);
      return;
    }
    checkRef.current?.abort();
    const controller = new AbortController();
    checkRef.current = controller;
    try {
      const aal = await getAalState();
      if (controller.signal.aborted) return;
      const needs = aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2';
      if (!needs) {
        setRequired(false);
        setFactor(null);
        return;
      }
      const factors = await listVerifiedFactors();
      if (controller.signal.aborted) return;
      const first = factors[0] ?? null;
      // Defensive: if AAL says aal2 is needed but no factors are listed,
      // don't block — that's an inconsistent state and blocking would
      // strand the user. Log to console for debugging.
      if (!first) {
        console.warn('MFA gate: AAL2 required but no verified factors found');
        setRequired(false);
        setFactor(null);
        return;
      }
      setFactor(first);
      setRequired(true);
    } catch (err) {
      if (controller.signal.aborted) return;
      console.warn('MFA gate AAL check failed:', err);
      setRequired(false);
    }
  }, [hasSession]);

  useEffect(() => {
    void refreshAal();
  }, [refreshAal]);

  // Re-check on every supabase auth event so a fresh sign-in immediately
  // surfaces the challenge without waiting for a route change.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void refreshAal();
    });
    return () => subscription.unsubscribe();
  }, [refreshAal]);

  const handleVerify = async () => {
    if (!factor) return;
    if (!/^\d{6}$/.test(code)) {
      setError('Code must be 6 digits.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await challengeAndVerify(factor.id, code);
      void recordMfaEvent('mfa_challenge_passed');
      setCode('');
      setRequired(false);
    } catch (err) {
      void recordMfaEvent('mfa_challenge_failed');
      setError(err instanceof Error ? err.message : 'Invalid code. Try again.');
    } finally {
      setLoading(false);
    }
  };

  // Render nothing until we know MFA is required — the rest of the app is
  // siblings, not children, so during the AAL check they show through. The
  // overlay below has z-index 200 and covers the whole viewport when shown.
  if (!required) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mfa-gate-title"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--surface-overlay,rgba(0,0,0,0.6))] p-4"
      data-testid="mfa-challenge-gate"
    >
      <GlassCard className="w-full max-w-sm p-6">
        <div className="mb-4 flex items-center gap-3">
          <ShieldCheck size={20} className="text-[var(--link)]" />
          <h2 id="mfa-gate-title" className="text-[15px] font-semibold text-[var(--text-strong)]">
            Two-factor authentication
          </h2>
        </div>
        <p className="mb-4 text-xs text-[var(--text-soft)]">
          Enter the 6-digit code from your authenticator app to finish signing in.
        </p>
        <GlassInput
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="123456"
          maxLength={6}
          data-testid="mfa-challenge-code"
          autoFocus
        />
        {error && <p className="mt-2 text-xs text-[var(--badge-red-text)]" role="alert">{error}</p>}
        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="inline-flex items-center gap-1 text-[12px] text-[var(--text-soft)] hover:text-[var(--text-strong)]"
          >
            <LogOut size={12} />
            Sign out
          </button>
          <GlassButton
            onClick={() => void handleVerify()}
            disabled={loading || code.length !== 6}
            data-testid="mfa-challenge-verify"
          >
            {loading ? <Loader2 size={13} className="motion-safe:animate-spin" /> : 'Verify'}
          </GlassButton>
        </div>
      </GlassCard>
    </div>
  );
}
