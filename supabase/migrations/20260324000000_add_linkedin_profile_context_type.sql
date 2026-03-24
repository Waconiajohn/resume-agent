-- Migration: Add linkedin_profile to user_platform_context CHECK constraint
--
-- The YourProfilePage allows users to save their LinkedIn headline and About section.
-- It persists via /api/platform-context/linkedin-profile using upsertUserContext with
-- context_type='linkedin_profile'. This migration adds the new type to the CHECK constraint.

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
      'linkedin_profile'
    )
  );

COMMIT;
