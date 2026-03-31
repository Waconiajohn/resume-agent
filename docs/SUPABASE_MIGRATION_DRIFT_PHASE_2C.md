# Supabase Migration Drift — Phase 2C Completion Report

**Date:** 2026-03-27
**Repo:** `/Users/johnschrup/resume-agent`
**Remote:** Supabase project `pvmfgfnbtqlipnnoeixu`

---

## Summary

Phase 2C renamed 46 local migration files to adopt their remote timestamps, reducing drift from 115 mismatched entries to 23.

---

## Files Renamed: 46

All renames were timestamp-only changes. No SQL content was modified.

See `SUPABASE_MIGRATION_DRIFT_PHASE_2C_PLAN.md` for the complete rename table.

---

## Before/After Drift Counts

| Metric | Before 2C | After 2C | Delta |
|---|---|---|---|
| Local migration files | 82 | 82 | 0 (renames, not adds/deletes) |
| Remote migration entries | 69 | 69 | 0 (no remote changes) |
| Remote-only | 51 | **5** | **-46** |
| Local-only | 64 | **18** | **-46** |
| Matched | 18 | **64** | **+46** |

---

## Remaining Remote-Only (5)

| # | Timestamp | Name | Reason |
|---|---|---|---|
| 1 | 20260220160445 | add_claim_pipeline_slot_rpc | Excluded — confirmed mismatch (local returns jsonb, remote returns boolean) |
| 2 | 20260324135914 | expand_referral_bonus_programs | Excluded — not individually verified at full SQL level |
| 3 | 20260324135926 | add_linkedin_profile_context_type | Excluded — confirmed mismatch (CHECK constraint values differ) |
| 4 | 20260330192710 | product_telemetry_events | Excluded — kept separate pending corrective migration pair resolution |
| 5 | 20260330203002 | expand_context_type_constraint | Expected — MCP-assigned remote timestamp differs from local 20260327180000 |

## Remaining Local-Only (18)

### Excluded mismatches / deferred pairs (5)

| # | Timestamp | Name | Reason |
|---|---|---|---|
| 1 | 20260228120000 | add_claim_pipeline_slot_rpc | Confirmed mismatch — deferred |
| 2 | 20260323000000 | expand_referral_bonus_programs | Not fully verified — deferred |
| 3 | 20260324000000 | add_linkedin_profile_context_type | Confirmed mismatch — deferred |
| 4 | 20260327180000 | expand_context_type_constraint | Corrective migration — MCP timestamp mismatch |
| 5 | 20260330130000 | product_telemetry_events | Paired with corrective migration — deferred |

### Truly local-only unapplied migrations (13)

| # | Timestamp | Name | Classification |
|---|---|---|---|
| 1 | 20260308260000 | b2b_outplacement | used_by_live_code (FF=false) |
| 2 | 20260308270000 | b2b_indexes | used_by_live_code (FF=false) |
| 3 | 20260308290000 | job_search_tables | used_by_live_code (FF=true) |
| 4 | 20260308300000 | watchlist_companies | used_by_live_code (FF=true) |
| 5 | 20260308310000 | networking_application_link | used_by_live_code |
| 6 | 20260309400000 | extension_support | used_by_dormant_code (FF=false) |
| 7 | 20260311000000 | coach_tables | used_by_live_code (FF=true) |
| 8 | 20260311100000 | expand_context_check | used_by_live_code (CRITICAL) |
| 9 | 20260311100100 | tighten_assessment_rls | used_by_live_code |
| 10 | 20260311100200 | add_delete_policies | used_by_live_code |
| 11 | 20260313120000 | products_catalog | used_by_live_code |
| 12 | 20260317121500 | job_workspace_asset_links | used_by_live_code |
| 13 | 20260318234500 | add_career_profile_context_type | used_by_live_code |

---

## Unexpected Mismatches

None. All 46 renames resolved cleanly. The remaining 5 remote-only and 18 local-only entries are exactly the items that were explicitly excluded from this phase.

---

## Recommendation for Next Step

### Phase 2D: Resolve the 5 deferred pairs + apply the 13 local-only migrations

**Order:**

1. **Verify and rename `expand_referral_bonus_programs`** (20260323000000 → 20260324135914). This was excluded only because it wasn't individually verified at full SQL level in Phase 2B. A quick parity check should clear it.

2. **Rename `product_telemetry_events`** (20260330130000 → 20260330192710). Already verified as likely_same in Phase 1.5.

3. **Rename `expand_context_type_constraint`** (20260327180000 → 20260330203002). The corrective migration — local SQL matches what was applied remotely.

4. **Handle `add_claim_pipeline_slot_rpc`** — the local version (20260228120000, returns jsonb) is a dead migration. Either:
   - Delete it and adopt the remote timestamp (20260220160445) by creating a new local file with the remote's boolean-returning SQL, OR
   - Keep both and mark the local one as superseded

5. **Handle `add_linkedin_profile_context_type`** — the local version (20260324000000) has a wider CHECK constraint than remote (20260324135926), but the corrective migration (20260327180000) supersedes both. Archive or annotate.

6. **Apply the 13 truly local-only migrations to remote** in dependency order, starting with `expand_context_check` (already effectively applied via the corrective migration), then `coach_tables`, `job_search_tables`, etc.

---

## `supabase migration repair` Usage

**Not used.** This entire phase was repo-local filename alignment only. No remote metadata was mutated.

---

## SQL Content Changes

**None.** All 46 operations were `mv` (rename) only. No file contents were modified.
