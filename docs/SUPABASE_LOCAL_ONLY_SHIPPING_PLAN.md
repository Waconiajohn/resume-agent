# Supabase Local-Only Migration Shipping Plan

**Date:** 2026-03-27
**Repo:** `/Users/johnschrup/resume-agent`
**Remote:** Supabase project `pvmfgfnbtqlipnnoeixu`

> This plan covers the 13 truly local-only migrations that have never been applied to the shared remote Supabase database. It does NOT cover the 3 divergent-pair items (claim_pipeline_slot, expand_referral_bonus_programs, add_linkedin_profile_context_type).

---

## Batch 1: Context & Constraint Alignment

**Risk:** Very low — these are CHECK constraint and RLS policy changes. No new tables.

| # | Timestamp | Name | Status | Notes |
|---|---|---|---|---|
| 1 | 20260311100000 | expand_context_check | **superseded_do_not_ship** | The corrective migration `20260330203002_expand_context_type_constraint` already applied the full expanded CHECK to remote. This migration would be a no-op. Mark as applied via `supabase migration repair --status applied 20260311100000` during history reconciliation. |
| 2 | 20260318234500 | add_career_profile_context_type | **superseded_do_not_ship** | Same as above — the corrective migration already includes `career_profile` in the CHECK. Mark as applied. |
| 3 | 20260311100100 | tighten_assessment_rls | **ship_now_candidate** | Restricts INSERT/UPDATE on onboarding_assessments and retirement_readiness_assessments to service_role. Lightweight, non-breaking. No data changes. |
| 4 | 20260311100200 | add_delete_policies | **ship_now_candidate** | Adds DELETE RLS policies on master_resumes, job_applications, coach_sessions, why_me_stories. Lightweight, non-breaking. Enables user-initiated deletes. |

**Rollback:** DROP POLICY statements for #3 and #4. Reversible in seconds.

**Risk notes:** None of these create tables or modify data. They only tighten or add RLS policies.

---

## Batch 2: Coach & Job Search Tables

**Risk:** Low — creates new tables. Feature-flagged. No impact on existing tables.

| # | Timestamp | Name | Status | Notes |
|---|---|---|---|---|
| 5 | 20260311000000 | coach_tables | **ship_now_candidate** | Creates `coach_conversations` (and possibly `coach_memory`, `coach_budget`). Required by Virtual Coach agent (FF_VIRTUAL_COACH=true). Routes: coach.ts. Components: CoachDrawer.tsx. |
| 6 | 20260308290000 | job_search_tables | **ship_now_candidate** | Creates `job_listings`, `job_search_scans`, `job_search_results`. Required by Job Command Center (FF_JOB_SEARCH=true). Routes: job-search.ts. Components: RadarSection.tsx. |
| 7 | 20260308300000 | watchlist_companies | **ship_now_candidate** | Creates `watchlist_companies`. Required by watchlist feature (FF_JOB_SEARCH=true). Routes: watchlist.ts. Components: WatchlistBar.tsx. |

**Rollback:** DROP TABLE statements. Clean rollback since tables are new.

**Risk notes:** These tables are referenced by active routes with feature flags enabled. Without these tables, the coach conversation persistence and job search persistence features will error at runtime on the remote DB. These are high-priority ships.

**Dependencies:** `watchlist_companies` shares the job-search route namespace with `job_search_tables`. Ship together.

---

## Batch 3: B2B Outplacement

**Risk:** Very low — creates tables for a feature-flagged-off feature.

| # | Timestamp | Name | Status | Notes |
|---|---|---|---|---|
| 8 | 20260308260000 | b2b_outplacement | **ship_later_candidate** | Creates `b2b_organizations`, `b2b_contracts`, `b2b_employee_cohorts`, `b2b_seats`. Feature flag FF_B2B_OUTPLACEMENT=false. Users cannot access. |
| 9 | 20260308270000 | b2b_indexes | **ship_later_candidate** | Indexes for the above tables. Depends on #8. |

**Rollback:** DROP TABLE/INDEX statements. Clean rollback.

**Risk notes:** Zero user exposure until FF_B2B_OUTPLACEMENT is set to true. Safe to ship at any time but not urgent. Routes exist at /api/b2b but are gated.

**Dependencies:** #9 depends on #8. Must ship together, in order.

---

## Batch 4: Deferred Integrations & Enhancements

**Risk:** Very low — nullable column additions and new tables with static fallbacks.

| # | Timestamp | Name | Status | Notes |
|---|---|---|---|---|
| 10 | 20260308310000 | networking_application_link | **defer_product_decision** | Adds `application_id` and `contact_role` columns to `networking_contacts`. Used by Rule of Four coaching bar (hooks/useRuleOfFour.ts). Columns are nullable — existing code gracefully handles absence. |
| 11 | 20260309400000 | extension_support | **defer_product_decision** | Adds `discovered_via`, `applied_via`, `normalized_url` to application_pipeline and job_applications. FF_EXTENSION=false. Browser extension not released. Zero impact until released. |
| 12 | 20260313120000 | products_catalog | **defer_product_decision** | Creates `products` table. App has static PRODUCT_CATALOG fallback in platform.ts. DB version enables dynamic updates but isn't strictly required. |
| 13 | 20260317121500 | job_workspace_asset_links | **defer_product_decision** | Adds `session_id`, `job_application_id` to interview_prep_reports, thank_you_note_reports, ninety_day_plan_reports, salary_negotiation_reports. Nullable columns for workspace asset reopening. Enhancement only. |

**Rollback:** DROP COLUMN / DROP TABLE statements.

**Risk notes:** All 4 are backward-compatible. Existing code works without these changes (graceful null handling, static fallbacks, feature flags). Ship when the corresponding features are ready for production use.

---

## Summary

| Status | Count | Migrations |
|---|---|---|
| **ship_now_candidate** | 5 | tighten_assessment_rls, add_delete_policies, coach_tables, job_search_tables, watchlist_companies |
| **ship_later_candidate** | 2 | b2b_outplacement, b2b_indexes |
| **superseded_do_not_ship** | 2 | expand_context_check, add_career_profile_context_type |
| **defer_product_decision** | 4 | networking_application_link, extension_support, products_catalog, job_workspace_asset_links |

---

## Recommended First Applied Batch

**Batch 1 + Batch 2 combined** (5 migrations):

```bash
# From repo root, after setting env:
supabase db push --linked

# Or apply individually via Supabase MCP:
# 1. tighten_assessment_rls (RLS changes)
# 2. add_delete_policies (RLS changes)
# 3. coach_tables (new tables)
# 4. job_search_tables (new tables)
# 5. watchlist_companies (new table)
```

**Expected outcome:**
- 5 new tables/policies created on remote
- Virtual Coach persistence works
- Job Search persistence works
- Assessment security tightened
- User delete capability enabled

**Also in this batch (history-only):**
```bash
supabase migration repair --status applied 20260311100000
supabase migration repair --status applied 20260318234500
```
These two are already covered by the corrective migration — marking them as applied prevents future drift noise.

---

## Post-Shipping Verification

After applying any batch:

```bash
cd server && set -a && source .env && set +a && npm run check:migrations
```

Expected drift reduction:
- After Batch 1+2: local-only drops from 16 → 9 (5 shipped + 2 marked applied)
- After Batch 3: local-only drops from 9 → 7
- After Batch 4: local-only drops from 7 → 3 (the 3 divergent-pair items)
