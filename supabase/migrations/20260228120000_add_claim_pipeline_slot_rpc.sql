-- Migration: Add claim_pipeline_slot RPC
-- Date: 2026-02-28
-- Purpose: Atomic pipeline slot claim for coach_sessions.
--
-- The server calls this RPC instead of a plain PATCH because PostgREST does not
-- support conditional OR logic on UPDATE operations. A single SQL statement
-- guarantees that the status check and the update are performed atomically,
-- preventing two server instances from both believing they claimed the same slot.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS claim_pipeline_slot(uuid, uuid);
--   ALTER TABLE coach_sessions DROP COLUMN IF EXISTS pipeline_started_at;

-- ============================================================
-- 1. Add pipeline_started_at column to coach_sessions
--    Records when the most recent pipeline run was claimed.
--    NULL means the session has never had a pipeline run.
-- ============================================================

ALTER TABLE coach_sessions
  ADD COLUMN IF NOT EXISTS pipeline_started_at timestamptz;

-- ============================================================
-- 2. claim_pipeline_slot(p_session_id, p_user_id)
--
-- Returns: jsonb row on success, NULL when the slot cannot be claimed.
--
-- Success path  — pipeline_status is NOT 'running' AND session belongs to
--                 p_user_id:
--                   SET pipeline_status = 'running'
--                   SET pipeline_started_at = now()
--                   RETURN the updated row as jsonb (truthy to the caller)
--
-- Failure paths — Returns NULL (not an error) when:
--   * The session does not exist
--   * session.user_id != p_user_id  (ownership check)
--   * pipeline_status = 'running'   (already claimed)
--
-- Security: SECURITY DEFINER so the function runs as the owning role and
-- bypasses RLS.  GRANT is restricted to service_role only — this is called
-- exclusively from the backend admin client which uses the service key.
-- ============================================================

CREATE OR REPLACE FUNCTION claim_pipeline_slot(
  p_session_id uuid,
  p_user_id    uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row jsonb;
BEGIN
  UPDATE coach_sessions
  SET
    pipeline_status     = 'running',
    pipeline_started_at = now()
  WHERE id      = p_session_id
    AND user_id = p_user_id
    AND (pipeline_status IS NULL OR pipeline_status <> 'running')
  RETURNING to_jsonb(coach_sessions.*) INTO v_row;

  -- v_row is NULL when no row matched (session not found, wrong owner,
  -- or pipeline already running). The caller treats NULL as a 409.
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION claim_pipeline_slot(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_pipeline_slot(uuid, uuid) TO service_role;
