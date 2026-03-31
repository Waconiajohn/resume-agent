-- Migration: Plan feature entitlements
-- Creates the plan_features table with per-plan feature entitlements.
-- No FK to pricing_plans intentionally — plan_id is a plain text key
-- ('free', 'starter', 'pro') matched at the application layer.

CREATE TABLE plan_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  feature_value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_plan_features_plan_key ON plan_features(plan_id, feature_key);

-- RLS: service role only (no user-facing access needed)
ALTER TABLE plan_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON plan_features FOR ALL USING (false);

-- Seed entitlements for each plan tier
INSERT INTO plan_features (plan_id, feature_key, feature_value) VALUES
  -- Free plan
  ('free', 'sessions_per_month', '{"limit": 3}'),
  ('free', 'export_pdf', '{"enabled": true}'),
  ('free', 'export_docx', '{"enabled": false}'),
  ('free', 'deep_research', '{"enabled": false}'),
  -- Starter plan
  ('starter', 'sessions_per_month', '{"limit": 15}'),
  ('starter', 'export_pdf', '{"enabled": true}'),
  ('starter', 'export_docx', '{"enabled": true}'),
  ('starter', 'deep_research', '{"enabled": true}'),
  -- Pro plan
  ('pro', 'sessions_per_month', '{"limit": 50}'),
  ('pro', 'export_pdf', '{"enabled": true}'),
  ('pro', 'export_docx', '{"enabled": true}'),
  ('pro', 'deep_research', '{"enabled": true}');

-- Rollback:
-- DROP TABLE IF EXISTS plan_features;
