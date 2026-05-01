-- B2B auth identity layer
--
-- Purpose:
--   Keep Supabase Auth as today's session provider while making outplacement
--   organization access provider-neutral. Future Clerk or WorkOS integration
--   must resolve into these same canonical users and organization memberships
--   instead of introducing a second authorization model.
--
-- Rollback:
--   drop table if exists public.b2b_organization_members cascade;
--   drop table if exists public.platform_auth_identities cascade;

-- ─── Platform identity bridge ────────────────────────────────────────────────

create table if not exists public.platform_auth_identities (
  id                  uuid        primary key default gen_random_uuid(),
  canonical_user_id   uuid        not null references auth.users(id) on delete cascade,
  auth_provider       text        not null check (auth_provider in ('supabase', 'clerk', 'workos')),
  provider_subject    text        not null,
  email               text        not null,
  provider_metadata   jsonb       not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (auth_provider, provider_subject),
  unique (canonical_user_id, auth_provider)
);

alter table public.platform_auth_identities enable row level security;

drop policy if exists "Users can read own auth identities" on public.platform_auth_identities;
create policy "Users can read own auth identities"
  on public.platform_auth_identities for select
  to authenticated
  using (auth.uid() = canonical_user_id);

drop policy if exists "Service role manages auth identities" on public.platform_auth_identities;
create policy "Service role manages auth identities"
  on public.platform_auth_identities for all
  to service_role
  using (true)
  with check (true);

create index if not exists idx_platform_auth_identities_user
  on public.platform_auth_identities (canonical_user_id);

create index if not exists idx_platform_auth_identities_email
  on public.platform_auth_identities (lower(email));

insert into public.platform_auth_identities (
  canonical_user_id,
  auth_provider,
  provider_subject,
  email
)
select
  au.id,
  'supabase',
  au.id::text,
  lower(au.email)
from auth.users au
where au.email is not null
on conflict (auth_provider, provider_subject) do update
  set
    canonical_user_id = excluded.canonical_user_id,
    email = excluded.email,
    updated_at = now();

drop trigger if exists set_platform_auth_identities_updated_at on public.platform_auth_identities;
create trigger set_platform_auth_identities_updated_at
  before update on public.platform_auth_identities
  for each row
  execute function moddatetime(updated_at);

-- ─── B2B organization memberships ────────────────────────────────────────────

create table if not exists public.b2b_organization_members (
  id                uuid        primary key default gen_random_uuid(),
  org_id            uuid        not null references public.b2b_organizations(id) on delete cascade,
  user_id           uuid        references auth.users(id) on delete cascade,
  email             text        not null,
  role              text        not null default 'employee'
    check (role in ('owner', 'admin', 'coach', 'employee')),
  status            text        not null default 'invited'
    check (status in ('invited', 'active', 'suspended', 'removed')),
  auth_provider     text        not null default 'manual'
    check (auth_provider in ('supabase', 'clerk', 'workos', 'manual')),
  provider_subject  text,
  seat_id           uuid        references public.b2b_seats(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.b2b_organization_members enable row level security;

drop policy if exists "Users can read own organization memberships" on public.b2b_organization_members;
create policy "Users can read own organization memberships"
  on public.b2b_organization_members for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Service role manages organization memberships" on public.b2b_organization_members;
create policy "Service role manages organization memberships"
  on public.b2b_organization_members for all
  to service_role
  using (true)
  with check (true);

create unique index if not exists idx_b2b_org_members_user_active
  on public.b2b_organization_members (org_id, user_id)
  where user_id is not null and status <> 'removed';

create unique index if not exists idx_b2b_org_members_email_active
  on public.b2b_organization_members (org_id, lower(email))
  where status <> 'removed';

create unique index if not exists idx_b2b_org_members_provider_active
  on public.b2b_organization_members (org_id, auth_provider, provider_subject)
  where provider_subject is not null and status <> 'removed';

create index if not exists idx_b2b_org_members_org_role
  on public.b2b_organization_members (org_id, role, status);

create index if not exists idx_b2b_org_members_seat
  on public.b2b_organization_members (seat_id)
  where seat_id is not null;

insert into public.b2b_organization_members (
  org_id,
  user_id,
  email,
  role,
  status,
  auth_provider,
  provider_subject
)
select
  org.id,
  au.id,
  lower(org.admin_email),
  'owner',
  case when au.id is null then 'invited' else 'active' end,
  case when au.id is null then 'manual' else 'supabase' end,
  au.id::text
from public.b2b_organizations org
left join auth.users au
  on lower(au.email) = lower(org.admin_email)
where org.admin_email is not null
on conflict do nothing;

insert into public.b2b_organization_members (
  org_id,
  user_id,
  email,
  role,
  status,
  auth_provider,
  provider_subject,
  seat_id
)
select
  seat.org_id,
  seat.user_id,
  lower(seat.employee_email),
  'employee',
  'active',
  'supabase',
  seat.user_id::text,
  seat.id
from public.b2b_seats seat
where seat.user_id is not null
  and seat.status = 'active'
  and seat.employee_email is not null
on conflict do nothing;

drop trigger if exists set_b2b_organization_members_updated_at on public.b2b_organization_members;
create trigger set_b2b_organization_members_updated_at
  before update on public.b2b_organization_members
  for each row
  execute function moddatetime(updated_at);
