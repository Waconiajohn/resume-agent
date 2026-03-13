# Project Status

> Updated every session by Claude. This is the living snapshot of where things stand.

## Last Updated
2026-03-13 | Session 82 (CLAUDE.md compliance audit + remediation)

## Current State
- **Resume V2 pipeline fully delivered** — 10-agent pipeline, streaming UX, inline editing, gap coaching, strategy transparency, session persistence
- **7 platform sprints delivered** in Sessions 78-81: Cover Letter Polish, LinkedIn Studio, Networking Hub, Interview/Salary Kanban integration, Emotional Intelligence, Platform Infrastructure
- **Platform infrastructure expanded**: Redis bus adapter (opt-in), agent hot-reload (dev-only), cross-product tier auth, admin dashboard, DB-driven product catalog
- **CLAUDE.md compliance audit completed** — unsafe casts removed, dead imports cleaned, IAgentBus interface extracted, Zod validation added, LinkedInStudioRoom split into components

### What Was Built (Sessions 77-82)
- G1: Unified gap coaching approval flow (5 stories)
- G2: Strategy transparency — audit card, bullet markers, narrative enrichment, thread animation, what-changed diff (5 stories)
- T1: 234 new V2 tests across agents, orchestrator, frontend
- P1: Full V2 session persistence to DB, dashboard resumption
- CL1: DOCX/PDF cover letter export, product waitlist
- LS1: LinkedIn Studio series planner, recruiter sim, writing analyzer, tools tab
- NH1: Overdue contacts, NI import with dedup
- IP1+SN1: Kanban pipeline card CTAs → interview prep / salary negotiation
- EI1: Resource library extraction, AskCoachForm component
- PX1: Redis bus, hot-reload, product-auth middleware, admin dashboard, product catalog API
- Session 82: CLAUDE.md compliance remediation — IAgentBus interface, dead code cleanup, Zod trim, session error feedback, LinkedInStudioRoom extraction

## Test Health
- Server: 2,417+ tests passing (18 new P1 persistence tests; 3 pre-existing failures in cover-letter-agents, networking-outreach-agents)
- App: 1,660 tests passing (6 pre-existing failures in NinetyDayPlan, PersonalBrand, SalaryNegotiation, Sprint4Rooms, DashboardScreen, CareerIQComponents)
- TypeScript: both server and app tsc clean
- E2E: not re-run this session (V2 pipeline needs E2E rebuild)

## Active Concerns
- **linkedin-tools.ts uses direct LLM calls in routes** — bypasses agent-first mandate. ADR-043 documents stateless exception with 6 hard-gate conditions.
- **9 pre-existing test failures** across app (6) and server (3) — need cleanup sprint

## Recent Decisions
- Extracted `IAgentBus` interface from `AgentBus` class — `bus-factory.ts` and all consumers now use the interface type, eliminating unsafe `as unknown as AgentBus` cast
- Reuse `tailored_sections` JSONB column with `version: 'v2'` discriminator (no migration needed)
- Gap coaching cards not persisted (live interaction only)
- LinkedIn tools endpoints are stateless single-LLM calls — feature-flagged, no session (ADR-043)
- RedisBus uses pub/sub (not Streams) — matches in-memory bus semantics
- Admin dashboard uses sessionStorage for key (not localStorage)

## Key Metrics
- Total agents built: 19 products, 42 agents + 2 simulation sub-agents + Virtual Coach
- Total tests: ~4,077 (2,417 server + 1,660 app)
- V2 pipeline cost: ~$0.08/run (Groq)
- V2 pipeline time: ~1m42s (Groq)

## What Needs Attention
- Fix 9 pre-existing test failures
- E2E test suite rebuild for V2 pipeline
- Wire RedisBus/hot-reload into entry points or remove dead code

#status/in-progress
