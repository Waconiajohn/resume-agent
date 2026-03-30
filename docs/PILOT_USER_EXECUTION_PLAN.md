# Pilot User Execution Plan

## Goal

Run the first 5 observed user sessions in a way that produces:

1. usable product feedback
2. comparable notes across sessions
3. telemetry-backed evidence instead of gut feel

This is the execution layer for:

- [PILOT_USER_SESSION_SCRIPT.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PILOT_USER_SESSION_SCRIPT.md)
- [CORE_FUNNEL_EVENT_SCHEMA.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/CORE_FUNNEL_EVENT_SCHEMA.md)

## What Success Looks Like

At the end of 5 sessions we should have:

1. one completed notes file per participant
2. one telemetry comparison for each session
3. one ranked friction list by room and severity
4. one short decision list:
   - keep
   - simplify
   - rename
   - cut

## Recommended Participant Mix

Use 5 participants with different search styles:

1. senior leader actively searching now
2. mid-career manager actively searching now
3. industry switcher
4. heavy LinkedIn user
5. job-board-first searcher

### Mix rules

- Prefer people searching within the next 90 days
- Prefer at least 2 people who have never seen the product before
- Avoid people who need heavy coaching just to complete basic browser tasks
- Avoid stacking all 5 participants into the same profile type

## Session Matrix

| Session | Target profile | Why this person matters | Main rooms to watch |
|---|---|---|---|
| P1 | Senior leader | Tests Career Profile, Resume V2, Smart Referrals fit | Profile, Resume, Smart Referrals |
| P2 | Mid-career manager | Tests clarity for mainstream job-board behavior | Job Search, Pipeline |
| P3 | Industry switcher | Tests whether story/benchmark logic is understandable | Profile, Resume, Job Search |
| P4 | LinkedIn-focused user | Tests whether LinkedIn room feels naturally relevant | LinkedIn, Job Search |
| P5 | Referral-driven searcher | Tests whether Smart Referrals is actually differentiated | Smart Referrals, Outreach |

## Before Each Session

1. Assign a participant ID:
   - `P1`, `P2`, `P3`, `P4`, `P5`
2. Decide whether the participant uses:
   - a fresh account
   - or a seeded account with realistic starting material
3. Open the current admin funnel tab before the session and note the baseline counts
4. Confirm screen recording if you are recording
5. Open these docs side by side:
   - [PILOT_USER_SESSION_SCRIPT.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PILOT_USER_SESSION_SCRIPT.md)
   - [PILOT_SESSION_NOTES_TEMPLATE.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PILOT_SESSION_NOTES_TEMPLATE.md)

## During Each Session

Use the script. Do not improvise the task order unless the participant naturally goes somewhere else and that deviation is itself informative.

### Moderator rules

1. Ask the task plainly.
2. Let them click first.
3. Do not rescue them too early.
4. Write down exact phrases when they sound confused.
5. Mark the first hesitation point in every room.

### Observer rules

1. Capture timestamps for major stalls
2. Capture exact language
3. Mark severity live if obvious
4. Watch for:
   - hesitation before the first click
   - unclear room purpose
   - not noticing the next action
   - loss of momentum between rooms

## After Each Session

Within 15 minutes of ending the session:

1. Complete [PILOT_SESSION_NOTES_TEMPLATE.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PILOT_SESSION_NOTES_TEMPLATE.md)
2. Record the participant's top 3 friction points
3. Capture the telemetry delta from the admin funnel
4. Mark whether the participant:
   - completed the core loop
   - partially completed it
   - abandoned it

## Telemetry Cross-Check

After each session, compare what the participant said to these events:

1. `career_profile_started`
2. `career_profile_completed`
3. `resume_builder_session_started`
4. `final_review_completed`
5. `job_board_search_run`
6. `job_saved_to_shortlist`
7. `job_shortlist_opened`
8. `job_resume_build_requested`
9. `boolean_search_generated`
10. `boolean_search_copied`
11. `smart_referrals_path_selected`
12. `smart_referrals_connections_imported`
13. `smart_referrals_matches_opened`
14. `smart_referrals_outreach_opened`

Use the admin funnel to answer:

1. Did they do what they said they did?
2. Where did the flow silently stop?
3. Did they skip important actions they claimed to understand?

## Synthesis Process

After all 5 sessions:

1. Combine all notes into [PILOT_SESSION_SYNTHESIS_TEMPLATE.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PILOT_SESSION_SYNTHESIS_TEMPLATE.md)
2. Group friction by room:
   - Career Profile
   - Resume V2
   - Job Search
   - Smart Referrals
   - LinkedIn
   - Interview
3. Rank issues by:
   - severity
   - frequency
   - business impact
4. Create one short action list for the next build wave

## Decision Rules

Escalate something into the next build wave if any of these are true:

1. 2 or more participants hesitate at the same step before first action
2. 2 or more participants ask what a room is for
3. a participant abandons a core task
4. telemetry shows repeated drop-off where participants claimed they were progressing
5. a flow feels valuable only after moderator explanation

## What Not To Do

1. Do not broaden the study into feature ideation sessions
2. Do not ask participants how they would redesign the product
3. Do not treat a single opinion as roadmap truth
4. Do not start polishing tertiary surfaces before the same issue repeats

## Recommended Output Files

Use these docs for the first pilot round:

- [PILOT_USER_RECRUITING_BRIEF.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PILOT_USER_RECRUITING_BRIEF.md)
- [PILOT_SESSION_NOTES_TEMPLATE.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PILOT_SESSION_NOTES_TEMPLATE.md)
- [PILOT_SESSION_SYNTHESIS_TEMPLATE.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/PILOT_SESSION_SYNTHESIS_TEMPLATE.md)
