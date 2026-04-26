-- Sprint B (auth hardening) — auth_audit_log table.
--
-- Append-only ledger of authentication-relevant events for each user.
-- Captured client-side via onAuthStateChange and POST /api/auth/event;
-- server writes via service-role so writes can't be forged from the
-- browser. Users can read their own log via Settings → Activity. The
-- table needs to exist before signup #1 so there's a continuous record
-- once we start onboarding real users.
--
-- Distinct from Supabase's own internal audit log (Pro plan only,
-- accessible only via dashboard) — this is the user-visible ledger.
--
-- Event types intentionally limited at the schema level so a typo
-- can't quietly poison the log. Add types here as features land
-- (mfa_enrolled / mfa_challenge_failed for Sprint B MFA work).

CREATE TABLE IF NOT EXISTS public.auth_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  event_type text NOT NULL CHECK (event_type IN (
    'signed_in',
    'signed_out',
    'password_recovery_started',
    'password_changed',
    'user_updated',
    'mfa_enrolled',
    'mfa_challenge_passed',
    'mfa_challenge_failed'
  )),

  ip_address inet,
  user_agent text,
  metadata jsonb,

  occurred_at timestamptz NOT NULL DEFAULT now()
);

-- Per-user activity feed — sorted descending.
CREATE INDEX IF NOT EXISTS idx_auth_audit_log_user_occurred
  ON public.auth_audit_log(user_id, occurred_at DESC);

-- RLS — users see their own events; only service role writes.
ALTER TABLE public.auth_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own auth_audit_log"
  ON public.auth_audit_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies for non-service-role. Writes go
-- through supabaseAdmin from the Hono backend after JWT verification
-- so we can attach the request IP and user agent server-side.

COMMENT ON TABLE public.auth_audit_log IS
  'Sprint B (auth hardening) — append-only ledger of auth-relevant events for the user-visible activity log. Service-role writes only; users SELECT their own.';
