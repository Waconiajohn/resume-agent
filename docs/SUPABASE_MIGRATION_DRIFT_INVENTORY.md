# Supabase Migration Drift Inventory

**Date:** 2026-03-27
**Purpose:** Comprehensive audit of local vs. remote migration state for the resume-agent Supabase project. This report catalogs every migration, classifies the drift, assigns risk levels, and provides actionable Phase 2 remediation steps.

---

## Executive Summary

The local `supabase/migrations/` directory and the remote Supabase migration history have diverged significantly. The root cause is a bulk timestamp renumbering (likely by Codex) that reassigned local timestamps while the remote DB retained the original applied timestamps. The actual schema impact is small -- most drift entries are the **same SQL** under different timestamps.

| Category | Count | Risk |
|---|---|---|
| Matched (in sync) | 15 | NONE |
| Timestamp-shifted equivalents (same name, different timestamps) | 50 pairs | LOW |
| Remote-only, no local file | 3 | **HIGH** |
| Local-only, never applied remotely | 13 | **MEDIUM** |
| **Total unique migration names** | **81** | |

---

## 1. Matched Migrations (15 -- No Action Required)

These migrations exist in both local files and remote history with identical timestamps and names.

| # | Name |
|---|---|
| 1 | 001_initial_schema |
| 2 | 002_multi_phase_columns |
| 3 | 003_delete_policies_and_indexes |
| 4 | 004_panel_restore_columns |
| 5 | 005_system_prompt_versioning |
| 6 | 006_session_locks |
| 7 | 007_contact_info |
| 8 | 008_add_indexes |
| 9 | 009_add_session_cost_tracking |
| 10 | 010_create_user_usage_table |
| 11 | 011_create_pricing_plans_and_subscriptions |
| 12 | 012_user_positioning_profiles |
| 13 | 20260217221313_create_waitlist_emails |
| 14 | 20260218030532_add_increment_session_usage_rpc |
| 15 | 20260218030615_add_pipeline_state_columns |

---

## 2. Timestamp-Shifted Equivalent Pairs (50 -- LOW RISK)

These migrations share the same name in both local and remote but differ only in timestamp. The SQL content is presumed identical. Reconciliation requires `supabase migration repair` commands -- no schema changes needed.

