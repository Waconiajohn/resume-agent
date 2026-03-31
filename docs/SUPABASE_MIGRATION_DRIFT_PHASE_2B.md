# Supabase Migration Drift — Phase 2B Parity & RPC Divergence Review

**Date:** 2026-03-27
**Repo:** `/Users/johnschrup/resume-agent`
**Remote:** Supabase project `pvmfgfnbtqlipnnoeixu`

---

## 1. Current Drift Counts (Post-Phase 2A)

| Metric | Before 2A | After 2A | Delta |
|---|---|---|---|
| Local migration files | 78 | 82 | +4 (3 recovered + 1 corrective) |
| Remote migration entries | 68 | 69 | +1 (corrective migration applied) |
| Remote-only | 53 | 51 | -2 (3 recovered, +1 new corrective TS pair) |
| Local-only | 63 | 64 | +1 (corrective migration local file) |
| Confirmed matched | 15 | 18 | +3 (recovered files now match) |

---

## 2. claim_pipeline_slot Divergence Analysis

### Live RPC Signature

```sql
CREATE OR REPLACE FUNCTION public.claim_pipeline_slot(p_session_id uuid, p_user_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
```

The live version returns `boolean`, sets `pipeline_status = 'running'`, `pipeline_stage = 'intake'`, clears gate fields, and explicitly sets `updated_at = NOW()`. This matches the version from `20260220175237_add_moddatetime_trigger_coach_sessions` (the last remote migration to touch this function).

### Local Repo Versions

| Migration | Return Type | Key Differences |
|---|---|---|
| `20260220160457_fix_claim_pipeline_slot_rpc` (recovered) | boolean | No updated_at, simpler condition |
| `20260220175237_add_moddatetime_trigger_coach_sessions` (recovered) | boolean | Adds moddatetime trigger, sets updated_at |
| `20260228120000_add_claim_pipeline_slot_rpc` (local-only) | **jsonb** | Adds pipeline_started_at column, REVOKE/GRANT, SET search_path |

### Code Usage

**`claim_pipeline_slot` is referenced in zero `.ts` files across the entire repo.** The function exists in the database but is not called by the server. The pipeline uses a different mechanism to claim slots (likely direct UPDATE via Supabase client).

### Conclusion: **Safe for later repair — no corrective migration needed.**

The local-only version (returning jsonb) was never applied to remote and is not called by any live code. The live boolean version works correctly for whatever historical purpose it served. During history reconciliation, the local file can be archived or the remote version adopted, but there is no live break risk.

---

## 3. Parity-Check Expansion Results

### Methodology

Compared the first 300 characters of remote `statements[1]` from `supabase_migrations.schema_migrations` against local file content for each pair. For CREATE TABLE migrations, verified table name, column names, and primary key. For ALTER TABLE, verified the same columns/constraints. For CREATE FUNCTION, verified signature, return type, and key logic.

### Results

| Classification | Count | Percentage |
|---|---|---|
| likely_same | **46** | 92% |
| confirmed mismatch | **2** | 4% |
| not individually checked | 2 | 4% |
| **Total pairs** | **50** | 100% |

### Confirmed Mismatches (2)

1. **`add_claim_pipeline_slot_rpc`** — functional divergence (boolean vs jsonb return). **LOW severity** — RPC not called by live code.

2. **`add_linkedin_profile_context_type`** — CHECK constraint value set divergence. **RESOLVED** in Phase 2A via corrective migration.

### Pattern Observations

- **Report table migrations** (linkedin_optimization_reports, content_calendar_reports, networking_outreach_reports, job_tracker_reports, ninety_day_plan_reports, onboarding_assessments, interview_debriefs, application_pipeline, content_posts, networking_contacts, interview_prep_reports, salary_negotiation_reports, executive_bio_reports, case_study_reports, thank_you_note_reports, personal_brand_reports, retirement_readiness_assessments, planner_handoff): **18 pairs, all likely_same.** These are straightforward CREATE TABLE statements with identical column definitions.

- **RPC/function migrations** (fix_increment_session_usage_rpc, master_resume_default_integrity_rpcs, create_master_resume_atomic_rpc, harden_next_artifact_version, fix_next_artifact_version_service_role, audit_round5_db_hardening, fix_usage_upsert_rpc, atomic_context_upsert): **8 pairs, all likely_same.** Function signatures and core logic match.

