-- Migration: Add missing DELETE policies on core tables
--
-- Context:
--   master_resumes, job_applications, coach_sessions: DELETE policies were created in
--   003_delete_policies_and_indexes.sql. This migration is idempotent — DROP IF EXISTS
--   followed by CREATE handles both a fresh database (003 was never applied) and an
--   existing one (003 already applied). The DROP is a no-op when the policy is absent.
--
--   why_me_stories (20260306120000_why_me_stories.sql): Created with SELECT, INSERT, and
--   UPDATE policies only. No DELETE policy was ever added. Users must be able to delete
--   their own story row (e.g. to reset their Why-Me answers).
--
-- Pattern: USING (auth.uid() = user_id) — users may only delete their own rows.
--
-- Rollback:
--   DROP POLICY IF EXISTS "Users can delete own resumes"    ON master_resumes;
--   DROP POLICY IF EXISTS "Users can delete own applications" ON job_applications;
--   DROP POLICY IF EXISTS "Users can delete own sessions"   ON coach_sessions;
--   DROP POLICY IF EXISTS "Users can delete own story"      ON why_me_stories;

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────────
-- master_resumes
-- ──────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can delete own resumes"
  ON master_resumes;

CREATE POLICY "Users can delete own resumes"
  ON master_resumes
  FOR DELETE
  USING (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- job_applications
-- ──────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can delete own applications"
  ON job_applications;

CREATE POLICY "Users can delete own applications"
  ON job_applications
  FOR DELETE
  USING (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- coach_sessions
-- ──────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can delete own sessions"
  ON coach_sessions;

CREATE POLICY "Users can delete own sessions"
  ON coach_sessions
  FOR DELETE
  USING (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- why_me_stories  (no DELETE policy existed in the original migration)
-- ──────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can delete own story"
  ON why_me_stories;

CREATE POLICY "Users can delete own story"
  ON why_me_stories
  FOR DELETE
  USING (auth.uid() = user_id);

COMMIT;
