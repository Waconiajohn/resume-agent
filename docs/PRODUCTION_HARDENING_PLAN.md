# Production Hardening Plan

## Goal

Move the product from "much cleaner and more coherent" to "safe to trust in production" by hardening the core hiring loop:

1. Resume creation and targeting
2. Job discovery and pipeline management
3. Network-driven job search and referral workflow
4. Saved state, auth boundaries, and cross-session persistence
5. Final review, launch, and live manual validation

This plan is intentionally biased toward trust, stability, and clarity over new feature expansion.

## Scope

In scope:

- Resume V2
- Job Search / Job Board / Shortlist / Pipeline
- Smart Referrals
- auth boundaries
- saved state and persistence behavior
- stale-data clearing
- direct-open routes and room launches
- real-session and manual QA
- LinkedIn Studio clarity pass after the core loop is hardened

Out of scope:

- net-new product rooms
- speculative AI features that add a second workflow
- broad visual redesign not tied to trust or usability
- low-value legacy compatibility beyond what is still needed for real inbound links

## Hardening Principles

1. One canonical workflow per room.
2. AI should assist the workflow, not create a second competing product surface.
3. Real state beats synthetic fallback state.
4. Auth changes must never leave stale or cross-user content visible.
5. If a feature is weak, demo-ish, or duplicative, cut it instead of polishing it.
6. Production readiness requires both automated checks and real manual walkthroughs.

## Priority Stack

1. Job Search + Pipeline
2. Smart Referrals
3. Resume V2
4. Cross-cutting auth, persistence, and stale-state hardening
5. LinkedIn Studio clarity pass
6. Release-candidate QA and launch gates

The order matters. Job Search, Smart Referrals, and Resume V2 make up the core hiring loop. LinkedIn remains important, but it is not the first place to spend effort while the main loop is still being stabilized.

## Phase 1: Job Search + Pipeline

### Objective

Make Job Search feel like one product:

- one public Job Board
- one Shortlist
- one Pipeline
- one clean handoff into resume work

### Why first

This is now one of the clearest user-value paths in the app, and it has changed substantially. That makes it both high value and high risk.

### Work

1. Keep the Job Board simple and explicit.
   - Search public roles
   - Show job age clearly
   - Show source clearly
   - Show salary when available
   - Save to shortlist
   - Build resume from the saved role

2. Keep AI in the room, but subordinate it.
   - Boolean search assistant remains the primary AI utility
   - AI Suggestions remain optional and secondary
   - no return to competing discovery systems

3. Tighten Shortlist and Pipeline as one work surface.
   - Shortlist is the staging area
   - Needs Attention stays inside Pipeline
   - stage transitions remain clear and deliberate

4. Harden persistence.
   - saved jobs remain scoped correctly
   - pipeline state refreshes correctly after auth changes
   - stale data is cleared if auth disappears or the feature is unavailable

5. Validate resume handoff.
   - from board result
   - from shortlist card
   - from pipeline card

### Risks to watch

- hidden duplication between public board search and AI suggestions
- stale job or pipeline state after auth changes
- confusing watchlist/company targeting behavior
- pipeline density still making work hard to scan

### Exit criteria

- Job Board is understandable without explanation
- users can save 5 to 6 jobs and revisit them cleanly
- build-resume entry points work from every intended place
- no stale pipeline or board data persists across auth loss
- direct-open routing and room restoration behave correctly

## Phase 2: Smart Referrals

### Objective

Make Smart Referrals the clear network-driven search product:

- first-degree-connection company scans
- bonus-company search
- referral-aware matches
- outreach handoff

### Why second

This is the main differentiator in the product. It should feel premium and intentional, not like a collection of network tools.

### Work

1. Keep Smart Referrals separate from the public Job Board.
   - public jobs stay in Job Search
   - connection/company-site search stays here

2. Harden scrape lifecycle behavior.
   - auth loss
   - polling stop conditions
   - partial failures
   - retry clarity

3. Tighten match-source explanation.
   - from your network
   - from bonus search
   - referral bonus known

4. Validate outreach handoff.
   - contacts
   - outreach generation
   - prefilled context

5. Validate company targeting.
   - target titles
   - company list integrity
   - match filters

### Risks to watch

- scan/polling state getting stuck
- stale unlocked views after auth loss
- unclear separation between bonus search and your-network search
- company list drift between Smart Referrals and other rooms

### Exit criteria

- scan lifecycle is stable
- source labels are obvious
- contacts and outreach remain in one coherent flow
- no stale scan state or stale results remain visible across auth changes

## Phase 3: Resume V2

