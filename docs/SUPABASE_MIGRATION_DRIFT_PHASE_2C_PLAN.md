# Supabase Migration Drift — Phase 2C Repair Plan

**Date:** 2026-03-27
**Repo:** `/Users/johnschrup/resume-agent`
**Scope:** Repo-local filename alignment ONLY. No remote mutations. No SQL content changes.

---

## What This Phase Does

Renames local migration files from their local timestamps to the matching remote timestamps for the **proven-safe subset only**. This reduces the drift count reported by `npm run check:migrations` without touching the remote database or changing any SQL content.

---

## Files to Rename (46 pairs)

| # | Current Local Filename | New Filename (remote timestamp) |
|---|---|---|
| 1 | `20260218103000_fix_increment_session_usage_rpc.sql` | `20260308213430_fix_increment_session_usage_rpc.sql` |
| 2 | `20260218143000_add_default_base_resume.sql` | `20260308213440_add_default_base_resume.sql` |
| 3 | `20260218190000_master_resume_default_integrity_rpcs.sql` | `20260308213455_master_resume_default_integrity_rpcs.sql` |
| 4 | `20260218213000_create_master_resume_atomic_rpc.sql` | `20260308213507_create_master_resume_atomic_rpc.sql` |
| 5 | `20260219000000_production_fixes.sql` | `20260308213523_production_fixes.sql` |
| 6 | `20260220103000_pipeline_capacity_indexes.sql` | `20260308213529_pipeline_capacity_indexes.sql` |
| 7 | `20260224190000_add_workflow_artifacts_and_nodes.sql` | `20260225024605_add_workflow_artifacts_and_nodes.sql` |
| 8 | `20260224200000_harden_workflow_tables.sql` | `20260225024625_harden_workflow_tables.sql` |
| 9 | `20260224210000_harden_next_artifact_version.sql` | `20260225024638_harden_next_artifact_version.sql` |
| 10 | `20260225193000_normalize_legacy_draft_readiness_artifacts.sql` | `20260226012123_normalize_legacy_draft_readiness_artifacts.sql` |
| 11 | `20260227180000_add_evidence_items_to_master_resumes.sql` | `20260308213550_add_evidence_items_to_master_resumes.sql` |
| 12 | `20260228130000_fix_next_artifact_version_service_role.sql` | `20260308213558_fix_next_artifact_version_service_role.sql` |
| 13 | `20260228140000_audit_round5_db_hardening.sql` | `20260308213607_audit_round5_db_hardening.sql` |
| 14 | `20260228150000_stripe_billing.sql` | `20260308213725_stripe_billing.sql` |
| 15 | `20260228160000_fix_usage_upsert_rpc.sql` | `20260308213729_fix_usage_upsert_rpc.sql` |
| 16 | `20260228170000_add_promo_tracking.sql` | `20260308213731_add_promo_tracking.sql` |
| 17 | `20260228180000_plan_features.sql` | `20260308213740_plan_features.sql` |
| 18 | `20260228190000_user_feature_overrides.sql` | `20260308213742_user_feature_overrides.sql` |
| 19 | `20260228200000_affiliate_system.sql` | `20260308213746_affiliate_system.sql` |
| 20 | `20260302120000_user_platform_context.sql` | `20260308213755_user_platform_context.sql` |
| 21 | `20260303120000_network_intelligence.sql` | `20260308213829_network_intelligence.sql` |
| 22 | `20260306120000_why_me_stories.sql` | `20260308213837_why_me_stories.sql` |
| 23 | `20260306130000_job_applications_pipeline_stage.sql` | `20260308213839_job_applications_pipeline_stage.sql` |
| 24 | `20260307012533_interview_prep_reports.sql` | `20260308213844_interview_prep_reports.sql` |
| 25 | `20260307020000_linkedin_optimization_reports.sql` | `20260307052758_linkedin_optimization_reports.sql` |
| 26 | `20260307030000_content_calendar_reports.sql` | `20260307054628_content_calendar_reports.sql` |
| 27 | `20260307040000_networking_outreach_reports.sql` | `20260307060127_networking_outreach_reports.sql` |
| 28 | `20260307050000_job_tracker_reports.sql` | `20260307152646_job_tracker_reports.sql` |
| 29 | `20260307060000_salary_negotiation_reports.sql` | `20260308213852_salary_negotiation_reports.sql` |
| 30 | `20260307070000_executive_bio_reports.sql` | `20260308213855_executive_bio_reports.sql` |
| 31 | `20260307080000_case_study_reports.sql` | `20260308213857_case_study_reports.sql` |
| 32 | `20260307090000_thank_you_note_reports.sql` | `20260308213904_thank_you_note_reports.sql` |
| 33 | `20260307091000_personal_brand_reports.sql` | `20260308213906_personal_brand_reports.sql` |
| 34 | `20260307092000_ninety_day_plan_reports.sql` | `20260308213152_ninety_day_plan_reports.sql` |
| 35 | `20260307100000_onboarding_assessments.sql` | `20260308213203_onboarding_assessments.sql` |
| 36 | `20260307120000_interview_debriefs.sql` | `20260308213215_interview_debriefs.sql` |
| 37 | `20260307200000_application_pipeline.sql` | `20260308213226_application_pipeline.sql` |
| 38 | `20260307300000_content_posts.sql` | `20260308213238_content_posts.sql` |
| 39 | `20260307400000_networking_contacts.sql` | `20260308213251_networking_contacts.sql` |
| 40 | `20260308200000_user_momentum.sql` | `20260308213303_user_momentum.sql` |
| 41 | `20260308210000_momentum_constraints.sql` | `20260308213314_momentum_constraints.sql` |
| 42 | `20260308220000_platform_context_upsert_index.sql` | `20260308213802_platform_context_upsert_index.sql` |
| 43 | `20260308230000_atomic_context_upsert.sql` | `20260308213805_atomic_context_upsert.sql` |
| 44 | `20260308240000_retirement_readiness_assessments.sql` | `20260308213916_retirement_readiness_assessments.sql` |
| 45 | `20260308250000_planner_handoff.sql` | `20260308213923_planner_handoff.sql` |
| 46 | `20260308280000_add_product_type_to_sessions.sql` | `20260308225557_add_product_type_to_sessions.sql` |

