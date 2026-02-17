-- Migration 009: Add cost tracking columns to coach_sessions
-- Tracks per-session token usage breakdown and estimated cost

ALTER TABLE coach_sessions ADD COLUMN IF NOT EXISTS input_tokens_used integer DEFAULT 0;
ALTER TABLE coach_sessions ADD COLUMN IF NOT EXISTS output_tokens_used integer DEFAULT 0;
ALTER TABLE coach_sessions ADD COLUMN IF NOT EXISTS estimated_cost_usd numeric(10,6) DEFAULT 0;
ALTER TABLE coach_sessions ADD COLUMN IF NOT EXISTS llm_provider text DEFAULT 'zai';
ALTER TABLE coach_sessions ADD COLUMN IF NOT EXISTS llm_model text;

-- Rollback:
-- ALTER TABLE coach_sessions DROP COLUMN IF EXISTS input_tokens_used;
-- ALTER TABLE coach_sessions DROP COLUMN IF EXISTS output_tokens_used;
-- ALTER TABLE coach_sessions DROP COLUMN IF EXISTS estimated_cost_usd;
-- ALTER TABLE coach_sessions DROP COLUMN IF EXISTS llm_provider;
-- ALTER TABLE coach_sessions DROP COLUMN IF EXISTS llm_model;
