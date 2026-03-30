# Product Telemetry Rollout

## Current Status

The product telemetry pipeline is implemented in code:

- client capture and local buffer
- client batch flush to the server
- server ingestion route
- Supabase table migration
- admin funnel summary
- pilot-session script

The telemetry migration is now live in Supabase.

Current operational state:

- `SUPABASE_DB_PASSWORD` is now working from [server/.env](/Users/johnschrup/Documents/New%20project/resume-agent/server/.env)
- the `product_telemetry_events` table was applied through a fallback migration path
- the admin `Funnel` view is ready to read real events
- the broader Supabase migration history is still out of sync and should be treated as a separate reconciliation task

This means product telemetry is usable now, but migration drift is not yet resolved globally.

Drift follow-up plan:

- [SUPABASE_MIGRATION_DRIFT_RECONCILIATION_PLAN.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/SUPABASE_MIGRATION_DRIFT_RECONCILIATION_PLAN.md)

## What To Run From This Environment

From [server](/Users/johnschrup/Documents/New%20project/resume-agent/server):

```bash
set -a
source .env
set +a
npm run check:migrations
```

Current expected result:

- the telemetry table is already live
- the check still reports broader migration drift across the repo
- the telemetry migration should no longer be treated as a blocked apply task

## Fallback If CLI Access Is Still Blocked

Apply the SQL directly in the Supabase SQL editor using:

- [20260330130000_product_telemetry_events.sql](/Users/johnschrup/Documents/New%20project/resume-agent/supabase/migrations/20260330130000_product_telemetry_events.sql)

That is less ideal than the CLI path, but it is acceptable for getting the telemetry sink live.

That fallback path is what was used to get the telemetry table live before the DB password was corrected in this environment.

## Validation After Migration

### 1. Start the app and server

Use the normal local dev flow.

### 2. Generate a few real events

In the app:

1. Open Job Search
2. Run one job-board search
3. Generate Boolean search strings
4. Copy at least one search string
5. Open Shortlist
6. Open Smart Referrals
7. Switch between network and bonus paths

### 3. Check the admin funnel

Open:

- `/admin`

Use the admin key and open the `Funnel` tab in:

- [AdminDashboard.tsx](/Users/johnschrup/Documents/New%20project/resume-agent/app/src/components/admin/AdminDashboard.tsx)

You should see:

- active users
- tracked events
- core funnel steps
- watch daily metrics
- Smart Referrals path split
- shortlist entry split
- Boolean copy target split

### 4. Confirm the API directly if needed

```bash
curl -H "Authorization: Bearer <ADMIN_API_KEY>" \
  http://127.0.0.1:3001/api/admin/product-funnel
```

Expected:

- non-zero event counts after interacting with the app
- funnel steps populated
- `watch_metrics` included in the response

## Migration History Note

Running `npm run check:migrations` now confirms two separate truths:

1. the telemetry table is live and usable
2. the repository still has pre-existing local/remote migration drift

Do not treat that drift as part of the telemetry rollout anymore. It should be handled through the dedicated reconciliation plan:

- [SUPABASE_MIGRATION_DRIFT_RECONCILIATION_PLAN.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/SUPABASE_MIGRATION_DRIFT_RECONCILIATION_PLAN.md)

## First Things To Watch Daily

These are the current operator-facing metrics:

1. `Job Search -> Shortlist`
2. `Shortlist -> Resume Build`
3. `Boolean Search -> Copy`
4. `Smart Referrals -> Outreach`
5. `Smart Referrals Network Path Share`

## After Rollout

Once the table is live and the funnel is receiving real traffic, the next best moves are:

1. run the first 5 pilot sessions using [PILOT_USER_SESSION_SCRIPT.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PILOT_USER_SESSION_SCRIPT.md)
2. compare session notes with the funnel metrics
3. decide the first activation and monetization checkpoints from observed behavior
