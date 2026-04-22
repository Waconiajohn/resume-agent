-- Approach C, Phase 0.4 — Data migration: application_pipeline → job_applications.
--
-- Consolidates the two parallel "application" entities onto job_applications.
-- Preserves all data; prefers application_pipeline's richer kanban fields
-- (stage, stage_history, score, applied_date, source, etc.) over the sparser
-- defaults job_applications had historically.
--
-- Two-step strategy:
--   1. INSERT application_pipeline rows into job_applications where no match
--      exists. Match key: (user_id, LOWER(company/role_title)).
--   2. UPDATE existing job_applications rows that are still at the
--      post-Phase-0.1 defaults (stage='saved', empty stage_history), merging
--      in application_pipeline's richer data where available.
--
-- Does NOT delete from application_pipeline. That happens in Phase 3 cleanup
-- after soaking.
--
-- Idempotent: running this migration twice is safe — step 1's WHERE NOT EXISTS
-- prevents duplicate inserts, step 2 only touches rows still at defaults.

-- Step 1: insert application_pipeline rows not yet represented in job_applications.
INSERT INTO public.job_applications (
  user_id, title, company, status,
  stage, source, applied_date, last_touch_date, next_action, next_action_due,
  resume_version_id, notes, stage_history, score, company_id,
  created_at, updated_at
)
SELECT
  ap.user_id,
  ap.role_title AS title,
  ap.company_name AS company,
  'draft' AS status, -- default from initial schema; stage carries the real lifecycle
  ap.stage,
  ap.source,
  ap.applied_date,
  ap.last_touch_date,
  ap.next_action,
  ap.next_action_due,
  ap.resume_version_id,
  ap.notes,
  ap.stage_history,
  ap.score,
  ap.company_id,
  ap.created_at,
  ap.updated_at
FROM public.application_pipeline ap
WHERE NOT EXISTS (
  SELECT 1 FROM public.job_applications ja
  WHERE ja.user_id = ap.user_id
    AND LOWER(COALESCE(ja.title, '')) = LOWER(COALESCE(ap.role_title, ''))
    AND LOWER(COALESCE(ja.company, '')) = LOWER(COALESCE(ap.company_name, ''))
);

-- Step 2: update existing job_applications rows that are still at
-- post-Phase-0.1 defaults. Overwrites stage/stage_history but preserves
-- non-null values in the target for source/applied_date/notes/etc.
UPDATE public.job_applications ja
SET
  stage = ap.stage,
  stage_history = ap.stage_history,
  source = COALESCE(ja.source, ap.source),
  applied_date = COALESCE(ja.applied_date, ap.applied_date),
  last_touch_date = COALESCE(ja.last_touch_date, ap.last_touch_date),
  next_action = COALESCE(ja.next_action, ap.next_action),
  next_action_due = COALESCE(ja.next_action_due, ap.next_action_due),
  resume_version_id = COALESCE(ja.resume_version_id, ap.resume_version_id),
  notes = COALESCE(ja.notes, ap.notes),
  score = COALESCE(ja.score, ap.score),
  company_id = COALESCE(ja.company_id, ap.company_id)
FROM public.application_pipeline ap
WHERE ja.user_id = ap.user_id
  AND LOWER(COALESCE(ja.title, '')) = LOWER(COALESCE(ap.role_title, ''))
  AND LOWER(COALESCE(ja.company, '')) = LOWER(COALESCE(ap.company_name, ''))
  AND ja.stage = 'saved' -- still at default from Phase 0.1
  AND (ja.stage_history = '[]'::jsonb OR ja.stage_history IS NULL);
