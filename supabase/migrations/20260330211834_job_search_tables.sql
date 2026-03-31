-- ─── Job Search Tables ───────────────────────────────────────────────────────
--
-- Three tables to support the Job Command Center search feature:
--
--   job_listings       — canonical discovered job records (source of truth)
--   job_search_scans   — per-user search history
--   job_search_results — join: scan → listing, with per-user status tracking
--
-- RLS: service role manages all tables; users can only read/update their own
-- scan and result records. job_listings are populated by the backend only.
-- ─────────────────────────────────────────────────────────────────────────────

-- Job listings (source of truth for discovered jobs)
CREATE TABLE IF NOT EXISTS job_listings (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id      TEXT         NOT NULL,
  source           TEXT         NOT NULL,
  title            TEXT         NOT NULL,
  company          TEXT         NOT NULL,
  location         TEXT,
  salary_min       INTEGER,
  salary_max       INTEGER,
  description      TEXT,
  posted_date      TIMESTAMPTZ,
  apply_url        TEXT,
  remote_type      TEXT,
  employment_type  TEXT,
  required_skills  JSONB,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (external_id, source)
);

-- Job search scans (user search history)
CREATE TABLE IF NOT EXISTS job_search_scans (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query             TEXT         NOT NULL,
  location          TEXT,
  filters           JSONB,
  result_count      INTEGER      NOT NULL DEFAULT 0,
  sources_queried   TEXT[]       NOT NULL DEFAULT '{}',
  execution_time_ms INTEGER,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Job search results (scan → listing join with user-specific status)
CREATE TABLE IF NOT EXISTS job_search_results (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id     UUID         NOT NULL REFERENCES job_search_scans(id) ON DELETE CASCADE,
  listing_id  UUID         NOT NULL REFERENCES job_listings(id) ON DELETE CASCADE,
  user_id     UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status      TEXT         NOT NULL DEFAULT 'new'
                           CHECK (status IN ('new', 'dismissed', 'promoted', 'saved')),
  match_score INTEGER,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (scan_id, listing_id)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_job_listings_external
  ON job_listings(external_id, source);

CREATE INDEX IF NOT EXISTS idx_job_search_scans_user
  ON job_search_scans(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_search_results_scan
  ON job_search_results(scan_id);

CREATE INDEX IF NOT EXISTS idx_job_search_results_user
  ON job_search_results(user_id, created_at DESC);

-- ─── Moddatetime Triggers ─────────────────────────────────────────────────────

CREATE TRIGGER job_listings_updated_at
  BEFORE UPDATE ON job_listings
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

CREATE TRIGGER job_search_results_updated_at
  BEFORE UPDATE ON job_search_results
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE job_listings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_search_scans    ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_search_results  ENABLE ROW LEVEL SECURITY;

-- job_listings: service role only (populated by backend)
CREATE POLICY "Service role manages job_listings"
  ON job_listings FOR ALL
  USING (auth.role() = 'service_role');

-- job_search_scans: users can read their own; service role manages all
CREATE POLICY "Users read own scans"
  ON job_search_scans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages scans"
  ON job_search_scans FOR ALL
  USING (auth.role() = 'service_role');

-- job_search_results: users can read/update their own; service role manages all
CREATE POLICY "Users read own results"
  ON job_search_results FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own results"
  ON job_search_results FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages results"
  ON job_search_results FOR ALL
  USING (auth.role() = 'service_role');
