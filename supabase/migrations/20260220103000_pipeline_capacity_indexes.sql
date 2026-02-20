-- Optimize high-frequency pipeline capacity and stale-recovery queries.
-- These routes filter on pipeline_status='running' and sort/filter by updated_at.

CREATE INDEX IF NOT EXISTS idx_coach_sessions_running_updated_at
  ON coach_sessions(updated_at DESC)
  WHERE pipeline_status = 'running';

CREATE INDEX IF NOT EXISTS idx_coach_sessions_user_running_updated_at
  ON coach_sessions(user_id, updated_at DESC)
  WHERE pipeline_status = 'running';
