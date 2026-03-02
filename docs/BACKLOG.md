# Backlog — Resume Agent

## Epic: Legacy Code Migration

### Story: Decommission Legacy `agent/` Directory
- **As a** developer
- **I want to** migrate `routes/sessions.ts` to use the coordinator-based pipeline
- **So that** the legacy `agent/` directory can be deleted, reducing codebase by ~2000 lines
- **Acceptance Criteria:**
  - [ ] `routes/sessions.ts` uses `agents/coordinator.ts` instead of `agent/loop.ts`
  - [ ] Chat-based coaching works identically after migration
  - [ ] `server/src/agent/` directory deleted
  - [ ] `server/src/agents/pipeline.ts` deleted (no active imports)
  - [ ] No dead code references remain
- **Estimated complexity:** Large
- **Dependencies:** All current sprint work complete

---

## Epic: Platform Expansion

### Story: 33-Agent Platform — Phase 2
- **As a** product owner
- **I want to** complete the platform runtime for multi-product agent deployment
- **So that** we can launch additional agent-powered products beyond resume
- **Acceptance Criteria:**
  - [x] Agent bus supports cross-product routing (Sprint 11, Story 7)
  - [x] Agent registry supports capability-based discovery (Sprint 11, Story 8)
  - [x] Lifecycle hooks wired in agent loop (Sprint 11, Story 9)
  - [x] Resume agents register capabilities (Sprint 11, Story 8)
  - [ ] Redis/NATS bus adapter for distributed deployment
  - [ ] Agent hot-reload without server restart
  - [ ] Cross-product authentication and authorization
  - [ ] Platform admin dashboard for agent monitoring
- **Estimated complexity:** Large
- **Dependencies:** Sprint 11 platform stories (complete)

---

## Epic: Technical Debt

### Story: Fix Remaining Pre-Existing Test Failures
- **As a** developer
- **I want to** fix the 2 pre-existing failures in `agents-gap-analyst.test.ts`
- **So that** the test suite is 100% clean
- **Acceptance Criteria:**
  - [ ] Both failing tests pass
  - [ ] No regressions in other tests
- **Estimated complexity:** Small
- **Dependencies:** None

### Story: Resolve MaxListenersExceededWarning Root Cause
- **As a** developer
- **I want to** eliminate the need for `setMaxListeners(50)` calls
- **So that** listener management is clean rather than threshold-bumped
- **Acceptance Criteria:**
  - [ ] Identify all listener accumulation patterns
  - [ ] Refactor to properly manage listener lifecycle
  - [ ] Remove `setMaxListeners` calls
- **Estimated complexity:** Medium
- **Dependencies:** None
