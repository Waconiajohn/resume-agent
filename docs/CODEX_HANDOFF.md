# Codex Handoff

## Snapshot

- Date: 2026-03-30
- Active Codex repo: `/Users/johnschrup/Documents/New project/resume-agent`
- Base product commit before this handoff note: `bfde482d33877b46cf77c8087e0cbbb8dfffa4bd`
- Repo state: clean except intentionally untouched `review-bundles/`

## Git Health Warning

`git fsck --no-progress` on this local clone reports:

- invalid reflog entries referencing missing commit `a440bb711a2cc50dac4982f39409c4a2687cdbd1`
- multiple missing blobs/trees from older history

Important:

- the latest work **did push successfully** to `origin/main`
- treat the remote GitHub repo as the current source of truth
- be cautious about doing aggressive local git maintenance on this clone before comparing with the remote
- if git problems keep showing up after restart, recloning this working tree is the safest cleanup path

## Very Short Status

The core product cleanup/hardening pass is done enough to shift into launch learning.

The biggest finished areas are:

- Resume V2 proof-state and final-review cleanup
- Job Search simplification into Job Board + Pipeline
- Smart Referrals split into two clear paths
- workspace shell cleanup
- Interview / LinkedIn simplification passes
- auth-boundary and local-draft hardening
- product telemetry ingestion + admin funnel
- pilot-user session packet

## Two-Repo Reality

There are two local repos connected to the same remote Supabase project:

1. Codex repo:
   - `/Users/johnschrup/Documents/New project/resume-agent`
2. Claude repo:
   - `/Users/johnschrup/resume-agent`

Important:

- They are **not** the same local migration tree.
- Claude did the recent database reconciliation work in the Claude repo.
- The shared remote Supabase database is healthier now, but this Codex repo has **not** been migration-synced to Claude’s repo.

Do not assume local migration history in this repo matches Claude’s repo.

## Current Product State In This Repo

### Launch-readiness / telemetry

Implemented here:

- client event capture
- batched server ingestion
- `product_telemetry_events` migration file
- admin funnel tab
- watch-daily metrics
- pilot-session script

Key docs:

- [CORE_FUNNEL_EVENT_SCHEMA.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/CORE_FUNNEL_EVENT_SCHEMA.md)
- [PRODUCT_TELEMETRY_ROLLOUT.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PRODUCT_TELEMETRY_ROLLOUT.md)
- [NEXT_PHASE_PLAN.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/NEXT_PHASE_PLAN.md)

### Pilot-user packet

Freshly added in this repo:

- [PILOT_USER_EXECUTION_PLAN.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PILOT_USER_EXECUTION_PLAN.md)
- [PILOT_USER_RECRUITING_BRIEF.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PILOT_USER_RECRUITING_BRIEF.md)
- [PILOT_SESSION_NOTES_TEMPLATE.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PILOT_SESSION_NOTES_TEMPLATE.md)
- [PILOT_SESSION_SYNTHESIS_TEMPLATE.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PILOT_SESSION_SYNTHESIS_TEMPLATE.md)
- [PILOT_USER_SESSION_SCRIPT.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PILOT_USER_SESSION_SCRIPT.md)

This is the current recommended next workstream.

## Shared Remote Database Status

Claude’s repo completed the latest database work against the shared remote.

What changed remotely:

- fixed the `user_platform_context` CHECK constraint to support the current broader context-type set
- recovered 3 remote-only migrations into Claude’s repo
- applied one forward-only Batch 1 of active-feature migrations:
  - `tighten_assessment_rls`
  - `add_delete_policies`
  - `coach_tables`
  - `job_search_tables`
  - `watchlist_companies`
- aligned a large number of timestamp-shifted pairs in Claude’s repo

Claude’s reported stop point:

- 71 matched
- 3 remote-only
- 11 local-only

That stop point applies to the Claude repo, not automatically to this repo.

## Database Work Status For This Repo

In this Codex repo:

- telemetry rollout docs are current
- migration drift is documented
- no local migration reconciliation has been executed here

Relevant docs in this repo:

- [SUPABASE_MIGRATION_DRIFT_RECONCILIATION_PLAN.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/SUPABASE_MIGRATION_DRIFT_RECONCILIATION_PLAN.md)
- [PRODUCT_TELEMETRY_ROLLOUT.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PRODUCT_TELEMETRY_ROLLOUT.md)
- [server/PRODUCTION_GATES.md](/Users/johnschrup/Documents/New%20project/resume-agent/server/PRODUCTION_GATES.md)

Recommended stance:

- do **not** resume database reconciliation from this repo unless there is a deliberate decision to make this repo migration-authoritative too
- if more DB work is needed, review Claude’s latest stop-point docs first

## Best Next Step

Recommended next work in this repo:

1. recruit 5 pilot users using [PILOT_USER_RECRUITING_BRIEF.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PILOT_USER_RECRUITING_BRIEF.md)
2. run the 5 sessions using:
   - [PILOT_USER_SESSION_SCRIPT.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PILOT_USER_SESSION_SCRIPT.md)
   - [PILOT_SESSION_NOTES_TEMPLATE.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PILOT_SESSION_NOTES_TEMPLATE.md)
3. synthesize results in [PILOT_SESSION_SYNTHESIS_TEMPLATE.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PILOT_SESSION_SYNTHESIS_TEMPLATE.md)
4. compare participant behavior against the admin `Funnel` tab telemetry

## If Reopening Fresh

Read these first, in order:

1. [CODEX_HANDOFF.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/CODEX_HANDOFF.md)
2. [NEXT_PHASE_PLAN.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/NEXT_PHASE_PLAN.md)
3. [PILOT_USER_EXECUTION_PLAN.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PILOT_USER_EXECUTION_PLAN.md)
4. [CORE_FUNNEL_EVENT_SCHEMA.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/CORE_FUNNEL_EVENT_SCHEMA.md)

If the new session is about database work, also read:

5. [SUPABASE_MIGRATION_DRIFT_RECONCILIATION_PLAN.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/SUPABASE_MIGRATION_DRIFT_RECONCILIATION_PLAN.md)

## Last Commits Worth Knowing

- `bfde482` `[GC1] Add pilot user session execution packet`
- `aaf07f1` `[GC1] Document migration drift follow-up`
- `e65a060` `[GC1] Document telemetry rollout handoff`

## Safe Shutdown Check

It is safe to shut down because the latest work is pushed.

On restart:

1. treat `origin/main` as the source of truth
2. read this handoff file first
3. if git corruption blocks normal work, reclone before doing deeper git operations
