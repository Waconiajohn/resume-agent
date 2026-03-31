-- Retirement Readiness Assessments
-- Phase 6: Stores assessment results from the Retirement Bridge agent.
--
-- This table records the per-session retirement readiness assessment output:
-- questions asked, user responses, per-dimension assessments, and the final
-- RetirementReadinessSummary. The summary is also persisted to
-- user_platform_context as a 'retirement_readiness' row for cross-agent use.
--
-- FIDUCIARY NOTE: This table stores observations and planner discussion topics
-- only. It never contains financial advice, recommendations, or financial data.

create table if not exists retirement_readiness_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,

  -- Assessment inputs
  questions jsonb not null default '[]',
  responses jsonb not null default '{}',

  -- Assessment outputs
  dimension_assessments jsonb not null default '[]',
  readiness_summary jsonb,

  -- Denormalized for fast queries: overall signal (green/yellow/red)
  overall_readiness text check (overall_readiness in ('green', 'yellow', 'red')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS
alter table retirement_readiness_assessments enable row level security;

create policy "Users can read own retirement assessments"
  on retirement_readiness_assessments for select
  using (auth.uid() = user_id);

create policy "Service role can insert retirement assessments"
  on retirement_readiness_assessments for insert
  with check (true);

-- Index for user lookups (most recent assessment first)
create index if not exists idx_retirement_assessments_user_id
  on retirement_readiness_assessments(user_id, created_at desc);

-- Updated_at trigger
create trigger set_retirement_assessments_updated_at
  before update on retirement_readiness_assessments
  for each row
  execute function moddatetime(updated_at);