| # | Local Timestamp | Remote Timestamp | Migration Name |
|---|---|---|---|
| 1 | 20260218103000 | 20260308213430 | fix_increment_session_usage_rpc |
| 2 | 20260218143000 | 20260308213440 | add_default_base_resume |
| 3 | 20260218190000 | 20260308213455 | master_resume_default_integrity_rpcs |
| 4 | 20260218213000 | 20260308213507 | create_master_resume_atomic_rpc |
| 5 | 20260219000000 | 20260308213523 | production_fixes |
| 6 | 20260220103000 | 20260308213529 | pipeline_capacity_indexes |
| 7 | 20260224190000 | 20260225024605 | add_workflow_artifacts_and_nodes |
| 8 | 20260224200000 | 20260225024625 | harden_workflow_tables |
| 9 | 20260224210000 | 20260225024638 | harden_next_artifact_version |
| 10 | 20260225193000 | 20260226012123 | normalize_legacy_draft_readiness_artifacts |
| 11 | 20260227180000 | 20260308213550 | add_evidence_items_to_master_resumes |
| 12 | 20260228120000 | 20260220160445 | add_claim_pipeline_slot_rpc |
| 13 | 20260228130000 | 20260308213558 | fix_next_artifact_version_service_role |
| 14 | 20260228140000 | 20260308213607 | audit_round5_db_hardening |
| 15 | 20260228150000 | 20260308213725 | stripe_billing |
| 16 | 20260228160000 | 20260308213729 | fix_usage_upsert_rpc |
| 17 | 20260228170000 | 20260308213731 | add_promo_tracking |
| 18 | 20260228180000 | 20260308213740 | plan_features |
| 19 | 20260228190000 | 20260308213742 | user_feature_overrides |
| 20 | 20260228200000 | 20260308213746 | affiliate_system |
| 21 | 20260302120000 | 20260308213755 | user_platform_context |
| 22 | 20260303120000 | 20260308213829 | network_intelligence |
| 23 | 20260306120000 | 20260308213837 | why_me_stories |
| 24 | 20260306130000 | 20260308213839 | job_applications_pipeline_stage |
| 25 | 20260307012533 | 20260308213844 | interview_prep_reports |
| 26 | 20260307020000 | 20260307052758 | linkedin_optimization_reports |
| 27 | 20260307030000 | 20260307054628 | content_calendar_reports |
| 28 | 20260307040000 | 20260307060127 | networking_outreach_reports |
| 29 | 20260307050000 | 20260307152646 | job_tracker_reports |
| 30 | 20260307060000 | 20260308213852 | salary_negotiation_reports |
| 31 | 20260307070000 | 20260308213855 | executive_bio_reports |
| 32 | 20260307080000 | 20260308213857 | case_study_reports |
| 33 | 20260307090000 | 20260308213904 | thank_you_note_reports |
| 34 | 20260307091000 | 20260308213906 | personal_brand_reports |
| 35 | 20260307092000 | 20260308213152 | ninety_day_plan_reports |
| 36 | 20260307100000 | 20260308213203 | onboarding_assessments |
| 37 | 20260307120000 | 20260308213215 | interview_debriefs |
| 38 | 20260307200000 | 20260308213226 | application_pipeline |
| 39 | 20260307300000 | 20260308213238 | content_posts |
| 40 | 20260307400000 | 20260308213251 | networking_contacts |
| 41 | 20260308200000 | 20260308213303 | user_momentum |
| 42 | 20260308210000 | 20260308213314 | momentum_constraints |
| 43 | 20260308220000 | 20260308213802 | platform_context_upsert_index |
| 44 | 20260308230000 | 20260308213805 | atomic_context_upsert |
| 45 | 20260308240000 | 20260308213916 | retirement_readiness_assessments |
| 46 | 20260308250000 | 20260308213923 | planner_handoff |
| 47 | 20260308280000 | 20260308225557 | add_product_type_to_sessions |
| 48 | 20260323000000 | 20260324135914 | expand_referral_bonus_programs |
| 49 | 20260324000000 | 20260324135926 | add_linkedin_profile_context_type |
| 50 | 20260330130000 | 20260330192710 | product_telemetry_events |

---

## 3. Remote-Only -- No Local Equivalent (3 -- HIGH RISK)

These migrations are recorded in the remote Supabase migration history but have **no corresponding local file under any timestamp**. Their SQL content cannot be determined from the local codebase alone. If the local DB were rebuilt from scratch using only local files, these changes would be missing.

| # | Remote Timestamp | Migration Name | Notes |
|---|---|---|---|
| 1 | 20260218232808 | add_master_resume_columns_and_rpcs | Likely adds columns/RPCs to master_resumes table. No local file exists. |
| 2 | 20260220160457 | fix_claim_pipeline_slot_rpc | A fix migration for the claim_pipeline_slot RPC. Local has `add_claim_pipeline_slot_rpc` but NOT this fix. |
| 3 | 20260220175237 | add_moddatetime_trigger_coach_sessions | Adds a moddatetime trigger to coach_sessions. No local file exists. |

**Action required:** Retrieve the actual SQL for these 3 migrations from the remote database (via `supabase migration list` or direct inspection of `supabase_migrations.schema_migrations`) and create corresponding local files.

---

## 4. Local-Only -- Never Applied Remotely (13 -- MEDIUM RISK)

These migrations exist in `supabase/migrations/` but have **never been applied** to the remote Supabase database. They may contain schema changes required by Codex-generated features. Each needs review to determine whether it should be applied to production or removed as dead code.

