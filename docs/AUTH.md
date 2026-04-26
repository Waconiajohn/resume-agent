# Authentication — configuration & operating notes

This file is the source of truth for how authentication is configured on the platform. Most of the cryptographic primitives, OAuth providers, and email templates live in the Supabase dashboard (not in code), so this doc exists to make those settings auditable from a clone of the repo.

If you change anything in the dashboard, update this file in the same PR.

---

## Stack

- **Auth provider:** Supabase Auth (GoTrue), backing the project at `pvmfgfnbtqlipnnoeixu.supabase.co` (ref `pvmfgfnbtqlipnnoeixu`, region `us-west-2`, Postgres 17).
- **Frontend:** Vite + React 19. Client at `app/src/lib/supabase.ts`. Session persisted by supabase-js in `localStorage` under key `sb-pvmfgfnbtqlipnnoeixu-auth-token`.
- **Backend:** Hono on port 3001. Auth middleware at `server/src/middleware/auth.ts` validates JWTs by calling `supabaseAdmin.auth.getUser(token)` with a 5-minute LRU cache (max 1,000 tokens, expiry-respecting).
- **Database:** Postgres + RLS. 63 tables in `public.*` with RLS enabled; 43 user-scoped via `auth.uid() = user_id`.

## Sign-in methods

- **Email + password** (primary)
- **Google OAuth** (secondary; configured in dashboard → Authentication → Providers → Google)
- **Magic link** — *not enabled.* Backlog item in the Sprint C section of the auth-hardening plan.
- **SAML SSO** — *not enabled.* Future B2B work.

When you enable a new OAuth provider in the dashboard, add a row to the table below in the same change.

| Provider | Status | Configured in dashboard | Notes |
|---|---|---|---|
| Email + password | enabled | Authentication → Providers → Email | Email confirmation **required** before account is active. |
| Google OAuth | enabled | Authentication → Providers → Google | OAuth client ID + secret in dashboard. |
| GitHub | disabled | — | — |
| Apple | disabled | — | — |
| LinkedIn | disabled | — | — |
| Magic link | disabled | — | Sprint C if/when we add it. |

## Password policy

