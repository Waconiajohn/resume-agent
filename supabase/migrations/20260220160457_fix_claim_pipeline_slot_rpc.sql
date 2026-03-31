-- Recovered from remote Supabase migration history (Phase 2A recovery).
-- This migration was applied to the remote DB at timestamp 20260220160457
-- but had no corresponding local file. SQL recovered verbatim from
-- supabase_migrations.schema_migrations on 2026-03-27.
--
-- Note: This is an intermediate version of claim_pipeline_slot that returns
-- boolean. It was later overwritten by 20260220175237_add_moddatetime_trigger_coach_sessions.
-- The local repo also has an enhanced version in 20260228120000_add_claim_pipeline_slot_rpc.sql
-- that returns jsonb.

CREATE OR REPLACE FUNCTION public.claim_pipeline_slot(
  p_session_id uuid,
  p_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected_rows integer;
BEGIN
  UPDATE coach_sessions
  SET pipeline_status = 'running',
      pipeline_stage = 'intake',
      pending_gate = NULL,
      pending_gate_data = NULL
  WHERE id = p_session_id
    AND user_id = p_user_id
    AND (pipeline_status IS NULL OR pipeline_status = 'error');

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows > 0;
END;
$$;
