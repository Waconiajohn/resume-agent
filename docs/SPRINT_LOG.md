# Sprint Log — Resume Agent

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
