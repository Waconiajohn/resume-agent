-- Virtual Coach tables: conversation persistence, memory notes, and daily budget tracking.
-- All tables are RLS-protected: users can only access their own rows.

-- Ensure moddatetime extension is available for updated_at triggers
CREATE EXTENSION IF NOT EXISTS moddatetime;

-- ─── coach_conversations ─────────────────────────────────────────────
-- Stores full conversation message history for each coach conversation.
-- One row per conversation (identified by id). Messages are stored as
-- a JSONB array of { role: 'user' | 'assistant', content: string } objects.

CREATE TABLE IF NOT EXISTS coach_conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  messages    jsonb NOT NULL DEFAULT '[]',
  turn_count  integer NOT NULL DEFAULT 0,
  mode        text NOT NULL DEFAULT 'guided'
                CHECK (mode IN ('chat', 'guided')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_conversations_user_id
  ON coach_conversations (user_id, updated_at DESC);

ALTER TABLE coach_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own coach conversations"
  ON coach_conversations
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER handle_coach_conversations_updated_at
  BEFORE UPDATE ON coach_conversations
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

COMMENT ON TABLE coach_conversations IS 'Persistent message history for each Virtual Coach conversation session.';
COMMENT ON COLUMN coach_conversations.messages IS 'JSONB array of { role, content } chat messages for conversation continuity.';
COMMENT ON COLUMN coach_conversations.mode IS 'Conversation mode: guided (structured) or chat (free-form).';

-- ─── coach_memory ────────────────────────────────────────────────────
-- Stores coaching notes and key observations from prior conversations.
-- Used by the coach agent to provide continuity across sessions.
-- The content column holds a plain text note. Metadata holds structured
-- context (e.g., which phase the note was made in, which product).

CREATE TABLE IF NOT EXISTS coach_memory (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_type     text NOT NULL DEFAULT 'insight',
  content         text NOT NULL,
  coaching_phase  text,
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_memory_user_id
  ON coach_memory (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_coach_memory_type
  ON coach_memory (user_id, memory_type);

ALTER TABLE coach_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own coach memory"
  ON coach_memory
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER handle_coach_memory_updated_at
  BEFORE UPDATE ON coach_memory
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

COMMENT ON TABLE coach_memory IS 'Coaching notes from prior conversations for cross-session continuity.';
COMMENT ON COLUMN coach_memory.content IS 'Plain text coaching note or observation.';
COMMENT ON COLUMN coach_memory.metadata IS 'Structured context: phase, product, session_id, etc.';

-- ─── coach_budget ────────────────────────────────────────────────────
-- Tracks per-user AI usage budget for the Virtual Coach.
-- One row per user. The coach agent reads this before recommending
-- expensive pipeline actions.

CREATE TABLE IF NOT EXISTS coach_budget (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_budget_usd   numeric(10, 4) NOT NULL DEFAULT 0.50,
  daily_spent_usd    numeric(10, 4) NOT NULL DEFAULT 0.00,
  last_reset_daily   timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_budget_user_id
  ON coach_budget (user_id);

ALTER TABLE coach_budget ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own coach budget"
  ON coach_budget
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role only for budget mutations (server manages spend tracking)
CREATE POLICY "Service role can manage coach budgets"
  ON coach_budget
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER handle_coach_budget_updated_at
  BEFORE UPDATE ON coach_budget
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

COMMENT ON TABLE coach_budget IS 'Per-user daily AI budget for the Virtual Coach. Server manages spend; users can view.';
COMMENT ON COLUMN coach_budget.daily_budget_usd IS 'Daily spending ceiling in USD. Default $0.50.';
COMMENT ON COLUMN coach_budget.daily_spent_usd IS 'Amount spent today. Reset daily by the server.';
COMMENT ON COLUMN coach_budget.last_reset_daily IS 'Timestamp of last daily budget reset.';
