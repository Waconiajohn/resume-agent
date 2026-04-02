-- Add posted_on column to track when a job was originally posted
ALTER TABLE job_matches ADD COLUMN IF NOT EXISTS posted_on TIMESTAMPTZ;
