# Production Sweep Plan

## Goal

Move the product from isolated fixes to a deliberate production hardening pass across the next highest-value rooms after Resume V2.

This plan is intentionally opinionated. It prioritizes the sections that:

- create the most user-facing value
- have the highest workflow confusion or routing risk
- still show signs of overlapping generations of UI or logic
- can benefit most from the same cleanup discipline that stabilized Resume V2

## Executive Summary

Resume V2 is no longer the blocking architectural mess it was. It still has polish work left, but it is now in the right bucket:

- keep using real runs
- keep a short punch list
- do not re-open major architecture unless new evidence demands it

The next best production work is:

1. Smart Referrals / Network Job Search
2. Dashboard / workspace shell / job workspace routing
3. Interview Prep
4. LinkedIn Studio

That order is not arbitrary. It is based on user value, visible risk, and how likely each area is to contain overlapping old and new product logic.

## Senior-Engineer Judgment

The biggest failure mode from this point forward is not “missing one more bug.”

It is:

- continuing room-by-room polish without removing overlapping surfaces
- leaving old paths live beside newer ones
- letting route or workflow drift reintroduce product confusion

So each sweep below follows the same rule:

1. identify the canonical workflow
2. identify competing or stale surfaces
3. delete or isolate the stale path
4. simplify the UI around the canonical path
5. add tests and visual checks

If we skip step 3, the app will keep drifting.

## Priority 1: Smart Referrals / Network Job Search

### Why first

This room is high-value and high-visibility. It turns existing network data into real job leads, which is one of the clearest “this product helps me get hired” flows in the application.

It is also the most likely next source of production confusion because the feature now spans:

- CSV import
- company normalization
- target titles
- connection-company job scan
- bonus-company scan
- job matches
- referral bonus overlay
- outreach handoff

That is enough moving parts that overlapping surfaces will hurt badly if we do not simplify it.

### Findings from the audit

1. There are still two different entry surfaces for the same domain.
   - [SmartReferralsRoom.tsx](/Users/johnschrup/Documents/New%20project/resume-agent/app/src/components/career-iq/SmartReferralsRoom.tsx) is the active modern room.
   - [NetworkIntelligenceTab.tsx](/Users/johnschrup/Documents/New%20project/resume-agent/app/src/components/network-intelligence/NetworkIntelligenceTab.tsx) is an older, narrower surface with overlapping responsibility.

2. Scan behavior is duplicated.
   - [ScrapeJobsPanel.tsx](/Users/johnschrup/Documents/New%20project/resume-agent/app/src/components/network-intelligence/ScrapeJobsPanel.tsx)
   - [BonusSearchPanel.tsx](/Users/johnschrup/Documents/New%20project/resume-agent/app/src/components/network-intelligence/BonusSearchPanel.tsx)
   Both run very similar scrape-state logic with slightly different company sources.

3. The product model is clearer than before, but still not self-explanatory enough.
   - `Job Matches`
   - `Job Scan`
   - `Bonus Search`
   - `Referral Bonus`
   are conceptually valid, but still close enough to confuse users if the page copy, statuses, and source labels are not extremely disciplined.

4. The backend route model is solid enough to build on.
   - [ni.ts](/Users/johnschrup/Documents/New%20project/resume-agent/server/src/routes/ni.ts) already has a reasonable split between import, titles, matches, scrape, referral opportunities, and bonus company lookup.
   - This is not a backend architecture rescue. It is a product-surface and workflow cleanup.

### Canonical workflow

The canonical Smart Referrals flow should be:

1. Import connections
2. Normalize companies
3. Set target titles
4. Choose one search mode:
   - `Your Network`
   - `Bonus Search`
5. Run scan
6. Review `Job Matches`
7. Optionally filter for bonus-tagged/referral-supported opportunities
8. Hand off into outreach

### Cleanup targets

1. Retire or isolate [NetworkIntelligenceTab.tsx](/Users/johnschrup/Documents/New%20project/resume-agent/app/src/components/network-intelligence/NetworkIntelligenceTab.tsx) from the live path.
2. Extract shared scrape-state behavior from `ScrapeJobsPanel` and `BonusSearchPanel`.
3. Make the source model obvious in `Job Matches`:
   - from your network
   - from bonus search
   - referral program known
4. Tighten empty/loading/normalization states so users always know what the system is waiting on.
5. Keep `Referral Bonus` as an overlay/filter concept, not a competing main results surface.

### Deliverables

- one canonical Smart Referrals room
- one shared scan state pattern
- one clearly explained results model
- removal or isolation of overlapping NI surfaces
- focused visual and route tests

## Priority 2: Dashboard / Workspace Shell / Job Workspace

### Why second

This is the biggest leverage point in the product after Resume V2. If the shell, routing, and job-workspace entry points are fuzzy, even strong rooms feel broken.

### Findings from the audit

1. There are still parallel navigation ideas coexisting.
   - [CareerIQScreen.tsx](/Users/johnschrup/Documents/New%20project/resume-agent/app/src/components/career-iq/CareerIQScreen.tsx) is the main room shell.
   - [WorkspaceShell.tsx](/Users/johnschrup/Documents/New%20project/resume-agent/app/src/components/workspace/WorkspaceShell.tsx) is still the specialized multi-node shell for older workspace flows.

2. The job workspace is valuable but dense.
   - [JobWorkspaceView.tsx](/Users/johnschrup/Documents/New%20project/resume-agent/app/src/components/dashboard/JobWorkspaceView.tsx) tries to be:
     - stage controller
     - asset hub
     - cross-product launcher
     - status explainer
   That is useful, but it is a likely future drift point if not simplified.

