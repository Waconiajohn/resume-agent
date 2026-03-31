# Supabase Migration Mismatch Register

**Date:** 2026-03-27
**Repo:** `/Users/johnschrup/resume-agent`
**Remote:** Supabase project `pvmfgfnbtqlipnnoeixu`

> This register tracks confirmed SQL mismatches between local migration files and their remote "equivalent" counterparts. Timestamp-shifted pairs that are functionally identical are NOT listed here.

---

## Confirmed Mismatches

### 1. add_claim_pipeline_slot_rpc

| Field | Value |
|---|---|
| Local timestamp | 20260228120000 |
| Remote timestamp | 20260220160445 |
| Mismatch type | Functional divergence — different return type, different logic, additional DDL |
| Severity | **LOW** (see notes) |
| User-facing risk | None — RPC is not called by any live server/app code |
| Recommended action | No corrective migration needed. Document as historical artifact. When history reconciliation occurs, adopt the remote version and archive the local file, OR create a reconciliation migration if server code is ever updated to call this RPC. |

**Details:**
- Local: returns `jsonb`, adds `pipeline_started_at` column, has `REVOKE/GRANT`, uses `SET search_path`
- Remote: returns `boolean`, no column add, no permission changes
- Live RPC signature: `boolean` (matches remote version from `20260220175237_add_moddatetime_trigger_coach_sessions`)
- **Zero references** to `claim_pipeline_slot` in any `.ts` file in the entire repo. The RPC exists in the DB but is not called by the application. The pipeline uses a different mechanism now.

### 2. add_linkedin_profile_context_type

| Field | Value |
|---|---|
| Local timestamp | 20260324000000 |
| Remote timestamp | 20260324135926 |
| Mismatch type | CHECK constraint value set divergence |
| Severity | **RESOLVED (Phase 2A)** |
| User-facing risk | Was CRITICAL — context writes for 9 types would fail. Now fixed. |
| Recommended action | No further action. Corrective migration `20260327180000_expand_context_type_constraint.sql` applied to remote. When history is reconciled, this pair needs special handling (local file has 20 types, remote has 11, corrective migration has 22). |

**Details:**
- Root cause: local-only migration `20260311100000_expand_context_check.sql` was never applied to remote
- Fix: forward-only corrective migration applied 2026-03-27

### 3. add_default_base_resume

| Field | Value |
|---|---|
| Local timestamp | 20260218143000 |
| Remote timestamp | 20260308213440 |
| Mismatch type | Likely equivalent but with possible index name difference |
| Severity | **LOW** |
| User-facing risk | None — both add the same columns with the same semantics |
| Recommended action | Verify index name during history reconciliation. Local creates `uniq_master_resumes_default_per_user`, remote creates `master_resumes_user_default_unique` (from recovered `20260218232808`). Both are partial unique indexes on `(user_id) WHERE is_default = true`. |

**Details:**
- Both add `is_default boolean NOT NULL DEFAULT false` and `source_session_id uuid` to `master_resumes`
- Index name difference is cosmetic — same functional constraint
- The remote version was applied via the earlier `20260218232808_add_master_resume_columns_and_rpcs` migration which combined column adds + RPCs

---

## Previously Confirmed as likely_same (Phase 1.5 + Phase 2B)

