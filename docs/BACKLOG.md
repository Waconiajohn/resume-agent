# Backlog — Resume Agent

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

### Story: Clean Orphaned Props from ChatPanel and WorkflowStatsRail
- **As a** developer
- **I want to** remove `runtimeMetrics`, `pipelineActivity`, and other props that lost their consumers during Sprint 16 declutter
- **So that** component interfaces reflect their actual usage
- **Acceptance Criteria:**
  - [ ] Audit ChatPanel and WorkflowStatsRail for props no longer consumed
  - [ ] Remove unused props and update all callers
  - [ ] TypeScript clean, all tests pass
- **Estimated complexity:** Small
- **Dependencies:** Sprint 16 (complete)

### Story: IntelligenceActivityFeed Message Deduplication
- **As a** user
- **I want to** not see the same transparency message repeated in the activity feed
- **So that** the feed shows a useful history rather than duplicated updates
- **Acceptance Criteria:**
  - [ ] Adjacent duplicate messages are collapsed (show once with a count)
  - [ ] Near-duplicates (same message within 5s) are deduplicated
  - [ ] Tests cover dedup logic
- **Estimated complexity:** Small
- **Dependencies:** Sprint 16 Story 3 (complete)

### ~~Story: Fix Remaining Pre-Existing Test Failures~~ COMPLETE
All 29 tests in `agents-gap-analyst.test.ts` now pass. The 2 pre-existing failures were resolved.

### ~~Story: Resolve MaxListenersExceededWarning Root Cause~~ COMPLETE (Sprint 15, Story 3)
All 6 `setMaxListeners` calls removed. `agent-loop.ts` uses per-round scoped AbortControllers with proper cleanup.

### ~~Story: Rename `interview_transcript` to `questionnaire_responses`~~ COMPLETE (Sprint 13, Story 2)

### ~~Story: Deduplicate Workflow Persistence Helpers~~ COMPLETE (Sprint 15, Story 2)
Shared `lib/workflow-persistence.ts` created. Both `event-middleware.ts` and `route-hooks.ts` import from shared module.

### ~~Story: Fix `resumes-edit.test.ts` TypeScript Error~~ COMPLETE (Sprint 15, Story 1)
Fixed null-to-Record cast at line 292. `tsc --noEmit` clean.

---

## Epic: Cover Letter Product

### ~~Story: Cover Letter Frontend UI~~ COMPLETE (Sprint 18)
Intake form, SSE streaming hook, CoverLetterScreen workspace, text + PDF export. 7 stories delivered.

### Story: Cover Letter DOCX Export
- **As a** user
- **I want to** download my cover letter as a DOCX file
- **So that** I can edit it in Word before submitting
- **Acceptance Criteria:**
  - [ ] DOCX export using docx library (same as resume DOCX export)
  - [ ] Filename: `{Name}_{Company}_Cover_Letter.docx`
  - [ ] Export button in CoverLetterScreen
- **Estimated complexity:** Small
- **Dependencies:** None

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

### Story: Cover Letter Master Resume Pre-population
- **As a** user
- **I want to** have my default resume auto-filled in the cover letter intake
- **So that** I don't have to paste my resume each time
- **Acceptance Criteria:**
  - [ ] Load default master resume on mount
  - [ ] Pre-fill resume_text field
  - [ ] Allow override by pasting different resume
- **Estimated complexity:** Small
- **Dependencies:** None

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

## Epic: LinkedIn Content Calendar (Agent #12)

A content calendar agent that generates a 30-day LinkedIn posting plan based on the user's positioning strategy, resume highlights, and industry trends. Uses the LinkedIn Optimizer's analysis data as input when available.

### Story: Content Calendar Types & Knowledge
- **As a** developer
- **I want to** define ContentCalendarState, SSE events, and content strategy rules
- **So that** the agent has structured output types and domain knowledge
- **Acceptance Criteria:**
  - [ ] ContentCalendarState with post_plan, content_themes, posting_schedule
  - [ ] ContentCalendarSSEEvent types (theme_identified, post_drafted, calendar_complete)
  - [ ] Content strategy rules: post frequency, content mix (thought leadership, engagement, storytelling), optimal posting times
