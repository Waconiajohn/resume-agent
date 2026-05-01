# Auth Dashboard Handoff — 2026-04-30

This handoff exists so the Supabase auth setup can continue after a logout/restart without relying on chat memory.

## Current State

- Supabase remains the live auth provider for CareerIQ.
- The high-priced Supabase Auth Hook secret is **not required** for launch.
- `AUTH_HOOK_SECRET` is optional hardening only. Leaving it unset makes `/api/auth/webhook` return 503 by design, but normal login still works.
- Email/password auth is live.
- Email confirmation is enabled.
- Existing production users were verified as email-confirmed.
- OAuth identities have not been created yet because social providers still need dashboard/provider-console credentials.

## Database Work Completed

Claude applied and verified the B2B auth identity database layer through the Supabase MCP.

Applied migrations:

- `20260429000000_b2b_organizations_admin_contact_columns`
- `20260430000000_b2b_auth_identity_layer`

Migration ledger caution:

- Notes from the Supabase apply step suggest the hosted migration ledger may show apply-time versions around `20260430130019` and `20260430130055` for these two migrations.
- Before rerunning either migration, inspect `supabase_migrations.schema_migrations` and compare the stored `name` / `statements[1]` SQL against the local files below.
- If the SQL matches, treat the remote migration as applied even if the ledger version differs from the local filename.
- `20260428000000_add_profile_setup_sessions.sql` already exists locally for `profile_setup_sessions`.

Important source files:

- `supabase/migrations/20260429000000_b2b_organizations_admin_contact_columns.sql`
- `supabase/migrations/20260430000000_b2b_auth_identity_layer.sql`
- `server/src/lib/auth-context.ts`
- `server/src/lib/b2b.ts`
- `server/src/routes/b2b-admin.ts`
- `docs/AUTH.md`

Verified production database state from Claude's report:

- `platform_auth_identities` exists.
- `b2b_organization_members` exists.
- RLS is enabled on both tables.
- Service-role policies exist on both tables.
- Authenticated users can select only their own identity/membership rows.
- Existing `auth.users` rows were seeded into `platform_auth_identities` with `auth_provider='supabase'`.
- No B2B org/member rows were backfilled because production had zero B2B orgs/seats.

## Code Work Completed Locally

The app now supports Supabase social sign-in buttons for:

- Google: `google`
- Microsoft: `azure`
- LinkedIn OIDC: `linkedin_oidc`

Important source files:

- `app/src/lib/auth-providers.ts`
- `app/src/hooks/useAuth.ts`
- `app/src/components/AuthGate.tsx`
- `app/src/components/SalesPage.tsx`
- `app/src/App.tsx`
- `app/src/lib/supabase.ts`

The unauthenticated public page and signup/auth gate were rebuilt and visually checked on desktop and mobile.

## Still Required Manually

These are dashboard/provider-console tasks. They cannot be completed by code unless the operator has the relevant admin credentials and client secrets.

### Supabase URL Configuration

Dashboard path:

`Supabase → Authentication → URL Configuration`

Set Site URL:

```text
https://resume-agent-jade.vercel.app
```

Add redirect URLs:

```text
http://localhost:5173/workspace
http://localhost:5173/reset-password
http://localhost:5173/**
https://resume-agent-jade.vercel.app/workspace
https://resume-agent-jade.vercel.app/reset-password
https://resume-agent-jade.vercel.app/**
```

If the production frontend domain changes, replace `https://resume-agent-jade.vercel.app` with the actual frontend origin.

### OAuth Provider Callback URL

Add this exact callback URL in each third-party provider console:

```text
https://pvmfgfnbtqlipnnoeixu.supabase.co/auth/v1/callback
```

### Google OAuth

Dashboard path:

`Supabase → Authentication → Providers → Google`

Provider console:

`Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client`

Required:

- Web OAuth Client ID
- Client Secret
- Authorized redirect URI: `https://pvmfgfnbtqlipnnoeixu.supabase.co/auth/v1/callback`

### Microsoft OAuth

Dashboard path:

`Supabase → Authentication → Providers → Azure`

Provider console:

`Microsoft Entra → App registrations → Authentication`

Required:

- Application/client ID
- Client Secret
- Tenant, likely `common` for multi-tenant
- Web redirect URI: `https://pvmfgfnbtqlipnnoeixu.supabase.co/auth/v1/callback`

### LinkedIn OIDC

Dashboard path:

`Supabase → Authentication → Providers → LinkedIn (OIDC)`

Provider console:

`LinkedIn Developers → App → Auth`

Required:

- Client ID
- Client Secret
- Product: Sign In with LinkedIn using OpenID Connect
- Scopes: `openid profile email`
- Authorized redirect URL: `https://pvmfgfnbtqlipnnoeixu.supabase.co/auth/v1/callback`

Use Supabase provider id `linkedin_oidc`, not legacy LinkedIn.

## Do Not Do

- Do not enable Supabase Auth Hooks yet.
- Do not run the old `20260308260000_b2b_outplacement.sql` migration.
- Do not mark skipped historical migrations as applied.
- Do not invent B2B admin contact emails.
- Do not configure the API webhook URL as the frontend Site URL.

## Test Checklist After Dashboard Setup

1. Fresh email signup with a 12+ character password.
2. Email confirmation redirects to `/workspace`.
3. Email/password login reaches workspace.
4. Forgot password email redirects to `/reset-password`.
5. Google login reaches workspace and creates `auth.identities.provider='google'`.
6. Microsoft login reaches workspace and creates `auth.identities.provider='azure'`.
7. LinkedIn login reaches workspace and creates `auth.identities.provider='linkedin_oidc'`.
8. Query provider counts in `auth.identities` and confirm `email`, `google`, `azure`, and `linkedin_oidc` exist after testing.
9. Confirm new users have corresponding `platform_auth_identities` rows.

## Verification Already Run Locally

- App typecheck passed.
- App production build passed.
- Auth-gate Playwright tests passed: 8 tests.
- Workspace responsive audit passed: 36 tests.
- Server auth/outplacement tests passed: 72 tests.
- Server typecheck passed.
- Server production build passed.
- `git diff --check` passed.

## Restart Prompt

After reopening Codex, say:

```text
Please read docs/AUTH_DASHBOARD_HANDOFF_2026-04-30.md and continue from there. First check git status, then help me finish the Supabase dashboard/OAuth setup and test auth end to end.
```
