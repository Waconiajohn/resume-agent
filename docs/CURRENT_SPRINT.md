# Sprint 6: Product Polish, Scale Readiness & Launch Prep
**Goal:** Ship production-quality frontend (split god files, add component/hook tests), harden backend (Zod validation, usage persistence, DB pipeline limits, Redis rate limiting), document scaling strategy, clean up legacy code, fix deployment config, and integrate Stripe billing.
**Started:** 2026-02-28

---

## Track 1 — Product Optimization (Stories 1-5)

1. [ ] Story 1: Split `useAgent.ts` into Focused Hooks — [status: not started]
2. [ ] Story 2: Split `CoachScreen.tsx` into Sub-Components — [status: not started]
3. [ ] Story 3: Add Zod Schemas for LLM Output Validation — [status: not started]
4. [ ] Story 4: Legacy Code Cleanup — [status: not started]
5. [ ] Story 5: Fix Deployment Configuration — [status: not started]

## Track 2 — Scale Readiness (Stories 6-9)

6. [ ] Story 6: Periodic Usage Flush to Database — [status: not started]
7. [ ] Story 7: Database-Backed Running Pipeline Limits — [status: not started]
8. [x] Story 8: Redis-Backed Rate Limiting — [status: done]
9. [ ] Story 9: SSE Event Broadcasting Architecture Doc + Spike — [status: not started]

## Track 3 — Launch Prep (Stories 10-13)

10. [ ] Story 10: Frontend Component Tests — Panels — [status: not started]
11. [ ] Story 11: Frontend Hook Tests — useAgent Split Hooks — [status: not started] (depends on Story 1)
12. [ ] Story 12: Stripe Billing Integration — [status: not started]
13. [ ] Story 13: Sprint 6 Retrospective — [status: not started]

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
