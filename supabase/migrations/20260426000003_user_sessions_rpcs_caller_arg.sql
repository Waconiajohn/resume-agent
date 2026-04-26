-- Sprint B (auth hardening) — sessions RPCs, take caller_user_id as arg.
--
-- Replaces the auth.uid()-based variants from the previous migration so
-- the backend (service-role client) can call them without piping a user
-- JWT into a per-request supabase client. The route's authMiddleware
-- has already verified the JWT and populated `user.id`; passing that
-- through is equivalent and avoids needing a SUPABASE_ANON_KEY env on
-- the server.
--
-- GRANT is service_role only — these functions are backend-private.

DROP FUNCTION IF EXISTS public.rpc_list_user_sessions();
DROP FUNCTION IF EXISTS public.rpc_revoke_user_session(uuid);
DROP FUNCTION IF EXISTS public.rpc_revoke_other_user_sessions(uuid);

CREATE OR REPLACE FUNCTION public.rpc_list_user_sessions(caller_user_id uuid)
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
  WHERE user_id = caller_user_id
  ORDER BY COALESCE(updated_at, created_at) DESC;
$$;

REVOKE ALL ON FUNCTION public.rpc_list_user_sessions(uuid) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rpc_list_user_sessions(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_revoke_user_session(caller_user_id uuid, target_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  found_one boolean;
BEGIN
  DELETE FROM auth.sessions
  WHERE id = target_session_id AND user_id = caller_user_id
  RETURNING true INTO found_one;
  RETURN COALESCE(found_one, false);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_revoke_user_session(uuid, uuid) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rpc_revoke_user_session(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_revoke_other_user_sessions(caller_user_id uuid, current_session_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  rows_deleted integer;
BEGIN
  DELETE FROM auth.sessions
  WHERE user_id = caller_user_id AND id <> current_session_id;
  GET DIAGNOSTICS rows_deleted = ROW_COUNT;
  RETURN rows_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_revoke_other_user_sessions(uuid, uuid) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rpc_revoke_other_user_sessions(uuid, uuid) TO service_role;
