-- Phase 2.3b — Interview Prep toggle.
--
-- Nullable boolean on job_applications. NULL = "use stage-derived default"
-- (active when stage in 'screening' / 'interviewing'). TRUE/FALSE = explicit
-- user override that wins over the default.
--
-- No index: the column is always read on single-row fetch by primary key.

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS interview_prep_enabled BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN public.job_applications.interview_prep_enabled IS
  'Phase 2.3b — explicit user override for Interview Prep tool visibility. NULL defers to the stage-derived default (active when stage in screening/interviewing). TRUE forces active; FALSE forces inactive. Sets via PATCH /api/job-applications/:id; read on GET.';
