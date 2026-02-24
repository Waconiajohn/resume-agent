-- Security hardening patch for next_artifact_version RPC
-- Depends on: 20260224200000_harden_workflow_tables.sql
--
-- Changes from the original function (defined in 20260224200000):
--   1. Adds SET search_path = public, pg_temp (required for all SECURITY DEFINER functions)
--   2. Adds ownership guard — rejects callers who do not own the target session
--
-- Rollback:
--   Run the original CREATE OR REPLACE FUNCTION block from 20260224200000_harden_workflow_tables.sql
--   to restore the unguarded version (SECURITY DEFINER without search_path or ownership check).

CREATE OR REPLACE FUNCTION next_artifact_version(
  p_session_id  uuid,
  p_node_key    text,
  p_artifact_type text,
  p_payload     jsonb,
  p_created_by  text DEFAULT 'pipeline'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_version integer;
BEGIN
  -- Ownership guard: the calling user must own the target session.
  -- SECURITY DEFINER bypasses RLS, so we enforce authorization explicitly.
  IF NOT EXISTS (
    SELECT 1 FROM coach_sessions
    WHERE id = p_session_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: session % does not belong to the current user', p_session_id;
  END IF;

  INSERT INTO session_workflow_artifacts
    (session_id, node_key, artifact_type, version, payload, created_by)
  SELECT
    p_session_id,
    p_node_key,
    p_artifact_type,
    COALESCE(MAX(version), 0) + 1,
    p_payload,
    p_created_by
  FROM session_workflow_artifacts
  WHERE session_id    = p_session_id
    AND node_key      = p_node_key
    AND artifact_type = p_artifact_type
  RETURNING version INTO v_new_version;

  RETURN v_new_version;
END;
$$;