| # | Local Timestamp | Migration Name | Likely Domain |
|---|---|---|---|
| 1 | 20260308260000 | b2b_outplacement | B2B outplacement feature tables |
| 2 | 20260308270000 | b2b_indexes | Indexes for B2B tables |
| 3 | 20260308290000 | job_search_tables | Job search feature tables |
| 4 | 20260308300000 | watchlist_companies | Company watchlist feature |
| 5 | 20260308310000 | networking_application_link | Links networking contacts to applications |
| 6 | 20260309400000 | extension_support | Browser extension support tables |
| 7 | 20260311000000 | coach_tables | Coach/coaching feature tables |
| 8 | 20260311100000 | expand_context_check | Expands platform context validation |
| 9 | 20260311100100 | tighten_assessment_rls | RLS policy hardening for assessments |
| 10 | 20260311100200 | add_delete_policies | Adds DELETE RLS policies |
| 11 | 20260313120000 | products_catalog | Products catalog table(s) |
| 12 | 20260317121500 | job_workspace_asset_links | Links job workspace to assets |
| 13 | 20260318234500 | add_career_profile_context_type | New context type for career profiles |

**Action required:** For each, determine whether the corresponding feature code is deployed or in development. If deployed, apply the migration. If the feature was abandoned, remove the migration file.

---

## 5. Special Callout: product_telemetry_events

The most recent migration pair warrants specific attention:

| | Timestamp | Name |
|---|---|---|
| Local | 20260330130000 | product_telemetry_events |
| Remote | 20260330192710 | product_telemetry_events |

This migration was authored as part of the telemetry rollout documented in `docs/PRODUCT_TELEMETRY_ROLLOUT.md`. It is a timestamp-shifted equivalent and carries LOW RISK, but because it is the newest migration and touches the telemetry pipeline, it should be verified early in Phase 2 to ensure the local and remote SQL are byte-identical.

---

## 6. Phase 2 Recommendations

### Step 1: Reconcile the 50 timestamp-shifted pairs (LOW RISK)

For each pair, mark the **remote** version as the canonical timestamp and update the local file to match. Use `supabase migration repair` to align the migration history.

```bash
# Pattern for each pair -- mark the local timestamp as "reverted" (not applied)
# and confirm the remote timestamp is "applied"
supabase migration repair --status reverted <local_timestamp>
supabase migration repair --status applied <remote_timestamp>
```

Then rename each local file to use the remote timestamp:

```bash
# Example for fix_increment_session_usage_rpc
mv supabase/migrations/20260218103000_fix_increment_session_usage_rpc.sql \
   supabase/migrations/20260308213430_fix_increment_session_usage_rpc.sql
```

Alternatively, if the local timestamps are preferred (because they reflect logical authoring order), mark the remote timestamps as reverted and the local timestamps as applied. Choose one direction and apply it consistently.

### Step 2: Recover the 3 remote-only migrations (HIGH RISK)

Retrieve the SQL content from the remote database:

```bash
# Option A: Use Supabase Dashboard > SQL Editor
SELECT version, name, statements
FROM supabase_migrations.schema_migrations
WHERE version IN ('20260218232808', '20260220160457', '20260220175237');

# Option B: Use supabase db dump to get the full schema
supabase db dump --linked > schema_dump.sql
```

Create local migration files for each:

```bash
touch supabase/migrations/20260218232808_add_master_resume_columns_and_rpcs.sql
touch supabase/migrations/20260220160457_fix_claim_pipeline_slot_rpc.sql
touch supabase/migrations/20260220175237_add_moddatetime_trigger_coach_sessions.sql
```

Populate them with the recovered SQL and mark as applied:

```bash
supabase migration repair --status applied 20260218232808
supabase migration repair --status applied 20260220160457
supabase migration repair --status applied 20260220175237
```

### Step 3: Triage the 13 local-only migrations (MEDIUM RISK)

For each, answer:
1. Is the corresponding feature code deployed or actively in development?
2. Does any running code reference the tables/columns/RPCs created by this migration?
3. Is there a product decision to ship or kill the feature?

Based on the answers:
- **Ship it:** Apply via `supabase db push` or `supabase migration up`
- **Kill it:** Remove the local migration file and any dependent code
- **Defer it:** Leave as-is but document the decision

