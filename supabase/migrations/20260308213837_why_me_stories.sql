-- Why-Me Stories — stores the user's Why-Me positioning story
-- Used by the CareerIQ dashboard and consumed by all downstream agents

CREATE TABLE why_me_stories (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  colleagues_came_for_what TEXT        NOT NULL DEFAULT '',
  known_for_what           TEXT        NOT NULL DEFAULT '',
  why_not_me               TEXT        NOT NULL DEFAULT '',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_why_me UNIQUE (user_id)
);

CREATE INDEX idx_why_me_stories_user ON why_me_stories (user_id);

-- Row Level Security: users can only access their own story
ALTER TABLE why_me_stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own story"
  ON why_me_stories FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own story"
  ON why_me_stories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own story"
  ON why_me_stories FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update timestamp trigger
CREATE TRIGGER update_why_me_stories_updated_at
  BEFORE UPDATE ON why_me_stories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
