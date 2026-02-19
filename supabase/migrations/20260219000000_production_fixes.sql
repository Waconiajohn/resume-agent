-- Migration: Production Fixes
-- Date: 2026-02-19
-- Covers:
--   1. updated_at auto-update trigger applied to all tables with updated_at column
--   2. Non-negative sessions_count constraint on user_usage
--   3. Atomic rollback in increment_session_usage via exception handling
--   4. Session lock default expiry synced to server-side LOCK_EXPIRY_MS (2 min)
--   5. master_resume_history user_id column + updated RLS using direct user_id
--   6. waitlist_emails DELETE policy (via auth.users email lookup)
--   7. pricing_plans updated_at column
--   8. Performance indexes for common query patterns

-- Rollback (reverse order):
-- DROP INDEX IF EXISTS idx_user_positioning_profiles_updated_at;
-- DROP INDEX IF EXISTS idx_user_subscriptions_updated_at;
-- DROP INDEX IF EXISTS idx_user_usage_updated_at;
-- DROP POLICY IF EXISTS "Users can delete own waitlist entry" ON waitlist_emails;
-- DROP TRIGGER IF EXISTS trg_updated_at_pricing_plans ON pricing_plans;
-- ALTER TABLE pricing_plans DROP COLUMN IF EXISTS updated_at;
-- DROP INDEX IF EXISTS idx_master_resume_history_user_id;
-- DROP POLICY IF EXISTS "Users can read own history v2" ON master_resume_history;
-- DROP POLICY IF EXISTS "Users can insert own history v2" ON master_resume_history;
-- DROP POLICY IF EXISTS "Users can update own history v2" ON master_resume_history;
-- DROP POLICY IF EXISTS "Users can delete own history v2" ON master_resume_history;
-- ALTER TABLE master_resume_history DROP COLUMN IF EXISTS user_id;
-- ALTER TABLE user_usage DROP CONSTRAINT IF EXISTS chk_sessions_count_non_negative;
-- ALTER TABLE session_locks ALTER COLUMN expires_at SET DEFAULT (now() + interval '6 minutes');
-- DROP TRIGGER IF EXISTS trg_updated_at_user_positioning_profiles ON user_positioning_profiles;
-- DROP TRIGGER IF EXISTS trg_updated_at_user_subscriptions ON user_subscriptions;
-- DROP TRIGGER IF EXISTS trg_updated_at_user_usage ON user_usage;
-- DROP TRIGGER IF EXISTS trg_updated_at_coach_sessions ON coach_sessions;
-- DROP TRIGGER IF EXISTS trg_updated_at_job_applications ON job_applications;
-- DROP TRIGGER IF EXISTS trg_updated_at_master_resumes ON master_resumes;
-- DROP FUNCTION IF EXISTS update_updated_at_column();

BEGIN;

-- ============================================================
-- 1. updated_at trigger function
-- Applied to all tables that have an updated_at column.
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- master_resumes
CREATE TRIGGER trg_updated_at_master_resumes
    BEFORE UPDATE ON master_resumes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- job_applications
CREATE TRIGGER trg_updated_at_job_applications
    BEFORE UPDATE ON job_applications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- coach_sessions
CREATE TRIGGER trg_updated_at_coach_sessions
    BEFORE UPDATE ON coach_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- user_usage (created in 010)
CREATE TRIGGER trg_updated_at_user_usage
    BEFORE UPDATE ON user_usage
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- user_subscriptions (created in 011)
CREATE TRIGGER trg_updated_at_user_subscriptions
    BEFORE UPDATE ON user_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- user_positioning_profiles (created in 012)
CREATE TRIGGER trg_updated_at_user_positioning_profiles
    BEFORE UPDATE ON user_positioning_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 2. Non-negative sessions_count constraint on user_usage
-- Prevents race conditions from leaving negative usage counts.
-- Constraint name uses chk_ prefix (consistent with existing 003 constraints).
-- ============================================================

ALTER TABLE user_usage
    ADD CONSTRAINT chk_sessions_count_non_negative
    CHECK (sessions_count >= 0);

-- ============================================================
-- 3. Atomic rollback in increment_session_usage
-- Replaces the two-step increment-then-UPDATE rollback pattern
-- with RAISE EXCEPTION inside the same transaction. When the
-- limit is exceeded, PostgreSQL rolls back the INSERT/UPDATE
-- automatically in the exception handler — no compensating UPDATE
-- needed and no race window.
-- ============================================================

