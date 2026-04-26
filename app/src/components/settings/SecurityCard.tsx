/**
 * SecurityCard — Settings → Security.
 *
 * Sprint B (auth hardening). Single surface for two-factor settings:
 *   * If the user has no verified factor: shows enroll CTA.
 *   * If they have one: shows the factor with friendly name + enrolled
 *     date and a Disable button.
 *
 * Backup codes are out of scope for V1; "lost device" recovery goes
 * through password reset (which removes the factor) and re-enrollment.
 */

import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { GlassInput } from '@/components/GlassInput';
import { MfaEnrollFlow } from '@/components/auth/MfaEnrollFlow';
import { listVerifiedFactors, unenrollFactor, type VerifiedFactor } from '@/lib/mfa';
import { supabase } from '@/lib/supabase';
import { API_BASE } from '@/lib/api';

export function SecurityCard() {
  const [factors, setFactors] = useState<VerifiedFactor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listVerifiedFactors();
      setFactors(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load MFA factors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleEnrolled = async () => {
    setEnrolling(false);
    await refresh();
  };

  const handleDisable = async (factorId: string) => {
    if (disablePassword.length === 0) {
      setError('Enter your password to confirm.');
      return;
    }
    setRemoving(true);
    setError(null);
    try {
      // Sprint B.1: password re-auth before MFA disable. Server-side
      // /verify-password verifies against auth.users.encrypted_password
      // (bcrypt). Returns 401 on mismatch.
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError('Not authenticated. Please sign in again.');
        return;
      }
      const verifyRes = await fetch(`${API_BASE}/account/verify-password`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ password: disablePassword }),
      });
      if (!verifyRes.ok) {
        const body = await verifyRes.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? 'Incorrect password.');
        return;
      }
      // Verified — proceed with the user-side unenroll. Supabase MFA
      // unenroll goes directly through the user's session (the admin
      // SDK doesn't expose this), so the password check is the gate.
      await unenrollFactor(factorId);
      setDisablePassword('');
      setConfirmRemoveId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove factor');
    } finally {
      setRemoving(false);
    }
  };

  const formatEnrolledOn = (iso: string): string => {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-3 pb-3">
        <ShieldCheck size={18} className="text-[var(--link)]" />
        <h2 className="text-[15px] font-semibold text-[var(--text-strong)]">Security</h2>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
          <Loader2 size={13} className="motion-safe:animate-spin" />
          Loading…
        </div>
      )}

      {!loading && (
        <>
          {error && (
            <p className="mb-3 text-xs text-[var(--badge-red-text)]" role="alert">{error}</p>
          )}

          {factors.length === 0 && !enrolling && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--text-soft)]">
                Add an extra step to sign-in by linking an authenticator app. Recommended for any
                account with a paid plan or sensitive data.
              </p>
              <GlassButton onClick={() => setEnrolling(true)} data-testid="mfa-enroll-button">
                <ShieldCheck size={13} className="mr-1.5" />
                Enable two-factor authentication
              </GlassButton>
            </div>
          )}

          {enrolling && (
            <MfaEnrollFlow
              onEnrolled={() => void handleEnrolled()}
              onCancel={() => setEnrolling(false)}
            />
          )}

          {factors.length > 0 && !enrolling && (
            <ul className="space-y-2" data-testid="mfa-factor-list">
              {factors.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Smartphone size={14} className="text-[var(--text-soft)]" />
                    <div className="min-w-0">
                      <div className="text-[13px] text-[var(--text-strong)]">
                        {f.friendly_name ?? 'Authenticator app'}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        Enrolled {formatEnrolledOn(f.created_at)}
                      </div>
                    </div>
                  </div>
                  {confirmRemoveId === f.id ? (
                    <div className="flex flex-col items-end gap-2">
                      <GlassInput
                        type="password"
                        value={disablePassword}
                        onChange={(e) => setDisablePassword(e.target.value)}
                        placeholder="Your password"
                        autoComplete="current-password"
                        data-testid="mfa-disable-password-input"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleDisable(f.id)}
                          disabled={removing || disablePassword.length === 0}
                          data-testid="mfa-confirm-disable"
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--badge-red-text)]/40 bg-[var(--badge-red-text)]/10 px-2.5 py-1 text-[12px] font-medium text-[var(--badge-red-text)] disabled:opacity-50"
                        >
                          {removing ? <Loader2 size={12} className="motion-safe:animate-spin" /> : <ShieldOff size={12} />}
                          Confirm disable
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmRemoveId(null);
                            setDisablePassword('');
                            setError(null);
                          }}
                          disabled={removing}
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-strong)] disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmRemoveId(f.id)}
                      data-testid="mfa-disable-button"
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-strong)] hover:border-[var(--badge-red-text)]/40 hover:text-[var(--badge-red-text)]"
                    >
                      <ShieldOff size={12} />
                      Disable
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </GlassCard>
  );
}
