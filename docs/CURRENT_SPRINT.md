# Sprint 13: Pipeline Migration & Platform Cleanup
**Goal:** Migrate the resume pipeline to the product route factory, eliminating the last resume-specific monolith (routes/pipeline.ts — 1,985 lines). Clean up deprecated TOOL_MODEL_MAP and rename stale field.
**Started:** 2026-03-02

## Stories This Sprint
1. [x] Story 1: Remove Deprecated TOOL_MODEL_MAP — [status: done] (Small)
2. [x] Story 2: Rename interview_transcript to questionnaire_responses — [status: done] (Small)
3. [x] Story 3: Extend Product Route Factory with Event & Lifecycle Hooks — [status: done] (Medium)
4. [x] Story 4: Extract Resume SSE Event Processing — [status: done] (Large)
5. [x] Story 5: Extract Resume Route Hooks (Start, Respond, Status) — [status: done] (Large)
6. [x] Story 6: Wire Resume Pipeline to Product Route Factory & Delete pipeline.ts — [status: done] (Large)
7. [x] Story 7: Documentation & Backlog Update — [status: done] (Small)

## Execution Order
- Phase 1 (Stories 1, 2): Parallel, no dependencies — COMPLETE
- Phase 2 (Story 3): Foundation for extraction — COMPLETE
- Phase 3 (Stories 4, 5): Parallel, both depend on Story 3 — COMPLETE
- Phase 4 (Story 6): Depends on Stories 3, 4, 5 — COMPLETE
- Phase 5 (Story 7): After all code — COMPLETE

## Out of Scope (Explicitly)
- Frontend UI for cover letters (backend-only POC)
- Database schema for cover letter sessions
- Platform Phase 3 (Redis/NATS bus, agent hot-reload, cross-product auth)
- Platform admin dashboard
- MaxListenersExceededWarning root cause
