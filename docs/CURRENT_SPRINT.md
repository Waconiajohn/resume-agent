# Sprint 4: Bug Fixes, Test Coverage, UX Polish, Platform Prep
**Goal:** Close the remaining known bugs, meaningfully grow test coverage, polish the user experience, and lay the architectural groundwork for the broader 33-agent platform.
**Started:** 2026-02-28

---

## Track 1 — Bug Fixes (Stories 1-5)

1. [x] Story 1: Fix 409 Conflict Errors (Frontend Gate Collision) — [status: done]
   - **As a** user interacting with the pipeline
   - **I want** the frontend to avoid sending messages while the agent is actively processing
   - **So that** I don't see 409 errors or lose responses
   - **Acceptance Criteria:**
     - [x] App.tsx adds a gate-active guard that optimistically disables the send button when a gate is pending
     - [x] Consecutive 409 errors no longer crash the session
   - **Estimated complexity:** Small

2. [x] Story 2: Fix Gap Analyst Classification Bug — [status: done]
   - **As a** pipeline consumer
   - **I want** gap analyst classification to use consistent terminology
   - **So that** `significant` fit classifications are correctly labeled and tests pass
   - **Acceptance Criteria:**
     - [x] `significant` renamed to `strong` (without custom text requirement) in `gap-analyst.ts`
     - [x] Pre-existing test failures in `agents-gap-analyst.test.ts` are resolved
   - **Estimated complexity:** Small

3. [x] Story 3: Fix Revision Loop After Approval — [status: done]
   - **As a** user who approves a section
   - **I want** the agent to move forward after I approve
   - **So that** I am not presented with the same section again after explicitly approving it
   - **Acceptance Criteria:**
     - [x] Craftsman does not re-propose a section the user has already approved in the current session
     - [x] Revision state is correctly cleared after user approval
     - [x] Existing section review tests pass
   - **Estimated complexity:** Medium
   - **Dependencies:** Story 2 done

4. [x] Story 4: Fix Context Forgetfulness on Long Sessions — [status: done]
   - **As a** user with a multi-section resume
   - **I want** the agent to remember previously completed sections
   - **So that** late sections are not duplicated or written without context of earlier work
   - **Acceptance Criteria:**
     - [x] Sliding window in agent-loop.ts keeps first message + last 20, compacts middle
     - [x] Section writer does not re-introduce content already present in earlier sections
     - [x] No regressions in existing coordinator tests
   - **Estimated complexity:** Medium

5. [x] Story 5: Fix PDF Unicode Rendering — [status: done]
   - **As a** user exporting a PDF
   - **I want** all special characters (dashes, bullets, accented letters) to render correctly
   - **So that** the exported PDF is professional and readable
   - **Acceptance Criteria:**
     - [x] Replaced hand-rolled PDF with jsPDF for proper WinAnsi encoding
     - [x] sanitizePdfText preserves em-dashes, smart quotes, bullets, accented characters
   - **Estimated complexity:** Small

---

## Track 2 — Test Coverage (Stories 6-11)

6. [x] Story 6: Coordinator Integration Tests — [status: done]
   - **As a** developer
   - **I want** coordinator.ts covered by integration tests
   - **So that** critical orchestration logic (phase sequencing, gate handling, inter-agent routing) is regression-protected
   - **Acceptance Criteria:**
     - [ ] At least 10 new tests covering: Strategist→Craftsman handoff, blueprint gate approval/rejection, Craftsman→Producer handoff, revision request routing, pipeline completion + master resume save
     - [ ] Tests use stubs/mocks for agent loops — no live LLM calls
   - **Estimated complexity:** Large

7. [x] Story 7: Agent Tool Unit Tests — [status: done]
   - **As a** developer
   - **I want** the most critical agent tools covered by unit tests
   - **So that** tool regressions are caught before they reach the pipeline
   - **Acceptance Criteria:**
     - [ ] Tests for: `interview_candidate` budget enforcement, `classify_fit` evidence field validation, `self_review_section` false-pass guard, `check_anti_patterns` regex safety, `select_template` score bounds
     - [ ] At least 15 new tests total
   - **Estimated complexity:** Large

8. [x] Story 8: Gate and Revision Flow Tests — [status: done]
   - **As a** developer
   - **I want** the gate and revision flow tested end-to-end (without live LLM)
   - **So that** the pending-gate-queue, waitForUser, and revision loop are regression-protected
   - **Acceptance Criteria:**
     - [ ] Gate queue: enqueue, dequeue, double-consume prevention each have a test
     - [ ] Revision loop: max-iteration enforcement has a test
     - [ ] At least 8 new tests
   - **Estimated complexity:** Medium

