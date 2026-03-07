-- Network Intelligence module tables
-- Stores LinkedIn connections, company directory, job matches, and referral programs

-- ─── Company Directory ────────────────────────────────────────────────────────
-- Canonical company records with normalized names and variant spellings.

CREATE TABLE company_directory (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name_normalized  TEXT        NOT NULL UNIQUE,
  name_display     TEXT        NOT NULL,
  name_variants    TEXT[]      NOT NULL DEFAULT '{}',
  domain           TEXT,
  industry         TEXT,
  employee_count   TEXT,
  headquarters     TEXT,
  description      TEXT,
  metadata         JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_company_directory_variants ON company_directory USING GIN (name_variants);
CREATE INDEX idx_company_directory_industry ON company_directory (industry) WHERE industry IS NOT NULL;

-- ─── Referral Bonus Programs ──────────────────────────────────────────────────
-- Tracks which companies offer referral bonuses and their details.

CREATE TABLE referral_bonus_programs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID        NOT NULL REFERENCES company_directory(id) ON DELETE CASCADE,
  bonus_amount     TEXT,
  bonus_currency   TEXT        DEFAULT 'USD',
  program_url      TEXT,
  notes            TEXT,
  verified_at      TIMESTAMPTZ,
  source           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_referral_bonus_company ON referral_bonus_programs (company_id);

-- ─── Client Connections ───────────────────────────────────────────────────────
-- Parsed LinkedIn connections per user.

CREATE TABLE client_connections (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name       TEXT        NOT NULL,
  last_name        TEXT        NOT NULL,
  email            TEXT,
  company_raw      TEXT        NOT NULL,
  company_id       UUID        REFERENCES company_directory(id) ON DELETE SET NULL,
  position         TEXT,
  connected_on     TIMESTAMPTZ,
  import_batch     TEXT,
  metadata         JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_client_connections_user ON client_connections (user_id);
CREATE INDEX idx_client_connections_company ON client_connections (company_id) WHERE company_id IS NOT NULL;
CREATE INDEX idx_client_connections_user_batch ON client_connections (user_id, import_batch);

-- ─── Client Target Titles ─────────────────────────────────────────────────────
-- Job titles the user is targeting for job matching.

CREATE TABLE client_target_titles (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title            TEXT        NOT NULL,
  priority         INT         NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_client_target_titles_user ON client_target_titles (user_id);

-- ─── Job Matches ──────────────────────────────────────────────────────────────
-- Scraped/matched job postings linked to companies where user has connections.

CREATE TABLE job_matches (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id       UUID        NOT NULL REFERENCES company_directory(id) ON DELETE CASCADE,
  title            TEXT        NOT NULL,
  url              TEXT,
  location         TEXT,
  salary_range     TEXT,
  description_snippet TEXT,
  match_score      NUMERIC(5,2),
  referral_available BOOLEAN   NOT NULL DEFAULT FALSE,
  connection_count INT         NOT NULL DEFAULT 0,
  status           TEXT        NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'applied', 'referred', 'interviewing', 'rejected', 'archived')),
  scraped_at       TIMESTAMPTZ,
  metadata         JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_matches_user ON job_matches (user_id);
CREATE INDEX idx_job_matches_company ON job_matches (company_id);
CREATE INDEX idx_job_matches_user_status ON job_matches (user_id, status);

-- ─── Scrape Log ───────────────────────────────────────────────────────────────
-- Tracks CSV import and scraping operations for audit/debugging.

CREATE TABLE scrape_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation        TEXT        NOT NULL CHECK (operation IN ('csv_import', 'job_scrape', 'company_enrich', 'normalization')),
  status           TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  input_summary    JSONB       NOT NULL DEFAULT '{}',
  output_summary   JSONB       NOT NULL DEFAULT '{}',
  error_message    TEXT,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scrape_log_user ON scrape_log (user_id);
CREATE INDEX idx_scrape_log_user_operation ON scrape_log (user_id, operation);

-- ─── updated_at triggers ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_company_directory
  BEFORE UPDATE ON company_directory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_referral_bonus_programs
  BEFORE UPDATE ON referral_bonus_programs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_client_connections
  BEFORE UPDATE ON client_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_client_target_titles
  BEFORE UPDATE ON client_target_titles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_job_matches
  BEFORE UPDATE ON job_matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Row Level Security ───────────────────────────────────────────────────────

-- company_directory: public read, service-role write
ALTER TABLE company_directory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read companies"
  ON company_directory FOR SELECT
  USING (true);

-- referral_bonus_programs: public read, service-role write
ALTER TABLE referral_bonus_programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read referral programs"
  ON referral_bonus_programs FOR SELECT
  USING (true);

-- client_connections: users own their rows
ALTER TABLE client_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own connections"
  ON client_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own connections"
  ON client_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own connections"
  ON client_connections FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own connections"
  ON client_connections FOR DELETE
  USING (auth.uid() = user_id);

-- client_target_titles: users own their rows
ALTER TABLE client_target_titles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own target titles"
  ON client_target_titles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own target titles"
  ON client_target_titles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own target titles"
  ON client_target_titles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own target titles"
  ON client_target_titles FOR DELETE
  USING (auth.uid() = user_id);

-- job_matches: users own their rows
ALTER TABLE job_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own job matches"
  ON job_matches FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own job matches"
  ON job_matches FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own job matches"
  ON job_matches FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own job matches"
  ON job_matches FOR DELETE
  USING (auth.uid() = user_id);

-- scrape_log: users own their rows
ALTER TABLE scrape_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own scrape logs"
  ON scrape_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scrape logs"
  ON scrape_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);
