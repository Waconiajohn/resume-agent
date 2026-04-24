-- Phase 2.3e — Thank-You Note toggle.
--
-- Nullable boolean on job_applications. NULL = "use stage-derived default"
-- (active when stage IN ('screening', 'interviewing'); inactive for
-- offer/closed_won/closed_lost; inactive otherwise). TRUE/FALSE = explicit
-- user override that wins over the default.
--
-- Sibling of interview_prep_enabled (2.3b, migration 20260424000000),
-- offer_enabled (2.3c, migration 20260424000001), and
-- follow_up_email_enabled (2.3d, migration 20260424000002). No index —
-- column is always read on single-row fetch by primary key.

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS thank_you_note_enabled BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN public.job_applications.thank_you_note_enabled IS
  'Phase 2.3e — explicit user override for Thank-You Note tool visibility. NULL defers to the stage-derived default (active when stage in screening/interviewing; inactive for offer/closed_won/closed_lost; inactive otherwise). TRUE forces active; FALSE forces inactive. Sets via PATCH /api/job-applications/:id; read on GET.';
