/**
 * Canonical list of auth-event types — server side mirror of
 * app/src/types/auth-events.ts. Keep both in sync; both must match the
 * CHECK constraint on public.auth_audit_log.
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
