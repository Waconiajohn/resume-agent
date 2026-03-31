# Supabase Migration Reconciliation — Stop Point

**Date:** 2026-03-27
**Repo:** `/Users/johnschrup/resume-agent`
**Remote:** Supabase project `pvmfgfnbtqlipnnoeixu`

---

## Current Drift Counts (post-Batch 1 apply + alignment)

| Metric | Value |
|---|---|
| Local migration files | 82 |
| Remote migration entries | 74 |
| **Matched** | **71** |
| **Remote-only** | **3** |
| **Local-only** | **11** |

Starting point was 53 remote-only + 63 local-only. History cleanup + Batch 1 reduced this to 3 + 11.

---

## Exact-Parity Items Aligned in Final Pass

| Local (old) | Local (new) | Name | Basis |
|---|---|---|---|
| 20260330130000 | 20260330192710 | product_telemetry_events | DDL byte-identical; comments only |
| 20260327180000 | 20260330203002 | expand_context_type_constraint | DDL byte-identical; comments only |

---

## Items Intentionally Left Divergent

### 1. `add_claim_pipeline_slot_rpc`

| Field | Value |
|---|---|
| Local timestamp | 20260228120000 |
| Remote timestamp | 20260220160445 |
| Reason | Fundamentally different SQL: local returns jsonb + adds `pipeline_started_at` column; remote returns boolean. The RPC is not called by any live code. The `pipeline_started_at` column does not exist on the remote table. |
| Action | None. Keep as intentional divergence. The local file is a historical artifact of an unapplied enhancement. |

### 2. `expand_referral_bonus_programs`

| Field | Value |
|---|---|
| Local timestamp | 20260323000000 |
| Remote timestamp | 20260324135914 |
| Reason | Schema difference: local includes `CHECK (confidence IN ('high', 'medium', 'low'))` on the confidence column; remote does not. Renaming would falsely imply equivalence. |
| Action | Do not rename. Ship the local version to remote as a forward migration if the CHECK is wanted, or create a small corrective migration to add the CHECK to remote. |

---

## Items Superseded by Later Forward-Only Fixes

### 3. `add_linkedin_profile_context_type`

| Field | Value |
|---|---|
| Local timestamp | 20260324000000 |
| Remote timestamp | 20260324135926 |
| Reason | Local has 21 context types in CHECK; remote has 11. Both are now superseded by the corrective migration `20260330203002_expand_context_type_constraint.sql` which sets the live CHECK to 22 types. Neither the local nor remote version reflects the current live schema. |
| Action | Do not rename. Both remain as historical records. The corrective migration is the authoritative source. |

---

## Why We Are Stopping History Cleanup Here

1. **The dangerous live schema issue (CHECK constraint) was fixed** in Phase 2A via a forward-only corrective migration.

2. **48 of 50 timestamp-shifted equivalent pairs** have been successfully aligned by local filename rename (46 in Phase 2C + 2 in the final pass).

3. **The remaining 3 remote-only entries** are either intentionally divergent (claim_pipeline_slot) or have real schema differences (expand_referral_bonus_programs, add_linkedin_profile_context_type) that should not be papered over with renames.

4. **The remaining 11 local-only entries** consist of:
   - 1 intentionally divergent (claim_pipeline_slot — local enhanced version)
   - 2 with real schema differences (expand_referral_bonus_programs, add_linkedin_profile_context_type — both superseded or differing from remote)
   - 2 superseded by the corrective migration (expand_context_check, add_career_profile_context_type)
   - 2 B2B outplacement tables (Batch 2 candidate, FF=false)
   - 4 deferred integrations/enhancements (networking_application_link, extension_support, products_catalog, job_workspace_asset_links)

5. **Batch 1 shipped 5 active-feature migrations to remote** (tighten_assessment_rls, add_delete_policies, coach_tables, job_search_tables, watchlist_companies). All verified. MCP timestamps aligned locally.

6. **Further drift reduction requires product/ops decisions** — B2B outplacement (Batch 2), deferred integrations (Batch 3+), or housekeeping `migration repair` for superseded items.

---

## Full Reconciliation Phase Summary

| Phase | Action | Drift Reduction |
|---|---|---|
| Phase 2A | Fixed live CHECK constraint; recovered 3 remote-only files | remote-only 53→51, local-only 63→64 |
| Phase 2C | Renamed 46 proven-safe pairs | remote-only 51→5, local-only 64→18 |
| Final exact-parity pass | Renamed 2 exact-parity pairs | remote-only 5→3, local-only 18→16 |
| Batch 1 apply | Shipped 5 active-feature migrations to remote | remote entries 69→74 |
| Batch 1 alignment | Renamed 5 MCP timestamp pairs locally | remote-only 8→3, local-only 16→11 |
| **Total** | **53 pairs aligned, 1 live fix, 3 files recovered, 5 migrations shipped** | **remote-only 53→3, local-only 63→11** |
