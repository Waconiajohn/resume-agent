-- Migration: Add career_iq_profile to user_platform_context CHECK constraint
--
-- The Profile Setup flow produces a CareerIQProfileFull that is persisted with
-- context_type='career_iq_profile'. This type represents the complete synthesized
-- profile from the 4-field intake + 8-question interview, and serves as the
-- foundation for all downstream products (resume, cover letter, linkedin, etc.).

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
      'career_iq_profile'
    )
  );

COMMIT;
