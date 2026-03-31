# Supabase Local-Only Migration Triage

**Date:** 2026-03-27
**Repo:** `/Users/johnschrup/resume-agent`

> These 13 migrations exist in the local repo but have never been applied to the shared remote Supabase database. Each is classified by whether it should be shipped to remote, deferred, or removed.

---

## Triage Results

### Ship to Remote — Priority 1 (active features, FF=true or security)

| # | Timestamp | Name | Feature Flag | Key Code References | Confidence |
|---|---|---|---|---|---|
| 1 | 20260311100000 | expand_context_check | implicit (all agents) | All platform context upserts; corrective migration already covers this on remote | **high** |
| 2 | 20260311000000 | coach_tables | FF_VIRTUAL_COACH=**true** | agents/coach/conversation-loop.ts, routes/coach.ts, CoachDrawer.tsx | **high** |
| 3 | 20260308290000 | job_search_tables | FF_JOB_SEARCH=**true** | routes/job-search.ts, hooks/useRadarSearch.ts, RadarSection.tsx | **high** |
| 4 | 20260308300000 | watchlist_companies | FF_JOB_SEARCH=**true** | routes/watchlist.ts, hooks/useWatchlist.ts, WatchlistBar.tsx | **high** |
| 5 | 20260311100100 | tighten_assessment_rls | FF_ONBOARDING=true | agents/onboarding/*, agents/retirement-bridge/* | **high** |
| 6 | 20260311100200 | add_delete_policies | FF_RESUME_V2=true | master_resumes, job_applications, coach_sessions, why_me_stories | **high** |
| 7 | 20260318234500 | add_career_profile_context_type | implicit (Career Profile v2) | Career Profile feature, platform context upserts | **high** |

**Notes on #1 (expand_context_check):** The corrective migration `20260327180000_expand_context_type_constraint.sql` already applied the expanded CHECK to remote. However, the migration history doesn't record `20260311100000` as applied. During Phase 2D, this should be marked as applied via `supabase migration repair --status applied` rather than re-applied (it would be a no-op since the corrective migration supersedes it).

### Ship to Remote — Priority 2 (active features, FF=false but code-complete)

| # | Timestamp | Name | Feature Flag | Key Code References | Confidence |
|---|---|---|---|---|---|
| 8 | 20260308260000 | b2b_outplacement | FF_B2B_OUTPLACEMENT=**false** | routes/b2b-admin.ts (17 endpoints), lib/b2b.ts | **high** |
| 9 | 20260308270000 | b2b_indexes | FF_B2B_OUTPLACEMENT=**false** | Depends on #8 | **high** |

**Notes:** B2B outplacement has a complete admin API. Tables don't exist on remote yet. Feature flag keeps it invisible to users. Safe to ship — creates tables users can't access until flag is flipped.

### Defer — Keep Local (low urgency, backward-compatible enhancements)

| # | Timestamp | Name | Feature Flag | Key Code References | Confidence |
|---|---|---|---|---|---|
| 10 | 20260308310000 | networking_application_link | FF_APPLICATION_PIPELINE=true | hooks/useRuleOfFour.ts, routes/networking-contacts.ts | **medium** |
| 11 | 20260309400000 | extension_support | FF_EXTENSION=**false** | routes/extension.ts (dormant) | **high** |
| 12 | 20260313120000 | products_catalog | none (GET /api/products) | routes/products.ts, app has static fallback | **medium** |
| 13 | 20260317121500 | job_workspace_asset_links | implicit (report agents) | interview-prep, thank-you-note, ninety-day-plan routes | **high** |

**Why defer:**
- **#10** adds columns to existing table; used by Rule of Four but nullable columns won't break anything if absent — the hook gracefully handles missing data
- **#11** adds columns for unreleased browser extension; no user impact until FF_EXTENSION=true
- **#12** creates a DB-driven product catalog; app has a static fallback that works fine without it
- **#13** adds session/job_application linking to report tables; nullable columns, backward-compatible, enhancement only

### Probably Dead

**None.** All 13 migrations have active code references.

### Unknown

**None.** All 13 were clearly classifiable.

---

## Recommended Apply Order (for Phase 2D)

If proceeding to apply these to the shared remote:

```
1. expand_context_check          — mark as applied (corrective migration covers it)
2. add_career_profile_context_type — mark as applied (corrective migration covers it)
3. tighten_assessment_rls        — security hardening, lightweight
4. add_delete_policies           — security hardening, lightweight
5. coach_tables                  — new tables, FF_VIRTUAL_COACH=true
6. job_search_tables             — new tables, FF_JOB_SEARCH=true
7. watchlist_companies           — new table, FF_JOB_SEARCH=true
8. b2b_outplacement              — new tables, FF=false (safe, invisible)
9. b2b_indexes                   — depends on #8
```

Deferred items (#10-13) can be applied at any time — they are all backward-compatible ALTERs or new tables with no breaking changes.

---

## Dependencies

| Migration | Depends On |
|---|---|
| b2b_indexes (#9) | b2b_outplacement (#8) |
| add_career_profile_context_type (#7) | expand_context_check (#1) |
| watchlist_companies (#4) | job_search_tables (#3) — shares route namespace |

All other migrations are independent.
