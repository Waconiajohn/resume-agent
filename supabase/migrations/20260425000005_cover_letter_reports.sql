-- Phase 3 (Pursuit Timeline) — cover_letter_reports persistence table.
--
-- Pre-existing oversight: the cover-letter SSE pipeline produced content but
-- never wrote it to a table. Without this row, the timeline cannot detect
-- "cover letter drafted for application X" and the N2 Next-rule cannot
-- evaluate. Phase 3 closes the gap: every successful gate approval upserts
-- one row per (user_id, job_application_id) — latest approved state wins.
-- Revision history is not preserved (v2 if ever needed).

CREATE TABLE IF NOT EXISTS public.cover_letter_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_application_id uuid REFERENCES public.job_applications(id) ON DELETE SET NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cover_letter_reports_user_application_unique
    UNIQUE (user_id, job_application_id)
);

ALTER TABLE public.cover_letter_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cover_letter_reports"
  ON public.cover_letter_reports
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cover_letter_reports"
  ON public.cover_letter_reports
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cover_letter_reports"
  ON public.cover_letter_reports
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own cover_letter_reports"
  ON public.cover_letter_reports
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_cover_letter_reports_user
  ON public.cover_letter_reports(user_id);

CREATE INDEX IF NOT EXISTS idx_cover_letter_reports_job_application
  ON public.cover_letter_reports(job_application_id)
  WHERE job_application_id IS NOT NULL;

CREATE TRIGGER update_cover_letter_reports_updated_at
  BEFORE UPDATE ON public.cover_letter_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
