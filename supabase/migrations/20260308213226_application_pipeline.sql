-- Application Pipeline table for Phase 3A: Job Command Center
-- Kanban-style job application tracking with stage transitions

CREATE TABLE IF NOT EXISTS application_pipeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_title text NOT NULL,
  company_name text NOT NULL,
  company_id uuid,
  stage text NOT NULL DEFAULT 'saved'
    CHECK (stage IN ('saved', 'researching', 'applied', 'screening', 'interviewing', 'offer', 'closed_won', 'closed_lost')),
  source text,
  url text,
  applied_date timestamptz,
  last_touch_date timestamptz,
  next_action text,
  next_action_due timestamptz,
  resume_version_id uuid,
  notes text,
  stage_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  score integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE application_pipeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own application pipeline entries"
  ON application_pipeline FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_application_pipeline_user_id ON application_pipeline(user_id);
CREATE INDEX idx_application_pipeline_stage ON application_pipeline(user_id, stage);
CREATE INDEX idx_application_pipeline_next_action ON application_pipeline(user_id, next_action_due)
  WHERE next_action_due IS NOT NULL;

-- moddatetime trigger for updated_at
CREATE TRIGGER application_pipeline_updated_at
  BEFORE UPDATE ON application_pipeline
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);
