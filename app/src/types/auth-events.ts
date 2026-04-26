/**
 * Canonical list of auth-event types that the audit log accepts.
 *
 * This must stay in sync with:
 *   - server/src/lib/auth-events.ts (the server-side mirror)
 *   - the CHECK constraint in
 *     supabase/migrations/20260426000001_auth_audit_log.sql (and the
 *     extension migration 20260426000004 that added signed_in_failed)
 *
 * Keep all three in lockstep. Adding a value here without touching
 * the migration will silently fail at INSERT time; adding a migration
 * value without touching this list will leave events unrecognised by
 * the UI label map.
 */
export const AUTH_EVENT_TYPES = [
  'signed_in',
  'signed_in_failed',
  'signed_out',
  'password_recovery_started',
  'password_changed',
  'user_updated',
  'mfa_enrolled',
  'mfa_challenge_passed',
  'mfa_challenge_failed',
] as const;

export type AuthEventType = (typeof AUTH_EVENT_TYPES)[number];

/** Friendly labels surfaced in Settings → Recent activity. */
export const AUTH_EVENT_LABELS: Record<AuthEventType, string> = {
  signed_in: 'Signed in',
  signed_in_failed: 'Sign-in attempt failed',
  signed_out: 'Signed out',
  password_recovery_started: 'Password reset link opened',
  password_changed: 'Password changed',
  user_updated: 'Profile updated',
  mfa_enrolled: 'MFA enrolled',
  mfa_challenge_passed: 'MFA verified',
  mfa_challenge_failed: 'MFA failed',
};
