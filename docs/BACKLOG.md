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

## ~~Epic: Networking Outreach Agent (#13)~~ COMPLETE (Sprint 30)

2-agent pipeline (Researcher -> Writer) generating personalized LinkedIn outreach sequences. 5 message types, 8 knowledge rules, cross-product context, 41+11 tests.

---

## Epic: Job Application Tracker Agent (#14)

AI-powered application tracking that analyzes job descriptions, predicts response likelihood, generates follow-up messages, and provides portfolio-level analytics. Uses resume + positioning data to score application-to-candidate fit.

### Story 1: Define types and knowledge rules
- **As a** developer
- **I want to** define JobTrackerState, SSE events, application status types, and tracking knowledge rules
- **So that** the agent has structured output types and domain knowledge for application tracking
- **Acceptance Criteria:**
  - [ ] JobTrackerState with applications array, analytics, follow_up_queue
  - [ ] ApplicationStatus enum: applied, followed_up, interviewing, offered, rejected, ghosted, withdrawn
  - [ ] JobTrackerSSEEvent types (application_analyzed, follow_up_generated, analytics_updated, tracker_complete)
  - [ ] Knowledge rules: follow-up timing, response rate benchmarks, status transition guidance, application quality signals
- **Estimated complexity:** Medium
- **Dependencies:** None

### Story 2: Application Analyst agent (Agent 1 of 2)
- **As a** user
- **I want to** have AI analyze each job application against my resume and positioning
- **So that** I know which applications are strongest and where to focus follow-up effort
- **Acceptance Criteria:**
  - [ ] Agent config + registration with capabilities (application_analysis, fit_scoring, follow_up_timing, portfolio_analytics)
  - [ ] Tools: analyze_application, score_fit, assess_follow_up_timing, generate_portfolio_analytics
  - [ ] Fit scoring considers: keyword match, seniority alignment, industry relevance, positioning strategy fit
  - [ ] Portfolio analytics: response rates by industry/role level, average time-to-response, application velocity
- **Estimated complexity:** Large
- **Dependencies:** Story 1

### Story 3: Follow-Up Writer agent (Agent 2 of 2)
- **As a** user
- **I want to** receive personalized follow-up messages for each application
- **So that** I can maintain professional momentum without sounding desperate or generic
- **Acceptance Criteria:**
  - [ ] Agent config + registration with capabilities (follow_up_writing, status_assessment, reminder_scheduling)
  - [ ] Tools: write_follow_up_email, write_thank_you, write_check_in, assess_status, assemble_tracker_report
  - [ ] Follow-ups tailored to application stage and elapsed time
  - [ ] Quality scoring per message, tone calibrated to executive level
- **Estimated complexity:** Large
- **Dependencies:** Story 2

### Story 4: ProductConfig + Route + Feature Flag + Migration
- **As a** developer
- **I want to** wire the job tracker into the platform runtime
- **So that** users can track applications through the standard pipeline
- **Acceptance Criteria:**
  - [ ] ProductConfig with 2-agent pipeline (Analyst -> Writer)
  - [ ] FF_JOB_TRACKER feature flag
  - [ ] Route at /api/job-tracker with Zod validation (accepts application array with JD text, company, role, date applied)
  - [ ] DB migration for job_tracker_reports table with RLS
- **Estimated complexity:** Medium
- **Dependencies:** Story 3

### Story 5: Frontend — useJobTracker hook + TrackerRoom UI
- **As a** user
- **I want to** see my application portfolio with fit scores, follow-up reminders, and analytics
- **So that** I can manage my job search strategically
- **Acceptance Criteria:**
  - [ ] useJobTracker SSE hook
  - [ ] TrackerRoom component with application cards (status badge, fit score, days since applied)
  - [ ] Follow-up message display with copy-to-clipboard
  - [ ] Portfolio analytics summary (response rate, top-performing applications)
  - [ ] Activity feed during generation
- **Estimated complexity:** Large
- **Dependencies:** Story 4

