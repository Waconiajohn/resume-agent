# Backlog — Resume Agent

## Epic: Platform Decoupling (COMPLETE — Sprint 12)

The Product Definition Layer is complete. `ProductConfig`, `runProductPipeline()`, and `createProductRoutes()` form the generic multi-product runtime. The resume product runs through the generic coordinator. The cover letter POC validates the abstraction with a second product.

### ~~Follow-up: Migrate `routes/pipeline.ts` to Product Route Factory~~ COMPLETE (Sprint 13, Stories 3-6)
`routes/pipeline.ts` deleted. Resume pipeline now uses `createProductRoutes()` with lifecycle hooks via `routes/resume-pipeline.ts`.

### ~~Follow-up: Remove Deprecated `TOOL_MODEL_MAP`~~ COMPLETE (Sprint 13, Story 1)
`TOOL_MODEL_MAP` deleted. All 26 tools have `model_tier` set. `resolveToolModel()` simplified.

### ~~Follow-up: Rename `interview_transcript` to `questionnaire_responses`~~ COMPLETE (Sprint 13, Story 2)
Field renamed across all references. No functional change.

---

## Epic: Legacy Code Migration

### ~~Story: Decommission Legacy `agent/` Directory~~ COMPLETE (Sprint 7)
Legacy `agent/` directory deleted (8,653 lines removed). Chat route migrated to coordinator-based pipeline.

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
  - [x] Product landing pages at `/tools/:slug` (Sprint 15, Story 6)
  - [x] Cross-product context consumption — cover letter bootstraps from resume context (Sprint 15, Story 7)
  - [ ] Redis/NATS bus adapter for distributed deployment
  - [ ] Agent hot-reload without server restart
  - [ ] Cross-product authentication and authorization
  - [ ] Platform admin dashboard for agent monitoring
  - [ ] Migrate product catalog from static constant to DB-driven (when >15 products)
- **Estimated complexity:** Large
- **Dependencies:** Sprint 12 (complete)

### ~~Story: Consumer Dashboard — Product Landing Pages~~ COMPLETE (Sprint 15, Story 6)
Product landing page component at `/tools/:slug` with features grid, CTA, back navigation. Catalog grid routes through landing pages.

### ~~Story: Cross-Product Context Consumption~~ COMPLETE (Sprint 15, Story 7)
Cover letter product reads positioning strategy + evidence from `user_platform_context` on start. Missing context gracefully handled.

---

## Epic: Technical Debt

### Story: Clean Orphaned Props from ChatPanel and WorkflowStatsRail
- **As a** developer
- **I want to** remove `runtimeMetrics`, `pipelineActivity`, and other props that lost their consumers during Sprint 16 declutter
- **So that** component interfaces reflect their actual usage
- **Acceptance Criteria:**
  - [ ] Audit ChatPanel and WorkflowStatsRail for props no longer consumed
  - [ ] Remove unused props and update all callers
  - [ ] TypeScript clean, all tests pass
- **Estimated complexity:** Small
- **Dependencies:** Sprint 16 (complete)

### Story: IntelligenceActivityFeed Message Deduplication
- **As a** user
- **I want to** not see the same transparency message repeated in the activity feed
- **So that** the feed shows a useful history rather than duplicated updates
- **Acceptance Criteria:**
  - [ ] Adjacent duplicate messages are collapsed (show once with a count)
  - [ ] Near-duplicates (same message within 5s) are deduplicated
  - [ ] Tests cover dedup logic
- **Estimated complexity:** Small
- **Dependencies:** Sprint 16 Story 3 (complete)

### ~~Story: Fix Remaining Pre-Existing Test Failures~~ COMPLETE
All 29 tests in `agents-gap-analyst.test.ts` now pass. The 2 pre-existing failures were resolved.

### ~~Story: Resolve MaxListenersExceededWarning Root Cause~~ COMPLETE (Sprint 15, Story 3)
All 6 `setMaxListeners` calls removed. `agent-loop.ts` uses per-round scoped AbortControllers with proper cleanup.

### ~~Story: Rename `interview_transcript` to `questionnaire_responses`~~ COMPLETE (Sprint 13, Story 2)

### ~~Story: Deduplicate Workflow Persistence Helpers~~ COMPLETE (Sprint 15, Story 2)
Shared `lib/workflow-persistence.ts` created. Both `event-middleware.ts` and `route-hooks.ts` import from shared module.

### ~~Story: Fix `resumes-edit.test.ts` TypeScript Error~~ COMPLETE (Sprint 15, Story 1)
Fixed null-to-Record cast at line 292. `tsc --noEmit` clean.

---

## Epic: Cover Letter Product

### ~~Story: Cover Letter Frontend UI~~ COMPLETE (Sprint 18)
Intake form, SSE streaming hook, CoverLetterScreen workspace, text + PDF export. 7 stories delivered.

### Story: Cover Letter DOCX Export
- **As a** user
- **I want to** download my cover letter as a DOCX file
- **So that** I can edit it in Word before submitting
- **Acceptance Criteria:**
  - [ ] DOCX export using docx library (same as resume DOCX export)
  - [ ] Filename: `{Name}_{Company}_Cover_Letter.docx`
  - [ ] Export button in CoverLetterScreen
- **Estimated complexity:** Small
- **Dependencies:** None

### Story: Cover Letter Dashboard Integration
- **As a** user
- **I want to** see my cover letter sessions in the dashboard
- **So that** I can revisit and re-export previous cover letters
- **Acceptance Criteria:**
  - [ ] Cover letter sessions visible in Sessions tab
  - [ ] Ability to view completed cover letter text
  - [ ] Re-export to PDF/text
- **Estimated complexity:** Medium
- **Dependencies:** None

### Story: Cover Letter Master Resume Pre-population
- **As a** user
- **I want to** have my default resume auto-filled in the cover letter intake
- **So that** I don't have to paste my resume each time
- **Acceptance Criteria:**
  - [ ] Load default master resume on mount
  - [ ] Pre-fill resume_text field
  - [ ] Allow override by pasting different resume
- **Estimated complexity:** Small
- **Dependencies:** None

### Story: Full Waitlist Backend
- **As a** product owner
- **I want to** collect emails from users interested in coming-soon products
- **So that** I can notify them when products launch
- **Acceptance Criteria:**
  - [ ] Email collection endpoint
  - [ ] Waitlist table in Supabase
  - [ ] Notification system on product launch
- **Estimated complexity:** Medium
- **Dependencies:** None
