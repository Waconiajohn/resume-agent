/**
 * MFA helpers — thin wrappers around supabase.auth.mfa.* with the
 * typed shapes our UI cares about. Centralized so the enroll/challenge
 * flows and Settings → Security all read from one source of truth.
 *
 * Sprint B (auth hardening). Uses Supabase's built-in TOTP factor type.
 * Backup codes are intentionally out of scope for V1 — losing the
 * authenticator app today means contacting support to reset the
 * password (which clears the factor); a proper recovery-codes
 * implementation is queued for Sprint C alongside passkeys.
 */

import { supabase } from '@/lib/supabase';
import { API_BASE } from '@/lib/api';
import type { AuthEventType } from '@/types/auth-events';

export interface VerifiedFactor {
  id: string;
  friendly_name: string | null;
  factor_type: string;
  created_at: string;
  updated_at: string;
}

export interface AalState {
  currentLevel: 'aal1' | 'aal2' | null;
  nextLevel: 'aal1' | 'aal2' | null;
}

export interface EnrollmentInProgress {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
}

/**
 * Lists the user's verified TOTP factors. Unverified (in-progress) factors
 * are filtered out so the UI doesn't conflate "halfway through enrollment"
 * with "MFA is on."
 */
export async function listVerifiedFactors(): Promise<VerifiedFactor[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return (data?.totp ?? [])
    .filter((f) => f.status === 'verified')
    .map((f) => ({
      id: f.id,
      friendly_name: f.friendly_name ?? null,
      factor_type: f.factor_type,
      created_at: f.created_at,
      updated_at: f.updated_at,
    }));
}

/**
 * Reads current vs. required Authenticator Assurance Level. When
 * `currentLevel === 'aal1' && nextLevel === 'aal2'`, the user has
 * verified factors and must pass a challenge to elevate the session.
 */
export async function getAalState(): Promise<AalState> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  return {
    currentLevel: (data?.currentLevel ?? null) as AalState['currentLevel'],
    nextLevel: (data?.nextLevel ?? null) as AalState['nextLevel'],
  };
}

/**
 * Starts a TOTP enrollment. Returns the unverified factor id, QR code SVG
 * data URL, the raw secret, and the otpauth:// URI. The caller must verify
 * a code from the authenticator app (via verifyEnrollment) within a few
 * minutes or the factor stays in 'unverified' state and is harmless.
 */
export async function enrollTotp(friendlyName?: string): Promise<EnrollmentInProgress> {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: friendlyName ?? `Authenticator (${new Date().toISOString().slice(0, 10)})`,
  });
  if (error) throw error;
  if (data.type !== 'totp') {
    throw new Error('Unexpected factor type returned from enroll');
  }
  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
  };
}

/**
 * Confirms an in-progress enrollment by verifying a 6-digit TOTP code.
 * On success the factor flips from unverified → verified and the
 * session is automatically upgraded to AAL2.
 */
export async function verifyEnrollment(factorId: string, code: string): Promise<void> {
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
  if (challengeError) throw challengeError;
  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });
  if (verifyError) throw verifyError;
}

/**
 * AAL2 elevation flow used by MfaChallengeGate at sign-in. Same shape as
 * verifyEnrollment but kept separate because the audit-log event is
 * different (mfa_challenge_passed vs. mfa_enrolled).
 */
export async function challengeAndVerify(factorId: string, code: string): Promise<void> {
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
  if (challengeError) throw challengeError;
  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });
  if (verifyError) throw verifyError;
}

/**
 * Removes a factor. Once the last verified factor is removed, MFA is off.
 */
export async function unenrollFactor(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}

/**
 * Best-effort audit-log emission for MFA events. We don't currently route
 * MFA events through AuthEventEmitter (the onAuthStateChange callbacks
 * don't fire distinct events for them), so we post directly here.
 * Failures are intentionally swallowed.
 */
export type MfaAuditEvent = Extract<AuthEventType, 'mfa_enrolled' | 'mfa_challenge_passed' | 'mfa_challenge_failed'>;

export async function recordMfaEvent(event_type: MfaAuditEvent): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    await fetch(`${API_BASE}/auth/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ event_type }),
      keepalive: true,
    });
  } catch {
    // Audit log is best-effort; never block the MFA flow on it.
  }
}
