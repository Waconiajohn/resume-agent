# Changelog

## 2026-03-06 — Session 6 (Sprint 6 Complete)
**Sprint:** 6 | **Stories:** All 5 stories complete
**Summary:** Replaced mock data in Zones 3-4 with computed signals from real user activity, added cross-room data flow between pipeline and Interview Lab, extracted PipelineSummary component for Job Command Center, and lazy-loaded all room components for better performance.

### Changes Made

**New Files:**
- `src/components/career-iq/PipelineSummary.tsx` — Compact pipeline summary: loads stage counts from Supabase, horizontal progress bar, stage pill badges, "View Full Pipeline" link, fallback to mock counts

**Modified Files:**
- `src/components/career-iq/ZoneYourSignals.tsx` — Computed signals: Positioning Strength from Why-Me signals, Activity Score from session count + pipeline activity, Market Alignment from pipeline stage distribution. Accepts `whyMeSignals`, `sessionCount`, `pipelineStats` props. Falls back to mock when no props.
- `src/components/career-iq/ZoneAgentFeed.tsx` — Dynamic feed: accepts `realEvents` prop, converts session/pipeline events to feed items, merges with ambient "agent thinking" items, falls back to full mock feed. Exported `RealFeedEvent` type.
- `src/components/career-iq/InterviewLabRoom.tsx` — Pipeline integration: accepts `pipelineInterviews` prop (cards in "Interviewing" stage), shows real pipeline cards as upcoming interviews when available, falls back to mock data. Exported `PipelineInterviewCard` type.
- `src/components/career-iq/JobCommandCenterRoom.tsx` — Added PipelineSummary below Smart Matches, accepts `onNavigateRoom` prop for dashboard navigation
- `src/components/career-iq/DashboardHome.tsx` — Passes `whyMeSignals` and `sessionCount` to ZoneYourSignals, generates `RealFeedEvent[]` from session data for ZoneAgentFeed, accepts `recentSessions` and `sessionCount` props
- `src/components/career-iq/CareerIQScreen.tsx` — Lazy loading: all 7 room components + RoomPlaceholder use `React.lazy()` with Suspense fallback skeleton. Loads pipeline "Interviewing" cards from Supabase for Interview Lab. Passes session data to DashboardHome for computed signals and feed.

