-- Content Calendar Reports table
-- Stores generated content calendar reports for the Content Calendar Agent (#12).

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TABLE IF NOT EXISTS public.content_calendar_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_role TEXT NOT NULL DEFAULT '',
  target_industry TEXT NOT NULL DEFAULT '',
  report_markdown TEXT NOT NULL,
  quality_score INTEGER DEFAULT 0,
  coherence_score INTEGER DEFAULT 0,
  post_count INTEGER DEFAULT 0,
  themes JSONB DEFAULT '[]'::jsonb,
  content_mix JSONB DEFAULT '{}'::jsonb,
  posts JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.content_calendar_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own content calendar reports"
  ON public.content_calendar_reports
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own content calendar reports"
  ON public.content_calendar_reports
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own content calendar reports"
  ON public.content_calendar_reports
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own content calendar reports"
  ON public.content_calendar_reports
  FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_content_calendar_reports_user_id
  ON public.content_calendar_reports(user_id);

-- Updated_at trigger
CREATE TRIGGER update_content_calendar_reports_updated_at
  BEFORE UPDATE ON public.content_calendar_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ROLLBACK: DROP TABLE IF EXISTS public.content_calendar_reports;
