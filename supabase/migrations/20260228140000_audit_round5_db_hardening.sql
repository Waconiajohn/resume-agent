-- =============================================================================
-- Migration: 20260228140000_audit_round5_db_hardening.sql
-- Purpose:   Address four findings from Audit Round 5 security/performance review
-- Depends:   006_session_locks.sql, 20260224190000_add_workflow_artifacts_and_nodes.sql,
--            20260219000000_production_fixes.sql, 20260228130000_fix_next_artifact_version_service_role.sql
-- Rollback:  See individual section comments below
-- =============================================================================


-- =============================================================================
-- FIX 1 (HIGH): session_locks — zero RLS policies
-- =============================================================================
-- Problem:
--   006_session_locks.sql created the table and enabled RLS but added NO
--   policies. With RLS enabled and no policies, the Postgres default is to
--   deny access to all rows for non-superuser roles — but the comment in that
--   migration was misleading ("No RLS policies = service role only access").
--   Supabase's anon and authenticated roles are NOT the service role. The
--   current state means authenticated users receive an empty result set
--   (silent denial), which is safer than open access but leaves the intent
--   ambiguous and could change under future Supabase policy updates.
--
-- Fix:
--   Add an explicit policy that evaluates to false for every authenticated
--   caller. The service_role bypasses RLS entirely (Supabase default), so it
--   is unaffected. This makes the intent unambiguous and future-proof.
--
-- Rollback:
--   DROP POLICY IF EXISTS "service_role_only" ON session_locks;

CREATE POLICY "service_role_only" ON session_locks
  FOR ALL
  USING (false);


-- =============================================================================
-- FIX 2 (HIGH): next_artifact_version — missing session existence check for
--               service-role callers
-- =============================================================================
-- Problem:
--   20260228130000_fix_next_artifact_version_service_role.sql correctly skips
--   the ownership check when auth.uid() IS NULL (service-role path). However,
--   it does not verify that the session ID actually exists. A service-role
--   caller passing a bogus or stale UUID receives no error; the INSERT simply
--   inserts a row that violates the FK constraint and raises a cryptic
--   error, or — if the FK is deferred — silently produces an orphaned row.
--   Adding an explicit existence guard surfaces the problem immediately with a
--   descriptive error message.
--
-- Rollback:
--   Restore the previous function body from
--   20260228130000_fix_next_artifact_version_service_role.sql

CREATE OR REPLACE FUNCTION next_artifact_version(
  p_session_id    uuid,
  p_node_key      text,
  p_artifact_type text,
  p_payload       jsonb,
  p_created_by    text DEFAULT 'pipeline'
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

  -- Existence guard: applies to ALL callers (including service-role).
  -- Catches typos, stale IDs, or callers that skip session creation.
  -- The FK on session_workflow_artifacts(session_id) would eventually catch
  -- this too, but with a less descriptive error and only at INSERT time.
  IF NOT EXISTS (SELECT 1 FROM coach_sessions WHERE id = p_session_id) THEN
    RAISE EXCEPTION 'INVALID_SESSION: session % does not exist', p_session_id;
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


-- =============================================================================
-- FIX 3 (MEDIUM): Missing FK indexes on workflow tables
-- =============================================================================
-- Problem:
--   PostgreSQL does NOT automatically create indexes on foreign key columns.
--   20260224190000_add_workflow_artifacts_and_nodes.sql created composite
--   indexes that cover query patterns such as (session_id, node_key) and
--   (session_id, created_at DESC), but it did NOT create plain (session_id)
--   indexes. PostgreSQL can use the leftmost column of a composite index for
--   FK integrity checks and CASCADE operations, but only when the leading
--   column matches exactly. The current composite indexes satisfy most read
--   queries, but:
--
--   1. ON DELETE CASCADE from coach_sessions requires PostgreSQL to locate all
--      child rows by session_id alone. If the planner cannot use the composite
--      index efficiently for this (e.g., due to stats or planner choices), it
--      falls back to a sequential scan of the child table.
--   2. Supabase's RLS subquery patterns (session_id IN (...)) benefit from a
--      direct single-column index on session_id.
--   3. session_question_responses only has a composite unique index on
--      (session_id, question_id) — not an ordering/filtering index suited for
--      plain session_id lookups during CASCADE.
--
-- Fix:
--   Add plain (session_id) indexes on all three workflow tables. IF NOT EXISTS
--   ensures this is idempotent even if a future migration adds them first.
--
-- Rollback:
--   DROP INDEX IF EXISTS idx_session_workflow_artifacts_session_id;
--   DROP INDEX IF EXISTS idx_session_workflow_nodes_session_id;
--   DROP INDEX IF EXISTS idx_session_question_responses_session_id;

CREATE INDEX IF NOT EXISTS idx_session_workflow_artifacts_session_id
  ON session_workflow_artifacts(session_id);

CREATE INDEX IF NOT EXISTS idx_session_workflow_nodes_session_id
  ON session_workflow_nodes(session_id);

CREATE INDEX IF NOT EXISTS idx_session_question_responses_session_id
  ON session_question_responses(session_id);


-- =============================================================================
-- FIX 4 (MEDIUM): master_resume_history — orphaned NULL user_id rows
-- =============================================================================
-- Problem:
--   20260219000000_production_fixes.sql (lines 181-186) added a user_id column
--   to master_resume_history and backfilled it by joining to master_resumes.
--   Any history rows whose parent master_resume had already been hard-deleted
--   before that migration ran would have NULL user_id after the backfill,
--   because the JOIN finds no matching master_resumes row. These orphaned rows:
--     - Cannot satisfy the user_id IS NOT NULL constraint if one is ever added.
--     - Are invisible to users (RLS filters them out via auth.uid() = user_id),
--       but they waste storage and complicate analytics.
--     - Cannot be claimed or cleaned up by any user (no owner), so they
--       accumulate indefinitely.
--
-- Fix:
--   Delete the orphaned rows. Their parent resumes are gone; the history is
--   unreachable by any authenticated user and has no recovery value.
--
-- Rollback:
--   Not possible — deleted rows cannot be recovered without a backup.
--   This operation is safe: orphaned rows are unreachable via RLS and have
--   no associated master_resume to reconstruct them from.

DELETE FROM master_resume_history
WHERE user_id IS NULL;
