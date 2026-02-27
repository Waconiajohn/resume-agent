# Backlog — Resume Agent

## Epic: Production Hardening

### Story: Fix MaxListenersExceededWarning on Long Sessions
- **As a** system operator
- **I want to** resolve the MaxListenersExceeded warning that fires on long sessions
- **So that** we don't leak abort listeners and risk memory issues
- **Acceptance Criteria:**
  - [ ] Identify all places where abort listeners are added without cleanup
  - [ ] Ensure listener cleanup in all `finally` blocks
  - [ ] No MaxListenersExceededWarning in logs during a full pipeline run
- **Estimated complexity:** Medium
- **Dependencies:** None

### Story: Fix 409 Conflict Errors on Frontend Responses (Bug 18)
- **As a** user
- **I want to** not see errors when responding to pipeline prompts
- **So that** the interaction feels reliable
- **Acceptance Criteria:**
  - [ ] Frontend prevents sending messages while agent is still processing
  - [ ] Pending gate queue properly serializes concurrent gate responses
  - [ ] No 409 errors during normal pipeline interaction
- **Estimated complexity:** Medium
- **Dependencies:** None

### Story: Fix PDF Unicode Character Rendering
- **As a** user
- **I want to** export PDFs without `?` characters replacing special characters
- **So that** my resume looks professional in downloaded format
- **Acceptance Criteria:**
  - [ ] Identify all Unicode characters that render as `?` in PDF export
  - [ ] Apply font fallback or character substitution
  - [ ] Verify with sample resumes containing em-dashes, bullets, smart quotes
- **Estimated complexity:** Medium
- **Dependencies:** None

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

### Story: Quality Review Transparency
- **As a** user
- **I want to** see what the Producer's quality checks found
- **So that** I understand why changes were suggested
- **Acceptance Criteria:**
  - [ ] Quality dashboard shows specific findings from each check
  - [ ] ATS compliance results visible per-system
  - [ ] Narrative coherence score and rationale shown
- **Estimated complexity:** Medium
- **Dependencies:** None

### Story: Section Workbench Polish
- **As a** user
- **I want to** a more intuitive section editing experience
- **So that** reviewing and editing sections feels effortless
- **Acceptance Criteria:**
  - [ ] Smooth undo/redo with visual feedback
  - [ ] Clear indication of pending vs. applied changes
  - [ ] Responsive layout at all viewport sizes
- **Estimated complexity:** Medium
- **Dependencies:** None

---

## Epic: Quality & Reliability

### Story: Fix Revision Loop After User Approval (Bug 16)
- **As a** user
- **I want to** approve a section and move on
- **So that** the agent doesn't re-propose edits I've already approved
- **Acceptance Criteria:**
  - [ ] Once a section is approved, the Craftsman does not revisit it
  - [ ] Approval state is persisted and checked before any revision attempt
  - [ ] E2E test verifies no post-approval revision proposals
- **Estimated complexity:** Medium
- **Dependencies:** None

### Story: Fix Context Forgetfulness on Long Sessions (Bug 17)
- **As a** user
- **I want to** the agent to remember all completed sections during a long run
- **So that** later sections don't contradict earlier ones
- **Acceptance Criteria:**
  - [ ] Identify where context is lost (context window overflow vs. state management)
  - [ ] Implement context summarization or scratchpad persistence
  - [ ] Verify with 8+ section pipeline run
- **Estimated complexity:** Large
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

### Story: Additional Executive Resume Templates
- **As a** user
- **I want to** choose from more than 5 resume templates
- **So that** I can find a style that matches my industry
- **Acceptance Criteria:**
  - [ ] At least 3 new templates added to resume-formatting-guide
  - [ ] Producer's `select_template` tool supports new templates
  - [ ] Templates pass ATS compliance checks
- **Estimated complexity:** Medium
- **Dependencies:** None
