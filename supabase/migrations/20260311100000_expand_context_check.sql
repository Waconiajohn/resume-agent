-- Migration: Expand user_platform_context CHECK constraint to match full ContextType union
--
-- The table was created in 20260302120000_user_platform_context.sql with only 4 context
-- types. Subsequent phases added: client_profile, positioning_foundation, benchmark_candidate,
-- gap_analysis, industry_research, job_discovery_results, content_post, retirement_readiness,
-- emotional_baseline, onboarding, why_me, interview_synthesis, blueprint, benchmark,
-- company_research, jd_analysis.
--
-- Rollback:
--   ALTER TABLE user_platform_context DROP CONSTRAINT IF EXISTS valid_context_type;
--   ALTER TABLE user_platform_context ADD CONSTRAINT valid_context_type
--     CHECK (context_type IN ('positioning_strategy','evidence_item','career_narrative','target_role'));

BEGIN;

-- The inline CHECK defined in the CREATE TABLE was either named 'valid_context_type' by a
-- later migration or auto-named by PostgreSQL as 'user_platform_context_context_type_check'.
-- Drop both possible names idempotently before adding the expanded version.
ALTER TABLE user_platform_context
  DROP CONSTRAINT IF EXISTS valid_context_type;

ALTER TABLE user_platform_context
  DROP CONSTRAINT IF EXISTS user_platform_context_context_type_check;

ALTER TABLE user_platform_context
  ADD CONSTRAINT valid_context_type CHECK (
    context_type IN (
      -- Core resume pipeline types (original 4)
      'positioning_strategy',
      'evidence_item',
      'career_narrative',
      'target_role',
      -- Phase 1A: Onboarding Assessment Agent
      'client_profile',
      'onboarding',
      -- Phase 1B/2: Positioning pipeline types
      'positioning_foundation',
      'benchmark_candidate',
      'benchmark',
      'gap_analysis',
      'why_me',
      'interview_synthesis',
      'blueprint',
      'company_research',
      'jd_analysis',
      -- Phase 3A: Job Command Center
      'industry_research',
      'job_discovery_results',
      -- Phase 6: Retirement Bridge
      'retirement_readiness',
      -- Phase 1C: Emotional Baseline
      'emotional_baseline',
      -- Content calendar / content posts
      'content_post'
    )
  );

COMMIT;
