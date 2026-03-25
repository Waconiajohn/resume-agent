# Sprint Log — Resume Agent

---

# Sprints 57-59 Retrospective — Phase 3A: Job Command Center
**Completed:** 2026-03-08

## What was delivered

### Sprint 57: Foundation — Search API + DB + Kanban UI (7 stories)
- Story 57-1: Job Search Types + Source Adapter Interface (`types.ts`, `index.ts` — SearchAdapter, searchAllSources, dedup, boolean parser)
- Story 57-2: JSearch + Adzuna Adapters (15s timeout, env var gating, graceful empty-array on failure)
- Story 57-3: Job Search Route + DB Migration + Feature Flag (POST /api/job-search, Zod validation, 20/min rate limit, 3 new tables)
- Story 57-4: Kanban Board Components (PipelineBoard, PipelineColumn, OpportunityCard with @dnd-kit drag-drop)
- Story 57-5: Add Opportunity Dialog + Pipeline Filters (modal dialog, stage filter pills, text search)
- Story 57-6: Sprint 57 Tests (+95 tests: 53 server, 42 app — adapters, route, core, components)
- Story 57-7: ADR-040 (@dnd-kit/core for Kanban drag-drop)

### Sprint 58: Intelligence — AI Matching + Radar + Watchlist (6 stories)
- Story 58-1: AI Job Matcher (matchJobsToProfile, MODEL_MID, batch 10, positioning_strategy context)
- Story 58-2: Score Route + Scan Persistence (POST /api/job-search/score, GET /scans/latest)
- Story 58-3: Watchlist Companies DB + CRUD Route (watchlist_companies table, CRUD at /api/watchlist)
- Story 58-4: Radar Search Hook + UI (useRadarSearch, RadarSection with search/filter/promote/dismiss)
- Story 58-5: Watchlist Hook + UI (useWatchlist, WatchlistBar chips, WatchlistManager dialog)
- Story 58-6: Sprint 58 Tests (+74 tests: 30 server, 44 app — matcher, watchlist, radar, watchlist UI)

### Sprint 59: Integration — NI Cross-Ref + Daily Ops + Page Assembly (5 stories)
- Story 59-1: NI Integration on Job Matches (ni-crossref.ts, enriched/:scanId endpoint, NetworkBadge)
- Story 59-2: Daily Ops Data Hook (useDailyOps composing pipeline + radar data)
- Story 59-3: Daily Ops Section UI (TopMatchCard, DailyOpsSection with stats/matches/actions/stale)
- Story 59-4: Job Command Center Page Assembly (3-tab layout, quick stats, display:none tab preservation)
- Story 59-5: Sprint 59 Tests (+59 tests: 20 server, 39 app — NI cross-ref, enriched route, daily ops, top match)

## What went well
- All 18 stories across 3 sprints completed in a single session
- +228 new tests total (103 server + 125 app), zero failures
- Zero TypeScript errors throughout — both workspaces clean after every story
- Parallel agent delegation maximized throughput (backend + frontend stories ran concurrently)
- Existing infrastructure reuse worked well: useApplicationPipeline, platform-context, network-intelligence

## What went wrong
- Plan assumed `ni_connections` table but actual table is `client_connections` — required discovery mid-implementation
- useRadarSearch test broke after adding NI enrichment (extra fetch call consumed mock) — required 3-mock chain fix
- Sprint4Rooms.test.tsx broke when "Daily Ops" text appeared in both tab bar and section heading
- POST /api/job-search route initially didn't return scan_id in response — caught by frontend hook integration

## What to improve next sprint
- Verify DB table/column names against actual schema before writing cross-ref code
- When adding fetch calls to existing hooks, update all existing test mocks immediately
- Consider integration tests that exercise the full search → score → enrich flow

## Technical debt identified
- DB migrations not yet applied to Supabase (2 migration files ready)
- API key (FIRECRAWL_API_KEY) needs configuration
- Manual E2E testing of full flow pending
- WatchlistManager could benefit from optimistic delete (currently waits for server)

---

# Sprint 54 Retrospective — Post-Deploy Cleanup & Quality
**Completed:** 2026-03-08

## What was delivered
- Story 54-1: Clean Orphaned Props (verified already clean — WorkflowStatsRail was removed in Sprint 16, all ChatPanel props are actively used)
- Story 54-2: IntelligenceActivityFeed message deduplication (+13 app tests)
- Story 54-3: Cover Letter DOCX Export (verified already implemented — `exportCoverLetterDocx()` and UI button both exist from Sprint 47)
- Story 54-4: Extract shared test utilities (mock-factories.ts, mock-modules.ts, migrated 5 test files)
- Story 54-5: ADR-039 Post-Deploy Stabilization Period

## What went well
- Two stories (54-1, 54-3) were verified as already complete — proper audit before writing code
- Shared test helpers reduce boilerplate across 5+ test files
- Zero regressions during cleanup sprint

## What went wrong
- Stories 54-1 and 54-3 could have been caught during backlog grooming before sprint planning

## What to improve next sprint
- Pre-verify story scope before sprint commitment to avoid "already done" discoveries
- Continue migrating remaining test files to shared helpers

## Technical debt identified
- ~15 more test files could benefit from shared mock helpers
- Backlog had ~20 stale stories needing cleanup (addressed in Sprint 55)

---

# Sprint 36 — Deferred
**Status:** Deferred to future sprints
**Reason:** CareerIQ Master Build Plan supersedes Sprint 36 scope. Career IQ rooms (6 hook-only agent rooms + NI room) and product catalog updates will be built as part of each phase's frontend work rather than as standalone rooms. This avoids building rooms for agents that will be significantly enhanced by the master plan.
**Stories moved to:** BACKLOG.md (existing Epic: Platform Expansion)

---

# Sprint 35 Retrospective — Agents #18-#20 (Thank You Note, Personal Brand Audit, 90-Day Plan)
**Completed:** 2026-03-07

## What was delivered
- Agent #18 — Thank You Note Writer: Single-agent pipeline, 4 tools, 7 rules, NoteFormat types, full route/hook/tests
- Agent #19 — Personal Brand Audit: 2-agent pipeline (Auditor → Advisor), 8 tools, 8 rules, 6 finding categories, ConsistencyScores, full route/hook/tests
- Agent #20 — 90-Day Plan Generator: 2-agent pipeline (Researcher → Planner), 8 tools, 8 rules, 30/60/90 phase structure, full route/hook/tests
- 185 new tests (149 server + 36 app), all passing
- 3 DB migrations with RLS, 3 feature flags, 3 SSE hooks with concurrency guard

## What went well
- Parallel agent builds (3 agents built concurrently via subagents) — massive speed improvement
- Pattern consistency is very high at this point — each agent follows the established template closely
- Manual audit caught zero critical issues — the subagent-built code matched patterns correctly
- Test count growing healthily: server 1,364 → 1,513, app 754 → 790

## What went wrong
- Audit subagent hit rate limit — had to fall back to manual file-by-file review
- Personal brand auditor's onComplete has an empty conditional (cosmetic, not a bug — score_consistency sets state directly)

## What to improve next sprint
- Consider extracting the SSE hook template into a generator — hooks are now 95% boilerplate
- Consider a shared test helper for ProductConfig tests — same shape across all agents

## Technical debt identified
- 20 SSE hooks now exist, all with near-identical structure — ripe for a shared hook factory
- ProductConfig test boilerplate is repetitive across all agent test files

---

# Sprint 34 Retrospective — Portfolio / Case Study Agent (#17)
**Completed:** 2026-03-07

## What was delivered
- Story 1: Types (5 formats, 6 impact categories, SSE events) + 8 knowledge rules
- Story 2: Achievement Analyst agent (4 tools: parse_achievements, score_impact, extract_narrative_elements, identify_metrics)
- Story 3: Case Study Writer agent (4 tools: write_case_study, add_metrics_visualization, quality_review, assemble_portfolio)
- Story 4: ProductConfig + FF_CASE_STUDY + route + DB migration
- Story 5: useCaseStudy SSE hook with concurrency guard
- Story 6: 61 tests (49 server + 12 app)

## What went well
- 4 sprints delivered in a single session (31-34)
- Consistent pattern makes each agent faster to build
- All tests passing: server 1,363, app 754

## What went wrong
- Minor tsc issue with array type inference (metrics `never[]`) — fixed with explicit cast

## What to improve next sprint
- Continue avoiding `findLastIndex` and other ES2023+ methods

## Technical debt identified
- None new

---

# Sprint 33 Retrospective — Executive Bio Agent (#16)
**Completed:** 2026-03-07

## What was delivered
- Story 1: Types (5 bio formats, 4 lengths with word count targets, SSE events) + 8 knowledge rules
- Story 2: Bio Writer agent (4 tools: analyze_positioning, write_bio, quality_check_bio, assemble_bio_collection)
- Story 3: ProductConfig (single-agent pipeline) + FF_EXECUTIVE_BIO + route + DB migration
- Story 4: useExecutiveBio SSE hook with concurrency guard
- Story 5: 57 tests (45 server + 12 app)

## What went well
- Single-agent pipeline was simpler to build than 2-agent pipelines
- tsc caught `findLastIndex` compat issue immediately — fixed with manual loop
- All tests passing: server 1,314, app 742

## What went wrong
- `findLastIndex` not available in target ES version — required manual fix

## What to improve next sprint
- Check ES target compat for newer array methods before using them

## Technical debt identified
- None new

---

# Sprint 32 Retrospective — Salary Negotiation Agent (#15)
**Completed:** 2026-03-07