3. Routing has already shown drift risk.
   - We already had to fix resume-builder reopen and older route leakage.
   - That makes this area worth hardening before it surprises us again.

### Canonical workflow

The shell should answer three questions cleanly:

1. Where am I?
2. What can I do next?
3. Which room owns this work now?

The job workspace should answer:

1. What stage is this job in?
2. Which assets exist already?
3. Which next product becomes relevant now?

### Cleanup targets

1. Audit and simplify cross-room launch paths.
2. Remove or isolate stale route helpers or older workspace assumptions that do not match the current room model.
3. Tighten `JobWorkspaceView` so it acts as a launcher and status board, not a second product shell.
4. Make stage-gated assets feel deliberate rather than opportunistic.

### Deliverables

- one clean room-routing story
- one clean job-workspace story
- fewer overlapping entry paths
- regression tests around room launches and job-workspace transitions

## Priority 3: Interview Prep

### Why third

Interview Prep is useful and fairly rich, but it is less dangerous than Smart Referrals and less foundational than the workspace shell.

### Findings from the audit

1. [InterviewLabRoom.tsx](/Users/johnschrup/Documents/New%20project/resume-agent/app/src/components/career-iq/InterviewLabRoom.tsx) is large and multi-purpose.
   It currently carries:
   - core prep
   - saved assets
   - mock interview
   - debrief
   - thank-you notes
   - negotiation handoff

2. The route/backend side is fairly sane.
   - [interview-prep.ts](/Users/johnschrup/Documents/New%20project/resume-agent/server/src/routes/interview-prep.ts) is not the problem.
   - The bigger risk is product-surface sprawl in the room itself.

3. Some logic still lives locally that should probably be standardized.
   - local history
   - room-specific state juggling
   - multiple follow-up modes in one room

### Canonical workflow

The room should feel like:

1. pick interview/job context
2. generate prep
3. practice or review likely questions
4. save outcomes
5. move into follow-up tools when needed

### Cleanup targets

1. Split large room sections into clearer subcomponents if the current structure is still too monolithic.
2. Make “prep”, “simulation”, and “follow-up” feel like one sequence rather than a pile of tools.
3. Remove any stale or duplicate local state once the intended workflow is explicit.

### Deliverables

- cleaner room hierarchy
- clearer phase model inside Interview Prep
- less local ad hoc state
- improved continuity with job workspace stage gating

## Priority 4: LinkedIn Studio

### Why fourth

LinkedIn Studio looks more like a successful aggregation room than a broken one, but it still has signs of accumulated feature growth.

### Findings from the audit

1. [LinkedInStudioRoom.tsx](/Users/johnschrup/Documents/New%20project/resume-agent/app/src/components/career-iq/LinkedInStudioRoom.tsx) still acts as a large composite shell over several different modes:
   - post composer
   - profile editor
   - calendar
   - analytics
   - library

2. Backend routes are relatively healthy.
   - [linkedin-optimizer.ts](/Users/johnschrup/Documents/New%20project/resume-agent/server/src/routes/linkedin-optimizer.ts)
   - related LinkedIn routes already fit the shared-context direction reasonably well.

3. The main risk is UX sprawl, not broken contracts.
   - tabs can drift into separate products
   - activity/status patterns can become inconsistent across tools

### Canonical workflow

The room should feel like one studio, not a tab bucket.

Ideal order of use:

1. optimize profile
2. generate content
3. plan calendar
4. analyze and reuse saved content

### Cleanup targets

1. Tighten cross-tab continuity and handoffs.
2. Make loading, review, save, and reuse patterns consistent.
3. Remove or isolate stale subtool assumptions if they no longer match the room’s main model.

### Deliverables

- one coherent LinkedIn Studio narrative
- more consistent tab behavior
- cleaner boundaries between optimizer/content/tools

## Recommended Execution Order

### Wave 1

1. Smart Referrals / Network Job Search
2. Dashboard / workspace shell

Reason:
- highest user value
- highest confusion risk
- strongest leverage across the platform

### Wave 2

3. Interview Prep
4. LinkedIn Studio

Reason:
- valuable but less blocking
- more about simplification and consistency than structural rescue

## Working Rules For Each Sweep

These are mandatory if we want real closure:

1. Define the canonical workflow first.
2. Identify competing or stale surfaces.
3. Delete or isolate the stale surface.
4. Simplify the active path before polishing it.
5. Add route, component, and visual checks.
6. Prefer shared helpers where rooms are solving the same problem.

## What We Should Not Do

1. Do not keep polishing both the old and new path in the same room.
2. Do not keep duplicated scan or launcher logic if one shared pattern can own it.
3. Do not let room-local UI continue to make domain decisions that belong in shared contracts or agents.
4. Do not expand visual redesign work before the active product path is singular and trustworthy.

## Concrete First Move

Start with Smart Referrals.

Specific first implementation pass:

1. classify [NetworkIntelligenceTab.tsx](/Users/johnschrup/Documents/New%20project/resume-agent/app/src/components/network-intelligence/NetworkIntelligenceTab.tsx) as legacy and remove it from active flows or isolate it
2. extract shared scrape-state behavior used by [ScrapeJobsPanel.tsx](/Users/johnschrup/Documents/New%20project/resume-agent/app/src/components/network-intelligence/ScrapeJobsPanel.tsx) and [BonusSearchPanel.tsx](/Users/johnschrup/Documents/New%20project/resume-agent/app/src/components/network-intelligence/BonusSearchPanel.tsx)
3. simplify the room so search mode, results source, and referral overlay are unmistakable
4. validate with a real end-to-end import -> scan -> results -> outreach flow

That is the best next production sweep.
