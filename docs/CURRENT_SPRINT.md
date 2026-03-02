# Sprint 15: Tech Debt Sweep & Product Landing Pages
**Goal:** Clear accumulated tech debt (TypeScript errors, duplicate code, listener warnings), then build product landing pages and cross-product context consumption.
**Started:** 2026-03-02

## Stories This Sprint
1. [x] Story 1: Fix `resumes-edit.test.ts` TypeScript Error — [status: done] (Small)
2. [x] Story 2: Deduplicate Workflow Persistence Helpers — [status: done] (Small)
3. [x] Story 3: Resolve MaxListenersExceededWarning Root Cause — [status: done] (Medium)
4. [x] Story 4: Clean Stale Backlog and Documentation — [status: done] (Small)
5. [x] Story 5: Extend ProductDefinition with Landing Page Data — [status: done] (Small)
6. [x] Story 6: Build Product Landing Page Component — [status: done] (Medium)
7. [x] Story 7: Cross-Product Context Consumption in Cover Letter — [status: done] (Medium)
8. [x] Story 8: Sprint 15 Documentation & Backlog Update — [status: done] (Small)

## Execution Order
- Phase A — Tech Debt:
  - Parallel Group 1: Stories 1, 2, 4 (independent, all Small) — COMPLETE
  - Sequential: Story 3 (after Group 1) — COMPLETE
- Phase B — Product Landing Pages:
  - Sequential: Story 5 → Story 6 — COMPLETE
- Phase C — Cross-Product Context:
  - Story 7 — COMPLETE
- Phase D — Documentation:
  - Story 8 — COMPLETE

## Out of Scope (Explicitly)
- Full waitlist backend (email collection, notifications)
- Cover letter frontend UI (separate epic)
- Redis/NATS bus adapter
- Agent hot-reload
- Platform admin dashboard
- Interview prep or LinkedIn product implementations
