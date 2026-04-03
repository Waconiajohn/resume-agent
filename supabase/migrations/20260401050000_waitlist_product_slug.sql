-- Migration: add product_slug to waitlist_emails and replace the single-email
-- unique constraint with a (email, product_slug) composite unique constraint.
--
-- The original table had UNIQUE(email), which prevented a user from joining the
-- waitlist for more than one product. This migration:
--   1. Drops the old email-only unique constraint.
--   2. Adds a product_slug column (text, not null, defaults to 'general').
--   3. Backfills existing rows with product_slug = 'general'.
--   4. Creates a composite UNIQUE(email, product_slug) constraint.
--   5. Updates the INSERT policy to remain permissive (no auth required).

-- Step 1: drop the existing unique constraint on email alone.
-- The constraint was created as part of the CREATE TABLE (inline UNIQUE),
-- so Postgres named it waitlist_emails_email_key.
ALTER TABLE waitlist_emails
  DROP CONSTRAINT IF EXISTS waitlist_emails_email_key;

-- Step 2: add product_slug with a default so existing rows are not null.
ALTER TABLE waitlist_emails
  ADD COLUMN IF NOT EXISTS product_slug text NOT NULL DEFAULT 'general';

-- Step 3: add the composite unique constraint.
ALTER TABLE waitlist_emails
  ADD CONSTRAINT waitlist_emails_email_product_slug_key UNIQUE (email, product_slug);

-- Step 4: index for fast per-product queries (e.g. count signups per slug).
CREATE INDEX IF NOT EXISTS waitlist_emails_product_slug_idx
  ON waitlist_emails (product_slug);
