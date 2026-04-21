-- Approach C, Phase 0.1 — Additive kanban columns on job_applications.
--
-- Context: Two parallel application entities exist in this schema today:
--   - job_applications (since initial schema) — parent entity for most
--     product reports (7 FKs pointing at it)
--   - application_pipeline (since 2026-03-08) — richer kanban entity
--     with 8-stage CHECK constraint, stage_history, etc.
--
-- Approach C consolidates onto job_applications as the canonical parent.
-- This migration is the first step: add every column application_pipeline
-- has but job_applications lacks, so new code can write to job_applications
-- without losing any kanban-tracking fidelity.
--
-- NON-BREAKING GUARANTEE: this migration only ADDs columns with sensible
-- defaults / nullable values. No existing column is renamed, dropped, or
-- semantically changed. Every query that works before this migration
-- continues to work after it.
--
-- What this migration does NOT do:
--   - Does not backfill data from application_pipeline (Phase 0.4 does that)
--   - Does not remove `pipeline_stage` from job_applications — that legacy
--     column (added 2026-03-08, default 'discovered', no CHECK constraint)
--     stays. New code uses the new `stage` column with the 8-stage CHECK.
--     Phase 3 cleanup later consolidates.
--   - Does not re-point any FK. networking_contacts.application_id still
--     references application_pipeline. interview_debriefs.job_application_id
--     still references application_pipeline. Phase 0.5 re-points those.
--   - Does not expose a CRUD endpoint — Phase 0.3 adds /api/job-applications.
--
-- Rollback: DROP COLUMNs in reverse order. Safe because no code writes
-- these columns yet at the time the migration lands.

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'saved'
    CHECK (stage IN (
      'saved',
      'researching',
      'applied',
      'screening',
      'interviewing',
      'offer',
      'closed_won',
      'closed_lost'
    )),
  ADD COLUMN IF NOT EXISTS source TEXT
    CHECK (source IS NULL OR source IN (
      'job_finder',
      'manual',
      'referral',
      'linkedin',
      'indeed',
      'other'
    )),
  ADD COLUMN IF NOT EXISTS applied_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_touch_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_action TEXT,
  ADD COLUMN IF NOT EXISTS next_action_due TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resume_version_id UUID,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS stage_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS score INTEGER CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  ADD COLUMN IF NOT EXISTS company_id UUID,
  ADD COLUMN IF NOT EXISTS discovered_via TEXT
    CHECK (discovered_via IS NULL OR discovered_via IN ('extension', 'manual', 'job_finder')),
  ADD COLUMN IF NOT EXISTS applied_via TEXT
    CHECK (applied_via IS NULL OR applied_via IN ('extension', 'manual'));

-- Indexes mirror application_pipeline's indexes so kanban-style queries
-- (list-by-stage, what's-due-next) have the same performance profile on
-- job_applications as they have today on application_pipeline.
CREATE INDEX IF NOT EXISTS idx_job_applications_stage
  ON public.job_applications (user_id, stage);

CREATE INDEX IF NOT EXISTS idx_job_applications_next_action_due
  ON public.job_applications (user_id, next_action_due)
  WHERE next_action_due IS NOT NULL;

-- Column comments so anyone reading the schema in dbeaver / the Supabase
-- admin understands the column semantics without hunting through git blame.
COMMENT ON COLUMN public.job_applications.stage IS
  'Kanban pipeline stage. Added 2026-04-21 (Approach C Phase 0.1). Distinct from the legacy `pipeline_stage` column — prefer `stage` for new code; `pipeline_stage` will be consolidated in Phase 3.';
COMMENT ON COLUMN public.job_applications.source IS
  'How the application was discovered. Added 2026-04-21.';
COMMENT ON COLUMN public.job_applications.stage_history IS
  'Append-only array of {from, to, at, note} stage transitions. Added 2026-04-21.';
COMMENT ON COLUMN public.job_applications.score IS
  '0-100 fit score for the application, null when not yet scored. Added 2026-04-21.';
