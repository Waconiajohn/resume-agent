-- Workflow checkpoints and versioned artifacts for navigable resume workspace

BEGIN;

CREATE TABLE IF NOT EXISTS session_workflow_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES coach_sessions(id) ON DELETE CASCADE,
  node_key text NOT NULL,
  status text NOT NULL DEFAULT 'locked',
  active_version integer,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_workflow_nodes_status_check
    CHECK (status IN ('locked', 'ready', 'in_progress', 'blocked', 'complete', 'stale'))
);

CREATE UNIQUE INDEX IF NOT EXISTS session_workflow_nodes_session_node_idx
  ON session_workflow_nodes(session_id, node_key);

CREATE INDEX IF NOT EXISTS session_workflow_nodes_session_updated_idx
  ON session_workflow_nodes(session_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS session_workflow_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES coach_sessions(id) ON DELETE CASCADE,
  node_key text NOT NULL,
  artifact_type text NOT NULL,
  version integer NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL DEFAULT 'pipeline',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS session_workflow_artifacts_session_node_type_version_idx
  ON session_workflow_artifacts(session_id, node_key, artifact_type, version);

CREATE INDEX IF NOT EXISTS session_workflow_artifacts_session_node_created_idx
  ON session_workflow_artifacts(session_id, node_key, created_at DESC);

CREATE INDEX IF NOT EXISTS session_workflow_artifacts_session_created_idx
  ON session_workflow_artifacts(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS session_question_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES coach_sessions(id) ON DELETE CASCADE,
  question_id text NOT NULL,
  stage text NOT NULL,
  status text NOT NULL,
  response jsonb,
  impact_tag text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_question_responses_status_check
    CHECK (status IN ('answered', 'skipped', 'deferred'))
);

CREATE UNIQUE INDEX IF NOT EXISTS session_question_responses_session_question_idx
  ON session_question_responses(session_id, question_id);

CREATE INDEX IF NOT EXISTS session_question_responses_session_stage_idx
  ON session_question_responses(session_id, stage, updated_at DESC);

COMMIT;
