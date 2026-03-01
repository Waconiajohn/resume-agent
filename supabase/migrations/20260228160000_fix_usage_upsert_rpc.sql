-- Fix: Replace client-side upsert with server-side atomic increment to prevent
-- delta values from overwriting accumulated totals.
--
-- The old approach used Supabase .upsert() which on conflict replaces columns
-- with the new values (deltas), losing previously accumulated totals.
-- This RPC uses INSERT ... ON CONFLICT DO UPDATE SET col = col + EXCLUDED.col
-- to properly increment.
--
-- Column names verified against migration 010_create_user_usage_table.sql:
--   total_input_tokens, total_output_tokens, sessions_count, total_cost_usd

CREATE OR REPLACE FUNCTION increment_user_usage(
  p_user_id UUID,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ,
  p_input_tokens INT DEFAULT 0,
  p_output_tokens INT DEFAULT 0,
  p_sessions INT DEFAULT 0,
  p_cost NUMERIC DEFAULT 0
) RETURNS VOID AS $$
INSERT INTO user_usage (user_id, period_start, period_end, total_input_tokens, total_output_tokens, sessions_count, total_cost_usd, updated_at)
VALUES (p_user_id, p_period_start, p_period_end, p_input_tokens, p_output_tokens, p_sessions, p_cost, NOW())
ON CONFLICT (user_id, period_start) DO UPDATE SET
  total_input_tokens = user_usage.total_input_tokens + EXCLUDED.total_input_tokens,
  total_output_tokens = user_usage.total_output_tokens + EXCLUDED.total_output_tokens,
  sessions_count = user_usage.sessions_count + EXCLUDED.sessions_count,
  total_cost_usd = user_usage.total_cost_usd + EXCLUDED.total_cost_usd,
  updated_at = NOW();
$$ LANGUAGE sql;

-- Rollback:
-- DROP FUNCTION IF EXISTS increment_user_usage(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT, INT, NUMERIC);
