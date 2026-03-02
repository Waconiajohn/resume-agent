# Backlog — Resume Agent

## Epic: Production Hardening

### Story: Fix SSE Type Mismatch Between Old and New Connections
- **As a** developer
- **I want to** resolve the `as never` cast in pipeline.ts SSE handling
- **So that** the type system catches real bugs
- **Acceptance Criteria:**
  - [ ] Unify SSE connection types or separate old/new cleanly
  - [ ] Remove `as never` cast
  - [ ] TypeScript compiles without workarounds
- **Estimated complexity:** Small
- **Dependencies:** None

### Story: Fix Usage Tracking Cross-Contamination
- **As a** system operator
- **I want to** accurate per-session usage tracking
- **So that** billing and analytics are correct
- **Acceptance Criteria:**
  - [ ] `recordUsage()` only updates the calling session's accumulator
  - [ ] No cross-session contamination in concurrent pipeline runs
  - [ ] Unit test verifies isolation
- **Estimated complexity:** Small
- **Dependencies:** None

---

## Epic: User Experience Polish

### Story: Fix Center Column Scroll Behavior
- **As a** user
- **I want to** scroll the main content area without interference
- **So that** I can review long conversations comfortably
- **Acceptance Criteria:**
  - [ ] Center column scrolls independently of side panels
  - [ ] No content hidden behind fixed headers/footers
  - [ ] Smooth scroll behavior on all panel transitions
- **Estimated complexity:** Small
- **Dependencies:** None

---

## Epic: Quality & Reliability

### Story: Prevent ATS Auto-Revisions After User Approval
- **As a** user
- **I want to** my approved content to remain unchanged
- **So that** ATS compliance checks don't silently modify my approved text
- **Acceptance Criteria:**
  - [ ] ATS revisions require explicit user consent
  - [ ] Approved sections are marked immutable to automated changes
  - [ ] Any post-approval change surfaces to the user for re-approval
- **Estimated complexity:** Medium
- **Dependencies:** None

---

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

### Story: 33-Agent Platform Foundation
- **As a** product owner
- **I want to** extend the agent runtime to support the full 33-agent platform
- **So that** we can launch additional agent-powered products
- **Acceptance Criteria:**
  - [ ] Agent bus supports cross-product routing
  - [ ] Agent registry for dynamic agent discovery
  - [ ] Shared runtime infrastructure documented and tested
- **Estimated complexity:** Large
- **Dependencies:** All production hardening stories