### Story 6: Tests
- **As a** developer
- **I want to** maintain test coverage for the job tracker agent
- **So that** regressions are caught early
- **Acceptance Criteria:**
  - [ ] Server tests: agent registration, tool model tiers, knowledge rules, ProductConfig (target: 35+)
  - [ ] App tests: SSE event parsing, state transitions (target: 10+)
- **Estimated complexity:** Medium
- **Dependencies:** Story 5

---

## Epic: Salary Negotiation Agent (#15)

Researches compensation benchmarks, generates negotiation talking points, role-plays offer scenarios, and produces a negotiation prep document. Uses resume seniority + positioning to calibrate expectations.

### Story 1: Define types and knowledge rules
- **As a** developer
- **I want to** define SalaryNegotiationState, SSE events, and negotiation knowledge rules
- **So that** the agent has structured types and domain expertise for compensation negotiation
- **Acceptance Criteria:**
  - [ ] SalaryNegotiationState with market_research, negotiation_strategy, talking_points, scenarios
  - [ ] SalaryNegotiationSSEEvent types (research_complete, strategy_ready, scenario_complete, negotiation_complete)
  - [ ] Knowledge rules: anchoring principles, BATNA assessment, total comp components, counter-offer frameworks, timing strategy, executive-level negotiation norms
- **Estimated complexity:** Medium
- **Dependencies:** None

### Story 2: Market Researcher agent (Agent 1 of 2)
- **As a** user
- **I want to** receive compensation benchmarks and market context for my target role
- **So that** I negotiate from a position of data-backed confidence
- **Acceptance Criteria:**
  - [ ] Agent config + registration with capabilities (comp_research, market_analysis, benchmark_positioning, leverage_assessment)
  - [ ] Tools: research_compensation, analyze_market_position, identify_leverage_points, assess_total_comp
  - [ ] Considers: role level, industry, geography, company stage/size, candidate seniority
  - [ ] Outputs: salary range (25th/50th/75th/90th percentile), total comp breakdown, market context narrative
- **Estimated complexity:** Large
- **Dependencies:** Story 1

### Story 3: Negotiation Strategist agent (Agent 2 of 2)
- **As a** user
- **I want to** receive a negotiation playbook with talking points and scenario responses
- **So that** I can walk into compensation discussions fully prepared
- **Acceptance Criteria:**
  - [ ] Agent config + registration with capabilities (negotiation_strategy, talking_points, scenario_planning, counter_offer_analysis)
  - [ ] Tools: design_strategy, write_talking_points, simulate_scenario, write_counter_response, assemble_negotiation_prep
  - [ ] 3 scenarios: initial offer response, counter-offer, final negotiation
  - [ ] Talking points calibrated to executive tone — confident, collaborative, never desperate
- **Estimated complexity:** Large
- **Dependencies:** Story 2

### Story 4: ProductConfig + Route + Feature Flag + Migration
- **As a** developer
- **I want to** wire salary negotiation into the platform runtime
- **So that** users can generate negotiation prep through the standard pipeline
- **Acceptance Criteria:**
  - [ ] ProductConfig with 2-agent pipeline (Researcher -> Strategist)
  - [ ] FF_SALARY_NEGOTIATION feature flag
  - [ ] Route at /api/salary-negotiation with Zod validation (target role, company, current comp, offer details)
  - [ ] DB migration for salary_negotiation_reports table with RLS
- **Estimated complexity:** Medium
- **Dependencies:** Story 3

### Story 5: Frontend — useSalaryNegotiation hook + NegotiationRoom UI
- **As a** user
- **I want to** see my negotiation prep with market data, strategy, and talking points
- **So that** I can review and rehearse before the actual conversation
- **Acceptance Criteria:**
  - [ ] useSalaryNegotiation SSE hook
  - [ ] NegotiationRoom component with tabs: Market Research, Strategy, Talking Points, Scenarios
  - [ ] Scenario cards with situation/response pairs
  - [ ] Copy-to-clipboard for talking points
  - [ ] Activity feed during generation
