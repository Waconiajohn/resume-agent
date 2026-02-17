-- Migration 012: Create user_positioning_profiles table and add FK to coach_sessions
-- Stores the persistent "Why Me" positioning profile per user for the v2 multi-agent architecture.
-- One active profile per user (UNIQUE on user_id). Version increments on each update.

-- Rollback:
-- ALTER TABLE coach_sessions DROP COLUMN IF EXISTS positioning_profile_id;
-- DROP TABLE IF EXISTS user_positioning_profiles;

BEGIN;

CREATE TABLE IF NOT EXISTS user_positioning_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  positioning_data jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE user_positioning_profiles ENABLE ROW LEVEL SECURITY;

-- Users can manage (read, insert, update, delete) their own positioning profile
CREATE POLICY "Users can manage own positioning profile"
  ON user_positioning_profiles
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Index for efficient lookup by user
CREATE INDEX IF NOT EXISTS idx_user_positioning_profiles_user_id
  ON user_positioning_profiles(user_id);

-- Add FK from coach_sessions to user_positioning_profiles
-- Links a session to the positioning profile that was active when the session was created
ALTER TABLE coach_sessions
  ADD COLUMN IF NOT EXISTS positioning_profile_id uuid
    REFERENCES user_positioning_profiles(id) ON DELETE SET NULL;

-- Index for reverse lookup: find all sessions that used a given positioning profile
CREATE INDEX IF NOT EXISTS idx_coach_sessions_positioning_profile_id
  ON coach_sessions(positioning_profile_id)
  WHERE positioning_profile_id IS NOT NULL;

COMMIT;
