-- Expand referral_bonus_programs with rich tier/payout/confidence data
--
-- Purpose: Supports the 300+ company seeder with level-specific bonus tiers,
-- payout structure details, diversity multipliers, confidence scoring, and
-- a unique constraint on company_id for safe upsert operations.
--
-- Rollback:
--   ALTER TABLE referral_bonus_programs DROP CONSTRAINT IF EXISTS uq_referral_bonus_programs_company_id;
--   ALTER TABLE referral_bonus_programs
--     DROP COLUMN IF EXISTS bonus_entry,
--     DROP COLUMN IF EXISTS bonus_mid,
--     DROP COLUMN IF EXISTS bonus_senior,
--     DROP COLUMN IF EXISTS bonus_executive,
--     DROP COLUMN IF EXISTS payout_structure,
--     DROP COLUMN IF EXISTS diversity_multiplier,
--     DROP COLUMN IF EXISTS special_programs,
--     DROP COLUMN IF EXISTS confidence,
--     DROP COLUMN IF EXISTS data_source,
--     DROP COLUMN IF EXISTS last_verified_at;

BEGIN;

-- Add unique constraint needed for seeder upsert on company_id
ALTER TABLE referral_bonus_programs
  ADD CONSTRAINT uq_referral_bonus_programs_company_id UNIQUE (company_id);

-- Add columns for rich referral data
ALTER TABLE referral_bonus_programs
  ADD COLUMN IF NOT EXISTS bonus_entry TEXT,
  ADD COLUMN IF NOT EXISTS bonus_mid TEXT,
  ADD COLUMN IF NOT EXISTS bonus_senior TEXT,
  ADD COLUMN IF NOT EXISTS bonus_executive TEXT,
  ADD COLUMN IF NOT EXISTS payout_structure TEXT,
  ADD COLUMN IF NOT EXISTS diversity_multiplier TEXT,
  ADD COLUMN IF NOT EXISTS special_programs JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),
  ADD COLUMN IF NOT EXISTS data_source TEXT,
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ DEFAULT now();

COMMIT;