9. [x] Story 9: Export Tests (PDF + DOCX) — [status: done]
   - **As a** developer
   - **I want** export functions covered by unit tests
   - **So that** rendering regressions (Unicode, field ordering, null fields) are caught automatically
   - **Acceptance Criteria:**
     - [ ] PDF export test: section ordering, null-safe fields, special character rendering
     - [ ] DOCX export test: font default, education field consistency, raw_sections guard
     - [ ] At least 10 new tests
   - **Estimated complexity:** Medium

10. [ ] Story 10: E2E Test Expansion — [status: not started]
    - **As a** developer
    - **I want** E2E tests to cover the repeat-user (master resume) path and blueprint rejection flow
    - **So that** these critical user journeys are regression-protected
    - **Acceptance Criteria:**
      - [ ] E2E test: second pipeline run loads existing master resume and skips redundant questions
      - [ ] E2E test: blueprint rejection sends user back to edit positioning angle
      - [ ] Both tests pass in the full-pipeline Playwright project
    - **Estimated complexity:** Large
    - **Dependencies:** Stories 3, 4 done

11. [x] Story 11: Anti-Pattern and Evidence Integrity Tests — [status: done]
    - **As a** developer
    - **I want** the Craftsman's quality check tools (anti-patterns, evidence integrity) covered by unit tests
    - **So that** quality gatekeeping regressions are caught automatically
    - **Acceptance Criteria:**
      - [ ] At least 6 tests for `check_anti_patterns` covering known patterns and edge cases
      - [ ] At least 4 tests for `check_evidence_integrity` covering fabrication detection thresholds
      - [ ] Stateful regex safety verified by tests
    - **Estimated complexity:** Medium

---

## Track 3 — UX Polish (Stories 12-17)

12. [x] Story 12: Quality Review Transparency Panel — [status: done]
    - **As a** user in the quality review stage
    - **I want** to see the scores and findings from adversarial review, ATS check, and humanize check
    - **So that** I understand what was reviewed and what was improved before the final export
    - **Acceptance Criteria:**
      - [ ] `quality_dashboard` panel displays scores from all three quality checks
      - [ ] Panel shows per-check pass/fail with key findings (not just raw scores)
      - [ ] Panel renders without crashing when any individual check score is missing
    - **Estimated complexity:** Medium

13. [x] Story 13: Workbench Scroll Fix — [status: done]
    - **As a** user reviewing a long section in the workbench
    - **I want** the workbench content area to scroll independently
    - **So that** I can read the full section without the page scrolling
    - **Acceptance Criteria:**
      - [x] `SectionWorkbench.tsx` has `min-h-0` on the content column to enable flex child scrolling
      - [x] Workbench does not overflow the viewport on sections with 10+ bullets
    - **Estimated complexity:** Small

14. [x] Story 14: Additional Resume Templates — [status: done]
    - **As a** user in the template selection stage
    - **I want** at least 2 additional executive resume templates to choose from
    - **So that** I can find a visual style that fits my industry and seniority
    - **Acceptance Criteria:**
      - [x] At least 2 new named templates defined in `formatting-guide.ts` (3 added: Non-Profit, Legal, Creative/Digital)
      - [x] Producer's `select_template` tool considers the new templates
      - [x] Template selection SSE event includes the new template names and rationale
    - **Estimated complexity:** Medium

15. [x] Story 15: Workbench Polish — [status: done]
    - **As a** user in the section workbench
    - **I want** the workbench to feel polished and professional
    - **So that** the experience matches the quality of the resume output
    - **Acceptance Criteria:**
      - [x] Responsive padding and touch targets (min 44px)
      - [x] Refining indicator with progress bar
      - [x] Responsive button labels
    - **Estimated complexity:** Medium

16. [x] Story 16: SSE Type Safety — [status: done]
    - **As a** developer
    - **I want** SSE event types to be properly exported and used without `as never` casts
    - **So that** the codebase compiles cleanly and SSE events are type-safe
    - **Acceptance Criteria:**
      - [x] `sessions.ts` exports `AnySSEEvent` and `SSEEmitterFn` types
      - [x] `sessions-runtime.test.ts` removes all `as never` casts
      - [x] `npx tsc --noEmit` passes on both `app/` and `server/`
    - **Estimated complexity:** Small