CREATE OR REPLACE FUNCTION increment_session_usage(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_period_start  timestamptz;
  v_period_end    timestamptz;
  v_max_sessions  int;
  v_current_count int;
BEGIN
  v_period_start := date_trunc('month', now());
  v_period_end   := v_period_start + interval '1 month';

  -- Default: free tier (3 sessions). NULL means unlimited.
  v_max_sessions := 3;

  SELECT pp.max_sessions_per_month
  INTO   v_max_sessions
  FROM   user_subscriptions us
  JOIN   pricing_plans pp ON pp.id = us.plan_id
  WHERE  us.user_id = p_user_id
  LIMIT  1;

  -- Upsert usage row and obtain the new count.
  INSERT INTO user_usage (user_id, period_start, period_end, sessions_count)
  VALUES (p_user_id, v_period_start, v_period_end, 1)
  ON CONFLICT (user_id, period_start)
  DO UPDATE SET sessions_count = user_usage.sessions_count + 1
  RETURNING sessions_count INTO v_current_count;

  -- Raise an exception to abort the transaction (and the increment) when over
  -- the limit. The EXCEPTION block below catches it and returns denied JSON.
  IF v_max_sessions IS NOT NULL AND v_current_count > v_max_sessions THEN
    RAISE EXCEPTION 'SESSION_LIMIT_EXCEEDED'
      USING DETAIL  = format('current=%s max=%s', v_current_count, v_max_sessions),
            ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'allowed',       true,
    'current_count', v_current_count,
    'max_count',     v_max_sessions
  );

EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    -- Limit exceeded; the increment was rolled back by the exception above.
    RETURN jsonb_build_object(
      'allowed',       false,
      'current_count', v_current_count - 1,
      'max_count',     v_max_sessions
    );
END;
$$;

REVOKE ALL ON FUNCTION increment_session_usage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_session_usage(uuid) TO authenticated, service_role;

-- ============================================================
-- 4. Session lock default expiry sync
-- 006_session_locks.sql defaulted expires_at to 6 minutes, but
-- session-lock.ts uses LOCK_EXPIRY_MS = 2 minutes. Sync the DB
-- default so bare inserts without an explicit expires_at match
-- server behaviour.
-- ============================================================

ALTER TABLE session_locks
    ALTER COLUMN expires_at SET DEFAULT (now() + interval '2 minutes');

-- ============================================================
-- 5. master_resume_history user_id column
-- Adds a direct user_id FK, backfills from master_resumes,
-- adds an index, and replaces the subquery-based RLS policies
-- with faster direct user_id checks.
-- ============================================================

ALTER TABLE master_resume_history
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Backfill user_id from the owning master_resume for existing rows.
UPDATE master_resume_history mrh
SET    user_id = mr.user_id
FROM   master_resumes mr
WHERE  mrh.master_resume_id = mr.id
  AND  mrh.user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_master_resume_history_user_id
    ON master_resume_history(user_id);

-- Replace subquery-based RLS policies with direct user_id checks.
-- Drop old policies first (created in 001 and 003).
DROP POLICY IF EXISTS "Users can read own history"   ON master_resume_history;
DROP POLICY IF EXISTS "Users can insert own history" ON master_resume_history;
DROP POLICY IF EXISTS "Users can update own history" ON master_resume_history;
DROP POLICY IF EXISTS "Users can delete own history" ON master_resume_history;

CREATE POLICY "Users can read own history v2"
    ON master_resume_history FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own history v2"
    ON master_resume_history FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own history v2"
    ON master_resume_history FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own history v2"
    ON master_resume_history FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================
-- 6. waitlist_emails DELETE policy
-- waitlist_emails has no user_id column but we can match on the
-- authenticated user's email via auth.users. This lets a user
-- remove their own entry without exposing other rows.
-- ============================================================

CREATE POLICY "Users can delete own waitlist entry"
    ON waitlist_emails FOR DELETE
    USING (
        email = (
            SELECT au.email
            FROM auth.users au
            WHERE au.id = auth.uid()
        )
    );

-- ============================================================
-- 7. pricing_plans updated_at column
-- pricing_plans (migration 011) only had created_at.
-- ============================================================

ALTER TABLE pricing_plans
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill: set updated_at = created_at for existing rows.
UPDATE pricing_plans
SET    updated_at = created_at
WHERE  updated_at IS NULL;

CREATE TRIGGER trg_updated_at_pricing_plans
    BEFORE UPDATE ON pricing_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 8. Performance indexes
-- idx_coach_sessions_user_id already exists in 003 + 008 — skipped.
-- messages, resumes, resume_sections are JSONB columns, not
-- standalone tables — no indexes to create for those.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_user_usage_updated_at
    ON user_usage(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_updated_at
    ON user_subscriptions(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_positioning_profiles_updated_at
    ON user_positioning_profiles(updated_at DESC);

COMMIT;
