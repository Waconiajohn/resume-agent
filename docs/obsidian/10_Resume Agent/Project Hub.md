# Resume Agent -- Project Hub

## Mission

Restore the American Retirement Dream by combining AI-powered career positioning with integrated retirement planning for displaced executives 45+. We surface the 99% of professional experience that never makes it onto a resume, then craft documents that position the candidate as the benchmark others are measured against.

We never fabricate experience, inflate credentials, or misrepresent clients.

## Company

- **Brands:** CareerIQ.app (B2C) / FirstSourceTeam.com (B2B)
- **Revenue:** Dual engine -- SaaS subscriptions + financial planner referral network
- **Target:** Displaced mid-level executives 45+, $120K-$250K+ compensation
- See [[Company Vision]], [[Revenue Model]]

## Platform Status

17 of 33 agents built as of Sprint 41/43/45. See [[Platform Blueprint]] for the full 33-agent catalog.

### Built Agents (Codebase)

| # | Agent | Type | Sub-agents | Feature Flag |
|---|-------|------|------------|-------------|
| -- | [[Onboarding Assessment]] | 1-agent (gated) | Assessor | `FF_ONBOARDING` |
| 1 | [[Resume Builder]] | 3-agent | Strategist, Craftsman, Producer | Core (always on) |
| 2 | [[Cover Letter]] | 2-agent | Analyst, Writer | -- |
| 3 | [[Interview Prep]] | 2-agent | Researcher, Writer | `FF_INTERVIEW_PREP` |
| 4 | [[LinkedIn Optimizer]] | 2-agent | Analyzer, Writer | `FF_LINKEDIN_OPTIMIZER` |
| 5 | [[Content Calendar]] | 2-agent | Strategist, Writer | `FF_CONTENT_CALENDAR` |
| 13 | [[Networking Outreach]] | 2-agent | Researcher, Writer | `FF_NETWORKING_OUTREACH` |
| 14 | [[Job Application Tracker]] | 2-agent | Analyst, Writer | `FF_JOB_TRACKER` |
| 15 | [[Salary Negotiation]] | 2-agent | Researcher, Strategist | `FF_SALARY_NEGOTIATION` |
| 16 | [[Executive Bio]] | 1-agent | Writer | `FF_EXECUTIVE_BIO` |
| 17 | [[Case Study]] | 2-agent | Analyst, Writer | `FF_CASE_STUDY` |
| 18 | [[Thank You Note]] | 1-agent | Writer | `FF_THANK_YOU_NOTE` |
| 19 | [[Personal Brand Audit]] | 2-agent | Auditor, Advisor | `FF_PERSONAL_BRAND_AUDIT` |
| 20 | [[90-Day Plan]] | 2-agent | Researcher, Planner | `FF_NINETY_DAY_PLAN` |
| -- | [[Job Finder]] | 2-agent | Searcher, Ranker | `FF_JOB_FINDER` |
| -- | [[LinkedIn Content Writer]] | 2-agent | Strategist, Writer | `FF_LINKEDIN_CONTENT` |
| -- | [[LinkedIn Profile Editor]] | 1-agent | Editor | `FF_LINKEDIN_EDITOR` |

> Note: Codebase numbering differs from canonical 33-agent numbering. See [[Platform Blueprint]] for reconciliation.

## Architecture

- **Backend:** Hono + Node.js (port 3001)
- **Frontend:** Vite + React 19 + TailwindCSS (port 5173)
- **Database:** Supabase (PostgreSQL) with RLS
- **LLM:** Groq (primary), Z.AI (fallback), Anthropic (optional)
- **Runtime:** Generic agent loop + message bus, domain-agnostic
- See [[Architecture Overview]], [[Platform Blueprint]], [[Model Routing]]

## Knowledge Base

### Strategy & Business
- [[Company Vision]] -- mission, values, ICPs, competitive position
- [[Revenue Model]] -- dual engine, pricing tiers, unit economics
- [[B2B Outplacement]] -- enterprise requirements, SLAs, admin portal

### Coaching IP
- [[Coaching Methodology]] -- 134K-word Bible, key frameworks, positioning philosophy
- [[Voice Guide]] -- 3 registers, emotional intelligence, banned words
- [[Quality Framework]] -- 3 gates, 5 dimensions, golden tests, prompt template

### Technical
- [[Architecture Overview]] -- system architecture, agent runtime
- [[Platform Blueprint]] -- 33-agent catalog, 7-phase roadmap, dashboard
- [[Model Routing]] -- 4-tier routing, provider selection
- [[LLM Strategy]] -- cost optimization, RAG tiers, fine-tuning roadmap
- [[Database Evolution]] -- 6-phase schema plan, RLS architecture
- [[SSE Event System]] -- event types, panel system

### Source Documents
- Google Drive: `Agentic.AI Company/` folder (30 documents across 7 workstreams)
- Google Drive: `Agentic.AI Company/SYNTHESIS.md` -- master synthesis of all docs

## Current Work

- **Live status:** [[Status]] -- updated every session
- Canonical sources (repo `docs/`):
  - `CURRENT_SPRINT.md` -- active sprint
  - `BACKLOG.md` -- upcoming work
  - `CHANGELOG.md` -- session-by-session changes
  - `DECISIONS.md` -- architecture decision records

## Vault Sections

- `20_Prompts/` -- prompt patterns and A/B results
- `30_Specs & Designs/` -- feature specs and UX flows
- `40_Snippets & APIs/` -- code patterns and bug postmortems

## Test Health

- Server: 2,288 tests passing
- App: 1,248 tests passing
- E2E: 2 tests (full pipeline)

#status/in-progress
