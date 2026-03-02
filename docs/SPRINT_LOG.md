# Sprint Log — Resume Agent

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
