-- Job Tracker Reports table for Agent #14
CREATE TABLE IF NOT EXISTS job_tracker_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  application_count integer NOT NULL DEFAULT 0,
  report_markdown text NOT NULL DEFAULT '',
  quality_score integer DEFAULT 0,
  application_analyses jsonb DEFAULT '[]'::jsonb,
  portfolio_analytics jsonb DEFAULT '{}'::jsonb,
  follow_up_messages jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_job_tracker_reports_user_id ON job_tracker_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_job_tracker_reports_created_at ON job_tracker_reports(created_at DESC);

-- RLS
ALTER TABLE job_tracker_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own job tracker reports"
  ON job_tracker_reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own job tracker reports"
  ON job_tracker_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own job tracker reports"
  ON job_tracker_reports FOR UPDATE
  USING (auth.uid() = user_id);

-- Updated_at trigger
CREATE TRIGGER set_job_tracker_reports_updated_at
  BEFORE UPDATE ON job_tracker_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
