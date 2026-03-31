-- Migration: Per-user feature overrides
-- Allows a la carte feature grants, promos, and admin overrides
-- that take precedence over the user's plan entitlements.

CREATE TABLE user_feature_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  feature_key TEXT NOT NULL,
  feature_value JSONB NOT NULL,
  granted_by TEXT,                  -- 'purchase', 'promo', 'admin', 'affiliate'
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_user_overrides ON user_feature_overrides(user_id, feature_key);

-- RLS: only service role should access this table
ALTER TABLE user_feature_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON user_feature_overrides FOR ALL USING (false);

-- Rollback:
-- DROP TABLE IF EXISTS user_feature_overrides;
