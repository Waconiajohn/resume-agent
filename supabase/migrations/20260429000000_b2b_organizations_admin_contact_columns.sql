-- Reconcile production b2b_organizations with the identity-layer migration's
-- expectations.
--
-- Production created b2b_organizations via an out-of-band path that omitted
-- the admin_email and admin_name columns documented elsewhere in the codebase.
-- The b2b_auth_identity_layer migration (20260430000000) backfills
-- b2b_organization_members from b2b_organizations.admin_email, so the column
-- must exist before that migration runs.
--
-- Both columns land nullable. App code populates them when real outplacement
-- orgs onboard; we do not invent contact emails for any existing rows.
--
-- Idempotent and safe to rerun: ADD COLUMN IF NOT EXISTS + CREATE INDEX
-- IF NOT EXISTS.

alter table public.b2b_organizations
  add column if not exists admin_email text;

alter table public.b2b_organizations
  add column if not exists admin_name text;

create index if not exists idx_b2b_organizations_admin_email
  on public.b2b_organizations (lower(admin_email))
  where admin_email is not null;
