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

### Story R3-12: Platform Context Visibility [Pattern 1]
- **Acceptance Criteria:**
  - [x] `GET /api/platform-context/summary` returns one row per context type (auth-required)
  - [x] `usePlatformContextSummary` hook fetches + caches in sessionStorage
  - [x] `ContextLoadedBadge` component shows indigo pill with relevant context type + date
  - [x] Badge integrated into 12 rooms with appropriate contextTypes
- **Status:** done

### Story R3-13: Session Persistence — Backend APIs [Pattern 4, Part A]
- **Acceptance Criteria:**
  - [x] `GET /reports/latest` endpoint added to 6 product routes (executive-bio, case-study, thank-you-note, personal-brand, salary-negotiation, ninety-day-plan)
  - [x] `usePriorResult` shared hook: fetch-on-mount, sessionStorage cache, `clearPrior` method
- **Status:** done

### Story R3-14: Session Persistence — Room Integration [Pattern 4, Part B]
- **Acceptance Criteria:**
  - [x] `usePriorResult` integrated into 6 rooms (ExecutiveBio, CaseStudy, ThankYouNote, PersonalBrand, SalaryNegotiation, NinetyDayPlan)
  - [x] Prior result card shown with rendered markdown when prior exists and pipeline is idle
  - [x] "New [Product]" button clears prior and lets user start fresh
  - [x] Loading skeleton while fetching
- **Status:** done

### Story R3-15: Gate Re-run Architecture [Revision Feedback Fix]
- **Acceptance Criteria:**
  - [x] `GateDef.requiresRerun` added to product-config.ts
  - [x] product-coordinator.ts gate loop re-invokes agent when requiresRerun returns true (max 3 re-runs)
  - [x] 6 products updated with requiresRerun + onComplete overwrite guards fixed
  - [x] revision_feedback cleared on approve in all products
  - [x] 3 new tests in product-coordinator.test.ts
- **Status:** done

### Story R3-16: Rich Structured Data in Completion Events [Pattern 3]
- **Acceptance Criteria:**
  - [x] Cover Letter: `jd_analysis` + `letter_plan` in completion event + return value
  - [x] Executive Bio: `bios` + `positioning_analysis` in completion event + return value
  - [x] Case Study: `case_studies` + `selected_achievements` in completion event + return value
  - [x] Content Calendar: `coherence_score` + `themes` + `content_mix` in completion event
  - [x] Personal Brand: `audit_findings` + `consistency_scores` + `recommendations` in completion event
  - [x] Salary Negotiation: `scenarios` + `talking_points` + `market_research` + `leverage_points` + `negotiation_strategy` in completion event + return value
  - [x] Ninety-Day Plan: `phases` + `stakeholder_map` + `quick_wins` + `learning_priorities` in completion event + return value
- **Status:** done

## Deferred to Backlog (Explicitly)
- Frontend rendering of structured completion data (quality breakdowns, evidence provenance, per-item scores)
