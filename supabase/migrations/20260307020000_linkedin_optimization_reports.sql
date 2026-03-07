-- LinkedIn Optimization Reports table
-- Stores generated LinkedIn profile optimization reports for the LinkedIn Optimizer Agent (#11).
-- One report per pipeline run. Multiple reports per user are allowed (re-optimization).

-- Ensure updated_at trigger function exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TABLE IF NOT EXISTS public.linkedin_optimization_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_application_id UUID REFERENCES public.job_applications(id) ON DELETE SET NULL,
  target_role TEXT NOT NULL DEFAULT '',
  target_industry TEXT NOT NULL DEFAULT '',
  report_markdown TEXT NOT NULL,
  quality_score INTEGER DEFAULT 0,
  sections JSONB DEFAULT '{}'::jsonb,
  keyword_analysis JSONB DEFAULT '{}'::jsonb,
  profile_analysis JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.linkedin_optimization_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own linkedin optimization reports"
  ON public.linkedin_optimization_reports
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own linkedin optimization reports"
  ON public.linkedin_optimization_reports
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own linkedin optimization reports"
  ON public.linkedin_optimization_reports
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own linkedin optimization reports"
  ON public.linkedin_optimization_reports
  FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_linkedin_optimization_reports_user_id
  ON public.linkedin_optimization_reports(user_id);

CREATE INDEX IF NOT EXISTS idx_linkedin_optimization_reports_job_application
  ON public.linkedin_optimization_reports(job_application_id)
  WHERE job_application_id IS NOT NULL;

-- Updated_at trigger
CREATE TRIGGER update_linkedin_optimization_reports_updated_at
  BEFORE UPDATE ON public.linkedin_optimization_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ROLLBACK: DROP TABLE IF EXISTS public.linkedin_optimization_reports;
