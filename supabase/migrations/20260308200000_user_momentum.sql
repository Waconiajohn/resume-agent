-- Migration: user_momentum
-- Sprint 49, Story 5-1: Momentum tracking tables for the Emotional Intelligence Layer
-- Creates: user_momentum_activities, coaching_nudges, coaching_requests

-- ─── user_momentum_activities ─────────────────────────────────────────────────
-- Activity log: every meaningful career action the user takes is tracked here.
-- Drives streak computation, win celebrations, and stall detection.

CREATE TABLE user_momentum_activities (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  -- Valid types: 'resume_completed', 'cover_letter_completed', 'job_applied',
  -- 'interview_prep', 'mock_interview', 'debrief_logged', 'networking_outreach',
  -- 'linkedin_post', 'profile_update', 'salary_negotiation'
  related_id uuid,        -- optional FK to the session/application/etc
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_momentum_activities_user
  ON user_momentum_activities(user_id, created_at DESC);

ALTER TABLE user_momentum_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own activities"
  ON user_momentum_activities
  FOR ALL
  USING (auth.uid() = user_id);

-- ─── coaching_nudges ──────────────────────────────────────────────────────────
-- LLM-generated coaching messages created by the Cognitive Reframing Engine.
-- Each nudge targets a specific stall condition and matches the user's
-- coaching_tone from their EmotionalBaseline.

CREATE TABLE coaching_nudges (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_type text NOT NULL,
  -- Valid types: 'stalled_pipeline', 'rejection_streak', 'inactivity', 'milestone'
  message text NOT NULL,
  coaching_tone text NOT NULL DEFAULT 'supportive',
  -- Matches EmotionalBaseline coaching_tone: 'supportive', 'direct', 'motivational'
  dismissed boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_coaching_nudges_user
  ON coaching_nudges(user_id, dismissed, created_at DESC);

ALTER TABLE coaching_nudges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own nudges"
  ON coaching_nudges
  FOR ALL
  USING (auth.uid() = user_id);

-- ─── coaching_requests ────────────────────────────────────────────────────────
-- "Ask a Coach" human escalation table (Story 5-7).
-- Users submit structured requests; human coaches review and respond.

CREATE TABLE coaching_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic text NOT NULL,
  -- Valid topics: 'resume_help', 'interview_prep', 'salary_negotiation',
  -- 'career_direction', 'emotional_support', 'other'
  description text NOT NULL,
  urgency text NOT NULL DEFAULT 'normal',
  -- Valid urgencies: 'low', 'normal', 'high'
  status text NOT NULL DEFAULT 'pending',
  -- Valid statuses: 'pending', 'in_review', 'responded', 'closed'
  admin_notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_coaching_requests_user
  ON coaching_requests(user_id, created_at DESC);

CREATE INDEX idx_coaching_requests_status
  ON coaching_requests(status, created_at DESC);

ALTER TABLE coaching_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own requests"
  ON coaching_requests
  FOR ALL
  USING (auth.uid() = user_id);

-- moddatetime trigger keeps updated_at current on every UPDATE
CREATE TRIGGER coaching_requests_updated_at
  BEFORE UPDATE ON coaching_requests
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
