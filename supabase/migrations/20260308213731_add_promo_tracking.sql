-- Migration: Add promotion code tracking to user_subscriptions
-- Stores which Stripe promotion code and coupon were used at checkout,
-- for attribution, analytics, and customer support.

ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS promotion_code TEXT;

ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS coupon_id TEXT;

COMMENT ON COLUMN user_subscriptions.promotion_code IS
  'Stripe PromotionCode.code string used at checkout (e.g. FRIEND50). NULL if no promo was applied.';

COMMENT ON COLUMN user_subscriptions.coupon_id IS
  'Stripe Coupon.id applied at checkout. NULL if no discount was applied.';

-- Rollback:
-- ALTER TABLE user_subscriptions DROP COLUMN IF EXISTS promotion_code;
-- ALTER TABLE user_subscriptions DROP COLUMN IF EXISTS coupon_id;
