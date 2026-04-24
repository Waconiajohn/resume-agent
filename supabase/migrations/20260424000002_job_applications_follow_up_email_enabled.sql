-- Phase 2.3d — Follow-Up Email toggle.
--
-- Nullable boolean on job_applications. NULL = "use stage-derived default"
-- (active when stage = 'interviewing' AND a thank-you-note has been sent
-- OR the most recent interview debrief is more than 3 days old). TRUE/FALSE =
-- explicit user override that wins over the default.
--
-- Sibling of interview_prep_enabled (Phase 2.3b, migration 20260424000000)
-- and offer_enabled (Phase 2.3c, migration 20260424000001). No index — column
-- is always read on single-row fetch by primary key.

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS follow_up_email_enabled BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN public.job_applications.follow_up_email_enabled IS
  'Phase 2.3d — explicit user override for Follow-Up Email tool visibility. NULL defers to the stage-derived default (active when stage = interviewing AND thank-you sent OR days-since-most-recent-debrief > 3; inactive when stage in offer/closed_won/closed_lost; otherwise inactive). TRUE forces active; FALSE forces inactive. Sets via PATCH /api/job-applications/:id; read on GET.';
