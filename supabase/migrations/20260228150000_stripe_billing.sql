-- Migration: Stripe billing — add stripe_price_id to pricing_plans
-- Adds the Stripe Price ID column to pricing_plans so the billing route can
-- look up the correct Stripe price when creating Checkout sessions.
--
-- user_subscriptions already has stripe_subscription_id and stripe_customer_id
-- from migration 011 — no changes needed there.

ALTER TABLE pricing_plans
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

-- Comment describes what this column holds
COMMENT ON COLUMN pricing_plans.stripe_price_id IS
  'Stripe Price ID (price_xxx) for this plan. NULL means the plan is not purchaseable via Stripe Checkout.';

-- Rollback:
-- ALTER TABLE pricing_plans DROP COLUMN IF EXISTS stripe_price_id;
