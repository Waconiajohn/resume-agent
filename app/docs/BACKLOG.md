# Backlog — CareerIQ Consumer Dashboard

## Epic: CareerIQ Consumer Dashboard (from Design Brief v1.0)

Build the 4-zone consumer dashboard with Why-Me Story Engine, Live Sessions integration, 8-room navigation, and mobile-first daily briefing experience.

### Completed Stories
- [x] Dashboard Shell & Navigation — Sprint 1
- [x] Zone 1 — Your Day (Daily Briefing) — Sprint 1
- [x] Zone 2 — Your Pipeline (Kanban) — Sprint 1
- [x] Zone 3 — Agent Activity Feed — Sprint 1
- [x] Zone 4 — Your Signals — Sprint 1
- [x] Why-Me Story Engine & Dashboard States — Sprint 2
- [x] Live Pulse Strip & Sessions Room — Sprint 2
- [x] Mobile Daily Briefing — Sprint 2
- [x] Why-Me Supabase Persistence — Sprint 3
- [x] Resume Workshop Room — Sprint 3
- [x] Financial Wellness Room — Sprint 3
- [x] CareerIQ Component Tests (42 tests) — Sprint 3
- [x] Webinar-to-Dashboard Feedback Loop — Sprint 3
- [x] LinkedIn Studio Room — Sprint 4
- [x] Job Command Center Room — Sprint 4
- [x] Interview Lab Room — Sprint 4
- [x] Cover Letter Integration — Sprint 4
- [x] Pipeline Real Data (Zone 2) — Sprint 4
- [x] Networking Hub Room — Sprint 5
- [x] Sprint 4 Component Tests (28 tests) — Sprint 5
- [x] Interview History Persistence — Sprint 5
- [x] Onboarding Flow Polish — Sprint 5
- [x] Backlog & Documentation Cleanup — Sprint 5

---

## All 8 Rooms Built — Current State

| Room | Status | Data Source |
|------|--------|-------------|
| Dashboard (4 zones) | Complete | Pipeline: Supabase, rest: mock |
| Resume Workshop | Complete | Real sessions from App.tsx |
| LinkedIn Studio | Complete | Mock data |
| Job Command Center | Complete | Mock data, localStorage prefs |
| Networking Hub | Complete | Mock data |
| Interview Lab | Complete | Mock data, localStorage history |
| Financial Wellness | Complete | Mock data |
| Live Sessions | Complete | Mock data |

---

## Future Epics — Sprint Roadmap

### Sprint 6: Real Data Wiring
Connect remaining mock data to real sources:

- **Agent Feed Real Data** — Connect Zone 3 to actual agent activity events from pipeline runs
- **Signals Real Data** — Connect Zone 4 to computed metrics from user activity + positioning quality
- **Job Command Center Pipeline Summary** — Extract compact pipeline component for reuse in Job Command Center
- **Search Preferences Supabase Persistence** — Move from localStorage to user profile in Supabase

### Sprint 7+: Agent Integration
These rooms need real backend agents to replace mock data:

- **LinkedIn Studio** — Needs LinkedIn Profile Editor Agent (#5) and LinkedIn Blogging Strategy Agent (#6). Real LinkedIn OAuth integration.
- **Job Command Center** — Needs Job Finder Agent (#7), Boolean Search Agent (#8), Application Tracker Agent (#9). Real job board API integration.
- **Networking Hub** — Needs LinkedIn Networking Agent (#12). Real contact data from LinkedIn.
- **Interview Lab** — Needs Interview Prep Agent (#10). Real company research, dynamic question generation.
- **Financial Wellness** — Needs real user financial data input flow.

### Sprint 8+: Platform Maturity
- **Real Session Scheduling** — Calendar API integration, Zoom/streaming, automated reminders
- **Mobile WhyMeEngine Overlay** — Separate mobile coaching flow (Sprint 2 tech debt)
- **Notification System** — Push notifications for agent activity, session reminders, pipeline updates
- **Video/Audio Mock Interviews** — Real-time practice with AI interviewer
- **Salary Negotiation Integration** — Data-driven negotiation strategy within pipeline. Needs Agent #11.

### Separate Epic: Enterprise Admin Dashboard (B2B)
- Admin view for outplacement firms (FirstSourceTeam.com)
- Bulk user management, cohort analytics, program configuration
- Different user type, different routing, different design language
- Depends on B2B pricing tier implementation

### Separate Epic: Financial Planner Referral Network (Engine 2)
- Planner matching algorithm (geography, AUM fit, specialization)
- Warm handoff flow with user consent and data sharing controls
- Planner dashboard for lead management
- Commission tracking and reporting

---

## Tech Debt (Schedule as capacity allows)
- Pre-existing ResearchDashboardPanel.test.tsx TypeScript errors (7 errors, stale BenchmarkProfile assertions)
- Job Command Center missing Pipeline Summary section (needs component extraction from ZoneYourPipeline)
- Mock data replacement across all zones (agent feed, signals, sessions)
- Accessibility audit for all CareerIQ components (ARIA labels, keyboard navigation, screen reader support)
- Performance audit: lazy-load room components, virtualize long lists
- ResumeSession/SavedResume interfaces duplicated between CareerIQScreen and ResumeWorkshopRoom
