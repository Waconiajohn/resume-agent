-- Extension support columns for application_pipeline and job_applications
-- Enables browser extension to create/match applications by normalized URL,
-- track how an application was discovered, and record the submission method.

-- application_pipeline: discovery and submission provenance + URL matching
ALTER TABLE application_pipeline ADD COLUMN IF NOT EXISTS discovered_via text
  CHECK (discovered_via IN ('extension', 'manual', 'job_finder'));
ALTER TABLE application_pipeline ADD COLUMN IF NOT EXISTS applied_via text
  CHECK (applied_via IN ('extension', 'manual'));
ALTER TABLE application_pipeline ADD COLUMN IF NOT EXISTS normalized_url text;

COMMENT ON COLUMN application_pipeline.discovered_via IS 'How this application was originally discovered: extension (browser), manual (user entry), or job_finder (Job Command Center)';
COMMENT ON COLUMN application_pipeline.applied_via IS 'How the application was submitted: extension (browser auto-fill) or manual (user submitted directly)';
COMMENT ON COLUMN application_pipeline.normalized_url IS 'Canonical URL used for deduplication matching; stripped of tracking params and fragments';

-- job_applications: URL matching for extension cross-reference
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS normalized_url text;

COMMENT ON COLUMN job_applications.normalized_url IS 'Canonical URL used for deduplication matching; stripped of tracking params and fragments';

-- Indexes for normalized URL lookups (scoped to user for RLS alignment)
CREATE INDEX IF NOT EXISTS idx_application_pipeline_normalized_url ON application_pipeline (user_id, normalized_url);
CREATE INDEX IF NOT EXISTS idx_job_applications_normalized_url ON job_applications (user_id, normalized_url);
