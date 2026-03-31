# Supabase Local-Only Batch 1 — Apply Report

**Date:** 2026-03-27
**Repo:** `/Users/johnschrup/resume-agent`
**Remote:** Supabase project `pvmfgfnbtqlipnnoeixu`

---

## Applied Migrations (5/5 — all successful)

| # | Local Timestamp | Name | MCP Remote Timestamp | Status |
|---|---|---|---|---|
| 1 | 20260311100100 | tighten_assessment_rls | 20260330211757 | **Applied** |
| 2 | 20260311100200 | add_delete_policies | 20260330211804 | **Applied** |
| 3 | 20260311000000 | coach_tables | 20260330211818 | **Applied** |
| 4 | 20260308290000 | job_search_tables | 20260330211834 | **Applied** |
| 5 | 20260308300000 | watchlist_companies | 20260330211843 | **Applied** |

**Failures:** None.

---

## Verification Results

### Tables Created (all confirmed)

| Table | Exists |
|---|---|
| coach_conversations | true |
| coach_memory | true |
| coach_budget | true |
| job_listings | true |
| job_search_scans | true |
| job_search_results | true |
| watchlist_companies | true |

### RLS Policies Verified

| Table | Policy | Confirmed |
|---|---|---|
| onboarding_assessments | Service role only can insert assessments | yes |
| onboarding_assessments | Service role only can update assessments | yes |
| retirement_readiness_assessments | Service role only can insert retirement assessments | yes |
| retirement_readiness_assessments | Service role only can update retirement assessments | yes |
| master_resumes | Users can delete own resumes | yes |
| job_applications | Users can delete own applications | yes |
| coach_sessions | Users can delete own sessions | yes |
| why_me_stories | Users can delete own story | yes |

---

## Drift Counts

| Metric | Before Batch 1 | After Batch 1 | Delta |
|---|---|---|---|
| Local files | 82 | 82 | 0 |
| Remote entries | 69 | 74 | +5 (new MCP entries) |
| Remote-only | 3 | 8 | +5 (MCP timestamp-shifted) |
| Local-only | 16 | 16 | 0 (local timestamps unchanged) |

**Note:** The Supabase MCP assigns its own timestamps when applying migrations. The 5 applied migrations now exist on remote under MCP-assigned timestamps (20260330211757-20260330211843) that don't match the local filenames (20260308290000-20260311100200). This creates 5 new timestamp-shifted pairs that will need filename alignment in a future pass — the same pattern as the 48 pairs already resolved in Phase 2C.

---

## Nothing Newly Blocked

No unexpected errors, dependency failures, or schema conflicts appeared during apply. All 5 migrations applied cleanly on the first attempt.

---

## Batch 2 Recommendation: **Safe to proceed when ready**

The B2B outplacement migrations (#8 and #9 from the shipping plan) are independent of everything applied in Batch 1. They create new tables behind FF_B2B_OUTPLACEMENT=false. Zero risk to existing features.

However, before Batch 2, the 5 new MCP timestamp pairs from this batch should be aligned (local files renamed to match MCP timestamps) to prevent drift from accumulating further. This is the same safe rename pattern used in Phase 2C.

---

## Files Changed

| Type | Count | Details |
|---|---|---|
| Docs created | 2 | Apply plan + this report |
| Migration files renamed | 0 | — |
| Migration SQL edited | 0 | — |
| Code files changed | 0 | — |
| Remote schema changes | 5 | 7 new tables, 8 new RLS policies, triggers, indexes |
