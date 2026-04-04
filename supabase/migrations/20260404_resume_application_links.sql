-- resume_application_links — Handoff table for the "Apply to This Job" flow.
--
-- When a user finishes building a tailored resume and clicks "Apply to This Job",
-- the platform serializes the resume payload into this table, keyed by job URL.
-- The Chrome extension reads it via GET /api/extension/ready-resume?job_url=...
-- and pre-fills the application form fields automatically.
--
-- Lifecycle:
--   status='ready'   — Resume payload written, extension can read it
--   status='applied' — Extension (or user) confirmed the application was submitted
--
-- One row per (user, session, job_url). Multiple builds against the same job
-- are allowed; the extension always reads the most recent row.

CREATE TABLE IF NOT EXISTS resume_application_links (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id      uuid        NOT NULL,
  job_url         text        NOT NULL,
  job_title       text,
  company_name    text,
  resume_payload  jsonb       NOT NULL,
  status          text        NOT NULL DEFAULT 'ready'
                              CHECK (status IN ('ready', 'applied')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  applied_at      timestamptz
);

ALTER TABLE resume_application_links ENABLE ROW LEVEL SECURITY;

-- Users can only read and write their own rows.
CREATE POLICY "users_own_links"
  ON resume_application_links
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Primary lookup: find the most recent link for a given user + job URL.
CREATE INDEX idx_resume_app_links_job_url
  ON resume_application_links (user_id, job_url, created_at DESC);

COMMENT ON TABLE resume_application_links IS
  'Serialized resume payloads keyed by job URL for the Apply-to-This-Job Chrome extension handoff.';
COMMENT ON COLUMN resume_application_links.resume_payload IS
  'Flattened resume sections (header, summary, experience, skills, etc.) ready for form field injection.';
COMMENT ON COLUMN resume_application_links.status IS
  'ready = available for extension to read; applied = application confirmed submitted.';
