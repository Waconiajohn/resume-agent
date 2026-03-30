# Next Phase Plan

## Goal

Shift from broad cleanup and hardening into disciplined launch preparation.

The product is now materially more coherent. The next best use of effort is not broad feature expansion. It is:

1. launch readiness
2. instrumentation
3. observed user behavior
4. pricing and activation alignment
5. a smaller, evidence-based post-launch backlog

This plan is intentionally biased toward learning and reliability over new surface area.

## Why This Is The Right Next Phase

We have already done the expensive internal work:

- major room simplification
- weak feature removal
- auth-boundary cleanup
- stale-state cleanup
- resume-v2 proof and review-state cleanup
- Smart Referrals simplification
- job-board simplification
- browser-gate stabilization
- real-session QA hardening

That means the main risk has changed.

The biggest risk is no longer:

- obvious architectural confusion
- overlapping old and new workflows
- stale demo product surfaces

The biggest risk now is:

- shipping without knowing where users actually stall
- guessing at value instead of measuring it
- continuing to add capability before activation and conversion are understood

## Operating Principle

Do not add broad new product surface area until we have:

1. a measurable hiring funnel
2. observed real-user behavior
3. production observability on the critical path
4. clear value moments tied to monetization

## Priority Stack

1. Instrument the core funnel
2. Run pilot user sessions
3. Add production observability
4. Tighten activation and monetization
5. Build a post-launch backlog from evidence

## Phase 1: Core Funnel Instrumentation

### Objective

Measure the real hiring loop end to end instead of relying on internal intuition.

### Questions this phase should answer

1. Where do users start?
2. Where do they stop?
3. Which workflows actually convert into meaningful work?
4. Which rooms are entered often but not completed?

### Events to track first

#### Career Profile

- profile_viewed
- why_me_started
- why_me_saved
- profile_backbone_completed

#### Resume Builder / Resume V2

- resume_builder_opened
- resume_session_started
- resume_generated
- final_review_run
- resume_exported
- master_resume_opened

#### Job Search

- job_search_opened
- search_string_generated
- job_board_search_run
- job_saved_to_shortlist
- shortlist_opened
- pipeline_opened
- build_resume_from_job

#### Smart Referrals

- smart_referrals_opened
- connections_import_started
- connections_import_completed
- network_scan_started
- bonus_search_started
- matches_viewed
- outreach_started

#### Interview Prep

- interview_prep_opened
- mock_interview_started
- debrief_saved
- thank_you_started
- negotiation_started

#### LinkedIn

- linkedin_opened
- quick_optimize_started
- profile_rewrite_completed
- post_draft_started
- post_approved

### Deliverables

1. Canonical event list
2. One event-owner map by room
3. One funnel dashboard for the critical path

Current schema reference:

- [CORE_FUNNEL_EVENT_SCHEMA.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/CORE_FUNNEL_EVENT_SCHEMA.md)

### Exit criteria

- We can see room entry, meaningful action, and successful completion for the core loop
- We can compare funnel drop-off across Resume, Job Search, and Smart Referrals

## Phase 2: Pilot User Testing

### Objective

Replace internal product assumptions with direct observed behavior.

### Format

Run 5 to 10 real user sessions with observation.

These should not be generic interviews. They should be task-based walkthroughs using live product paths.

### Core tasks

1. Fill out enough of Your Profile to make the story useful
2. Generate or reopen a tailored resume
3. Run Job Search and shortlist 3 to 5 roles
4. Use Smart Referrals for one connection-driven path and one bonus-driven path
5. Open Interview Prep or LinkedIn only if naturally relevant

### What to watch for

- hesitation before first click
- confusion about room purpose
- “why is this here?” moments
- failure to notice key actions
- abandonment after success-looking screens
- uncertainty about what happens next

### Output format

Each session should produce:

1. task completion summary
2. friction points
3. exact confusion language when possible
4. severity
5. recommended fix or product decision

Pilot session reference:

- [PILOT_USER_SESSION_SCRIPT.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PILOT_USER_SESSION_SCRIPT.md)
- [PILOT_USER_EXECUTION_PLAN.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PILOT_USER_EXECUTION_PLAN.md)
- [PILOT_SESSION_NOTES_TEMPLATE.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PILOT_SESSION_NOTES_TEMPLATE.md)
- [PILOT_SESSION_SYNTHESIS_TEMPLATE.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PILOT_SESSION_SYNTHESIS_TEMPLATE.md)

