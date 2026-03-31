-- Recovered from remote Supabase migration history (Phase 2A recovery).
-- This migration was applied to the remote DB at timestamp 20260218232808
-- but had no corresponding local file. SQL recovered verbatim from
-- supabase_migrations.schema_migrations on 2026-03-27.

-- Add missing columns to master_resumes
ALTER TABLE public.master_resumes
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_session_id uuid REFERENCES public.coach_sessions(id) ON DELETE SET NULL;

-- Ensure only one default per user (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS master_resumes_user_default_unique
  ON public.master_resumes (user_id)
  WHERE is_default = true;

-- Mark the most recent resume as default for existing users who have resumes but no default
UPDATE public.master_resumes mr
SET is_default = true
WHERE mr.id = (
  SELECT id FROM public.master_resumes
  WHERE user_id = mr.user_id
  ORDER BY updated_at DESC
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM public.master_resumes
  WHERE user_id = mr.user_id AND is_default = true
);

-- RPC: create_master_resume_atomic
-- Creates a new resume, optionally setting it as default (unsetting old default first)
CREATE OR REPLACE FUNCTION public.create_master_resume_atomic(
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
AS $$
DECLARE
  v_new_id uuid;
  v_version int;
BEGIN
  -- Determine version number
  SELECT COALESCE(MAX(version), 0) + 1
  INTO v_version
  FROM public.master_resumes
  WHERE user_id = p_user_id;

  -- If setting as default, clear existing default
  IF p_set_as_default THEN
    UPDATE public.master_resumes
    SET is_default = false
    WHERE user_id = p_user_id AND is_default = true;
  END IF;

  -- Insert the new resume
  INSERT INTO public.master_resumes (
    user_id, raw_text, summary, experience, skills,
    education, certifications, contact_info,
    source_session_id, is_default, version
  )
  VALUES (
    p_user_id, p_raw_text, p_summary, p_experience, p_skills,
    p_education, p_certifications, p_contact_info,
    p_source_session_id, p_set_as_default, v_version
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'id', v_new_id,
    'version', v_version,
    'is_default', p_set_as_default
  );
END;
$$;

-- RPC: set_default_master_resume
-- Sets a specific resume as the user's default
CREATE OR REPLACE FUNCTION public.set_default_master_resume(
  p_user_id uuid,
  p_resume_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_found boolean;
BEGIN
  -- Verify the resume exists and belongs to the user
  SELECT EXISTS(
    SELECT 1 FROM public.master_resumes
    WHERE id = p_resume_id AND user_id = p_user_id
  ) INTO v_found;

  IF NOT v_found THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  END IF;

  -- Clear existing default
  UPDATE public.master_resumes
  SET is_default = false
  WHERE user_id = p_user_id AND is_default = true;

  -- Set the new default
  UPDATE public.master_resumes
  SET is_default = true
  WHERE id = p_resume_id AND user_id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'resume_id', p_resume_id);
END;
$$;

-- RPC: delete_master_resume_with_fallback_default
-- Deletes a resume and promotes the most recent remaining resume as default if needed
CREATE OR REPLACE FUNCTION public.delete_master_resume_with_fallback_default(
  p_user_id uuid,
  p_resume_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_was_default boolean;
  v_new_default_id uuid;
BEGIN
  -- Check if the resume exists and belongs to the user
  SELECT is_default INTO v_was_default
  FROM public.master_resumes
  WHERE id = p_resume_id AND user_id = p_user_id;

  IF v_was_default IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  END IF;

  -- Delete the resume
  DELETE FROM public.master_resumes
  WHERE id = p_resume_id AND user_id = p_user_id;

  -- If it was the default, promote the most recent remaining resume
  IF v_was_default THEN
    SELECT id INTO v_new_default_id
    FROM public.master_resumes
    WHERE user_id = p_user_id
    ORDER BY updated_at DESC
    LIMIT 1;

    IF v_new_default_id IS NOT NULL THEN
      UPDATE public.master_resumes
      SET is_default = true
      WHERE id = v_new_default_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'resume_id', p_resume_id,
    'new_default_resume_id', v_new_default_id
  );
END;
$$;
