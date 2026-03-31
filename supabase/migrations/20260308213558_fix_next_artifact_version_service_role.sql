-- Fix next_artifact_version: allow service-role callers
--
-- Problem: auth.uid() returns NULL for service-role callers (supabaseAdmin).
-- The ownership guard always fails, silently blocking all workflow artifact persistence.
--
-- Fix: Skip ownership check when auth.uid() IS NULL (service-role is trusted).
-- When called by a regular user (auth.uid() IS NOT NULL), enforce ownership as before.

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
  -- Ownership guard: enforce for authenticated users only.
  -- Service-role callers (auth.uid() IS NULL) are trusted and skip this check.
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM coach_sessions
      WHERE id = p_session_id AND user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'UNAUTHORIZED: session % does not belong to the current user', p_session_id;
    END IF;
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
