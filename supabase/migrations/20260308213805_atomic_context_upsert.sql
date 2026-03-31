-- Atomic upsert for platform context with version increment.
-- Eliminates the read-then-write race condition in upsertUserContext().
CREATE OR REPLACE FUNCTION upsert_platform_context(
  p_user_id uuid,
  p_context_type text,
  p_source_product text,
  p_content jsonb,
  p_source_session_id uuid DEFAULT NULL
) RETURNS SETOF user_platform_context AS $$
INSERT INTO user_platform_context (user_id, context_type, source_product, content, source_session_id, version)
VALUES (p_user_id, p_context_type, p_source_product, p_content, p_source_session_id, 1)
ON CONFLICT (user_id, context_type, source_product)
DO UPDATE SET
  content = EXCLUDED.content,
  source_session_id = EXCLUDED.source_session_id,
  version = user_platform_context.version + 1,
  updated_at = now()
RETURNING *;
$$ LANGUAGE sql;
