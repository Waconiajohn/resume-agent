# CareerIQ Platform — Full Database Schema Blueprint

**Version:** 1.0
**Date:** 2026-03-07
**Author:** Database Architecture Review
**Scope:** 33-agent AI career coaching platform — full schema for 100K+ users, B2B enterprise, financial planner network

---

## Table of Contents

1. [Existing Schema Inventory](#1-existing-schema-inventory)
2. [Design Principles](#2-design-principles)
3. [Complete Schema — All Phases](#3-complete-schema)
   - Phase 1: Core Identity & Positioning
   - Phase 2: Agent Report Tables (existing pattern, extended)
   - Phase 3: Job Discovery & Application Pipeline
   - Phase 4: Interview & Relationships
   - Phase 5: Financial Wellness (HIGHLY SENSITIVE)
   - Phase 6: B2B Enterprise Multi-Tenancy
   - Phase 7: Audit, Compliance & Knowledge Graph
4. [RLS Policy Matrix](#4-rls-policy-matrix)
5. [Migration Sequence](#5-migration-sequence)
6. [Cross-Agent Data Flow](#6-cross-agent-data-flow)
7. [Performance Plan](#7-performance-plan)
8. [B2B Multi-Tenancy Design](#8-b2b-multi-tenancy)
9. [Financial Data Isolation](#9-financial-data-isolation)
10. [Audit & Compliance](#10-audit--compliance)
11. [GDPR Right-to-Delete Implementation](#11-gdpr-right-to-delete)

---

## 1. Existing Schema Inventory

Tables already in production (do NOT recreate):

| Table | Migration | Purpose |
|-------|-----------|---------|
| `master_resumes` | 001 | Core resume data per user |
| `job_applications` | 001 | Job tracking |
| `coach_sessions` | 001 | Resume pipeline sessions |
| `master_resume_history` | 001 | Resume change log |
| `session_locks` | 006 | Concurrency control |
| `user_positioning_profiles` | 012 | Positioning identity entity |
| `pricing_plans` | 011 | Product tiers |
| `user_subscriptions` | 011 | Subscription state |
| `user_usage` | 010 | Session usage counters |
| `user_platform_context` | 20260302 | Cross-agent context store |
| `company_directory` | 20260303 | Canonical company records |
| `referral_bonus_programs` | 20260303 | Company referral programs |
| `client_connections` | 20260303 | LinkedIn connections |
| `client_target_titles` | 20260303 | Job title targets |
| `job_matches` | 20260303 | Network-matched jobs |
| `scrape_log` | 20260303 | Import/scrape audit |
| `why_me_stories` | 20260306 | Positioning narratives |
| `session_workflow_nodes` | 20260224 | Pipeline checkpoints |
| `session_workflow_artifacts` | 20260224 | Versioned pipeline outputs |
| `session_question_responses` | 20260224 | Questionnaire answers |
| `affiliates` | 20260228 | Affiliate partners |
| `referral_events` | 20260228 | Affiliate tracking |
| `interview_prep_reports` | 20260307 | Agent #10 output |
| `linkedin_optimization_reports` | 20260307 | Agent #X output |
| `content_calendar_reports` | 20260307 | Agent #X output |
| `networking_outreach_reports` | 20260307 | Agent #X output |
| `job_tracker_reports` | 20260307 | Agent #X output |
| `salary_negotiation_reports` | 20260307 | Agent #X output |
| `executive_bio_reports` | 20260307 | Agent #X output |
| `case_study_reports` | 20260307 | Agent #X output |
| `thank_you_note_reports` | 20260307 | Agent #X output |
| `personal_brand_reports` | 20260307 | Agent #X output |
| `ninety_day_plan_reports` | 20260307 | Agent #X output |

---

## 2. Design Principles

### Data Classification Tiers

| Tier | Label | Examples | Retention | Encryption |
|------|-------|----------|-----------|------------|
| T1 | Personal Identity | Name, email, DOB | Account lifetime + 30 days | At rest (pgcrypto) |
| T2 | Career/Professional | Resume, job history | Account lifetime + 90 days | At rest |
| T3 | Financial Context | Retirement gap, salary range | Account lifetime + 30 days | At rest + column-level |
| T4 | Behavioral/Platform | Usage events, click logs | 12 months rolling | Anonymized after 12mo |

**Rule: Financial data (T3) lives only in tables prefixed `fin_`. No career agent reads these tables. No financial table reads career tables directly — only through the opted-in consent bridge.**

### Naming Conventions

- All tables: `snake_case`, plural nouns
- All PKs: `uuid`, `gen_random_uuid()` default
- All timestamps: `timestamptz NOT NULL DEFAULT now()`
- Foreign keys: `{table_singular}_id` naming
- JSONB columns: explicit `DEFAULT '{}'::jsonb` or `'[]'::jsonb`
- Soft delete: `deleted_at timestamptz` (NULL = active)
- B2B scoping: `org_id uuid` column on all multi-tenant tables

### RLS Principal Types

| Principal | How Identified | Access Level |
|-----------|---------------|--------------|
| End user | `auth.uid()` | Own rows only |
| B2B org admin | `org_admin_check(org_id)` helper function | Read-only on org's users |
| Financial planner | `planner_check(planner_id)` helper function | ONLY fin_ tables for opted-in users |
| Platform admin | Service role key (bypasses RLS) | Full access |
| Agent service | Service role key | Full access |

---

## 3. Complete Schema

### Phase 1: Core Identity & Positioning (Migration 013)

```sql
-- ============================================================
-- Migration 013: Enhanced User Positioning Profile
-- Expands 012's user_positioning_profiles with structured columns
-- Adds profiles table as central identity hub
-- ============================================================
BEGIN;

-- User profile: central identity entity, one-to-one with auth.users
-- Bridges auth identity to all career and platform data
CREATE TABLE IF NOT EXISTS profiles (
  id                  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name        text,
  avatar_url          text,
  timezone            text DEFAULT 'America/New_York',
  onboarding_complete boolean NOT NULL DEFAULT false,
  onboarding_step     text,
  -- B2B membership
  org_id              uuid,   -- FK added in Phase 6 migration after b2b_organizations exists
  org_role            text CHECK (org_role IN ('member', 'admin', 'owner')),
  -- Platform preferences
  preferred_mode      text NOT NULL DEFAULT 'balanced'
                      CHECK (preferred_mode IN ('fast_draft', 'balanced', 'deep_dive')),
  notification_prefs  jsonb NOT NULL DEFAULT '{}',
  -- Retention / compliance
  gdpr_consent_at     timestamptz,
  marketing_consent   boolean NOT NULL DEFAULT false,
  data_region         text NOT NULL DEFAULT 'us',
  -- Soft delete
  deleted_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_org_id ON profiles(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX idx_profiles_deleted ON profiles(deleted_at) WHERE deleted_at IS NOT NULL;

-- Expand user_positioning_profiles with structured columns
-- (existing positioning_data jsonb is preserved for backward compat)
ALTER TABLE user_positioning_profiles
  ADD COLUMN IF NOT EXISTS career_narrative          text,
  ADD COLUMN IF NOT EXISTS positioning_angle         text,
  ADD COLUMN IF NOT EXISTS key_accomplishments       jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS target_roles              jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS target_industries         jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS leadership_style          text,
  ADD COLUMN IF NOT EXISTS industry_expertise        jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS skills_matrix             jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS age_positioning_notes     text,
  -- SENSITIVE: emotional/wellbeing state — never exposed to non-platform principals
  ADD COLUMN IF NOT EXISTS emotional_state           jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS enrichment_log            jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS completeness_score        integer NOT NULL DEFAULT 0
                           CHECK (completeness_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS last_enriched_by          text,
  ADD COLUMN IF NOT EXISTS last_enriched_at          timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at                timestamptz;

COMMIT;
```

### Phase 2: Agent Report Tables — Unified Pattern (Migration 014)

All 33 agents produce reports. The existing per-agent tables (interview_prep_reports, etc.) are the correct pattern. Migration 014 fills gaps for agents that don't have tables yet and adds a unified `agent_reports` registry.

```sql
-- ============================================================
-- Migration 014: Agent Reports Registry + Missing Agent Tables
-- Provides a unified lookup table for all agent outputs.
-- Individual report tables hold the full content; this registry
-- holds metadata for cross-agent discovery.
-- ============================================================
BEGIN;

-- Central registry: one row per agent run, links to the specific
-- report table via (agent_id, report_table, report_id)
CREATE TABLE IF NOT EXISTS agent_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id          uuid,           -- populated for B2B users
  agent_id        integer NOT NULL CHECK (agent_id BETWEEN 1 AND 33),
  agent_slug      text NOT NULL,  -- e.g. 'resume_strategist', 'interview_prep'
  report_table    text NOT NULL,  -- e.g. 'interview_prep_reports'
  report_id       uuid NOT NULL,  -- FK into the specific table (enforced in app layer)
  -- Context at time of generation
  job_application_id uuid REFERENCES job_applications(id) ON DELETE SET NULL,
  coach_session_id   uuid REFERENCES coach_sessions(id) ON DELETE SET NULL,
  -- Quality and status
  quality_score   integer,
  status          text NOT NULL DEFAULT 'complete'
                  CHECK (status IN ('generating', 'complete', 'failed', 'archived')),
  tokens_used     integer NOT NULL DEFAULT 0,
  model_used      text,
  generation_ms   integer,        -- wall clock ms for generation
  -- Metadata
  input_summary   jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_reports_user ON agent_reports(user_id);
CREATE INDEX idx_agent_reports_user_agent ON agent_reports(user_id, agent_id);
CREATE INDEX idx_agent_reports_user_created ON agent_reports(user_id, created_at DESC);
CREATE INDEX idx_agent_reports_org ON agent_reports(org_id) WHERE org_id IS NOT NULL;

ALTER TABLE agent_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own agent reports"
  ON agent_reports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own agent reports"
  ON agent_reports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own agent reports"
  ON agent_reports FOR DELETE USING (auth.uid() = user_id);

-- ── Agent #4: LinkedIn Optimizer ─────────────────────────────
-- linkedin_optimization_reports already exists from 20260307.
-- Add linkedin_profiles for persistent profile state.

CREATE TABLE IF NOT EXISTS linkedin_profiles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  headline            text,
  summary             text,
  experience          jsonb NOT NULL DEFAULT '[]'::jsonb,
  skills              jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations     jsonb NOT NULL DEFAULT '[]'::jsonb,
  profile_url         text,
  connection_count    integer,
  ssi_score           integer,    -- Social Selling Index if available
  last_scraped_at     timestamptz,
  optimization_notes  jsonb NOT NULL DEFAULT '[]'::jsonb,
  version             integer NOT NULL DEFAULT 1,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX idx_linkedin_profiles_user ON linkedin_profiles(user_id);

-- ── Agent #5: Job Discovery ───────────────────────────────────
-- job_matches already exists. Add boolean_searches and
-- application_pipeline as structured companions.

CREATE TABLE IF NOT EXISTS boolean_searches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label           text NOT NULL,
  query_string    text NOT NULL,
  source          text NOT NULL CHECK (source IN ('linkedin', 'indeed', 'google', 'other')),
  result_count    integer,
  last_run_at     timestamptz,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_boolean_searches_user ON boolean_searches(user_id);
CREATE INDEX idx_boolean_searches_user_active ON boolean_searches(user_id, is_active);

CREATE TABLE IF NOT EXISTS application_pipeline (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_application_id  uuid NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
  -- Kanban stage
  stage               text NOT NULL DEFAULT 'target'
                      CHECK (stage IN (
                        'target', 'applying', 'applied', 'phone_screen',
                        'interview', 'offer', 'negotiating', 'accepted',
                        'rejected', 'withdrawn', 'archived'
                      )),
  stage_entered_at    timestamptz NOT NULL DEFAULT now(),
  -- Follow-up tracking
  next_action         text,
  next_action_due     timestamptz,
  -- Contacts at this company
  primary_contact_id  uuid,   -- FK to networking_contacts (added Phase 3)
  -- Notes
  notes               text,
  priority            integer NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  source              text,   -- 'network', 'job_board', 'recruiter', 'direct'
  referral_available  boolean NOT NULL DEFAULT false,
  -- Stage history as JSONB array: [{stage, entered_at, exited_at}]
  stage_history       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, job_application_id)
);

CREATE INDEX idx_application_pipeline_user ON application_pipeline(user_id);
CREATE INDEX idx_application_pipeline_user_stage ON application_pipeline(user_id, stage);
CREATE INDEX idx_application_pipeline_action_due
  ON application_pipeline(user_id, next_action_due)
  WHERE next_action_due IS NOT NULL;

-- ── Agent #6: Content Calendar ────────────────────────────────
-- content_calendar_reports already exists.
-- Add content_posts for individual generated posts.

CREATE TABLE IF NOT EXISTS content_posts (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calendar_report_id      uuid,  -- FK to content_calendar_reports
  platform                text NOT NULL CHECK (platform IN ('linkedin', 'twitter', 'newsletter', 'blog', 'other')),
  post_type               text NOT NULL CHECK (post_type IN ('thought_leadership', 'story', 'tip', 'milestone', 'engagement', 'other')),
  content                 text NOT NULL,
  scheduled_for           timestamptz,
  published_at            timestamptz,
  status                  text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'scheduled', 'published', 'archived')),
  engagement_metrics      jsonb NOT NULL DEFAULT '{}',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_content_posts_user ON content_posts(user_id);
CREATE INDEX idx_content_posts_user_status ON content_posts(user_id, status);
CREATE INDEX idx_content_posts_scheduled ON content_posts(user_id, scheduled_for)
  WHERE scheduled_for IS NOT NULL AND status = 'scheduled';

COMMIT;
```

### Phase 3: Interview & Relationships (Migration 015)

```sql
-- ============================================================
-- Migration 015: Interview Sessions, Networking Contacts,
--                Offer Negotiations
-- ============================================================
BEGIN;

-- ── Interview Sessions ────────────────────────────────────────
-- Stores structured interview prep and mock interview transcripts.
-- interview_prep_reports (existing) stores the PDF-style report;
-- interview_sessions stores the live/mock session data.

CREATE TABLE IF NOT EXISTS interview_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_application_id  uuid REFERENCES job_applications(id) ON DELETE SET NULL,
  session_type        text NOT NULL DEFAULT 'mock'
                      CHECK (session_type IN ('mock', 'live_debrief', 'prep_review')),
  status              text NOT NULL DEFAULT 'scheduled'
                      CHECK (status IN ('scheduled', 'in_progress', 'complete', 'cancelled')),
  scheduled_at        timestamptz,
  completed_at        timestamptz,
  -- Prep artifacts
  company_briefing    jsonb NOT NULL DEFAULT '{}',
  question_bank       jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Mock transcript: [{role: 'interviewer'|'candidate', content, timestamp}]
  mock_transcript     jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Scored feedback
  prep_score          integer CHECK (prep_score BETWEEN 0 AND 100),
  strengths           jsonb NOT NULL DEFAULT '[]'::jsonb,
  improvement_areas   jsonb NOT NULL DEFAULT '[]'::jsonb,
  coach_notes         text,
  -- Duration tracking
  duration_minutes    integer,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_interview_sessions_user ON interview_sessions(user_id);
CREATE INDEX idx_interview_sessions_user_app
  ON interview_sessions(user_id, job_application_id)
  WHERE job_application_id IS NOT NULL;
CREATE INDEX idx_interview_sessions_user_status
  ON interview_sessions(user_id, status);

-- ── Networking Contacts ───────────────────────────────────────
-- Structured CRM for the user's professional network.
-- Extends client_connections (imported LinkedIn data) with
-- relationship depth and outreach tracking.

CREATE TABLE IF NOT EXISTS networking_contacts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Link to imported LinkedIn connection if applicable
  client_connection_id uuid REFERENCES client_connections(id) ON DELETE SET NULL,
  -- Core identity
  first_name          text NOT NULL,
  last_name           text NOT NULL,
  email               text,
  phone               text,
  linkedin_url        text,
  -- Current role
  company             text,
  company_id          uuid REFERENCES company_directory(id) ON DELETE SET NULL,
  title               text,
  -- Relationship
  relationship_type   text NOT NULL DEFAULT 'weak_tie'
                      CHECK (relationship_type IN (
                        'close_ally', 'former_colleague', 'industry_peer',
                        'recruiter', 'hiring_manager', 'mentor', 'mentee',
                        'weak_tie', 'target_contact'
                      )),
  relationship_strength integer NOT NULL DEFAULT 3 CHECK (relationship_strength BETWEEN 1 AND 5),
  met_at              text,   -- context: 'Conference X 2024', 'Former coworker at Acme'
  -- Outreach state
  outreach_status     text NOT NULL DEFAULT 'not_started'
                      CHECK (outreach_status IN (
                        'not_started', 'drafted', 'sent', 'replied',
                        'meeting_scheduled', 'meeting_complete', 'referred',
                        'declined', 'dormant'
                      )),
  last_contact_at     timestamptz,
  next_followup_at    timestamptz,
  -- Notes and tags
  notes               text,
  tags                text[] NOT NULL DEFAULT '{}',
  -- Referral potential for specific applications
  can_refer_at        uuid[],  -- array of company_directory IDs
  -- Outreach history: [{date, type, summary, outcome}]
  outreach_history    jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_networking_contacts_user ON networking_contacts(user_id);
CREATE INDEX idx_networking_contacts_user_status
  ON networking_contacts(user_id, outreach_status);
CREATE INDEX idx_networking_contacts_followup
  ON networking_contacts(user_id, next_followup_at)
  WHERE next_followup_at IS NOT NULL;
CREATE INDEX idx_networking_contacts_company
  ON networking_contacts(company_id)
  WHERE company_id IS NOT NULL;
CREATE INDEX idx_networking_contacts_tags
  ON networking_contacts USING GIN(tags);

-- Add FK from application_pipeline to networking_contacts
-- (deferred because networking_contacts didn't exist in 014)
ALTER TABLE application_pipeline
  ADD COLUMN IF NOT EXISTS primary_contact_id uuid
  REFERENCES networking_contacts(id) ON DELETE SET NULL;

-- ── Offer Negotiations ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offer_negotiations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_application_id  uuid REFERENCES job_applications(id) ON DELETE SET NULL,
  -- Offer details (T2: Career/Professional data)
  company             text NOT NULL,
  title               text NOT NULL,
  offer_date          date,
  deadline_date       date,
  -- Compensation components (stored as structured JSONB, not raw numbers)
  -- FORMAT: { base: number, currency: string, bonus_target_pct: number,
  --           equity_value: number, equity_type: string, equity_vest_years: number,
  --           sign_on: number, benefits_value_est: number, other: [{label, value}] }
  offer_package       jsonb NOT NULL DEFAULT '{}',
  -- Market comparison (from salary negotiation agent)
  market_data         jsonb NOT NULL DEFAULT '{}',
  target_package      jsonb NOT NULL DEFAULT '{}',
  -- Strategy
  negotiation_strategy text,
  talking_points      jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Outcome
  status              text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'accepted', 'declined', 'countered', 'expired')),
  final_package       jsonb NOT NULL DEFAULT '{}',
  outcome_notes       text,
  outcome_date        date,
  -- Negotiation round log: [{date, type: 'counter'|'accept'|'reject', summary}]
  negotiation_log     jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_offer_negotiations_user ON offer_negotiations(user_id);
CREATE INDEX idx_offer_negotiations_user_status
  ON offer_negotiations(user_id, status);
CREATE INDEX idx_offer_negotiations_job_app
  ON offer_negotiations(job_application_id)
  WHERE job_application_id IS NOT NULL;

COMMIT;
```

### Phase 4: LinkedIn Content (Migration 016)

```sql
-- ============================================================
-- Migration 016: LinkedIn Content Store
-- Stores approved LinkedIn posts, profile sections, and
-- connection outreach messages generated by agent pipeline.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS linkedin_content (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_type    text NOT NULL CHECK (content_type IN (
                    'post', 'headline', 'about_section',
                    'connection_request', 'follow_up_message',
                    'inmessage', 'comment'
                  )),
  content         text NOT NULL,
  target_contact_id uuid REFERENCES networking_contacts(id) ON DELETE SET NULL,
  -- Approval / publish state
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'approved', 'published', 'archived')),
  published_at    timestamptz,
  -- Performance (populated from LinkedIn API or manual entry)
  impressions     integer,
  reactions       integer,
  comments        integer,
  reposts         integer,
  -- Generation context
  generated_by    text,   -- agent slug
  generation_prompt text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_linkedin_content_user ON linkedin_content(user_id);
CREATE INDEX idx_linkedin_content_user_type ON linkedin_content(user_id, content_type);
CREATE INDEX idx_linkedin_content_user_status ON linkedin_content(user_id, status);

ALTER TABLE linkedin_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own linkedin content"
  ON linkedin_content FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMIT;
```

### Phase 5: Financial Wellness — HIGHLY SENSITIVE (Migration 017)

```sql
-- ============================================================
-- Migration 017: Financial Wellness Tables
-- ALL tables prefixed fin_ to enable blanket-deny policies.
-- HIGHLY SENSITIVE: T3 data. No career agent reads these tables.
-- Financial planners access ONLY through fin_planner_access view
-- for opted-in users (consent stored in fin_consent).
--
-- CRITICAL CONSTRAINTS:
-- 1. NO account numbers, SSNs, or full financial statements
-- 2. NO FKs from fin_ tables to resume/career tables
-- 3. Planner RLS uses a helper function, not direct auth.uid()
-- 4. All writes from server-side only (service role key)
-- ============================================================
BEGIN;

-- ── Consent Bridge ────────────────────────────────────────────
-- Users must explicitly opt in before any planner can see their data.
-- This is the ONLY bridge between career identity and financial data.

CREATE TABLE IF NOT EXISTS fin_consent (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  planner_id          uuid,       -- NULL = consented to platform-wide financial features
  consent_type        text NOT NULL CHECK (consent_type IN (
                        'platform_financial', 'planner_referral', 'data_sharing'
                      )),
  consented_at        timestamptz NOT NULL DEFAULT now(),
  revoked_at          timestamptz,
  consent_text_hash   text NOT NULL,  -- SHA256 of consent copy shown to user
  ip_address          inet,
  user_agent          text,
  UNIQUE(user_id, planner_id, consent_type)
);

CREATE INDEX idx_fin_consent_user ON fin_consent(user_id);
CREATE INDEX idx_fin_consent_planner
  ON fin_consent(planner_id) WHERE planner_id IS NOT NULL;
CREATE INDEX idx_fin_consent_active
  ON fin_consent(user_id) WHERE revoked_at IS NULL;

-- ── Financial Planners Directory ──────────────────────────────
CREATE TABLE IF NOT EXISTS fin_planners (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  firm                text,
  email               text NOT NULL UNIQUE,
  phone               text,
  license_number      text,
  license_type        text,    -- 'CFP', 'CFA', 'RIA', etc.
  license_verified_at timestamptz,
  states_licensed     text[] NOT NULL DEFAULT '{}',
  specializations     text[] NOT NULL DEFAULT '{}',
  -- Partnership
  partner_tier        text NOT NULL DEFAULT 'standard'
                      CHECK (partner_tier IN ('standard', 'preferred', 'elite')),
  commission_rate     numeric NOT NULL DEFAULT 0.20,
  -- Auth link: the planner's Supabase auth user for portal login
  auth_user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active           boolean NOT NULL DEFAULT true,
  profile_url         text,
  calendar_url        text,
  bio                 text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fin_planners_auth_user ON fin_planners(auth_user_id)
  WHERE auth_user_id IS NOT NULL;
CREATE INDEX idx_fin_planners_states
  ON fin_planners USING GIN(states_licensed);

-- ── Retirement Assessments ────────────────────────────────────
-- Questionnaire responses and gap analysis.
-- NEVER store: account numbers, SSNs, full portfolio details.
-- Store: ranges, estimates, percentages.

CREATE TABLE IF NOT EXISTS fin_retirement_assessments (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version                 integer NOT NULL DEFAULT 1,
  -- Demographics (no DOB — use age_range)
  age_range               text CHECK (age_range IN (
                            '25-34', '35-44', '45-54', '55-64', '65+'
                          )),
  years_to_retirement     integer,
  -- Current savings (ranges, not exact figures)
  -- FORMAT: { range: '500k-1m', currency: 'USD' }
  current_savings_range   jsonb NOT NULL DEFAULT '{}',
  monthly_contribution    jsonb NOT NULL DEFAULT '{}',  -- { range: '1k-2k' }
  -- Retirement targets
  target_monthly_income   jsonb NOT NULL DEFAULT '{}',  -- { range: '5k-8k' }
  retirement_age_target   integer,
  -- Gap analysis (computed by agent)
  gap_analysis            jsonb NOT NULL DEFAULT '{}',
  -- FORMAT: { gap_estimate: 'moderate'|'significant'|'critical',
  --           monthly_shortfall_range: '2k-4k',
  --           years_of_runway: number,
  --           recommendations: [string] }
  -- Questionnaire raw responses
  questionnaire_responses jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Matched planner recommendation
  recommended_planner_id  uuid REFERENCES fin_planners(id) ON DELETE SET NULL,
  -- Assessment state
  status                  text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'complete', 'reviewed_by_planner')),
  completed_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fin_retirement_user ON fin_retirement_assessments(user_id);
CREATE INDEX idx_fin_retirement_user_status
  ON fin_retirement_assessments(user_id, status);

-- ── Financial Planner Referrals ───────────────────────────────
CREATE TABLE IF NOT EXISTS fin_planner_referrals (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  planner_id              uuid NOT NULL REFERENCES fin_planners(id) ON DELETE RESTRICT,
  assessment_id           uuid REFERENCES fin_retirement_assessments(id) ON DELETE SET NULL,
  -- Referral lifecycle
  status                  text NOT NULL DEFAULT 'pending'
                          CHECK (status IN (
                            'pending', 'contacted', 'meeting_scheduled',
                            'meeting_complete', 'engaged', 'declined', 'lost'
                          )),
  referred_at             timestamptz NOT NULL DEFAULT now(),
  contacted_at            timestamptz,
  meeting_at              timestamptz,
  outcome_at              timestamptz,
  -- Commission tracking (platform financial data)
  commission_eligible     boolean NOT NULL DEFAULT false,
  commission_amount       numeric,
  commission_paid_at      timestamptz,
  -- Notes (planner-facing, not user-facing)
  planner_notes           text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fin_referrals_user ON fin_planner_referrals(user_id);
CREATE INDEX idx_fin_referrals_planner ON fin_planner_referrals(planner_id);
CREATE INDEX idx_fin_referrals_status ON fin_planner_referrals(planner_id, status);

-- ── Wellness Assessments ──────────────────────────────────────
-- Emotional / wellbeing state — most sensitive data on the platform.
-- Never exposed to planners, never to B2B admins.

CREATE TABLE IF NOT EXISTS fin_wellness_assessments (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Questionnaire answers (anonymized labels, not raw text)
  stress_level            integer CHECK (stress_level BETWEEN 1 AND 10),
  career_confidence       integer CHECK (career_confidence BETWEEN 1 AND 10),
  financial_anxiety       integer CHECK (financial_anxiety BETWEEN 1 AND 10),
  -- Flagging
  escalation_flag         boolean NOT NULL DEFAULT false,
  escalation_reason       text,   -- agent-detected concern category
  intervention_shown      boolean NOT NULL DEFAULT false,
  intervention_type       text,
  -- Full questionnaire in JSONB (keys are question codes, not labels)
  questionnaire_responses jsonb NOT NULL DEFAULT '{}',
  created_at              timestamptz NOT NULL DEFAULT now()
  -- NOTE: No updated_at — wellness snapshots are immutable
);

-- Wellness assessments: newest per user for dashboard
CREATE INDEX idx_fin_wellness_user_created
  ON fin_wellness_assessments(user_id, created_at DESC);

-- ── RLS: Financial Tables ─────────────────────────────────────
-- Helper function: is the calling user a verified financial planner?
-- Returns the planner record or NULL.
CREATE OR REPLACE FUNCTION current_planner_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT id FROM fin_planners
  WHERE auth_user_id = auth.uid()
    AND is_active = true
  LIMIT 1;
$$;

-- Helper: does the planner have consent from this user?
CREATE OR REPLACE FUNCTION planner_has_consent(p_user_id uuid, p_planner_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM fin_consent
    WHERE user_id = p_user_id
      AND (planner_id = p_planner_id OR planner_id IS NULL)
      AND consent_type IN ('planner_referral', 'data_sharing')
      AND revoked_at IS NULL
  );
$$;

-- fin_consent: users manage their own consent
ALTER TABLE fin_consent ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own consent"
  ON fin_consent FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- fin_planners: planners read own record; public can read directory
ALTER TABLE fin_planners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Planners read own record"
  ON fin_planners FOR SELECT
  USING (auth_user_id = auth.uid());
CREATE POLICY "Public can read active planner directory"
  ON fin_planners FOR SELECT
  USING (is_active = true);

-- fin_retirement_assessments:
--   users own their data
--   planners can read data for opted-in users
ALTER TABLE fin_retirement_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own assessments"
  ON fin_retirement_assessments FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Planners read consented assessments"
  ON fin_retirement_assessments FOR SELECT
  USING (
    current_planner_id() IS NOT NULL
    AND planner_has_consent(user_id, current_planner_id())
  );

-- fin_planner_referrals:
--   users read their own referrals
--   planners read their own pipeline
ALTER TABLE fin_planner_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own referrals"
  ON fin_planner_referrals FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Planners manage their referrals"
  ON fin_planner_referrals FOR ALL
  USING (planner_id = current_planner_id());

-- fin_wellness_assessments: STRICTLY user-only. No planner access.
ALTER TABLE fin_wellness_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own wellness"
  ON fin_wellness_assessments FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
-- Explicit deny for planners (defense in depth):
-- Since current_planner_id() would return a non-null for a planner's uid,
-- and the user policy only matches user_id = auth.uid(),
-- a planner's auth.uid() will never match a user's user_id.
-- No additional policy needed — the default-deny RLS is sufficient.

COMMIT;
```

### Phase 6: B2B Enterprise Multi-Tenancy (Migration 018)

```sql
-- ============================================================
-- Migration 018: B2B Enterprise Multi-Tenancy
-- Organizations, contracts, cohorts, reporting.
-- Org isolation enforced via RLS helper functions.
-- ============================================================
BEGIN;

-- ── Organizations ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS b2b_organizations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  slug                text NOT NULL UNIQUE,  -- URL-safe, used in tenant routing
  domain              text,                  -- for SSO: email domain match
  logo_url            text,
  -- White-label config
  brand_color         text,
  custom_domain       text,
  white_label_enabled boolean NOT NULL DEFAULT false,
  -- SSO config (JSONB to support SAML, OIDC, or social provider)
  sso_config          jsonb NOT NULL DEFAULT '{}',
  sso_enabled         boolean NOT NULL DEFAULT false,
  -- Account health
  is_active           boolean NOT NULL DEFAULT true,
  suspended_at        timestamptz,
  suspension_reason   text,
  -- Billing
  billing_email       text,
  billing_contact     text,
  -- Soft delete
  deleted_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_b2b_orgs_slug ON b2b_organizations(slug);
CREATE INDEX idx_b2b_orgs_domain
  ON b2b_organizations(domain) WHERE domain IS NOT NULL;

-- ── B2B Contracts ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS b2b_contracts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES b2b_organizations(id) ON DELETE RESTRICT,
  -- Seat management
  seat_count          integer NOT NULL DEFAULT 10,
  seats_used          integer NOT NULL DEFAULT 0,
  -- Pricing
  contract_type       text NOT NULL DEFAULT 'annual'
                      CHECK (contract_type IN ('monthly', 'annual', 'multi_year')),
  price_per_seat_cents integer NOT NULL,
  annual_value_cents  integer NOT NULL,
  -- Dates
  start_date          date NOT NULL,
  end_date            date NOT NULL,
  auto_renew          boolean NOT NULL DEFAULT true,
  -- Stripe
  stripe_subscription_id text,
  -- SLA
  sla_tier            text NOT NULL DEFAULT 'standard'
                      CHECK (sla_tier IN ('standard', 'premium', 'enterprise')),
  uptime_commitment   numeric,     -- e.g. 99.9
  support_response_hours integer,  -- e.g. 4 for 4-hour SLA
  -- Features
  feature_overrides   jsonb NOT NULL DEFAULT '{}',
  -- Contract document
  contract_url        text,
  signed_at           timestamptz,
  signed_by           text,
  -- Status
  status              text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('draft', 'active', 'expired', 'cancelled')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_b2b_contracts_org ON b2b_contracts(org_id);
CREATE INDEX idx_b2b_contracts_status ON b2b_contracts(org_id, status);

-- ── Employee Cohorts ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS b2b_employee_cohorts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES b2b_organizations(id) ON DELETE CASCADE,
  name                text NOT NULL,
  description         text,
  -- Cohort membership: array of user_ids
  member_user_ids     uuid[] NOT NULL DEFAULT '{}',
  -- Program configuration
  program_type        text,    -- e.g. 'outplacement', 'career_development', 'upskilling'
  agent_access        text[],  -- which agent slugs are enabled for this cohort
  -- Outcomes tracking
  target_placement_date date,
  completion_criteria jsonb NOT NULL DEFAULT '{}',
  -- Aggregate outcomes (computed, not real-time)
  outcomes_summary    jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_b2b_cohorts_org ON b2b_employee_cohorts(org_id);
CREATE INDEX idx_b2b_cohorts_members ON b2b_employee_cohorts USING GIN(member_user_ids);

-- ── Outcome Reports ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS b2b_outcome_reports (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES b2b_organizations(id) ON DELETE CASCADE,
  cohort_id           uuid REFERENCES b2b_employee_cohorts(id) ON DELETE SET NULL,
  report_type         text NOT NULL CHECK (report_type IN (
                        'monthly_summary', 'cohort_outcomes', 'agent_usage',
                        'placement_report', 'roi_analysis'
                      )),
  period_start        date NOT NULL,
  period_end          date NOT NULL,
  -- Report data — anonymized aggregate, never individual PII
  report_data         jsonb NOT NULL DEFAULT '{}',
  -- FORMAT: { total_users: N, active_users: N, agent_usage: {slug: count},
  --           placements: N, avg_time_to_placement_days: N, salary_uplift_pct: N }
  generated_at        timestamptz NOT NULL DEFAULT now(),
  generated_by        text,    -- 'scheduled' | 'manual'
  recipient_emails    text[]   -- auto-sent to these addresses
);

CREATE INDEX idx_b2b_reports_org ON b2b_outcome_reports(org_id);
CREATE INDEX idx_b2b_reports_org_period ON b2b_outcome_reports(org_id, period_start DESC);

-- ── Add org_id FK to profiles (from Migration 013's placeholder) ──
ALTER TABLE profiles
  ADD CONSTRAINT profiles_org_id_fk
  FOREIGN KEY (org_id) REFERENCES b2b_organizations(id) ON DELETE SET NULL;

-- ── RLS Helper Functions ──────────────────────────────────────
-- Returns the org_id for the current user (NULL if not B2B)
CREATE OR REPLACE FUNCTION current_user_org_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT org_id FROM profiles WHERE id = auth.uid();
$$;

-- Returns true if the current user is an org admin for the given org
CREATE OR REPLACE FUNCTION is_org_admin(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND org_id = p_org_id
      AND org_role IN ('admin', 'owner')
  );
$$;

-- ── B2B RLS Policies ──────────────────────────────────────────
ALTER TABLE b2b_organizations ENABLE ROW LEVEL SECURITY;
-- Members see their own org; admins see full record
CREATE POLICY "Org members read their org"
  ON b2b_organizations FOR SELECT
  USING (id = current_user_org_id());

ALTER TABLE b2b_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org admins read contracts"
  ON b2b_contracts FOR SELECT
  USING (is_org_admin(org_id));

ALTER TABLE b2b_employee_cohorts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org admins manage cohorts"
  ON b2b_employee_cohorts FOR ALL
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));
CREATE POLICY "Members read their cohorts"
  ON b2b_employee_cohorts FOR SELECT
  USING (auth.uid() = ANY(member_user_ids));

ALTER TABLE b2b_outcome_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org admins read reports"
  ON b2b_outcome_reports FOR SELECT
  USING (is_org_admin(org_id));

-- ── RLS Extension: Org Admin Access to User Data ─────────────
-- B2B admins need READ-ONLY visibility into their org users' agent reports
-- and session counts (for outcome reporting). NOT career content.
-- Implemented as a SEPARATE policy added to agent_reports.

CREATE POLICY "Org admins read org user reports"
  ON agent_reports FOR SELECT
  USING (
    org_id = current_user_org_id()
    AND is_org_admin(current_user_org_id())
  );

COMMIT;
```

### Phase 7: Audit, Compliance & Platform Infrastructure (Migration 019)

```sql
-- ============================================================
-- Migration 019: Audit Logging, Partitioned Message Store,
--                Data Retention, Platform Analytics
-- ============================================================
BEGIN;

-- ── Audit Log ────────────────────────────────────────────────
-- Immutable append-only audit trail for all sensitive operations.
-- Written by triggers and application code.
-- Never deleted — archived to cold storage after 12 months.

CREATE TABLE IF NOT EXISTS audit_log (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Who
  actor_id        uuid,           -- auth.uid() or NULL for system
  actor_type      text NOT NULL   -- 'user', 'planner', 'org_admin', 'system', 'service_role'
                  CHECK (actor_type IN ('user', 'planner', 'org_admin', 'system', 'service_role')),
  impersonated_by uuid,           -- if admin is acting on behalf of a user
  -- What
  action          text NOT NULL,  -- 'read', 'insert', 'update', 'delete', 'export', 'login', 'consent'
  resource_type   text NOT NULL,  -- table name or logical resource
  resource_id     text,           -- stringified UUID of affected row
  -- Change detail (for update/delete)
  old_values      jsonb,
  new_values      jsonb,
  changed_fields  text[],
  -- Context
  ip_address      inet,
  user_agent      text,
  request_id      text,
  session_id      text,
  -- Classification
  data_tier       integer NOT NULL DEFAULT 2 CHECK (data_tier BETWEEN 1 AND 4),
  -- Timestamp (partition key)
  created_at      timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Create monthly partitions (create 2 years ahead in practice)
CREATE TABLE audit_log_2026_01 PARTITION OF audit_log
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE audit_log_2026_02 PARTITION OF audit_log
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE audit_log_2026_03 PARTITION OF audit_log
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
-- ... continue monthly through 2027-12

CREATE INDEX idx_audit_log_actor ON audit_log(actor_id, created_at DESC);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id, created_at DESC);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);

-- Audit log is append-only: no RLS UPDATE/DELETE
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
-- Service role only writes; no user can read their own audit log
-- (audit data is operational, not end-user data)
CREATE POLICY "Service role only audit log"
  ON audit_log FOR ALL USING (false);

-- ── Session Messages: Partitioned ────────────────────────────
-- The existing coach_sessions.messages JSONB column grows unbounded.
-- At scale (10M+ messages), partition by month.
-- Migration strategy: new sessions write here; old sessions keep JSONB.

CREATE TABLE IF NOT EXISTS session_messages (
  id              uuid DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES coach_sessions(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Anthropic MessageParam format
  role            text NOT NULL CHECK (role IN ('user', 'assistant')),
  content         jsonb NOT NULL,    -- content blocks array
  -- Token accounting
  input_tokens    integer,
  output_tokens   integer,
  -- Ordering
  sequence_num    integer NOT NULL,
  -- Partition key
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE session_messages_2026_03 PARTITION OF session_messages
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE session_messages_2026_04 PARTITION OF session_messages
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
-- ... continue monthly

CREATE INDEX idx_session_messages_session
  ON session_messages(session_id, sequence_num);
CREATE INDEX idx_session_messages_user
  ON session_messages(user_id, created_at DESC);

ALTER TABLE session_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own messages"
  ON session_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own messages"
  ON session_messages FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ── Data Retention Policy Registry ───────────────────────────
CREATE TABLE IF NOT EXISTS data_retention_policies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name      text NOT NULL UNIQUE,
  data_tier       integer NOT NULL CHECK (data_tier BETWEEN 1 AND 4),
  retention_days  integer NOT NULL,
  anonymize_after_days integer,   -- NULL = delete, not anonymize
  archive_after_days   integer,   -- NULL = delete, not archive
  last_sweep_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Seed retention policies per data classification
INSERT INTO data_retention_policies
  (table_name, data_tier, retention_days, anonymize_after_days, archive_after_days)
VALUES
  ('profiles',                    1, 395,  NULL, NULL),
  ('master_resumes',              2, 455,  NULL, 365),
  ('coach_sessions',              2, 455,  NULL, 365),
  ('session_messages',            2, 455,  NULL, 365),
  ('job_applications',            2, 455,  NULL, 365),
  ('fin_retirement_assessments',  3, 395,  NULL, NULL),
  ('fin_wellness_assessments',    3, 395,  NULL, NULL),
  ('fin_planner_referrals',       3, 395,  NULL, NULL),
  ('audit_log',                   4, 730,  NULL, 365),
  ('scrape_log',                  4, 365, 365,  NULL),
  ('agent_reports',               4, 365, 365,  NULL)
ON CONFLICT (table_name) DO NOTHING;

-- ── GDPR Deletion Queue ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS gdpr_deletion_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL,  -- not FK: user may already be deleted
  requester_email     text NOT NULL,
  request_type        text NOT NULL CHECK (request_type IN ('deletion', 'export', 'rectification')),
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  -- Deletion progress: tables completed
  tables_cleared      text[] NOT NULL DEFAULT '{}',
  -- Export package URL (for export requests)
  export_url          text,
  export_expires_at   timestamptz,
  -- Timeline
  requested_at        timestamptz NOT NULL DEFAULT now(),
  deadline_at         timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  completed_at        timestamptz,
  error_message       text,
  -- Compliance audit
  legal_hold          boolean NOT NULL DEFAULT false,
  legal_hold_reason   text
);

CREATE INDEX idx_gdpr_requests_user ON gdpr_deletion_requests(user_id);
CREATE INDEX idx_gdpr_requests_status ON gdpr_deletion_requests(status)
  WHERE status IN ('pending', 'processing');

ALTER TABLE gdpr_deletion_requests ENABLE ROW LEVEL SECURITY;
-- Service role only — users request deletion through the app route,
-- which inserts via service role
CREATE POLICY "Service role only gdpr"
  ON gdpr_deletion_requests FOR ALL USING (false);

-- ── Platform Usage Events (T4 Behavioral) ────────────────────
-- High-volume, anonymized after 12 months.
-- Partitioned by month for efficient archival.

CREATE TABLE IF NOT EXISTS platform_events (
  id              uuid DEFAULT gen_random_uuid(),
  user_id         uuid,            -- NULL for pre-auth events
  session_id      uuid,            -- coach_session or browser session
  event_name      text NOT NULL,   -- 'agent_started', 'section_approved', etc.
  agent_slug      text,
  properties      jsonb NOT NULL DEFAULT '{}',
  -- Anonymization: set user_id to NULL after 12 months
  anonymized_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE platform_events_2026_03 PARTITION OF platform_events
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
-- ... continue monthly

CREATE INDEX idx_platform_events_user
  ON platform_events(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
CREATE INDEX idx_platform_events_name_created
  ON platform_events(event_name, created_at DESC);

ALTER TABLE platform_events ENABLE ROW LEVEL SECURITY;
-- Write via service role only; users never query this table directly
CREATE POLICY "Service role only events"
  ON platform_events FOR ALL USING (false);

-- ── Dashboard Materialized Views ──────────────────────────────
-- Pre-computed for O(1) dashboard queries.
-- Refreshed by pg_cron or application scheduler.

-- User activity summary (refreshed hourly)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_user_activity_summary AS
SELECT
  u.user_id,
  COUNT(DISTINCT cs.id)                                     AS total_sessions,
  COUNT(DISTINCT cs.id) FILTER (WHERE cs.status = 'active') AS active_sessions,
  COUNT(DISTINCT ar.id)                                     AS total_reports,
  COUNT(DISTINCT ja.id)                                     AS total_applications,
  MAX(cs.updated_at)                                        AS last_session_at,
  SUM(cs.total_tokens_used)                                 AS total_tokens
FROM user_usage u
LEFT JOIN coach_sessions cs ON cs.user_id = u.user_id
LEFT JOIN agent_reports ar ON ar.user_id = u.user_id
LEFT JOIN job_applications ja ON ja.user_id = u.user_id
GROUP BY u.user_id;

CREATE UNIQUE INDEX idx_mv_user_activity_user
  ON mv_user_activity_summary(user_id);

-- B2B org dashboard (refreshed daily)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_org_usage_summary AS
SELECT
  p.org_id,
  COUNT(DISTINCT p.id)                                      AS total_members,
  COUNT(DISTINCT cs.id)                                     AS total_sessions,
  COUNT(DISTINCT ar.id)                                     AS total_reports,
  AVG(ar.quality_score) FILTER (WHERE ar.quality_score IS NOT NULL) AS avg_quality_score,
  MAX(cs.updated_at)                                        AS last_activity_at
FROM profiles p
LEFT JOIN coach_sessions cs ON cs.user_id = p.id
LEFT JOIN agent_reports ar ON ar.user_id = p.id
WHERE p.org_id IS NOT NULL
GROUP BY p.org_id;

CREATE UNIQUE INDEX idx_mv_org_usage_org ON mv_org_usage_summary(org_id);

COMMIT;
```

---

## 4. RLS Policy Matrix

Complete policy definitions for every table. "Service role bypass" means the app's `supabaseAdmin` client (service role key) bypasses all RLS — these policies only restrict the public/authenticated Supabase client.

### Core Career Tables

| Table | SELECT | INSERT | UPDATE | DELETE | Notes |
|-------|--------|--------|--------|--------|-------|
| `profiles` | `auth.uid() = id` | `auth.uid() = id` | `auth.uid() = id` | Soft delete only | |
| `master_resumes` | own | own | own | own | B2B admin: read-only via org check |
| `job_applications` | own | own | own | own | |
| `coach_sessions` | own | own | own | own | |
| `session_messages` | own | own | — | — | Append-only |
| `user_positioning_profiles` | own | own | own | own | |
| `user_platform_context` | own | own | own | own | |
| `why_me_stories` | own | own | own | — | |
| `master_resume_history` | via master_resumes subquery | service role | — | — | |
| `session_workflow_nodes` | own via session | service role | service role | service role | |
| `session_workflow_artifacts` | own via session | service role | — | — | Append-only |
| `session_question_responses` | own via session | service role | service role | — | |

### Network Intelligence Tables

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `company_directory` | public | service role | service role | service role |
| `referral_bonus_programs` | public | service role | service role | service role |
| `client_connections` | own | own | own | own |
| `client_target_titles` | own | own | own | own |
| `job_matches` | own | own | own | own |
| `scrape_log` | own | own | — | — |

### Agent Output Tables

All agent report tables follow the same pattern:

```sql
-- Template for all *_reports tables
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own" ON {table} FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own" ON {table} FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own" ON {table} FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own" ON {table} FOR DELETE USING (auth.uid() = user_id);
-- B2B org admin: read-only aggregate (via agent_reports registry, not individual tables)
```

### Phase 3 Tables (Interview, Networking, Offers)

| Table | User Policy | Special |
|-------|------------|---------|
| `interview_sessions` | Full CRUD own | |
| `networking_contacts` | Full CRUD own | |
| `application_pipeline` | Full CRUD own | |
| `offer_negotiations` | Full CRUD own | |
| `linkedin_profiles` | Full CRUD own | |
| `linkedin_content` | Full CRUD own | |
| `boolean_searches` | Full CRUD own | |
| `content_posts` | Full CRUD own | |

### Financial Tables (HIGHLY SENSITIVE)

| Table | User | Financial Planner | B2B Admin | Notes |
|-------|------|-------------------|-----------|-------|
| `fin_consent` | Full CRUD own | — | — | Bridge table |
| `fin_planners` | Read own if planner | Read own record | — | Public directory read |
| `fin_retirement_assessments` | Full CRUD own | Read if consented | — | |
| `fin_planner_referrals` | Read own | Full CRUD their pipeline | — | |
| `fin_wellness_assessments` | Full CRUD own | DENIED | DENIED | |

### B2B Tables

| Table | Member | Org Admin | Notes |
|-------|--------|-----------|-------|
| `b2b_organizations` | Read own org | Read own org | Write: service role |
| `b2b_contracts` | — | Read own | Write: service role |
| `b2b_employee_cohorts` | Read if in member_user_ids | Full CRUD | |
| `b2b_outcome_reports` | — | Read own | Write: service role |

### Platform Infrastructure Tables

| Table | Policy |
|-------|--------|
| `audit_log` | Service role only (no user access) |
| `gdpr_deletion_requests` | Service role only |
| `platform_events` | Service role only |
| `data_retention_policies` | Service role only |
| `affiliates` | Service role only |
| `referral_events` | Service role only |

---

## 5. Migration Sequence

Ordered migrations from current state. Each migration is non-breaking and can be rolled back independently.

```
CURRENT STATE (migrations 001-012, 20260217-20260307)
       |
       v
013_profiles_and_positioning_expansion.sql
       -- profiles table, user_positioning_profiles columns
       -- Dependency: 012 (user_positioning_profiles)
       |
       v
014_agent_reports_registry_and_missing_agents.sql
       -- agent_reports, linkedin_profiles, boolean_searches,
       -- application_pipeline, content_posts
       -- Dependency: 001 (job_applications), 20260303 (company_directory)
       |
       v
015_interview_networking_offers.sql
       -- interview_sessions, networking_contacts, offer_negotiations
       -- application_pipeline FK to networking_contacts
       -- Dependency: 014 (application_pipeline, client_connections)
       |
       v
016_linkedin_content.sql
       -- linkedin_content
       -- Dependency: 015 (networking_contacts)
       |
       v
017_financial_wellness.sql
       -- fin_consent, fin_planners, fin_retirement_assessments,
       -- fin_planner_referrals, fin_wellness_assessments
       -- RLS helper functions
       -- Dependency: 001 (auth.users), no career table FKs
       |
       v
018_b2b_enterprise.sql
       -- b2b_organizations, b2b_contracts, b2b_employee_cohorts,
       -- b2b_outcome_reports
       -- profiles.org_id FK, RLS helper functions
       -- agent_reports org admin policy
       -- Dependency: 013 (profiles), 014 (agent_reports)
       |
       v
019_audit_compliance_infrastructure.sql
       -- audit_log (partitioned), session_messages (partitioned),
       -- data_retention_policies, gdpr_deletion_requests,
       -- platform_events (partitioned)
       -- Materialized views
       -- Dependency: all prior migrations
       |
       v
020_performance_indexes.sql
       -- Additional composite indexes, GIN indexes on JSONB
       -- Dependency: all prior migrations
       |
       v
021_partition_maintenance_setup.sql
       -- pg_cron jobs for partition creation, archival sweeps,
       -- materialized view refresh
       -- Dependency: 019
```

---

## 6. Cross-Agent Data Flow

How `user_positioning_profiles` and `user_platform_context` get enriched by each agent group.

### Read/Write Map by Agent

| Agent # | Agent Name | Reads | Writes |
|---------|-----------|-------|--------|
| 1 | Resume Strategist | `master_resumes`, `job_applications` | `user_positioning_profiles`, `user_platform_context`, `coach_sessions` |
| 2 | Resume Craftsman | `user_positioning_profiles`, `coach_sessions` | `session_workflow_artifacts`, `master_resume_history` |
| 3 | Resume Producer | `coach_sessions`, `session_workflow_artifacts` | `master_resumes`, `agent_reports` |
| 4 | LinkedIn Optimizer | `user_positioning_profiles`, `master_resumes` | `linkedin_profiles`, `linkedin_optimization_reports`, `agent_reports` |
| 5 | Job Discovery | `user_positioning_profiles`, `client_connections`, `client_target_titles`, `company_directory` | `job_matches`, `boolean_searches`, `agent_reports` |
| 6 | Content Calendar | `user_positioning_profiles`, `why_me_stories` | `content_calendar_reports`, `content_posts`, `agent_reports` |
| 7 | Networking Outreach | `client_connections`, `job_matches`, `user_positioning_profiles` | `networking_contacts`, `networking_outreach_reports`, `agent_reports` |
| 8 | Application Tracker | `job_applications`, `application_pipeline` | `application_pipeline`, `job_tracker_reports`, `agent_reports` |
| 9 | Salary Negotiation | `offer_negotiations`, `user_positioning_profiles` | `offer_negotiations`, `salary_negotiation_reports`, `agent_reports` |
| 10 | Interview Prep | `job_applications`, `user_positioning_profiles`, `master_resumes` | `interview_prep_reports`, `interview_sessions`, `agent_reports` |
| 11 | Executive Bio | `user_positioning_profiles`, `master_resumes`, `why_me_stories` | `executive_bio_reports`, `agent_reports` |
| 12 | Case Study Builder | `user_positioning_profiles`, `master_resumes` | `case_study_reports`, `agent_reports` |
| 13 | Thank You Note | `networking_contacts`, `interview_sessions` | `thank_you_note_reports`, `linkedin_content`, `agent_reports` |
| 14 | Personal Brand Audit | `user_positioning_profiles`, `linkedin_profiles`, `why_me_stories` | `personal_brand_reports`, `agent_reports` |
| 15 | 90-Day Plan | `user_positioning_profiles`, `offer_negotiations` | `ninety_day_plan_reports`, `agent_reports` |
| 16-20 | Platform Intelligence Agents | `user_platform_context`, `agent_reports` (aggregate) | `user_platform_context`, `user_positioning_profiles` |
| 21-25 | B2B Cohort Agents | `b2b_employee_cohorts`, `agent_reports` (org-scoped) | `b2b_outcome_reports` |
| 26-30 | Financial Wellness Agents | `fin_consent`, `fin_retirement_assessments` | `fin_planner_referrals`, `fin_wellness_assessments` |
| 31-33 | Admin/Analytics Agents | `platform_events` (anonymized), `mv_org_usage_summary` | `b2b_outcome_reports`, `data_retention_policies` |

### Positioning Profile Enrichment Pipeline

```
Resume Strategist (Agent 1)
  └─ WRITES initial: career_narrative, positioning_angle,
                     key_accomplishments, target_roles

Personal Brand Audit (Agent 14)
  └─ ENRICHES: leadership_style, industry_expertise,
               age_positioning_notes

LinkedIn Optimizer (Agent 4)
  └─ ENRICHES: skills_matrix (from profile skills)

Interview Prep (Agent 10)
  └─ ENRICHES: key_accomplishments (STAR evidence added)

90-Day Plan (Agent 15)
  └─ READS: target_roles, career_narrative
  └─ WRITES: enrichment_log entry

user_platform_context acts as the cross-product staging table:
  context_type = 'positioning_strategy' ← Agent 1 output summary
  context_type = 'evidence_item'        ← Interview evidence items
  context_type = 'career_narrative'     ← Narrative variants
  context_type = 'target_role'          ← Role-specific positioning
```

---

## 7. Performance Plan

### Index Strategy

```sql
-- ── Migration 020: Performance Indexes ────────────────────────
BEGIN;

-- Composite indexes for most common query patterns
CREATE INDEX IF NOT EXISTS idx_coach_sessions_user_status
  ON coach_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_coach_sessions_user_created
  ON coach_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coach_sessions_user_updated
  ON coach_sessions(user_id, updated_at DESC);

-- Partial index: active sessions only (small cardinality, hot data)
CREATE INDEX IF NOT EXISTS idx_coach_sessions_active
  ON coach_sessions(user_id, updated_at DESC)
  WHERE status = 'active';

-- GIN indexes for JSONB search (only where WHERE clauses use JSONB operators)
CREATE INDEX IF NOT EXISTS idx_master_resumes_skills_gin
  ON master_resumes USING GIN(skills);
CREATE INDEX IF NOT EXISTS idx_master_resumes_experience_gin
  ON master_resumes USING GIN(experience);
CREATE INDEX IF NOT EXISTS idx_user_positioning_profiles_target_roles_gin
  ON user_positioning_profiles USING GIN(target_roles);

-- Job applications: most common access patterns
CREATE INDEX IF NOT EXISTS idx_job_applications_user_status
  ON job_applications(user_id, status);
CREATE INDEX IF NOT EXISTS idx_job_applications_user_created
  ON job_applications(user_id, created_at DESC);

-- Agent reports: cross-agent dashboard queries
CREATE INDEX IF NOT EXISTS idx_agent_reports_user_agent_created
  ON agent_reports(user_id, agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_reports_org_created
  ON agent_reports(org_id, created_at DESC)
  WHERE org_id IS NOT NULL;

-- Networking: contact follow-up queue
CREATE INDEX IF NOT EXISTS idx_networking_due_soon
  ON networking_contacts(user_id, next_followup_at ASC)
  WHERE next_followup_at IS NOT NULL
    AND outreach_status NOT IN ('declined', 'dormant');

-- Application pipeline: kanban view
CREATE INDEX IF NOT EXISTS idx_pipeline_user_active_stages
  ON application_pipeline(user_id, stage, updated_at DESC)
  WHERE stage NOT IN ('archived', 'rejected', 'withdrawn');

-- Financial: planner referral pipeline
CREATE INDEX IF NOT EXISTS idx_fin_referrals_planner_status
  ON fin_planner_referrals(planner_id, status, referred_at DESC);

-- B2B: org member lookup
CREATE INDEX IF NOT EXISTS idx_profiles_org_role
  ON profiles(org_id, org_role)
  WHERE org_id IS NOT NULL;

COMMIT;
```

### Partitioning Strategy

| Table | Strategy | Partition Key | Partition Size | Rationale |
|-------|----------|---------------|----------------|-----------|
| `audit_log` | RANGE by month | `created_at` | 1 month | Archival, compliance |
| `session_messages` | RANGE by month | `created_at` | 1 month | Largest table at scale |
| `platform_events` | RANGE by month | `created_at` | 1 month | High volume, T4 data |

Partition maintenance via `pg_cron` (migration 021):
- Create next 3 months of partitions: runs 1st of each month
- Archive partitions older than retention threshold: runs weekly
- Refresh materialized views: `mv_user_activity_summary` hourly, `mv_org_usage_summary` daily

### Connection Pooling

At 1,000+ concurrent users, configure PgBouncer in **transaction mode**:
- Pool size: `(2 * CPU_cores) + disk_count` per database (typically 20-30 for Supabase)
- Max client connections: 1,000
- Server pool size: 25
- Pool mode: transaction (stateless queries; RLS session-level state is set per transaction)
- Supabase's built-in connection pooler (Supavisor) handles this — no separate PgBouncer needed

### Supabase Realtime Subscriptions

Enable Realtime publication for:
- `session_messages` — live message streaming to frontend
- `job_matches` — new match notifications
- `application_pipeline` — kanban state sync

```sql
-- Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE session_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE job_matches;
ALTER PUBLICATION supabase_realtime ADD TABLE application_pipeline;
```

Note: Realtime + RLS: ensure `replica identity full` is set so RLS can filter broadcasts:
```sql
ALTER TABLE session_messages REPLICA IDENTITY FULL;
ALTER TABLE job_matches REPLICA IDENTITY FULL;
ALTER TABLE application_pipeline REPLICA IDENTITY FULL;
```

### Query Optimization Notes

1. **Never use JSONB operators in WHERE without GIN index.** The `@>` operator on `experience`, `skills`, `target_roles` is O(n) without GIN. GIN indexes are added above.

2. **Avoid N+1 on agent_reports.** The `report_table` + `report_id` pattern means fetching 10 reports requires 10 table lookups. Build a unified view per use case or use the summary `agent_reports` registry directly for list views.

3. **Materialized views for dashboards.** Never compute aggregate counts at query time for dashboards. Use `mv_user_activity_summary` and `mv_org_usage_summary`.

4. **Paginate session_messages.** Never load all messages for a session in one query. Use `LIMIT 50 ORDER BY sequence_num DESC` with cursor-based pagination.

5. **coach_sessions.messages JSONB migration path.** Existing sessions have messages in the JSONB column. New sessions write to `session_messages`. Build a unified accessor function that reads from `session_messages` first, falls back to the JSONB column.

---

## 8. B2B Multi-Tenancy

### Tenant Isolation Model

CareerIQ uses a **shared schema, shared database** multi-tenancy model. Isolation is enforced by:

1. `profiles.org_id` column — every user belongs to at most one org
2. `is_org_admin(org_id)` RLS helper function — governs admin access
3. `agent_reports.org_id` — populated on insert for B2B users, enabling org-scoped reads
4. Service role key — all writes from the server bypass RLS; server code must scope queries explicitly

### Tenant-Scoped Query Pattern (Server Side)

```typescript
// Always scope B2B queries by org_id at the server layer
// Even though RLS enforces this, explicit scoping is defensive

async function getOrgSessions(orgId: string) {
  // Get all user_ids for this org first
  const { data: members } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('org_id', orgId)
    .is('deleted_at', null);

  const memberIds = members?.map(m => m.id) ?? [];

  // Then scope the session query
  return supabaseAdmin
    .from('coach_sessions')
    .select('id, status, created_at, updated_at, total_tokens_used')
    .in('user_id', memberIds)
    .order('created_at', { ascending: false });
}
```

### Org Admin Access Scope

B2B admins can read (never write):
- `agent_reports` — what agents their users have run, quality scores
- `mv_org_usage_summary` — aggregate metrics
- `b2b_outcome_reports` — formal reports
- `b2b_employee_cohorts` — cohort assignments

B2B admins CANNOT read:
- Resume content (`master_resumes`, `coach_sessions` payload)
- Financial data (all `fin_*` tables)
- Individual message history
- Wellness assessments

This is enforced by what policies exist on each table — the admin RLS policies are only added to `agent_reports` and B2B-specific tables, not to `master_resumes` or `coach_sessions`.

### White-Label Routing

```typescript
// Server middleware: resolve org from custom domain
async function resolveOrg(hostname: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('b2b_organizations')
    .select('id, slug, sso_config, sso_enabled')
    .eq('custom_domain', hostname)
    .eq('is_active', true)
    .single();
  return data?.id ?? null;
}
```

---

## 9. Financial Data Isolation

### The Isolation Contract

```
Career Data Zone                    Financial Data Zone
─────────────────                   ─────────────────────
master_resumes                      fin_retirement_assessments
coach_sessions           ←(NO FK)→  fin_wellness_assessments
user_positioning_profiles           fin_planner_referrals
job_applications                    fin_planners
networking_contacts                 fin_consent
                                         │
                              Only bridge: fin_consent.user_id
                              (a UUID — no career data crosses)
```

### Access Path for Financial Planners

A financial planner's auth session can ONLY reach:

1. `fin_planners` — their own record
2. `fin_consent` — check which users have opted in
3. `fin_retirement_assessments` — for opted-in users only
4. `fin_planner_referrals` — their own pipeline

The planner's `auth.uid()` resolves via `current_planner_id()` to a `fin_planners.id`. That ID is then checked against `fin_consent` before any retirement data is returned. This is enforced in RLS, not application code.

### Financial Data Column Rules

**Allowed in `fin_*` tables:**
- Salary ranges (not exact figures): `{ range: '150k-200k', currency: 'USD' }`
- Savings ranges: `{ range: '500k-1m' }`
- Percentage targets: `retirement_savings_rate_pct`
- Age ranges, not birthdates: `{ range: '45-54' }`

**Never stored:**
- Exact dollar amounts in individual accounts
- Account numbers or routing numbers
- Social Security Numbers or Tax IDs
- Full portfolio composition
- Bank or brokerage names tied to specific balances

### Separation Enforced in Code

```typescript
// In server routes, financial agent tools import ONLY from fin_ tables
// Career agent tools must NOT import anything from fin_ modules

// FORBIDDEN in career agent tools:
import { getRetirementAssessment } from './fin-tools'; // compile-time error if types enforced

// ALLOWED in financial agent tools:
const consent = await supabaseAdmin
  .from('fin_consent')
  .select('user_id')
  .eq('planner_id', plannerId)
  .is('revoked_at', null);
```

---

## 10. Audit & Compliance

### Audit Trigger Pattern

Critical operations fire audit triggers automatically. Apply to any table that contains T1-T3 data:

```sql
-- Generic audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO audit_log (
    actor_id,
    actor_type,
    action,
    resource_type,
    resource_id,
    old_values,
    new_values,
    changed_fields,
    data_tier
  )
  VALUES (
    auth.uid(),
    CASE
      WHEN auth.uid() IS NULL THEN 'system'
      WHEN EXISTS (SELECT 1 FROM fin_planners WHERE auth_user_id = auth.uid()) THEN 'planner'
      WHEN EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND org_role IN ('admin','owner')) THEN 'org_admin'
      ELSE 'user'
    END,
    TG_OP,
    TG_TABLE_NAME,
    CASE TG_OP WHEN 'DELETE' THEN OLD.id::text ELSE NEW.id::text END,
    CASE TG_OP WHEN 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE TG_OP WHEN 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    CASE TG_OP WHEN 'UPDATE' THEN
      ARRAY(
        SELECT key FROM jsonb_each(to_jsonb(NEW))
        WHERE to_jsonb(NEW) -> key <> to_jsonb(OLD) -> key
      )
    ELSE NULL END,
    TG_ARGV[0]::integer  -- data_tier passed as trigger argument
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Apply to financial tables (T3 = tier 3)
CREATE TRIGGER audit_fin_retirement
  AFTER INSERT OR UPDATE OR DELETE ON fin_retirement_assessments
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn('3');

CREATE TRIGGER audit_fin_consent
  AFTER INSERT OR UPDATE OR DELETE ON fin_consent
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn('3');

-- Apply to subscription changes (T1)
CREATE TRIGGER audit_user_subscriptions
  AFTER INSERT OR UPDATE OR DELETE ON user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn('1');
```

### Data Retention Sweep (Application Layer)

Run nightly via a scheduled job (server-side, service role):

```typescript
// Pseudo-code for retention sweep
async function runRetentionSweep() {
  const policies = await supabaseAdmin
    .from('data_retention_policies')
    .select('*');

  for (const policy of policies) {
    const cutoff = subDays(new Date(), policy.retention_days);

    if (policy.anonymize_after_days) {
      // Anonymize: null out user_id on behavioral tables
      await supabaseAdmin
        .from(policy.table_name)
        .update({ user_id: null, anonymized_at: new Date() })
        .lt('created_at', subDays(new Date(), policy.anonymize_after_days))
        .is('anonymized_at', null);
    }

    if (policy.archive_after_days) {
      // Archive: mark deleted_at or move to cold storage
      // Implementation depends on cold storage target (S3, pg_partman archival)
    }

    // Hard delete: only for data past full retention period
    if (!policy.anonymize_after_days && !policy.archive_after_days) {
      await supabaseAdmin
        .from(policy.table_name)
        .delete()
        .lt('created_at', cutoff);
    }
  }
}
```

---

## 11. GDPR Right-to-Delete

### Deletion Order (Respects FK Constraints)

```sql
-- GDPR deletion stored procedure
-- Called by the server after inserting a gdpr_deletion_requests row
CREATE OR REPLACE FUNCTION process_gdpr_deletion(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_tables_cleared text[] := '{}';
BEGIN
  -- Step 1: Revoke all financial consents
  UPDATE fin_consent SET revoked_at = now() WHERE user_id = p_user_id;
  v_tables_cleared := v_tables_cleared || 'fin_consent';

  -- Step 2: Anonymize financial data (do not delete — referral commissions may be outstanding)
  UPDATE fin_retirement_assessments
    SET questionnaire_responses = '[]'::jsonb,
        gap_analysis = '{}'::jsonb
    WHERE user_id = p_user_id;
  UPDATE fin_wellness_assessments
    SET questionnaire_responses = '{}'::jsonb
    WHERE user_id = p_user_id;
  v_tables_cleared := v_tables_cleared || 'fin_retirement_assessments' || 'fin_wellness_assessments';

  -- Step 3: Delete career content (cascade handles child rows)
  DELETE FROM session_workflow_artifacts
    WHERE session_id IN (SELECT id FROM coach_sessions WHERE user_id = p_user_id);
  DELETE FROM session_workflow_nodes
    WHERE session_id IN (SELECT id FROM coach_sessions WHERE user_id = p_user_id);
  DELETE FROM session_messages WHERE user_id = p_user_id;
  DELETE FROM coach_sessions WHERE user_id = p_user_id;
  v_tables_cleared := v_tables_cleared || 'coach_sessions';

  DELETE FROM master_resume_history
    WHERE master_resume_id IN (SELECT id FROM master_resumes WHERE user_id = p_user_id);
  DELETE FROM master_resumes WHERE user_id = p_user_id;
  v_tables_cleared := v_tables_cleared || 'master_resumes';

  -- Step 4: Delete application and network data
  DELETE FROM application_pipeline WHERE user_id = p_user_id;
  DELETE FROM offer_negotiations WHERE user_id = p_user_id;
  DELETE FROM interview_sessions WHERE user_id = p_user_id;
  DELETE FROM networking_contacts WHERE user_id = p_user_id;
  DELETE FROM job_applications WHERE user_id = p_user_id;
  DELETE FROM client_connections WHERE user_id = p_user_id;
  DELETE FROM client_target_titles WHERE user_id = p_user_id;
  DELETE FROM job_matches WHERE user_id = p_user_id;
  v_tables_cleared := v_tables_cleared || 'job_applications' || 'networking_contacts';

  -- Step 5: Delete platform content
  DELETE FROM linkedin_content WHERE user_id = p_user_id;
  DELETE FROM linkedin_profiles WHERE user_id = p_user_id;
  DELETE FROM content_posts WHERE user_id = p_user_id;
  DELETE FROM boolean_searches WHERE user_id = p_user_id;
  DELETE FROM why_me_stories WHERE user_id = p_user_id;
  DELETE FROM user_platform_context WHERE user_id = p_user_id;
  DELETE FROM user_positioning_profiles WHERE user_id = p_user_id;
  v_tables_cleared := v_tables_cleared || 'user_platform_context';

  -- Step 6: Anonymize all agent reports
  UPDATE agent_reports
    SET user_id = '00000000-0000-0000-0000-000000000000'::uuid
    WHERE user_id = p_user_id;
  -- Delete individual report tables (cascade where possible)
  DELETE FROM interview_prep_reports WHERE user_id = p_user_id;
  DELETE FROM linkedin_optimization_reports WHERE user_id = p_user_id;
  -- ... all other *_reports tables ...
  v_tables_cleared := v_tables_cleared || 'agent_reports';

  -- Step 7: Anonymize platform events (retain for analytics, remove identity)
  UPDATE platform_events
    SET user_id = NULL, anonymized_at = now()
    WHERE user_id = p_user_id;
  v_tables_cleared := v_tables_cleared || 'platform_events';

  -- Step 8: Soft-delete profile (subscription may have outstanding billing)
  UPDATE profiles SET
    deleted_at = now(),
    display_name = '[Deleted User]',
    avatar_url = NULL,
    timezone = 'UTC',
    gdpr_consent_at = NULL
  WHERE id = p_user_id;
  v_tables_cleared := v_tables_cleared || 'profiles';

  -- Step 9: Update deletion request status
  UPDATE gdpr_deletion_requests
    SET status = 'complete',
        tables_cleared = v_tables_cleared,
        completed_at = now()
    WHERE user_id = p_user_id
      AND status = 'processing';

  -- NOTE: auth.users deletion must be done via Supabase Admin API,
  -- not SQL. Call supabaseAdmin.auth.admin.deleteUser(userId) after this function.

  RETURN jsonb_build_object(
    'success', true,
    'tables_cleared', v_tables_cleared,
    'completed_at', now()
  );
END;
$$;
```

### Data Export (GDPR Right of Access)

```typescript
// Server route: POST /api/gdpr/export
// Collects all T1+T2 data for a user into a structured JSON package
async function buildGdprExport(userId: string) {
  const [profile, resumes, sessions, applications, contacts, reports] =
    await Promise.all([
      supabaseAdmin.from('profiles').select('*').eq('id', userId).single(),
      supabaseAdmin.from('master_resumes').select('*').eq('user_id', userId),
      supabaseAdmin.from('coach_sessions').select('id, status, created_at, current_phase, total_tokens_used').eq('user_id', userId),
      supabaseAdmin.from('job_applications').select('*').eq('user_id', userId),
      supabaseAdmin.from('networking_contacts').select('*').eq('user_id', userId),
      supabaseAdmin.from('agent_reports').select('agent_slug, created_at, quality_score').eq('user_id', userId),
    ]);

  // Financial data: only if user has fin_consent
  const { data: consent } = await supabaseAdmin
    .from('fin_consent')
    .select('*')
    .eq('user_id', userId)
    .is('revoked_at', null);

  const exportPackage = {
    exported_at: new Date().toISOString(),
    user_id: userId,
    profile: profile.data,
    career_data: { resumes: resumes.data, sessions: sessions.data, applications: applications.data },
    network_data: { contacts: contacts.data },
    agent_reports: reports.data,
    financial_consents: consent ?? [],
    // Never include fin_wellness_assessments in export — too sensitive, no legal requirement
  };

  // Upload to signed S3/Storage URL, return expiring link
  return exportPackage;
}
```

---

## Summary: New Tables by Migration

| Migration | New Tables | Modifies |
|-----------|-----------|---------|
| 013 | `profiles` | `user_positioning_profiles` (add columns) |
| 014 | `agent_reports`, `linkedin_profiles`, `boolean_searches`, `application_pipeline`, `content_posts` | — |
| 015 | `interview_sessions`, `networking_contacts`, `offer_negotiations` | `application_pipeline` (add FK) |
| 016 | `linkedin_content` | — |
| 017 | `fin_consent`, `fin_planners`, `fin_retirement_assessments`, `fin_planner_referrals`, `fin_wellness_assessments` | — |
| 018 | `b2b_organizations`, `b2b_contracts`, `b2b_employee_cohorts`, `b2b_outcome_reports` | `profiles` (add FK), `agent_reports` (add policy) |
| 019 | `audit_log`, `session_messages`, `data_retention_policies`, `gdpr_deletion_requests`, `platform_events`, materialized views | — |
| 020 | — (indexes only) | Multiple tables |
| 021 | — (pg_cron jobs only) | — |

**Total new tables: 24** on top of 35 existing = **59 tables** for the full 33-agent platform.

---

*This document is the authoritative schema blueprint. All migrations must follow the sequence above. Never run migrations out of order. Each migration wraps DDL in a transaction. Test against a fresh Supabase project before applying to production.*