### Objective

Lock down the core document-first resume flow so it is trustworthy and explainable:

- before score
- generate strongest tailored resume
- line-by-line coaching
- final review
- export-ready confidence

### Why third

The major architectural problems have already been cleaned up. This phase is about stability, repeatability, and final truthfulness rather than another redesign.

### Work

1. Re-run the core proof-state and target model against live/manual paths.
   - supported
   - supported rewrite
   - strengthen
   - confirm fit
   - code red

2. Validate persistence and resume session restoration.
   - session reloads
   - direct-open routes
   - draft continuity
   - auth-scoped local draft behavior

3. Validate live action flow.
   - select line
   - use AI action
   - edit draft
   - apply back to resume
   - move through final review

4. Keep final-review copy and signals honest.
   - no generic reviewer language when concrete proof exists
   - no misleading target/evidence pairing

5. Re-run real-session QA on representative sessions.

### Risks to watch

- session reload weirdness
- stale generated state after auth changes
- action-state regressions in line editing
- flattering proof-state labels

### Exit criteria

- real-session QA remains green
- live manual line-edit flow is calm and obvious
- no confusing target/evidence mismatches
- final review remains concrete and useful

## Phase 4: Cross-Cutting Auth, Persistence, and Stale-State Sweep

### Objective

Close the remaining trust gaps where locally cached or auto-loaded state can survive the wrong auth/session boundary.

### Why here

This is the class of issue that can quietly undermine everything else even when individual rooms look polished.

### Work

1. Inventory remaining browser storage usage.
   - localStorage
   - sessionStorage
   - cached session summaries
   - local drafts

2. Classify each item.
   - safe UI preference
   - safe ephemeral session aid
   - risky user-authored content
   - risky backend-derived content

3. Fix any remaining risky paths.
   - user-scoped keys
   - auth-change reset paths
   - no blind migration into signed-in accounts
   - feature-disabled clearing

4. Audit direct-open and room-launch behavior.
   - room aliases
   - hidden-room routes
   - job-specific launch paths
   - coach recommendation launches

### Risks to watch

- cross-user content leakage on shared machines
- stale data surviving sign-out
- disabled features still showing old content
- direct-open links landing in partial or broken states

### Exit criteria

- remaining risky storage paths are fixed or explicitly retired
- auth change resets are consistent across the core rooms
- direct-open routing behaves deterministically

## Phase 5: LinkedIn Studio Clarity Pass

### Objective

Improve clarity and hierarchy without reopening architecture.

### Why after the core loop

LinkedIn is important, but it is not the most dangerous source of trust loss right now. It is in a good enough state to wait until the main hiring loop is stable.

### Work

1. Confirm the room still reads as one sequence:
   - Profile
   - Write
   - Results

2. Re-check support surfaces.
   - Content Plan
   - Library
   These should remain embedded support workspaces, not co-equal product concepts.

3. Tighten results surface copy and hierarchy if needed.
4. Verify persistence of drafts/profile state across auth changes.

### Exit criteria

- the room is self-explanatory
- no obvious duplicate states or support-surface confusion remains
- draft/profile persistence is trustworthy

## Phase 6: Release-Candidate QA

### Objective

Turn the cleaned and hardened product into something we can responsibly call production-ready.

### Automated gates

1. Typechecks
2. focused unit and room tests
3. critical Playwright flows
4. real-session QA where applicable

### Manual gates

1. Resume V2 live manual flow
   - upload or load resume
   - target role/JD
   - edit a few lines
   - final review

2. Job Search live manual flow
   - search jobs
   - save a shortlist
   - build resume from a saved role
   - move role into pipeline

3. Smart Referrals live manual flow
   - load connection data
   - run company scan
   - inspect matches
   - hand off to outreach

4. LinkedIn quick manual flow
   - profile
   - write
   - results

### Release decision rule

Do not call the product production-ready just because tests are green.

It is production-ready when:

- the core hiring loop is simple to understand
- auth/session behavior is trustworthy
- no major stale-state or cross-user risks remain
- the main flows survive both automated and manual walkthroughs

## Execution Order

1. Job Search + Pipeline hardening
2. Smart Referrals hardening
3. Resume V2 live-confidence pass
4. Cross-cutting auth/persistence sweep completion
5. LinkedIn clarity pass
6. Release-candidate QA

## Recommended Immediate Next Step

Start with Job Search + Pipeline live/manual hardening.

Reason:

- the room was just materially simplified
- the new Job Board + Boolean Search + Shortlist model is worth locking down while it is still fresh
- it is close enough to production shape that hardening work will pay off immediately
