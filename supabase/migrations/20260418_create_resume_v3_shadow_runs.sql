-- Phase 5 Week 0: shadow deploy logging table
--
-- Purpose: log v3 pipeline output alongside v2 on every real user request while
-- v2 is still authoritative. Zero user-facing v3 output during shadow phase.
-- Admin UI consumes this for pairwise comparison review.
--
-- Populated by the shadow worker in server/src/v3/shadow/*, gated by
-- FF_V3_SHADOW_ENABLED. v2 output is included for side-by-side review even
-- though it's already in coach_sessions — keeps the admin review surface
-- self-contained and avoids cross-table joins on every review.

CREATE TABLE IF NOT EXISTS resume_v3_shadow_runs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id            TEXT NOT NULL,            -- coach_sessions.id (the v2 session id)
  candidate_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- v2 side (source of truth during shadow)
  v2_output_json        JSONB,                    -- assembly output from v2 run
  v2_duration_ms        INTEGER,                  -- v2 wall-clock for side-by-side latency

  -- v3 side (shadow output)
  v3_output_json        JSONB,                    -- WrittenResume from v3 pipeline
  v3_verify_result_json JSONB,                    -- { passed, issues[] } from verify stage
  v3_stage_timings_json JSONB,                    -- per-stage latency { classify, strategize, write, verify }
  v3_stage_costs_json   JSONB,                    -- per-stage cost { classify, strategize, write, verify, total }
  v3_duration_ms        INTEGER,                  -- v3 wall-clock
  v3_pipeline_error     TEXT,                     -- populated if v3 errored; v2 response unaffected
  v3_pipeline_error_stage TEXT,                   -- which stage failed (classify/strategize/write/verify)

  -- Admin review (populated by /admin/shadow-runs UI)
  comparison_status     TEXT NOT NULL DEFAULT 'pending_review'
                        CHECK (comparison_status IN (
                          'pending_review',
                          'reviewed_v3_better',
                          'reviewed_v2_better',
                          'reviewed_equivalent',
                          'reviewed_v3_unacceptable'
                        )),
  reviewed_by           TEXT,
  reviewed_at           TIMESTAMPTZ,
  review_notes          TEXT
);

-- Indexes for the two main access patterns:
--   1. admin review queue: "show me pending-review rows newest first"
--   2. cross-correlation: "find the shadow row for session X"
CREATE INDEX IF NOT EXISTS idx_resume_v3_shadow_runs_created_at
  ON resume_v3_shadow_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resume_v3_shadow_runs_status_created
  ON resume_v3_shadow_runs (comparison_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resume_v3_shadow_runs_request_id
  ON resume_v3_shadow_runs (request_id);

COMMENT ON TABLE resume_v3_shadow_runs IS
  'Phase 5 shadow deploy comparison rows. v2 is authoritative during shadow; '
  'v3 runs silently for quality measurement. See docs/v3-rebuild/07-Phase-5-Shadow-Deploy-Plan.md.';

-- RLS: service role writes (shadow worker); admin reads via ADMIN_API_KEY auth middleware.
-- No user-facing SELECT path — admin routes use supabaseAdmin (service role) and
-- enforce ADMIN_API_KEY at the HTTP layer.
ALTER TABLE resume_v3_shadow_runs ENABLE ROW LEVEL SECURITY;

-- Service-role can do everything (shadow worker insert, admin UI read/update).
-- This policy is a safety net — supabaseAdmin bypasses RLS by default, but
-- enabling RLS with a service-role-only policy prevents accidental anon-key
-- exposure from ever reading this table.
CREATE POLICY "resume_v3_shadow_runs service role only"
  ON resume_v3_shadow_runs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Rollback (uncomment + run if needed):
-- DROP POLICY IF EXISTS "resume_v3_shadow_runs service role only" ON resume_v3_shadow_runs;
-- DROP INDEX IF EXISTS idx_resume_v3_shadow_runs_request_id;
-- DROP INDEX IF EXISTS idx_resume_v3_shadow_runs_status_created;
-- DROP INDEX IF EXISTS idx_resume_v3_shadow_runs_created_at;
-- DROP TABLE IF EXISTS resume_v3_shadow_runs;
