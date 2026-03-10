# Platform UX Audit — Full Tool Inventory

> Created: 2026-03-09 | Completed: 2026-03-10 | Sprint: 61+ | Status: **COMPLETE**
> Covers all 22 active products + dashboard/navigation
> **55 bugs found: 14 HIGH, 18 MEDIUM, 12 LOW + 6 cross-cutting patterns**
> Audited twice by 8 independent QA agents for thoroughness

---

## Platform Scope

| # | Tool | Category | Room Key | Backend Route | Feature Flag | Audit Status |
|---|------|----------|----------|---------------|--------------|--------|
| 1 | Resume Strategist | career | `/app` (separate page) | `resume-pipeline.ts` | (always on) | **AUDITED** (Sprint 61) |
| 2 | Cover Letter Writer | writing | `/cover-letter` (separate page) | `cover-letter.ts` | FF_COVER_LETTER | **AUDITED** |
| 3 | Interview Prep Coach | interview | `interview` | `interview-prep.ts` | FF_INTERVIEW_PREP | **AUDITED** |
| 4 | LinkedIn Optimizer | career | `linkedin` | `linkedin-optimizer.ts` | FF_LINKEDIN_OPTIMIZER | **AUDITED** |
| 5 | Content Calendar | writing | `content-calendar` | `content-calendar.ts` | FF_CONTENT_CALENDAR | **AUDITED** |
| 6 | Job Command Center | career | `jobs` | `job-search.ts`, `job-tracker.ts`, `application-pipeline.ts` | FF_JOB_SEARCH, FF_APPLICATION_PIPELINE | **AUDITED** |
| 7 | Job Applier (Extension) | career | external | `extension.ts` | FF_EXTENSION | N/A (Chrome ext) |
| 8 | Networking Hub | networking | `networking` | `networking-outreach.ts`, `networking-contacts.ts` | FF_NETWORKING_OUTREACH, FF_NETWORKING_CRM | **AUDITED** |
| 9 | Salary Negotiation | planning | `salary-negotiation` | `salary-negotiation.ts`, `counter-offer-sim.ts` | FF_SALARY_NEGOTIATION, FF_COUNTER_OFFER_SIM | **AUDITED** |
| 10 | 90-Day Plan | planning | `ninety-day-plan` | `ninety-day-plan.ts` | FF_NINETY_DAY_PLAN | **AUDITED** |
| 11 | Executive Bio | writing | `executive-bio` | `executive-bio.ts` | FF_EXECUTIVE_BIO | **AUDITED** |
| 12 | Case Study | writing | `case-study` | `case-study.ts` | FF_CASE_STUDY | **AUDITED** |
| 13 | Thank You Note | writing | `thank-you-note` | `thank-you-note.ts` | FF_THANK_YOU_NOTE | **AUDITED** |
| 14 | Personal Brand Audit | intelligence | `personal-brand` | `personal-brand.ts` | FF_PERSONAL_BRAND_AUDIT | **AUDITED** |
| 15 | Network Intelligence | intelligence | `network-intelligence` | `ni.ts` | FF_NETWORK_INTELLIGENCE | **AUDITED** |
| 16 | Onboarding Assessment | career | `/onboarding` | `onboarding.ts` | FF_ONBOARDING | coming_soon |
| 17 | Mock Interview | interview | `interview` | `mock-interview.ts` | FF_MOCK_INTERVIEW | **AUDITED** |
| 18 | LinkedIn Content Writer | writing | `linkedin` | `linkedin-content.ts` | FF_LINKEDIN_CONTENT | **AUDITED** |
| 19 | LinkedIn Profile Editor | career | `linkedin` | `linkedin-editor.ts` | FF_LINKEDIN_EDITOR | **AUDITED** |
| 20 | Interview Debrief | interview | `interview` | `interview-debrief.ts` | FF_INTERVIEW_DEBRIEF | **AUDITED** |
| 21 | Counter-Offer Sim | planning | `salary-negotiation` | `counter-offer-sim.ts` | FF_COUNTER_OFFER_SIM | **AUDITED** |
| 22 | Momentum Tracker | intelligence | `dashboard` | `momentum.ts` | FF_MOMENTUM | **AUDITED** |
| 23 | Retirement Bridge | financial | `financial` | `retirement-bridge.ts` | FF_RETIREMENT_BRIDGE | **AUDITED** |
| 24 | B2B Admin Portal | planning | `/b2b` | `b2b-admin.ts` | FF_B2B_OUTPLACEMENT | coming_soon |
| 25 | Planner Handoff | financial | `/career-iq` | `planner-handoff.ts` | (embedded in retirement) | coming_soon |