### Step 4: Verify SQL content parity for all equivalent pairs

After reconciling timestamps, spot-check at least 10 pairs to confirm the local file SQL matches what was applied remotely. Priority targets:

1. `product_telemetry_events` (newest, telemetry-critical)
2. `stripe_billing` (payment-critical)
3. `add_claim_pipeline_slot_rpc` (has an ordering anomaly -- local is 20260228, remote is 20260220)
4. `atomic_context_upsert` (remote timestamp 20260308213805 was not in the original remote-only list -- verify it exists)
5. Any pair where the local timestamp predates the remote timestamp by weeks

### Step 5: Run full validation

```bash
# Reset local DB and replay all migrations to verify they apply cleanly
supabase db reset

# Compare local schema against remote
supabase db diff --linked
```

---

## 7. Risk Summary Matrix

| Risk Level | Count | Category | Remediation Effort |
|---|---|---|---|
| NONE | 15 | Matched -- already in sync | None |
| LOW | 50 pairs | Timestamp-shifted equivalents | ~2 hours (scripted rename + repair) |
| MEDIUM | 13 | Local-only, unapplied | ~4 hours (review each, apply or remove) |
| **HIGH** | **3** | **Remote-only, no local file** | **~2 hours (recover SQL, create files)** |

**Total estimated remediation time:** 8 hours

---

## Appendix A: Shell Commands Used for This Audit

```bash
# List remote migrations from Supabase
supabase migration list --linked

# List local migration files
ls -1 supabase/migrations/

# Extract timestamps and names from local files
ls supabase/migrations/ | sed 's/\.sql$//' | sort

# Compare local vs remote (manual diff of the two lists above)
# Name matching done by extracting the portion after the timestamp prefix

# Verify specific migration existence
ls supabase/migrations/*fix_claim_pipeline_slot_rpc*
ls supabase/migrations/*add_master_resume_columns_and_rpcs*
ls supabase/migrations/*add_moddatetime_trigger_coach_sessions*
```

## Appendix B: Full Local-Only List (63 entries)

For reference, the complete list of migrations present in `supabase/migrations/` but absent from remote history:

