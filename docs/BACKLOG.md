# Backlog — Resume Agent

## Epic: Platform Decoupling (COMPLETE — Sprint 12)

The Product Definition Layer is complete. `ProductConfig`, `runProductPipeline()`, and `createProductRoutes()` form the generic multi-product runtime. The resume product runs through the generic coordinator. The cover letter POC validates the abstraction with a second product.

### Follow-up: Migrate `routes/pipeline.ts` to Product Route Factory
- **As a** developer
- **I want to** refactor `routes/pipeline.ts` to use `createProductRoutes(resumeProductConfig)`
- **So that** the resume product has no bespoke routing code outside of `product.ts`
- **Acceptance Criteria:**
  - [ ] `routes/pipeline.ts` replaced by `createProductRoutes(resumeProductConfig)` mount in `index.ts`
  - [ ] All existing pipeline behaviors preserved (session management, heartbeat, lock handling, SSE reconnect)
  - [ ] TypeScript clean, all server tests pass
  - [ ] E2E full pipeline still passes
- **Estimated complexity:** Large
- **Dependencies:** Sprint 12 (product-coordinator, product-route-factory — complete)

### Follow-up: Remove Deprecated `TOOL_MODEL_MAP`
- **As a** developer
- **I want to** delete `TOOL_MODEL_MAP` from `llm.ts`
- **So that** all model routing goes through the `model_tier` + `resolveToolModel()` path
- **Acceptance Criteria:**
  - [ ] All tools in `strategist/tools.ts` have `model_tier` set
  - [ ] All tools in `craftsman/tools.ts` have `model_tier` set (done in Sprint 12)
  - [ ] All tools in `producer/tools.ts` have `model_tier` set (done in Sprint 12)
  - [ ] `TOOL_MODEL_MAP` deleted
  - [ ] `resolveToolModel()` simplified (no fallback branch)
  - [ ] TypeScript clean, all server tests pass
- **Estimated complexity:** Small
- **Dependencies:** Sprint 12 (model_tier on tool defs — partial, Strategist tools not yet updated)

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
  - [ ] Redis/NATS bus adapter for distributed deployment
  - [ ] Agent hot-reload without server restart
  - [ ] Cross-product authentication and authorization
  - [ ] Platform admin dashboard for agent monitoring
- **Estimated complexity:** Large
- **Dependencies:** Sprint 12 (complete)

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

### Story: Rename `interview_transcript` to `questionnaire_responses` in PipelineState
- **As a** developer
- **I want to** rename the `interview_transcript` field in `PipelineState`
- **So that** the field name accurately reflects that it is populated via the questionnaire path (not a single-question interview)
- **Acceptance Criteria:**
  - [ ] `PipelineState.interview_transcript` renamed to `questionnaire_responses`
  - [ ] All references updated (coordinator, craftsman, types)
  - [ ] TypeScript clean, all server tests pass
- **Estimated complexity:** Small
- **Dependencies:** None (Sprint 10 removed the single-question interview tool)
