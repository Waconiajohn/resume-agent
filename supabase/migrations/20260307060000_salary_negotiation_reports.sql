-- Salary Negotiation Reports table for Agent #15
create table if not exists public.salary_negotiation_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  offer_company text not null default '',
  offer_role text not null default '',
  target_industry text not null default '',
  report_markdown text not null default '',
  quality_score integer not null default 0,
  market_research jsonb,
  leverage_points jsonb,
  scenarios jsonb,
  talking_points jsonb,
  negotiation_strategy jsonb,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_salary_negotiation_reports_user_id on salary_negotiation_reports(user_id);
create index if not exists idx_salary_negotiation_reports_created_at on salary_negotiation_reports(created_at desc);

-- RLS
alter table public.salary_negotiation_reports enable row level security;

create policy "Users can read own salary negotiation reports"
  on public.salary_negotiation_reports for select
  using (auth.uid() = user_id);

create policy "Service role can insert salary negotiation reports"
  on public.salary_negotiation_reports for insert
  with check (true);
