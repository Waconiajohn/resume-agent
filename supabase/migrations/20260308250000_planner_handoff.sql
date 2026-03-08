-- Financial Planners directory + Planner Referrals
-- Phase 6: Financial Planner Warm Handoff protocol (Story 6-4)
--
-- Two tables:
--   financial_planners  — admin-managed directory of partner planners
--   planner_referrals   — tracks the 5-step warm handoff protocol per user
--
-- RLS:
--   financial_planners: read for authenticated users (planner bios are not sensitive),
--                       write for service role only (admin-managed, not self-service)
--   planner_referrals:  read scoped to owner (user_id = auth.uid()),
--                       write for service role only (server-side enforcement via supabaseAdmin)

-- ─── Financial Planners directory ────────────────────────────────────────────

create table if not exists financial_planners (
  id                  uuid        primary key default gen_random_uuid(),
  name                text        not null,
  firm                text        not null,
  specializations     text[]      not null default '{}',
  geographic_regions  text[]      not null default '{}',
  asset_minimum       integer     not null default 100000
    check (asset_minimum >= 0),
  bio                 text        not null default '',
  is_active           boolean     not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- RLS: authenticated users can read active planners; service role manages the directory
alter table financial_planners enable row level security;

create policy "Authenticated users can read active planners"
  on financial_planners for select
  to authenticated
  using (is_active = true);

create policy "Service role can manage planners"
  on financial_planners for all
  to service_role
  using (true)
  with check (true);

-- ─── Planner Referrals ────────────────────────────────────────────────────────

create table if not exists planner_referrals (
  id                    uuid        primary key default gen_random_uuid(),
  user_id               uuid        not null references auth.users(id) on delete cascade,
  planner_id            uuid        not null references financial_planners(id),
  status                text        not null default 'pending'
    check (status in ('pending', 'introduced', 'meeting_scheduled', 'engaged', 'declined', 'expired')),
  handoff_document      jsonb       not null default '{}',
  qualification_results jsonb       not null default '{}',
  follow_up_dates       jsonb       not null default '{}',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- RLS: users can read their own referrals; service role manages all records
alter table planner_referrals enable row level security;

create policy "Users can read own referrals"
  on planner_referrals for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Service role can manage referrals"
  on planner_referrals for all
  to service_role
  using (true)
  with check (true);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- GIN index for geographic region containment queries (used in matchPlanners + qualifyLead)
create index if not exists idx_planners_active_regions
  on financial_planners using gin (geographic_regions)
  where is_active = true;

-- Composite index for user referral listing (most recent first)
create index if not exists idx_referrals_user_id_created
  on planner_referrals (user_id, created_at desc);

-- Partial index for ops follow-up queries (pending + introduced need attention)
create index if not exists idx_referrals_status_pending
  on planner_referrals (status, updated_at)
  where status in ('pending', 'introduced');

-- ─── updated_at triggers ─────────────────────────────────────────────────────

-- Requires moddatetime extension (installed by earlier migration in Sprint 13)
create trigger set_financial_planners_updated_at
  before update on financial_planners
  for each row
  execute function moddatetime(updated_at);

create trigger set_planner_referrals_updated_at
  before update on planner_referrals
  for each row
  execute function moddatetime(updated_at);

-- Depends on migration 20260308240000 (retirement_readiness_assessments).
-- qualifyLead() queries that table (check 3: assessment_completed).
