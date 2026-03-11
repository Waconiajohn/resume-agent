# Project Status

> Updated every session by Claude. This is the living snapshot of where things stand.

## Last Updated
2026-03-10 | Session 74 (Full R1/R2/R3 Code Audit + Fixes)

## Current State
- **Sprint R3 complete** — all 16 stories done (11 LOW bugs + 4 cross-cutting pattern stories + Pattern 3)
- **Full code audit complete** — 216 files audited, 55 bugs found and fixed (2 CRITICAL + 10 HIGH + 21 MEDIUM + 22 LOW)
- Gate re-run architecture built — revision feedback now works across 6 products
- Platform context visibility badge in 12 rooms
- Session persistence (usePriorResult) in 6 rooms with backend APIs
- Coach navigation redesign DONE (6 stories)
- Resume Pipeline UX redesign plan exists (Sprints 61-65) but not yet started

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
