# Supabase Local-Only Batch 1 — Apply Plan

**Date:** 2026-03-27
**Repo:** `/Users/johnschrup/resume-agent`
**Remote:** Supabase project `pvmfgfnbtqlipnnoeixu`

---

## Migrations in This Batch (5)

### 1. `20260311100100_tighten_assessment_rls.sql`
- **Why:** Closes a security gap — onboarding_assessments and retirement_readiness_assessments currently allow any authenticated user to INSERT/UPDATE any row. This restricts writes to service_role only.
- **Schema effects:** Drops 2 permissive policies, creates 4 restrictive policies (INSERT+UPDATE on each table, TO service_role only). No table/column changes.
- **Risk:** Very low. The server already uses service_role for these writes. No user-facing code directly inserts into these tables.

### 2. `20260311100200_add_delete_policies.sql`
- **Why:** Users need to delete their own resumes, applications, sessions, and Why-Me stories. DELETE policies are currently missing.
- **Schema effects:** Creates 4 DELETE policies on master_resumes, job_applications, coach_sessions, why_me_stories. Pattern: `USING (auth.uid() = user_id)`.
- **Risk:** Very low. Additive — only enables an operation that was previously blocked.

### 3. `20260311000000_coach_tables.sql`
- **Why:** Virtual Coach (FF_VIRTUAL_COACH=true) requires persistent conversation storage, memory notes, and budget tracking. Without these tables, coach routes error at runtime.
- **Schema effects:** Creates 3 new tables (`coach_conversations`, `coach_memory`, `coach_budget`) with RLS, indexes, moddatetime triggers, and comments.
- **Risk:** Low. New tables only — no modification to existing tables. Depends on moddatetime extension (already enabled by `20260220175237`).

### 4. `20260308290000_job_search_tables.sql`
- **Why:** Job Command Center (FF_JOB_SEARCH=true) requires job listing storage, search history, and result tracking. Without these tables, job search routes error at runtime.
- **Schema effects:** Creates 3 new tables (`job_listings`, `job_search_scans`, `job_search_results`) with RLS, indexes, moddatetime triggers, and unique constraints.
- **Risk:** Low. New tables only. Depends on moddatetime extension (already enabled).

### 5. `20260308300000_watchlist_companies.sql`
- **Why:** Company watchlist feature (FF_JOB_SEARCH=true) requires a table for user-curated target companies. Used by WatchlistBar.tsx and useWatchlist.ts.
- **Schema effects:** Creates 1 new table (`watchlist_companies`) with RLS, index, moddatetime trigger.
- **Risk:** Very low. Single new table. No dependencies on other unapplied migrations.

---

## Dependencies

- Migrations #3, #4, #5 depend on `moddatetime` extension — already enabled on remote (verified via `20260220175237_add_moddatetime_trigger_coach_sessions`).
- No dependencies between the 5 migrations in this batch.
- No dependencies on any unapplied local-only migration.

---

## Explicit Exclusions

- expand_context_check, add_career_profile_context_type (superseded)
- expand_referral_bonus_programs (schema diff, not yet resolved)
- add_claim_pipeline_slot_rpc (intentionally divergent)
- add_linkedin_profile_context_type (superseded)
- b2b_outplacement, b2b_indexes (deferred to Batch 2)
- networking_application_link, extension_support, products_catalog, job_workspace_asset_links (deferred)

---

## Apply Method

Using Supabase MCP `apply_migration` for each. Forward-only. No history repair.