- **Estimated complexity:** Large
- **Dependencies:** Story 4

### Story 6: Tests
- **As a** developer
- **I want to** maintain test coverage for the salary negotiation agent
- **So that** regressions are caught early
- **Acceptance Criteria:**
  - [ ] Server tests: agent registration, tool model tiers, knowledge rules, ProductConfig (target: 35+)
  - [ ] App tests: SSE event parsing, state transitions (target: 10+)
- **Estimated complexity:** Medium
- **Dependencies:** Story 5

---

## Epic: Executive Bio Agent (#16)

Generates speaker bios, board bios, advisory bios, and professional bios in multiple lengths (50/100/250/500 words) from resume data and positioning strategy. Single-agent pipeline — mostly a writing exercise with strong formatting rules.

### Story 1: Define types and knowledge rules
- **As a** developer
- **I want to** define ExecutiveBioState, SSE events, bio format types, and writing rules
- **So that** the agent has structured output types and domain knowledge for bio generation
- **Acceptance Criteria:**
  - [ ] ExecutiveBioState with bios array (each with format, length, content, quality_score)
  - [ ] BioFormat enum: speaker, board, advisory, professional, linkedin_featured
  - [ ] ExecutiveBioSSEEvent types (bio_drafted, bio_complete, all_bios_complete)
  - [ ] Knowledge rules: length targets per format, tone guidance (third person vs first), what to include/exclude per context, executive positioning principles
- **Estimated complexity:** Medium
- **Dependencies:** None

### Story 2: Bio Writer agent (single agent)
- **As a** user
- **I want to** receive polished bios in multiple formats ready for immediate use
- **So that** I have the right bio for every professional context without rewriting each time
- **Acceptance Criteria:**
  - [ ] Agent config + registration with capabilities (bio_writing, format_adaptation, length_calibration, positioning_integration)
  - [ ] Tools: analyze_positioning, write_bio (parameterized by format + target length), quality_check_bio, assemble_bio_collection
  - [ ] Each bio: positioning-aligned, authentic, appropriate tone for context
  - [ ] Quality scoring: positioning alignment, length compliance, readability, executive tone
- **Estimated complexity:** Large
- **Dependencies:** Story 1

### Story 3: ProductConfig + Route + Feature Flag + Migration
- **As a** developer
- **I want to** wire executive bio generation into the platform runtime
- **So that** users can generate bio collections through the standard pipeline
- **Acceptance Criteria:**
  - [ ] ProductConfig with single-agent pipeline (Bio Writer)
  - [ ] FF_EXECUTIVE_BIO feature flag
  - [ ] Route at /api/executive-bio with Zod validation (requested formats, target contexts)
  - [ ] DB migration for executive_bio_reports table with RLS
- **Estimated complexity:** Medium
- **Dependencies:** Story 2

### Story 4: Frontend — useExecutiveBio hook + BioRoom UI
- **As a** user
- **I want to** see all my bio versions with length indicators and copy buttons
- **So that** I can grab the right bio for each situation
- **Acceptance Criteria:**
  - [ ] useExecutiveBio SSE hook
  - [ ] BioRoom component with format tabs (Speaker, Board, Advisory, Professional, LinkedIn)
  - [ ] Each bio card: word count badge, quality score, copy-to-clipboard
  - [ ] Activity feed during generation
- **Estimated complexity:** Medium
- **Dependencies:** Story 3

### Story 5: Tests
- **As a** developer
- **I want to** maintain test coverage for the executive bio agent
- **So that** regressions are caught early
- **Acceptance Criteria:**
  - [ ] Server tests: agent registration, tool model tiers, knowledge rules, ProductConfig (target: 25+)
  - [ ] App tests: SSE event parsing, state transitions (target: 10+)
- **Estimated complexity:** Medium
- **Dependencies:** Story 4

---

## Epic: Portfolio / Case Study Agent (#17)

Transforms work history achievements into structured case studies for consulting, advisory, and board positioning. Uses the strategist's evidence capture to build situation-approach-results narratives with quantified impact.

