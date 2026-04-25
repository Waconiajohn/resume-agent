-- Phase 3 (Pursuit Timeline) — backfill thank_you_note_reports with the
-- standardized job_application_id FK that other peer-tool reports use.
--
-- The original table predated the FK pattern (see interview_prep_reports,
-- cover_letter_reports, follow_up_email_reports — all of which carry
-- job_application_id). Without this column, the timeline cannot detect "thank
-- you sent for application X" and the N6 "send your thank-you within 48hrs"
-- rule cannot evaluate.
--
-- Existing rows get NULL — they predate this work and won't surface in any
-- per-application timeline view, which is fine.

ALTER TABLE public.thank_you_note_reports
  ADD COLUMN IF NOT EXISTS job_application_id uuid
  REFERENCES public.job_applications(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_thank_you_note_reports_job_application
  ON public.thank_you_note_reports(job_application_id)
  WHERE job_application_id IS NOT NULL;