---

## Architecture Patterns

### Pattern A: SSE Pipeline (Product Route Factory)
- Uses `product-route-factory.ts` with ProductConfig
- 3 endpoints: `/start`, `/:id/stream`, `/respond`
- Frontend hook uses SSE streaming + state machine
- Tools: Resume, Cover Letter, Executive Bio, Case Study, Thank You Note, Content Calendar, Interview Prep, Mock Interview, Personal Brand, Salary Negotiation, 90-Day Plan, Networking Outreach, LinkedIn Content, LinkedIn Editor, LinkedIn Optimizer, Retirement Bridge

### Pattern B: REST CRUD
- Frontend talks to REST endpoints or directly to Supabase
- Tools: Job Command Center (pipeline CRUD), Networking Hub (contacts CRM), Interview Debrief, Momentum Tracker

### Pattern C: Hybrid
- Network Intelligence: no dedicated hook, sub-components make direct fetch calls with access token

---

## Bug Registry — By Severity

### HIGH (14 bugs — broken functionality or trust violations)

| ID | Tool | Bug | File(s) |
|----|------|-----|---------|
| H1 | Executive Bio | Format enum `'linkedin'` vs backend `'linkedin_featured'`, length `'long'` vs backend `'standard'` — **default selections always fail with 400** | `ExecutiveBioRoom.tsx:33-44`, `executive-bio.ts:26-34` |
| H2 | Content Calendar | `parsePostsFromReport` regex fails silently when LLM output varies format — calendar view disappears with no error | `ContentCalendarRoom.tsx:146-166` |
| H3 | Content Calendar | `savedReports` fetched by hook but never rendered in standalone room — prior calendars lost on navigation | `ContentCalendarRoom.tsx`, `useContentCalendar.ts` |
| H4 | Interview Debrief | `refresh()` never called on mount — debrief count badge always 0, saved debriefs never load | `InterviewLabRoom.tsx`, `useInterviewDebriefs.ts` |
| H5 | LinkedIn Studio | `MOCK_PROFILE` (hardcoded VP of Ops persona) renders in Analytics tab when optimizer report parsing fails | `LinkedInStudioRoom.tsx:695-700` |
| H6 | Retirement Bridge | Educational resource cards styled as clickable (`cursor-pointer`, `ArrowRight` icon, hover states) but have **no href or onClick** | `FinancialWellnessRoom.tsx:31-63` |
| H7 | Dashboard (Mobile) | `isMobile === true` renders `MobileBriefing` unconditionally — **mobile users cannot access any room content** | `CareerIQScreen.tsx:306-315` |
| H8 | Dashboard | Mock data renders as real data: 7 fake pipeline cards (`FALLBACK_CARDS`), 7 fake agent activities (`MOCK_FEED`), fake 3-day streak (`MOCK_STREAK`) — **trust violation for new users** | `ZoneYourPipeline.tsx`, `ZoneAgentFeed.tsx`, `ZoneYourDay.tsx` |
| H9 | Dashboard | Live Pulse Strip shows "Live Now" when `minutes < 30` of any hour — fake schedule with no-op "Join Now" button | `LivePulseStrip.tsx:31` |
| H10 | Job Command Center | `loadLatestScan` reads `data.jobs`/`data.scan_id` but backend returns `{ scan, results }` — **Radar tab always empty on room re-entry** | `useRadarSearch.ts:269-322`, `job-search.ts:140-218` |
| H11 | Momentum | `logActivity` never triggered from any tool completion — **streak stays at 0 for all users** | All tool hooks, `useMomentum.ts` |
| H12 | Momentum | `checkStalls` never called — coaching nudges from stall detection cannot generate | `useMomentum.ts:179-201`, `DashboardHome.tsx` |
| H13 | Counter-Offer Sim | `simulation_complete` reads `data.overall_score` instead of `data.summary.overall_score` — **all summary fields are undefined**, blank summary card | `useCounterOfferSim.ts:183` |
| H14 | Dashboard | `initialRoom` from URL cast as `CareerIQRoom` without validation — `/career-iq?room=bogus` crashes `RoomPlaceholder` on `undefined.title` | `CareerIQScreen.tsx:85,92` |