### Story 1: Define types and knowledge rules
- **As a** developer
- **I want to** define CaseStudyState, SSE events, and case study writing rules
- **So that** the agent has structured output types and domain knowledge for case study generation
- **Acceptance Criteria:**
  - [ ] CaseStudyState with case_studies array (each with title, situation, approach, results, lessons, metrics, tags)
  - [ ] CaseStudySSEEvent types (achievement_selected, case_study_drafted, case_study_complete, collection_complete)
  - [ ] Knowledge rules: STAR/CAR framework, metrics quantification, executive narrative voice, consulting-grade formatting, length targets (500-800 words per study)
- **Estimated complexity:** Medium
- **Dependencies:** None

### Story 2: Achievement Analyst agent (Agent 1 of 2)
- **As a** user
- **I want to** have AI select my strongest achievements and extract the full story behind each
- **So that** my case studies showcase genuinely impressive work, not routine responsibilities
- **Acceptance Criteria:**
  - [ ] Agent config + registration with capabilities (achievement_analysis, impact_scoring, narrative_extraction, metric_identification)
  - [ ] Tools: parse_achievements, score_impact, extract_narrative_elements, identify_metrics
  - [ ] Selects top 3-5 achievements by impact score
  - [ ] For each: extracts situation context, approach taken, quantified results, transferable lessons
- **Estimated complexity:** Large
- **Dependencies:** Story 1

### Story 3: Case Study Writer agent (Agent 2 of 2)
- **As a** user
- **I want to** receive polished, consulting-grade case studies ready for proposals and portfolios
- **So that** I can demonstrate strategic impact to prospective clients, boards, or advisory engagements
- **Acceptance Criteria:**
  - [ ] Agent config + registration with capabilities (case_study_writing, narrative_structuring, metric_presentation, portfolio_assembly)
  - [ ] Tools: write_case_study, add_metrics_visualization, quality_review, assemble_portfolio
  - [ ] Each case study: executive summary, situation, approach, results (with metrics), lessons/implications
  - [ ] Quality scoring: narrative clarity, metric specificity, strategic framing, consulting tone
- **Estimated complexity:** Large
- **Dependencies:** Story 2

### Story 4: ProductConfig + Route + Feature Flag + Migration
- **As a** developer
- **I want to** wire case study generation into the platform runtime
- **So that** users can generate case study portfolios through the standard pipeline
- **Acceptance Criteria:**
  - [ ] ProductConfig with 2-agent pipeline (Analyst -> Writer)
  - [ ] FF_CASE_STUDY feature flag
  - [ ] Route at /api/case-study with Zod validation (selected achievements or auto-select)
  - [ ] DB migration for case_study_reports table with RLS
- **Estimated complexity:** Medium
- **Dependencies:** Story 3

### Story 5: Frontend — useCaseStudy hook + CaseStudyRoom UI
- **As a** user
- **I want to** see my case studies with impact scores and export options
- **So that** I can select which ones to include in proposals or on my website
- **Acceptance Criteria:**
  - [ ] useCaseStudy SSE hook
  - [ ] CaseStudyRoom component with case study cards (title, impact score, industry tag, word count)
  - [ ] Expandable full case study view with structured sections
  - [ ] Copy-to-clipboard per case study
  - [ ] Activity feed during generation
- **Estimated complexity:** Large
- **Dependencies:** Story 4

### Story 6: Tests
- **As a** developer
- **I want to** maintain test coverage for the case study agent
- **So that** regressions are caught early
- **Acceptance Criteria:**
  - [ ] Server tests: agent registration, tool model tiers, knowledge rules, ProductConfig (target: 30+)
  - [ ] App tests: SSE event parsing, state transitions (target: 10+)
- **Estimated complexity:** Medium
- **Dependencies:** Story 5

---

## Epic 18: Thank You Note Writer Agent

**Goal:** Single-agent pipeline that crafts personalized, professional thank-you notes after interviews — tailored per interviewer, referencing specific conversation points, and calibrated to executive communication standards.

