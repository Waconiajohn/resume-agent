-- Sprint B.1 (security hardening) — auth-security helper RPCs.
--
-- Two SECURITY DEFINER functions, both backend-private (GRANT to
-- service_role only):
--
--   1. rpc_user_has_verified_factor — does the caller have at least
--      one verified MFA factor? Used by authMiddleware to enforce
--      AAL2 on users with MFA enrolled, closing the gap where a
--      phished password gives backend access despite the UI gate.
--
--   2. rpc_verify_user_password — does this password match the user's
--      bcrypt hash in auth.users? Used by /api/account/verify-password
--      so destructive ops (account delete, MFA disable) can require
--      password re-auth even when the session is already AAL2.

CREATE OR REPLACE FUNCTION public.rpc_user_has_verified_factor(caller_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.mfa_factors
    WHERE user_id = caller_user_id AND status = 'verified'
  );
$$;

REVOKE ALL ON FUNCTION public.rpc_user_has_verified_factor(uuid) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rpc_user_has_verified_factor(uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_user_has_verified_factor(uuid) IS
  'Sprint B.1 — backend-private MFA-enrollment check used by authMiddleware to enforce AAL2 for users with verified factors.';

-- pgcrypto's crypt() handles bcrypt-formatted hashes natively. Supabase
-- already ships pgcrypto enabled; the function fails closed if the
-- extension is somehow missing (NULL hash check, plus crypt() throws).
CREATE OR REPLACE FUNCTION public.rpc_verify_user_password(caller_user_id uuid, password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  stored_hash text;
BEGIN
  SELECT encrypted_password INTO stored_hash
  FROM auth.users
  WHERE id = caller_user_id;

  IF stored_hash IS NULL OR length(stored_hash) = 0 THEN
    RETURN false;
  END IF;

  RETURN stored_hash = extensions.crypt(password, stored_hash);
EXCEPTION WHEN others THEN
  -- Any crypt failure = not verified. Don't leak details.
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_verify_user_password(uuid, text) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rpc_verify_user_password(uuid, text) TO service_role;

COMMENT ON FUNCTION public.rpc_verify_user_password(uuid, text) IS
  'Sprint B.1 — backend-private bcrypt verify against auth.users.encrypted_password. Used to re-auth before destructive operations.';
