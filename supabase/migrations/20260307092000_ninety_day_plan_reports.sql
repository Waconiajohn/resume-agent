create table if not exists public.ninety_day_plan_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_markdown text not null default '',
  quality_score integer not null default 0,
  phases jsonb,
  stakeholder_map jsonb,
  quick_wins jsonb,
  role_context jsonb,
  created_at timestamptz not null default now()
);

alter table public.ninety_day_plan_reports enable row level security;

create policy "Users can read own ninety day plan reports"
  on public.ninety_day_plan_reports for select
  using (auth.uid() = user_id);

create policy "Authenticated users can insert ninety day plan reports"
  on public.ninety_day_plan_reports for insert
  with check (auth.uid() = user_id);