### Story 1: Types & Knowledge Rules
- **As a** developer
- **I want to** define state types, SSE events, and quality rules for thank-you note writing
- **So that** the agent has a typed foundation and domain expertise
- **Acceptance Criteria:**
  - [ ] ThankYouNoteState extending BaseState with interview context, notes array, final report
  - [ ] ThankYouNoteSSEEvent discriminated union (note_drafted, note_complete, collection_complete, pipeline_error)
  - [ ] NoteFormat type (email, handwritten, linkedin_message)
  - [ ] InterviewerContext interface (name, title, topics_discussed, rapport_notes)
  - [ ] 6+ quality rules covering tone, personalization, timeliness, executive standards, anti-patterns
- **Estimated complexity:** Medium
- **Dependencies:** None

### Story 2: Writer Agent & Tools
- **As a** developer
- **I want to** build the thank-you note writer agent with tools for analyzing interview context and writing personalized notes
- **So that** the agent can produce tailored notes per interviewer
- **Acceptance Criteria:**
  - [ ] analyze_interview_context tool (mid tier) — extracts key themes, decision-makers, rapport signals
  - [ ] write_thank_you_note tool (primary tier) — writes note for specific interviewer/format
  - [ ] personalize_per_interviewer tool (mid tier) — adjusts tone and references per interviewer's role/seniority
  - [ ] assemble_note_set tool (mid tier) — combines all notes into final collection with delivery guidance
  - [ ] Agent config: max_rounds=10, overall_timeout=360s
- **Estimated complexity:** Large
- **Dependencies:** Story 1

### Story 3: ProductConfig & Route
- **As a** developer
- **I want to** wire the thank-you note writer into the product pipeline and expose it via API
- **So that** users can generate thank-you notes through the platform
- **Acceptance Criteria:**
  - [ ] ProductConfig with single-agent pipeline, buildAgentMessage, finalizeResult, persistResult
  - [ ] Route with Zod schema (session_id, resume_text, interviewers array, company, role, interview_date)
  - [ ] FF_THANK_YOU_NOTE feature flag
  - [ ] Platform context loading (positioning strategy)
  - [ ] Supabase migration for thank_you_note_reports table with RLS
- **Estimated complexity:** Medium
- **Dependencies:** Story 2

### Story 4: Frontend Hook
- **As a** developer
- **I want to** create the useThankYouNote SSE hook
- **So that** the frontend can stream and display thank-you note generation progress
- **Acceptance Criteria:**
  - [ ] useThankYouNote hook with statusRef concurrency guard
  - [ ] Handles note_drafted, note_complete, collection_complete events
  - [ ] Supabase auth integration
- **Estimated complexity:** Small
- **Dependencies:** Story 3

### Story 5: Tests
- **As a** developer
- **I want to** maintain test coverage for the thank-you note agent
- **So that** regressions are caught early
- **Acceptance Criteria:**
  - [ ] Server tests: agent registration, tool model tiers, knowledge rules, ProductConfig (target: 30+)
  - [ ] App tests: SSE event parsing, state transitions (target: 10+)
- **Estimated complexity:** Medium
- **Dependencies:** Story 4

---

## Epic 19: Personal Brand Audit Agent

**Goal:** 2-agent pipeline (Brand Auditor → Brand Advisor) that analyzes an executive's brand presence across resume, LinkedIn, and bios for consistency, identifies gaps and contradictions, scores brand coherence, and provides prioritized recommendations.

### Story 1: Types & Knowledge Rules
- **As a** developer
- **I want to** define state types, SSE events, and quality rules for personal brand auditing
- **So that** the agent has a typed foundation and domain expertise
- **Acceptance Criteria:**
  - [ ] PersonalBrandState extending BaseState with brand_sources, audit_findings, recommendations, final report
  - [ ] PersonalBrandSSEEvent discriminated union (audit_progress, finding_identified, audit_complete, recommendations_ready, pipeline_error)
  - [ ] BrandSource type (resume, linkedin, bio, website, portfolio)
  - [ ] AuditFinding interface (category, severity, description, source, recommendation)
  - [ ] ConsistencyScore interface (overall, messaging, visual_identity, value_proposition, audience_alignment)
  - [ ] 7+ quality rules covering brand coherence, audience alignment, executive presence, authenticity, gap identification