### MEDIUM (18 bugs — degraded UX or missing integration)

| ID | Tool | Bug | File(s) |
|----|------|-----|---------|
| M1 | Case Study | `focusAreas` field accepted by UI but **never serialized into POST body** — field is cosmetic | `useCaseStudy.ts:256-268`, `CaseStudyRoom.tsx:206,254` |
| M2 | Interview Lab | 4 mock data blocks: `MOCK_UPCOMING` (Medtronic/Abbott), `MOCK_COMPANY_INTEL` (static Medtronic), `MOCK_QUESTIONS` (static supply-chain), `SEED_HISTORY` (fake past interviews) | `InterviewLabRoom.tsx:66-97` |
| M3 | Retirement Bridge | `useRetirementBridge` has **no SSE reconnect logic** — only hook in platform without it; stream drop = permanent spinner | `useRetirementBridge.ts` |
| M4 | LinkedIn Editor | `pipeline_complete` handler doesn't transition to `complete` state — editor stuck in limbo on partial failure | `useLinkedInEditor.ts:172-179` |
| M5 | LinkedIn Content | `selectTopic` opens new SSE connection without aborting existing one — potential duplicate events | `useLinkedInContent.ts:352` |
| M6 | Personal Brand | `finding_identified` SSE events with severity downgraded to plain activity text — critical findings look identical to info | `usePersonalBrand.ts` |
| M7 | Dashboard | Market Alignment signal never receives `pipelineStats` prop — always shows "Needs work" | `DashboardHome.tsx:183-190`, `ZoneYourSignals.tsx:58-73` |
| M8 | Dashboard | Strong-state CTA says "Update LinkedIn headline" but `onClick` opens Why-Me Engine | `ZoneYourDay.tsx:79` |
| M9 | Dashboard (Mobile) | Bottom nav "Agents" tab routes to dashboard (same as Home); "Profile" tab does nothing; `activeTab` hardcoded to `'dashboard'` | `MobileBriefing.tsx:249-255,304` |
| M10 | Salary Negotiation | Stage indicator names hardcoded — mismatch with backend stage names = all stages stay gray | `SalaryNegotiationRoom.tsx:388-409` |
| M11 | Networking Hub | `ContactDetailSheet` defined but **never reachable** — no UI element triggers `handleOpenContactDetail` | `NetworkingHubRoom.tsx:907-913` |
| M12 | Networking Hub | `OutreachGenerator` requires manual resume paste — no auto-load from `master_resumes` (inconsistent with Salary Negotiation, 90-Day Plan) | `NetworkingHubRoom.tsx:565-831` |
| M13 | Networking Hub | `fetchContacts()` never called on mount — contacts list always empty on room load, breaking WeeklyActivity and Rule of Four | `NetworkingHubRoom.tsx:860+` |
| M14 | Retirement Bridge | Planner connection CTA shown before assessment — appears as pre-assessment sales push | `FinancialWellnessRoom.tsx` |
| M15 | WhyMe Engine | Supabase load failure silently disables all saves for the session (`initialLoadDone` stays false) | `useWhyMeStory.ts:82-88,131` |
| M16 | LinkedIn Editor | Missing `why_me_story` context load in `transformInput` — only tool in LinkedIn cluster that doesn't load it | `linkedin-editor.ts:48-53` |
| M17 | Job Command Center | `SearchPreferences` saves to localStorage but values **never passed to search API** — filters are cosmetic | `JobCommandCenterRoom.tsx:342-429`, `useRadarSearch.ts` |
| M18 | LinkedIn Content | `pipeline_complete` fires before `content_complete` → UI transitions to `complete` with `postDraft` still null — blank output | `useLinkedInContent.ts` |