---

## Explicitly EXCLUDED from this phase

| # | Migration | Reason |
|---|---|---|
| 1 | `20260228120000_add_claim_pipeline_slot_rpc.sql` | Confirmed mismatch (returns jsonb locally, boolean remotely) |
| 2 | `20260324000000_add_linkedin_profile_context_type.sql` | Confirmed mismatch (CHECK constraint values differ) |
| 3 | `20260323000000_expand_referral_bonus_programs.sql` | Not individually verified at SQL level in Phase 2B (only previewed) — include in next pass after full verification |
| 4 | `20260330130000_product_telemetry_events.sql` | Verified as likely_same but this was the trigger for Phase 2A; keep excluded until corrective migration pair is resolved |
| 5 | `20260327180000_expand_context_type_constraint.sql` | Corrective migration — remote has different MCP timestamp (20260330203002) |
| 6 | All 13 truly local-only unapplied migrations | Not timestamp-shifted pairs — require separate apply pass |

---

## Expected Drift Count Changes

| Metric | Before | Expected After |
|---|---|---|
| Local-only | 64 | 18 (64 - 46 renamed) |
| Remote-only | 51 | 5 (51 - 46 now matched) |
| Matched | 18 | 64 (18 + 46 newly matched) |

---

## Confirmation

- This phase is **repo-local alignment only**
- No SQL file contents will be changed
- No remote database mutations
- No `supabase migration repair` commands
- Only `mv` (rename) operations on local files
