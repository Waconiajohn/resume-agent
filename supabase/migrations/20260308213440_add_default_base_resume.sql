-- Add explicit default-base tracking for master resumes.
-- This supports "save as default base resume for next session" behavior.

BEGIN;

ALTER TABLE master_resumes
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

ALTER TABLE master_resumes
  ADD COLUMN IF NOT EXISTS source_session_id uuid REFERENCES coach_sessions(id) ON DELETE SET NULL;

-- Enforce at most one default resume per user.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_master_resumes_default_per_user
  ON master_resumes(user_id)
  WHERE is_default;

-- Backfill: if a user has resumes but no default yet, set the most recent resume as default.
WITH latest_without_default AS (
  SELECT DISTINCT ON (mr.user_id) mr.id, mr.user_id
  FROM master_resumes mr
  WHERE NOT EXISTS (
    SELECT 1
    FROM master_resumes d
    WHERE d.user_id = mr.user_id
      AND d.is_default = true
  )
  ORDER BY mr.user_id, mr.updated_at DESC, mr.created_at DESC, mr.id DESC
)
UPDATE master_resumes m
SET is_default = true
FROM latest_without_default l
WHERE m.id = l.id;

COMMIT;

