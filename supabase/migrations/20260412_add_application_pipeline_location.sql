-- Add location column to application_pipeline
-- Previously location was stored in the notes field as a workaround
ALTER TABLE application_pipeline
  ADD COLUMN IF NOT EXISTS location TEXT DEFAULT NULL;

COMMENT ON COLUMN application_pipeline.location IS 'Job location (city, state or Remote)';
