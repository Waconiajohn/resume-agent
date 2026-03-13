-- Migration: DB-Driven Product Catalog
--
-- Creates a `products` table to store the platform's product catalog,
-- replacing the static TypeScript constant as the source of truth over time.
--
-- The static catalog in app/src/types/platform.ts remains the fallback
-- if this API is unavailable.
--
-- RLS: products are publicly readable (no auth required — catalog is not sensitive).
-- Only the service role can write (inserts/updates/deletes happen via migrations or admin tooling).

BEGIN;

-- ─── Products Table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text        NOT NULL UNIQUE,
  name           text        NOT NULL,
  description    text        NOT NULL DEFAULT '',
  icon           text        NOT NULL DEFAULT '',
  status         text        NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'beta', 'coming_soon')),
  feature_flag   text,                      -- e.g. 'FF_LINKEDIN_OPTIMIZER'
  tier_required  text        NOT NULL DEFAULT 'free'
                               CHECK (tier_required IN ('free', 'pro', 'enterprise')),
  sort_order     int         NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE TRIGGER set_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- Index for common query patterns
CREATE INDEX IF NOT EXISTS products_status_sort_idx ON products (status, sort_order);
CREATE INDEX IF NOT EXISTS products_tier_idx ON products (tier_required);

-- ─── Row Level Security ────────────────────────────────────────────────────
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Public read: catalog is not sensitive
CREATE POLICY "Products are publicly readable"
  ON products FOR SELECT
  USING (true);

-- No INSERT/UPDATE/DELETE via client keys — service role only via migrations

-- ─── Seed Data ────────────────────────────────────────────────────────────
-- Matches the static PRODUCT_CATALOG in app/src/types/platform.ts

INSERT INTO products (slug, name, description, icon, status, feature_flag, tier_required, sort_order)
VALUES
  -- Your Foundation
  ('onboarding',          'Career Profile',           'Structured intake assessment that builds a confidential client profile personalizing every platform tool.',   '🎯',  'active',      'FF_ONBOARDING',           'free',       10),
  ('resume',              'Resume Builder',           'Three AI agents collaborate to transform your resume into a strategic positioning document.',                  '📄',  'active',      NULL,                      'free',       20),
  ('cover-letter',        'Cover Letter Writer',      'Targeted cover letters that complement your resume strategy.',                                                 '✉️',  'active',      'FF_COVER_LETTER',         'free',       30),

  -- LinkedIn & Brand
  ('linkedin',            'LinkedIn Studio',          'Profile optimization, content creation, and posting calendar.',                                               '💼',  'active',      NULL,                      'pro',        40),
  ('personal-brand-audit','Personal Brand Audit',     'Audit and align your online presence with your positioning.',                                                 '🔎',  'active',      'FF_PERSONAL_BRAND_AUDIT', 'pro',        50),
  ('executive-bio',       'Executive Documents',      'Professional bios and consulting-grade case studies.',                                                        '📝',  'active',      'FF_EXECUTIVE_BIO',        'pro',        60),

  -- Job Search & Networking
  ('jobs',                'Job Command Center',       'Search, match, pipeline, and daily momentum tracking.',                                                       '🔍',  'active',      NULL,                      'pro',        70),
  ('networking',          'Smart Referrals',          'Import connections, find jobs at their companies, and generate AI outreach.',                                 '🌐',  'active',      NULL,                      'pro',        80),
  ('job-applier',         'Job Applier',              'Chrome extension that auto-fills job applications with your tailored resume.',                                '🚀',  'active',      'FF_EXTENSION',            'pro',        90),

  -- Interview & Offers
  ('interview',           'Interview Lab',            'Prep, practice, debrief, and follow-up all in one place.',                                                   '🎯',  'active',      'FF_INTERVIEW_PREP',       'pro',        100),
  ('salary-negotiation',  'Salary & Negotiation',     'Market benchmarks, negotiation scripts, and counter-offer simulation.',                                      '💰',  'active',      'FF_SALARY_NEGOTIATION',   'pro',        110),
  ('90-day-plan',         '90-Day Plan',              'Structured first-90-days plan tailored to your new role.',                                                   '🗺️',  'active',      'FF_NINETY_DAY_PLAN',      'pro',        120),
  ('financial',           'Financial Wellness',       'Retirement readiness assessment and fiduciary planner matching.',                                             '🏦',  'active',      'FF_RETIREMENT_BRIDGE',    'pro',        130)

ON CONFLICT (slug) DO UPDATE SET
  name         = EXCLUDED.name,
  description  = EXCLUDED.description,
  icon         = EXCLUDED.icon,
  status       = EXCLUDED.status,
  feature_flag = EXCLUDED.feature_flag,
  tier_required= EXCLUDED.tier_required,
  sort_order   = EXCLUDED.sort_order,
  updated_at   = now();

COMMIT;
