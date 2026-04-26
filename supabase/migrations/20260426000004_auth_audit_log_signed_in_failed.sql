-- Sprint B (auth hardening) — extend auth_audit_log CHECK to allow
-- `signed_in_failed`. Written by the Supabase Auth Hook webhook
-- receiver when a password verification attempt comes back with
-- valid=false, which is the one auth event the frontend cannot see.

ALTER TABLE public.auth_audit_log
  DROP CONSTRAINT auth_audit_log_event_type_check;

ALTER TABLE public.auth_audit_log
  ADD CONSTRAINT auth_audit_log_event_type_check
  CHECK (event_type IN (
    'signed_in',
    'signed_in_failed',
    'signed_out',
    'password_recovery_started',
    'password_changed',
    'user_updated',
    'mfa_enrolled',
    'mfa_challenge_passed',
    'mfa_challenge_failed'
  ));
