-- Onboarding Assessment Agent — Assessment results storage
-- Phase 1A of the CareerIQ Master Build Plan
-- Stores structured assessment sessions including questions, responses,
-- derived client profile, and financial segment classification.

CREATE TABLE onboarding_assessments (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id         TEXT        NOT NULL,
  questions          JSONB       NOT NULL DEFAULT '[]',
  responses          JSONB       NOT NULL DEFAULT '{}',
  client_profile     JSONB,
  assessment_summary JSONB,
  financial_segment  TEXT        CHECK (financial_segment IN ('crisis', 'stressed', 'ideal', 'comfortable')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary access pattern: look up assessments by user
CREATE INDEX idx_onboarding_assessments_user_id
  ON onboarding_assessments (user_id);

-- Secondary access pattern: look up by external session identifier
CREATE INDEX idx_onboarding_assessments_session_id
  ON onboarding_assessments (session_id);

-- RLS
ALTER TABLE onboarding_assessments ENABLE ROW LEVEL SECURITY;

-- Users can read their own assessments
CREATE POLICY "Users can read own assessments"
  ON onboarding_assessments
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role inserts on behalf of the server pipeline (no user_id restriction at DB layer)
CREATE POLICY "Service role can insert assessments"
  ON onboarding_assessments
  FOR INSERT
  WITH CHECK (true);

-- Service role updates on behalf of the server pipeline
CREATE POLICY "Service role can update assessments"
  ON onboarding_assessments
  FOR UPDATE
  USING (true);

-- Ensure moddatetime extension exists (may already exist from earlier migrations)
CREATE EXTENSION IF NOT EXISTS moddatetime;

-- Auto-update updated_at on row modification
CREATE TRIGGER set_onboarding_assessments_updated_at
  BEFORE UPDATE ON onboarding_assessments
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);
