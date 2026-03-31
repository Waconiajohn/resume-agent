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
- `SUPABASE_DB_PASSWORD` for linked database drift checks against remote Postgres

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
5. Optional real-session resume preservation QA on manual dispatch when `real_qa_session_ids` is provided.

Repository secrets required for migration drift checks:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`

Recommended branch protection:

- Require `Production Gates / App Verify`
- Require `Production Gates / Server Verify`
- Require `Production Gates / Migration Drift Gate`

Current note:

- the linked environment currently has known migration-history drift, so the gate is still valuable but should be interpreted alongside [SUPABASE_MIGRATION_DRIFT_RECONCILIATION_PLAN.md](/Users/johnschrup/resume-agent/docs/SUPABASE_MIGRATION_DRIFT_RECONCILIATION_PLAN.md) until reconciliation is complete

## Resume Preservation QA

The real-session resume preservation gate is designed for release readiness and manual investigation, not every pull request.

Use the workflow dispatch inputs in `.github/workflows/production-gates.yml`:

- `real_qa_session_ids`
  - comma-separated real session IDs to run through `npm run qa:real`
- `ready_check_url`
  - optional if you also want the `/ready` probe in the same manual run

Required repository secrets for the real-session QA job:

- `ZAI_API_KEY`
- `PERPLEXITY_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Outputs:

- GitHub step summary with preservation status, bullet-density ratio, and any gate alerts
- Uploaded artifact: `resume-preservation-qa`
- Local artifact shape mirrored under [test-results/real-session-quality](/Users/johnschrup/resume-agent/test-results/real-session-quality)

Default behavior:

- `npm run qa:real` fails only on preservation `fail` sessions
- `npm run qa:real:strict` also fails on `warn` sessions when you want a tighter release bar
