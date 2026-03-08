-- B2B Outplacement Data Model
-- Phase 7: B2B Outplacement (Story 7-1)
--
-- Four tables:
--   b2b_organizations     — Organization entity (company purchasing seats)
--   b2b_contracts         — Seat allocation, pricing tiers, and duration
--   b2b_employee_cohorts  — Grouping of employees for aggregate reporting
--   b2b_seats             — Links individual employees to their org/contract
--
-- Creation order matters: cohorts before seats (seats reference cohorts).
--
-- Privacy boundary: seats track engagement metrics only — no personal content,
-- resume text, or session transcripts are visible in any B2B table.
--
-- RLS:
--   All B2B tables: service role has full access (admin portal is server-side only).
--   b2b_seats: users may read their own seat record (for onboarding flow).
--
-- Rollback:
--   drop table if exists b2b_seats cascade;
--   drop table if exists b2b_employee_cohorts cascade;
--   drop table if exists b2b_contracts cascade;
--   drop table if exists b2b_organizations cascade;

-- ─── Organizations ────────────────────────────────────────────────────────────

create table if not exists b2b_organizations (
  id                      uuid        primary key default gen_random_uuid(),
  name                    text        not null,
  slug                    text        not null unique, -- URL-safe identifier

  -- Branding / white-label
  logo_url                text,
  primary_color           text        not null default '#3b82f6',
  secondary_color         text        not null default '#1e3a5f',
  custom_welcome_message  text,
  custom_resources        jsonb       not null default '[]', -- [{title, url, description}]

  -- SSO config (interface only — actual SSO not yet implemented)
  sso_provider            text        check (sso_provider in ('okta', 'azure_ad', 'google')),
  sso_config              jsonb       not null default '{}',

  -- Primary contact
  admin_email             text        not null,
  admin_name              text        not null,

  -- Status
  is_active               boolean     not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table b2b_organizations enable row level security;

-- Service role owns all management of B2B organizations
create policy "Service role manages organizations"
  on b2b_organizations for all
  to service_role
  using (true)
  with check (true);

-- ─── Contracts ────────────────────────────────────────────────────────────────

create table if not exists b2b_contracts (
  id                    uuid      primary key default gen_random_uuid(),
  org_id                uuid      not null references b2b_organizations(id) on delete cascade,

  -- Pricing
  tier                  text      not null check (tier in ('standard', 'plus', 'concierge')),
  price_per_seat_cents  integer   not null check (price_per_seat_cents > 0), -- $29 = 2900, $49 = 4900
  total_seats           integer   not null check (total_seats > 0),
  used_seats            integer   not null default 0 check (used_seats >= 0),

  -- Duration
  start_date            date      not null,
  end_date              date,     -- null = ongoing monthly

  -- SLA / service level
  sla_response_hours    integer   not null default 24,
  includes_human_coach  boolean   not null default false,

  -- Status
  status                text      not null default 'active'
    check (status in ('active', 'paused', 'terminated', 'expired')),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- Capacity constraint: cannot allocate more seats than purchased
  constraint used_seats_within_total check (used_seats <= total_seats)
);

alter table b2b_contracts enable row level security;

create policy "Service role manages contracts"
  on b2b_contracts for all
  to service_role
  using (true)
  with check (true);

-- ─── Employee Cohorts ─────────────────────────────────────────────────────────
-- Created BEFORE b2b_seats because seats carry a FK to cohorts.

create table if not exists b2b_employee_cohorts (
  id                    uuid        primary key default gen_random_uuid(),
  org_id                uuid        not null references b2b_organizations(id) on delete cascade,

  name                  text        not null, -- e.g. "March 2026 Layoff", "Engineering Team"
  description           text,

  -- Aggregate outcomes (computed — never individual-level content)
  total_employees       integer     not null default 0 check (total_employees >= 0),
  active_employees      integer     not null default 0 check (active_employees >= 0),
  placed_employees      integer     not null default 0 check (placed_employees >= 0),
  avg_days_to_placement numeric,   -- null until at least one placement is recorded

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table b2b_employee_cohorts enable row level security;

create policy "Service role manages cohorts"
  on b2b_employee_cohorts for all
  to service_role
  using (true)
  with check (true);

-- ─── Seats ───────────────────────────────────────────────────────────────────
-- Links an individual employee to their organization and contract.
-- user_id is null until the employee claims their seat via the onboarding flow.

create table if not exists b2b_seats (
  id              uuid        primary key default gen_random_uuid(),
  org_id          uuid        not null references b2b_organizations(id) on delete cascade,
  contract_id     uuid        not null references b2b_contracts(id) on delete cascade,
  user_id         uuid        references auth.users(id) on delete set null,

  -- Employee identity (set at provisioning by HR/admin)
  employee_email  text        not null,
  employee_name   text,

  -- Optional cohort grouping (for aggregate reporting)
  cohort_id       uuid        references b2b_employee_cohorts(id) on delete set null,

  -- Lifecycle status
  status          text        not null default 'provisioned'
    check (status in ('provisioned', 'active', 'completed', 'expired')),
  provisioned_at  timestamptz not null default now(),
  activated_at    timestamptz,   -- set when employee claims seat
  completed_at    timestamptz,   -- set when outplacement program ends

  -- Engagement metrics (visible to admin — NEVER personal content)
  last_login_at   timestamptz,
  total_sessions  integer     not null default 0 check (total_sessions >= 0),
  agents_used     text[]      not null default '{}', -- product agent names used

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table b2b_seats enable row level security;

-- Employees may read their own seat (needed during onboarding claim flow)
create policy "Users can read own seat"
  on b2b_seats for select
  to authenticated
  using (auth.uid() = user_id);

-- Service role manages all seat records
create policy "Service role manages seats"
  on b2b_seats for all
  to service_role
  using (true)
  with check (true);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- Seat lookups by org (admin dashboard listing)
create index if not exists idx_b2b_seats_org_id
  on b2b_seats (org_id);

-- Seat lookup by claimed user (onboarding claim + activity tracking)
create index if not exists idx_b2b_seats_user_id
  on b2b_seats (user_id)
  where user_id is not null;

-- Seat lookup by email (provisioning dedup check)
create index if not exists idx_b2b_seats_email
  on b2b_seats (employee_email);

-- Contract listing by org
create index if not exists idx_b2b_contracts_org_id
  on b2b_contracts (org_id);

-- Cohort listing by org
create index if not exists idx_b2b_cohorts_org_id
  on b2b_employee_cohorts (org_id);

-- Org lookup by slug (URL routing for white-label portals)
create index if not exists idx_b2b_orgs_slug
  on b2b_organizations (slug);

-- ─── updated_at triggers ──────────────────────────────────────────────────────
-- Requires moddatetime extension (installed by earlier migration in Sprint 13)

create trigger set_b2b_organizations_updated_at
  before update on b2b_organizations
  for each row
  execute function moddatetime(updated_at);

create trigger set_b2b_contracts_updated_at
  before update on b2b_contracts
  for each row
  execute function moddatetime(updated_at);

create trigger set_b2b_employee_cohorts_updated_at
  before update on b2b_employee_cohorts
  for each row
  execute function moddatetime(updated_at);

create trigger set_b2b_seats_updated_at
  before update on b2b_seats
  for each row
  execute function moddatetime(updated_at);
