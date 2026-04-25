-- Phase 3 (Pursuit Timeline) — follow_up_email_reports persistence table.
--
-- Mirrors cover_letter_reports. The follow-up SSE pipeline produced content
-- but never persisted it. Without a row, the timeline cannot detect "follow-up
-- sent for application X" and the Done card has no source. Every successful
-- gate approval upserts one row per (user_id, job_application_id) — latest
-- approved state wins.

CREATE TABLE IF NOT EXISTS public.follow_up_email_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_application_id uuid REFERENCES public.job_applications(id) ON DELETE SET NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT follow_up_email_reports_user_application_unique
    UNIQUE (user_id, job_application_id)
);

ALTER TABLE public.follow_up_email_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own follow_up_email_reports"
  ON public.follow_up_email_reports
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own follow_up_email_reports"
  ON public.follow_up_email_reports
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own follow_up_email_reports"
  ON public.follow_up_email_reports
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own follow_up_email_reports"
  ON public.follow_up_email_reports
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_follow_up_email_reports_user
  ON public.follow_up_email_reports(user_id);

CREATE INDEX IF NOT EXISTS idx_follow_up_email_reports_job_application
  ON public.follow_up_email_reports(job_application_id)
  WHERE job_application_id IS NOT NULL;

CREATE TRIGGER update_follow_up_email_reports_updated_at
  BEFORE UPDATE ON public.follow_up_email_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
