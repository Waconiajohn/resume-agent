-- Add contact_info column to master_resumes
alter table master_resumes add column if not exists contact_info jsonb not null default '{}'::jsonb;