- **Estimated complexity:** Medium
- **Dependencies:** None

### Story 2: Auditor Agent & Tools
- **As a** developer
- **I want to** build the brand auditor agent that analyzes brand materials for consistency and gaps
- **So that** executives get a comprehensive assessment of their personal brand
- **Acceptance Criteria:**
  - [ ] analyze_resume_brand tool (mid tier) — extracts positioning, tone, value propositions from resume
  - [ ] analyze_linkedin_brand tool (mid tier) — analyzes LinkedIn profile content for brand alignment
  - [ ] analyze_bio_brand tool (mid tier) — evaluates executive bios for brand consistency
  - [ ] score_consistency tool (mid tier) — produces consistency scores across all sources
  - [ ] Agent config: max_rounds=8, overall_timeout=360s
- **Estimated complexity:** Large
- **Dependencies:** Story 1

### Story 3: Advisor Agent & Tools
- **As a** developer
- **I want to** build the brand advisor agent that generates actionable recommendations from audit findings
- **So that** executives know exactly what to fix and in what order
- **Acceptance Criteria:**
  - [ ] identify_gaps tool (mid tier) — finds missing brand elements and contradictions
  - [ ] write_recommendations tool (primary tier) — writes specific, actionable improvement recommendations
  - [ ] prioritize_fixes tool (mid tier) — ranks recommendations by impact and effort
  - [ ] assemble_audit_report tool (mid tier) — combines findings and recommendations into final report
  - [ ] Agent config: max_rounds=10, overall_timeout=420s
- **Estimated complexity:** Large
- **Dependencies:** Story 2

### Story 4: ProductConfig & Route
- **As a** developer
- **I want to** wire the brand audit pipeline and expose it via API
- **So that** users can run personal brand audits through the platform
- **Acceptance Criteria:**
  - [ ] ProductConfig with 2-agent pipeline (auditor → advisor), buildAgentMessage, finalizeResult, persistResult
  - [ ] Route with Zod schema (session_id, resume_text, linkedin_text optional, bio_text optional)
  - [ ] FF_PERSONAL_BRAND_AUDIT feature flag
  - [ ] Platform context loading (positioning strategy, bios)
  - [ ] Supabase migration for personal_brand_reports table with RLS
- **Estimated complexity:** Medium
- **Dependencies:** Story 3

### Story 5: Frontend Hook
- **As a** developer
- **I want to** create the usePersonalBrand SSE hook
- **So that** the frontend can stream and display brand audit progress
- **Acceptance Criteria:**
  - [ ] usePersonalBrand hook with statusRef concurrency guard
  - [ ] Handles audit_progress, finding_identified, audit_complete, recommendations_ready events
  - [ ] Supabase auth integration
- **Estimated complexity:** Small
- **Dependencies:** Story 4

### Story 6: Tests
- **As a** developer
- **I want to** maintain test coverage for the personal brand audit agent
- **So that** regressions are caught early
- **Acceptance Criteria:**
  - [ ] Server tests: agent registration, tool model tiers, knowledge rules, ProductConfig (target: 30+)
  - [ ] App tests: SSE event parsing, state transitions (target: 10+)
- **Estimated complexity:** Medium
- **Dependencies:** Story 5

---

## Epic 20: 90-Day Plan Generator Agent

**Goal:** 2-agent pipeline (Role Researcher → Plan Writer) that creates a strategic 90-day onboarding plan for executives starting new roles — organized into 30/60/90-day phases with stakeholder mapping, quick wins, learning priorities, and measurable milestones.