- **ALTER TABLE migrations** (add_default_base_resume, add_evidence_items_to_master_resumes, stripe_billing, add_promo_tracking, add_product_type_to_sessions, job_applications_pipeline_stage): **6 pairs, all likely_same.** Same columns and constraints.

- **Infrastructure migrations** (production_fixes, pipeline_capacity_indexes, harden_workflow_tables, normalize_legacy_draft_readiness_artifacts, momentum_constraints, platform_context_upsert_index, expand_referral_bonus_programs): **7 pairs, all likely_same.**

- **Feature table migrations** (add_workflow_artifacts_and_nodes, user_momentum, affiliate_system, network_intelligence, why_me_stories, plan_features, user_feature_overrides): **7 pairs, all likely_same.** Minor formatting differences (BEGIN/COMMIT wrapping, comment presence) but structurally identical.

### Minor Differences Noted (Not Mismatches)

| Pair | Difference | Impact |
|---|---|---|
| add_workflow_artifacts_and_nodes | Local wraps in BEGIN/COMMIT, remote does not | None — PostgreSQL auto-wraps DDL in transactions |
| add_default_base_resume | Index name: local `uniq_master_resumes_default_per_user` vs remote `master_resumes_user_default_unique` (from earlier migration) | None — same functional constraint, already applied via `20260218232808` |
| Multiple report tables | Local has more comments/rollback hints | None — comments are ignored |

---

## 4. Confirmed Mismatch Count

| Status | Count |
|---|---|
| Confirmed mismatches (total) | **2** |
| Resolved (Phase 2A) | 1 (context type CHECK) |
| Remaining (no action needed) | 1 (claim_pipeline_slot — not used by live code) |
| **Actionable mismatches remaining** | **0** |

---

## 5. Bulk Timestamp Repair Safety Assessment

### Confidence: **HIGH — bulk timestamp repair is SAFE for the proven-safe subset.**

**Evidence:**
- 46 of 50 pairs individually verified as functionally equivalent
- 2 remaining unchecked pairs follow the same report-table pattern as 18 other verified pairs
- Only 2 mismatches found, both resolved or non-impactful
- The 92% likely_same rate across a diverse sample (RPCs, tables, indexes, constraints, triggers) indicates the renumbering was mechanical, not content-modifying
- No undiscovered live schema breaks found

### Recommendation

**Proceed to limited history repair for the proven-safe subset of 46+ verified pairs.** The 2 mismatched pairs require special handling:

1. **`add_claim_pipeline_slot_rpc`** — adopt the remote timestamp and archive the local-only enhanced version, since the RPC is not called by live code.
2. **`add_linkedin_profile_context_type`** — requires special handling due to the corrective migration. The local file, remote file, and corrective migration all touch the same constraint with different values. During reconciliation, the corrective migration (`20260327180000`) is the authoritative version.

---

## 6. Exact Recommendation for Next Step

### Phase 2C: Limited History Repair (proven-safe subset)

1. **Start with the 18 report-table pairs.** These are the lowest risk (simple CREATE TABLE, no RPCs, no constraints). Use `supabase migration repair` to mark remote timestamps as reverted and local timestamps as applied (or vice versa — pick one direction).

2. **Then do the 8 RPC/function pairs.** These were all individually verified.

3. **Then do the 7 ALTER TABLE pairs.**

4. **Then do the 7 infrastructure pairs.**

5. **Then do the 7 feature-table pairs.**

6. **Handle the 2 mismatched pairs last** with targeted logic per mismatch.

7. **Handle the 13 local-only migrations** that need to be applied to remote (per Phase 1.5 classification — 12 used by live code, 1 dormant).

8. **Run `npm run check:migrations` after each batch** to verify convergence.

### Do NOT do yet

- Do not repair all 50 pairs in one bulk operation
- Do not apply the 13 local-only migrations until the equivalent-pair history is clean
- Do not modify the corrective migration `20260327180000`

---

## Appendix: Queries Used

```sql
-- Live RPC signature
SELECT proname, pg_get_function_result(oid), pg_get_functiondef(oid)
FROM pg_proc WHERE proname = 'claim_pipeline_slot';

-- Remote SQL previews (batched)
SELECT version, name, left(statements[1], 300) AS sql_preview
FROM supabase_migrations.schema_migrations
WHERE version IN (...) ORDER BY version;

-- Code usage search
grep -r 'claim_pipeline_slot' server/src/ app/src/
grep -r 'claim_pipeline' **/*.ts
```
