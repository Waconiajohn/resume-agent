CREATE TABLE session_locks (
  session_id uuid PRIMARY KEY REFERENCES coach_sessions(id) ON DELETE CASCADE,
  locked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '6 minutes')
);

ALTER TABLE session_locks ENABLE ROW LEVEL SECURITY;
-- No RLS policies = service role only access
