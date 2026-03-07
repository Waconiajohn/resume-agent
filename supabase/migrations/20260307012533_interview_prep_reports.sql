-- Interview Prep Reports table
-- Stores generated interview preparation documents for the Interview Prep Agent (#10).
-- One report per user + job application combination.

CREATE TABLE IF NOT EXISTS public.interview_prep_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_application_id UUID REFERENCES public.job_applications(id) ON DELETE SET NULL,
  company_name TEXT NOT NULL,
  role_title TEXT NOT NULL,
  resume_text TEXT,
  job_description TEXT,
  report_markdown TEXT NOT NULL,
  quality_score INTEGER DEFAULT 0,
  company_research JSONB,
  sourced_questions JSONB,
  career_story_questions JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.interview_prep_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own interview prep reports"
  ON public.interview_prep_reports
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own interview prep reports"
  ON public.interview_prep_reports
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own interview prep reports"
  ON public.interview_prep_reports
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own interview prep reports"
  ON public.interview_prep_reports
  FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_interview_prep_reports_user_id
  ON public.interview_prep_reports(user_id);

CREATE INDEX IF NOT EXISTS idx_interview_prep_reports_job_application
  ON public.interview_prep_reports(job_application_id)
  WHERE job_application_id IS NOT NULL;

-- Updated_at trigger (reuse existing function if available)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_interview_prep_reports_updated_at
  BEFORE UPDATE ON public.interview_prep_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ROLLBACK: DROP TABLE IF EXISTS public.interview_prep_reports;
