# Backlog — Resume Agent

## Parking Lot — Open Decisions

Items the owner has flagged for revisit. Not stories yet; capture-only so they don't get lost between sessions.

### Reconsider freemium offering for new users — flagged 2026-04-25
- **Surface today:** Onboarding/account-creation page advertises "three resumes free and try your free resume builder."
- **Owner concern:** Doesn't believe we can sustainably offer that — the resume builder is the headline product and the marginal cost (LLM tokens, infra) per generation is meaningful.
- **Alternatives the owner is considering:**
  - **Free webinars** — 3-4 live sessions/week already on the platform; a logical low-marginal-cost lead magnet.
  - **Free career coaching** — could be made the entry experience; positions us against pure tools.
  - **Other ideas welcome.** Worth a competitive scan of how other platforms (Teal, Resume.io, Rezi, JobScan, Kickresume, Enhancv, Indeed Resume Builder, LinkedIn Premium, BetterUp, etc.) structure their entry/freemium layer before committing.
- **Action when revisited:**
  1. Scan competitor freemium / paywall structures.
  2. Decide what we offer free at the door (webinars? one micro-tool? coaching session?).
  3. Update the marketing copy on the account-creation page.
  4. Update CLAUDE.md / Project Hub if the product mission positioning shifts.

---

## Epic: Platform Decoupling (COMPLETE — Sprint 12)

The Product Definition Layer is complete. `ProductConfig`, `runProductPipeline()`, and `createProductRoutes()` form the generic multi-product runtime. The resume product runs through the generic coordinator. The cover letter POC validates the abstraction with a second product.

### ~~Follow-up: Migrate `routes/pipeline.ts` to Product Route Factory~~ COMPLETE (Sprint 13, Stories 3-6)
`routes/pipeline.ts` deleted. Resume pipeline now uses `createProductRoutes()` with lifecycle hooks via `routes/resume-pipeline.ts`.

### ~~Follow-up: Remove Deprecated `TOOL_MODEL_MAP`~~ COMPLETE (Sprint 13, Story 1)
`TOOL_MODEL_MAP` deleted. All 26 tools have `model_tier` set. `resolveToolModel()` simplified.

### ~~Follow-up: Rename `interview_transcript` to `questionnaire_responses`~~ COMPLETE (Sprint 13, Story 2)
Field renamed across all references. No functional change.

---

## Epic: Legacy Code Migration

### ~~Story: Decommission Legacy `agent/` Directory~~ COMPLETE (Sprint 7)
Legacy `agent/` directory deleted (8,653 lines removed). Chat route migrated to coordinator-based pipeline.

---

## Epic: Platform Expansion

### Story: 33-Agent Platform — Phase 3
- **As a** product owner
- **I want to** continue expanding the platform runtime for multi-product deployment
- **So that** we can launch additional agent-powered products beyond resume and cover letter
- **Acceptance Criteria:**
  - [x] Agent bus supports cross-product routing (Sprint 11, Story 7)
  - [x] Agent registry supports capability-based discovery (Sprint 11, Story 8)
  - [x] Lifecycle hooks wired in agent loop (Sprint 11, Story 9)
  - [x] ProductConfig + runProductPipeline generic coordinator (Sprint 12, Stories 1-3)
  - [x] Product route factory (Sprint 12, Story 5)
  - [x] Cover letter POC validates multi-product abstraction (Sprint 12, Stories 6-7)
  - [x] Platform product catalog UI at `/tools` (Sprint 14, Story 7)
  - [x] Shared user context data model for cross-product access (Sprint 14, Story 8)
  - [x] Product landing pages at `/tools/:slug` (Sprint 15, Story 6)
  - [x] Cross-product context consumption — cover letter bootstraps from resume context (Sprint 15, Story 7)
  - [ ] Redis/NATS bus adapter for distributed deployment
  - [ ] Agent hot-reload without server restart
  - [ ] Cross-product authentication and authorization
  - [ ] Platform admin dashboard for agent monitoring
  - [ ] Migrate product catalog from static constant to DB-driven (when >15 products)
- **Estimated complexity:** Large
- **Dependencies:** Sprint 12 (complete)

### ~~Story: Consumer Dashboard — Product Landing Pages~~ COMPLETE (Sprint 15, Story 6)
Product landing page component at `/tools/:slug` with features grid, CTA, back navigation. Catalog grid routes through landing pages.

### ~~Story: Cross-Product Context Consumption~~ COMPLETE (Sprint 15, Story 7)
Cover letter product reads positioning strategy + evidence from `user_platform_context` on start. Missing context gracefully handled.

---

## Epic: Technical Debt

### ~~Story: Clean Orphaned Props from ChatPanel and WorkflowStatsRail~~ COMPLETE (Sprint 54, Story 54-1)
~~Verified already clean — WorkflowStatsRail was removed in Sprint 16, all ChatPanel props are actively used. No code change needed.~~

### ~~Story: IntelligenceActivityFeed Message Deduplication~~ COMPLETE (Sprint 54, Story 54-2)
~~Adjacent duplicates collapsed, near-duplicates (same message within 5s) deduplicated. +13 app tests added.~~

### ~~Story: Fix Remaining Pre-Existing Test Failures~~ COMPLETE
All 29 tests in `agents-gap-analyst.test.ts` now pass. The 2 pre-existing failures were resolved.

### ~~Story: Resolve MaxListenersExceededWarning Root Cause~~ COMPLETE (Sprint 15, Story 3)
All 6 `setMaxListeners` calls removed. `agent-loop.ts` uses per-round scoped AbortControllers with proper cleanup.

### ~~Story: Rename `interview_transcript` to `questionnaire_responses`~~ COMPLETE (Sprint 13, Story 2)

### ~~Story: Deduplicate Workflow Persistence Helpers~~ COMPLETE (Sprint 15, Story 2)
Shared `lib/workflow-persistence.ts` created. Both `event-middleware.ts` and `route-hooks.ts` import from shared module.

### ~~Story: Fix `resumes-edit.test.ts` TypeScript Error~~ COMPLETE (Sprint 15, Story 1)
Fixed null-to-Record cast at line 292. `tsc --noEmit` clean.

