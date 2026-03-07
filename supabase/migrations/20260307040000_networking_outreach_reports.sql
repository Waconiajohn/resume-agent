-- Networking Outreach Reports table for Agent #13
CREATE TABLE IF NOT EXISTS networking_outreach_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_name text NOT NULL DEFAULT '',
  target_company text NOT NULL DEFAULT '',
  target_title text NOT NULL DEFAULT '',
  report_markdown text NOT NULL DEFAULT '',
  quality_score integer DEFAULT 0,
  messages jsonb DEFAULT '[]'::jsonb,
  target_analysis jsonb DEFAULT '{}'::jsonb,
  common_ground jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_networking_outreach_reports_user_id ON networking_outreach_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_networking_outreach_reports_created_at ON networking_outreach_reports(created_at DESC);

-- RLS
ALTER TABLE networking_outreach_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own networking outreach reports"
  ON networking_outreach_reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own networking outreach reports"
  ON networking_outreach_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own networking outreach reports"
  ON networking_outreach_reports FOR UPDATE
  USING (auth.uid() = user_id);

-- Updated_at trigger
CREATE TRIGGER set_networking_outreach_reports_updated_at
  BEFORE UPDATE ON networking_outreach_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
