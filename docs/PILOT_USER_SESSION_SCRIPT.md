# Pilot User Session Script

## Purpose

Use this script for the first 5 to 10 observed user sessions after launch hardening.

The goal is not to impress the participant or teach them every feature. The goal is to see:

- where they hesitate
- where the product feels unclear
- where they stall or abandon
- which flows create real momentum

## Working Docs

Run this script together with:

- [PILOT_USER_EXECUTION_PLAN.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PILOT_USER_EXECUTION_PLAN.md)
- [PILOT_USER_RECRUITING_BRIEF.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PILOT_USER_RECRUITING_BRIEF.md)
- [PILOT_SESSION_NOTES_TEMPLATE.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PILOT_SESSION_NOTES_TEMPLATE.md)
- [PILOT_SESSION_SYNTHESIS_TEMPLATE.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PILOT_SESSION_SYNTHESIS_TEMPLATE.md)

## Session Setup

### Participant profile

Prefer people who are actively job searching or preparing to search within the next 90 days.

Good mixes:

- mid-career manager
- senior leader
- industry switcher
- person using LinkedIn heavily
- person relying more on direct job-board search

### Session length

- target: 30 to 45 minutes

### Moderator rules

1. Do not over-explain the product upfront.
2. Let the participant click first.
3. Only unblock them if they are fully stuck.
4. Capture exact phrases when they sound confused.
5. Ask short follow-ups, not leading questions.

## Opening Script

Use plain language:

1. "We’re going to walk through a few realistic job-search tasks."
2. "Please think out loud as you go."
3. "If something feels confusing, awkward, or unnecessary, say it."
4. "We’re testing the product, not you."

## Core Task Flow

### Task 1: Build enough profile context

Prompt:

"Start by filling in enough of your profile that the system understands how you position yourself."

What to watch:

- Do they understand what `Why Me` is for?
- Do they know what to do first?
- Do they feel like they are building a brand story or just filling fields?

### Task 2: Generate or reopen a tailored resume

Prompt:

"Now create or reopen a tailored resume for a role you’d actually consider."

What to watch:

- Do they understand where to start?
- Do they trust the final review?
- Do they know when the resume is ready to export?

### Task 3: Use Job Search

Prompt:

"Find a few roles you would seriously consider, and save the best ones for later."

What to watch:

- Do they understand the Job Board right away?
- Do they notice posted age and shortlist actions?
- Do they understand what the Boolean search strings are for?
- Do they know what `Shortlist` means without explanation?

### Task 4: Use Smart Referrals

Prompt:

"Now try Smart Referrals. First use the connection-based path. Then look at the bonus-company path."

What to watch:

- Do they understand the difference between the two paths?
- Which path feels more compelling?
- Do they understand when to move into outreach?
- Do they think the bonus path is valuable or distracting?

### Task 5: Resume handoff from saved work

Prompt:

"Take one saved role and move back into resume work for that job."

What to watch:

- Can they find the handoff quickly?
- Does the product feel connected or fragmented?
- Do they understand why they’re back in resume work?

### Optional Task 6: LinkedIn or Interview

Only if it feels natural:

- LinkedIn for reputation-building users
- Interview Prep for users already in later-stage pipeline thinking

Prompt:

"If this feels relevant to your search right now, open the next tool you’d use."

What to watch:

- Do they choose LinkedIn or Interview naturally?
- Does the room purpose feel obvious?

## Observation Template

Use one block per task:

### Task

- completed
- partially completed
- abandoned

### Friction

- what slowed them down
- where they hesitated
- what they misread

### Exact words

- quote the participant when possible

### Severity

- `P0`: blocked core task
- `P1`: major confusion or trust issue
- `P2`: noticeable friction but recoverable
- `P3`: polish-only

### Recommended action

- keep
- simplify
- rename
- cut
- defer

## Daily Review Questions

After each session, answer these:

1. Where did they first hesitate?
2. Which room needed the most explanation?
3. Did they successfully build momentum from one room into the next?
4. Did the Job Board and Smart Referrals feel distinct in a good way?
5. Did anything still feel like a leftover internal tool instead of a product?

## What To Compare Against Telemetry

After each session, compare notes with:

- `job_board_search_run`
- `job_saved_to_shortlist`
- `job_shortlist_opened`
- `job_resume_build_requested`
- `boolean_search_generated`
- `boolean_search_copied`
- `smart_referrals_path_selected`
- `smart_referrals_connections_imported`
- `smart_referrals_matches_opened`
- `smart_referrals_outreach_opened`

This is how we separate:

- what the user said
- what they actually did
- and where the product silently lost momentum