### Story 1: Types & Knowledge Rules
- **As a** developer
- **I want to** define state types, SSE events, and quality rules for 90-day plan generation
- **So that** the agent has a typed foundation and domain expertise
- **Acceptance Criteria:**
  - [ ] NinetyDayPlanState extending BaseState with role_context, stakeholder_map, phases array, final report
  - [ ] NinetyDayPlanSSEEvent discriminated union (research_complete, phase_drafted, phase_complete, plan_complete, pipeline_error)
  - [ ] PlanPhase interface (phase: 30|60|90, objectives, key_activities, milestones, risks)
  - [ ] Stakeholder interface (name/role, relationship_type, priority, engagement_strategy)
  - [ ] QuickWin interface (description, impact, effort, timeline, stakeholder_benefit)
  - [ ] 7+ quality rules covering executive onboarding best practices, stakeholder management, measurability, realistic pacing
- **Estimated complexity:** Medium
- **Dependencies:** None

### Story 2: Researcher Agent & Tools
- **As a** developer
- **I want to** build the role researcher agent that analyzes the new role context and maps the organizational landscape
- **So that** the plan is grounded in real role requirements
- **Acceptance Criteria:**
  - [ ] analyze_role_context tool (mid tier) — extracts role expectations, reporting structure, success criteria
  - [ ] map_stakeholders tool (mid tier) — identifies key stakeholders and relationship dynamics
  - [ ] identify_quick_wins tool (mid tier) — finds early impact opportunities based on role and candidate strengths
  - [ ] assess_learning_priorities tool (light tier) — determines knowledge gaps and learning curve areas
  - [ ] Agent config: max_rounds=6, overall_timeout=300s
- **Estimated complexity:** Large
- **Dependencies:** Story 1

### Story 3: Planner Agent & Tools
- **As a** developer
- **I want to** build the plan writer agent that creates the phased 90-day strategic plan
- **So that** executives have a concrete, actionable onboarding roadmap
- **Acceptance Criteria:**
  - [ ] write_30_day_plan tool (primary tier) — writes the "Learn & Listen" phase with specific activities and milestones
  - [ ] write_60_day_plan tool (primary tier) — writes the "Contribute & Build" phase
  - [ ] write_90_day_plan tool (primary tier) — writes the "Lead & Deliver" phase
  - [ ] assemble_strategic_plan tool (mid tier) — combines phases into final plan with executive summary
  - [ ] Agent config: max_rounds=10, overall_timeout=420s
- **Estimated complexity:** Large
- **Dependencies:** Story 2

### Story 4: ProductConfig & Route
- **As a** developer
- **I want to** wire the 90-day plan pipeline and expose it via API
- **So that** users can generate onboarding plans through the platform
- **Acceptance Criteria:**
  - [ ] ProductConfig with 2-agent pipeline (researcher → planner), buildAgentMessage, finalizeResult, persistResult
  - [ ] Route with Zod schema (session_id, resume_text, target_role, target_company, target_industry, reporting_to optional)
  - [ ] FF_NINETY_DAY_PLAN feature flag
  - [ ] Platform context loading (positioning strategy)
  - [ ] Supabase migration for ninety_day_plan_reports table with RLS
- **Estimated complexity:** Medium
- **Dependencies:** Story 3

### Story 5: Frontend Hook
- **As a** developer
- **I want to** create the useNinetyDayPlan SSE hook
- **So that** the frontend can stream and display plan generation progress
- **Acceptance Criteria:**
  - [ ] useNinetyDayPlan hook with statusRef concurrency guard
  - [ ] Handles research_complete, phase_drafted, phase_complete, plan_complete events
  - [ ] Supabase auth integration
- **Estimated complexity:** Small
- **Dependencies:** Story 4

### Story 6: Tests
- **As a** developer
- **I want to** maintain test coverage for the 90-day plan agent
- **So that** regressions are caught early
- **Acceptance Criteria:**
  - [ ] Server tests: agent registration, tool model tiers, knowledge rules, ProductConfig (target: 30+)
  - [ ] App tests: SSE event parsing, state transitions (target: 10+)
- **Estimated complexity:** Medium
- **Dependencies:** Story 5
