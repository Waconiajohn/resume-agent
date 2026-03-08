# CareerIQ Platform — Gap Analysis

> **Generated:** 2026-03-07
> **Source:** 5 specialist agents (UI/UX, Backend, Database, Platform Orchestrator, Codebase Auditor) analyzing the full 33-agent vision against the current codebase.
> **Related:** `docs/PLATFORM_ARCHITECTURE.md`, `supabase/SCHEMA_BLUEPRINT.md`

---

## Executive Summary

The current codebase is a **strong foundation** with 13 of 33 agents built, a production-validated agent runtime, and 2,303 tests. The gap to the full platform falls into 6 categories:

| Category | Current State | Target State | Effort |
|----------|--------------|-------------|--------|
| Agents | 13 built (Resume + 12 satellite) | 33 agents across 10 categories | 20 agents to build |
| Orchestration | Zero cross-agent coordination | Platform Orchestrator + lifecycle events | New service layer |
| Frontend | CareerIQ dashboard exists (16 rooms, 4 zones) | Full design system, tier gating, onboarding, mobile nav | Refinement + new components |
| Database | 46 tables, resume-focused | 70+ tables across 6 migration phases | 9 new migrations |
| B2B Enterprise | None | Multi-tenant admin portal, SSO, reporting | New subsystem |
| Financial Integration | None | Retirement planning, planner network, commission tracking | New subsystem |

---

## 1. AGENT GAP (20 agents remaining)

### What's Built (13 agents)

| Codebase # | Agent | Sub-agents | Status |
|-----------|-------|-----------|--------|
| 1 | Resume Builder | Strategist, Craftsman, Producer | Production |
| 2 | Cover Letter | Analyst, Writer | Active |
| 3 | Interview Prep | Researcher, Writer | Active |
| 4 | LinkedIn Optimizer | Analyzer, Writer | Active |
| 5 | Content Calendar | Strategist, Writer | Active |
| 13 | Networking Outreach | Researcher, Writer | Active |
| 14 | Job Application Tracker | Analyst, Writer | Active |
| 15 | Salary Negotiation | Researcher, Strategist | Active |
| 16 | Executive Bio | Writer | Active |
| 17 | Case Study | Analyst, Writer | Active |
| 18 | Thank You Note | Writer | Active |
| 19 | Personal Brand Audit | Auditor, Advisor | Active |
| 20 | 90-Day Plan | Researcher, Planner | Active |

### What's Missing (20 agents, by phase)

