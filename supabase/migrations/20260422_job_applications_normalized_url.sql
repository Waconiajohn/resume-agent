-- Phase 3 — normalized_url column on job_applications.
--
-- The legacy application_pipeline table had this column (populated by the
-- Chrome extension when it discovers a job URL). Phase 3 consolidates
-- everything onto job_applications, and the extension surfaces need
-- somewhere to write URL-normalized lookups. Additive + nullable so no
-- existing rows are affected.
--
-- Unique (user_id, normalized_url) matches the extension's ON CONFLICT
-- clause and prevents duplicate rows from repeat visits to the same URL.

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS normalized_url TEXT NULL;

COMMENT ON COLUMN public.job_applications.normalized_url IS
  'Canonicalized form of the job_url used for extension deduplication.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_applications_user_normalized_url
  ON public.job_applications(user_id, normalized_url)
  WHERE normalized_url IS NOT NULL;
