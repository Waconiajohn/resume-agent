-- Migration: Add interview_story to user_platform_context CHECK constraint
--
-- The Interview Prep Story Bank allows STAR+R stories to accumulate across sessions
-- so each new interview prep session builds on the last. Each story is a separate row
-- with context_type='interview_story', saved by the save_story tool in the writer agent.

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
      'interview_story'
    )
  );

COMMIT;
