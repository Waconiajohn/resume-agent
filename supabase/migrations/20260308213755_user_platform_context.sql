-- Platform context table: stores positioning strategy, evidence items, career narratives,
-- and target roles produced by the resume agent for cross-product access.

CREATE TABLE user_platform_context (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context_type     TEXT        NOT NULL CHECK (context_type IN ('positioning_strategy', 'evidence_item', 'career_narrative', 'target_role')),
  content          JSONB       NOT NULL DEFAULT '{}',
  source_product   TEXT        NOT NULL,
  source_session_id UUID       REFERENCES coach_sessions(id) ON DELETE SET NULL,
  version          INT         NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for the primary access pattern: look up a user's context by type
CREATE INDEX idx_user_platform_context_user_type
  ON user_platform_context (user_id, context_type);

-- RLS: users can only read/write their own rows
ALTER TABLE user_platform_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own context"
  ON user_platform_context
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own context"
  ON user_platform_context
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own context"
  ON user_platform_context
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own context"
  ON user_platform_context
  FOR DELETE
  USING (auth.uid() = user_id);