| # | Timestamp | Name | Status |
|---|---|---|---|
| 1 | 20260218103000 | fix_increment_session_usage_rpc | Equivalent pair |
| 2 | 20260218143000 | add_default_base_resume | Equivalent pair |
| 3 | 20260218190000 | master_resume_default_integrity_rpcs | Equivalent pair |
| 4 | 20260218213000 | create_master_resume_atomic_rpc | Equivalent pair |
| 5 | 20260219000000 | production_fixes | Equivalent pair |
| 6 | 20260220103000 | pipeline_capacity_indexes | Equivalent pair |
| 7 | 20260224190000 | add_workflow_artifacts_and_nodes | Equivalent pair |
| 8 | 20260224200000 | harden_workflow_tables | Equivalent pair |
| 9 | 20260224210000 | harden_next_artifact_version | Equivalent pair |
| 10 | 20260225193000 | normalize_legacy_draft_readiness_artifacts | Equivalent pair |
| 11 | 20260227180000 | add_evidence_items_to_master_resumes | Equivalent pair |
| 12 | 20260228120000 | add_claim_pipeline_slot_rpc | Equivalent pair |
| 13 | 20260228130000 | fix_next_artifact_version_service_role | Equivalent pair |
| 14 | 20260228140000 | audit_round5_db_hardening | Equivalent pair |
| 15 | 20260228150000 | stripe_billing | Equivalent pair |
| 16 | 20260228160000 | fix_usage_upsert_rpc | Equivalent pair |
| 17 | 20260228170000 | add_promo_tracking | Equivalent pair |
| 18 | 20260228180000 | plan_features | Equivalent pair |
| 19 | 20260228190000 | user_feature_overrides | Equivalent pair |
| 20 | 20260228200000 | affiliate_system | Equivalent pair |
| 21 | 20260302120000 | user_platform_context | Equivalent pair |
| 22 | 20260303120000 | network_intelligence | Equivalent pair |
| 23 | 20260306120000 | why_me_stories | Equivalent pair |
| 24 | 20260306130000 | job_applications_pipeline_stage | Equivalent pair |
| 25 | 20260307012533 | interview_prep_reports | Equivalent pair |
| 26 | 20260307020000 | linkedin_optimization_reports | Equivalent pair |
| 27 | 20260307030000 | content_calendar_reports | Equivalent pair |
| 28 | 20260307040000 | networking_outreach_reports | Equivalent pair |
| 29 | 20260307050000 | job_tracker_reports | Equivalent pair |
| 30 | 20260307060000 | salary_negotiation_reports | Equivalent pair |
| 31 | 20260307070000 | executive_bio_reports | Equivalent pair |
| 32 | 20260307080000 | case_study_reports | Equivalent pair |
| 33 | 20260307090000 | thank_you_note_reports | Equivalent pair |
| 34 | 20260307091000 | personal_brand_reports | Equivalent pair |
| 35 | 20260307092000 | ninety_day_plan_reports | Equivalent pair |
| 36 | 20260307100000 | onboarding_assessments | Equivalent pair |
| 37 | 20260307120000 | interview_debriefs | Equivalent pair |
| 38 | 20260307200000 | application_pipeline | Equivalent pair |
| 39 | 20260307300000 | content_posts | Equivalent pair |
| 40 | 20260307400000 | networking_contacts | Equivalent pair |
| 41 | 20260308200000 | user_momentum | Equivalent pair |
| 42 | 20260308210000 | momentum_constraints | Equivalent pair |
| 43 | 20260308220000 | platform_context_upsert_index | Equivalent pair |
| 44 | 20260308230000 | atomic_context_upsert | Equivalent pair |
| 45 | 20260308240000 | retirement_readiness_assessments | Equivalent pair |
| 46 | 20260308250000 | planner_handoff | Equivalent pair |
| 47 | 20260308260000 | b2b_outplacement | **Truly local-only** |
| 48 | 20260308270000 | b2b_indexes | **Truly local-only** |
| 49 | 20260308280000 | add_product_type_to_sessions | Equivalent pair |
| 50 | 20260308290000 | job_search_tables | **Truly local-only** |
| 51 | 20260308300000 | watchlist_companies | **Truly local-only** |
| 52 | 20260308310000 | networking_application_link | **Truly local-only** |
| 53 | 20260309400000 | extension_support | **Truly local-only** |
| 54 | 20260311000000 | coach_tables | **Truly local-only** |
| 55 | 20260311100000 | expand_context_check | **Truly local-only** |
| 56 | 20260311100100 | tighten_assessment_rls | **Truly local-only** |
| 57 | 20260311100200 | add_delete_policies | **Truly local-only** |
| 58 | 20260313120000 | products_catalog | **Truly local-only** |
| 59 | 20260317121500 | job_workspace_asset_links | **Truly local-only** |
| 60 | 20260318234500 | add_career_profile_context_type | **Truly local-only** |
| 61 | 20260323000000 | expand_referral_bonus_programs | Equivalent pair |
| 62 | 20260324000000 | add_linkedin_profile_context_type | Equivalent pair |
| 63 | 20260330130000 | product_telemetry_events | Equivalent pair |

## Appendix C: Full Remote-Only List (53 entries)

