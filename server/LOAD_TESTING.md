# Load Testing

Use the built-in distributed load harness:

```bash
cd server
npm run load:profile
```

Quick smoke profile:

```bash
cd server
npm run load:profile:quick
```

Tiered comparison (small + medium + large):

```bash
cd server
npm run load:profile:tiers
```

Quick tier run:

```bash
cd server
npm run load:profile:tiers:quick
```

## Prerequisites

1. `server/.env` must contain valid:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY`
2. Build server first:
   - `npm run build`

The harness starts `dist/index.js`, provisions ephemeral Supabase users, runs distributed load phases, prints JSON metrics, then deletes test users by default.

## Useful Flags

```bash
npm run load:profile -- \
  --users=40 \
  --read-requests=2400 \
  --read-concurrency=120 \
  --sse-hold-users=40 \
  --sse-hold-ms=12000 \
  --sse-churn-requests=200 \
  --sse-churn-concurrency=50 \
  --pipeline-requests=80 \
  --pipeline-concurrency=80 \
  --cleanup=true \
  --skip-sse=false \
  --skip-pipeline=false
```

Tier runner flags:

```bash
npm run load:profile:tiers -- \
  --tiers=small,medium,large \
  --pause-ms=1500 \
  --skip-sse=false \
  --skip-pipeline=false
```

## Output

The script prints a JSON report with:

- per-phase throughput (`rps`)
- latency (`p50`, `p95`, `p99`)
- status code mix
- `/metrics` snapshots before/during/after load
- active hardening env values

The tier runner additionally prints a one-table summary for all selected tiers.

## Capacity Knobs To Tune During Profiling

- `MAX_TOTAL_SSE_CONNECTIONS`, `MAX_SSE_RATE_USERS`
- `MAX_HEAP_USED_MB` (optional load-shedding threshold)
- `MAX_RATE_LIMIT_BUCKETS`
- `MAX_CREATE_SESSION_BODY_BYTES`, `MAX_MESSAGE_BODY_BYTES`
- `MAX_PIPELINE_START_BODY_BYTES`, `MAX_PIPELINE_RESPOND_BODY_BYTES`
- `MAX_PROCESSING_SESSIONS`, `MAX_PROCESSING_SESSIONS_PER_USER`
- `MAX_IN_PROCESS_PIPELINES`, `MAX_RUNNING_PIPELINES_PER_USER`, `MAX_RUNNING_PIPELINES_GLOBAL`
- `STALE_RECOVERY_COOLDOWN_MS`, `STALE_RECOVERY_BATCH_SIZE`
- `MAX_QUEUED_PANEL_PERSISTS`
