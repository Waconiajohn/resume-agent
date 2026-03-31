-- Thank You Note Reports table for Agent #18
-- Stores generated thank-you note collections with quality scores

CREATE TABLE thank_you_note_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  report_markdown text,
  quality_score numeric,
  notes jsonb,
  interview_context jsonb,
  created_at timestamptz DEFAULT now()
);

-- Row-Level Security
ALTER TABLE thank_you_note_reports ENABLE ROW LEVEL SECURITY;

-- Users can select their own rows
CREATE POLICY "Users can view own thank_you_note_reports"
  ON thank_you_note_reports
  FOR SELECT
  USING (auth.uid() = user_id);

-- Authenticated users can insert rows
CREATE POLICY "Authenticated users can insert thank_you_note_reports"
  ON thank_you_note_reports
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
