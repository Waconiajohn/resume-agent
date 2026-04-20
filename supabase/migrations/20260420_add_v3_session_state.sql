-- v3 session persistence — "come back and find your last resume waiting."
--
-- Context: v3 is a one-shot streaming pipeline. When a user closes the tab,
-- refreshes the page, or opens the app from a different device, the
-- completed pipeline output is lost — it lived only in React state on the
-- client. For a paid product, regenerating a tailored resume because of a
-- reflex Cmd+W is a trust issue. This migration adds the server-side half
-- of a two-layer persistence scheme (localStorage handles the fast path).
--
-- Design choice: extend coach_sessions rather than create a new table.
-- v3 already writes a coach_sessions row at pipeline start for billing.
-- Adding the pipeline output to the same row is one fewer write and no
-- join on lookup. The shadow-runs table is a different case (it stores
-- v2 + v3 side-by-side for admin review); this is single-side v3 output.
--
-- All six columns are nullable — pre-existing rows (including every
-- non-v3 coach_session) simply stay NULL. No backfill needed.

ALTER TABLE coach_sessions
  ADD COLUMN v3_pipeline_output JSONB,
  ADD COLUMN v3_jd_text TEXT,
  ADD COLUMN v3_jd_title TEXT,
  ADD COLUMN v3_jd_company TEXT,
  ADD COLUMN v3_resume_source TEXT,
  ADD COLUMN v3_edited_written JSONB;

COMMENT ON COLUMN coach_sessions.v3_pipeline_output IS
  'Full v3 pipeline output (structured/benchmark/strategy/written/verify/timings/costs). Populated at pipeline complete. Consumed by GET /api/v3-pipeline/sessions/latest for the "resume your last run" restore flow.';
COMMENT ON COLUMN coach_sessions.v3_jd_text IS
  'The raw JD text the user submitted. Persisted so the restore banner can show "your last run for [JD title] at [company]" context.';
COMMENT ON COLUMN coach_sessions.v3_resume_source IS
  'Either "master" (user chose their knowledge-base resume) or "upload" (user uploaded a different resume for this run).';
COMMENT ON COLUMN coach_sessions.v3_edited_written IS
  'WrittenResume with any user edits (click-to-edit text changes, applied patches, reverts). Updated via PATCH /api/v3-pipeline/sessions/:id/edits. If NULL, the user has not edited the pipeline output; render v3_pipeline_output.written verbatim.';

-- Lookup index: the "latest v3 session for this user" query is the hot path
-- during page load. Partial index keeps the footprint small — only v3 rows
-- with actual pipeline output are indexed.
CREATE INDEX IF NOT EXISTS idx_coach_sessions_user_v3_latest
  ON coach_sessions (user_id, updated_at DESC)
  WHERE product_type = 'resume_v3' AND v3_pipeline_output IS NOT NULL;