### LOW (12 bugs — minor polish or edge cases)

| ID | Tool | Bug |
|----|------|-----|
| L1 | Mock Interview | `FULL_MODE_TOTAL = 6` magic constant must manually match server-side question count |
| L2 | Mock Interview | Practice mode can pass empty `resumeText`, causing silent 400 from backend `min(50)` validation |
| L3 | Interview Debrief | "Generate Thank You Notes" button is a no-op stub (`console.log` in dev, nothing in prod) |
| L4 | Planner Handoff | `planners` array not cleared on qualify/match failure — minor data consistency risk |
| L5 | 90-Day Plan | `targetRole`/`targetCompany` not cleared on reset — stale values in ReportView |
| L6 | 90-Day Plan | `<label>` elements have no `htmlFor`/`id` association — screen reader accessibility gap |
| L7 | Daily Ops | `staleApplications` computed by `useDailyOps` but never rendered by `DailyOpsSection` |
| L8 | Network Intelligence | Double active tab indicator (pill strip + bg highlight) — redundant UI |
| L9 | Network Intelligence | `scan-jobs` tab unlocked without connections — may confuse users if scraper requires company IDs |
| L10 | Dashboard | Up to 5 simultaneous nudge bars possible (2 hardcoded + 3 momentum) — no coordination |
| L11 | Momentum | `useMomentum` fires API calls unconditionally even when `FF_MOMENTUM=false` — 404 noise on every dashboard load | `useMomentum.ts:70`, `CareerIQScreen.tsx:101` |
| L12 | Product Catalog | `onboarding-assessment` marked `coming_soon` but server agent is fully built behind `FF_ONBOARDING` | `platform.ts` |

---

## Cross-Cutting Patterns (6)

### Pattern 1: Platform Context Invisibility
**Affects:** All 16 SSE tools
**Problem:** Every backend `transformInput` hook loads `positioning_strategy`, `evidence_items`, `emotional_baseline`, and/or `why_me_story` from `user_platform_context`. None of the 16 frontend rooms indicate whether this context was found and used. A user who completed the resume pipeline gets substantially better output from all tools but cannot tell why.
**Fix:** Add a global `<ContextLoadedBadge>` component: "Using your positioning strategy from [date]" — render in all tool rooms when context exists.

### Pattern 2: Feature Flag Wall
**Affects:** All 22 tools (all flags default `false`)
**Problem:** When a feature flag is off, the backend returns 404. The frontend makes the call anyway and shows a generic error ("Failed to start (404)"). No tool checks feature flag status before API calls.
**Fix:** Either (a) add `GET /api/feature-flags` endpoint returning enabled flags, check before rendering tool UI, or (b) backend returns 403 with `{ error: "feature_not_enabled" }` and frontend shows "Coming soon" state instead of error.

### Pattern 3: Rich Backend Data Lost at API Boundary
**Affects:** Cover Letter, Executive Bio, Case Study, Content Calendar, Personal Brand, Salary Negotiation, 90-Day Plan
**Problem:** Backend agents produce rich structured output (per-bio positioning alignment scores, per-case narrative clarity subscores, per-topic evidence references, per-finding severity). All collapsed into a single markdown report string at the SSE emission boundary. The granular metadata is never surfaced to users.
**Fix:** Emit structured data alongside markdown in completion events. Frontend can show quality breakdowns, evidence provenance, keyword density, etc.

