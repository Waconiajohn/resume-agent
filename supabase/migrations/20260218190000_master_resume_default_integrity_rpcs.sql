-- Transactional helpers for master resume default/delete integrity.
-- These prevent races that can leave users with no default resume.

CREATE OR REPLACE FUNCTION set_default_master_resume(
  p_user_id uuid,
  p_resume_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exists boolean;
BEGIN
  -- Serialize writes for this user's resume set.
  PERFORM 1
  FROM master_resumes
  WHERE user_id = p_user_id
  FOR UPDATE;

  SELECT EXISTS (
    SELECT 1
    FROM master_resumes
    WHERE id = p_resume_id
      AND user_id = p_user_id
  )
  INTO v_exists;

  IF NOT v_exists THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'NOT_FOUND'
    );
  END IF;

  UPDATE master_resumes
  SET is_default = false
  WHERE user_id = p_user_id
    AND is_default = true
    AND id <> p_resume_id;

  UPDATE master_resumes
  SET is_default = true
  WHERE id = p_resume_id
    AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'resume_id', p_resume_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION delete_master_resume_with_fallback_default(
  p_user_id uuid,
  p_resume_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_was_default boolean;
  v_next_default uuid;
BEGIN
  -- Serialize writes for this user's resume set.
  PERFORM 1
  FROM master_resumes
  WHERE user_id = p_user_id
  FOR UPDATE;

  SELECT is_default
  INTO v_was_default
  FROM master_resumes
  WHERE id = p_resume_id
    AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'NOT_FOUND'
    );
  END IF;

  DELETE FROM master_resumes
  WHERE id = p_resume_id
    AND user_id = p_user_id;

  -- If the deleted resume was default (or no default remains), assign the most recent resume.
  IF v_was_default OR NOT EXISTS (
    SELECT 1
    FROM master_resumes
    WHERE user_id = p_user_id
      AND is_default = true
  ) THEN
    SELECT id
    INTO v_next_default
    FROM master_resumes
    WHERE user_id = p_user_id
    ORDER BY updated_at DESC, created_at DESC, id DESC
    LIMIT 1;

    IF v_next_default IS NOT NULL THEN
      UPDATE master_resumes
      SET is_default = true
      WHERE id = v_next_default
        AND user_id = p_user_id;
    END IF;
  ELSE
    SELECT id
    INTO v_next_default
    FROM master_resumes
    WHERE user_id = p_user_id
      AND is_default = true
    ORDER BY updated_at DESC, created_at DESC, id DESC
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'resume_id', p_resume_id,
    'new_default_resume_id', v_next_default
  );
END;
$$;

REVOKE ALL ON FUNCTION set_default_master_resume(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION delete_master_resume_with_fallback_default(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION set_default_master_resume(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION delete_master_resume_with_fallback_default(uuid, uuid) TO authenticated, service_role;