17. [x] Story 17: ATS Auto-Revision Prevention — [status: done]
    - **As a** user who has approved a section
    - **I want** ATS-triggered revisions to be shown to me before being applied
    - **So that** my approved content is not silently modified
    - **Acceptance Criteria:**
      - [ ] ATS check findings are presented as suggestions, not auto-applied edits
      - [ ] User can accept or dismiss each ATS suggestion individually
      - [ ] Accepted ATS suggestions trigger the existing revision flow (not a silent rewrite)
    - **Estimated complexity:** Large

---

## Track 4 — Platform Prep (Stories 18-22)

18. [x] Story 18: Extract Product Types from Runtime — [status: done]
    - **As a** platform architect
    - **I want** resume-specific types (MasterResume, EvidenceItem, PipelineState) separated from the agent runtime types
    - **So that** the runtime layer is domain-agnostic and reusable across all 33 platform agents
    - **Acceptance Criteria:**
      - [ ] `server/src/agents/runtime/agent-protocol.ts` contains only runtime-layer types (AgentTool, AgentContext, AgentConfig, AgentMessage)
      - [ ] Resume-product types live in `server/src/agents/types.ts` or a new `product-types.ts`
      - [ ] No circular imports introduced
      - [ ] All existing tests pass after the move
    - **Estimated complexity:** Medium

19. [x] Story 19: Agent Registry — [status: done]
    - **As a** platform architect
    - **I want** a central registry that maps agent names to their configurations and tool sets
    - **So that** the coordinator can instantiate agents by name without hard-coded imports
    - **Acceptance Criteria:**
      - [ ] `server/src/agents/registry.ts` defines `AgentRegistry` map (name → AgentConfig + tools)
      - [ ] Coordinator uses registry to look up and instantiate the 3 resume agents
      - [ ] Registry design supports adding a 4th agent without coordinator changes
      - [ ] TypeScript compiles clean
    - **Estimated complexity:** Medium
    - **Dependencies:** Story 18 done

20. [x] Story 20: Platform Architecture Document — [status: done]
    - **As a** developer joining the platform team
    - **I want** an architecture document that explains how the 33-agent platform is structured
    - **So that** I understand how the resume agent fits into the broader system
    - **Acceptance Criteria:**
      - [x] `docs/PLATFORM_BLUEPRINT.md` covers: agent runtime contract, bus protocol, coordinator pattern, product vs runtime type separation
      - [x] Document describes how a new agent would be added to the platform
      - [x] Document describes how a new product would be added to the platform
      - [x] Distributed bus requirements section covers Redis/NATS design questions
    - **Estimated complexity:** Small

21. [x] Story 21: Redis Bus Spike — [status: done]
    - **As a** platform architect
    - **I want** to evaluate replacing the in-memory `AgentBus` with a Redis-backed bus
    - **So that** agent communication survives server restarts and supports horizontal scaling
    - **Acceptance Criteria:**
      - [x] Spike document in `docs/DECISIONS.md` (ADR format) covers: Redis pub/sub vs streams vs sorted set, message ordering guarantees, latency impact, operational complexity
      - [x] A prototype `server/src/agents/runtime/agent-bus-redis.ts` demonstrates the proposed interface using Redis Streams
      - [x] Decision is made (rejected at current scale) with documented reasoning in ADR-007
    - **Estimated complexity:** Medium

22. [x] Story 22: Sprint 4 Retrospective — [status: done]
    - **As a** team
    - **I want** a formal retrospective for Sprint 4
    - **So that** we capture what worked, what didn't, and what to carry into Sprint 5
    - **Acceptance Criteria:**
      - [ ] Retrospective appended to `docs/SPRINT_LOG.md` following the standard format
      - [ ] All completed stories listed with brief summary
      - [ ] At least 3 "what went well" and 3 "what to improve" items documented
      - [ ] Technical debt section updated
    - **Estimated complexity:** Small

---

## Out of Scope (Explicitly)
- Master Resume Viewer Page (dedicated UI to browse/delete evidence items) — backlog
- Evidence quality scoring / relevance decay — backlog
- Merge audit trail (which session contributed which items) — backlog
- Cross-session analytics — backlog
- H5: Legacy `create-master-resume.ts` fixes — backlog
- Full Redis bus implementation (Story 21 is spike only)
- New pipeline stages or agent additions
- Billing / subscription changes
