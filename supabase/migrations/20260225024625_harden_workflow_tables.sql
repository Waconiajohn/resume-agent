-- Harden workflow tables: RLS, moddatetime triggers, CHECK constraints, atomic RPC
-- Depends on: 20260224190000_add_workflow_artifacts_and_nodes.sql
-- moddatetime extension already enabled by a previous migration

-- Rollback: DROP FUNCTION IF EXISTS next_artifact_version;
--           DROP TRIGGER IF EXISTS handle_updated_at ON session_workflow_nodes;
--           DROP TRIGGER IF EXISTS handle_updated_at ON session_question_responses;
--           ALTER TABLE session_workflow_nodes DROP CONSTRAINT IF EXISTS session_workflow_nodes_node_key_check;
--           ALTER TABLE session_workflow_artifacts DROP CONSTRAINT IF EXISTS session_workflow_artifacts_node_key_check;
--           ALTER TABLE session_workflow_artifacts DROP CONSTRAINT IF EXISTS session_workflow_artifacts_artifact_type_length_check;
--           DROP POLICY IF EXISTS ... (all policies below)
--           ALTER TABLE session_workflow_nodes DISABLE ROW LEVEL SECURITY;
--           ALTER TABLE session_workflow_artifacts DISABLE ROW LEVEL SECURITY;
--           ALTER TABLE session_question_responses DISABLE ROW LEVEL SECURITY;

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK CONSTRAINTS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE session_workflow_nodes
  ADD CONSTRAINT session_workflow_nodes_node_key_check
  CHECK (node_key IN ('overview','benchmark','gaps','questions','blueprint','sections','quality','export'));

ALTER TABLE session_workflow_artifacts
  ADD CONSTRAINT session_workflow_artifacts_node_key_check
  CHECK (node_key IN ('overview','benchmark','gaps','questions','blueprint','sections','quality','export'));

ALTER TABLE session_workflow_artifacts
  ADD CONSTRAINT session_workflow_artifacts_artifact_type_length_check
  CHECK (char_length(artifact_type) <= 100);

-- ─────────────────────────────────────────────────────────────────────────────
-- MODDATETIME TRIGGERS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON session_workflow_nodes
  FOR EACH ROW
  EXECUTE PROCEDURE moddatetime(updated_at);

CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON session_question_responses
  FOR EACH ROW
  EXECUTE PROCEDURE moddatetime(updated_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────

-- session_workflow_nodes
ALTER TABLE session_workflow_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY session_workflow_nodes_select ON session_workflow_nodes
  FOR SELECT USING (
    session_id IN (SELECT id FROM coach_sessions WHERE user_id = auth.uid())
  );

CREATE POLICY session_workflow_nodes_insert ON session_workflow_nodes
  FOR INSERT WITH CHECK (
    session_id IN (SELECT id FROM coach_sessions WHERE user_id = auth.uid())
  );

CREATE POLICY session_workflow_nodes_update ON session_workflow_nodes
  FOR UPDATE USING (
    session_id IN (SELECT id FROM coach_sessions WHERE user_id = auth.uid())
  );

CREATE POLICY session_workflow_nodes_delete ON session_workflow_nodes
  FOR DELETE USING (
    session_id IN (SELECT id FROM coach_sessions WHERE user_id = auth.uid())
  );

-- session_workflow_artifacts
ALTER TABLE session_workflow_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY session_workflow_artifacts_select ON session_workflow_artifacts
  FOR SELECT USING (
    session_id IN (SELECT id FROM coach_sessions WHERE user_id = auth.uid())
  );

CREATE POLICY session_workflow_artifacts_insert ON session_workflow_artifacts
  FOR INSERT WITH CHECK (
    session_id IN (SELECT id FROM coach_sessions WHERE user_id = auth.uid())
  );

CREATE POLICY session_workflow_artifacts_update ON session_workflow_artifacts
  FOR UPDATE USING (
    session_id IN (SELECT id FROM coach_sessions WHERE user_id = auth.uid())
  );

CREATE POLICY session_workflow_artifacts_delete ON session_workflow_artifacts
  FOR DELETE USING (
    session_id IN (SELECT id FROM coach_sessions WHERE user_id = auth.uid())
  );

-- session_question_responses
ALTER TABLE session_question_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY session_question_responses_select ON session_question_responses
  FOR SELECT USING (
    session_id IN (SELECT id FROM coach_sessions WHERE user_id = auth.uid())
  );

CREATE POLICY session_question_responses_insert ON session_question_responses
  FOR INSERT WITH CHECK (
    session_id IN (SELECT id FROM coach_sessions WHERE user_id = auth.uid())
  );

CREATE POLICY session_question_responses_update ON session_question_responses
  FOR UPDATE USING (
    session_id IN (SELECT id FROM coach_sessions WHERE user_id = auth.uid())
  );

CREATE POLICY session_question_responses_delete ON session_question_responses
  FOR DELETE USING (
    session_id IN (SELECT id FROM coach_sessions WHERE user_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- ATOMIC next_artifact_version RPC
-- ─────────────────────────────────────────────────────────────────────────────
-- Inserts a new artifact row with version = MAX(existing versions) + 1,
-- computed atomically in a single INSERT ... SELECT to avoid read-then-write races.
-- Returns the new version integer.

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
AS $$
DECLARE
  v_new_version integer;
BEGIN
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

COMMIT;
