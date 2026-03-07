# Sprint 31: Job Application Tracker Agent (#14)
**Goal:** Build the Job Application Tracker Agent as Agent #14 — a 2-agent pipeline (Analyst -> Follow-Up Writer) that analyzes job applications against the user's resume/positioning, scores fit, generates follow-up messages, and produces portfolio-level analytics.
**Started:** 2026-03-07

## Stories This Sprint

### Backend — Types & Knowledge
1. [x] Story 1: Define `JobTrackerState`, `JobTrackerSSEEvent`, application status types, and tracking knowledge rules — **Status: done**

### Backend — Application Analyst Agent
2. [x] Story 2: Analyst agent config + tools (analyze_application, score_fit, assess_follow_up_timing, generate_portfolio_analytics) — **Status: done**

### Backend — Follow-Up Writer Agent
3. [x] Story 3: Follow-Up Writer agent config + tools (write_follow_up_email, write_thank_you, write_check_in, assess_status, assemble_tracker_report) — **Status: done**

### Backend — ProductConfig & Route
4. [x] Story 4: ProductConfig + FF_JOB_TRACKER + route + DB migration — **Status: done**

### Frontend Integration
5. [x] Story 5: `useJobTracker` SSE hook + TrackerRoom UI component — **Status: done**

### Tests
6. [x] Story 6: Server tests (52) + app tests (12) — **Status: done**

## Out of Scope (Explicitly)
- Real-time job board API integration (Indeed, LinkedIn Jobs)
- Automated application submission
- Interview scheduling/calendar integration
- ATS status scraping
- Historical application import from spreadsheets (future feature)

## Upcoming Sprints
- Sprint 32: Salary Negotiation Agent (#15)
- Sprint 33: Executive Bio Agent (#16)
- Sprint 34: Portfolio / Case Study Agent (#17)
