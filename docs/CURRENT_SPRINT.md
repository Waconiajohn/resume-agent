# Sprint 20: UX Redesign — Progressive Disclosure
**Goal:** Replace the static document-always layout with a 3-mode progressive disclosure UI that shows the right interface for each pipeline phase: Interview Mode, Review Mode, and Edit Mode.
**Started:** 2026-03-04

## Stories This Sprint
1. [x] Story 1: `useUIMode` hook — derive UI mode from pipeline phase — done
2. [x] Story 2: `InterviewLayout` — centered panel container — done
3. [x] Story 3: Wire mode-conditional rendering into CoachScreen — done
4. [x] Story 4: Inline review controls on LiveResumeDocument — done
5. [x] Story 5: Review Mode progress toolbar — done
6. [x] Story 6: Edit Mode refinements — done
7. [x] Story 7: Mode transition animation — done
8. [x] Story 8: Tests, edge cases, polish — done

## QA Review — Issues Found & Fixed
- ModeTransition: timeout cleanup on unmount (memory leak) — fixed
- ModeTransition: stale children closure — fixed via ref
- ModeTransition: prevModeRef timing bug in message lookup — fixed
- InterviewLayout: unused `useMemo` import — removed
- InlineReviewBar: Cmd+Enter scoped to skip text inputs — fixed
- InlineReviewBar: Edit button made functional — fixed

## Verification
- `tsc --noEmit` — clean (0 errors)
- `vitest run` — 426 tests passing (30 files), including 17 new useUIMode tests
- QA agent review completed with all critical/medium issues resolved

## Out of Scope (Explicitly)
- Playwright E2E tests for mode transitions (backlog)
- ContextPanel content redistribution per mode (currently renders same content in review/edit)
- Document-centric layout further redesign