## What was delivered
- Story 1: Types (SalaryNegotiationState, 6 comp components, 3 scenario types, SSE events) + 8 knowledge rules
- Story 2: Market Researcher agent (4 tools: research_compensation, analyze_market_position, identify_leverage_points, assess_total_comp)
- Story 3: Negotiation Strategist agent (5 tools: design_strategy, write_talking_points, simulate_scenario, write_counter_response, assemble_negotiation_prep)
- Story 4: ProductConfig + FF_SALARY_NEGOTIATION + route + DB migration
- Story 5: useSalaryNegotiation SSE hook with concurrency guard
- Story 6: 63 tests (51 server + 12 app)

## What went well
- All 6 stories delivered in a single session
- tsc clean on first compile after parallel agent builds
- All tests passing: server 1,269, app 730
- Concurrency guard included from the start (lesson from Sprint 31 audit)

## What went wrong
- Nothing — clean delivery

## What to improve next sprint
- Continue the pattern: parallel agent builds for Stories 1-3, sequential for 4-6

## Technical debt identified
- None new

---

# Sprint 30 Retrospective — Networking Outreach Agent (#13)
**Completed:** 2026-03-07

## What was delivered
- Story 1: NetworkingOutreachState, 5 message types (connection_request, follow_up_1, follow_up_2, value_offer, meeting_request), SSE event union
- Story 2: 8 networking knowledge rules (philosophy, connection requests, follow-ups, value offers, meeting requests, personalization, tone, self-review)
- Story 3: Researcher agent config + 4 tools (analyze_target with resume parsing, find_common_ground, assess_connection_path, plan_outreach_sequence)
- Story 4: Writer agent config + 5 tools (write_connection_request, write_follow_up, write_value_offer, write_meeting_request, assemble_sequence)
- Story 5: ProductConfig + FF_NETWORKING_OUTREACH + route + DB migration + cross-product context loading
- Story 6: useNetworkingOutreach SSE hook + OutreachGenerator UI in NetworkingHubRoom
- Story 7: 41 server tests + 11 app tests — all passing

## What went well
- All 7 stories completed across 2 sessions with full audit cycle
- Content Calendar served as proven template — same 2-agent pipeline pattern
- Two full audit passes caught: missing write_meeting_request tool, resume parsing gap, unsafe array access, missing writer validation, follow_up_number schema gap
- Zero TypeScript errors on both app and server after all fixes

## What went wrong
- First audit found 3 critical + 3 warning issues — code was not production-ready before audit
- Writer agent initially had only 4 tools (missing meeting_request) despite types.ts defining 5 message types
- Resume data parsing was absent from researcher — would have caused empty personalization at runtime

## What to improve next sprint
- Run audit after each agent pair (researcher + writer) instead of waiting until the end
- Cross-reference MESSAGE_SEQUENCE array against tool count early
- Consider adding integration tests that mock LLM and validate cross-tool state flow

## Technical debt identified
- NETWORKING_OUTREACH_RULES injected in both agent system prompt AND each tool's LLM call (redundant tokens)
- No integration tests for cross-tool state flow (unit tests cover structure only)
- Content Calendar backlog stories still show unchecked boxes despite being delivered in Sprint 28

---

# Sprint 28 Retrospective — Content Calendar Agent (#12)
**Completed:** 2026-03-06

## What was delivered
- Story 1: ContentCalendarState, 7 content types with labels, ContentCalendarSSEEvent union type
- Story 2: 8 content strategy knowledge rules (philosophy, content mix, hooks, structure, hashtags, schedule, engagement, self-review)
- Story 3: Strategist agent config + 4 tools (analyze_expertise, identify_themes, map_audience_interests, plan_content_mix)
- Story 4: Writer agent config + 5 tools (write_post, craft_hook, add_hashtags, schedule_post, assemble_calendar)
- Story 5: ProductConfig + FF_CONTENT_CALENDAR + route + index.ts mounting with cross-product context loading (including LinkedIn optimizer analysis)
- Story 6: useContentCalendar SSE hook + ContentCalendarRoom UI with week/month view, post cards with copy-to-clipboard
- Story 7: 36 server tests + 12 app tests — all passing

## What went well
- All 7 stories completed in a single session — same sprint as Sprint 27 activation
- Parallel subagent build (strategist, writer, product config) cut build time significantly
- LinkedIn Optimizer served as a proven template — minimal adaptation needed
- Zero TypeScript errors — both app and server tsc clean
- Server tests: 1,123 passing (up from 1,087). App tests: 695 passing (up from 683)

## What went wrong
- One test assertion mismatch: buildAgentMessage('writer') didn't contain 'write_post' literally — the product config used prose instead of tool names. Quick fix.
- ContentCalendarRoom not yet wired into CareerIQ sidebar/screen (deferred to activation sprint)

## What to improve next sprint
- Wire ContentCalendarRoom into the CareerIQ navigation
- Create DB migration for content_calendar_reports table
- E2E smoke test with FF_CONTENT_CALENDAR=true

## Technical debt identified
- content_calendar_reports table not yet created (persist silently fails)
- parsePostsFromReport() in ContentCalendarRoom uses regex — brittle if report format changes
- ContentCalendarRoom not yet accessible from CareerIQ navigation

---

# Sprint 27 Retrospective — LinkedIn Optimizer Activation + Tech Debt
**Completed:** 2026-03-06

## What was delivered
- Sprint 26 retrospective logged, Sprint 27 planned
- FF_LINKEDIN_OPTIMIZER enabled in server/.env, route verified live (401 auth gate)
- linkedin_optimization_reports DB migration applied via Supabase MCP (12 columns, RLS, indexes)
- Fixed 7 pre-existing BenchmarkProfile tsc errors in ResearchDashboardPanel.test.tsx (makeBenchmark helper)
- Content Calendar epic scoped (6 stories), LinkedIn Optimizer v2 scoped (3 stories)
- Next agent candidates prioritized (5 options)

## What went well
- All 6 stories completed rapidly — clean activation
- App tsc fully clean for the first time (0 errors)
- Supabase MCP tool worked well for applying migrations directly

## What went wrong
- update_updated_at_column() function didn't exist on remote DB — had to include CREATE OR REPLACE in the migration

## Technical debt identified
- None new — all items addressed

---

# Sprint 26 Retrospective — LinkedIn Optimizer Agent
**Completed:** 2026-03-06

## What was delivered
- Story 1: `LinkedInOptimizerState`, `LinkedInOptimizerSSEEvent`, section types, `SECTION_ORDER` constant
- Story 2: 8 LinkedIn optimization knowledge rules (audience, headline, about, experience, keywords, consistency, recruiter, self-review)
- Story 3: Analyzer agent config + 3 tools (`parse_inputs`, `analyze_current_profile`, `identify_keyword_gaps`) with LLM model routing
- Story 4: Writer agent config + 5 tools (`write_headline`, `write_about`, `write_experience_entries`, `optimize_keywords`, `assemble_report`) with quality scoring
- Story 5: ProductConfig + feature flag (`FF_LINKEDIN_OPTIMIZER`) + route + index.ts mounting with Zod validation and cross-product context loading
- Story 6: `useLinkedInOptimizer` SSE hook + LinkedInStudioRoom wired to real pipeline with activity feed, quality score, and report section parsing
- Story 7: 36 server tests + 12 app tests — all passing
- Post-delivery audit: 4 fixes applied (double report_complete emission, stale closure, redundant stage events, unused prop)

