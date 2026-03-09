-- Company watchlist for job search radar
CREATE TABLE IF NOT EXISTS watchlist_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  industry TEXT,
  website TEXT,
  careers_url TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai_suggested', 'contact_derived')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_watchlist_companies_user ON watchlist_companies(user_id, priority DESC);

-- Moddatetime trigger
CREATE TRIGGER watchlist_companies_updated_at BEFORE UPDATE ON watchlist_companies
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- RLS
ALTER TABLE watchlist_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own watchlist" ON watchlist_companies
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Service role manages watchlist" ON watchlist_companies
  FOR ALL USING (auth.role() = 'service_role');