| Layer | Setting | Source of truth |
|---|---|---|
| Frontend `MIN_PASSWORD_LENGTH` | **12** | `app/src/lib/password-policy.ts` |
| Frontend HIBP breached-password check | **enabled** (k-anonymity API, fail-open on network error) | `app/src/lib/password-policy.ts` `checkPasswordBreached` |
| Frontend single-char-repeat reject | enabled | same module |
| Supabase `password_min_length` | **set to 12 in dashboard** | Authentication → Providers → Email → "Minimum password length" |
| Supabase `password_required_characters` | optional (we don't require any specific class) | dashboard |

**Sign-in path is unchanged** — a user with a legacy 6-character password can still sign in. They hit the new policy only on their next reset.

When you change the dashboard's `password_min_length`, update both this table and `MIN_PASSWORD_LENGTH` in `app/src/lib/password-policy.ts` so the two stay aligned.

## JWT / session config

These all live in the Supabase dashboard (Authentication → JWT Settings, Sessions, etc.). Snapshot them here when you change them; the values shown are Supabase defaults until told otherwise.

| Setting | Default / current | Notes |
|---|---|---|
| JWT expiry | 3,600 s (1 h) | Frontend auto-refreshes every 45 min (`app/src/hooks/useAuth.ts`). |
| Refresh token TTL | 604,800 s (7 d) | |
| Refresh token rotation | enabled | |
| Reuse detection | enabled | |
| JWT signing key rotation | manual via dashboard | Rotating invalidates every active session. |

## Email verification & reset

- **Email confirmation required on signup** (Supabase enforces; signup doesn't authenticate the user until they click the link).
- **Password reset** uses Supabase's `resetPasswordForEmail` with `redirectTo = ${origin}/reset-password`. Frontend route at `app/src/components/auth/ResetPassword.tsx` validates the session before showing the form.
- **Email templates** live in dashboard → Authentication → Email Templates. Custom templates have not been authored — Supabase defaults are in use.

## Account deletion

- **UI:** Settings page → "Danger zone — Delete account." Type `DELETE` to confirm.
- **Route:** `DELETE /api/account` (`server/src/routes/account.ts`).
- **Order:** cancel Stripe subscription → `auth.admin.deleteUser`. Postgres CASCADE on every public.* FK to `auth.users` wipes user content (migration `20260426000000_cascade_user_deletion_fks.sql`).
- **Stripe failure** other than `resource_missing` aborts before the auth delete (so we never delete an account that's still being billed).
- No soft-delete window currently; deletion is immediate. Revisit if compliance / "I clicked it by accident" recovery matters.

## Mock auth (E2E only)

Both client and server have an opt-in mock-auth mode for local E2E testing. Both refuse to run with mock auth in a production build:

- **Frontend:** `app/src/lib/supabase.ts` throws on module load if `VITE_E2E_MOCK_AUTH=true` AND `import.meta.env.PROD`. The localStorage `e2e_disable_mock_auth` flag opts OUT of mock auth in dev — it cannot opt IN, by design.
- **Backend:** `server/src/middleware/auth.ts` `process.exit(1)` if `E2E_MOCK_AUTH=true` AND `NODE_ENV=production`.

Both gates must remain in place. They are unit-tested (`app/src/__tests__/lib/supabase-prod-mock-block.test.ts` and `server/src/__tests__/auth-cache.test.ts`).

## RLS posture

- 63 public.* tables have RLS enabled (audited 2026-04-25 against the production DB).
- 43 are user-scoped via `auth.uid() = user_id`.
- 3 are public-read (`pricing_plans`, `company_directory`, `referral_bonus_programs`) — intentional reference data.
- 5 are service-role-only (`plan_features`, `user_feature_overrides`, `affiliates`, `referral_events`, `resume_v3_shadow_runs`).
- An earlier `WITH CHECK (true)` weakness on `onboarding_assessments` and `retirement_readiness_assessments` was tightened to service-role-only in migration `20260330211757_tighten_assessment_rls.sql`.

Rule of thumb: if a new table holds per-user data, add RLS + `USING (auth.uid() = user_id)` for SELECT and `WITH CHECK (auth.uid() = user_id)` for INSERT/UPDATE. Never `WITH CHECK (true)` unless it's intentionally public.

## Backend auth-related security headers

Set on every API response in `server/src/index.ts`:

- `Content-Security-Policy` — strict; allows only `'self'`, plus `*.ingest.sentry.io` for Sentry, plus the configured `ALLOWED_ORIGINS`.
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `X-Permitted-Cross-Domain-Policies: none`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (production over HTTPS only)

## Logging

- pino redaction config (`server/src/lib/logger.ts`) strips: `Authorization` (and case variants under `headers.*` and `req.headers.*`), `resume_text`, `job_description`, `original_resume`, `rawSnippet`. Pinned by `server/src/__tests__/logger-redaction.test.ts`.

## What lives where (operator cheat sheet)

| You want to change… | Look in… |
|---|---|
| Minimum password length | Both `app/src/lib/password-policy.ts:MIN_PASSWORD_LENGTH` and Supabase dashboard → Authentication → Providers → Email |
| JWT / refresh-token expiry | Supabase dashboard → Authentication → Sessions |
| OAuth providers | Supabase dashboard → Authentication → Providers, then update the table in this file |
| Email templates | Supabase dashboard → Authentication → Email Templates |
| Allowed origins (CORS) | `ALLOWED_ORIGINS` env var on the Hono server |
| Rate limits on auth-adjacent backend routes | `rateLimitMiddleware(...)` calls in `server/src/routes/*.ts` |
| RLS policies | `supabase/migrations/*` |
| Cascade behavior on `auth.users` delete | `supabase/migrations/20260426000000_cascade_user_deletion_fks.sql` |
| Account deletion flow | `server/src/routes/account.ts` + `app/src/components/SettingsPage.tsx` |
| Mock auth gates | `app/src/lib/supabase.ts` and `server/src/middleware/auth.ts` |

## Multi-factor authentication

| Layer | Setting / Status |
|---|---|
| TOTP enrollment | **enabled** — Settings → Security → "Enable two-factor authentication" |
| Implementation | `app/src/lib/mfa.ts` (Supabase MFA wrapper) + `MfaEnrollFlow` (3-step intro/scan/verify) + `SecurityCard` (Settings) |
| Sign-in challenge | `MfaChallengeGate` overlay; blocks the app at AAL1 when verified factors exist |
| WebAuthn passkeys | not enabled (Sprint C) |
| Backup / recovery codes | not implemented; "lost device" recovery goes through password reset (which clears the factor) and re-enrollment. Sprint C item. |
| Audit | `mfa_enrolled`, `mfa_challenge_passed`, `mfa_challenge_failed` events flow through `auth_audit_log` |

When the dashboard `auth.config.mfa_max_enrolled_factors` value is changed, document it in this table.

## Active session list (Settings → Active sessions)

Users can see and revoke their own Supabase auth sessions (one row per signed-in browser/device):

- `GET /api/auth/sessions` — list with a `current` marker on the caller's session
- `DELETE /api/auth/sessions/:id` — revoke one (refuses to revoke the caller's current session — sign out is for that)
- `POST /api/auth/sessions/sign-out-others` — revoke every other session in one call

Implementation: `auth.sessions` is not exposed via PostgREST and supabase-js v2's admin SDK doesn't have `listUserSessions`, so three SECURITY DEFINER RPCs in `supabase/migrations/20260426000003_user_sessions_rpcs_caller_arg.sql` provide the boundary. They take `caller_user_id` explicitly and are GRANTed to `service_role` only — backend-private. The route's auth middleware verifies the JWT, then passes `user.id` plus the `session_id` claim into the RPC.

## Auth event audit log

A user-visible activity feed of authentication events lives in `public.auth_audit_log` and is exposed via:

- `POST /api/auth/events` — record one event (frontend `AuthEventEmitter` is the primary writer)
- `GET /api/auth/events` — read the caller's own log; capped at 200 rows

Written via `supabaseAdmin` so the table can keep service-role-only INSERT in RLS. Allowed event types:

- `signed_in`, `signed_out`, `password_recovery_started`, `password_changed`, `user_updated`
- `mfa_enrolled`, `mfa_challenge_passed`, `mfa_challenge_failed`

The CHECK constraint pins this list; adding a new event type requires both a migration to update the constraint and the relevant frontend emit point.

The frontend skips `TOKEN_REFRESHED` (noisy, every 45 min) and de-dupes back-to-back duplicates inside 5s for the OAuth-redirect double-fire case.

A future Supabase Auth Hook will also POST server-side events (failed-login attempts) to the same route — Sprint C.

## Out of scope today

Backlog items deferred to later sprints:

- **WebAuthn passkeys** — Supabase supports `factorType: 'webauthn'`; UI not built yet.
- **MFA backup / recovery codes** — Sprint C; today, lost devices recover via password reset.
- **Email change flow** — `supabase.auth.updateUser({ email })` works but no UI yet.
- **SAML SSO for B2B** — Supabase Pro feature; needs UI in the B2B admin portal.
- **Suspicious-login detection** — new-device email, geolocation flag, Cloudflare Turnstile in front of signup.
- **Supabase Auth Hook → /api/auth/webhook** — captures server-side events the frontend can't see.
