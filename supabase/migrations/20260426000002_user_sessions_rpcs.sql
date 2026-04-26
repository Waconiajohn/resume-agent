-- Sprint B (auth hardening) — sessions list / revoke RPCs.
--
-- The `auth` schema is not exposed via PostgREST and there is no
-- supabase-js admin method for listing a user's sessions. These three
-- SECURITY DEFINER functions expose just enough of `auth.sessions` for
-- the user-facing Settings → Sessions surface (list, revoke one,
-- revoke all-but-current). Each function enforces ownership via
-- `auth.uid()` so a user can only see and revoke their own sessions.
--
-- The functions are GRANTed to the `authenticated` role (i.e. any
-- signed-in user) but the WHERE auth.uid() = user_id clause is what
-- actually scopes results.

CREATE OR REPLACE FUNCTION public.rpc_list_user_sessions()
RETURNS TABLE (
  id uuid,
  user_agent text,
  ip text,
  aal text,
  created_at timestamptz,
  updated_at timestamptz,
  not_after timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    id,
    user_agent,
    ip::text AS ip,
    aal::text AS aal,
    created_at,
    updated_at,
    not_after
  FROM auth.sessions
  WHERE user_id = auth.uid()
  ORDER BY COALESCE(updated_at, created_at) DESC;
$$;

REVOKE ALL ON FUNCTION public.rpc_list_user_sessions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_list_user_sessions() TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_revoke_user_session(target_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  found_one boolean;
BEGIN
  DELETE FROM auth.sessions
  WHERE id = target_session_id AND user_id = auth.uid()
  RETURNING true INTO found_one;
  RETURN COALESCE(found_one, false);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_revoke_user_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_revoke_user_session(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_revoke_other_user_sessions(current_session_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  rows_deleted integer;
BEGIN
  DELETE FROM auth.sessions
  WHERE user_id = auth.uid() AND id <> current_session_id;
  GET DIAGNOSTICS rows_deleted = ROW_COUNT;
  RETURN rows_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_revoke_other_user_sessions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_revoke_other_user_sessions(uuid) TO authenticated;

COMMENT ON FUNCTION public.rpc_list_user_sessions() IS
  'Sprint B (auth hardening) — returns the caller''s sessions for Settings → Sessions UI.';
COMMENT ON FUNCTION public.rpc_revoke_user_session(uuid) IS
  'Sprint B (auth hardening) — deletes one session belonging to the caller. Returns true if a row was deleted.';
COMMENT ON FUNCTION public.rpc_revoke_other_user_sessions(uuid) IS
  'Sprint B (auth hardening) — deletes all of the caller''s sessions except the current one. Returns count.';
