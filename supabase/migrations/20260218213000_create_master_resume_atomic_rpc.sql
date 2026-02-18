-- Atomic master resume creation:
-- - serializes per-user writes
-- - computes version safely under lock
-- - applies default-selection logic in one transaction

CREATE OR REPLACE FUNCTION create_master_resume_atomic(
  p_user_id uuid,
  p_raw_text text,
  p_summary text DEFAULT '',
  p_experience jsonb DEFAULT '[]'::jsonb,
  p_skills jsonb DEFAULT '{}'::jsonb,
  p_education jsonb DEFAULT '[]'::jsonb,
  p_certifications jsonb DEFAULT '[]'::jsonb,
  p_contact_info jsonb DEFAULT '{}'::jsonb,
  p_source_session_id uuid DEFAULT NULL,
  p_set_as_default boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_next_version integer;
  v_make_default boolean;
  v_row master_resumes%ROWTYPE;
BEGIN
  -- Serialize resume writes for this user, including "first resume" races.
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- Row locks still help avoid concurrent drift when rows already exist.
  PERFORM 1
  FROM master_resumes
  WHERE user_id = p_user_id
  FOR UPDATE;

  SELECT COALESCE(MAX(version), 0) + 1
  INTO v_next_version
  FROM master_resumes
  WHERE user_id = p_user_id;

  v_make_default := p_set_as_default OR NOT EXISTS (
    SELECT 1
    FROM master_resumes
    WHERE user_id = p_user_id
      AND is_default = true
  );

  IF v_make_default THEN
    UPDATE master_resumes
    SET is_default = false
    WHERE user_id = p_user_id
      AND is_default = true;
  END IF;

  INSERT INTO master_resumes (
    user_id,
    raw_text,
    summary,
    experience,
    skills,
    education,
    certifications,
    contact_info,
    source_session_id,
    is_default,
    version
  )
  VALUES (
    p_user_id,
    p_raw_text,
    COALESCE(p_summary, ''),
    COALESCE(p_experience, '[]'::jsonb),
    COALESCE(p_skills, '{}'::jsonb),
    COALESCE(p_education, '[]'::jsonb),
    COALESCE(p_certifications, '[]'::jsonb),
    COALESCE(p_contact_info, '{}'::jsonb),
    p_source_session_id,
    v_make_default,
    v_next_version
  )
  RETURNING *
  INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION create_master_resume_atomic(
  uuid, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, boolean
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION create_master_resume_atomic(
  uuid, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, boolean
) TO authenticated, service_role;
