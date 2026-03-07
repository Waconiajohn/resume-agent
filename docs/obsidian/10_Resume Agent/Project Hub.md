# Resume Agent -- Project Hub

## Mission

Take mid-level executives and optimally position them for every job they apply to. We surface the 99% of professional experience that never makes it onto a resume, then craft documents that position the candidate as the benchmark others are measured against.

We never fabricate experience, inflate credentials, or misrepresent clients.

## Platform Status

Agent #1 of a 33-agent career coaching platform. 13 agents built as of Sprint 35:

| # | Agent | Type | Sub-agents | Feature Flag |
|---|-------|------|------------|-------------|
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

## Architecture

- **Backend:** Hono + Node.js (port 3001)
- **Frontend:** Vite + React 19 + TailwindCSS (port 5173)
- **Database:** Supabase (PostgreSQL) with RLS
- **LLM:** Groq (primary), Z.AI (fallback), Anthropic (optional)
- **Runtime:** Generic agent loop + message bus, domain-agnostic
- See [[Architecture Overview]], [[Platform Blueprint]], [[Model Routing]]

## Current Work

- **Live status:** [[Status]] -- updated every session, current health and concerns
- Canonical sources (repo `docs/`):
  - `CURRENT_SPRINT.md` -- active sprint
  - `BACKLOG.md` -- upcoming work
  - `CHANGELOG.md` -- session-by-session changes
  - `DECISIONS.md` -- architecture decision records

## Vault Sections

- [[Status]] -- living project health snapshot
- `20_Prompts/` -- prompt patterns and A/B results
- `30_Specs & Designs/` -- feature specs and UX flows
- `40_Snippets & APIs/` -- code patterns and bug postmortems

## Test Health

- Server: 1,513 tests passing
- App: 790 tests passing
- E2E: 2 tests (full pipeline)

#status/in-progress
