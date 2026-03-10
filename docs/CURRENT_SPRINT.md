# Sprint R3: Polish, Edge Cases & Cross-Cutting Patterns

**Goal:** Fix all LOW-severity bugs and address actionable cross-cutting patterns from the Platform UX Audit.
**Started:** 2026-03-10
**Audit Reference:** `docs/obsidian/30_Specs & Designs/Platform UX Audit.md`

## Stories This Sprint

### Story R3-1: Mock Interview magic constant + empty resume guard [L1, L2]
- **Acceptance Criteria:**
  - [x] `FULL_MODE_TOTAL` documented with server-side constant name
  - [x] Practice mode validates `resumeText` length before POST
- **Status:** done

### Story R3-2: Interview Debrief thank-you stub [L3]
- **Acceptance Criteria:**
  - [x] Removed no-op "Generate Thank You Notes" button (callback + prop removed)
- **Status:** done

### Story R3-3: Planner Handoff stale planners [L4]
- **Acceptance Criteria:**
  - [x] `planners` array cleared on qualify/match failure (3 branches + catch)
- **Status:** done

### Story R3-4: 90-Day Plan reset + accessibility [L5, L6]
- **Acceptance Criteria:**
  - [x] `targetRole`/`targetCompany` cleared on reset
  - [x] `<label>` elements have `htmlFor`/`id` association (5 inputs)
- **Status:** done

### Story R3-5: Daily Ops staleApplications rendering [L7]
- **Acceptance Criteria:**
  - [x] Already rendered in DailyOpsSection — no change needed
- **Status:** done (already implemented)

### Story R3-6: Network Intelligence double indicator + scan-jobs guard [L8, L9]
- **Acceptance Criteria:**
  - [x] Removed redundant active tab indicator strip
  - [x] `scan-jobs` removed from `ALWAYS_UNLOCKED` — now locked until CSV upload
- **Status:** done

### Story R3-7: Dashboard nudge bar coordination [L10]
- **Acceptance Criteria:**
  - [x] Max 1 nudge bar shown at a time (momentum priority > hardcoded)
- **Status:** done

### Story R3-8: Momentum feature flag guard [L11]
- **Acceptance Criteria:**
  - [x] 404 responses from momentum API silently ignored (no error state)
- **Status:** done

### Story R3-9: Product Catalog onboarding status [L12]
- **Acceptance Criteria:**
  - [x] `onboarding-assessment` status changed to `active`
- **Status:** done

### Story R3-10: Feature Flag Wall — graceful handling [Pattern 2]
- **Acceptance Criteria:**
  - [x] Backend returns 403 `{ error: "feature_not_enabled" }` on all 3 route handlers
  - [x] Frontend will show the message string instead of generic 404 error
- **Status:** done

### Story R3-11: Network Intelligence resume auto-load [Pattern 5 remainder]
- **Acceptance Criteria:**
  - [x] BooleanSearchBuilder already auto-loads master resume — no change needed
- **Status:** done (already implemented)

## Deferred to Backlog (Explicitly)
- Pattern 1 (Platform Context Invisibility) — requires new shared component + integration into 16 rooms
- Pattern 3 (Rich Backend Data Lost) — R1-10 set the pattern for Content Calendar; other tools are individual stories
- Pattern 4 (No Session Persistence) — architectural change affecting 6+ tools, needs dedicated sprint