### Pattern 4: No Session Persistence
**Affects:** Executive Bio, Case Study, Thank You Note, Personal Brand, Salary Negotiation, 90-Day Plan
**Problem:** Browser refresh during generation = lost session. Navigation away after completion = results gone. No `loadPriorResult()` or session restore flow. Only Cover Letter (via `coach_sessions`) and Content Calendar (via `savedReports` — but not rendered in standalone room) have persistence.
**Fix:** All SSE tools should persist completed results as workflow artifacts and restore them on room mount.

### Pattern 5: Resume Auto-Load Inconsistency
**Affects:** Networking Hub (OutreachGenerator), Network Intelligence (BooleanSearchBuilder)
**Problem:** Salary Negotiation, 90-Day Plan, Cover Letter, Executive Bio, Case Study, Thank You Note, Personal Brand all auto-load the master resume on mount. Networking Hub and Network Intelligence require manual paste.
**Fix:** Add `master_resumes` auto-load to OutreachGenerator and BooleanSearchBuilder.

### Pattern 6: Mock Data Trust Violation
**Affects:** Dashboard (ZoneYourPipeline, ZoneAgentFeed, ZoneYourDay), Interview Lab (UpcomingInterviews, CompanyResearch, PracticeQuestions, InterviewHistory), LinkedIn Studio (MOCK_PROFILE)
**Problem:** Hardcoded mock data renders identically to real data. New users see fabricated pipeline boards, agent activity, interview histories, and company research with no visual distinction. This creates a fundamental trust problem — users cannot tell what is real.
**Fix:** Replace all mock data with empty states and clear CTAs. If demo data is desired for onboarding, label it explicitly ("Demo data — complete your first session to see real results").

---

## Platform Context Integration Map

| Tool | positioning_strategy | evidence_items | why_me_story | career_narrative | emotional_baseline | client_profile |
|------|---------------------|---------------|-------------|-----------------|-------------------|---------------|
| Resume Strategist | writes | writes | reads | - | reads | reads |
| Cover Letter | reads | reads | - | - | reads | - |
| Executive Bio | reads | - | - | reads | reads | - |
| Case Study | reads | reads | - | - | reads | - |
| Thank You Note | reads | - | - | - | reads | - |
| Content Calendar | reads | reads | reads (why_me_stories table) | - | - | - |
| LinkedIn Content | reads | reads | - | reads | reads | - |
| Interview Prep | reads | reads | reads | - | reads | - |
| Mock Interview | reads | reads | reads | - | - | - |
| Salary Negotiation | reads | - | reads | - | reads | - |
| 90-Day Plan | reads | - | - | - | reads | - |
| Networking Outreach | reads | reads | reads (why_me_stories table) | - | - | - |
| Personal Brand | reads | - | - | reads | - | - |
| Retirement Bridge | - | - | - | - | reads | reads |
| LinkedIn Optimizer | reads | - | reads | - | - | - |
| LinkedIn Editor | reads | - | **MISSING** (M16) | - | - | - |
| Job Command Center | reads (via job-finder agent) | - | - | - | - | - |
| Network Intelligence | - | - | - | - | - | - |
| Momentum | - | - | - | - | - | - |
| Interview Debrief | - | - | - | - | - | - |

---

## Remediation Plan — Prioritized Sprints

### Sprint R1: Trust & Broken Functionality (HIGH bugs)
**Goal:** Fix all HIGH-severity bugs that break functionality or violate user trust.
**Estimated stories:** 10

| Story | Bugs Fixed | Estimated Complexity |
|-------|-----------|---------------------|
| R1-1: Fix Executive Bio enum mismatches | H1 | Small |
| R1-2: Replace dashboard mock data with empty states | H8, H9 | Medium |
| R1-3: Fix mobile room navigation | H7, M9 | Medium |
| R1-4: Fix Radar `loadLatestScan` response shape | H10 | Medium |
| R1-5: Fix Interview Debrief `refresh()` + LinkedIn `MOCK_PROFILE` guard | H4, H5 | Small |
| R1-6: Fix Retirement Bridge ghost links | H6 | Small |
| R1-7: Wire Momentum `logActivity` into tool completions | H11, H12 | Medium |
| R1-8: Fix Content Calendar: emit structured data + render saved reports | H2, H3 | Large |
| R1-9: Fix Counter-Offer Sim `simulation_complete` deserialization | H13 | Small |
| R1-10: Validate `initialRoom` URL param before cast | H14 | Small |

