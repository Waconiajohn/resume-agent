-- Affiliate system: affiliates table + referral_events table
-- RLS: service role only (admin/server use only)

CREATE TABLE affiliates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),   -- null for external affiliates
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  referral_code TEXT NOT NULL UNIQUE,         -- e.g., 'JOHN2026'
  commission_rate NUMERIC NOT NULL DEFAULT 0.20,  -- 20%
  status TEXT NOT NULL DEFAULT 'active',      -- active, paused, terminated
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE referral_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES affiliates(id),
  event_type TEXT NOT NULL,                   -- 'click', 'signup', 'subscription', 'renewal'
  referred_user_id UUID REFERENCES auth.users(id),
  subscription_id TEXT,                       -- reference to user_subscriptions
  revenue_amount NUMERIC,
  commission_amount NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: service role only (admin client bypasses RLS; deny all user access)
ALTER TABLE affiliates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON affiliates FOR ALL USING (false);

ALTER TABLE referral_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON referral_events FOR ALL USING (false);

-- Index for fast referral code lookups
CREATE INDEX idx_affiliates_referral_code ON affiliates(referral_code);
-- Index for affiliate stats queries
CREATE INDEX idx_referral_events_affiliate_id ON referral_events(affiliate_id);
-- Index for user-based affiliate lookup
CREATE INDEX idx_affiliates_user_id ON affiliates(user_id) WHERE user_id IS NOT NULL;
