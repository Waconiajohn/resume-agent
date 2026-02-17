-- Migration 011: Create pricing_plans and user_subscriptions tables
-- Defines available plans with session limits and tracks user subscriptions

CREATE TABLE IF NOT EXISTS pricing_plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  monthly_price_cents integer NOT NULL,
  included_sessions integer NOT NULL,
  overage_price_cents integer NOT NULL,
  max_sessions_per_month integer,
  created_at timestamptz DEFAULT now()
);

-- Seed initial plans
INSERT INTO pricing_plans (id, name, monthly_price_cents, included_sessions, overage_price_cents, max_sessions_per_month)
VALUES
  ('free', 'Free', 0, 3, 0, 3),
  ('starter', 'Starter', 1999, 15, 150, 50),
  ('pro', 'Pro', 4999, 50, 100, 200)
ON CONFLICT (id) DO NOTHING;

-- Public read access (pricing plans are not user-specific)
ALTER TABLE pricing_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read pricing plans" ON pricing_plans
  FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) UNIQUE,
  plan_id text NOT NULL REFERENCES pricing_plans(id) DEFAULT 'free',
  stripe_subscription_id text,
  stripe_customer_id text,
  status text NOT NULL DEFAULT 'active',
  current_period_start timestamptz NOT NULL DEFAULT date_trunc('month', now()),
  current_period_end timestamptz NOT NULL DEFAULT date_trunc('month', now()) + interval '1 month',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only read their own subscription
CREATE POLICY "Users can read own subscription" ON user_subscriptions
  FOR SELECT USING (user_id = (select auth.uid()));

-- Index for efficient user subscription lookup
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user ON user_subscriptions(user_id);

-- Rollback:
-- DROP INDEX IF EXISTS idx_user_subscriptions_user;
-- DROP POLICY IF EXISTS "Users can read own subscription" ON user_subscriptions;
-- DROP TABLE IF EXISTS user_subscriptions;
-- DELETE FROM pricing_plans WHERE id IN ('free', 'starter', 'pro');
-- DROP TABLE IF EXISTS pricing_plans;