### Sprint R2: Integration & Data Flow (MEDIUM bugs)
**Goal:** Fix data flow mismatches and missing integrations.
**Estimated stories:** 11

| Story | Bugs Fixed | Estimated Complexity |
|-------|-----------|---------------------|
| R2-1: Replace Interview Lab mock data with empty states / real data | M2 | Medium |
| R2-2: Add platform context visibility badge (global component) | Pattern 1 | Medium |
| R2-3: Fix Case Study `focusAreas` end-to-end | M1 | Small |
| R2-4: Add SSE reconnect to Retirement Bridge hook | M3 | Small |
| R2-5: Fix LinkedIn Editor `pipeline_complete` + missing `why_me_story` | M4, M16 | Small |
| R2-6: Wire `pipelineStats` to `ZoneYourSignals` + fix strong-state CTA | M7, M8 | Small |
| R2-7: Fix Networking Hub: resume auto-load + `fetchContacts` on mount + ContactDetailSheet | M11, M12, M13 | Medium |
| R2-8: Fix Salary Negotiation stage indicator alignment | M10 | Small |
| R2-9: Fix LinkedIn Content `selectTopic` SSE race + `pipeline_complete` guard | M5, M18 | Small |
| R2-10: Fix Personal Brand finding severity display | M6 | Small |
| R2-11: Fix WhyMe Engine Supabase load failure + Retirement Bridge CTA ordering | M14, M15 | Small |

### Sprint R3: Polish & Patterns (LOW bugs + cross-cutting)
**Goal:** Address cross-cutting patterns and remaining polish items.
**Estimated stories:** 7

| Story | Bugs Fixed | Estimated Complexity |
|-------|-----------|---------------------|
| R3-1: Feature flag frontend guard (graceful "not enabled" state) | Pattern 2, L11 | Medium |
| R3-2: Session persistence for SSE tools (workflow artifact restore) | Pattern 4 | Large |
| R3-3: Structured quality data in SSE completion events | Pattern 3 | Large |
| R3-4: Accessibility pass (htmlFor/id, screen reader) | L6 | Small |
| R3-5: Fix remaining LOW bugs (L1-L5, L7-L10) | L1-L10 | Medium |
| R3-6: Coordinate nudge systems (cap total, unify styling) | L10 | Small |
| R3-7: Fix JCC SearchPreferences wiring + update product catalog status | M17, L12 | Small |

---

## Audit Methodology

Eight parallel QA agents (two passes of four) audited the full platform on 2026-03-10:
1. **Writing Tools** (6 tools): Cover Letter, Executive Bio, Case Study, Thank You Note, Content Calendar, LinkedIn Content
2. **Career & Planning** (7 tools): Job Command Center, Salary Negotiation, Counter-Offer Sim, 90-Day Plan, Networking Hub, Network Intelligence, Momentum
3. **Interview & Intelligence** (7 tools): Interview Prep, Mock Interview, Interview Debrief, Personal Brand, LinkedIn Optimizer/Editor, Retirement Bridge
4. **Dashboard & Navigation**: CareerIQScreen, Sidebar, DashboardHome, MobileBriefing, WhyMeEngine, LivePulseStrip, ZoneComponents, ProductCatalog

Each agent traced the full data flow: **backend route → frontend hook → room component**, checking for:
- Mock vs real data usage
- Platform context integration
- Backend data the frontend ignores
- Type/shape mismatches between server and client
- UX flow completeness (input → processing → output)
- Error and loading states
- Accessibility

#type/audit #status/done #sprint/61
