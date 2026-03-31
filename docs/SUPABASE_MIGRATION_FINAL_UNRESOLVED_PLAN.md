# Supabase Migration — Final Unresolved Items Plan

**Date:** 2026-03-27
**Repo:** `/Users/johnschrup/resume-agent`
**Remote:** Supabase project `pvmfgfnbtqlipnnoeixu`

---

## Item 1: `product_telemetry_events`

| Field | Value |
|---|---|
| Local timestamp | 20260330130000 |
| Remote timestamp | 20260330192710 |

### Verification

Compared full local SQL with full remote `statements[1]`. The DDL is **byte-for-byte identical** (same CREATE TABLE, same indexes, same RLS enable). Local file has two additional SQL comment lines that are ignored by PostgreSQL.

### Disposition: **safe_to_align_now**

Rename local file from `20260330130000` to `20260330192710`. No content change needed. This is the same proven-safe pattern as the 46 files already renamed in Phase 2C.

---

## Item 2: `expand_referral_bonus_programs`

| Field | Value |
|---|---|
| Local timestamp | 20260323000000 |
| Remote timestamp | 20260324135914 |

### Verification

Full SQL comparison performed. Both versions:
- Add the same unique constraint `uq_referral_bonus_programs_company_id` via idempotent DO block
- Add the same 10 columns (bonus_entry, bonus_mid, bonus_senior, bonus_executive, payout_structure, diversity_multiplier, special_programs, confidence, data_source, last_verified_at)

**Minor difference:** Local has `CHECK (confidence IN ('high', 'medium', 'low'))` on the `confidence` column. Remote does not have this CHECK. Local also wraps in BEGIN/COMMIT.

**Impact:** The CHECK constraint on the `confidence` column is a data validation guard. Its absence on remote means the remote DB accepts any text value for `confidence`. This is not a breaking difference — it's a strictness difference. The app code only writes 'high', 'medium', 'low' anyway.

### Disposition: **safe_to_align_now** (with note)

The functional schema is equivalent. The missing CHECK on remote is non-breaking. Rename the local file to match the remote timestamp. Document the CHECK difference for potential future tightening migration.

---

## Item 3: `add_linkedin_profile_context_type`

| Field | Value |
|---|---|
| Local timestamp | 20260324000000 |
| Remote timestamp | 20260324135926 |

### Verification

- **Local** drops constraint, recreates with **21 types** (full expanded set including linkedin_profile)
- **Remote** drops constraint, recreates with **11 types** (narrow set: client_profile, career_profile, positioning_strategy, benchmark_candidate, gap_analysis, career_narrative, industry_research, target_role, evidence_item, retirement_readiness, linkedin_profile)
- **Corrective migration** (20260327180000 local / 20260330203002 remote) recreates with **22 types** (the authoritative set)

The corrective migration `expand_context_type_constraint` supersedes BOTH the local and remote versions of `add_linkedin_profile_context_type`. The live constraint currently has 22 types (from the corrective migration). Neither the local nor remote version of this migration reflects the current live state.

### Disposition: **superseded_by_later_remote_change**

Both versions are historical. The corrective migration is authoritative. For history alignment:
- Rename local `20260324000000` → `20260324135926` to match remote timestamp
- Accept that the SQL content differs — this is documented history, not live behavior
- The live constraint is governed by the corrective migration

---

## Item 4: `expand_context_type_constraint` (corrective migration)

| Field | Value |
|---|---|
| Local timestamp | 20260327180000 |
| Remote timestamp | 20260330203002 (MCP-assigned) |

### Verification

Full SQL comparison performed. The local file and remote `statements[1]` contain **identical DDL**:
- Same DROP CONSTRAINT IF EXISTS (two names)
- Same ADD CONSTRAINT with identical 22-type list in the same order

Local has additional SQL comments; remote does not. PostgreSQL ignores comments.

### Disposition: **safe_to_align_now**

Rename local file from `20260327180000` to `20260330203002`. No content change needed.

---

## Item 5: `add_claim_pipeline_slot_rpc`

| Field | Value |
|---|---|
| Local timestamp | 20260228120000 |
| Remote timestamp | 20260220160445 |

### Verification

- **Local** (20260228120000): Adds `pipeline_started_at` column to `coach_sessions`, creates `claim_pipeline_slot` returning `jsonb`, includes `REVOKE/GRANT` and `SET search_path`
- **Remote** (20260220160445): Creates `claim_pipeline_slot` returning `boolean`, no column add, no permissions
- **Live RPC**: Returns `boolean` (from `20260220175237_add_moddatetime_trigger_coach_sessions`)
- **Live schema**: `pipeline_started_at` column does NOT exist on remote `coach_sessions`
- **Code usage**: Zero `.ts` references to `claim_pipeline_slot` anywhere in the repo

The local file represents a planned enhancement that was never applied and is not used by any code. The remote version is a historical artifact that is also not called by any code (the live RPC was further modified by the moddatetime migration).

### Disposition: **intentionally_divergent_keep_local**

- Do NOT rename this file to match the remote timestamp — the SQL is fundamentally different
- Keep the local file as-is for historical record
- No corrective migration needed — the RPC is unused
- If the pipeline_started_at column is ever needed, a new forward migration should be created
- During eventual full reconciliation, this pair requires manual decision (archive local, adopt remote, or merge)

---

## Summary Table

| # | Item | Disposition | Action Type |
|---|---|---|---|
| 1 | product_telemetry_events | safe_to_align_now | Local rename only |
| 2 | expand_referral_bonus_programs | safe_to_align_now | Local rename only (note CHECK diff) |
| 3 | add_linkedin_profile_context_type | superseded_by_later_remote_change | Local rename only (accept historical diff) |
| 4 | expand_context_type_constraint | safe_to_align_now | Local rename only |
| 5 | add_claim_pipeline_slot_rpc | intentionally_divergent_keep_local | No action — keep as-is |

**Net result if all safe renames are performed:** 4 more pairs resolved. Only item 5 remains as intentional divergence.
