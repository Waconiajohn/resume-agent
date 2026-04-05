-- Feedback Loop Instrumentation — Feature 5
-- Adds stories_used JSONB column to interview_prep_reports to track which
-- STAR+R stories from the Story Bank were loaded or newly created during
-- each interview prep session.

ALTER TABLE public.interview_prep_reports
  ADD COLUMN IF NOT EXISTS stories_used JSONB;

-- ROLLBACK: ALTER TABLE public.interview_prep_reports DROP COLUMN IF EXISTS stories_used;
