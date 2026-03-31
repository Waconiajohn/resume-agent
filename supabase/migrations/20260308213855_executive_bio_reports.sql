create table if not exists public.executive_bio_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_markdown text not null default '',
  quality_score integer not null default 0,
  bios jsonb,
  positioning_analysis jsonb,
  created_at timestamptz not null default now()
);

alter table public.executive_bio_reports enable row level security;

create policy "Users can read own executive bio reports"
  on public.executive_bio_reports for select
  using (auth.uid() = user_id);

create policy "Service role can insert executive bio reports"
  on public.executive_bio_reports for insert
  with check (true);