#### Phase 2: Document & Positioning Cluster
| Canonical # | Agent | Est. Cost/Session | Notes |
|------------|-------|-------------------|-------|
| 5 | LinkedIn Profile Editor | $0.12-$0.20 | Different from LinkedIn Optimizer (#4 in codebase). Side-by-side profile transformation. |
| 6 | LinkedIn Blogging Strategy | $0.10-$0.18 | 60-day content calendar with ready-to-publish posts. Overlaps with Content Calendar (#5 in codebase) — needs reconciliation. |

#### Phase 3: Job Discovery Cluster
| Canonical # | Agent | Est. Cost/Session | Notes |
|------------|-------|-------------------|-------|
| 7 | Job Finder | $0.08-$0.15 | 3-layer discovery (aggregated, deep scrape, network intelligence). Network Intelligence module partially exists. |
| 8 | Boolean Search | $0.05-$0.08 | 30+ title variations. `ni/boolean-search.ts` exists as utility but not as agent pipeline. |

#### Phase 4: Interview & Relationship Cluster
| Canonical # | Agent | Est. Cost/Session | Notes |
|------------|-------|-------------------|-------|
| 13 | References & Recommendations | $0.08-$0.12 | Reference selection, briefing docs, LinkedIn rec templates. |

#### Phase 5: Financial Wellness Cluster
| Canonical # | Agent | Est. Cost/Session | Notes |
|------------|-------|-------------------|-------|
| 14 | Retirement Planning | $0.10-$0.15 | Revenue Engine 2 activation. Drives planner referral qualification. |
| 15 | Emotional Wellness & Mindset | $0.05-$0.08 | Background distress monitoring. Safety gate for financial referrals. |
| 16 | Skills Gap & Career Pivot | N/A | Skills mapping, upskilling ROI, pivot vs reposition. |

#### Phase 3-4: Contract Career Track (5 agents)
| Canonical # | Agent | Notes |
|------------|-------|-------|
| 17 | Contract Recruiter Database | Build/maintain staffing firm database |
| 18 | Contract Resume Distribution | Targeted distribution to recruiters |
| 19 | Contract Pipeline Perpetual Motion | Zero-gap deployment |
| 20 | Contract Rate Negotiation | Rate intelligence, margin awareness |
| 21 | Continuous Marketing Engine | Always-on LinkedIn presence |

#### Phase 7: Supporting Agents (9 agents)
| Canonical # | Agent | Notes |
|------------|-------|-------|
| 22 | Executive Job Seeker Sourcing | WARN Act feeds, layoff signals, lead scoring |
| 23 | Company Monitoring | Auto-monitors target companies |
| 24 | LinkedIn Relationship Mapping | Maps connection network |
| 25 | PR/Blogging | SEO content generation |
| 26 | Social Media Content Engine | Multi-platform distribution |
| 27 | Client Success & Retention | Churn prediction, re-engagement |
| 28 | AI Model Manager | Model monitoring, cost optimization |
| 29 | Token Efficiency | Prompt compression, caching |
| 30 | Platform Orchestrator | Routes between agents, manages journey |

#### Phase 6: B2B Enterprise (3 agents)
| Canonical # | Agent | Notes |
|------------|-------|-------|
| 31 | Company Benefits | Company-specific pension, severance, COBRA |
| 32 | B2B Reporting | Automated outcome reports for HR admins |
| 33 | B2B Onboarding | Batch provisioning, welcome kit |

### Agent Numbering Reconciliation

The codebase uses its own numbering (1-20) that differs from the canonical 33-agent catalog. Key conflicts:

| Codebase # | Codebase Agent | Canonical # | Canonical Agent |
|-----------|---------------|------------|----------------|
| 13 | Networking Outreach | 12 | LinkedIn Networking |
| 14 | Job Application Tracker | 9 | Application Tracker |
| 15 | Salary Negotiation | 11 | Salary Negotiation |
| 16 | Executive Bio | — | Not in canonical 33 |
| 17 | Case Study | — | Not in canonical 33 |
| 18 | Thank You Note | — | Not in canonical 33 |
| 19 | Personal Brand Audit | — | Not in canonical 33 |
| 20 | 90-Day Plan | — | Not in canonical 33 |

**Decision needed:** Adopt the canonical 33-agent numbering or maintain a mapping table. Agents #16-20 in the codebase (Executive Bio, Case Study, Thank You Note, Personal Brand Audit, 90-Day Plan) are not in the canonical 33-agent catalog — they may need to be mapped to canonical slots or treated as bonus agents.

---

## 2. ORCHESTRATION GAP

### Current State: Zero Cross-Agent Coordination

- Each agent is a standalone pipeline with no awareness of other agents
- No lifecycle events when agents complete
- No recommendation engine ("Most Important Action Today")
- No journey state machine tracking user progression
- No cross-agent data flow beyond `user_platform_context` (implemented but underutilized)
- No tier-based access control enforcement (feature flags gate code availability, not user access)

### Target State: Platform Orchestrator (Service Layer)

**Architecture:** Deterministic service layer (NOT an LLM agent) with these modules:

| Module | Purpose | File |
|--------|---------|------|
| `orchestrator.ts` | Main facade | `server/src/orchestrator/orchestrator.ts` |
| `journey.ts` | State machine (onboarding → foundation → active_search → interviewing → negotiating → landed) | `server/src/orchestrator/journey.ts` |
| `recommender.ts` | Scoring engine for "Most Important Action Today" | `server/src/orchestrator/recommender.ts` |
| `lifecycle-events.ts` | Event dispatch + handlers | `server/src/orchestrator/lifecycle-events.ts` |
| `tier-guard.ts` | Per-agent access control middleware | `server/src/orchestrator/tier-guard.ts` |
| `dashboard-assembler.ts` | Dashboard 4-zone data assembly | `server/src/orchestrator/dashboard-assembler.ts` |
| `b2b-context.ts` | Enterprise context injection | `server/src/orchestrator/b2b-context.ts` |

**Key design decisions:**
- Orchestrator is pure TypeScript (no LLM inference) — deterministic, auditable, <50ms response
- Database-backed state (not in-memory) — survives restarts
- Extends existing patterns (`createProductRoutes()` hooks, `user_platform_context`)
- Single dashboard endpoint (`GET /api/orchestrator/dashboard`) replaces 6+ client-side queries

### New Database Tables Required

- `user_journey_state` — current phase, financial segment, last activity
- `lifecycle_events` — audit trail of all agent completions, stage changes

### Integration Points

Each product route's `onComplete` hook dispatches a lifecycle event:
```
agent_completed → advanceJourney() → recomputeRecommendations()
```

Lifecycle event handlers trigger cross-agent suggestions:
- `resume_complete` → suggest Cover Letter + LinkedIn
- `application_stage_changed` to `interviewing` → suggest Interview Prep
- `offer_received` → suggest Salary Negotiation + Retirement Planning

---

## 3. FRONTEND GAP

### What's Built Well

- CareerIQ dashboard with 4 zones (ZoneYourDay, ZoneYourPipeline, ZoneAgentFeed, ZoneYourSignals)
- 16 room components in sidebar
- WhyMeEngine story capture
- LivePulseStrip for live sessions
- MobileBriefing (simplified 3-card mobile view)
- Glass morphism design system (GlassCard, GlassButton, GlassInput, GlassSkeleton)

### What's Missing or Needs Refinement

#### Critical (Before Launch)

| Item | Description | Effort |
|------|-------------|--------|
| **Color token migration** | Current accent `#98b3ff` (periwinkle) must become `#0D9488` (Electric Teal) per design brief | S — find-and-replace + logic updates |
| **TierGate component** | Replace `cursor-not-allowed` locked nav items with blurred-preview + upgrade teaser | M — new component + integration |
| **useCareerIQState hook** | Consolidate scattered state (room, tier, whyMe, onboarding, streak) into single hook | M — refactor |
| **Mobile bottom nav** | MobileBottomNav.tsx with 5 tabs (Home, Pipeline, Live, Agents, Profile) | S — new component |
| **Sidebar footer** | Tier badge + upgrade CTA in sidebar footer | S — new sub-component |

#### High Value

| Item | Description | Effort |
|------|-------------|--------|
| **Onboarding flow** | 5-step modal (Welcome, Profile, Clarity/WhyMe, First Target, Ready) — 3 minutes total | M — new component |
| **Stage label alignment** | Pipeline stages → Discovered/Applied/Screening/Interview/Decision | S — relabel + migration |
| **Typography enforcement** | Inter font, 16px minimum body, design brief color system | S — CSS updates |
| **Extended panel types** | 15+ new PanelData types for agents 4-20 | L — types + components |

#### Future

| Item | Description | Effort |
|------|-------------|--------|
| QuickActionsButton | Floating contextual CTA (desktop only) | S |
| useCareerIQAgentFeed | Real agent event stream (needs backend endpoint) | M |
| AgentPanelHost | Room-level panel renderer for non-resume agents | M |
| LockedRoomPreview | Mock preview content under TierGate | M |
| Dashboard endpoint integration | Replace client-side Supabase queries with `/api/orchestrator/dashboard` | M |

### Design System Additions Needed

| Component | Purpose |
|-----------|---------|
| `TierGate` | Soft paywall with blurred preview |
| `TealCard` | Teal-accented card variant |
| `AmberCard` | Live session callout variant |
| `SkeletonCard` | Loading state (no spinners) |
| `tokens.ts` | Canonical color token file |

---

## 4. DATABASE GAP

### Current: 46 tables, resume-focused

Well-structured with RLS. Missing everything beyond resume + basic platform.

### Target: 70+ tables across 9 migration phases

**Schema blueprint:** `supabase/SCHEMA_BLUEPRINT.md`

| Migration | Tables | Purpose |
|-----------|--------|---------|
| 013 | `profiles`, enhanced `user_positioning_profiles` | Central identity hub with 12 structured columns |
| 014 | `agent_reports`, `evidence_library` | Cross-agent report registry + indexed STAR stories |
| 015 | `networking_contacts`, `company_directory` | Relationship CRM + company intelligence |
| 016 | `linkedin_content`, `linkedin_profiles` | Content lifecycle (draft → approved → published) |
| 017 | `fin_retirement_assessments`, `fin_planners`, `fin_referrals`, `fin_consent`, `fin_wellness_assessments` | Financial wellness with hard isolation from career data |
| 018 | `organizations`, `organization_members`, `b2b_contracts`, `b2b_cohorts`, `b2b_outcome_reports` | Multi-tenant B2B |
| 019 | `audit_log`, `session_messages` (partitioned), `gdpr_deletion_requests` | Compliance + performance |
| 020 | `user_journey_state`, `lifecycle_events` | Orchestrator state |
| 021 | Graph tables or Neo4j integration | Knowledge graph (deferred) |

### Key Architectural Decisions

1. **`agent_reports` registry** — single table for cross-agent discoverability instead of querying 20 individual report tables
2. **Financial isolation** — `fin_consent` is the only bridge between career and financial data. No FK crosses the boundary.
3. **Partitioned `session_messages`** — range-partitioned by month, replaces JSONB `coach_sessions.messages` for new sessions
4. **GDPR deletion** — `process_gdpr_deletion()` stored procedure handles cascading deletion with audit trail

---

## 5. B2B ENTERPRISE GAP

### Current: Nothing

No organization model, no admin portal, no white-label, no SSO, no reporting.

### Target State

| Component | Description |
|-----------|-------------|
| **Data model** | `organizations` + `organization_members` + `b2b_contracts` + `b2b_cohorts` + `b2b_outcome_reports` |
| **Auth** | SAML SSO producing standard Supabase session. JWT custom claims with `organization_id`. |
| **Admin portal** | Enrollment dashboard, outcome metrics, activity heatmap, at-risk flagging, CSV roster upload |
| **Privacy enforcement** | RLS: admins see engagement metrics only, NEVER personal content. `SECURITY DEFINER` functions for aggregate queries. |
| **Reporting** | Auto-generated weekly PDF (Monday 10 AM), monthly outcome report (5th of month), quarterly executive briefing |
| **Integration** | HRIS API (Workday, BambooHR, ADP) — AES-256-GCM encrypted credentials |
| **White-label** | Organization branding config in `organizations.config` JSONB |

### Implementation Sequence

1. Database tables (migration 018)
2. `tenantGuard` middleware + JWT claims
3. Admin routes (`/api/admin/b2b/:orgId/*`)
4. CSV roster upload + auto-provisioning
5. Engagement metrics endpoint (aggregate only)
6. Automated report generation (background job)
7. SSO integration (SAML handler)
8. HRIS API integration

---

## 6. FINANCIAL INTEGRATION GAP

### Current: Nothing

No retirement planning, no financial planner network, no commission tracking.

### Target State

| Component | Description |
|-----------|-------------|
| **Retirement Planning Agent** | Questionnaire, gap analysis, education modules, planner matching |
| **Emotional Wellness Agent** | Background distress monitoring, intervention delivery, safety gate |
| **Lead qualification** | 5-gate FSM: $100K+ assets, user opt-in, resume complete, geographic match, emotional readiness |
| **Planner matching** | Geography, asset level, specialization, personality fit |
| **Handoff document** | Auto-generated: career situation, asset range, concerns, analysis, talking points |
| **Commission tracking** | `fin_referrals` table: pending/earned/paid, quarterly reconciliation |
| **SLA monitoring** | 48h contact check, 10-day meeting check, alerts to platform admin |
| **Partner network** | Currently ~12 planners, scaling to 100+. Partner portal for status/reporting. |

### Key Design Decision

The financial planner integration is a **deterministic FSM, not an agent loop**. The LLM is called exactly once per referral (to generate the handoff document). Everything else is scripted qualification logic.

---

## 7. INFRASTRUCTURE GAPS

| Gap | Current | Target | Priority |
|-----|---------|--------|----------|
| **Background processing** | None (everything synchronous) | BullMQ on Redis for async jobs (orchestrator recompute, company monitoring, quality scoring, report delivery) | Phase 3+ |
| **Horizontal scaling** | Single process | Redis bus (`FF_REDIS_BUS` exists but unused), `FF_REDIS_RATE_LIMIT` | Phase 3+ (10K+ users) |
| **Quality scoring pipeline** | Manual (golden test cases exist) | Automated daily: 10 random sessions per agent, scored by `MODEL_LIGHT` | Phase 2 |
| **Cost tracking dashboard** | Per-session cost in `user_usage` | Per-agent materialized view, daily/weekly/monthly rollups | Phase 2 |
| **Caching layer** | None | In-memory TTL cache for dashboard endpoint (60s), cache invalidation on lifecycle events | Phase 1 |

---

## 8. RECOMMENDED BUILD SEQUENCE

### Phase 1: Foundation (4-6 weeks)

**Goal:** Platform Orchestrator + frontend refinement + database foundation

| Sprint | Work |
|--------|------|
| A | Orchestrator service layer: `journey.ts`, `lifecycle-events.ts`, `user_journey_state` + `lifecycle_events` tables |
| B | Recommender + dashboard assembler + `GET /api/orchestrator/dashboard` endpoint |
| C | Frontend: color token migration, TierGate, useCareerIQState, mobile bottom nav, sidebar footer |
| D | Frontend: onboarding flow, stage label alignment, typography |
| E | Database migrations 013-014 (profiles, agent_reports, evidence_library) |
| F | Tier gating: `agentGuard()` middleware, `plan_features` seeding, wire to all 13 product routes |

### Phase 2: LinkedIn & Cover Letter Cluster (4-6 weeks)

**Goal:** First agent cluster beyond resume. Cross-agent data sharing validated.

| Sprint | Work |
|--------|------|
| G | LinkedIn Profile Editor agent (side-by-side transformation) |
| H | LinkedIn Blogging Strategy agent (60-day calendar) — reconcile with existing Content Calendar |
| I | Database migration 015-016 (networking_contacts, linkedin_content, linkedin_profiles) |
| J | Cross-agent evidence flow: Resume → LinkedIn → Cover Letter sharing positioning data |
| K | Quality scoring pipeline: automated daily sampling |

### Phase 3: Job Discovery Cluster (4-6 weeks)

**Goal:** Job search command center with daily engagement loop

| Sprint | Work |
|--------|------|
| L | Job Finder agent (3-layer discovery). Extend existing Network Intelligence module. |
| M | Boolean Search agent (promote `ni/boolean-search.ts` to agent pipeline) |
| N | Application pipeline enhancement (replace `job_applications` with full lifecycle tracking) |
| O | Background processing: BullMQ setup, company monitoring async jobs |

### Phase 4: Interview & Relationship Cluster (3-4 weeks)

**Goal:** Complete career transition toolkit

| Sprint | Work |
|--------|------|
| P | References & Recommendations agent |
| Q | Database migration 015 additions (interview_sessions, offer_negotiations enhancements) |

### Phase 5: Financial Wellness (6-8 weeks)

**Goal:** Revenue Engine 2 activation

| Sprint | Work |
|--------|------|
| R | Retirement Planning agent + database migration 017 (financial tables) |
| S | Emotional Wellness agent (background monitoring, safety gate) |
| T | Skills Gap & Career Pivot agent |
| U | Financial planner FSM: qualification, matching, handoff document generation |
| V | Commission tracking + SLA monitoring |

### Phase 6: B2B Enterprise Portal (6-8 weeks)

**Goal:** Enterprise admin dashboard, SSO, reporting

| Sprint | Work |
|--------|------|
| W | Database migration 018 (B2B tables) + `tenantGuard` middleware |
| X | Admin routes + CSV roster upload + auto-provisioning |
| Y | Company Benefits agent + B2B Onboarding agent |
| Z | B2B Reporting agent + automated report generation |
| AA | SSO (SAML) integration |

### Phase 7: Platform Intelligence (ongoing)

**Goal:** Supporting agents, knowledge graph, scale to 10K+

| Sprint | Work |
|--------|------|
| AB | Contract Career Track agents (5 agents) |
| AC | Sourcing Agent, Company Monitoring, LinkedIn Relationship Mapping |
| AD | PR/Blogging, Social Media Content Engine |
| AE | Client Success & Retention, AI Model Manager, Token Efficiency |
| AF | Knowledge graph (Neo4j or Postgres graph layer) |

---

## 9. WHAT'S ALREADY STRONG (Don't Touch)

These are validated, well-tested patterns that should be preserved:

1. **Agent runtime** (`runtime/agent-loop.ts`, `agent-bus.ts`, `agent-protocol.ts`) — generic, domain-agnostic, 891+ tests
2. **Product route factory** (`createProductRoutes()` + 7 lifecycle hooks) — proven across 13 products
3. **ProductConfig pattern** — repeatable for new agents (types.ts, knowledge/rules.ts, product.ts)
4. **Model routing** (`llm.ts` + `getModelForTool()`) — cost-optimized 4-tier system
5. **LLM provider abstraction** — multi-provider with abort handling and failover
6. **SSE event pipeline** — panel system, gate protocol, event middleware
7. **Section Workbench** — full-screen editing with undo/redo, review tokens, action locking
8. **CareerIQ dashboard skeleton** — 4-zone layout, WhyMe engine, pipeline kanban, agent feed
9. **Test infrastructure** — 2,303 tests, CI gates, E2E pipeline tests
10. **Scrum framework** — CLAUDE.md, sprint log, changelog, ADRs

---

## 10. KEY RISKS

| Risk | Mitigation |
|------|-----------|
| Agent numbering confusion | Establish canonical mapping table and enforce in codebase |
| Scope creep (33 agents is ambitious) | Follow 7-phase roadmap strictly. Revenue-generating agents first. |
| Financial data breach | Hard database isolation (no FK crossing career/financial boundary) |
| B2B privacy violation | RLS + SECURITY DEFINER functions. Admin never touches personal content. |
| LLM cost explosion at scale | Rules engineering per agent (20-40 hrs). Monitor 3-6% cost-to-revenue ratio. |
| Dashboard latency with 33 agents | Precomputed recommendations, cached dashboard endpoint, no real-time LLM calls |

---

## Related Documents

- `docs/PLATFORM_ARCHITECTURE.md` — Full backend architecture blueprint
- `supabase/SCHEMA_BLUEPRINT.md` — Complete database schema with SQL
- `docs/obsidian/10_Resume Agent/Platform Blueprint.md` — 33-agent catalog and roadmap
- `docs/obsidian/10_Resume Agent/Company Vision.md` — Mission, ICPs, competitive position
- `docs/obsidian/10_Resume Agent/Revenue Model.md` — Dual engine economics
- Google Drive: `Agentic.AI Company/SYNTHESIS.md` — Master synthesis of all planning docs
