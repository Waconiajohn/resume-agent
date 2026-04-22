-- Sprint B4 — soft-archive for job_applications.
--
-- Rationale: Approach C's My Applications list needs a way for users to
-- clear away closed/abandoned applications without losing the associated
-- resume / cover-letter / networking history. Soft delete via a nullable
-- archived_at timestamp keeps the historical trail intact while letting
-- the default list view filter to "active" (archived_at IS NULL).
--
-- Additive + reversible. No data lost; no FKs touched. Default state for
-- every existing row is NULL = not archived, matching prior semantics.

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.job_applications.archived_at IS
  'Soft-delete timestamp. NULL = active, non-null = hidden from default My Applications view. Users can restore by clearing this field.';

-- Partial index on the "active" case — most queries filter out archived
-- rows, so a partial index on archived_at IS NULL keeps list scans fast
-- without paying for archived-row index maintenance.
CREATE INDEX IF NOT EXISTS idx_job_applications_user_active
  ON public.job_applications(user_id, updated_at DESC)
  WHERE archived_at IS NULL;