### Decisions Made
- Signals computation is purely client-side from existing data (Why-Me + sessions + pipeline) — no new API calls needed
- Agent feed merges real events with "ambient" agent items to keep feed feeling alive even with few real events
- Pipeline Summary is a read-only component separate from ZoneYourPipeline (no drag-and-drop) — optimized for compact display
- Lazy loading uses named export pattern: `lazy(() => import('./Room').then(m => ({ default: m.Room })))`
- Interview Lab maps pipeline cards to upcoming interviews with "TBD" date/time (real scheduling needs Agent #10)

### Quality Gate
- TypeScript: All new code compiles clean (only pre-existing ResearchDashboardPanel test errors)
- Tests: 656/656 passing, 0 failures
- Quality floor maintained at 656

---

## 2026-03-06 — Session 5 (Sprint 5 Complete)
**Sprint:** 5 | **Stories:** All 5 stories complete
**Summary:** Built the Networking Hub (final room), added 28 component tests for Sprint 4 rooms, persisted Interview History to localStorage with add/update, polished onboarding with 3-step path and contextual nudges, updated all project documentation.

### Changes Made

**New Files:**
- `src/components/career-iq/NetworkingHubRoom.tsx` — Networking Hub room: Rule of Four section (expandable company groups with 4 contact slots each, outreach status badges, connection levels), Outreach Templates (4 templates with expand/copy), Weekly Activity (3 metric cards), Recruiter Tracker (4 entries with firm/specialty/status)
- `src/__tests__/career-iq/Sprint4Rooms.test.tsx` — 28 tests covering: LinkedInStudioRoom (6), JobCommandCenterRoom (6), InterviewLabRoom (8), NetworkingHubRoom (8)

**Modified Files:**
- `src/components/career-iq/CareerIQScreen.tsx` — Added NetworkingHubRoom import and routing
- `src/components/career-iq/InterviewLabRoom.tsx` — Interview History now persists to localStorage (load/save), add new entry form (company/role/notes), outcome toggle buttons (pending/advanced/rejected), seed data on first load
- `src/components/career-iq/WelcomeState.tsx` — Replaced 4-room preview grid with 3-step onboarding path (Define Your Story → Build Your First Resume → Start Your Search), step icons, active/locked visual states
- `src/components/career-iq/DashboardHome.tsx` — Added contextual nudge banners: "Build your first resume" after Why-Me completion (dismissible, links to Resume Workshop), "Start discovering matching roles" after first resume session (dismissible, links to Job Command Center), localStorage persistence for dismissed state
- `src/__tests__/career-iq/CareerIQComponents.test.tsx` — Updated WelcomeState test from "locked room previews" to "3-step onboarding path"
- `docs/BACKLOG.md` — Full rewrite: all 24 completed stories listed, room status table, updated sprint roadmap
- `docs/CURRENT_SPRINT.md` — Sprint 5 complete
- `docs/SPRINT_LOG.md` — Sprint 5 retrospective

### Quality Gate
- TypeScript: All new code compiles clean (only pre-existing ResearchDashboardPanel test errors)
- Tests: 656/656 passing (628 + 28 new), 0 failures
- Test floor increased from 628 to 656
- All 8 sidebar rooms now have implementations (0 remaining RoomPlaceholder routes)

---

## 2026-03-06 — Session 4 (Sprint 4 Complete)
**Sprint:** 4 | **Stories:** All 5 stories complete
**Summary:** Built LinkedIn Studio, Job Command Center, and Interview Lab rooms with rich mock data. Wired cover letter navigation from Job Command Center and Resume Workshop. Connected pipeline zone to Supabase job_applications table with optimistic updates and fallback.

### Changes Made

**New Files:**
- `src/components/career-iq/LinkedInStudioRoom.tsx` — Profile Optimizer (current vs suggested headline/about with copy-to-clipboard), Content Calendar (4-week plan, 3 statuses), Analytics Overview (3 metric cards with trend arrows), agent suggestion banner tied to Why-Me clarity signal
- `src/components/career-iq/JobCommandCenterRoom.tsx` — Smart Matches (6 AI-surfaced roles with match score 79-94, salary, "Why this matches"), Boolean Search Builder (LinkedIn/Indeed/Google with copy-to-clipboard), Search Preferences (localStorage persistence), Cover Letter button per role
- `src/components/career-iq/InterviewLabRoom.tsx` — Upcoming Interviews (selectable list with round info), Company Research (overview, news, culture, key people for Medtronic), Practice Questions (5 predicted questions with expandable coaching tips, 4 categories), Interview History (3 past interviews with outcome tracking), Mock Interview CTA
- `supabase/migrations/20260306130000_job_applications_pipeline_stage.sql` — Adds `pipeline_stage` column to `job_applications` table with index

**Modified Files:**
- `src/components/career-iq/CareerIQScreen.tsx` — Added imports and routing for LinkedInStudioRoom, JobCommandCenterRoom, InterviewLabRoom; passes signals/whyMeClarity/onNavigate props
- `src/components/career-iq/ZoneYourPipeline.tsx` — Full rewrite: loads from Supabase `job_applications` on mount, falls back to mock data if unreachable or empty, optimistic drag-and-drop with Supabase persistence and rollback on error, archive updates `status` to 'archived', empty state with Job Command Center link
- `src/components/career-iq/ResumeWorkshopRoom.tsx` — Added `onNavigate` prop, Cover Letter button on completed sessions
- `src/components/career-iq/DashboardHome.tsx` — Passes `onNavigateRoom` to ZoneYourPipeline

### Decisions Made
- Pipeline reads real data when available, falls back to mock cards when Supabase is unreachable or returns 0 rows
- Drag-and-drop uses optimistic update pattern: update UI immediately, persist to Supabase, rollback by re-fetching on error
- Added `pipeline_stage` column (not reusing `status`) to keep pipeline tracking separate from application lifecycle status
- Cover Letter integration uses existing `onNavigate('cover-letter')` — no new components needed
- Agent Activity Feed already had a Cover Letter Agent mock item — no changes needed

### Quality Gate
- TypeScript: All new code compiles clean (only pre-existing ResearchDashboardPanel test errors)
- Tests: 628/628 passing, 0 failures
- Quality floor maintained at 628

---

## 2026-03-06 — Session 3 (Sprint 3 Complete)
**Sprint:** 3 | **Stories:** All 5 stories complete
**Summary:** Replaced localStorage with Supabase persistence for Why-Me stories, built Resume Workshop and Financial Wellness rooms, added 42 component tests, and closed the webinar-to-dashboard feedback loop.

### Changes Made

**New Files:**
- `supabase/migrations/20260306120000_why_me_stories.sql` — Migration: `why_me_stories` table with RLS policies (SELECT/INSERT/UPDATE), auto-update trigger, unique user constraint
- `src/components/career-iq/ResumeWorkshopRoom.tsx` — Resume Workshop room: session list, base resume status, "How It Works" 3-agent explainer, skeleton loading, empty state
- `src/components/career-iq/FinancialWellnessRoom.tsx` — Financial Wellness room: Retirement Bridge Analysis (runway visualization, burn rate, savings), planner connection CTA (fiduciary network), educational resources (4 articles), financial health indicator
- `src/__tests__/career-iq/CareerIQComponents.test.tsx` — 42 tests covering: useWhyMeStory (11), Sidebar (7), WhyMeEngine (6), WelcomeState (4), LivePulseStrip (3), ZoneYourDay (8), useMediaQuery (2)

**Modified Files:**
- `src/components/career-iq/useWhyMeStory.ts` — Supabase persistence: loads from Supabase on mount, debounced auto-save (500ms), localStorage offline fallback, migration of existing localStorage data to Supabase on first authenticated load, new `loading` return value
- `src/components/career-iq/CareerIQScreen.tsx` — Added ResumeWorkshopRoom and FinancialWellnessRoom routing, new props for session/resume data from App.tsx, removed resume→landing redirect (now renders embedded room)
- `src/App.tsx` — Passes sessions, resumes, sessionsLoading, onNewSession, onResumeSession to CareerIQScreen
- `src/components/career-iq/LiveSessionsRoom.tsx` — Added post-session summaries to replays (key points, top question, action item), expandable ReplayCard component, LatestSessionSummary card, new icons
- `src/components/career-iq/ZoneYourDay.tsx` — Webinar-triggered insights rotate into Zone 1 on Mon-Tue (from recent sessions), replaced static INSIGHTS_BY_STATE with getRotatingInsight()

### Decisions Made
- Why-Me Supabase uses `upsert` with `onConflict: 'user_id'` — simpler than insert/update branching
- Debounce at 500ms for Supabase saves — balances responsiveness with API calls
- Resume Workshop embeds session list within CareerIQ frame rather than navigating to separate landing page
- Financial Wellness uses age-appropriate, non-panic language per design brief
- Webinar insights rotate by day of week (Mon-Tue shows recent session insight, Wed-Sun shows default)

### Quality Gate
- TypeScript: All new code compiles clean (only pre-existing ResearchDashboardPanel test errors)
- Tests: 628/628 passing (586 original + 42 new), 0 failures
- Test floor increased from 586 to 628

---

## 2026-03-06 — Session 2 (Sprint 2 Complete)
**Sprint:** 2 | **Stories:** All 5 stories complete
**Summary:** Added Why-Me Story Engine, dashboard state management, Live Pulse Strip, Live Sessions Room, and mobile daily briefing.

### Changes Made

**New Files (6 components + 2 hooks):**
- `src/components/career-iq/useWhyMeStory.ts` — Custom hook: Why-Me story state with localStorage persistence, signal assessment (clarity/alignment/differentiation), 3 dashboard states (new-user/refining/strong)
- `src/components/career-iq/WhyMeEngine.tsx` — 3-step guided coaching flow with coaching prompts, step indicators, character count, encouragement messages, signal dots per step
- `src/components/career-iq/WelcomeState.tsx` — State 1 welcome view for new users with hero card, CTA, preview grid of 4 locked rooms
- `src/components/career-iq/LivePulseStrip.tsx` — Always-visible session strip: countdown timer, LIVE NOW indicator with 2s pulsing animation, join/reminder button, mock session rotation
- `src/components/career-iq/LiveSessionsRoom.tsx` — Dedicated room: weekly schedule grid, "Ask Before the Session" question submission, replay library with relevance tags, 1:1 Office Hours placeholder (premium)
- `src/components/career-iq/MobileBriefing.tsx` — Mobile daily briefing: 3-card swipeable stack (action, agents, live session), bottom nav (5 tabs), touch gesture support
- `src/components/career-iq/useMediaQuery.ts` — Responsive breakpoint hook for mobile detection

**Modified Files:**
- `src/components/career-iq/CareerIQScreen.tsx` — Integrated all Sprint 2 components: Why-Me state management, dashboard state routing, LivePulseStrip, LiveSessionsRoom routing, mobile breakpoint detection
- `src/components/career-iq/Sidebar.tsx` — Gated rooms with lock icon for new-user state, renamed "Learning Center" to "Live Sessions" with Video icon
- `src/components/career-iq/DashboardHome.tsx` — Passes signals, dashboardState, onRefineWhyMe to ZoneYourDay
- `src/components/career-iq/ZoneYourDay.tsx` — Dynamic content by dashboard state, real signal dots from hook, "Refine story" link in strong state

### Decisions Made
- Used localStorage for Why-Me story persistence (upgradeable to Supabase later)
- Signal assessment: empty = red, <50 chars = yellow, >=50 chars = green
- Mobile breakpoint at 767px (standard md breakpoint)
- Touch swipe threshold: 50px delta to change cards
- Live Pulse Strip uses mock session schedule rotating by day of week
- "LIVE NOW" simulated when current minutes < 30 (demo purposes)

### Known Issues
- Pre-existing: 7 TS errors in ResearchDashboardPanel.test.tsx (stale BenchmarkProfile type assertions)
- Mobile briefing doesn't render WhyMeEngine overlay (would need separate mobile engine flow)

### Quality Gate
- TypeScript: All new code compiles clean (only pre-existing test file errors)
- Tests: 586/586 passing, 0 failures
- Quality floor maintained

---

## 2026-03-06 — Session 1 (Sprint 1 Complete)
**Sprint:** 1 | **Stories:** All 5 stories complete
**Summary:** Built the full CareerIQ consumer dashboard with 4-zone layout, 8-room sidebar navigation, and mock data.

### Changes Made

**New Files (8 components):**
- `src/components/career-iq/CareerIQScreen.tsx` — Main container with sidebar + content routing
- `src/components/career-iq/Sidebar.tsx` — 8-room collapsible navigation with active state highlighting
- `src/components/career-iq/DashboardHome.tsx` — 4-zone layout orchestrator
- `src/components/career-iq/ZoneYourDay.tsx` — Zone 1: Daily briefing with greeting, AI insight, action button, Why-Me Strength Indicator (3-signal), momentum streak
- `src/components/career-iq/ZoneYourPipeline.tsx` — Zone 2: Kanban pipeline with drag-and-drop, 5 stages, stale card detection, archive, company initials, activity pulse
- `src/components/career-iq/ZoneAgentFeed.tsx` — Zone 3: Agent activity feed with room navigation, 72-hour history split, clickable items
- `src/components/career-iq/ZoneYourSignals.tsx` — Zone 4: 3 honest signal cards with progress bars, qualitative levels, contextual details
- `src/components/career-iq/RoomPlaceholder.tsx` — Coming Soon placeholder for future rooms

**Modified Files:**
- `src/App.tsx` — Added `career-iq` view type, `/career-iq` route, URL detection, popstate handler, CareerIQScreen rendering
- `src/components/Header.tsx` — Added CareerIQ navigation button (blue accent, prominent)

**Scrum Files:**
- `docs/BACKLOG.md` — Created with 8 stories for dashboard epic
- `docs/CURRENT_SPRINT.md` — Sprint 1 with all 5 stories complete
- `docs/SPRINT_LOG.md` — Initialized
- `docs/CHANGELOG.md` — This file

**Planning Files:**
- `docs/agentic-ai-planning/` — 28 .docx + 28 .txt planning documents from Google Drive
- `docs/agentic-ai-planning/SYNTHESIS.md` — Comprehensive synthesis of all 28 documents (33-agent catalog, architecture, roadmap)
- `docs/agentic-ai-planning/CareerIQ-Dashboard-Design-Brief.txt` — Converted design brief

### Design Decisions
- Glass morphism styling consistent with existing app (GlassCard, GlassButton, dark theme)
- State-based routing (matching existing pattern) — not React Router
- Mock data for all zones — ready to wire to real APIs
- Resume Workshop room redirects to existing landing/resume agent (preserves current functionality)
- Sidebar collapses to icons for smaller screens
- Zone 2 uses native HTML5 drag-and-drop (no library dependency)
- Qualitative signals (Strong/Building/Needs work) instead of percentages — per design brief
- Agent feed items navigate to their relevant room on click

### Quality Verification
- `npx tsc --noEmit` — PASS (0 new errors)
- `npx vitest run` — 586 tests passing, 0 failures (quality floor maintained)

### Next Steps
- Sprint 2: Why-Me Story Engine, Live Pulse Strip, Mobile Briefing
- Wire real data to zones as backend APIs become available
- Build individual room pages (LinkedIn Studio, Job Command Center, etc.)
