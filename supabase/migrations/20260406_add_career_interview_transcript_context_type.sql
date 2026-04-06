-- Migration: Add career_interview_transcript to user_platform_context CHECK constraint
--
-- The Profile Setup flow persists the raw Q&A interview transcript with
-- context_type='career_interview_transcript'. This transcript is a companion
-- to 'career_iq_profile' and survives session cleanup for downstream use
-- (e.g., resume agent evidence gathering, coaching context enrichment).
--
-- Idempotent: DROP CONSTRAINT IF EXISTS handles the case where the constraint
-- has already been replaced by a later migration.
--
-- Rollback:
--   Re-run the previous migration (20260406_add_career_iq_profile_context_type.sql)
--   to restore the constraint without 'career_interview_transcript'.

BEGIN;

ALTER TABLE user_platform_context
  DROP CONSTRAINT IF EXISTS valid_context_type;

ALTER TABLE user_platform_context
  DROP CONSTRAINT IF EXISTS user_platform_context_context_type_check;

ALTER TABLE user_platform_context
  ADD CONSTRAINT valid_context_type CHECK (
    context_type IN (
      'career_profile',
      'positioning_strategy',
      'evidence_item',
      'career_narrative',
      'target_role',
      'client_profile',
      'onboarding',
      'positioning_foundation',
      'benchmark_candidate',
      'benchmark',
      'gap_analysis',
      'why_me',
      'interview_synthesis',
      'blueprint',
      'company_research',
      'jd_analysis',
      'industry_research',
      'job_discovery_results',
      'retirement_readiness',
      'emotional_baseline',
      'content_post',
      'linkedin_profile',
      'interview_story',
      'career_iq_profile',
      'career_interview_transcript'
    )
  );

COMMIT;
