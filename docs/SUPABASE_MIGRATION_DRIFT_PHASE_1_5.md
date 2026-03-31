# Supabase Migration Drift — Phase 1.5 Pre-Repair Analysis

**Date:** 2026-03-27
**Repo:** `/Users/johnschrup/resume-agent` (canonical local repo)
**Remote:** Supabase project `pvmfgfnbtqlipnnoeixu` (shared)

> **Scope:** This report covers ONLY the canonical local repo at `/Users/johnschrup/resume-agent` compared against the shared remote Supabase project. The older duplicate clone under `/Users/johnschrup/Documents/New project/resume-agent` has been deleted and is no longer part of the workflow.

---

## 1. Confirmed Drift Counts

| Metric | Value |
|---|---|
| Local migration files | 78 |
| Remote migration entries | 68 |
| Matched (same timestamp + name) | 15 |
| Likely equivalent (timestamp-shifted) | 48 |
| Timestamp-shifted with confirmed MISMATCH | **2** |
| Remote-only (no local file) | **3** |
| Local-only (never applied to remote) | **13** |

---

## 2. Remote-Only Migration SQL Recovery

All 3 remote-only migrations were successfully recovered from `supabase_migrations.schema_migrations`.

### 2a. `20260218232808_add_master_resume_columns_and_rpcs`

**Status:** SQL fully recovered.

**What it does:**
- Adds `is_default BOOLEAN NOT NULL DEFAULT false` to `master_resumes`
- Adds `source_session_id UUID` FK to `coach_sessions` on `master_resumes`
- Creates partial unique index `master_resumes_user_default_unique` (one default per user)
- Backfills `is_default = true` for the most recent resume per user
- Creates 3 RPCs:
  - `create_master_resume_atomic(...)` — insert with optional default-setting
  - `set_default_master_resume(p_user_id, p_resume_id)` — change default
  - `delete_master_resume_with_fallback_default(p_user_id, p_resume_id)` — delete with fallback promotion

**Risk:** HIGH — `master_resumes` is a core table. These RPCs are likely called by server code. No local migration file exists, so a fresh DB build from this repo would be missing these columns and RPCs.

### 2b. `20260220160457_fix_claim_pipeline_slot_rpc`

**Status:** SQL fully recovered.

**What it does:**
- Rewrites `claim_pipeline_slot(p_session_id, p_user_id)` to return `BOOLEAN`
- Sets pipeline_status='running', pipeline_stage='intake', clears gate fields
- Only claims if status IS NULL or 'error'

**Risk:** HIGH but context-dependent. This was an intermediate fix. The local repo has a more advanced version of this RPC in `20260228120000_add_claim_pipeline_slot_rpc.sql` (returns jsonb, adds `pipeline_started_at` column). The remote-only migration `20260220175237` further updated this RPC. The live remote schema reflects the LAST applied version.

### 2c. `20260220175237_add_moddatetime_trigger_coach_sessions`

**Status:** SQL fully recovered.

**What it does:**
- Enables `moddatetime` extension
- Creates trigger `handle_updated_at` on `coach_sessions` (auto-updates `updated_at`)
- Rewrites `claim_pipeline_slot` again to explicitly set `updated_at = NOW()`

**Risk:** HIGH — the moddatetime trigger is a live dependency for `coach_sessions.updated_at`. No local file exists to recreate this on a fresh DB build.

---

## 3. Parity Check Results (10 Sampled Pairs)

### 3a. Verified as likely_same (8 of 10)

| # | Migration Name | Local File | Remote Timestamp | Basis |
|---|---|---|---|---|
| 1 | product_telemetry_events | `20260330130000_...sql` | 20260330192710 | Identical DDL. Local has extra SQL comments only. |
| 2 | stripe_billing | `20260228150000_...sql` | 20260308213725 | Identical ALTER TABLE + COMMENT. Local has rollback hint. |
| 3 | atomic_context_upsert | `20260308230000_...sql` | 20260308213805 | Identical function body, params, ON CONFLICT logic. |
| 4 | add_product_type_to_sessions | `20260308280000_...sql` | 20260308225557 | Identical ALTER, UPDATE backfill, CREATE INDEX. |
| 5 | affiliate_system | `20260228200000_...sql` | 20260308213746 | Same tables, columns, RLS, indexes. Local has extra comments. |
| 6 | network_intelligence | `20260303120000_...sql` | 20260308213829 | Same 6 tables, same columns, indexes, RLS, triggers. |
| 7 | add_workflow_artifacts_and_nodes | `20260224190000_...sql` | 20260225024605 | Same 3 tables, same indexes, same constraints. Local wraps in BEGIN/COMMIT. |
| 8 | user_momentum | `20260308200000_...sql` | 20260308213303 | Same 3 tables, same columns, RLS, trigger. Local has extra comments. |

