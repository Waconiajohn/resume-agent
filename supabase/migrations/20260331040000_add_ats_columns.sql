-- Add ATS platform detection columns to company_directory
-- Used by the three-tier job scanner to route companies to the correct ATS API

ALTER TABLE company_directory ADD COLUMN IF NOT EXISTS ats_platform TEXT;
ALTER TABLE company_directory ADD COLUMN IF NOT EXISTS ats_slug TEXT;
ALTER TABLE company_directory ADD COLUMN IF NOT EXISTS ats_url TEXT;

COMMENT ON COLUMN company_directory.ats_platform IS 'greenhouse | lever | workday | ashby | icims | null';
COMMENT ON COLUMN company_directory.ats_slug IS 'Company slug for ATS API (e.g. stripe for jobs.lever.co/stripe)';
COMMENT ON COLUMN company_directory.ats_url IS 'Full career page URL when known';

-- Index for scanning queries that filter by ATS platform
CREATE INDEX IF NOT EXISTS idx_company_directory_ats_platform
  ON company_directory (ats_platform) WHERE ats_platform IS NOT NULL;
