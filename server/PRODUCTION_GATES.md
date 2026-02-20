# Production Gates

These gates are designed to block risky deploys before they reach users.

## Local usage

From `server/`:

```bash
npm run check:migrations
```

Required env:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF` (or an already-linked local Supabase CLI context)

Optional readiness probe:

```bash
READY_CHECK_URL=https://staging-api.example.com npm run check:ready
```

Optional probe tuning:

- `READY_CHECK_TIMEOUT_MS` (default `45000`)
- `READY_CHECK_INTERVAL_MS` (default `1000`)
- `READY_CHECK_REQUEST_TIMEOUT_MS` (default `min(interval, 5000)`)

Run both together:

```bash
READY_CHECK_URL=https://staging-api.example.com npm run gate:staging
```

## CI workflow

Workflow file: `.github/workflows/production-gates.yml`

It runs:

1. App verification (`app` typecheck/tests/build) on `pull_request` and `push`.
2. Server verification (`server` typecheck/tests/build) on `pull_request` and `push`.
3. Migration drift checks on `pull_request` and `push` (for `app/**`, `server/**`, and `supabase/migrations/**` changes).
4. Optional staging readiness checks on manual dispatch when `ready_check_url` is provided.

Repository secrets required for migration drift checks:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`

Recommended branch protection:

- Require `Production Gates / App Verify`
- Require `Production Gates / Server Verify`
- Require `Production Gates / Migration Drift Gate`
