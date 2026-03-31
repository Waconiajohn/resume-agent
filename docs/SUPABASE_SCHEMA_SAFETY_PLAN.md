# Supabase Schema Safety Plan — Phase 2A

**Date:** 2026-03-27
**Repo:** `/Users/johnschrup/resume-agent`
**Remote:** Supabase project `pvmfgfnbtqlipnnoeixu`

---

## The Problem

The `user_platform_context` table has a CHECK constraint (`valid_context_type`) that restricts which `context_type` values can be stored. The live remote database only allows **11 types**:

```
client_profile, career_profile, positioning_strategy, benchmark_candidate,
gap_analysis, career_narrative, industry_research, target_role, evidence_item,
retirement_readiness, linkedin_profile
```

The application code uses at least **9 additional types** that the remote constraint rejects:

```
onboarding, positioning_foundation, benchmark, why_me, interview_synthesis,
blueprint, company_research, jd_analysis, job_discovery_results,
emotional_baseline, content_post
```

Any `upsertUserContext()` call using these types will fail with a CHECK constraint violation on the remote DB. This affects: onboarding agent, retirement bridge agent, job finder agent, resume v2 pipeline (benchmark, gap_analysis outputs that reference blueprint, company_research, jd_analysis), and content calendar.

## The Chosen Fix

Create one new forward-only corrective migration that:

1. Drops the existing `valid_context_type` CHECK constraint
2. Recreates it with the full set of context types used by the current application
3. Is idempotent (uses `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`)

**Migration name:** `20260327180000_expand_context_type_constraint.sql`

This is a single ALTER TABLE operation. It does not modify data, create tables, or change RLS policies.

## Why This Is Safer Than Migration-History Repair

- **Forward-only:** Creates a new migration with a new timestamp instead of replaying old local migrations or rewriting remote history.
- **Idempotent:** Safe to run even if the constraint was already expanded by another path.
- **Minimal blast radius:** Only touches one CHECK constraint on one table. No data modification.
- **No dependency chain:** Does not require resolving the 48+ timestamp-shifted pairs first.
- **Reversible:** The constraint can be narrowed back by running the rollback SQL.

## What It Touches

| Object | Action |
|---|---|
| `user_platform_context.valid_context_type` CHECK constraint | DROP + recreate with expanded values |

No other tables, columns, indexes, RLS policies, functions, or triggers are modified.

## Full Context Type Set (22 types)

The corrective migration includes all types currently referenced in app/server code:

| Type | Used By |
|---|---|
| positioning_strategy | Resume v2 pipeline |
| evidence_item | Resume v2 pipeline, coach |
| career_narrative | Resume v2 pipeline, coach |
| target_role | Resume v2 pipeline |
| client_profile | Onboarding, coach |
| onboarding | Onboarding agent |
| positioning_foundation | Resume v2 pipeline |
| benchmark_candidate | Resume v2 pipeline |
| benchmark | Resume v2 pipeline |
| gap_analysis | Resume v2 pipeline |
| why_me | Why-Me story feature |
| interview_synthesis | Resume v2 pipeline |
| blueprint | Resume v2 pipeline |
| company_research | Resume v2 pipeline |
| jd_analysis | Resume v2 pipeline |
| industry_research | Job finder, resume v2 |
| job_discovery_results | Job finder agent |
| retirement_readiness | Retirement bridge agent |
| emotional_baseline | Emotional intelligence layer |
| content_post | Content calendar |
| career_profile | Career Profile v2 |
| linkedin_profile | LinkedIn profile feature |

## Rollback

```sql
ALTER TABLE user_platform_context DROP CONSTRAINT IF EXISTS valid_context_type;
ALTER TABLE user_platform_context ADD CONSTRAINT valid_context_type CHECK (
  context_type IN (
    'client_profile', 'career_profile', 'positioning_strategy',
    'benchmark_candidate', 'gap_analysis', 'career_narrative',
    'industry_research', 'target_role', 'evidence_item',
    'retirement_readiness', 'linkedin_profile'
  )
);
```

## Other Phase 2A Actions (non-schema)

Recovery of the 3 remote-only migrations as local files:
- `20260218232808_add_master_resume_columns_and_rpcs.sql`
- `20260220160457_fix_claim_pipeline_slot_rpc.sql`
- `20260220175237_add_moddatetime_trigger_coach_sessions.sql`

These are file-only additions to the local repo. They are NOT applied to the remote DB (they already exist there). They close the gap so that the local repo has a complete record of what the remote DB contains.