### 3b. Verified as MISMATCH (2 of 10)

#### MISMATCH #1: `add_claim_pipeline_slot_rpc`

| | Local | Remote |
|---|---|---|
| Timestamp | 20260228120000 | 20260220160445 |
| Return type | `jsonb` | `boolean` |
| Adds column | `pipeline_started_at` | No |
| Permission control | `REVOKE ALL` + `GRANT TO service_role` | None |
| Condition | `pipeline_status <> 'running'` | `pipeline_status IS NULL OR = 'error'` |
| SET search_path | Yes | No |

**Impact:** The local version is significantly enhanced — it returns the full row as jsonb, adds a timestamp column, and locks down permissions. The remote version is simpler. The live remote DB has been further modified by `fix_claim_pipeline_slot_rpc` and `add_moddatetime_trigger_coach_sessions`, so the actual live RPC differs from BOTH the local file and the original remote entry.

**Action needed:** Determine what the live RPC signature actually is now (it was overwritten multiple times) and ensure local files match.

#### MISMATCH #2: `add_linkedin_profile_context_type`

| | Local | Remote |
|---|---|---|
| Timestamp | 20260324000000 | 20260324135926 |
| Context types in CHECK | **20** types | **11** types |

**Local includes but remote lacks:** `onboarding`, `positioning_foundation`, `benchmark`, `why_me`, `interview_synthesis`, `blueprint`, `company_research`, `jd_analysis`, `job_discovery_results`, `emotional_baseline`, `content_post`

**Root cause:** Local migration `20260311100000_expand_context_check.sql` was never applied to remote. That migration expanded the CHECK constraint to include these types. The local `add_linkedin_profile_context_type` was authored AFTER that expansion, so it naturally includes all types. The remote version was authored independently without that expansion.

**Impact:** CRITICAL. Any platform context upsert using types like `onboarding`, `why_me`, `blueprint`, `company_research`, `jd_analysis`, etc. will **fail the CHECK constraint on the remote DB**. This is a live schema divergence affecting multiple agents.

---

## 4. Local-Only Migration Classification (13 migrations)

Based on code search across `app/src/` and `server/src/`:

| # | Migration | Creates/Modifies | Classification | Evidence |
|---|---|---|---|---|
| 1 | b2b_outplacement | 4 tables: b2b_organizations, contracts, cohorts, seats | used_by_live_code | routes/b2b-admin.ts (17 endpoints), lib/b2b.ts. FF_B2B_OUTPLACEMENT=**false** |
| 2 | b2b_indexes | Indexes on b2b tables | used_by_live_code | Depends on #1. Same routes. |
| 3 | job_search_tables | job_listings, job_search_scans, job_search_results | used_by_live_code | routes/job-search.ts, hooks/useRadarSearch.ts. FF_JOB_SEARCH=**true** |
| 4 | watchlist_companies | watchlist_companies table | used_by_live_code | routes/watchlist.ts, hooks/useWatchlist.ts. FF_JOB_SEARCH=**true** |
| 5 | networking_application_link | Adds columns to networking_contacts | used_by_live_code | hooks/useRuleOfFour.ts, routes/networking-contacts.ts |
| 6 | extension_support | Adds columns to application_pipeline, job_applications | **used_by_dormant_code** | routes/extension.ts exists but FF_EXTENSION=**false** |
| 7 | coach_tables | coach_conversations table | used_by_live_code | agents/coach/conversation-loop.ts, routes/coach.ts. FF_VIRTUAL_COACH=**true** |
| 8 | **expand_context_check** | Expands CHECK constraint to 20+ types | **used_by_live_code** | ALL platform context upserts. **CRITICAL** — without this, many agent writes fail |
| 9 | tighten_assessment_rls | Restricts assessment INSERTs to service_role | used_by_live_code | retirement-bridge, onboarding pipelines |
| 10 | add_delete_policies | DELETE RLS on 4 core tables | used_by_live_code | master_resumes, job_applications, coach_sessions, why_me_stories |
| 11 | products_catalog | products table | used_by_live_code | routes/products.ts, GET /api/products |
| 12 | job_workspace_asset_links | Adds session_id, job_application_id to report tables | used_by_live_code | interview-prep, thank-you-note, ninety-day-plan agents |
| 13 | add_career_profile_context_type | Adds career_profile to CHECK | used_by_live_code | Career Profile v2 feature |

