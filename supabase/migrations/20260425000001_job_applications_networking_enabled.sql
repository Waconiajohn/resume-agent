-- Phase 2.3f — Networking Message toggle.
--
-- Nullable boolean on job_applications. NULL = "use stage-derived default"
-- (active on all non-terminal stages: saved/researching/applied/screening/
-- interviewing; inactive on offer/closed_won/closed_lost). TRUE/FALSE =
-- explicit user override.
--
-- Sibling of interview_prep_enabled (2.3b), offer_enabled (2.3c),
-- follow_up_email_enabled (2.3d), thank_you_note_enabled (2.3e).
-- No index — column is always read on single-row fetch by primary key.

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS networking_enabled BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN public.job_applications.networking_enabled IS
  'Phase 2.3f — explicit user override for Networking Message tool visibility. NULL defers to the stage-derived default (active on saved/researching/applied/screening/interviewing; inactive on offer/closed_won/closed_lost). TRUE forces active; FALSE forces inactive. Sets via PATCH /api/job-applications/:id; read on GET.';
