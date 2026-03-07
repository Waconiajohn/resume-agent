create table if not exists public.case_study_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_markdown text not null default '',
  quality_score integer not null default 0,
  case_studies jsonb,
  selected_achievements jsonb,
  created_at timestamptz not null default now()
);

alter table public.case_study_reports enable row level security;

create policy "Users can read own case study reports"
  on public.case_study_reports for select
  using (auth.uid() = user_id);

create policy "Service role can insert case study reports"
  on public.case_study_reports for insert
  with check (true);
