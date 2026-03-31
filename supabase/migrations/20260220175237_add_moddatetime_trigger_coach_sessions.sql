-- Recovered from remote Supabase migration history (Phase 2A recovery).
-- This migration was applied to the remote DB at timestamp 20260220175237
-- but had no corresponding local file. SQL recovered verbatim from
-- supabase_migrations.schema_migrations on 2026-03-27.

-- Enable the moddatetime extension (idempotent)
CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

-- Auto-update updated_at on every UPDATE to coach_sessions
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.coach_sessions
  FOR EACH ROW
  EXECUTE FUNCTION extensions.moddatetime('updated_at');

-- Also update the claim_pipeline_slot RPC to explicitly set updated_at
CREATE OR REPLACE FUNCTION public.claim_pipeline_slot(p_session_id uuid, p_user_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $function$
DECLARE
  affected_rows integer;
BEGIN
  UPDATE coach_sessions
  SET pipeline_status = 'running',
      pipeline_stage = 'intake',
      pending_gate = NULL,
      pending_gate_data = NULL,
      updated_at = NOW()
  WHERE id = p_session_id
    AND user_id = p_user_id
    AND (pipeline_status IS NULL OR pipeline_status = 'error');

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows > 0;
END;
$function$;
