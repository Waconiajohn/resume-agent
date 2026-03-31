-- Corrective migration: Expand user_platform_context CHECK constraint
-- Phase 2A schema safety fix — 2026-03-27
--
-- The remote CHECK constraint only allows 11 context types but the application
-- uses 22. This forward-only migration sets the constraint to the full current
-- set without replaying old migration chains or rewriting history.
--
-- Idempotent: safe to run even if the constraint was already expanded.
--
-- Rollback:
--   See docs/SUPABASE_SCHEMA_SAFETY_PLAN.md for the narrowed-back constraint.

ALTER TABLE user_platform_context
  DROP CONSTRAINT IF EXISTS valid_context_type;

ALTER TABLE user_platform_context
  DROP CONSTRAINT IF EXISTS user_platform_context_context_type_check;

ALTER TABLE user_platform_context
  ADD CONSTRAINT valid_context_type CHECK (
    context_type IN (
      -- Core resume pipeline
      'positioning_strategy',
      'evidence_item',
      'career_narrative',
      'target_role',
      -- Onboarding
      'client_profile',
      'onboarding',
      -- Positioning pipeline
      'positioning_foundation',
      'benchmark_candidate',
      'benchmark',
      'gap_analysis',
      'why_me',
      'interview_synthesis',
      'blueprint',
      'company_research',
      'jd_analysis',
      -- Job discovery
      'industry_research',
      'job_discovery_results',
      -- Retirement bridge
      'retirement_readiness',
      -- Emotional intelligence
      'emotional_baseline',
      -- Content
      'content_post',
      -- Career profile v2
      'career_profile',
      -- LinkedIn
      'linkedin_profile'
    )
  );
