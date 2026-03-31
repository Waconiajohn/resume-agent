-- Migration: Tighten INSERT/UPDATE RLS policies on assessment tables to service_role only
--
-- Context:
--   onboarding_assessments (20260307100000): INSERT has no role restriction (WITH CHECK (true)),
--   UPDATE has no role restriction (USING (true)). Either policy allows any authenticated user
--   to insert/update any row — they bypass user_id scoping entirely.
--
--   retirement_readiness_assessments (20260308240000): INSERT has no role restriction
--   (WITH CHECK (true)). No UPDATE policy exists at all.
--
--   Both tables are written exclusively by the server pipeline running as service_role.
--   Authenticated users must never INSERT or UPDATE assessment rows directly.
--
-- What this migration does:
--   1. Drops the permissive INSERT/UPDATE policies on both tables.
--   2. Replaces them with service_role-only equivalents.
--   3. Adds a service_role UPDATE policy on retirement_readiness_assessments (missing entirely).
--   4. SELECT policies (auth.uid() = user_id) and any DELETE policies are left untouched.
--
-- Rollback:
--   -- onboarding_assessments
--   DROP POLICY IF EXISTS "Service role only can insert assessments" ON onboarding_assessments;
--   DROP POLICY IF EXISTS "Service role only can update assessments" ON onboarding_assessments;
--   CREATE POLICY "Service role can insert assessments"
--     ON onboarding_assessments FOR INSERT WITH CHECK (true);
--   CREATE POLICY "Service role can update assessments"
--     ON onboarding_assessments FOR UPDATE USING (true);
--
--   -- retirement_readiness_assessments
--   DROP POLICY IF EXISTS "Service role only can insert retirement assessments"
--     ON retirement_readiness_assessments;
--   DROP POLICY IF EXISTS "Service role only can update retirement assessments"
--     ON retirement_readiness_assessments;
--   CREATE POLICY "Service role can insert retirement assessments"
--     ON retirement_readiness_assessments FOR INSERT WITH CHECK (true);

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────────
-- onboarding_assessments
-- ──────────────────────────────────────────────────────────────────────────────

-- Drop the permissive INSERT policy (created without TO service_role)
DROP POLICY IF EXISTS "Service role can insert assessments"
  ON onboarding_assessments;

-- Drop the permissive UPDATE policy (created without TO service_role)
DROP POLICY IF EXISTS "Service role can update assessments"
  ON onboarding_assessments;

-- Recreate INSERT restricted to service_role
CREATE POLICY "Service role only can insert assessments"
  ON onboarding_assessments
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Recreate UPDATE restricted to service_role
CREATE POLICY "Service role only can update assessments"
  ON onboarding_assessments
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────────────────
-- retirement_readiness_assessments
-- ──────────────────────────────────────────────────────────────────────────────

-- Drop the permissive INSERT policy (created without TO service_role)
DROP POLICY IF EXISTS "Service role can insert retirement assessments"
  ON retirement_readiness_assessments;

-- Drop the permissive UPDATE policy if one was added since the original migration
DROP POLICY IF EXISTS "Service role can update retirement assessments"
  ON retirement_readiness_assessments;

-- Recreate INSERT restricted to service_role
CREATE POLICY "Service role only can insert retirement assessments"
  ON retirement_readiness_assessments
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Add UPDATE policy restricted to service_role (was missing entirely)
CREATE POLICY "Service role only can update retirement assessments"
  ON retirement_readiness_assessments
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
