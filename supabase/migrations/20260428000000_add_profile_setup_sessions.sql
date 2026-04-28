-- Durable profile setup interview sessions.
-- The setup flow can take 7-15 minutes, so keeping only process memory makes
-- deploys, restarts, and multi-instance routing painful for real users.

CREATE TABLE IF NOT EXISTS profile_setup_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profile_setup_sessions_user_active
  ON profile_setup_sessions (user_id, expires_at DESC);

ALTER TABLE profile_setup_sessions ENABLE ROW LEVEL SECURITY;
