# Core Funnel Event Schema

## Purpose

This is the first concrete analytics foundation for launch readiness.

We are intentionally keeping it small:

- one shared client-side event buffer
- typed event names and payloads
- first coverage on the strongest hiring-loop actions

This is not the final analytics architecture. It is the first trustworthy schema we can build dashboards and pilot-user review around.

## Current Event Owner Map

### Career Profile

- `career_profile_started`
- `career_profile_completed`
- `career_profile_stalled`

Owner:
- [CareerProfileContext.tsx](/Users/johnschrup/Documents/New%20project/resume-agent/app/src/components/career-iq/CareerProfileContext.tsx)

### Resume V2

- `resume_builder_opened`
- `resume_builder_session_started`
- `resume_rewrite_stalled`
- `final_review_requested`
- `final_review_completed`
- `final_review_stalled`
- `export_warning_acknowledged`
- `export_attempted`

Owners:
- [App.tsx](/Users/johnschrup/Documents/New%20project/resume-agent/app/src/App.tsx)
- [V2ResumeScreen.tsx](/Users/johnschrup/Documents/New%20project/resume-agent/app/src/components/resume-v2/V2ResumeScreen.tsx)
- [ExportBar.tsx](/Users/johnschrup/Documents/New%20project/resume-agent/app/src/components/resume-v2/ExportBar.tsx)

### Job Search

- `job_board_search_run`
- `job_saved_to_shortlist`
- `job_shortlist_opened`
- `job_resume_build_requested`
- `boolean_search_generated`
- `boolean_search_copied`
- `more_role_suggestions_requested`

Owners:
- [RadarSection.tsx](/Users/johnschrup/Documents/New%20project/resume-agent/app/src/components/job-command-center/RadarSection.tsx)
- [JobCommandCenterRoom.tsx](/Users/johnschrup/Documents/New%20project/resume-agent/app/src/components/career-iq/JobCommandCenterRoom.tsx)
- [BooleanSearchPanel.tsx](/Users/johnschrup/Documents/New%20project/resume-agent/app/src/components/job-command-center/BooleanSearchPanel.tsx)

### Smart Referrals

- `smart_referrals_path_selected`
- `smart_referrals_connections_imported`
- `smart_referrals_matches_opened`
- `smart_referrals_outreach_opened`

Owner:
- [SmartReferralsRoom.tsx](/Users/johnschrup/Documents/New%20project/resume-agent/app/src/components/career-iq/SmartReferralsRoom.tsx)

## Why These Events First

These events answer the most important launch questions:

1. Are users actually searching for jobs?
2. Are they shortlisting roles worth working?
3. Are they turning saved roles into resume work?
4. Are they using Smart Referrals through the network path, the bonus path, or not at all?
5. Are boolean search strings materially more useful than the old visible suggestion-first flow?

## What Is Still Missing

The next instrumentation wave should cover:

### Resume outcomes

- export completed successfully
- master resume sync started/completed
- accepted edit promotion rate

### Pipeline outcomes

- shortlist item moved to applied
- interview prep opened from a real opportunity
- offer-stage progression

### Smart Referrals outcomes

- company scan started/completed
- bonus search started/completed
- outreach draft copied or sent externally

### LinkedIn and Interview

- profile rewrite started/completed
- post draft started/completed
- mock interview started
- thank-you note or negotiation flow started

## Pilot User Session Tie-In

For the first 5 to 10 observed sessions, review these events alongside screen recordings or notes:

1. `job_board_search_run`
2. `job_saved_to_shortlist`
3. `job_resume_build_requested`
4. `boolean_search_generated`
5. `smart_referrals_path_selected`
6. `smart_referrals_connections_imported`
7. `smart_referrals_outreach_opened`

Those are the cleanest signals for whether the product is helping people move through the real hiring loop or just browse.

## Storage Note

Events currently live in the local product telemetry buffer at:

- [product-telemetry.ts](/Users/johnschrup/Documents/New%20project/resume-agent/app/src/lib/product-telemetry.ts)

That is sufficient for schema hardening and browser QA.

The next step after pilot validation is deciding whether to:

1. ship them to a real analytics endpoint
2. batch them from the client
3. or mirror only a subset server-side
