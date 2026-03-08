# Project Status

> Updated every session by Claude. This is the living snapshot of where things stand.

## Last Updated
2026-03-08 | Post-sprint fix-up (Session 43)

## Current State
- **Phases 1A, 1B, 1C, 2, 3, 4A, 4B, 5 complete** per Master Build Plan
- **Sprint 49 done:** Emotional Intelligence Layer — momentum tracking, cognitive reframing, resource library, ask a coach
- **Session 41:** positioning-coach.ts fixes (research context threading, category warn log, follow-up ID collision) + 14 test repairs
- **Session 42:** Fix 5 — `distress_resources` SSE event added to onboarding pipeline + 7 broken platform-context tests repaired
- **Session 43:** Fixes 6/7/8 — atomic `upsert_platform_context` Postgres RPC + migration, `deleteUserContext`, `getLatestUserContext` + full test suite update (20 → 33 tests)
- **Next:** Phase 6 (Retirement Bridge), Phase 7 (B2B Outplacement), or tech debt
- **All systems green** -- tsc clean, 0 test failures

## Test Health
- Server: 1,909 tests passing
- App: 1,004 tests passing
- E2E: 2 tests passing
- TypeScript: both server and app tsc clean

## Active Concerns
- Bug 18 (409 conflicts) still open
- 6 DB migrations need to be applied to production Supabase (user_momentum + atomic_context_upsert)
- Thank You Note cross-room navigation not yet functional

## Recent Decisions
- Momentum tracking is deterministic CRUD, not an agent -- streaks and wins computed from activity log
- Cognitive reframing uses MODEL_MID for coaching message generation with static fallbacks
- Resource library is static content organized by coaching methodology topics (not a DB-driven CMS)
- Ask a Coach submits to coaching_requests table for human review
- Stall detection heuristics: 5-day inactivity, 14-day pipeline stall, 3+ rejections in 7 days

## What's Working Well
- Emotional intelligence layer adds warmth without being intrusive
- CoachingNudgeBar integrates naturally into DashboardHome
- MomentumCard provides at-a-glance engagement metrics
- Streak computation handles edge cases well (gaps, today vs yesterday)

## What Needs Attention
- 5 DB migrations need to be applied to Supabase
- Platform catalog UI needs updating to show new products
- Resource library content is static — future: pull from CMS or coaching methodology

## Key Metrics
- Total agents built: 17 (of 33 planned) + 2 simulation sub-agents (Mock Interview, Counter-Offer)
- Total tests: 2,913 (1,909 server + 1,004 app)
- Estimated pipeline cost: ~$0.08/run (Groq)
- Pipeline time: ~1m42s (Groq)

#status/in-progress