### ~~Story: Unify Gap Analysis Types and Classification Scheme~~ COMPLETE (2026-03-30)
~~Canonical `GapClassification` (`strong|partial|missing`) confirmed in resume-v2.ts. Legacy `RequirementFitItem`/`GapAnalysisData` in panels.ts marked @deprecated with mapper `classificationToLegacy()`. `report-colors.ts` gets `classificationToTier()` mapper. `GapAnalysisReportPanel` wired to canonical mapper. Legacy `GapAnalysisPanel` annotated as deprecated. `PositioningAssessment.status` and `GapQuestion.importance` documented as intentionally different domains. 105/105 gap tests pass.~~

### ~~Story: Update ARCHITECTURE-V2.md to Reflect Live Pipeline~~ COMPLETE (2026-03-30)
~~Full rewrite: 7-agent sequential spec replaced with live 10-agent, 5-stage pipeline. All agent descriptions, model routing, SSE events, pipeline state, file layout, and design principles updated to match production code. Last-updated date and authority note added.~~

### ~~Story: Add Agent Integrity Mandate Cross-Reference to AGENTS.md~~ COMPLETE (2026-03-30)
~~AGENTS.md updated: CLAUDE.md added to Order of Authority (#2) and Mandatory Startup Reads (#2). Core Operating Rule #11 added referencing the Agent Integrity Mandate by name with all 4 anti-patterns listed.~~

---

## Epic: Cover Letter Product

### ~~Story: Cover Letter Frontend UI~~ COMPLETE (Sprint 18)
Intake form, SSE streaming hook, CoverLetterScreen workspace, text + PDF export. 7 stories delivered.

### ~~Story: Cover Letter DOCX Export~~ COMPLETE (Sprint 47, verified Sprint 54 Story 54-3)
~~`exportCoverLetterDocx()` and UI export button both implemented. Filename: `{Name}_{Company}_Cover_Letter.docx`.~~

### Story: Cover Letter Dashboard Integration
- **As a** user
- **I want to** see my cover letter sessions in the dashboard
- **So that** I can revisit and re-export previous cover letters
- **Acceptance Criteria:**
  - [ ] Cover letter sessions visible in Sessions tab
  - [ ] Ability to view completed cover letter text
  - [ ] Re-export to PDF/text
- **Estimated complexity:** Medium
- **Dependencies:** None

### ~~Story: Cover Letter Master Resume Pre-population~~ COMPLETE (Sprint 55, Story 55-3)
~~Master resume raw_text pre-fills the cover letter intake form on mount. Loading indicator, no-overwrite of user edits, 18 app tests.~~

### Story: Full Waitlist Backend
- **As a** product owner
- **I want to** collect emails from users interested in coming-soon products
- **So that** I can notify them when products launch
- **Acceptance Criteria:**
  - [ ] Email collection endpoint
  - [ ] Waitlist table in Supabase
  - [ ] Notification system on product launch
- **Estimated complexity:** Medium
- **Dependencies:** None

---

## ~~Epic: LinkedIn Content Calendar (Agent #12)~~ COMPLETE (Sprint 28)

~~2-agent pipeline (Strategist → Writer) generating a 30-day LinkedIn posting plan. 8 knowledge rules, ContentCalendarState, week/month calendar UI, 36 server + 12 app tests.~~

---

## Epic: LinkedIn Optimizer v2 — Experience Section Rewriting

Enhances the LinkedIn Optimizer (Agent #11) to generate full experience section rewrites, not just headline/about/keywords.

### Story: Experience Writer Tool Enhancement
- **As a** user
- **I want to** receive optimized experience bullet points for each role
- **So that** my entire LinkedIn profile is professionally positioned, not just the headline and about
- **Acceptance Criteria:**
  - [ ] Enhanced `write_experience_entries` tool generates per-role bullet rewrites
  - [ ] Each role: optimized title, achievement bullets with metrics, keyword integration
  - [ ] Respects LinkedIn character limits per experience entry
  - [ ] Self-review against STAR/CAR framework
- **Estimated complexity:** Medium
- **Dependencies:** Sprint 26 (LinkedIn Optimizer v1 complete)

### Story: Experience Section in Report
- **As a** user
- **I want to** see my current vs. optimized experience entries side-by-side
- **So that** I can copy the improved versions into LinkedIn
- **Acceptance Criteria:**
  - [ ] Report includes per-role comparison (current vs. optimized)
  - [ ] LinkedInStudioRoom shows expandable experience cards
  - [ ] Copy-to-clipboard per role
- **Estimated complexity:** Medium
- **Dependencies:** Story 1

### Story: Experience Section Tests
- **As a** developer
- **I want to** test the experience rewriting enhancements
- **So that** the v2 feature is regression-safe
- **Acceptance Criteria:**
  - [ ] Server tests for enhanced write_experience_entries tool
  - [ ] App tests for experience card rendering
- **Estimated complexity:** Small
- **Dependencies:** Story 2

---

## ~~Epic: Networking Outreach Agent (#13)~~ COMPLETE (Sprint 30)

2-agent pipeline (Researcher -> Writer) generating personalized LinkedIn outreach sequences. 5 message types, 8 knowledge rules, cross-product context, 41+11 tests.

---

## ~~Epic: Job Application Tracker Agent (#14)~~ COMPLETE (Sprint 31)

~~2-agent pipeline (Analyst → Follow-Up Writer) generating portfolio-level analytics and personalized follow-up messages. 8 knowledge rules, 7 application status values, TrackerGenerator UI, 52 server + 12 app tests.~~

---

## ~~Epic: Salary Negotiation Agent (#15)~~ COMPLETE (Sprint 32)

~~2-agent pipeline (Market Researcher → Negotiation Strategist). 8 knowledge rules, SalaryNegotiationState, 3 scenario types, NegotiationRoom UI with tabs, 51 server + 12 app tests.~~

---

## ~~Epic: Executive Bio Agent (#16)~~ COMPLETE (Sprint 33)

~~Single-agent pipeline (Bio Writer). 8 knowledge rules, 5 BioFormat types, 4 length targets, BioRoom UI with format tabs, 45 server + 12 app tests.~~

---

## ~~Epic: Portfolio / Case Study Agent (#17)~~ COMPLETE (Sprint 34)

~~2-agent pipeline (Achievement Analyst → Case Study Writer). 8 knowledge rules, CaseStudyState, CaseStudyRoom UI with expandable cards, 49 server + 12 app tests.~~

---

## ~~Epic 18: Thank You Note Writer Agent~~ COMPLETE (Sprint 35)

~~Single-agent pipeline. 4 tools, 7 knowledge rules, NoteFormat types (email/handwritten/linkedin_message), useThankYouNote hook, full route/DB migration/tests.~~

---

## ~~Epic 19: Personal Brand Audit Agent~~ COMPLETE (Sprint 35)

~~2-agent pipeline (Brand Auditor → Brand Advisor). 8 tools, 8 knowledge rules, 6 finding categories, ConsistencyScores interface, usePersonalBrand hook, full route/DB migration/tests.~~

---

## ~~Epic 20: 90-Day Plan Generator Agent~~ COMPLETE (Sprint 35)

~~2-agent pipeline (Role Researcher → Plan Writer). 8 tools, 8 knowledge rules, 30/60/90-day phase structure, useNinetyDayPlan hook, full route/DB migration/tests.~~

---

## CareerIQ Master Build Plan

> Driven by the Coaching Methodology Bible (9 chapters, 19 years of expertise).
> Phases 1-2 are sequential prerequisites. Phases 3-7 can partially parallelize.
> Sprint 36 (Career IQ Rooms) deferred — those rooms will be built as part of each phase's frontend work.

---

## ~~Epic: CareerIQ Phase 1A — The First Five Minutes~~ COMPLETE (Sprint 37)

~~Gate-based onboarding assessment agent: generate_questions → pause for user → evaluate_responses → detect_financial_segment → build_client_profile. 4 segments (crisis/stressed/ideal/comfortable) inferred from indirect signals. Client profile persisted to user_platform_context. Route at /api/onboarding/*, FF_ONBOARDING, DB migration.~~

---

## ~~Epic: CareerIQ Phase 1B — WhyMe Engine Enhancement~~ COMPLETE (Sprint 38)

### ~~Story: 1B-1 LLM-Based Quality Assessment~~ COMPLETE
Replaced `trimmed.length < 100` with MODEL_LIGHT quality assessment (specificity/evidence/differentiation). Heuristic fallback on LLM failure.

### ~~Story: 1B-2 Super Bowl Story Questions~~ COMPLETE
Added `trophies` and `gaps` categories to both LLM prompt and fallback questions. Super Bowl Story: signature achievement. Gaps: honest self-assessment.

### ~~Story: 1B-3 Positioning Foundation in Platform Context~~ COMPLETE
Added `positioning_foundation` to ContextType. Persisted in resume product's `savePlatformContext()` with trophies, gaps, super_bowl_story, career arc, authentic phrases.

---

## ~~Epic: CareerIQ Phase 1C — Emotional Baseline~~ COMPLETE (Sprint 39)

### ~~Story: 1C-1 Emotional Baseline Detection Middleware~~ COMPLETE
`emotional-baseline.ts` reads Client Profile from platform context, extracts grief cycle + financial segment, derives coaching tone.

### ~~Story: 1C-2 Agent Tone Adaptation~~ COMPLETE
All 14 routes load baseline in transformInput. All 14 products inject tone guidance in buildAgentMessage. 3 registers: supportive/direct/motivational.

### ~~Story: 1C-3 Escalation — Professional Referral~~ COMPLETE
Distress threshold: depression/anger + crisis/urgency≥9. Surfaces NAMI, 988 Lifeline, career coaching referral. Never diagnoses.

---

## ~~Epic: CareerIQ Phase 2 — Core Positioning Loop~~ COMPLETE (Sprint 40)

### ~~Story: 2A-1 Fix Bug 16 — Revision Loops~~ COMPLETE
Producer message includes approved sections list. System prompt instructs never to revise immutable sections. Root cause: LLM didn't know which sections were user-approved.

### ~~Story: 2A-2 Fix Bug 17 — Context Forgetfulness~~ COMPLETE
Conversation compaction now includes scratchpad section status summary. Model sees which sections are completed when history is trimmed. Root cause: compaction dropped section completion info.

### ~~Story: 2A-3 Structured Why Me / Why Not Me~~ COMPLETE
`GapAnalystOutput` now includes `why_me[]` and `why_not_me[]` with `{reason, evidence}` items. LLM prompt updated. classify_fit returns the arrays.

### ~~Story: 2B-1 Platform Context Enrichment~~ COMPLETE
3 new context types: `benchmark_candidate`, `gap_analysis`, `industry_research`. Resume pipeline persists all three on completion via `savePlatformContext()`.

---

## ~~Epic: CareerIQ Phase 3A — Job Command Center~~ COMPLETE (Sprints 57-59)

~~Multi-source job search API (JSearch + Adzuna), AI job matching, Kanban drag-drop pipeline, Radar search, Watchlist, Daily Ops. 18 stories, 228 tests. Routes: job-search.ts, job-finder.ts, job-tracker.ts, watchlist.ts. UI: JobCommandCenterRoom with 3-tab layout (Pipeline/Radar/Daily Ops). DB: job_listings, job_search_scans, job_search_results, watchlist_companies. FF_JOB_SEARCH.~~

---

## Epic: CareerIQ Phase 3B — LinkedIn Studio
Bible: Ch 4 (LinkedIn)

### Story: 3B-1 Port LinkedIn Post Generator
- **As a** user
- **I want to** generate LinkedIn posts from CareerIQ
- **So that** I can create quality content without switching tools
- **Acceptance Criteria:**
  - [ ] Port generate-linkedin-post edge function to Hono route/agent tool
  - [ ] Swap LLM provider to project standard
  - [ ] Connected to content calendar agent
- **Estimated complexity:** Small
- **Dependencies:** None

### Story: 3B-2 Port Series Management
- **As a** user
- **I want to** plan and manage LinkedIn post series
- **So that** I can maintain a coherent content narrative over time
- **Acceptance Criteria:**
  - [ ] Port SeriesDashboard, SeriesPlanner, useSeriesManagement
  - [ ] Adapt to CareerIQ patterns
- **Estimated complexity:** Medium
- **Dependencies:** 3B-1

### Story: 3B-3 Port LinkedIn Tools
- **As a** user
- **I want to** have recruiter search simulation and writing analysis
- **So that** I can optimize my profile and content for recruiter visibility
- **Acceptance Criteria:**
  - [ ] Port RecruiterSearchSimulator, HumanWritingAnalyzer
  - [ ] Merge into LinkedIn Studio tabbed experience
- **Estimated complexity:** Small
- **Dependencies:** None

### Story: 3B-4 Unified LinkedIn Studio
- **As a** user
- **I want to** have one place for all LinkedIn activities
- **So that** I can manage profile, content, and outreach from a single workspace
- **Acceptance Criteria:**
  - [ ] Tabbed experience combining LinkedIn Optimizer, Content Calendar, Post Composer, Series, Recruiter Sim, Writing Analyzer
  - [ ] Section-by-section profile editing
- **Estimated complexity:** Medium
- **Dependencies:** 3B-1 through 3B-3

---

## Epic: CareerIQ Phase 3C — Networking Hub
Bible: Ch 5 (Networking)

### Story: 3C-1 Port Networking CRM
- **As a** user
- **I want to** have a CRM for managing networking contacts
- **So that** I can track relationships and follow-up cadence in one place
- **Acceptance Criteria:**
  - [ ] Port NetworkingCRM, ContactsList, ContactDetailSheet, TouchpointLogger, FollowUpReminders
  - [ ] Adapt to CareerIQ types
  - [ ] DB tables with RLS
- **Estimated complexity:** Large
- **Dependencies:** None

### Story: 3C-2 Port Message Generators
- **As a** user
- **I want to** have AI-generated outreach messages for 7 networking scenarios
- **So that** every message is personalized and professional
- **Acceptance Criteria:**
  - [ ] Port generate-networking-email and linkedin-networking-messages
  - [ ] Swap LLM provider to project standard
  - [ ] Route at /api/networking/generate
- **Estimated complexity:** Medium
- **Dependencies:** None

### Story: 3C-3 NI + CRM Integration
- **As a** user
- **I want to** have CSV-imported connections appear in my CRM
- **So that** NI connections flow directly into relationship management
- **Acceptance Criteria:**
  - [ ] NI connections feed into CRM contact list
  - [ ] Company data enriches contacts
  - [ ] No duplicate contacts created
- **Estimated complexity:** Medium
- **Dependencies:** 3C-1

### Story: 3C-4 Rule of Four — Pipeline Integration
- **As a** user
- **I want to** have networking contacts linked to job applications
- **So that** I can track relationship coverage per opportunity
- **Acceptance Criteria:**
  - [ ] Each pipeline application tracks associated contacts
  - [ ] Rule of Four (4 contacts per application) tracking
  - [ ] Referral pathway visualization
- **Estimated complexity:** Medium
- **Dependencies:** 3C-1, Phase 3A Kanban

### Story: 3C-5 Follow-Up Cadence Tracking
- **As a** user
- **I want to** track sent/responded/due follow-ups
- **So that** no relationship falls through the cracks
- **Acceptance Criteria:**
  - [ ] Touchpoint status tracking
  - [ ] Overdue reminders
  - [ ] Weekly touch counter
- **Estimated complexity:** Small
- **Dependencies:** 3C-1

---

## Epic: CareerIQ Phase 4A — Interview Prep Enhancement
Bible: Ch 6 (Interview Mastery)

### Story: 4A-1 Mock Interview Simulation
- **As a** user
- **I want to** practice interviews with AI simulation
- **So that** I'm prepared for the real conversation before it happens
- **Acceptance Criteria:**
  - [ ] New sub-agent using gate pattern for rapid Q&A
  - [ ] Supports behavioral, technical, situational question types
  - [ ] Evaluates answers against STAR framework
- **Estimated complexity:** Large
- **Dependencies:** None

### Story: 4A-2 Post-Interview Debrief
- **As a** user
- **I want to** have structured debrief capture after real interviews
- **So that** my experience feeds into follow-up and future prep
- **Acceptance Criteria:**
  - [ ] Debrief form captures what went well/poorly, questions asked, company signals
  - [ ] Feeds into thank-you note agent
- **Estimated complexity:** Medium
- **Dependencies:** Thank You Note agent (built)

### Story: 4A-3 Practice Mode
- **As a** user
- **I want to** practice individual questions with AI evaluation
- **So that** I can sharpen specific weak areas without a full simulation
- **Acceptance Criteria:**
  - [ ] Single question presentation
  - [ ] AI scores answer on STAR completeness, relevance, impact
  - [ ] Specific suggestions for improvement
- **Estimated complexity:** Medium
- **Dependencies:** None

### Story: 4A-4 Kanban Integration
- **As a** user
- **I want to** have interview prep linked to my pipeline
- **So that** prep, debrief, and follow-up are all connected to the opportunity
- **Acceptance Criteria:**
  - [ ] Interview stage in Kanban triggers prep suggestion
  - [ ] Debrief links to application
  - [ ] Prep reports accessible from opportunity card
- **Estimated complexity:** Small
- **Dependencies:** Phase 3A Kanban

---

## Epic: CareerIQ Phase 4B — Salary Negotiation Enhancement

### Story: 4B-1 Counter-Offer Simulation
- **As a** user
- **I want to** practice negotiation with AI role-playing employer
- **So that** I'm ready for every pushback scenario before the real conversation
- **Acceptance Criteria:**
  - [ ] User inputs offer; agent simulates employer pushback
  - [ ] Multiple negotiation rounds supported
  - [ ] Coaching on tactics after each round
- **Estimated complexity:** Medium
- **Dependencies:** None

### Story: 4B-2 Kanban Trigger
- **As a** user
- **I want to** have salary negotiation prompted when pipeline reaches Offer stage
- **So that** I'm reminded to prepare before accepting or countering
- **Acceptance Criteria:**
  - [ ] Kanban "Offer" stage triggers salary negotiation suggestion
  - [ ] Pre-populated with company/role data from opportunity card
- **Estimated complexity:** Small
- **Dependencies:** Phase 3A Kanban

---

## Epic: CareerIQ Phase 5 — Emotional Intelligence Layer
Bible: Ch 8

### Story: 5A-1 Momentum System
- **As a** user
- **I want to** have activity streaks and win tracking
- **So that** I stay motivated during a long job search
- **Acceptance Criteria:**
  - [ ] user_momentum table
  - [ ] Streak tracking
  - [ ] Pipeline progress metrics
  - [ ] Wins celebrated in dashboard
- **Estimated complexity:** Medium
- **Dependencies:** None

### Story: 5A-2 Cognitive Reframing
- **As a** user
- **I want to** receive targeted coaching when my search stalls
- **So that** I get past psychological blocks, not just tactical ones
- **Acceptance Criteria:**
  - [ ] Detect stalled pipeline or repeated rejections
  - [ ] Coaching messages sourced from Ch 8 methodology
  - [ ] Integrated into daily ops view
- **Estimated complexity:** Medium
- **Dependencies:** 5A-1, Phase 3A

### Story: 5B-1 Resource Library
- **As a** user
- **I want to** have educational content organized by topic
- **So that** I can deepen my skills in the areas that matter most
- **Acceptance Criteria:**
  - [ ] Content organized by Bible chapter topics
  - [ ] Searchable
  - [ ] Context-aware recommendations based on current pipeline stage
- **Estimated complexity:** Medium
- **Dependencies:** None

### Story: 5B-2 Ask a Coach
- **As a** user
- **I want to** have a structured way to request human escalation
- **So that** I can get expert help when AI isn't enough
- **Acceptance Criteria:**
  - [ ] Structured form for human coaching request
  - [ ] Triaged by topic
  - [ ] Stored for coach review
- **Estimated complexity:** Small
- **Dependencies:** None

---

## ~~Epic: CareerIQ Phase 6 — Retirement Bridge~~ COMPLETE (Sprint 50)

~~7-dimension assessment agent with fiduciary guardrails. server/src/agents/retirement-bridge/ (types, rules ×5, tools ×3, agent, product). server/src/lib/planner-handoff.ts (qualifyLead, matchPlanners, generateHandoffDocument, createReferral — 5-step protocol, 5 qualification gates). FinancialWellnessRoom rewritten with real agent data. FF_RETIREMENT_BRIDGE, 2 DB migrations, retirement_readiness platform context type.~~

---

## ~~Epic: CareerIQ Phase 7 — B2B Outplacement~~ COMPLETE (Sprint 51)

~~Admin portal, seat management, reporting, white-label. server/src/lib/b2b.ts (org/contract/seat/cohort CRUD + engagement metrics). server/src/routes/b2b-admin.ts (14 admin API endpoints). app/src/hooks/useB2BBranding.ts + B2BBrandingBanner (CSS custom properties for white-label). FF_B2B_OUTPLACEMENT, 1 DB migration (4 tables).~~

---
---

# Sprint Plan — Remaining Backlog

> **29 stories across 8 sprints.** Ordered by user value and dependency chain.
> Sprints 1-3 are independent. Sprints 4-6 have cross-dependencies on Phase 3A (Kanban).
> Sprint 7 requires Sprints 4-6. Sprint 8 is infrastructure (no user-facing features).

---

## Sprint CL1: Cover Letter Polish + Waitlist

**Goal:** Close out cover letter product gaps and build the waitlist backend for coming-soon products.
**Stories:** 2 | **Est. Size:** Medium

### Story CL1-1: Cover Letter Dashboard Integration [MEDIUM]
- **As a** user
- **I want to** see my cover letter sessions in the dashboard and re-export them
- **So that** I can revisit previous cover letters without regenerating
- **Acceptance Criteria:**
  - [ ] `DashboardSessionCard` routes `cover_letter` sessions to a preview/export view
  - [ ] Cover letter text rendered in modal or dedicated screen
  - [ ] Re-export to DOCX/PDF from dashboard
  - [ ] `cd app && npx tsc --noEmit` passes

### Story CL1-2: Full Waitlist Backend [MEDIUM]
- **As a** product owner
- **I want to** collect emails from users interested in coming-soon products
- **So that** I can notify them when products launch
- **Acceptance Criteria:**
  - [ ] `waitlist_emails` table (already exists) — verify schema, add RLS
  - [ ] `POST /api/waitlist` endpoint with email + product_slug
  - [ ] Duplicate protection (upsert on email+product)
  - [ ] Product landing pages call waitlist endpoint instead of no-op
  - [ ] `cd server && npx tsc --noEmit` passes

---

## Sprint LI1: LinkedIn Optimizer v2 — Experience Rewriting

**Goal:** Extend LinkedIn Optimizer to generate full experience section rewrites, not just headline/about/keywords.
**Stories:** 3 | **Est. Size:** Medium

### Story LI1-1: Experience Writer Tool Enhancement [MEDIUM]
- **As a** user
- **I want to** receive optimized experience bullet points for each role
- **So that** my entire LinkedIn profile is professionally positioned
- **Acceptance Criteria:**
  - [ ] Enhanced `write_experience_entries` tool generates per-role bullet rewrites
  - [ ] Each role: optimized title, achievement bullets with metrics, keyword integration
  - [ ] Respects LinkedIn character limits per experience entry
  - [ ] Self-review against STAR/CAR framework
  - [ ] `cd server && npx tsc --noEmit` passes

### Story LI1-2: Experience Section in Report [MEDIUM]
- **As a** user
- **I want to** see current vs. optimized experience entries side-by-side
- **So that** I can copy the improved versions into LinkedIn
- **Acceptance Criteria:**
  - [ ] Report includes per-role comparison (current vs. optimized)
  - [ ] LinkedInStudioRoom shows expandable experience cards
  - [ ] Copy-to-clipboard per role
  - [ ] `cd app && npx tsc --noEmit` passes
- **Dependencies:** LI1-1

### Story LI1-3: Experience Section Tests [SMALL]
- **As a** developer
- **I want to** test the experience rewriting feature
- **So that** the v2 feature is regression-safe
- **Acceptance Criteria:**
  - [ ] Server tests for enhanced write_experience_entries tool
  - [ ] App tests for experience card rendering
- **Dependencies:** LI1-2

---

## Sprint LS1: LinkedIn Studio — Unified Workspace

**Goal:** Unify all LinkedIn tools (Optimizer, Content Calendar, Post Composer, Series, Recruiter Sim) into a single tabbed workspace.
**Stories:** 4 | **Est. Size:** Large

### Story LS1-1: LinkedIn Post Generator [SMALL]
- **As a** user
- **I want to** generate LinkedIn posts from CareerIQ
- **So that** I can create quality content without switching tools
- **Acceptance Criteria:**
  - [ ] Port generate-linkedin-post to Hono route / agent tool
  - [ ] Swap LLM provider to project standard
  - [ ] Connected to content calendar agent
  - [ ] `cd server && npx tsc --noEmit` passes

### Story LS1-2: Series Management [MEDIUM]
- **As a** user
- **I want to** plan and manage LinkedIn post series
- **So that** I can maintain a coherent content narrative over time
- **Acceptance Criteria:**
  - [ ] Port SeriesDashboard, SeriesPlanner, useSeriesManagement
  - [ ] Adapt to CareerIQ patterns and types
  - [ ] `cd app && npx tsc --noEmit` passes
- **Dependencies:** LS1-1

### Story LS1-3: LinkedIn Tools — Recruiter Sim & Writing Analyzer [SMALL]
- **As a** user
- **I want to** simulate recruiter searches and analyze writing quality
- **So that** I can optimize my profile for recruiter visibility
- **Acceptance Criteria:**
  - [ ] Port RecruiterSearchSimulator, HumanWritingAnalyzer
  - [ ] Merge into LinkedIn Studio tabbed experience
  - [ ] `cd app && npx tsc --noEmit` passes

### Story LS1-4: Unified LinkedIn Studio Shell [MEDIUM]
- **As a** user
- **I want to** have one place for all LinkedIn activities
- **So that** I can manage profile, content, and outreach from a single workspace
- **Acceptance Criteria:**
  - [ ] Tabbed experience: Profile Optimizer | Content Calendar | Post Composer | Series | Recruiter Sim | Writing Analyzer
  - [ ] Section-by-section profile editing
  - [ ] Cross-tab context sharing (positioning data flows between tabs)
  - [ ] `cd app && npx tsc --noEmit` passes
- **Dependencies:** LS1-1, LS1-2, LS1-3

---

## Sprint NH1: Networking Hub — CRM + Message Generation

**Goal:** Build the networking CRM with contact management, AI message generation, and follow-up tracking. Integrates with Job Command Center pipeline.
**Stories:** 5 | **Est. Size:** Large

### Story NH1-1: Networking CRM [LARGE]
- **As a** user
- **I want to** have a CRM for managing networking contacts
- **So that** I can track relationships and follow-up cadence in one place
- **Acceptance Criteria:**
  - [ ] Port NetworkingCRM, ContactsList, ContactDetailSheet, TouchpointLogger, FollowUpReminders
  - [ ] Adapt to CareerIQ types
  - [ ] DB tables with RLS
  - [ ] `cd server && npx tsc --noEmit` and `cd app && npx tsc --noEmit` pass

### Story NH1-2: Message Generators [MEDIUM]
- **As a** user
- **I want to** have AI-generated outreach messages for 7 networking scenarios
- **So that** every message is personalized and professional
- **Acceptance Criteria:**
  - [ ] Port generate-networking-email and linkedin-networking-messages
  - [ ] Swap LLM provider to project standard
  - [ ] Route at /api/networking/generate
  - [ ] `cd server && npx tsc --noEmit` passes

### Story NH1-3: NI + CRM Integration [MEDIUM]
- **As a** user
- **I want to** have CSV-imported connections appear in my CRM
- **So that** NI connections flow directly into relationship management
- **Acceptance Criteria:**
  - [ ] NI connections feed into CRM contact list
  - [ ] Company data enriches contacts
  - [ ] No duplicate contacts created
- **Dependencies:** NH1-1

### Story NH1-4: Rule of Four — Pipeline Integration [MEDIUM]
- **As a** user
- **I want to** have networking contacts linked to job applications
- **So that** I can track relationship coverage per opportunity
- **Acceptance Criteria:**
  - [ ] Each pipeline application tracks associated contacts
  - [ ] Rule of Four (4 contacts per application) tracking
  - [ ] Referral pathway visualization
- **Dependencies:** NH1-1, Phase 3A Kanban (built)

### Story NH1-5: Follow-Up Cadence Tracking [SMALL]
- **As a** user
- **I want to** track sent/responded/due follow-ups
- **So that** no relationship falls through the cracks
- **Acceptance Criteria:**
  - [ ] Touchpoint status tracking (sent / responded / overdue)
  - [ ] Overdue reminders in Daily Ops
  - [ ] Weekly touch counter
- **Dependencies:** NH1-1

---

## Sprint IP1: Interview Prep Enhancement

**Goal:** Mock interview simulation, post-interview debrief, practice mode, and Kanban integration.
**Stories:** 4 | **Est. Size:** Large

### Story IP1-1: Mock Interview Simulation [LARGE]
- **As a** user
- **I want to** practice interviews with AI simulation
- **So that** I'm prepared for the real conversation before it happens
- **Acceptance Criteria:**
  - [ ] New sub-agent using gate pattern for rapid Q&A
  - [ ] Supports behavioral, technical, situational question types
  - [ ] Evaluates answers against STAR framework
  - [ ] Timer, scoring, and feedback after each answer
  - [ ] `cd server && npx tsc --noEmit` passes

### Story IP1-2: Post-Interview Debrief [MEDIUM]
- **As a** user
- **I want to** have structured debrief capture after real interviews
- **So that** my experience feeds into follow-up and future prep
- **Acceptance Criteria:**
  - [ ] Debrief form: what went well/poorly, questions asked, company signals
  - [ ] Feeds into Thank You Note agent (pre-populates context)
  - [ ] Stored as platform context for future prep sessions
  - [ ] `cd app && npx tsc --noEmit` passes
- **Dependencies:** Thank You Note agent (built)

### Story IP1-3: Practice Mode [MEDIUM]
- **As a** user
- **I want to** practice individual questions with AI evaluation
- **So that** I can sharpen specific weak areas without a full simulation
- **Acceptance Criteria:**
  - [ ] Single question presentation with timer
  - [ ] AI scores answer on STAR completeness, relevance, impact
  - [ ] Specific suggestions for improvement
  - [ ] Question bank categorized by type
  - [ ] `cd app && npx tsc --noEmit` passes

### Story IP1-4: Kanban Integration [SMALL]
- **As a** user
- **I want to** have interview prep linked to my pipeline
- **So that** prep, debrief, and follow-up are all connected to the opportunity
- **Acceptance Criteria:**
  - [ ] Interview stage in Kanban triggers prep suggestion
  - [ ] Debrief links to application
  - [ ] Prep reports accessible from opportunity card
- **Dependencies:** Phase 3A Kanban (built)

---

## Sprint SN1: Salary Negotiation Enhancement

**Goal:** Add counter-offer simulation and Kanban trigger for salary negotiation.
**Stories:** 2 | **Est. Size:** Small-Medium

### Story SN1-1: Counter-Offer Simulation [MEDIUM]
- **As a** user
- **I want to** practice negotiation with AI role-playing employer
- **So that** I'm ready for every pushback scenario before the real conversation
- **Acceptance Criteria:**
  - [ ] User inputs offer; agent simulates employer pushback
  - [ ] Multiple negotiation rounds supported (gate-based)
  - [ ] Coaching on tactics after each round
  - [ ] Summary of negotiation performance + recommended strategy
  - [ ] `cd server && npx tsc --noEmit` passes

### Story SN1-2: Kanban Trigger [SMALL]
- **As a** user
- **I want to** have salary negotiation prompted when pipeline reaches Offer stage
- **So that** I'm reminded to prepare before accepting or countering
- **Acceptance Criteria:**
  - [ ] Kanban "Offer" stage triggers salary negotiation suggestion
  - [ ] Pre-populated with company/role data from opportunity card
- **Dependencies:** Phase 3A Kanban (built)

---

## Sprint EI1: Emotional Intelligence Layer

**Goal:** Motivation system, cognitive reframing for stalled searches, resource library, and human coach escalation.
**Stories:** 4 | **Est. Size:** Medium

### Story EI1-1: Momentum System [MEDIUM]
- **As a** user
- **I want to** have activity streaks and win tracking
- **So that** I stay motivated during a long job search
- **Acceptance Criteria:**
  - [ ] `user_momentum` table with streak tracking
  - [ ] Pipeline progress metrics
  - [ ] Wins celebrated in dashboard (applications sent, interviews scheduled, offers received)
  - [ ] Streak display in Daily Ops and dashboard header
  - [ ] `cd server && npx tsc --noEmit` passes

### Story EI1-2: Cognitive Reframing [MEDIUM]
- **As a** user
- **I want to** receive targeted coaching when my search stalls
- **So that** I get past psychological blocks, not just tactical ones
- **Acceptance Criteria:**
  - [ ] Detect stalled pipeline (no activity in 7+ days) or repeated rejections (3+ in a week)
  - [ ] Coaching messages sourced from Ch 8 methodology
  - [ ] Integrated into Daily Ops view as priority action
  - [ ] Tone adapted via emotional baseline middleware
- **Dependencies:** EI1-1, Phase 3A (built)

### Story EI1-3: Resource Library [MEDIUM]
- **As a** user
- **I want to** have educational content organized by topic
- **So that** I can deepen my skills in the areas that matter most
- **Acceptance Criteria:**
  - [ ] Content organized by Coaching Bible chapter topics
  - [ ] Searchable by keyword
  - [ ] Context-aware recommendations based on current pipeline stage
  - [ ] `cd app && npx tsc --noEmit` passes

### Story EI1-4: Ask a Coach — Human Escalation [SMALL]
- **As a** user
- **I want to** have a structured way to request human coaching
- **So that** I can get expert help when AI isn't enough
- **Acceptance Criteria:**
  - [ ] Structured form: topic, urgency, context summary
  - [ ] Triaged by topic
  - [ ] Stored for coach review (DB table with RLS)
  - [ ] Confirmation message with expected response time

---

## Sprint RQ1: Resume Quality — Bullet Enhance Full Context

**Goal:** Give the bullet-enhance endpoint access to the candidate's full background so rewrites are contextually rich, not isolated.
**Stories:** 2 | **Est. Size:** Medium

### Story RQ1-1: Pass Full Candidate Summary to Bullet-Enhance [MEDIUM]
- **As a** user
- **I want to** get AI bullet rewrites that draw from my ENTIRE background
- **So that** if I mentioned mentoring engineers in one role, the AI can reference it when strengthening a bullet in a different role
- **Acceptance Criteria:**
  - [ ] `bullet-enhance` endpoint reads full candidate summary from pipeline state (not just tagged evidence)
  - [ ] Candidate's original resume text summary included in LLM prompt
  - [ ] Gap analysis output included for cross-referencing evidence
  - [ ] `cd server && npx tsc --noEmit` passes
- **Dependencies:** Pipeline state stored in coach_sessions (already exists)

### Story RQ1-2: Pass Full JD Context to Bullet-Enhance [SMALL]
- **As a** user
- **I want to** get rewrites that use the hiring company's specific language
- **So that** the "Connect to Role" button produces bullets that sound like they were written FOR this company
- **Acceptance Criteria:**
  - [ ] Job intelligence output (key requirements, company context) included in LLM prompt
  - [ ] JD excerpt for the specific requirement included alongside the full JD context
  - [ ] `cd server && npx tsc --noEmit` passes
- **Dependencies:** RQ1-1

---

## Sprint PX1: Platform Infrastructure

**Goal:** Production hardening — distributed bus, admin monitoring, auth improvements, DB-driven catalog.
**Stories:** 5 | **Est. Size:** Large (infrastructure-heavy, no direct user features)

### Story PX1-1: Redis/NATS Bus Adapter [LARGE]
- **As a** platform
- **I want to** have a distributed message bus
- **So that** agents can communicate across multiple server instances
- **Acceptance Criteria:**
  - [ ] Redis adapter implementing AgentBus interface
  - [ ] Fallback to in-memory bus when Redis unavailable
  - [ ] Connection pooling and reconnect logic
  - [ ] Feature flag to toggle bus backend

### Story PX1-2: Agent Hot-Reload [MEDIUM]
- **As a** developer
- **I want to** update agent configs without server restart
- **So that** prompt changes and tool additions deploy instantly
- **Acceptance Criteria:**
  - [ ] File watcher on agent config directories
  - [ ] Registry invalidation on change
  - [ ] No in-flight pipeline disruption

### Story PX1-3: Cross-Product Auth & Authorization [MEDIUM]
- **As a** platform
- **I want to** have product-level access control
- **So that** subscription tiers can gate which products a user accesses
- **Acceptance Criteria:**
  - [ ] Middleware checks user subscription vs. product requirements
  - [ ] Free tier, Pro tier, Enterprise tier product gating
  - [ ] Graceful upgrade prompt on denied access

### Story PX1-4: Platform Admin Dashboard [LARGE]
- **As an** admin
- **I want to** monitor agent performance and pipeline health
- **So that** I can detect issues before users report them
- **Acceptance Criteria:**
  - [ ] Pipeline success/failure rates by product
  - [ ] Average pipeline duration and token cost
  - [ ] Active sessions and queue depth
  - [ ] Error log viewer with stack traces

### Story PX1-5: DB-Driven Product Catalog [SMALL]
- **As a** platform
- **I want to** move the product catalog from static constants to database
- **So that** new products can be added without code deployment
- **Acceptance Criteria:**
  - [ ] `products` table with metadata (name, slug, description, feature_flag, status)
  - [ ] API endpoint to list products (replaces static import)
  - [ ] Admin CRUD for product entries
  - [ ] Frontend catalog reads from API instead of constant

---

## Epic: Profile Setup as Master Resume Genesis (ADR-049)

Profile setup currently creates only the CareerIQ profile (narrative positioning layer). It should ALSO create the initial master resume (structured content layer) from the same source material — the resume text, LinkedIn About, and 8 interview answers. This eliminates the disconnect between "who is this person" and "what goes on the page under which company." The Why Me synthesis must also be strengthened to pass a 3-5 second test, leading with the most powerful differentiator.

### Story PSG-1: Intake Agent — Structured Experience Extraction [MEDIUM]
- **As a** platform
- **I want** the intake agent to extract structured experience entries (company, title, dates, location, key bullets) alongside its existing narrative analysis
- **So that** downstream steps can anchor interview evidence to specific jobs
- **Acceptance Criteria:**
  - [ ] `IntakeAnalysis` type gains `structured_experience: Array<{ company, title, start_date, end_date, location, original_bullets: string[] }>`
  - [ ] Intake agent prompt instructs LLM to parse resume into structured entries AND produce the existing narrative fields
  - [ ] Each interview question's `references_resume_element` maps to a specific `structured_experience` entry by company/title
  - [ ] Existing intake tests updated; new tests verify structured extraction against real resume fixtures
  - [ ] Backward compatible — existing fields unchanged
- **Dependencies:** None
- **Notes:** The intake agent already receives and analyzes the full resume text. This adds structured parsing as a parallel output, not a replacement for the narrative analysis.

### Story PSG-2: Persist Interview Answers [SMALL]
- **As a** platform
- **I want** the raw interview Q&A pairs to be persisted to `user_platform_context` when the profile is completed
- **So that** the richest career material survives beyond the 2-hour in-memory session TTL
- **Acceptance Criteria:**
  - [ ] New context type `career_interview_transcript` added to `user_platform_context` constraint
  - [ ] `/complete` endpoint saves `{ questions_and_answers: Array<{ question, answer, question_index, references_resume_element }> }` as platform context
  - [ ] Each answer carries forward the `references_resume_element` from its question for company mapping
  - [ ] Supabase migration for the new context type
  - [ ] Tests verify persistence and retrieval
- **Dependencies:** None (can run parallel with PSG-1)

### Story PSG-3: Why Me — 3-to-5 Second Test [MEDIUM]
- **As a** candidate
- **I want** my Why Me statement to lead with the single most powerful, differentiated thing about me
- **So that** it passes a 3-to-5 second scan and can seed my professional summary on every resume
- **Acceptance Criteria:**
  - [ ] Synthesizer prompt for `why_me_final` is redesigned: must open with the most powerful differentiator, not generic positioning language
  - [ ] Why Me must pass the "3-to-5 second test" — a hiring manager reading only the first sentence knows exactly what makes this person exceptional
  - [ ] Why Me must be concrete and evidence-backed, not aspirational ("I bring a unique combination of..." is banned)
  - [ ] The strongest theme from `top_capabilities` or interview answers leads the statement
  - [ ] Why Me output is structured as `{ headline: string (1 sentence, the hook), body: string (2-3 sentences, the proof) }` so the headline can seed professional summaries
  - [ ] Existing `why_me_draft` (intake) also improved with same 3-5 second principle
  - [ ] Test with real resume fixtures — output must not contain generic filler phrases
- **Dependencies:** None (can run parallel with PSG-1 and PSG-2)
- **Notes:** The current prompt produces text like "I'm the right fit because I bring a unique combination of technical expertise, leadership skills, and business acumen." That's resume-speak. It should produce something like: "Sarah turned a 15-year-old monolith into 4 microservices with zero downtime while growing her team from 5 to 14 — and she's the person the VP of Product calls when she needs a technical constraint explained in customer impact terms."

### Story PSG-4: Profile Completion Creates Initial Master Resume [LARGE]
- **As a** platform
- **I want** the `/complete` endpoint to create both the CareerIQ profile AND the initial master resume in a single atomic flow
- **So that** the first resume pipeline run has structured, enriched career data from day one
- **Acceptance Criteria:**
  - [ ] `/complete` endpoint calls synthesizer (existing) AND a new master resume builder step
  - [ ] Master resume builder takes: structured_experience from intake + interview answers mapped to companies + resume raw text
  - [ ] Each experience entry in master resume gets `evidence_items` populated from interview answers that reference that company (using `references_resume_element` mapping)
  - [ ] Evidence items tagged with `source: 'interview'`, `source_session_id`, `created_at`
  - [ ] Master resume includes parsed skills, education, certifications, contact_info from intake
  - [ ] Created via existing `create_master_resume_atomic` RPC (version 1, set as default)
  - [ ] If user already has a master resume, the new one is created as a new version (not overwrite)
  - [ ] Why Me headline from PSG-3 stored in master resume summary field
  - [ ] Profile reveal UI updated to show "Master resume created" confirmation
  - [ ] Tests verify both outputs are created from same flow
- **Dependencies:** PSG-1, PSG-2, PSG-3
- **Notes:** This is the keystone story. After this, profile setup produces both the identity layer (CareerIQ) and the content layer (master resume). The CareerIQ profile stays narrative and company-agnostic — that's its job. The master resume carries the structured, company-anchored content.

### Story PSG-5: Resume Pipeline Reads from Master Resume [MEDIUM]
- **As a** resume pipeline
- **I want** Candidate Intelligence (Agent 2) to optionally read from the master resume instead of re-parsing raw text every session
- **So that** enriched evidence from the profile setup interview is available to the resume writer
- **Acceptance Criteria:**
  - [ ] Candidate Intelligence agent checks for existing master resume before parsing raw text
  - [ ] If master resume exists with evidence_items, those are included in the candidate intelligence output
  - [ ] If no master resume exists, falls back to raw text parsing (backward compatible)
  - [ ] Resume Writer receives interview-sourced evidence alongside standard resume bullets
  - [ ] Evidence provenance (source: interview vs resume vs crafted) is preserved through the pipeline
  - [ ] Tests verify both paths: with master resume and without
- **Dependencies:** PSG-4
- **Notes:** This closes the loop. Interview stories told once during profile setup flow into every future resume the platform generates, anchored to the right companies.
