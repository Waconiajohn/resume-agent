-- Personal Brand Audit Reports table
-- Stores completed brand audit reports with findings, scores, and recommendations.

CREATE TABLE personal_brand_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  report_markdown text,
  quality_score numeric,
  audit_findings jsonb,
  consistency_scores jsonb,
  recommendations jsonb,
  brand_sources jsonb,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE personal_brand_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own personal brand reports"
  ON personal_brand_reports
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can insert personal brand reports"
  ON personal_brand_reports
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
