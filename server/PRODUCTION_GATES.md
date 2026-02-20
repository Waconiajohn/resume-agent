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

Run both together:

```bash
READY_CHECK_URL=https://staging-api.example.com npm run gate:staging
```

## CI workflow

Workflow file: `.github/workflows/production-gates.yml`

It runs:

1. Migration drift checks on `pull_request` and `push` (for `server/**` and `supabase/migrations/**` changes).
2. Optional staging readiness checks on manual dispatch when `ready_check_url` is provided.

Repository secrets required for migration drift checks:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`

Recommended branch protection:

- Require the `Production Gates / Migration Drift Gate` check before merge to `main`.
