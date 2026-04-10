-- Job Staleness — first_seen_at tracking and remote_type for NI job_matches
--
-- first_seen_at: tracks when a result was first returned to the user (for "new" badge)
-- remote_type: expose the classified work mode directly on job_matches (duplicate of
--              metadata.remote_type for query-ability)

ALTER TABLE job_search_results ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ;
ALTER TABLE job_matches        ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ;
ALTER TABLE job_matches        ADD COLUMN IF NOT EXISTS remote_type   TEXT;

-- Index for efficient "new vs seen" sorting on the main job board
CREATE INDEX IF NOT EXISTS idx_job_search_results_first_seen
  ON job_search_results(user_id, first_seen_at NULLS FIRST);

-- Index for staleness filter on job_matches
CREATE INDEX IF NOT EXISTS idx_job_matches_first_seen
  ON job_matches(user_id, first_seen_at NULLS FIRST);
