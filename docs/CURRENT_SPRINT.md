# Sprint 6: Product Polish, Scale Readiness & Launch Prep
**Goal:** Ship production-quality frontend (split god files, add component/hook tests), harden backend (Zod validation, usage persistence, DB pipeline limits, Redis rate limiting), document scaling strategy, clean up legacy code, fix deployment config, and integrate Stripe billing.
**Started:** 2026-02-28
**Completed:** 2026-02-28

---

## Track 1 — Product Optimization (Stories 1-5)

1. [x] Story 1: Split `useAgent.ts` into Focused Hooks — [status: done]
2. [x] Story 2: Split `CoachScreen.tsx` into Sub-Components — [status: done]
3. [x] Story 3: Add Zod Schemas for LLM Output Validation — [status: done]
4. [x] Story 4: Legacy Code Cleanup — [status: done]
5. [x] Story 5: Fix Deployment Configuration — [status: done]

## Track 2 — Scale Readiness (Stories 6-9)

6. [x] Story 6: Periodic Usage Flush to Database — [status: done]
7. [x] Story 7: Database-Backed Running Pipeline Limits — [status: done]
8. [x] Story 8: Redis-Backed Rate Limiting — [status: done]
9. [x] Story 9: SSE Event Broadcasting Architecture Doc + Spike — [status: done]

## Track 3 — Launch Prep (Stories 10-13)

10. [x] Story 10: Frontend Component Tests — Panels — [status: done]
11. [x] Story 11: Frontend Hook Tests — useAgent Split Hooks — [status: done]
12. [x] Story 12: Stripe Billing Integration — [status: done]
13. [x] Story 13: Sprint 6 Retrospective — [status: done]

---

## Execution Order

**Phase 1 — Frontend refactoring (parallel):** Stories 1, 2
**Phase 2 — Backend hardening (parallel):** Stories 3, 4, 5
**Phase 3 — Scaling (parallel):** Stories 6, 7, 8, 9
**Phase 4 — Frontend tests (sequential, depends on Story 1):** Stories 10, then 11
**Phase 5 — Billing:** Story 12
**Phase 6 — Docs:** Story 13

## Out of Scope (Explicitly)
- E2E test expansion (deferred from Sprint 4)
- Master Resume Viewer Page
- Redis bus implementation (beyond rate limiting)
- New pipeline stages or agent additions
- Chat route migration off legacy agent/
