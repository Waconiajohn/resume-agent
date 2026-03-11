# Project Status

> Updated every session by Claude. This is the living snapshot of where things stand.

## Last Updated
2026-03-10 | Session 75 (Sprint R4 — UI/UX Playwright Remediation)

## Current State
- **Sprint R4 complete** — all 9 stories done (3 HIGH + 4 MEDIUM + 2 LOW UI/UX fixes)
- Username display uses real name from user_metadata, not email
- Pipeline summary reads from canonical `application_pipeline` table (matches kanban)
- Error sessions hidden from feed, relabeled "Incomplete"
- Mobile FAB clears bottom navigation
- Session list pagination with "Load more"
- Feature-flagged routes return 200 (not 404) when disabled
- Session titles enriched from job_applications FK
- SVG favicon added

### Cross-Cutting Patterns Status
- **Pattern 1 (Context Visibility)**: DONE — ContextLoadedBadge in 12 rooms
- **Pattern 2 (Feature Flag Wall)**: DONE — graceful 403 handling
- **Pattern 3 (Rich Data Lost)**: DONE — 7 products enriched with structured completion data
- **Pattern 4 (Session Persistence)**: DONE — usePriorResult in 6 rooms
- **Pattern 5 (Resume Auto-load)**: DONE — already implemented

## Test Health
- Server: 2,793 tests passing
- App: 1,570 tests passing
- E2E: 2 tests passing
- TypeScript: both server and app tsc clean

## Active Concerns
- **Resume pipeline UX needs redesign** — must be done before launch

## Recent Decisions
- Gate re-run capped at 3 iterations to prevent infinite revision loops
- ContextLoadedBadge cached per session — one network call total
- personal-brand and ninety-day-plan don't need requiresRerun (feedback flows between agents via buildAgentMessage)
- Coach MAX_COACH_HISTORY=40 messages to LLM (full history persisted to DB)
- loadClientSnapshot now includes evidence_item + career_narrative context types

## Key Metrics
- Total agents built: 19 (of 33 planned) + 2 simulation sub-agents + Virtual Coach
- Total tests: 4,363 (2,793 server + 1,570 app)
- Estimated pipeline cost: ~$0.08/run (Groq)
- Pipeline time: ~1m42s (Groq)

## What Needs Attention
- Resume pipeline UX redesign (Sprints 61-65)
- Apply pending DB migrations

#status/in-progress