| # | Migration Name | Local TS | Remote TS | Parity | Notes |
|---|---|---|---|---|---|
| 1 | product_telemetry_events | 20260330130000 | 20260330192710 | likely_same | Identical DDL |
| 2 | stripe_billing | 20260228150000 | 20260308213725 | likely_same | Identical ALTER+COMMENT |
| 3 | atomic_context_upsert | 20260308230000 | 20260308213805 | likely_same | Identical function |
| 4 | add_product_type_to_sessions | 20260308280000 | 20260308225557 | likely_same | Identical |
| 5 | affiliate_system | 20260228200000 | 20260308213746 | likely_same | Same tables/RLS |
| 6 | network_intelligence | 20260303120000 | 20260308213829 | likely_same | Same 6 tables |
| 7 | add_workflow_artifacts_and_nodes | 20260224190000 | 20260225024605 | likely_same | Same 3 tables, local wraps in BEGIN |
| 8 | user_momentum | 20260308200000 | 20260308213303 | likely_same | Same 3 tables |
| 9 | harden_workflow_tables | 20260224200000 | 20260225024625 | likely_same | Same ALTER+CHECK constraints |
| 10 | harden_next_artifact_version | 20260224210000 | 20260225024638 | likely_same | Same function rewrite |
| 11 | normalize_legacy_draft_readiness_artifacts | 20260225193000 | 20260226012123 | likely_same | Same CTE-based data fix |
| 12 | fix_increment_session_usage_rpc | 20260218103000 | 20260308213430 | likely_same | Same function signature and logic |
| 13 | master_resume_default_integrity_rpcs | 20260218190000 | 20260308213455 | likely_same | Same RPCs |
| 14 | create_master_resume_atomic_rpc | 20260218213000 | 20260308213507 | likely_same | Same function |
| 15 | production_fixes | 20260219000000 | 20260308213523 | likely_same | Same trigger definitions |
| 16 | pipeline_capacity_indexes | 20260220103000 | 20260308213529 | likely_same | Same indexes |
| 17 | add_evidence_items_to_master_resumes | 20260227180000 | 20260308213550 | likely_same | Same ALTER+function rewrite |
| 18 | fix_next_artifact_version_service_role | 20260228130000 | 20260308213558 | likely_same | Same function rewrite |
| 19 | audit_round5_db_hardening | 20260228140000 | 20260308213607 | likely_same | Same policy+function |
| 20 | fix_usage_upsert_rpc | 20260228160000 | 20260308213729 | likely_same | Same upsert function |
| 21 | add_promo_tracking | 20260228170000 | 20260308213731 | likely_same | Same ALTER TABLE |
| 22 | plan_features | 20260228180000 | 20260308213740 | likely_same | Same CREATE TABLE |
| 23 | user_feature_overrides | 20260228190000 | 20260308213742 | likely_same | Same CREATE TABLE |
| 24 | platform_context_upsert_index | 20260308220000 | 20260308213802 | likely_same | Same CREATE UNIQUE INDEX |
| 25 | why_me_stories | 20260306120000 | 20260308213837 | likely_same | Same CREATE TABLE |
| 26 | job_applications_pipeline_stage | 20260306130000 | 20260308213839 | likely_same | Same ALTER TABLE |
| 27 | momentum_constraints | 20260308210000 | 20260308213314 | likely_same | Same CHECK constraints + extension |
| 28 | expand_referral_bonus_programs | 20260323000000 | 20260324135914 | likely_same | Same ALTER+unique constraint |
| 29 | linkedin_optimization_reports | 20260307020000 | 20260307052758 | likely_same | Same CREATE TABLE |
| 30 | content_calendar_reports | 20260307030000 | 20260307054628 | likely_same | Same CREATE TABLE |
| 31 | networking_outreach_reports | 20260307040000 | 20260307060127 | likely_same | Same CREATE TABLE |
| 32 | job_tracker_reports | 20260307050000 | 20260307152646 | likely_same | Same CREATE TABLE |
| 33 | ninety_day_plan_reports | 20260307092000 | 20260308213152 | likely_same | Same CREATE TABLE |
| 34 | onboarding_assessments | 20260307100000 | 20260308213203 | likely_same | Same CREATE TABLE |
| 35 | interview_debriefs | 20260307120000 | 20260308213215 | likely_same | Same CREATE TABLE |
| 36 | application_pipeline | 20260307200000 | 20260308213226 | likely_same | Same CREATE TABLE |
| 37 | content_posts | 20260307300000 | 20260308213238 | likely_same | Same CREATE TABLE |
| 38 | networking_contacts | 20260307400000 | 20260308213251 | likely_same | Same CREATE TABLE |
| 39 | interview_prep_reports | 20260307012533 | 20260308213844 | likely_same | Same CREATE TABLE |
| 40 | salary_negotiation_reports | 20260307060000 | 20260308213852 | likely_same | Same CREATE TABLE |
| 41 | executive_bio_reports | 20260307070000 | 20260308213855 | likely_same | Same CREATE TABLE |
| 42 | case_study_reports | 20260307080000 | 20260308213857 | likely_same | Same CREATE TABLE |
| 43 | thank_you_note_reports | 20260307090000 | 20260308213904 | likely_same | Same CREATE TABLE |
| 44 | personal_brand_reports | 20260307091000 | 20260308213906 | likely_same | Same CREATE TABLE |
| 45 | retirement_readiness_assessments | 20260308240000 | 20260308213916 | likely_same | Same CREATE TABLE |
| 46 | planner_handoff | 20260308250000 | 20260308213923 | likely_same | Same CREATE TABLE |

**Parity coverage:** 46 of 50 pairs checked (92%). Remaining 4 not individually verified but are simple report table migrations following identical patterns.