**Summary:** 12 used_by_live_code, 1 used_by_dormant_code, 0 probably_dead, 0 unknown.

---

## 5. Recommended Phase 2 Order

### Step 1 — URGENT: Apply `expand_context_check` to remote (HIGH)

The remote CHECK constraint is missing 9 context types that live agents use. This is a **blocking schema divergence**. Any session that triggers onboarding, gap analysis, or blueprint context writes against the remote DB will hit a CHECK violation.

**Do first. Do carefully. Verify the live constraint before and after.**

### Step 2 — Recover the 3 remote-only migrations as local files (HIGH)

Create local migration files for:
- `20260218232808_add_master_resume_columns_and_rpcs.sql`
- `20260220160457_fix_claim_pipeline_slot_rpc.sql`
- `20260220175237_add_moddatetime_trigger_coach_sessions.sql`

Use the recovered SQL from Section 2. Mark them as `--status applied` via `supabase migration repair`.

### Step 3 — Resolve the `claim_pipeline_slot_rpc` divergence (HIGH)

Determine the actual live RPC signature by querying `pg_proc`. The RPC has been overwritten 3 times across different migrations. Create a reconciliation migration if the live version doesn't match what local code expects.

### Step 4 — Reconcile the 48 timestamp-shifted equivalent pairs (LOW)

Scripted `supabase migration repair` for each pair. Choose one canonical timestamp direction (recommend: adopt remote timestamps, rename local files).

### Step 5 — Apply local-only migrations needed by active features (MEDIUM)

Priority order based on feature flags:
1. `expand_context_check` (already in Step 1)
2. `coach_tables` (FF_VIRTUAL_COACH=true)
3. `job_search_tables` + `watchlist_companies` (FF_JOB_SEARCH=true)
4. `networking_application_link` (active feature)
5. `add_delete_policies` (security hardening)
6. `tighten_assessment_rls` (security hardening)
7. `products_catalog`, `job_workspace_asset_links`, `add_career_profile_context_type`
8. `b2b_outplacement` + `b2b_indexes` (FF=false, can defer)
9. `extension_support` (FF=false, can defer)

### Step 6 — Full validation

Run `npm run check:migrations` and confirm zero unexplained drift.

---

## 6. DO NOT DO YET — Unverified Assumptions

1. **Do not assume all 48 "likely equivalent" pairs are identical.** Only 8 of 10 sampled pairs matched. The 2 mismatches were significant. The remaining 40 unchecked pairs should be spot-checked before bulk reconciliation.

2. **Do not rename local migration files** until you've decided whether to adopt local or remote timestamps as canonical. This decision affects all 48+ pairs.

3. **Do not apply the 13 local-only migrations in bulk.** Some create tables, some ALTER existing tables. Apply in dependency order, one at a time, verifying after each.

4. **Do not assume the live `claim_pipeline_slot` RPC matches any single migration file.** It was overwritten 3 times. Query `pg_proc` to determine the actual live signature before reconciling.

5. **Do not assume the live CHECK constraint on `user_platform_context` matches either the local or remote migration file.** Query the live constraint directly before applying `expand_context_check`.

---

## Appendix: Commands Used

```bash
# Drift check
cd /Users/johnschrup/resume-agent/server
set -a && source .env && set +a
npm run check:migrations

# Local migration listing
ls -1 /Users/johnschrup/resume-agent/supabase/migrations/ | sort

# Remote migration listing (via Supabase MCP)
# mcp__claude_ai_Supabase__list_migrations(project_id="pvmfgfnbtqlipnnoeixu")

# Remote-only SQL recovery
# SELECT version, name, statements FROM supabase_migrations.schema_migrations
# WHERE version IN ('20260218232808', '20260220160457', '20260220175237')

# Parity check SQL recovery (10 sampled pairs)
# SELECT version, name, statements FROM supabase_migrations.schema_migrations
# WHERE version IN ('20260330192710', '20260308213725', '20260220160445',
#   '20260308213805', '20260308225557', '20260308213746', '20260308213829',
#   '20260225024605', '20260308213303', '20260324135926')

# Code usage search for local-only migrations
# grep -r across app/src/ and server/src/ for table names, route handlers, hooks
```
