-- Add columns for multi-phase collaborative coaching system

alter table coach_sessions
  add column if not exists benchmark_candidate jsonb default null,
  add column if not exists section_statuses jsonb not null default '[]'::jsonb,
  add column if not exists overall_score integer not null default 0,
  add column if not exists design_choices jsonb not null default '[]'::jsonb,
  add column if not exists pending_phase_transition text default null;

-- Update default phase from 'setup' to 'onboarding' for new sessions
alter table coach_sessions
  alter column current_phase set default 'onboarding';