- **Estimated complexity:** Medium
- **Dependencies:** None

### Story: Content Strategist Agent (Agent 1 of 2)
- **As a** user
- **I want to** have an AI analyze my expertise and industry to identify content themes
- **So that** my LinkedIn posts are strategically aligned with my positioning
- **Acceptance Criteria:**
  - [ ] Agent config + registration with capabilities (content_strategy, theme_identification, audience_analysis)
  - [ ] Tools: analyze_expertise, identify_themes, map_audience_interests, plan_content_mix
  - [ ] Consumes positioning strategy + LinkedIn optimizer analysis when available
  - [ ] Outputs 5-7 content themes with rationale
- **Estimated complexity:** Large
- **Dependencies:** Story 1

### Story: Content Writer Agent (Agent 2 of 2)
- **As a** user
- **I want to** receive 30 days of ready-to-post LinkedIn content
- **So that** I can maintain a consistent, professional presence without daily effort
- **Acceptance Criteria:**
  - [ ] Agent config + registration with capabilities (linkedin_content_writing, hook_crafting, cta_optimization)
  - [ ] Tools: write_post, craft_hook, add_hashtags, schedule_post, assemble_calendar
  - [ ] Each post: hook, body, CTA, hashtags, optimal posting time, content type tag
  - [ ] Quality scoring per post and overall calendar coherence score
- **Estimated complexity:** Large
- **Dependencies:** Story 2

### Story: ProductConfig + Route + Feature Flag
- **As a** developer
- **I want to** wire the content calendar into the platform runtime
- **So that** users can generate calendars through the standard pipeline
- **Acceptance Criteria:**
  - [ ] ProductConfig with 2-agent pipeline (Strategist → Writer)
  - [ ] FF_CONTENT_CALENDAR feature flag
  - [ ] Route at /api/content-calendar with Zod validation
  - [ ] DB migration for content_calendar_reports table
- **Estimated complexity:** Medium
- **Dependencies:** Story 3

### Story: Frontend — useContentCalendar Hook + CalendarRoom UI
- **As a** user
- **I want to** see my content calendar in a visual weekly/monthly view
- **So that** I can browse, copy, and plan my LinkedIn posting schedule
- **Acceptance Criteria:**
  - [ ] useContentCalendar SSE hook (same pattern as useLinkedInOptimizer)
  - [ ] CalendarRoom component with week/month toggle view
  - [ ] Each post card: date, content type badge, preview text, copy button
  - [ ] Activity feed during generation
- **Estimated complexity:** Large
- **Dependencies:** Story 4

### Story: Tests
- **As a** developer
- **I want to** maintain test coverage for the content calendar agent
- **So that** regressions are caught early
- **Acceptance Criteria:**
  - [ ] Server tests: agent registration, tool model tiers, knowledge rules, ProductConfig (target: 30+)
  - [ ] App tests: SSE event parsing, state transitions (target: 10+)
- **Estimated complexity:** Medium
- **Dependencies:** Story 5

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

## Epic: Next Agent Candidates (Agent #13+)

Priority-ordered candidates for the next agent after Content Calendar:

1. **Networking Outreach Agent** — Generates personalized connection request messages and follow-up sequences based on target companies/roles. Complements Network Intelligence.
2. **Job Application Tracker Agent** — AI-powered application status tracking with follow-up reminders, response rate analytics, and interview scheduling suggestions.
3. **Salary Negotiation Agent** — Researches compensation benchmarks, generates negotiation talking points, and role-plays offer discussions.
4. **Executive Bio Agent** — Generates speaker bios, board bios, and professional bios in multiple lengths (50/100/250 words) from resume data.
5. **Portfolio/Case Study Agent** — Transforms work history achievements into detailed case studies for consulting/advisory positioning.
