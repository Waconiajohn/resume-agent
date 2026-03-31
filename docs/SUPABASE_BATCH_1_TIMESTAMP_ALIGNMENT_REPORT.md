# Supabase Batch 1 — Timestamp Alignment Report

**Date:** 2026-03-27
**Repo:** `/Users/johnschrup/resume-agent`

---

## Files Renamed (5)

| Old Filename | New Filename |
|---|---|
| `20260311100100_tighten_assessment_rls.sql` | `20260330211757_tighten_assessment_rls.sql` |
| `20260311100200_add_delete_policies.sql` | `20260330211804_add_delete_policies.sql` |
| `20260311000000_coach_tables.sql` | `20260330211818_coach_tables.sql` |
| `20260308290000_job_search_tables.sql` | `20260330211834_job_search_tables.sql` |
| `20260308300000_watchlist_companies.sql` | `20260330211843_watchlist_companies.sql` |

No SQL content was changed. Filename timestamp alignment only.

---

## Before/After Drift Counts

| Metric | Before Alignment | After Alignment | Delta |
|---|---|---|---|
| Local files | 82 | 82 | 0 |
| Remote entries | 74 | 74 | 0 |
| Remote-only | 8 | **3** | **-5** |
| Local-only | 16 | **11** | **-5** |
| Matched | 66 | **71** | **+5** |

---

## Remaining Unresolved Drift

### Remote-only (3)

| Timestamp | Name | Reason |
|---|---|---|
| 20260220160445 | add_claim_pipeline_slot_rpc | Intentionally divergent — local returns jsonb, remote returns boolean, RPC unused |
| 20260324135914 | expand_referral_bonus_programs | Schema diff — local has CHECK on confidence column, remote does not |
| 20260324135926 | add_linkedin_profile_context_type | Superseded — corrective migration governs live constraint |

### Local-only (11)

| Timestamp | Name | Category |
|---|---|---|
| 20260228120000 | add_claim_pipeline_slot_rpc | Intentionally divergent (enhanced local version, unused) |
| 20260323000000 | expand_referral_bonus_programs | Schema diff (CHECK on confidence column) |
| 20260324000000 | add_linkedin_profile_context_type | Superseded by corrective migration |
| 20260311100000 | expand_context_check | Superseded — corrective migration covers this |
| 20260318234500 | add_career_profile_context_type | Superseded — corrective migration covers this |
| 20260308260000 | b2b_outplacement | Unapplied — Batch 2 candidate (FF=false) |
| 20260308270000 | b2b_indexes | Unapplied — Batch 2 candidate (FF=false) |
| 20260308310000 | networking_application_link | Unapplied — deferred (nullable columns) |
| 20260309400000 | extension_support | Unapplied — deferred (FF_EXTENSION=false) |
| 20260313120000 | products_catalog | Unapplied — deferred (static fallback works) |
| 20260317121500 | job_workspace_asset_links | Unapplied — deferred (nullable columns) |

---

## Recommendation

**Pause here.** The repo is at a clean, well-documented stop point.

- Do NOT start Batch 2 automatically
- Batch 2 (B2B outplacement) requires a separate product/ops decision
- The 4 deferred migrations require product decisions about feature readiness
- The 3 intentionally divergent / superseded pairs are documented and non-urgent
- The 2 superseded context-check migrations can be marked as applied via `supabase migration repair` in a future housekeeping pass, but this is cosmetic, not urgent