### Exit criteria

- At least 5 observed sessions completed
- Repeated friction patterns are grouped and ranked
- We have a short, evidence-based UX backlog instead of a speculative one

## Phase 3: Production Observability

### Objective

Catch failures and degradation in production before users have to explain them to us.

### Required coverage

1. API and route errors on the core path
2. resume-v2 pipeline failures
3. export failures
4. Smart Referrals scan failures
5. auth-boundary/storage failures where possible
6. long-running latency on critical operations

### Minimum monitors

1. Resume V2 pipeline failure rate
2. Export error rate
3. Job search request failure rate
4. Smart Referrals scan failure rate
5. Browser test nightly status
6. Real-session QA status

### Operational checks

1. nightly browser suites
2. scheduled real-session QA
3. alert thresholds for sustained failure spikes

### Exit criteria

- Core errors are visible in one place
- Nightly checks exist for the critical path
- There is a defined owner response when a gate fails

## Phase 4: Activation And Monetization

### Objective

Tie paid conversion to real product value moments instead of generic subscription pressure.

### Principle

The product should ask users to pay when the value is obvious, not before.

### Primary value moments

1. tailored resume completed
2. shortlist built
3. referral matches surfaced
4. interview or negotiation assets unlocked

### Questions to answer

1. Where should the first paid gate appear?
2. Which actions are strong enough to justify a paywall?
3. What should remain free to prove value?
4. What product can stand alone later?

### Current product judgment

The strongest standalone candidate is Smart Referrals.

Why:

- it is differentiated
- it is outcome-oriented
- it is easier to explain in one sentence than the whole workspace
- it can remain in the suite while still being separately packaged later

### Deliverables

1. free-to-paid map
2. activation moments by room
3. packaging options for:
   - full workspace
   - Smart Referrals standalone

### Exit criteria

- Monetization is tied to user value, not generic gating
- We can explain the paid path in plain language

## Phase 5: Post-Launch Backlog

### Objective

Build the next roadmap from evidence, not momentum.

### Backlog buckets

#### Must-fix

- broken outcomes
- reliability regressions
- severe confusion on core flows

#### High-value improvements

- changes that improve activation, completion, or conversion

#### Nice-to-have

- polish or secondary workflow improvements without clear funnel impact

#### Hold

- ideas that feel smart but are not yet justified by use

### Backlog rules

1. No broad new room creation without strong evidence
2. No second workflow for the same core task
3. No AI surface that competes with a simpler workflow
4. Prefer stronger default flows over more options

## Immediate Next Actions

1. Define the first event schema for the core hiring loop.
2. Decide where event capture should live:
   - client
   - server
   - or hybrid
3. Identify the first 5 pilot users and write the session tasks.
4. Decide which production dashboards/alerts are mandatory before launch.
5. Draft the first free-to-paid map around the strongest value moments.

Current status:

- event schema: in place
- capture model: hybrid client buffer + server ingestion
- internal readout: basic admin funnel summary in place
- rollout runbook: [PRODUCT_TELEMETRY_ROLLOUT.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PRODUCT_TELEMETRY_ROLLOUT.md)
- telemetry migration: live in Supabase
- separate database-ops follow-up: [SUPABASE_MIGRATION_DRIFT_RECONCILIATION_PLAN.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/SUPABASE_MIGRATION_DRIFT_RECONCILIATION_PLAN.md)

## Suggested Order For The Next Working Block

1. Instrument Resume V2, Job Search, and Smart Referrals first
2. Prepare and run pilot sessions
3. Add observability and nightly monitoring gaps
4. Tighten activation and paywall placement
5. Build the post-launch backlog from evidence

## What Not To Do Next

1. Do not add more rooms.
2. Do not broaden AI features because they sound impressive.
3. Do not re-open major architecture without new evidence.
4. Do not polish tertiary surfaces before core funnel visibility exists.

## Bottom Line

The product is finally in a state where learning matters more than cleanup.

The next win is not “more capability.”

The next win is:

- understanding behavior
- proving value
- catching failures early
- tightening the commercial path around real outcomes
