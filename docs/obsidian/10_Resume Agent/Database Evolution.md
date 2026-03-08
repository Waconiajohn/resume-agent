# Database Evolution

> Source: Google Drive — `database-schema-evolution-plan.docx`

## Design Principles

1. **User Positioning Profile** is the central identity entity all agents read/write
2. Migrations are additive and non-breaking (existing resume agent schema untouched)
3. Every table includes audit fields, RLS policies, and data classification

## Six Migration Phases

### Phase 1: User Positioning Profile

`user_positioning_profiles` — one-to-one with `profiles`. JSONB columns:
- `career_narrative`, `positioning_angles`, `key_accomplishments`, `target_roles`
- `leadership_style`, `industry_expertise`, `skills_matrix`
- `age_positioning`, `emotional_state` (SENSITIVE)
- `enrichment_log` (tracks which agents wrote and when)

Backfill from `master_resumes.positioning_data`.

### Phase 2: LinkedIn + Content Tables

- `linkedin_profiles` — current + transformed data, implementation status
- `linkedin_content` — 60-day content calendar, generated posts, engagement

### Phase 3: Job Discovery Tables

- `job_opportunities` — source layer (aggregated/deep_scrape/network), relevance score, user status
- `boolean_searches` — expanded titles, platform-specific booleans
- `application_pipeline` — enhanced replacement for `job_applications` with full lifecycle

### Phase 4: Interview + Relationship Tables

- `interview_sessions` — company briefing, questions, mock transcript, prep score
- `networking_contacts` — relationship type, outreach status, follow-up due
- `offer_negotiations` — offer details, market comparison, negotiation strategy, outcome

### Phase 5: Financial Wellness Tables (HIGHLY_SENSITIVE)

- `retirement_assessments` — questionnaire, gap analysis, planner matching/handoff status
- `financial_planners` — partner directory with credentials, geography, AUM range
- `financial_planner_referrals` — commission tracking (pending/earned/paid)
- `wellness_assessments` — emotional state, intervention type, escalation flags

### Phase 6: B2B Enterprise Tables

- `b2b_organizations` — company entity, white-label branding, SSO config (SAML)
- `b2b_contracts` — seats purchased/used, price/seat, SLA, auto-renew
- `b2b_employee_cohorts` — groups with outcomes
- `b2b_outcome_reports` — automated reporting (monthly/quarterly/final)

## RLS Policy Architecture

| Role | Access |
|------|--------|
| User | `auth.uid() = user_id` on every user-facing table |
| Enterprise admin | Read-only on their org's users via admin_user_ids join |
| Financial planner | Only retirement + referral data for opted-in users. Zero career data |
| Platform admin | Full access with audit logging |
| Agent service | Service role key bypasses RLS, scoped to current user's session |

## Performance Plan

- Indexes: every `user_id` FK, composite `(user_id, created_at)`, GIN on JSONB
- Partitioning: `session_messages` by month at 10M+ rows
- Archival: `coach_sessions` older than 12 months to cold storage
- Connection pooling: PgBouncer monitoring at 1,000+ concurrent users
- Realtime: `session_messages` and `job_opportunities` enabled for Supabase Realtime

## Related

- [[Architecture Overview]]
- [[B2B Outplacement]]
- Google Drive: `database-schema-evolution-plan.docx`

#type/spec #status/done