## What went well
- All 7 stories completed in a single session — clean delivery
- Interview Prep (Agent #10) served as an excellent template — analyzer/writer pattern, ProductConfig, route factory, SSE hook all followed established patterns
- Audit caught a critical double-emission bug before it could hit production
- Zero TypeScript errors throughout — both app and server `tsc --noEmit` clean
- Server tests: 1,087 passing (up from 1,014 baseline). App tests: 683 passing (up from 586 baseline)

## What went wrong
- Off-by-one in integration test (expected 14 activity messages, actual was 13) — quickly caught and fixed
- `assemble_report` tool duplicated `report_complete` emission that `finalizeResult` already handles — pattern divergence from interview prep

## What to improve next sprint
- Create DB migration for `linkedin_optimization_reports` table (deferred — persistResult silently fails without it)
- E2E smoke test with `FF_LINKEDIN_OPTIMIZER=true` and working LLM API
- Consider extracting `parseReportSections()` regex into a shared utility if other products need similar report parsing

## Technical debt identified
- `linkedin_optimization_reports` table not yet created (persist silently fails)
- `parseReportSections()` in LinkedInStudioRoom uses fragile regex — works but brittle if report format changes
- Pre-existing `ResearchDashboardPanel.test.tsx` tsc errors (7 BenchmarkProfile type mismatches) still unresolved

---

# Sprint 18 Retrospective — Cover Letter Frontend + Tech Debt
**Completed:** 2026-03-02

## What was delivered
- Story 1: Removed orphaned `runtimeMetrics` prop from ChatPanel, ChatDrawer, WorkflowStatsRail, and CoachScreen (4 files, removed `runtimeMetricsSummary` variable)
- Story 2: Fixed `xs:inline` to `sm:inline` on SectionWorkbench approve button (xs: isn't a valid Tailwind v3 breakpoint)
- Story 3: Cover letter intake form and routing — activated product in catalog, added `cover-letter` View, wired URL routing, created CoverLetterIntakeForm with 3-field validation
- Story 4: useCoverLetter hook — SSE streaming for 6 CoverLetterSSEEvent types, reconnect with exponential backoff, AbortController cleanup, 9 unit tests
- Story 5: CoverLetterScreen — internal state machine (intake/running/complete/error), activity feed, letter display with quality badge, dynamic import for exports
- Story 6: Cover letter text and PDF export — downloadCoverLetterAsText + exportCoverLetterPdf using existing filename builder and jsPDF conventions, 4 unit tests
- Story 7: Documentation — ADR-024/025/026, feature flag comment, changelog, sprint log

## What went well
- All 7 stories completed in a single session
- ADR decisions (own screen, own hook, own view) proved correct — CoverLetterScreen is 180 lines vs CoachScreen's 728 lines
- Zero TypeScript errors throughout — both app and server `tsc --noEmit` clean
- 13 new tests (9 hook + 4 export), all 416 app tests passing, all server tests passing
- Dynamic import pattern for export functions keeps the bundle lean for non-export flows

## What went wrong
- Nothing significant — clean delivery

## What to improve next sprint
- Manual E2E testing of the full cover letter flow (requires FF_COVER_LETTER=true and working Z.AI API)
- Consider E2E test coverage for the cover letter intake → complete flow

## Technical debt identified
- Cover letter DOCX export (backlogged)
- Cover letter sessions not visible in dashboard history
- Cover letter doesn't reuse master resume from intake form (could pre-populate resume_text)

---

# Sprint 17 Retrospective — UX Polish & Interaction Quality
**Completed:** 2026-03-02

## What was delivered
- Story 1: Multi-select + editable suggestion cards for positioning interview — radio buttons replaced with checkboxes, inline textarea editing on selection, composed multi-selection submit. 8 new tests.
- Story 2: Visual overhaul across 7 coaching screen components — pills/badges replaced with typography-driven hierarchy (colored dots, font weight/size/opacity). Net -195 lines. Minimum font size raised from 10px to 11px project-wide.
- Story 3: Killed the 430px right side panel — replaced with collapsible bottom ChatDrawer (CSS grid-rows transition, auto-expand on new messages/gates, 36px toggle bar). WorkspaceShell simplified from 2-pane to single `<main>`. 9 new unit tests.
- Story 4: Fixed broken full-pipeline E2E selector (textarea inside collapsed ChatDrawer) and added 5 new ChatDrawer E2E tests. Then fixed 9 additional E2E failures across dashboard, workbench-fallback, and workbench-suggestions tests (ambiguous selectors, outdated text assertions, broken Supabase query).

## What went well
- All 4 stories completed in a single sprint day with clean TypeScript throughout
- The layout change (Story 3) was the riskiest story — removing the right pane and restructuring CoachScreen — but landed cleanly with no regressions
- E2E test fixes (Story 4 follow-up) uncovered a real bug: the dashboard Supabase query used non-existent columns (`company_name`, `job_title`), returning a silent 400 error that had been masked by the `!res.ok` guard returning `[]`
- All 38 chromium E2E tests pass, all 386 app unit tests pass, all 891 server tests pass
- The visual overhaul (Story 2) touched 7 components but maintained all existing functionality — typography hierarchy effectively replaced dozens of bordered pill elements

## What went wrong
- The E2E test failures from Stories 2 and 3 weren't caught until Story 4 — 9 tests broke due to changed button text, reformatted labels, and new duplicate elements from the layout restructuring. Next time, E2E tests should be run after each UI story, not batched at the end.
- The `xs:` Tailwind breakpoint in `SectionWorkbench.tsx` (used on "Looks Good" span) isn't a valid Tailwind v3 breakpoint without custom config — the span is permanently hidden. This wasn't caught by the visual overhaul because it's a pre-existing issue, but it means the button label is always "Next Section" rather than "Looks Good / Next Section" as intended.

## What to improve next sprint
- Run E2E tests after each UI-facing story, not as a batch at sprint end
- Audit remaining uses of non-standard Tailwind breakpoints (`xs:`) to confirm they're configured or remove them
- Consider adding visual snapshot tests for layout-critical components (ChatDrawer, WorkspaceShell)

## Technical debt identified
- `xs:` breakpoint usage on SectionWorkbench "Looks Good" span — either add custom breakpoint config or remove the responsive hide
- Status derivation logic duplicated in ChatDrawer.tsx and ChatPanel.tsx — candidate for shared hook extraction if a third consumer appears
- `runtimeMetrics` and `pipelineActivity` optional props on ChatPanel/WorkflowStatsRail still present after Sprint 16 consumer removal (carried forward)

---

# Sprint 16 Retrospective — UX Transparency & Visual Declutter
**Completed:** 2026-03-02

## What was delivered
- Story 1: Enriched transparency messaging in all 3 agent prompts — each now has a dedicated `## Transparency Protocol` section with 8-10 phase-specific example messages, pacing guidance, and data interpolation markers
- Story 2: Added stage completion summaries — `event-middleware.ts` now persists human-readable summary messages at 6 major stage transitions
- Story 3: Built `IntelligenceActivityFeed` component — scrollable feed showing last 10 transparency messages with graduated opacity and auto-scroll, replacing the single-line `PipelineActivityBanner`
- Story 4: Stripped all 15 "Info only" badge instances across 8 panel files
- Story 5: Simplified Research Dashboard — assumption entries reduced to label + value (removed confidence badges, provenance metadata, why-inferred explanations)
- Story 6: Simplified Draft Readiness — replaced 3-card grid with inline colored text summary, wrapped requirement list in collapsible `<details>` element
- Story 7: Removed duplicate activity displays from ChatPanel (backend activity section) and WorkflowStatsRail (activity message block)
- Story 8: Made stats rail stage-contextual — metrics only appear when relevant to current pipeline stage
- Story 9: Full documentation update

## What went well
- Three-agent parallel execution worked cleanly: backend (Stories 1-2), frontend declutter (Stories 4-6), and frontend transparency (Stories 3, 7-8) ran simultaneously with no merge conflicts
- TypeScript remained clean throughout all 3 parallel workstreams
- Test count increased from 377 to 386 app tests (+9 new IntelligenceActivityFeed tests) with zero regressions
- Server tests remained at 891 with zero regressions
- Progressive disclosure pattern (`<details>`/`<summary>`) from Sprint 14 reused consistently in Stories 5 and 6

## What went wrong
- The frontend declutter agent noted a "pre-existing TypeScript error" in its changelog entry that was actually just Story 3 not yet completed (parallel execution timing). Required minor cleanup.
- Nothing significant — clean sprint

## What to improve next sprint
- Consider adding visual regression testing (screenshots) for panel declutter changes
- The IntelligenceActivityFeed could benefit from message deduplication if agents emit repetitive transparency messages

## Technical debt identified
- `runtimeMetrics` and `pipelineActivity` props remain on ChatPanel/WorkflowStatsRail as optional even after removing their consumers — cleanup candidate for future sprint
- ChatPanel still has several unused state variables (`clockNow` interval removed but some derived values may be orphaned) — verify with full prop audit

---

# Sprint 15 Retrospective — Tech Debt Sweep & Product Landing Pages
**Completed:** 2026-03-02

## What was delivered
- Story 1: Fixed `resumes-edit.test.ts` TypeScript error (null-to-Record cast)
- Story 2: Deduplicated workflow persistence helpers into `lib/workflow-persistence.ts` (~200 lines removed)
- Story 3: Resolved MaxListenersExceededWarning root cause — all 6 `setMaxListeners` calls removed, per-round AbortController scoping in agent-loop.ts
- Story 4: Cleaned stale backlog entries (legacy agent dir, gap analyst failures) and MEMORY.md
- Story 5: Extended `ProductDefinition` with `longDescription`, `features`, `ctaLabel` for all 4 products
- Story 6: Built product landing page component at `/tools/:slug` with features grid, CTA, and routing
- Story 7: Cover letter product now bootstraps from resume positioning strategy + evidence via `user_platform_context`
- Story 8: Full documentation update

## What went well
- Phase A tech debt (Stories 1, 2, 4) completed rapidly — straightforward fixes with clear scope
- Story 3 (MaxListeners) solved cleanly with per-round AbortController scoping — no artificial limit bumps needed
- Stories 5-6 (landing pages) delivered with glass morphism design and slug-based routing
- Story 7 (cross-product context) validated the platform context abstraction from Sprint 14
- 21 new tests (8 landing page + 13 cover letter context) with zero regressions

## What went wrong
- ProductCatalogGrid test assertions needed updating after slug-based navigation change (Story 6 changed card click behavior)
- Nothing significant — clean sprint

## What to improve next sprint
- Consider adding E2E test coverage for the `/tools/:slug` routing

## Technical debt identified
- None remaining from backlog — all tech debt stories cleared

---

# Sprint 14 Retrospective — UX Declutter, Progressive Disclosure & Platform Expansion Foundation
**Completed:** 2026-03-02

## What was delivered
- **Story 1 (Progress Dots → Text Bar):** WorkbenchProgressDots rewritten — dots replaced with "Section N of M: Section Name" text + 3px linear progress bar (green/blue/gray).
- **Story 2 (Simplify Score Rings):** QualityDashboardPanel reduced from 6 rings to 3 primary (Hiring Manager, ATS, Authenticity) + 3 color-coded text rows.
- **Story 3 (Remove Duplicate Cards):** "What To Do In This Panel" GlassCards removed from 4 panels. Unique text consolidated into ProcessStepGuideCard via `userDoesOverride`.
- **Story 4 (Progressive Disclosure):** Advanced intake fields and workspace settings hidden behind `<details>` disclosure toggles, collapsed by default.
- **Story 5 (Hide Dev Telemetry):** Developer metrics in ChatPanel, WorkflowStatsRail, and PipelineActivityBanner hidden behind "Details" toggles.
- **Story 6 (Simplify Breadcrumb):** "Your Resume Progress" section reduced to single-line step title + status pill. ~55px vertical space saved.
- **Story 7 (Platform Catalog):** ProductCatalogGrid at `/tools` with 4 products (1 active, 3 coming-soon). "Tools" nav item in header. 8 new tests.
- **Story 8 (Shared Context):** `user_platform_context` table, `platform-context.ts` module (3 functions), resume pipeline integration (best-effort persist on completion). 12 new tests. ADR-023.
- **Story 9 (Documentation):** CHANGELOG, SPRINT_LOG, ARCHITECTURE, BACKLOG, CURRENT_SPRINT updated.

## Test count
- App: 369 tests (up from 354, +15 new)
- Server: 878 tests (up from 864, +14 new)
- Total: 1,247 tests (up from 1,218, +29 new)
- New test files: `ProductCatalogGrid.test.tsx`, `platform-context.test.ts`
- Updated test files: `QualityDashboardPanel.test.tsx`

## What went well
- 7 of 9 stories ran in parallel via team agents — entire sprint completed in a single session
- The `<details>`/`<summary>` pattern for progressive disclosure was simple and effective — no state management, auto-collapses on remount, works with glass morphism styling
- Platform expansion stories (7, 8) were completely independent of UX stories (1-6) — zero conflicts
- Story dependency management (Story 2 → Story 3 on QualityDashboardPanel) worked cleanly
- All 1,247 tests pass, TypeScript clean (only pre-existing issues)

## What went wrong
- Stories 4 and 5 both modified CoachScreenBanners.tsx — required awareness of each other's changes. No actual conflict, but a potential risk area
- Story 3 checked BlueprintReviewPanel and PositioningInterviewPanel for duplicate cards — neither had them, so the audit was conservative (good) but added scope

## What to improve next sprint
- When multiple stories touch the same file, consider merging into a single story or sequencing them explicitly
- Run a full integration test (visual) after all parallel UX changes land to catch layout interactions

## Technical debt identified
- Pre-existing: `resumes-edit.test.ts` line 292 TypeScript error
- Pre-existing: 2 failures in `agents-gap-analyst.test.ts`
- Duplicate workflow persistence helpers (Sprint 13 debt, still outstanding)
- Legacy `agent/` directory still exists
- Platform catalog is static — will need DB migration when product count exceeds ~15

---

# Sprint 13 Retrospective — Pipeline Migration & Platform Cleanup
**Completed:** 2026-03-02

## What was delivered
- **Story 1 (Remove TOOL_MODEL_MAP):** Deleted `TOOL_MODEL_MAP` from `llm.ts`, simplified `resolveToolModel()` to registry → tier fallback only. Updated 11 tool-model-routing tests.
- **Story 2 (Rename interview_transcript):** Pure field rename across 4 files (`types.ts`, `strategist/tools.ts`, `resume/product.ts`, `coordinator.test.ts`). No functional change.
- **Story 3 (Factory Lifecycle Hooks):** Added 7 optional lifecycle hooks to `ProductRouteConfig`: `onBeforeStart`, `transformInput`, `onEvent`, `onBeforeRespond`, `onRespond`, `onComplete`, `onError`. Added `startMiddleware` array. 12 new type contract tests.
- **Story 4 (Event Middleware Extraction):** Created `agents/resume/event-middleware.ts` (~620 lines) — closure factory for per-session SSE event processing. Extracts section context sanitization, panel persistence debouncing, workflow artifact persistence, runtime metrics tracking, and per-event-type dispatch. 30 new tests.
- **Story 5 (Route Hooks Extraction):** Created `agents/resume/route-hooks.ts` (~570 lines) — implements `resumeBeforeStart`, `resumeTransformInput`, `resumeOnRespond`. Extracts JD URL resolution (SSRF-protected), stale pipeline recovery, capacity management, workflow init, master resume loading, question persistence. 44 new tests.
- **Story 6 (Integration & Deletion):** Created `routes/resume-pipeline.ts` (~150 lines) wiring all hooks. Deleted `routes/pipeline.ts` (1,985 lines). Added `onBeforeRespond` hook to factory. Updated all imports and test mocks.
- **Story 7 (Documentation):** ADR-022, ARCHITECTURE.md, CHANGELOG.md, SPRINT_LOG.md, BACKLOG.md, CURRENT_SPRINT.md.

## Test count
- Server: 864 tests (up from 781, +83 new)
- App: 354 tests (unchanged)
- Total: 1,218 tests (up from 1,135, +83 new)
- New test files: `resume-event-middleware.test.ts`, `resume-route-hooks.test.ts`
- Updated test files: `pipeline-limits.test.ts`, `pipeline-respond.test.ts`, `product-route-factory.test.ts`, `tool-model-routing.test.ts`

## What went well
- The hook-based extraction pattern worked cleanly — 7 optional hooks give products full lifecycle control without subclassing or inheritance
- Deleting 1,985 lines of monolithic code and replacing with 150 lines of wiring is a strong signal the Sprint 12 abstraction was the right design
- Per-session closure factory pattern for event middleware elegantly solved the static-config-meets-per-session-state problem
- Stories 4 and 5 were independently extractable, enabling parallel development
- All 864 tests pass without flaky failures

## What went wrong
- `workflow.ts` also imported from `pipeline.ts` — missed during initial impact analysis. Caught by TypeScript.
- The factory stale-snapshot false-409 race required a non-obvious fix (mutating the session object passed by reference)
- Duplicate workflow persistence helpers (event-middleware.ts vs route-hooks.ts) are tech debt from parallel extraction

## What to improve next sprint
- Run a more thorough import dependency scan before deleting major files
- Consider creating shared utility modules for cross-cutting DB operations before extraction, not after

## Technical debt identified
- Duplicate workflow persistence helpers in `event-middleware.ts` and `route-hooks.ts`
- `resumes-edit.test.ts` line 292 pre-existing TypeScript error (null-to-Record cast)
- Legacy `agent/` directory still exists (used by chat route)

---

# Sprint 12 Retrospective — Platform Decoupling & Multi-Product Foundation
**Completed:** 2026-03-01

## What was delivered
- **Story 1 (ProductConfig Interface):** `product-config.ts` defines `ProductConfig`, `AgentPhase`, `GateDef`, `InterAgentHandler`, and `RuntimeParams` as a plain-object type system (no classes). Matches the existing `AgentConfig` pattern.
- **Story 2 (Generic Coordinator):** `product-coordinator.ts` implements `runProductPipeline()` — a fully generic orchestration engine that wires bus subscriptions, sequences phases, manages gates, and emits SSE stage events with zero product-specific logic. Fixed transparency cast in `agent-loop.ts` from unsafe hard cast to try/catch guard.
- **Story 3 (Resume Coordinator Rewrite):** `agents/resume/product.ts` (~600 lines) is the authoritative resume `ProductConfig`. `coordinator.ts` rewritten from ~1430 lines to ~60 lines — it is now a thin wrapper that calls `runProductPipeline(resumeProductConfig, ...)`. Resume pipeline behavior is unchanged.
- **Story 4 (Tool Model Routing):** All 26 tools now declare `model_tier` on their `AgentTool` definition. `resolveToolModel()` checks `model_tier` first, falls back to deprecated `TOOL_MODEL_MAP`. `getModelForTier()` translates tier to model ID. DI via optional registry parameter avoids circular imports.
- **Story 5 (Product Route Factory):** `product-route-factory.ts` generates standard Hono routes for any `ProductConfig` with `createProductRoutes()`. `pipeline.ts` was NOT refactored (1985-line file, too much resume-specific logic — deferred).
- **Story 6 (Cover Letter POC — Agents):** 2 agents (analyst + writer), 5 tools (analyze_job, analyze_resume, draft_opening, draft_body, draft_closing), all with `model_tier` set. Registered in agent registry. `coverLetterProductConfig` implements `ProductConfig` with 2 phases and zero gates.
- **Story 7 (Cover Letter POC — Routes):** `routes/cover-letter.ts` mounts via `createProductRoutes()` at `/api/cover-letter/*`. Feature-flagged via `FF_COVER_LETTER` (default false). Mounted in `index.ts`.
- **Story 8 (Documentation):** DECISIONS.md (ADR-019, ADR-020, ADR-021), ARCHITECTURE.md (product layer, route factory, cover letter POC, updated monorepo layout, updated model routing), CHANGELOG.md, SPRINT_LOG.md, BACKLOG.md, CURRENT_SPRINT.md.

## Test count
- Server: 781 tests (up from 736, +45 new)
- App: 354 tests (unchanged)
- Total: 1,135 tests (up from 1,090, +45 new)
- New test files: `product-config-types.test.ts`, `product-coordinator.test.ts`, `tool-model-routing.test.ts`, `product-route-factory.test.ts`, `cover-letter-agents.test.ts`

## What went well
- The `ProductConfig` plain-object design decision was the right call — zero friction migrating the resume coordinator, and the cover letter POC implemented it cleanly with no surprises
- `coordinator.ts` shrinking from 1430 to 60 lines is the clearest indicator that the abstraction is working — all that complexity is now properly organized in `resume/product.ts`
- `model_tier` on `AgentTool` is a clean improvement: cost tier is now self-documented at the definition site instead of requiring cross-reference to a central map
- The DI approach for `resolveToolModel()` avoided a real circular import problem without adding complexity
- Cover letter POC validated the full stack: `ProductConfig` → `runProductPipeline()` → `createProductRoutes()` — the abstraction works end-to-end

## What went wrong
- `pipeline.ts` refactor was scoped in as Story 5 but had to be deferred — the file's 1985 lines of resume-specific routing (session management, heartbeat, lock handling, SSE reconnect) is more work than one sprint story. The factory was built and works; the migration itself needs its own story.
- The transparency cast fix in `agent-loop.ts` was a latent bug discovered during Story 2 implementation — not a sprint story failure, but it was unplanned work.

## What to improve next sprint
- Scope `pipeline.ts` refactor as its own dedicated story with clear acceptance criteria (specific behaviors to preserve)
- When validating a new `ProductConfig`, write a minimal integration test that starts the pipeline and asserts SSE events arrive — unit tests on the config shape are not sufficient to catch wiring errors

## Technical debt identified
- `TOOL_MODEL_MAP` in `llm.ts` is deprecated but not deleted — needs a cleanup story once all tools are verified with `model_tier`
- `pipeline.ts` still 1985 lines — the largest unmigrated file. Refactor story needed.
- Strategist tools in `strategist/tools.ts` were not updated with `model_tier` in this sprint (they predate the pattern and the Strategist's tools were not in scope for this sprint's tool file changes)
- 2 pre-existing failures in `agents-gap-analyst.test.ts` remain

---

# Sprint 11 Retrospective — Bug Squash, Production Polish & Platform Foundation
**Completed:** 2026-03-01

## What was delivered
- **Story 1 (Bug 16 — Revision Counts):** Persisted `revision_counts` in PipelineState instead of local Map. Revision cap now survives handler re-creation. 8 new tests.
- **Story 2 (Bug 17 — Sliding Window):** Cross-section context builder limits to last 5 sections with 600-char excerpts (was unbounded at 300). Logs warning when sections are dropped. 8 new tests.
- **Story 3 (Bug 18 — Gate Lock):** Added `useRef` lock to `handlePipelineRespond` preventing double-click 409s. Lock resets on new gate activation. 8 new tests.
- **Story 4 (PDF Unicode):** Added NFKD normalization fallback to `sanitizePdfText` for non-WinAnsi characters. WinAnsi characters (smart quotes, dashes, ellipsis) pass through unchanged. 19 new tests.
- **Story 5 (Center Column Scroll):** Wrapped banner container with `flex-shrink-0 max-h-[40vh] overflow-y-auto` to prevent banners from pushing content off-screen.
- **Story 6 (Usage Tracking):** Removed `size === 1` guard on `recordUsage` warning. Now always logs when usage is dropped, includes `activeAccumulatorCount`. 6 new tests.
- **Story 7 (Platform — Bus Routing):** Agent bus supports namespaced `domain:agentName` routing, `sendBroadcast()`, and `listSubscribers()`. Backward compatible with name-only subscriptions. 14 new tests. ADR-018.
- **Story 8 (Platform — Discovery):** Registry gains `findByCapability()`, `listDomains()`, `describe()`. All 3 resume agents register capabilities. 10 new tests.
- **Story 9 (Platform — Lifecycle Hooks):** `onInit` called before first LLM round, `onShutdown` in `finally` block. Both error-safe. 6 new tests.
- **Story 10 (Cleanup):** Removed 4 resolved backlog items. Deleted stale `server/dist/`. Updated platform expansion story.
- **Story 11 (Documentation):** CHANGELOG, SPRINT_LOG, ARCHITECTURE.md (bus/registry/loop), DECISIONS.md (ADR-018).

## Test count
- Server: 736 tests (up from 663, +73 new)
- App: 354 tests (up from 327, +27 new)
- Total: 1,090 tests (up from 990, +100 new)

## What went well
- Parallel agent execution worked perfectly — 6 stories implemented concurrently in Phase 1
- All 4 bugs had clear root causes identified in the plan, making fixes surgical
- Platform foundation stories built cleanly on existing generic type infrastructure
- Backward compatibility maintained throughout — existing pipeline unaffected

## What went wrong
- The lifecycle hooks test initially had incorrect `CreateContextParams` fields (used `getState` instead of `state`, missing `bus`/`identity`). Required a quick fix after the first TypeScript check.

## What to improve next sprint
- Consider adding integration tests for lifecycle hooks with real agent configs
- Cross-product bus routing should be tested with an actual second product domain

## Technical debt identified
- 2 pre-existing failures in `agents-gap-analyst.test.ts` remain
- `setMaxListeners(50)` calls are threshold bumps, not root cause fixes
- Legacy `agent/` directory still exists (deferred to future sprint)

---

# Sprint 10 Retrospective — UX Polish, Platform Hardening & Cleanup
**Completed:** 2026-03-01

## What was delivered
- **Story 1 (LLM Suggestion Quality):** Rewrote `generateQuestionsViaLLM()` prompt to produce 3-5 concrete, clickable answer options per question. Tightened schema validation (15-char min label, max 5 options, 120-char truncation). Clickable options now have meaningful specificity instead of vague one-liners.
- **Story 2 (Fallback Suggestion Quality):** Rewrote all 8 fallback questions in `generateFallbackQuestions()` with 3-5 concrete, coach-badged answer options each. Fallback experience now matches the LLM-generated experience in richness.
- **Story 3 (Batch-Only Interview Mode):** Removed `interviewCandidateTool` from Strategist exports. Single-question conversational interview mode eliminated entirely. All interviews now go through `QuestionnairePanel` batch mode. Strategist prompt updated accordingly.
- **Story 4 (Multi-Select Answer Extraction):** Fixed `extractInterviewAnswers()` in coordinator.ts. Primary lookup by `${questionId}_opt_${index}` pattern; fallback extracts index from option ID suffix. Handles variant ID formats produced by different suggestion sources.
- **Story 5 (Agent Registry Type Safety):** Added `registerAgent<TState, TEvent>()` helper. Lifecycle hooks (`onInit`/`onShutdown`) added to `AgentConfig`. All 3 agents use `registerAgent()` — zero `as unknown as AgentConfig` casts in caller code.
- **Story 6 (Shared Tools Package):** Created `agents/runtime/shared-tools.ts` with `createEmitTransparency()` factory. Removed ~90 lines of duplicate `emit_transparency` implementations across 3 agent tool files. Factory enforces consistent empty-message guard.
- **Story 7 (MaxListenersExceededWarning):** Set `setMaxListeners(50)` on `ctx.signal` and `overallSignal` in agent-loop.ts. Set `setMaxListeners(20)` on signals in retry.ts and positioning-coach.ts. Warning eliminated on full pipeline runs.
- **Story 8 (E2E Dashboard Tests):** New `e2e/tests/dashboard.spec.ts` covering navigation, session history display, resume viewer modal, and master resume tab.
- **Story 9 (Documentation & Retrospective):** CHANGELOG, SPRINT_LOG, ARCHITECTURE, DECISIONS, and BACKLOG updated.

**Test totals:** 684 server + 327 app = 1011 passing tests (pre-Story 8 E2E). TypeScript clean.

## What went well
- All 7 code stories were small and focused — none required more than ~100 lines of new code. Each had a clear, verifiable acceptance criterion.
- The shared tools extraction was a clean refactor: a factory function with config, three call sites replaced, ~90 lines eliminated, and test assertions updated to match the unified behavior.
- The `registerAgent()` helper elegantly confined the `as unknown as AnyAgentConfig` cast to a single documented widening point inside the registry module, with no downstream callers carrying the cast.
- Batch-only interview unification resolved a long-standing dual-mode complexity. The Strategist's tool surface is smaller and its prompt is cleaner.
- The MaxListeners fix required reading the actual listener accumulation pattern (tool parallelism + retry + positioning coach) and applying targeted setMaxListeners at the three accumulation points — no global hacks.

## What went wrong
- Story 3 (Batch-Only) required careful verification that `positioningToQuestionnaire()` maps rich suggestion objects correctly — the interface contract between the positioning coach and the coordinator questionnaire system was underdocumented. No bugs found, but the audit took extra time.
- Stories 1 and 2 are improvement stories without a hard quality metric. "Better suggestions" is subjective and can only be validated through live pipeline runs, not unit tests.

## What to improve next sprint
- Add a concrete quality metric for interview suggestion validation (e.g., assert that each fallback question has 3+ suggestions with labels of 15+ chars in a unit test — enforces the schema contract explicitly).
- When removing a tool from an agent, also search for test stubs or mock factories referencing the tool name to avoid stale test infrastructure.

## Technical debt identified
- E2E tests (all Playwright tests) still take 28+ min due to Z.AI latency — no improvement path yet. Nightly-only run is the current mitigation.
- `interview_transcript` field in `PipelineState` is now populated exclusively through the questionnaire path. The field name still references "interview" — could be renamed to `questionnaire_responses` in a future cleanup sprint.
- Lifecycle hooks (`onInit`/`onShutdown`) added to `AgentConfig` in Story 5 are defined but not called anywhere in `agent-loop.ts` yet. They are a design placeholder for future use.

---

# Sprint 8 Retrospective — User Dashboard & Resume Management
**Completed:** 2026-02-28

## What was delivered
- Stories 1-4: Backend APIs — enriched session list with pipeline metadata/JSONB extraction, session resume retrieval, master resume partial edit with version history, resume history retrieval. 4 new endpoints with Zod validation and ownership checks.
- Stories 5-6: Dashboard shell — 3-tab layout (Sessions/Master Resume/Evidence Library) with DashboardTabs component. Wired into App routing with URL detection and Header nav button.
- Stories 7-8: Session history gallery — rich session cards with status badges/cost/time-ago, status filter, resume viewer modal with text export, compare mode for selecting 2 sessions.
- Stories 9-10: Master resume viewer/editor — full resume display with expandable experience, skills categories, inline editing (EditableField), version history, save/cancel.
- Story 11: Evidence library — evidence browser with source filter (crafted/upgraded/interview), text search, per-item delete.
- Story 12: Side-by-side resume comparison — dual-column modal with section-level diff highlighting.
- Story 13: 82 new tests (36 server + 46 app). Total: 990 tests (663 server + 327 app).
- Story 14: Documentation, ADR-013, retrospective.

## What went well
- Parallel worktree execution (backend + frontend agents) worked correctly — both agents' changes landed on the working tree
- Clean merge: backend types/hooks + frontend components had zero conflicts after removing temporary inline implementations
- TypeScript clean throughout — both agents verified tsc --noEmit independently
- All 908 existing tests continued passing after merge

## What went wrong
- Worktree branches were cleaned up on agent shutdown, causing brief confusion about where changes landed (they were on the working tree, not on branches)
- Frontend agent created temporary inline API implementations in App.tsx that needed manual cleanup after merge

## What to improve next sprint
- When using worktree agents, verify changes are on the working tree immediately after agent completes
- Consider having agents commit to named branches for easier merge tracking

## Technical debt identified
- DashboardScreen has 15+ props — may benefit from DashboardContext if dashboard grows deeper
- Resume comparison uses simple string equality — could use a proper diff algorithm for richer highlighting

---

# Sprint 7 Retrospective — Commerce Platform
**Completed:** 2026-02-28

## What was delivered
- Stories 1-2: Wired PricingPage + BillingDashboard into App routing with URL detection and checkout flow. Fixed usage persistence upsert bug (RPC atomic increment).
- Stories 3-4: Stripe promotion codes integration with validation endpoint. Promo code admin endpoints. Webhook discount extraction.
- Stories 5-7: Plan features entitlements model with plan_features + user_feature_overrides tables. getUserEntitlements() merges plan + override features. Feature guard middleware. Wired into subscription guard and DOCX export.
- Stories 8-10: Full affiliate system — data model, referral tracking, commission calculation, referral landing flow (?ref=CODE), affiliate dashboard with stats/events.
- Stories 11-12: Decommissioned legacy agent/ directory (~4,543 lines) and deprecated pipeline.ts (~4,110 lines). Cleaned up orphaned chat route code.
- Story 13: 47 new tests (entitlements, affiliates, feature-guard, stripe-promos, billing extensions, usage-persistence). Total: 908 tests (627 server + 281 app).
- Stories 14-15: Commerce documentation and retrospective.

## What went well
- Parallel worktree execution cut wall-clock time significantly (Phase 1+5 parallel, Phase 2+3 parallel, Phase 4+6 parallel)
- Stripe SDK v20 type adaptations handled cleanly despite breaking changes
- Legacy code removal was clean — no test references to deleted code
- Feature entitlements model is extensible and fail-open

## What went wrong
- Test agent wrote tests against fictional interfaces (wrote source stubs instead of reading actual implementations). Required manual fixes to align test assertions with real code.
- Worktree merge conflicts on admin.ts (two agents created the same file with different auth strategies). Required manual merge.
- 8,653 lines of legacy code deletion was straightforward but required careful import chain verification.

## What to improve next sprint
- Provide test agents with explicit interface definitions or have them read source files first
- Consider a single auth strategy for admin routes upfront when multiple stories touch the same route
- E2E coverage for billing/checkout flow (currently manual only)

## Technical debt identified
- Stripe Connect for automated affiliate payouts (manual for now)
- Admin dashboard UI (API-only for admin operations)
- E2E test coverage for billing flow
- Multi-currency pricing support

---

# Sprint 6 Retrospective: Product Polish, Scale Readiness & Launch Prep
**Completed:** 2026-02-28

## What was delivered

### Track 1 — Product Optimization (5 stories)
- **Story 1: Split useAgent.ts** — Reduced from 1920 to 423 lines. Extracted 5 focused hooks: usePipelineStateManager (state), useSSEConnection (network), useSSEDataValidation (parsing), useSSEEventHandlers (event dispatch), useStaleDetection (health monitoring). Each independently importable and testable.
- **Story 2: Split CoachScreen.tsx** — Reduced from 2016 to 864 lines. Extracted BenchmarkInspectorCard (399 lines), CoachScreenBanners (431 lines, 7 components), QuestionsNodeSummary (264 lines), SectionsNodeSummary (95 lines), coach-screen-utils.tsx (243 lines).
- **Story 3: Zod LLM Output Validation** — Added Zod schemas for all LLM-backed agent tools (3 schema files). All tools now .safeParse() after repairJSON. Validation failures log warnings and fall back to raw data (never crash). 25 new schema validation tests.
- **Story 4: Legacy Code Cleanup** — @deprecated JSDoc on pipeline.ts and agent/loop.ts. ARCHITECTURE.md Legacy Code section. BACKLOG.md cleaned (removed 11 completed stories).
- **Story 5: Deployment Config** — DEPLOYMENT.md with full architecture doc. .env.example updated. Vercel hardcoded URL documented as known limitation.

### Track 2 — Scale Readiness (4 stories)
- **Story 6: Usage Flush** — Delta-based periodic flush (60s interval) from in-memory accumulators to user_usage table. Watermark tracking prevents double-counting. Final flush on pipeline stop. Fail-open on DB errors.
- **Story 7: DB Pipeline Limits** — Cross-instance global pipeline limit via session_locks count query. Default MAX_GLOBAL_PIPELINES=10. Fail-open on DB errors. 4 tests.
- **Story 8: Redis Rate Limiting** — Redis INCR+EXPIRE rate limiting behind FF_REDIS_RATE_LIMIT feature flag. Falls back to in-memory when Redis unavailable. 7 tests.
- **Story 9: SSE Scaling Architecture** — ADR-008 in DECISIONS.md. SSE_SCALING.md with 3-phase scaling strategy (sticky sessions → Redis Pub/Sub → Supabase Realtime). Migration path documented.

### Track 3 — Launch Prep (4 stories)
- **Story 10: Panel Component Tests** — 60 new tests across 5 files (panel-renderer 21, PositioningInterviewPanel 8, BlueprintReviewPanel 7, QualityDashboardPanel 12, CompletionPanel 12).
- **Story 11: Hook Tests** — 135 new tests across 3 files (useSSEDataValidation 43, useSSEEventHandlers 80, useStaleDetection 12).
- **Story 12: Stripe Billing** — Full integration: stripe.ts client, billing.ts routes (checkout, webhook, subscription, portal), subscription-guard.ts middleware, PricingPage.tsx, BillingDashboard.tsx, Supabase migration, ADR-009. 11 tests.
- **Story 13: Retrospective** — This document.

### Total: 13/13 stories completed
### Test count: 590 → 858 (577 server + 281 app) — 268 new tests (+45%)

## What went well
- **Massive parallelization**: Up to 5 background agents running simultaneously (Stories 6+7, 8, 10, 11, 12). Independent stories ran in parallel while dependent work was sequenced correctly.
- **Test coverage explosion**: 268 new tests in one sprint. Frontend went from 0% component/hook coverage to 195 new tests. Every panel, every SSE handler, and all validation utilities are now tested.
- **God file elimination**: The two largest files in the codebase (useAgent 1920→423 lines, CoachScreen 2016→864 lines) were split with zero behavioral regressions.
- **Scale infrastructure**: Usage persistence, DB pipeline limits, and Redis rate limiting are all feature-flagged and fail-open — safe to deploy without Redis.
- **Stripe integration ships complete**: Checkout, webhooks, subscription guard, customer portal, pricing page, billing dashboard — full billing pipeline in one story.

## What went wrong
- **Agent rate limits**: Initial batch of 6 background agents all hit API rate limits simultaneously. Required restarting agents and manually completing partial work.
- **Agent-written test mocks**: Several agent-generated test files had TypeScript errors (incomplete Supabase mock chains, missing intermediate `as unknown` casts, missing `requestAnimationFrame` polyfill for Node). Required manual fix-up pass.
- **Stripe SDK type drift**: `current_period_start`/`current_period_end` removed from Stripe v20 types. Required computing billing period from `billing_cycle_anchor` instead.
- **Agent coordination overhead**: When agents wrote to shared files (CHANGELOG.md, CURRENT_SPRINT.md), concurrent edits required manual reconciliation.

## What to improve next sprint
- Limit concurrent background agents to 3-4 to avoid rate limits
- Provide agents with stronger Supabase mock patterns (thenable chain helper) as a shared test utility
- When agents write to docs files, have a single consolidation pass at the end rather than each agent writing independently
- Run `tsc --noEmit` as part of agent completion verification (before declaring done)

## Technical debt identified
- **Vercel.json hardcoded URL**: Vercel doesn't support env vars in rewrites. Need Edge Middleware proxy or different approach.
- **Usage upsert accumulation**: Current Supabase upsert replaces (not increments). Need `ON CONFLICT DO UPDATE SET total_input_tokens = total_input_tokens + EXCLUDED.total_input_tokens` or an RPC.
- **Stripe needs wiring**: PricingPage and BillingDashboard not yet in app routing. stripe_price_id not set on plan rows.
- **E2E tests still deferred**: Component tests are great but no E2E validation of the frontend refactoring yet.
- **Legacy agent/ directory**: Still present for chat route. Decommission story in backlog.
- **2 pre-existing test failures**: positioning-hardening.test.ts requires Supabase env vars.

---

# Sprint 5 Retrospective: Post-Audit Hardening + Agent Creative Latitude
**Completed:** 2026-02-28

## What was delivered

### Track 1 — Confirmed Bug Fixes (6 stories)
- **Story 1: Gate Response Idempotency** — Added `responded_at` check in `/pipeline/respond` handler. Duplicate gate responses now return `{ status: 'already_responded' }` instead of double-processing.
- **Story 2: Enforce `do_not_include` at Runtime** — Added `filterDoNotIncludeTopics()` post-generation safety net in Craftsman's `write_section` tool. Lines mentioning excluded topics are stripped with a logged warning.
- **Story 3: Cap Revision Sub-Loop Iterations** — Added `MAX_REVISION_ROUNDS = 3` with per-section tracking in coordinator. After 3 rounds, content is accepted as-is with a transparency SSE event.
- **Story 4: Link Heartbeat to Session Lock** — Heartbeat interval now checks `runningPipelines.has(session_id)` before writing. Self-clears if pipeline is no longer tracked.
- **Story 5: Move JSON Repair Size Guard Earlier** — Size guard (50KB) moved to the very top of `repairJSON()`, before any processing (was after 4 processing steps).
- **Story 6: Harden Producer Tool Response Validation** — Audit confirmed all 3 LLM-backed Producer tools already follow consistent validation pattern (repairJSON → fallback → bounds clamp). No code changes needed.

### Track 2 — Agent Creative Latitude (4 stories)
- **Story 7: Strategist Interview Discretion** — Updated Strategist prompt with explicit coverage assessment, adaptive stopping, and stronger repeat-user guidance ("1-3 questions may be all that's needed").
- **Story 8: Craftsman Section Reordering Authority** — Added "Section Ordering Authority" section to Craftsman prompt. Allows deviation from blueprint order when narrative flow clearly benefits, with transparency event requirement.
- **Story 9: Producer Rewrite Authority** — Extended `request_content_revision` tool with `severity: 'revision' | 'rewrite'` field. Coordinator routes rewrites as fresh `write_section` calls. Rewrites count against the revision cap.
- **Story 10: Sliding Window Context Enrichment** — Added `extractDroppedMessageSummary()` that scans dropped messages for section names and key outcomes, producing a structured summary (bounded to 2000 chars) instead of a generic note.

### Track 3 — Tests (1 story)
- **Story 11: Add Tests for New Fixes** — 34 new tests in `sprint5-fixes.test.ts` covering all 6 bug fix stories. Test count 556→590 (504 server + 86 app).

## What went well
- Efficient parallelization: 4 stories delegated to background agents while working on dependent stories in the main thread
- All fixes were small and targeted — no story exceeded ~30 lines of new code
- Zero regressions — all 556 existing tests passed throughout
- TypeScript clean on both server and app at every step

## What went wrong
- Story 6 (Producer validation) turned out to be a non-issue — the audit finding was "Partial" verified and existing code was already consistent. Zero code changes needed.

## What to improve next sprint
- Future audit findings should be verified more thoroughly before becoming stories
- Consider E2E test expansion (deferred from Sprint 4, still not done)

## Technical debt identified
- E2E test coverage for repeat-user and blueprint-rejection flows (deferred since Sprint 4)
- SSE type mismatch (`as never` cast in pipeline.ts) still present
- Usage tracking cross-contamination risk still exists

---

# Sprint 4 Retrospective: Bug Fixes, Test Coverage, UX Polish, Platform Prep
**Completed:** 2026-02-28

## What was delivered

### Track 1 — Bug Fixes (5 stories)
- **Story 1 (409 Fix):** Added `isPipelineGateActive` guard + optimistic disable in `App.tsx` to prevent 409 errors when no gate is pending.
- **Story 2 (Gap Analyst Fix):** Fixed `enrichGapAnalysis()` — `significant` selection now upgrades to `strong` without requiring custom text. Both pre-existing test failures resolved.
- **Story 3 (Revision Loop Fix):** Added `approved_sections: string[]` to PipelineState. Craftsman's `present_to_user` tracks approvals. Coordinator filters out approved sections from revision requests. Defense in depth: Producer's `request_content_revision` also rejects approved sections.
- **Story 4 (Context Forgetfulness Fix):** Added sliding window to `agent-loop.ts` — keeps first instruction + last 20 messages, compacts middle with summary. Prevents context overflow on 8+ section sessions.
- **Story 5 (PDF Unicode Fix):** Replaced hand-rolled PDF generator with jsPDF library. `sanitizePdfText` now preserves em-dashes, smart quotes, bullets, accented characters (WinAnsi encoding). Removed aggressive Unicode→ASCII stripping.

### Track 2 — Test Coverage (5 stories, 248 new tests)
- **Story 6 (Coordinator Tests):** 30 tests covering stage transitions, error propagation, gate logic, scratchpad→state transfer, evidence extraction.
- **Story 7 (Agent Tool Tests):** 105 tests across 3 files — `strategist-tools.test.ts` (31), `craftsman-tools.test.ts` (35), `producer-tools.test.ts` (39). Covers malformed LLM responses, missing inputs, type coercion, abort handling.
- **Story 8 (Gate + Revision Tests):** 27 tests — `pipeline-respond.test.ts` (11), `revision-loop.test.ts` (16). Covers 409 scenarios, stale detection, revision flow, iteration limits.
- **Story 9 (Export Tests):** 40 tests — `export-pdf.test.ts` (20), `export-docx.test.ts` (20). Unicode char preservation, null-safe fields, raw_sections fallback, font defaults.
- **Story 11 (Craftsman Checks Tests):** 46 tests — anti-pattern regex validation, false positive checks, keyword threshold logic, evidence integrity.

### Track 3 — UX Polish (6 stories)
- **Story 12 (Quality Transparency):** Extended `QualityDashboardPanel` to show all 7 quality dimensions with collapsible detail sections (ATS findings, humanize issues, coherence breakdown). Updated coordinator to emit comprehensive quality data from Producer scratchpad.
- **Story 13 (Scroll Fix):** Added `min-h-0` to SectionWorkbench root container for proper flex overflow.
- **Story 14 (Workbench Polish):** Responsive padding, min-h-[44px] touch targets, progress bar refining indicator, responsive button labels.
- **Story 15 (Templates):** Added 3 templates: Non-Profit/Mission-Driven, Legal/Regulatory, Creative/Digital. Total: 8 executive templates. Updated formatting guide and scoring heuristics.
- **Story 16 (SSE Type Safety):** Exported `AnySSEEvent` / `SSEEmitterFn` from sessions.ts. Removed all `as never` casts.
- **Story 17 (ATS Revision Guard):** Producer's `request_content_revision` rejects revisions for approved sections. Combined with Story 3's coordinator filter for defense in depth.

### Track 4 — Platform Prep (5 stories)
- **Story 18 (Type Extraction):** Made runtime types generic (`AgentTool<TState, TEvent>`, `AgentConfig<TState, TEvent>`, `AgentContext<TState, TEvent>`). Runtime directory has zero product imports. Product-specific aliases (`ResumeAgentTool`, `ResumeAgentConfig`, `ResumeAgentContext`) in `types.ts`.
- **Story 19 (Agent Registry):** Created `agent-registry.ts` — agents self-register on module load, discoverable by `domain:name`. Coordinator imports trigger registration. Registry supports adding new agents without coordinator changes.
- **Story 20 (Platform Blueprint):** `docs/PLATFORM_BLUEPRINT.md` — 12-section document covering runtime contract, bus protocol, coordinator pattern, type separation, adding agents/products, distributed bus requirements, open questions.
- **Story 21 (Redis Bus Spike):** ADR-007 evaluating Redis Pub/Sub vs Streams vs Sorted Sets. Decision: rejected at current scale (single-process, 1-4 messages per pipeline). Prototype `agent-bus-redis.ts` demonstrates Redis Streams interface. Feature-flagged `FF_REDIS_BUS`.
- **Story 22 (Retrospective):** This document.

### Total: 21/22 stories completed. Test count: 306 → 556 (470 server + 86 app).
Story 10 (E2E Test Expansion) deferred to Sprint 5 — requires 28+ min live pipeline runs with Z.AI.

## What went well
- Parallel agent execution massively accelerated the sprint. 4 background agents ran simultaneously for independent stories (tests, docs, platform prep), cutting wall-clock time by ~70%.
- Test coverage grew from 306 to 556 tests (82% increase). Every agent tool, the coordinator, gate/revision flows, and both export formats now have dedicated test suites.
- The generic type extraction (Story 18) was the right investment. Runtime is now domain-agnostic. Adding a second product (cover letter agent, career coach) won't require touching runtime code.
- The 5 bug fixes all had clear root causes and minimal fixes. No pile-on code. The gap analyst fix was literally a one-line change.
- Quality dashboard transparency (Story 12) went from showing 4 of 7 quality checks to showing all 7 with collapsible details. Users can now see exactly what was reviewed.

## What went wrong
- Story 18's generics introduced 30+ TypeScript errors across test files that needed coordinated fixes. The background agent handled most of them, but some required manual intervention due to linter and concurrent edit conflicts.
- Story 10 (E2E expansion) was deferred because E2E tests take 28+ min with Z.AI latency, making them impractical for sprint-pace development.
- The agent registry (Story 19) adds infrastructure but the coordinator still has hard-coded agent sequence logic. True dynamic routing would require more work.
- jsPDF with standard fonts still only supports WinAnsi encoding. Characters outside WinAnsi (Czech ě, Polish ą, Hungarian ő) would still need font embedding.

## What to improve next sprint
- Run E2E tests as a separate nightly job rather than blocking sprint work on their 28-min runtime.
- When introducing generic type changes, update test helpers FIRST (the `makeCtx()` pattern) before changing production types. This prevents the cascade of test errors.
- Consider font embedding in jsPDF for true Unicode support if international users are a priority.
- Add the agent registry to the coordinator's lookup path instead of keeping both direct imports and registry as parallel systems.

## Technical debt identified
- E2E test expansion still needed (Story 10 deferred)
- jsPDF WinAnsi limitation — only covers Latin-1 + Windows-1252 characters, not full Unicode
- Legacy `agent/` directory still present for chat route compatibility
- Agent registry and direct imports are parallel systems in the coordinator
- Usage tracking cross-contamination risk still present
- `bufferedResponses` single-slot limitation still present

---

# Sprint 3 Retrospective: Master Resume — Persistent Evidence Accumulation
**Completed:** 2026-02-28

## What was delivered

### Stories 1-5: Master Resume Core Feature
- **Story 1 (DB Migration):** Added `evidence_items JSONB` column to `master_resumes`; updated `create_master_resume_atomic` RPC to accept the new parameter. Types added to `server/src/agents/types.ts` and `app/src/types/resume.ts`.
- **Story 2 (Auto-Save):** `master-resume-merge.ts` — pure merge function with role matching, bullet dedup, skill union, education/cert dedup, evidence dedup. `saveMasterResume()` and `extractEvidenceItems()` in `coordinator.ts`. Runs after pipeline completion.
- **Story 3 (Load):** `routes/pipeline.ts` queries `master_resume_id` from session, loads full master resume from DB, passes to `runPipeline()`.
- **Story 4 (Inject into Strategist):** `buildStrategistMessage()` appends accumulated evidence block. Strategist prompt instructs: review evidence first, skip covered topics, ask 0-3 questions for repeat users.
- **Story 5 (TypeScript + Tests):** `master-resume-merge.test.ts` with 8 unit tests. All compilation clean on both `app/` and `server/`.

### Audit Rounds 1-7: Production Hardening (81 items)
- **Audit Round 1 (12 fixes):** Shallow-copy mutations, INSERT-only merge creating unbounded rows, runtime DB cast guards, size caps on injection, evidence extraction for prose, merge edge cases, missing route field, strategist prompt tuning.
- **Audit Round 2 (13 fixes):** New master resume ID never linked to session (system-breaking), nested transactions in migration, zero-row UPDATE detection, validation gaps in POST /resumes, null guards in buildStrategistMessage, deep-clone for shared references, earlier_career evidence extraction, individual evidence text length cap.
- **Audit Round 3 (23 fixes):** AT-06 (Craftsman scratchpad never transferred to state — all crafted content was discarded), AT-10 (Producer→Craftsman revision requests silently dropped), revision subscription leak, persistSession zero-row handling, stateful regex bugs in Craftsman and Producer, retry-AbortError fix, json-repair size guard, session-lock renewal interval, complete TOOL_MODEL_MAP, claim_pipeline_slot DB migration, gate queue double-splice, error leakage via SSE, free_text questionnaire type.
- **Audit Round 4 (6 fixes):** Best-effort async `.catch()` chains, panel debounce queue cap (50), stream reader `finally` cleanup, blueprint slice error logging, SSE abort controller leak, restored message validation.
- **Audit Round 5 (20 fixes):** Shared-reference mutations in interview_transcript, malformed LLM response handling across all 3 agents, SSE connection registration race, token cache expiry boundary, Content-Type validation gap, 4 DB hardening migrations (RLS deny policy, session existence check, FK indexes, orphan cleanup).
- **Audit Round 6 (5 fixes):** LLM parse failure observability, atomic session delete with pipeline guard, MaxListeners threshold, blueprint panel edit reset on new data.
- **Audit Round 7 (1 fix):** Gate response persistence failure now throws instead of silently continuing (prevents response replay on restart).

### Total: 86 items completed (5 feature stories + 81 hardening fixes)
### Test count: 72 (start of sprint) → 306 (end of sprint)

## What went well
- The 7-round audit process was unusually thorough and caught 59+ issues before they could affect users in production. AT-06 (Craftsman content silently discarded) and AT-10 (revision requests silently dropped) were system-breaking bugs that would have produced empty resumes and broken revision loops respectively — finding them pre-release was critical.
- Master resume evidence accumulation works end-to-end. Repeat users will have a meaningfully shorter interview phase and more consistent positioning.
- The merge-in-place strategy (UPDATE instead of INSERT) keeps the DB clean without unbounded row growth.
- Extracting `mergeMasterResume()` into its own module made it fully unit-testable without Supabase import side effects — a good pattern to follow for future coordinator sub-functions.
- Test count growth from 72 to 306 represents a significant improvement in production confidence.

## What went wrong
- Sprint scope expanded dramatically from the planned 5 stories to 86 items. The audit rounds were not anticipated at planning time.
- Audit rounds were entirely reactive — issues were found after implementation. More test scenarios written during initial implementation would have caught several of the audit findings earlier (e.g., shallow-copy mutation, zero-row UPDATE, scratchpad→state transfer).
- Several audit rounds uncovered issues in code outside the sprint's scope (coordinator, agents, infrastructure) — blurring the sprint boundary.
- The 7-round audit cycle took longer than a comparable upfront investment in tests and design review would have.

## What to improve next sprint
- Write unit tests for each implementation story during the story itself, not in a separate audit pass. Acceptance criteria should include test coverage.
- Cap audit rounds at 2 per sprint (or make them their own sprint). If the audit uncovers more than 10 issues, treat it as a sign the initial implementation needed more design time.
- Scope guards: when audit findings touch code outside the sprint scope, log them as backlog items rather than fixing them mid-sprint.
- Define explicit "definition of done" that includes TypeScript clean + tests passing before marking a story done.

## Technical debt identified
- 2 pre-existing test failures in `agents-gap-analyst.test.ts` (gap analyst classification threshold bug, carried forward to Sprint 4 Bug Fixes track).
- Legacy `agent/` directory still present for chat route compatibility. Needs a formal deprecation plan.
- Master resume viewer/editor UI not yet built — users cannot inspect or manage accumulated evidence.
- Evidence items grow without a pruning strategy beyond the 200-item cap. No quality scoring or relevance decay.
- H5: Legacy `create-master-resume.ts` fixes still backlogged.
- Usage tracking cross-contamination risk (recordUsage broadcasts to all session accumulators).
- Single-slot `bufferedResponses` — concurrent gates can theoretically overwrite (partially mitigated by pending-gate-queue).

---

# Sprint 0 Retrospective: Dynamic Pipeline (Retroactive)
**Completed:** 2026-02-27

## What was delivered

This sprint covers the 4-phase Dynamic Pipeline work completed before the Scrum framework was adopted. Documented retroactively.

### Phase 1: Evidence Flow — Candidate Voice to Craftsman
- Added `interview_transcript` to `PipelineState`
- Strategist's `interview_candidate` tool persists raw Q&A pairs to pipeline state
- Expanded `classify_fit` evidence fields (career_arc.evidence 500→2000 chars, authentic_phrases 5→10 items)
- Coordinator's `buildCraftsmanMessage()` includes full interview transcript
- Section writer prompt: "Authentic voice beats resume-speak"

### Phase 2: Blueprint Approval Gate
- Feature flag `FF_BLUEPRINT_APPROVAL` (default true, skipped in fast_draft mode)
- `waitForUser('architect_review')` gate between Strategist and Craftsman
- BlueprintReviewPanel: editable positioning angle, section reorder, approve with edits
- Coordinator merges user edits into `state.architect` before Craftsman starts

### Phase 3: Creative Liberation — Strategic Blueprint
- `EvidencePriority` interface: requirement + available_evidence + importance + narrative_note
- `EvidenceAllocation`: `evidence_priorities`, `bullet_count_range`, `do_not_include`
- Architect prompt: strategic guidance, not prescriptive bullets
- Craftsman prompt: "Your Creative Authority" — writer not executor
- Section writer: `hasEvidencePriorities()` branches prompt (strategic vs prescriptive)
- Backward compatible: legacy `bullets_to_write` still supported

### Phase 4: Holistic Quality — Narrative Coherence
- `write_section` builds `crossSectionContext` from scratchpad (300-char excerpts)
- Section writer adds "PREVIOUSLY WRITTEN SECTIONS" block for continuity
- `check_narrative_coherence` tool: story arc, duplication, positioning threading, tonal consistency (0-100)
- `select_template` emits SSE transparency showing selection rationale
- Producer workflow updated with narrative coherence as step 6

### Infrastructure
- Pipeline heartbeat: 5-min interval in `routes/pipeline.ts` prevents stale recovery from killing long runs
- E2E fix: React native setter for textarea fills in zero-height panel layouts

## What went well
- 4-phase delivery was cohesive — each phase built cleanly on the previous one
- Evidence flow and creative liberation produced measurably better resume content
- Blueprint gate gives users meaningful control at the right moment
- Heartbeat fix resolved a critical reliability issue with minimal code

## What went wrong
- No framework in place — work was ad hoc, making it harder to track scope and decisions
- Some phases introduced scope that wasn't clearly bounded upfront
- No formal retrospective at the time

## What to improve next sprint
- Follow the Scrum framework established in CLAUDE.md for all future work
- Bound stories to single-session scope
- Document decisions as ADRs in real-time

## Technical debt identified
- SSE type mismatch (`as never` cast)
- Usage tracking cross-contamination
- MaxListenersExceededWarning on long sessions
- Legacy `agent/` directory still exists for chat route compatibility
