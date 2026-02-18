-- Add pipeline state columns to coach_sessions for persistence across restarts
ALTER TABLE coach_sessions
  ADD COLUMN IF NOT EXISTS pipeline_status text,
  ADD COLUMN IF NOT EXISTS pipeline_stage text,
  ADD COLUMN IF NOT EXISTS pending_gate text,
  ADD COLUMN IF NOT EXISTS pending_gate_data jsonb;

-- Index for finding sessions with active pipelines
CREATE INDEX IF NOT EXISTS idx_coach_sessions_pipeline_status
  ON coach_sessions (pipeline_status)
  WHERE pipeline_status IS NOT NULL;
