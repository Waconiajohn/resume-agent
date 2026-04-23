-- Phase 2.3c — Offer / Negotiation toggle.
--
-- Nullable boolean on job_applications. NULL = "use stage-derived default"
-- (active when stage = 'offer'). TRUE/FALSE = explicit user override that
-- wins over the default.
--
-- Sibling of interview_prep_enabled (Phase 2.3b, migration 20260424000000).
-- No index — column is always read on single-row fetch by primary key.

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS offer_enabled BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN public.job_applications.offer_enabled IS
  'Phase 2.3c — explicit user override for Offer & Negotiation tool visibility. NULL defers to the stage-derived default (active when stage = offer). TRUE forces active; FALSE forces inactive. Sets via PATCH /api/job-applications/:id; read on GET.';
