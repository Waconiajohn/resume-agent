-- Master Resumes
create table if not exists master_resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  summary text not null default '',
  experience jsonb not null default '[]'::jsonb,
  skills jsonb not null default '{}'::jsonb,
  education jsonb not null default '[]'::jsonb,
  certifications jsonb not null default '[]'::jsonb,
  raw_text text not null default '',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table master_resumes enable row level security;

create policy "Users can read own resumes"
  on master_resumes for select
  using (auth.uid() = user_id);

create policy "Users can insert own resumes"
  on master_resumes for insert
  with check (auth.uid() = user_id);

create policy "Users can update own resumes"
  on master_resumes for update
  using (auth.uid() = user_id);

-- Job Applications
create table if not exists job_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  company text not null,
  title text not null,
  jd_text text not null default '',
  url text,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table job_applications enable row level security;

create policy "Users can read own applications"
  on job_applications for select
  using (auth.uid() = user_id);

create policy "Users can insert own applications"
  on job_applications for insert
  with check (auth.uid() = user_id);

create policy "Users can update own applications"
  on job_applications for update
  using (auth.uid() = user_id);

-- Coach Sessions
create table if not exists coach_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  job_application_id uuid references job_applications(id) on delete set null,
  master_resume_id uuid references master_resumes(id) on delete set null,
  status text not null default 'active',
  current_phase text not null default 'setup',
  company_research jsonb not null default '{}'::jsonb,
  jd_analysis jsonb not null default '{}'::jsonb,
  interview_responses jsonb not null default '[]'::jsonb,
  fit_classification jsonb not null default '{}'::jsonb,
  tailored_sections jsonb not null default '{}'::jsonb,
  adversarial_review jsonb not null default '{}'::jsonb,
  messages jsonb not null default '[]'::jsonb,
  pending_tool_call_id text,
  last_checkpoint_phase text,
  last_checkpoint_at timestamptz,
  total_tokens_used integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table coach_sessions enable row level security;

create policy "Users can read own sessions"
  on coach_sessions for select
  using (auth.uid() = user_id);

create policy "Users can insert own sessions"
  on coach_sessions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own sessions"
  on coach_sessions for update
  using (auth.uid() = user_id);

-- Master Resume History
create table if not exists master_resume_history (
  id uuid primary key default gen_random_uuid(),
  master_resume_id uuid references master_resumes(id) on delete cascade not null,
  job_application_id uuid references job_applications(id) on delete set null,
  changes_summary text not null default '',
  changes_detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table master_resume_history enable row level security;

create policy "Users can read own history"
  on master_resume_history for select
  using (
    exists (
      select 1 from master_resumes
      where master_resumes.id = master_resume_history.master_resume_id
        and master_resumes.user_id = auth.uid()
    )
  );
