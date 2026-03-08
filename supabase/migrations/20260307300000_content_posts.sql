CREATE TABLE IF NOT EXISTS content_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'linkedin',
  post_type text,
  topic text,
  content text,
  hashtags jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'published')),
  quality_scores jsonb DEFAULT '{}'::jsonb,
  source_session_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE content_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own content posts"
  ON content_posts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_content_posts_user_id ON content_posts(user_id);
CREATE INDEX idx_content_posts_status ON content_posts(user_id, status);

-- Ensure moddatetime extension exists
CREATE EXTENSION IF NOT EXISTS moddatetime;

-- Auto-update updated_at on row modification
CREATE TRIGGER set_content_posts_updated_at
  BEFORE UPDATE ON content_posts
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- Platform CHECK constraint
ALTER TABLE content_posts ADD CONSTRAINT chk_content_posts_platform
  CHECK (platform IN ('linkedin', 'twitter', 'blog', 'other'));
