-- Migration: platform_context_upsert_index
-- Phase 2 Audit: Add unique constraint on (user_id, context_type, source_product)
-- to support atomic ON CONFLICT upsert in platform-context.ts.
-- Without this, concurrent pipeline completions can race on insert.

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_context_upsert_key
  ON user_platform_context(user_id, context_type, source_product);