| # | Timestamp | Name | Status |
|---|---|---|---|
| 1 | 20260218232808 | add_master_resume_columns_and_rpcs | **No local equivalent** |
| 2 | 20260220160445 | add_claim_pipeline_slot_rpc | Equivalent pair |
| 3 | 20260220160457 | fix_claim_pipeline_slot_rpc | **No local equivalent** |
| 4 | 20260220175237 | add_moddatetime_trigger_coach_sessions | **No local equivalent** |
| 5 | 20260225024605 | add_workflow_artifacts_and_nodes | Equivalent pair |
| 6 | 20260225024625 | harden_workflow_tables | Equivalent pair |
| 7 | 20260225024638 | harden_next_artifact_version | Equivalent pair |
| 8 | 20260226012123 | normalize_legacy_draft_readiness_artifacts | Equivalent pair |
| 9 | 20260307052758 | linkedin_optimization_reports | Equivalent pair |
| 10 | 20260307054628 | content_calendar_reports | Equivalent pair |
| 11 | 20260307060127 | networking_outreach_reports | Equivalent pair |
| 12 | 20260307152646 | job_tracker_reports | Equivalent pair |
| 13 | 20260308213152 | ninety_day_plan_reports | Equivalent pair |
| 14 | 20260308213203 | onboarding_assessments | Equivalent pair |
| 15 | 20260308213215 | interview_debriefs | Equivalent pair |
| 16 | 20260308213226 | application_pipeline | Equivalent pair |
| 17 | 20260308213238 | content_posts | Equivalent pair |
| 18 | 20260308213251 | networking_contacts | Equivalent pair |
| 19 | 20260308213303 | user_momentum | Equivalent pair |
| 20 | 20260308213314 | momentum_constraints | Equivalent pair |
| 21 | 20260308213430 | fix_increment_session_usage_rpc | Equivalent pair |
| 22 | 20260308213440 | add_default_base_resume | Equivalent pair |
| 23 | 20260308213455 | master_resume_default_integrity_rpcs | Equivalent pair |
| 24 | 20260308213507 | create_master_resume_atomic_rpc | Equivalent pair |
| 25 | 20260308213523 | production_fixes | Equivalent pair |
| 26 | 20260308213529 | pipeline_capacity_indexes | Equivalent pair |
| 27 | 20260308213550 | add_evidence_items_to_master_resumes | Equivalent pair |
| 28 | 20260308213558 | fix_next_artifact_version_service_role | Equivalent pair |
| 29 | 20260308213607 | audit_round5_db_hardening | Equivalent pair |
| 30 | 20260308213725 | stripe_billing | Equivalent pair |
| 31 | 20260308213729 | fix_usage_upsert_rpc | Equivalent pair |
| 32 | 20260308213731 | add_promo_tracking | Equivalent pair |
| 33 | 20260308213740 | plan_features | Equivalent pair |
| 34 | 20260308213742 | user_feature_overrides | Equivalent pair |
| 35 | 20260308213746 | affiliate_system | Equivalent pair |
| 36 | 20260308213755 | user_platform_context | Equivalent pair |
| 37 | 20260308213802 | platform_context_upsert_index | Equivalent pair |
| 38 | 20260308213829 | network_intelligence | Equivalent pair |
| 39 | 20260308213837 | why_me_stories | Equivalent pair |
| 40 | 20260308213839 | job_applications_pipeline_stage | Equivalent pair |
| 41 | 20260308213844 | interview_prep_reports | Equivalent pair |
| 42 | 20260308213852 | salary_negotiation_reports | Equivalent pair |
| 43 | 20260308213855 | executive_bio_reports | Equivalent pair |
| 44 | 20260308213857 | case_study_reports | Equivalent pair |
| 45 | 20260308213904 | thank_you_note_reports | Equivalent pair |
| 46 | 20260308213906 | personal_brand_reports | Equivalent pair |
| 47 | 20260308213916 | retirement_readiness_assessments | Equivalent pair |
| 48 | 20260308213923 | planner_handoff | Equivalent pair |
| 49 | 20260308225557 | add_product_type_to_sessions | Equivalent pair |
| 50 | 20260324135914 | expand_referral_bonus_programs | Equivalent pair |
| 51 | 20260324135926 | add_linkedin_profile_context_type | Equivalent pair |
| 52 | 20260330192710 | product_telemetry_events | Equivalent pair |

> Note: The remote-only list contains 52 entries (not 53). The original count of 53 included `atomic_context_upsert` at remote timestamp 20260308213805, which was identified during pair matching but was not present in the initial remote-only enumeration. This has been accounted for in the 50 equivalent pairs (row 44).
