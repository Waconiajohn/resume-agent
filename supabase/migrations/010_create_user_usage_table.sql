-- Migration 010: Create user_usage table for per-period usage tracking
-- Aggregates session counts, token usage, and cost per billing period

CREATE TABLE IF NOT EXISTS user_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  sessions_count integer DEFAULT 0,
  total_input_tokens bigint DEFAULT 0,
  total_output_tokens bigint DEFAULT 0,
  total_cost_usd numeric(10,6) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, period_start)
);

ALTER TABLE user_usage ENABLE ROW LEVEL SECURITY;

-- Users can only read their own usage records
CREATE POLICY "Users can read own usage" ON user_usage
  FOR SELECT USING (user_id = (select auth.uid()));

-- Index for efficient lookup by user + period
CREATE INDEX IF NOT EXISTS idx_user_usage_user_period ON user_usage(user_id, period_start DESC);

-- Rollback:
-- DROP INDEX IF EXISTS idx_user_usage_user_period;
-- DROP POLICY IF EXISTS "Users can read own usage" ON user_usage;
-- DROP TABLE IF EXISTS user_usage;
