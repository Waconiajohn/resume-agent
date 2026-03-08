-- Migration: momentum_constraints
-- Phase 5 Audit: Add CHECK constraints, moddatetime extension, and dedup index
-- for momentum tables created in 20260308200000_user_momentum.sql

-- ─── Ensure moddatetime extension exists (idempotent) ─────────────────────────
CREATE EXTENSION IF NOT EXISTS moddatetime;

-- ─── CHECK constraints on enum-like text columns ──────────────────────────────

-- user_momentum_activities.activity_type
ALTER TABLE user_momentum_activities
  ADD CONSTRAINT chk_activity_type CHECK (
    activity_type IN (
      'resume_completed', 'cover_letter_completed', 'job_applied',
      'interview_prep', 'mock_interview', 'debrief_logged',
      'networking_outreach', 'linkedin_post', 'profile_update',
      'salary_negotiation'
    )
  );

-- coaching_nudges.trigger_type
ALTER TABLE coaching_nudges
  ADD CONSTRAINT chk_trigger_type CHECK (
    trigger_type IN ('stalled_pipeline', 'rejection_streak', 'inactivity', 'milestone')
  );

-- coaching_nudges.coaching_tone
ALTER TABLE coaching_nudges
  ADD CONSTRAINT chk_coaching_tone CHECK (
    coaching_tone IN ('supportive', 'direct', 'motivational')
  );

-- coaching_requests.topic
ALTER TABLE coaching_requests
  ADD CONSTRAINT chk_topic CHECK (
    topic IN (
      'resume_help', 'interview_prep', 'salary_negotiation',
      'career_direction', 'emotional_support', 'other'
    )
  );

-- coaching_requests.urgency
ALTER TABLE coaching_requests
  ADD CONSTRAINT chk_urgency CHECK (
    urgency IN ('low', 'normal', 'high')
  );

-- coaching_requests.status
ALTER TABLE coaching_requests
  ADD CONSTRAINT chk_status CHECK (
    status IN ('pending', 'in_review', 'responded', 'closed')
  );

-- ─── Deduplication index for nudge check query ───────────────────────────────
-- The /check-stalls route queries (user_id, created_at >= threeDaysAgo)
-- without filtering on dismissed, so the existing index is suboptimal.
CREATE INDEX idx_coaching_nudges_dedup
  ON coaching_nudges(user_id, created_at DESC);
