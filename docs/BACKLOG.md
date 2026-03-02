# Backlog — Resume Agent

## Epic: Platform Decoupling (COMPLETE — Sprint 12)

The Product Definition Layer is complete. `ProductConfig`, `runProductPipeline()`, and `createProductRoutes()` form the generic multi-product runtime. The resume product runs through the generic coordinator. The cover letter POC validates the abstraction with a second product.

### ~~Follow-up: Migrate `routes/pipeline.ts` to Product Route Factory~~ COMPLETE (Sprint 13, Stories 3-6)
`routes/pipeline.ts` deleted. Resume pipeline now uses `createProductRoutes()` with lifecycle hooks via `routes/resume-pipeline.ts`.

### ~~Follow-up: Remove Deprecated `TOOL_MODEL_MAP`~~ COMPLETE (Sprint 13, Story 1)
`TOOL_MODEL_MAP` deleted. All 26 tools have `model_tier` set. `resolveToolModel()` simplified.

### Follow-up: Rename `interview_transcript` to `questionnaire_responses` COMPLETE (Sprint 13, Story 2)
Field renamed across all references. No functional change.

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

### Story: 33-Agent Platform — Phase 3
- **As a** product owner
- **I want to** continue expanding the platform runtime for multi-product deployment
- **So that** we can launch additional agent-powered products beyond resume and cover letter
- **Acceptance Criteria:**
  - [x] Agent bus supports cross-product routing (Sprint 11, Story 7)
  - [x] Agent registry supports capability-based discovery (Sprint 11, Story 8)
  - [x] Lifecycle hooks wired in agent loop (Sprint 11, Story 9)
  - [x] ProductConfig + runProductPipeline generic coordinator (Sprint 12, Stories 1-3)
  - [x] Product route factory (Sprint 12, Story 5)
  - [x] Cover letter POC validates multi-product abstraction (Sprint 12, Stories 6-7)
  - [x] Platform product catalog UI at `/tools` (Sprint 14, Story 7)
  - [x] Shared user context data model for cross-product access (Sprint 14, Story 8)
  - [ ] Redis/NATS bus adapter for distributed deployment
  - [ ] Agent hot-reload without server restart
  - [ ] Cross-product authentication and authorization
  - [ ] Platform admin dashboard for agent monitoring
  - [ ] Migrate product catalog from static constant to DB-driven (when >15 products)
- **Estimated complexity:** Large
- **Dependencies:** Sprint 12 (complete)

### Story: Consumer Dashboard — Product Landing Pages
- **As a** user
- **I want to** see a product-specific landing page when I click an active product in the catalog
- **So that** I understand what the product does before starting a session
- **Acceptance Criteria:**
  - [ ] Each active product has a landing page component
  - [ ] Landing page shows product description, key features, and "Start Session" CTA
  - [ ] Coming-soon products show a waitlist/notification signup
- **Estimated complexity:** Medium
- **Dependencies:** Sprint 14, Story 7 (complete)

### Story: Cross-Product Context Consumption
- **As a** future product (cover letter, interview prep)
- **I want to** bootstrap from the user's existing positioning strategy and evidence
- **So that** the user doesn't have to re-enter information across products
- **Acceptance Criteria:**
  - [ ] Cover letter product reads positioning strategy from user_platform_context on start
  - [ ] Evidence items are available to interview prep product
  - [ ] Missing context gracefully handled (first-time user has no prior context)
- **Estimated complexity:** Medium
- **Dependencies:** Sprint 14, Story 8 (complete)

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

### ~~Story: Rename `interview_transcript` to `questionnaire_responses`~~ COMPLETE (Sprint 13, Story 2)

### Story: Deduplicate Workflow Persistence Helpers
- **As a** developer
- **I want to** consolidate the duplicate `persistWorkflowArtifactBestEffort`, `upsertWorkflowNodeStatusBestEffort`, and `resetWorkflowNodesForNewRunBestEffort` functions
- **So that** there is a single source of truth for workflow DB operations
- **Acceptance Criteria:**
  - [ ] Shared helpers moved to a common module (e.g., `lib/workflow-persistence.ts`)
  - [ ] Both `event-middleware.ts` and `route-hooks.ts` import from the shared module
  - [ ] No functional change, all tests pass
- **Estimated complexity:** Small
- **Dependencies:** None

### Story: Fix `resumes-edit.test.ts` TypeScript Error
- **As a** developer
- **I want to** fix the pre-existing `tsc --noEmit` error at line 292 (null-to-Record cast)
- **So that** server TypeScript is fully clean
- **Acceptance Criteria:**
  - [ ] `cd server && npx tsc --noEmit` produces zero errors
- **Estimated complexity:** Small
- **Dependencies:** None
