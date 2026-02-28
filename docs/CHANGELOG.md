# Changelog — Resume Agent

## 2026-02-28 — Session: Sprint 3 Audit Round 5 — Deep Production Hardening

**Sprint:** 3 | **Stories:** 20 fixes from 4-agent deep audit (68 findings reviewed, 4 false positives)
**Summary:** Fixed 2 critical shared-reference mutations in Strategist interview transcript, hardened all 3 agent tool files against malformed LLM responses and unsafe type casts, fixed SSE connection registration race, token cache expiry boundary bug, Content-Type validation gap, and added 4 DB hardening fixes (RLS policy, existence checks, FK indexes, orphan cleanup).

### Changes Made

#### Agent Tools — Critical/High Fixes
- `server/src/agents/strategist/tools.ts` — Clone interview_transcript array before mutation (both single and batch tools). Guard split() on non-string answers in classify_fit. Bounds-check experience[0] array access. Type-guard interview answer count. Validate interview category against enum whitelist.
- `server/src/agents/craftsman/tools.ts` — Validate self_review parsed response has required fields (score as number, issues as array). Type-check cross-section context content before slice.
- `server/src/agents/producer/tools.ts` — Null-guard blueprint.age_protection before accessing .flags. Bounds-check template scores array before [0] access.

#### Infrastructure Fixes
- `server/src/routes/sessions.ts` — Move SSE addSSEConnection after successful initial writeSSE to prevent dead emitter registration on connection failure.
- `server/src/lib/pending-gate-queue.ts` — Delete legacy buffered_gate/buffered_response fields after migrating to queue, preventing unbounded re-migration.
- `server/src/middleware/auth.ts` — Early return for already-expired tokens before Math.max floor; prevents caching expired JWTs for 1 second.
- `server/src/lib/http-body-guard.ts` — Require explicit application/json Content-Type; reject missing Content-Type with 415.

#### Frontend Fixes
- `app/src/hooks/useAgent.ts` — Clear staleCheckIntervalRef in sessionId change effect to prevent orphaned intervals.
- `app/src/lib/export-docx.ts` — Type-guard raw_sections access with typeof string check.
- `app/src/lib/export-pdf.ts` — Null-safe fallbacks for experience title, company, start_date, end_date.

#### Database Migration
- `supabase/migrations/20260228140000_audit_round5_db_hardening.sql` — Session locks deny-all RLS policy. next_artifact_version session existence check. FK indexes on 3 workflow tables. Orphaned master_resume_history cleanup.

### Decisions Made
- SSRF DNS rebinding (pipeline.ts) confirmed false positive — assertPublicHost already re-validates on each redirect iteration
- Panel renderer resetKey already includes panelType — false positive
- toolCleanupTimersRef already tracks timers and checks mountedRef — false positive
- WorkbenchSuggestions advance callback already has suggestions in deps — false positive

### Known Issues
- 2 pre-existing test failures in agents-gap-analyst.test.ts (unrelated)

---

## 2026-02-28 — Session: Sprint 3 Audit Round 4 — Medium/Low Production Hardening

**Sprint:** 3 | **Stories:** 6 fixes from follow-up audit (25 findings reviewed, 19 false positives)
**Summary:** Hardened error handling on fire-and-forget DB operations, capped panel debounce queue, guaranteed stream reader cleanup, added logging for blueprint serialization failures, fixed abort controller leak on SSE error paths, and validated restored messages from DB.

### Changes Made

#### Best-Effort Async Error Handling [Medium]
- `server/src/routes/pipeline.ts` — `persistWorkflowArtifactBestEffort`, `upsertWorkflowNodeStatusBestEffort`, `resetWorkflowNodesForNewRunBestEffort` now chain `.catch()` with `logger.warn()` instead of bare `void`.

#### Panel Debounce Queue Cap [Medium]
- `server/src/routes/pipeline.ts` — `MAX_QUEUED_PANEL_PERSISTS` reduced from 5000 to 50. New entries for unknown sessions are rejected with a warning when queue is full.

#### Stream Reader Cleanup [Medium]
- `server/src/lib/http-body-guard.ts` — `parseJsonBodyWithLimit` reader logic wrapped in try/finally to guarantee `reader.releaseLock()` on all exit paths.

#### Blueprint Slice Error Logging [Low]
- `server/src/routes/pipeline.ts` — `sanitizeBlueprintSlice()` catch block now logs slice keys and error before returning fallback.

#### SSE Abort Controller Cleanup [Medium]
- `app/src/hooks/useAgent.ts` — Added `controller.abort()` before `handleDisconnect()` in both early-return error branches (bad status code, missing body).

#### Session Message Validation [Medium]
- `server/src/routes/sessions.ts` — Restored messages from DB are validated for required `role` field before access. Malformed messages logged and skipped.

### Decisions Made
- 19 of 25 audit findings were false positives (already guarded by existing code)
- Panel queue cap at 50 is generous — typical sessions create ~15 panel persists

### Known Issues
- 2 pre-existing test failures in `agents-gap-analyst.test.ts` (unrelated)

### Next Steps
- Sprint 3 retrospective and Sprint 4 planning

---

## 2026-02-28 — Session: Sprint 3 Audit Round 3 — Comprehensive Production Hardening

**Sprint:** 3 | **Stories:** 23 fixes from 8-agent comprehensive audit
**Summary:** Comprehensive production hardening across the entire codebase. Most critical: Craftsman sections were stored in scratchpad but never transferred to state.sections (AT-06), meaning all crafted content was discarded and the final resume fell back to raw intake data. Also fixed Producer→Craftsman revision requests being silently dropped (AT-10), created the missing claim_pipeline_slot DB migration, and hardened 20+ infrastructure/frontend/routing issues.

### Changes Made

#### AT-06: Transfer Craftsman Scratchpad to state.sections [System-breaking]
- `server/src/agents/coordinator.ts` — After Craftsman loop completes, iterate scratchpad entries starting with `section_`, transfer those with a `content` property to `state.sections`. Without this, the Producer, final resume payload, and ATS checks all saw empty sections.

#### AT-10: Fix Producer→Coordinator Revision Payload Mismatch [Critical]
- `server/src/agents/coordinator.ts` — Revision handler now accepts both array format (`payload.revision_instructions`) and flat format (`payload.section + payload.instruction`). Previously, all Producer revision requests were silently dropped because the field names didn't match.

#### CO-01: Fix Revision Subscription Leak [High]
- `server/src/agents/coordinator.ts` — Moved `cleanupRevisionSubscription()` into a `finally` block around the Producer phase. Previously leaked the bus handler if the Producer threw.

#### persistSession Error Handling [High]
- `server/src/agents/coordinator.ts` — UPDATE now chains `.select('id')` and checks returned rows. Warns on zero-row update (session deleted between pipeline start and save).

#### savePositioningProfile Error Handling [High]
- `server/src/agents/coordinator.ts` — Both update and insert calls now capture and log DB errors instead of silently swallowing them.

#### Craftsman self_review False-Pass [High]
- `server/src/agents/craftsman/tools.ts` — When repairJSON returns null, now returns `passed: false, score: 0` instead of `passed: true, score: 6`. Prevents skipping revision on parse failure.

#### Stateful Regex Fixes [Medium]
- `server/src/agents/craftsman/tools.ts` — Removed `/g` flag from vertical bar regex in STRUCTURAL_PATTERNS. `.test()` with `/g` advances lastIndex, causing false negatives on subsequent calls.
- `server/src/agents/producer/tools.ts` — Removed `/g` flags from all 4 date pattern regexes in `verify_cross_section_consistency`.

#### Strategist Suggestions Validation [Medium]
- `server/src/agents/strategist/tools.ts` — Added `.filter()` before `.map()` to skip suggestions with missing/empty labels. Prevents blank buttons in the UI from Z.AI type coercion issues.

#### Agent Runtime Fixes [High/Medium]
- `server/src/agents/runtime/agent-loop.ts` — Interactive tools (interview, present_to_user, questionnaire) now bypass per-tool timeout, using only the overall pipeline timeout. Prevents 2-min timeout aborting user interaction.
- `server/src/agents/runtime/agent-bus.ts` — messageLog capped at 500 entries (trims to 250 on overflow) to prevent unbounded memory growth.

#### Infrastructure Hardening [Critical/High/Medium]
- `server/src/lib/retry.ts` — Never retry AbortErrors (intentional cancellation). Previously matched "timeout" in error message and retried.
- `server/src/lib/json-repair.ts` — Size guard: skip regex-heavy repair steps on inputs >50KB to prevent catastrophic backtracking.
- `server/src/lib/http-body-guard.ts` — Return 400 on invalid JSON instead of silently coercing to `{}`.
- `server/src/lib/session-lock.ts` — Renewal interval reduced from 60s to 30s (with 2-min expiry, gives 90s buffer vs 60s).
- `server/src/lib/llm.ts` — Completed TOOL_MODEL_MAP with 9 missing entries (write_section, revise_section, design_blueprint, adversarial_review → PRIMARY; self_review_section, check_narrative_coherence → MID; humanize_check, check_evidence_integrity → LIGHT).

#### Database Migration [Critical]
- `supabase/migrations/20260228120000_add_claim_pipeline_slot_rpc.sql` — Created missing `claim_pipeline_slot` RPC. Atomically claims a session for pipeline execution using UPDATE WHERE pipeline_status != 'running'. SECURITY DEFINER, service_role only.

#### Pipeline Route Fixes [High/Medium]
- `server/src/routes/pipeline.ts` — Fixed gate queue double-splice (redundant `.filter()` after `.splice()` dropped valid buffered responses). Sanitized error leakage via SSE (pipeline_error events now show generic message; detail stays in server logs).
- `server/src/lib/questionnaire-helpers.ts` — Fixed dead ternary `'single_choice' : 'single_choice'` → `'single_choice' : 'free_text'`. Added `free_text` to type union in types.ts and session.ts.

#### Frontend Fixes [High/Medium]
- `app/src/lib/export-docx.ts` — Applied template font as document-level default via `styles.default.document.run`. Fixed education field rendering to match PDF export (null-safe, consistent field ordering).
- `app/src/hooks/useAgent.ts` — Removed `setIsProcessing(false)` from `text_delta` handler. isProcessing now stays true until a terminal event.

#### DB: Fix next_artifact_version Service-Role Bypass [High]
- `supabase/migrations/20260228130000_fix_next_artifact_version_service_role.sql` — `auth.uid()` returns NULL for service-role callers, so the ownership guard always blocked `supabaseAdmin` calls. Fix: skip ownership check when `auth.uid() IS NULL` (service-role is trusted); enforce for authenticated users only.

#### LLM Provider: Fix Interrupted Stream Usage Loss [Medium]
- `server/src/lib/llm-provider.ts` — Both ZAI and Anthropic streaming paths now record partial token usage in `finally`/`catch` blocks when streams are interrupted by abort or network errors. Previously, usage was only recorded on successful completion.

#### Download Filename Sanitization [Medium]
- `app/src/lib/export-filename.ts` — Added defense-in-depth sanitization of invisible/bidirectional control characters (C0, DEL, zero-width, bidi embedding/isolate, BOM) via NFKC normalization and regex strip in `sanitizeFilenameSegment()`.

#### New Test Suites [Tests]
- `server/src/__tests__/agent-bus.test.ts` — 8 tests covering message routing, messageLog cap, and event handler cleanup
- `server/src/__tests__/retry-abort.test.ts` — 3 tests verifying AbortError is never retried
- `server/src/__tests__/json-repair-guard.test.ts` — 6 tests covering size guard bypass and normal repair behavior

#### Test Update
- `server/src/__tests__/http-body-guard.test.ts` — Updated test to expect 400 on invalid JSON (was 200 with empty object).

### Decisions Made
- AT-06: Scratchpad→state transfer happens after Craftsman loop, preserving any sections already in state
- AT-10: Coordinator accepts both payload formats for backward compatibility
- claim_pipeline_slot: GRANT to service_role only (not authenticated) — backend-only operation
- json-repair: 50KB threshold for skipping aggressive regex (balances repair attempts vs DoS risk)
- http-body-guard: 400 is correct per HTTP spec; downstream validation no longer sees phantom empty objects

### Known Issues
- 2 pre-existing test failures in `agents-gap-analyst.test.ts` (unrelated)
- H5: Legacy create-master-resume.ts still backlogged
- Remaining medium/low findings from audit to be addressed in subsequent sessions

### Next Steps
- Address remaining medium/low audit findings
- Sprint 3 retrospective and Sprint 4 planning

---

## 2026-02-28 — Session: Sprint 3 Audit Round 2

**Sprint:** 3 | **Stories:** Audit round 2 — 5 critical + 8 high fixes
**Summary:** Fixed 13 issues from comprehensive 5-agent audit. Most severe: new master resume IDs were never linked back to sessions (C1), breaking evidence reuse for all first-time users. Also fixed nested transactions in migration, zero-row UPDATE detection, validation gaps, null guards, shallow-copy mutations, and evidence text length caps.

### Changes Made

#### C1: Link New Master Resume ID Back to Session [System-breaking]
- `server/src/agents/coordinator.ts` — Capture `{ data: newMr, error }` from RPC. After successful creation, `UPDATE coach_sessions SET master_resume_id = newMr.id`. Without this, second pipeline run never finds the master resume.

#### C2: Remove BEGIN/COMMIT from Migration [Critical]
- `supabase/migrations/20260227180000_...sql` — Removed explicit `BEGIN;` and `COMMIT;`. Supabase auto-wraps migrations in transactions; nested wrappers caused premature commit.

#### C3: Detect Zero-Row UPDATE in saveMasterResume [Critical]
- `server/src/agents/coordinator.ts` — Added `.select('id')` to UPDATE chain. If returned data is empty (row deleted between load and update), logs warning and falls through to CREATE branch as recovery.

#### C4+H7+H8+H10: Fix evidence_items Validation in POST /resumes [Critical+High]
- `server/src/routes/resumes.ts` — `text: z.string().min(10).max(2000)`, array `.max(200)` (was 500, matches EVIDENCE_CAP), `source_session_id: z.string().uuid()`, `created_at: z.string().datetime()`, `category: z.string().max(100)`.

#### C5: Null Guard on section.content in extractEvidenceItems [Critical]
- `server/src/agents/coordinator.ts` — `const rawContent = section.content ?? '';` prevents `.trim()` and `.split()` from throwing on null/undefined content.

#### H1+H2: Deep-Clone New Role Bullets + Education/Certifications [High]
- `server/src/agents/master-resume-merge.ts` — New role bullets: `newRole.bullets.map(b => ({ ...b }))`. Education: `{ ...edu }`. Certifications: `{ ...cert }`. Prevents shared references.

#### H4: Add earlier_career to Evidence Extraction Filter [High]
- `server/src/agents/coordinator.ts` — Added `key !== 'earlier_career'` to the filter condition so earlier career bullets are accumulated as evidence.

#### H6: Null Guards in buildStrategistMessage [High]
- `server/src/agents/coordinator.ts` — `Array.isArray(mr.experience)` guard before `.length`. `mr.skills && typeof mr.skills === 'object'` guard before `Object.keys()`. Prevents crashes on malformed/pre-migration DB rows.

#### H9: Cap Individual Evidence Item Text Length [High]
- `server/src/agents/coordinator.ts` — Added `MAX_EVIDENCE_TEXT_LENGTH = 1000` and `capEvidenceText()` helper (truncates at word boundary with `...`). Applied to crafted bullets, prose sections, and interview answers.

#### Tests: 5 New Test Scenarios
- `server/src/__tests__/master-resume-merge.test.ts` — newResume mutation safety (H1), education deep-clone isolation (H2), evidence dedup case-insensitivity (TG3), duplicate roles merge (TG4), empty summary fallback (TG5). Total: 20 tests passing.

### Decisions Made
- C3 recovery path: zero-row UPDATE falls through to CREATE rather than failing silently
- Evidence text cap at 1000 chars with word-boundary truncation balances context budget vs information loss
- Migration BEGIN/COMMIT removal is safe — all other migrations in this repo omit explicit wrappers

### Known Issues
- 2 pre-existing test failures in `agents-gap-analyst.test.ts` (unrelated to this work)
- H5 (legacy create-master-resume.ts) backlogged per user decision

### Next Steps
- Sprint 3 retrospective and Sprint 4 planning

---

## 2026-02-27 — Session: Sprint 3 Audit Fixes

**Sprint:** 3 | **Stories:** Audit fix stories 1-12
**Summary:** Fixed 18 issues found in post-implementation audit of master resume evidence accumulation: shallow-copy mutations, INSERT-only merge creating unbounded rows, unguarded Supabase casts, missing error handling, unbounded context injection, and edge-case gaps.

### Changes Made

#### Story 1: Fix Shallow Copy Mutation in mergeMasterResume [Critical]
- `server/src/agents/master-resume-merge.ts` — Deep-clone existing roles (map + spread bullets) instead of shallow `[...array]` to prevent caller mutation. Deep-clone skill arrays before pushing.

#### Story 2: Fix Supabase Error Handling in saveMasterResume [Critical]
- `server/src/agents/coordinator.ts` — Destructure `{ data, error: loadError }` on master resume load. If error is not PGRST116 (row not found), log and return early to avoid duplicate INSERT.

#### Story 3: Use UPDATE for Merge Case Instead of INSERT [Critical]
- `server/src/agents/coordinator.ts` — Replace RPC call in merge branch with `.update()` on existing row. Also updates `raw_text` with current resume text. RPC kept only for "create new" branch.

#### Story 4: Fix Migration — Drop Old RPC Overload + Transaction [Critical + Medium]
- `supabase/migrations/20260227180000_...sql` — Wrapped in BEGIN/COMMIT. Added DROP FUNCTION for old 10-param overload before CREATE OR REPLACE of 11-param version.

#### Story 5: Add Runtime Guards for DB Casts [High]
- `server/src/routes/pipeline.ts` — Normalize `evidence_items` to `[]` after cast in master resume load.
- `server/src/agents/coordinator.ts` — Same normalization in saveMasterResume load.
- `server/src/agents/master-resume-merge.ts` — Added `safeStr()` helper for null-safe string coercion on all key-generation lines.

#### Story 6: Add Size Caps [High + Low]
- `server/src/agents/coordinator.ts` — `MAX_BULLETS_PER_ROLE=15`, `MAX_EVIDENCE_ITEMS_INJECTED=50` in buildStrategistMessage. Caps bullets per role and evidence items per source category.
- `server/src/agents/master-resume-merge.ts` — `EVIDENCE_CAP=200` in mergeMasterResume. Keeps newest items when over cap.

#### Story 7: Add evidence_items to POST /resumes Route [High]
- `server/src/routes/resumes.ts` — Added `evidence_items` to `createResumeSchema` (zod array of evidence objects, max 500). Added `p_evidence_items` to RPC call.

#### Story 8: Fix Evidence Extraction for Prose Content [Medium]
- `server/src/agents/coordinator.ts` — `extractEvidenceItems` now captures summary/selected_accomplishments as single prose evidence items instead of only bullet-marked lines. Interview answers trimmed before length check.

#### Story 9: Fix Merge Edge Cases — Skills + Contact Info [Medium]
- `server/src/agents/master-resume-merge.ts` — Skip empty category names and empty skill strings. Contact info now merges fields (existing as base, new overwrites per-field) instead of winner-take-all.

#### Story 10: Fix DB Query Error in pipeline.ts [Medium]
- `server/src/routes/pipeline.ts` — Destructure `{ data: mrData, error: mrError }` and log error if present. Only set masterResume when no error.

#### Story 11: Adjust Strategist Prompt Guidance [Medium]
- `server/src/agents/strategist/prompts.ts` — Changed "0-3 questions" to "1-5 questions". Added "Always ask at least 1 question to capture JD-specific context."

#### Story 12: Add Missing Test Scenarios [Tests]
- `server/src/__tests__/master-resume-merge.test.ts` — 7 new tests: mutation safety, partial contact merge, empty skills, empty category names, whitespace evidence, evidence cap at 200, null-safe fields. Total: 15 tests passing.

### Decisions Made
- UPDATE instead of INSERT for merge case prevents unbounded row accumulation
- Evidence cap of 200 with "keep newest" strategy balances completeness vs. storage
- Context injection caps (15 bullets/role, 50 evidence items) prevent prompt bloat
- `safeStr()` helper centralizes null-safe string coercion for DB data

### Known Issues
- 2 pre-existing test failures in `agents-gap-analyst.test.ts` remain (unrelated)

### Next Steps
- Run full E2E pipeline with repeat user to validate merge-in-place behavior
- Monitor evidence accumulation growth in production

---

## 2026-02-27 — Session: Master Resume Persistent Evidence

**Sprint:** 3 | **Stories:** 1-5 (all complete)
**Summary:** Added persistent evidence accumulation to the Master Resume so repeat users benefit from prior pipeline sessions. The Strategist sees accumulated evidence and skips redundant interview questions.

### Changes Made

#### Story 1: Database Migration + Types
- `supabase/migrations/20260227180000_add_evidence_items_to_master_resumes.sql` — Added `evidence_items JSONB DEFAULT '[]'` column to `master_resumes` table; updated `create_master_resume_atomic` RPC to accept `p_evidence_items` parameter (11th param)
- `server/src/agents/types.ts` — Added `MasterResumeEvidenceItem` and `MasterResumeData` interfaces
- `app/src/types/resume.ts` — Added `MasterResumeEvidenceItem` interface and `evidence_items` field to `MasterResume`

#### Story 2: Auto-Save on Pipeline Completion
- `server/src/agents/master-resume-merge.ts` — New file: pure `mergeMasterResume()` function (no external deps, fully unit-testable). Handles role matching by company+title, bullet dedup, skill union, education/cert dedup, evidence item dedup
- `server/src/agents/coordinator.ts` — Added `extractEvidenceItems()` (extracts crafted bullets + interview answers), `saveMasterResume()` (loads existing, merges or creates new via RPC). Called after `persistSession()` in pipeline completion flow. Added `master_resume_id` and `master_resume` to `PipelineConfig`

#### Story 3: Load Master Resume at Pipeline Start
- `server/src/routes/pipeline.ts` — Added `master_resume_id` to session query; loads full master resume from DB when session has one linked; passes `master_resume_id` and `master_resume` to `runPipeline()`

#### Story 4: Inject into Strategist Context
- `server/src/agents/coordinator.ts` — `buildStrategistMessage()` now appends a "MASTER RESUME — ACCUMULATED EVIDENCE" section when `config.master_resume` exists, including experience entries with all bullets, evidence items by source, and skills inventory
- `server/src/agents/strategist/prompts.ts` — Added "Master Resume — Accumulated Evidence" guidance section: review evidence before designing questions, skip questions where strong evidence exists, focus on genuine gaps, 0-3 questions for repeat users with rich master resumes

#### Story 5: Verification
- `server/src/__tests__/master-resume-merge.test.ts` — New test file: 8 unit tests for `mergeMasterResume()` covering bullet dedup, role matching, evidence dedup, case-insensitive skills, first-time save, education/cert dedup, contact info, and case-insensitive role matching

### Decisions Made
- Extracted `mergeMasterResume()` into its own module (`master-resume-merge.ts`) to avoid Supabase import side-effects in unit tests
- Evidence extraction is code-only (zero LLM calls): bullets parsed from section content, interview answers from transcript
- Merge strategy uses exact text dedup (case-insensitive) — simple and reliable without LLM
- Auto-save runs after `persistSession()` and is non-critical (wrapped in try/catch, failure logged but doesn't block)

### Known Issues
- 2 pre-existing test failures in `agents-gap-analyst.test.ts` remain (unrelated)
- Evidence items grow unbounded — no pruning strategy yet (backlog item)
- Master resume viewer/editor UI not yet built (backlog)

### Next Steps
- Run full E2E pipeline with repeat user to validate reduced interview time
- Build master resume viewer page for users to browse/manage evidence
- Consider evidence quality scoring for smarter prioritization

---

## 2026-02-27 — Session: Interview Phase Optimization

**Sprint:** 2 | **Stories:** 1-6 (all complete)
**Summary:** Added interview budget enforcement, mini-batch presentation, and "Draft Now" escape to optimize the interview phase while preserving the Strategist's adaptive intelligence.

### Changes Made

#### Story 3: Question Format Converter
- `server/src/lib/questionnaire-helpers.ts` — Added `positioningToQuestionnaire()` to convert PositioningQuestion[] to QuestionnaireQuestion[] for batch presentation
- `server/src/lib/questionnaire-helpers.ts` — Added `extractInterviewAnswers()` to convert QuestionnaireSubmission back to scratchpad-compatible interview answer format

#### Story 1: Question Budget Enforcement
- `server/src/agents/strategist/tools.ts` — Added `INTERVIEW_BUDGET` map (fast_draft=5, balanced=7, deep_dive=12) and `getInterviewBudget()`/`getInterviewQuestionCount()` helpers
- `server/src/agents/strategist/tools.ts` — `interview_candidate` execute: budget check at top returns `{ budget_reached: true }` with transparency event when limit hit

#### Story 2: interview_candidate_batch Tool
- `server/src/agents/strategist/tools.ts` — New `interview_candidate_batch` AgentTool: presents 2-3 questions as a QuestionnairePanel gate, extracts batch answers, persists to scratchpad/transcript identically to single-question tool, evaluates follow-up recommendations, handles `draft_now` escape signal
- `server/src/agents/strategist/tools.ts` — Registered in `strategistTools` export array

#### Story 4: Update Strategist Prompt
- `server/src/agents/strategist/prompts.ts` — Updated step 5 (Interview) to guide toward `interview_candidate_batch` as primary tool, batch-by-category strategy, budget awareness, and `budget_reached`/`draft_now_requested` stop signals

#### Story 5: Draft Now Escape Button
- `app/src/components/panels/QuestionnairePanel.tsx` — Added optional `onDraftNow` prop and "Draft Now" button (Zap icon, amber accent) in action bar for positioning-stage questionnaires
- `app/src/components/panels/panel-renderer.tsx` — Wired `onDraftNow` callback to send `{ draft_now: true }` gate response for positioning-stage questionnaires

#### Story 6: E2E Verification
- `e2e/helpers/pipeline-responder.ts` — Added phase timing markers (interview, blueprint_review, section_writing) with `startPhase()`/`endPhase()` helpers and completion summary

### Decisions Made
- Budget enforcement is code-level, not prompt-level — the tool returns a stop signal rather than relying on the LLM to count
- Batch questions use existing QuestionnairePanel infrastructure (not a new component) for consistency
- Single `interview_candidate` tool kept alongside batch tool for targeted follow-up probing
- "Draft Now" button only shows for positioning-stage questionnaires (not gap_analysis or quality_fixes)

### Known Issues
- E2E timing improvement not yet validated (requires live Z.AI API run)
- Strategist may still prefer single-question tool until prompt guidance takes effect across runs
- 2 pre-existing test failures in agents-gap-analyst.test.ts remain

### Next Steps
- Run full E2E pipeline to validate timing improvement target (interview phase < 5 min)
- Monitor Strategist behavior — confirm it adopts batch workflow with updated prompt
- Master Resume pre-fill (future sprint, per user)

---

## 2026-02-27 — Session: Framework & Dynamic Pipeline

**Sprint:** 0 (retroactive) + 1 (framework onboarding)
**Summary:** Completed 4-phase Dynamic Pipeline work, fixed critical infrastructure issues, established Scrum framework.

### Changes Made

#### Dynamic Pipeline — Phase 1: Evidence Flow
- `server/src/agents/types.ts` — Added `interview_transcript` to `PipelineState`
- `server/src/agents/strategist/tools.ts` — `interview_candidate` persists raw Q&A pairs to state
- `server/src/agents/strategist/tools.ts` — `classify_fit` expanded evidence fields (2000 chars, 10 phrases)
- `server/src/agents/coordinator.ts` — `buildCraftsmanMessage()` includes interview transcript
- `server/src/agents/craftsman/tools.ts` — Section writer: "Authentic voice beats resume-speak"

#### Dynamic Pipeline — Phase 2: Blueprint Approval Gate
- `server/src/lib/feature-flags.ts` — Added `FF_BLUEPRINT_APPROVAL` flag
- `server/src/agents/coordinator.ts` — `waitForUser('architect_review')` gate + edit merging
- `app/src/components/panels/BlueprintReviewPanel.tsx` — New panel: edit positioning, reorder sections
- `app/src/components/panels/panel-renderer.tsx` — Blueprint panel integration

#### Dynamic Pipeline — Phase 3: Creative Liberation
- `server/src/agents/types.ts` — `EvidencePriority`, updated `EvidenceAllocation` interfaces
- `server/src/agents/strategist/tools.ts` — Architect prompt: strategic guidance mode
- `server/src/agents/craftsman/prompt.ts` — "Your Creative Authority" section
- `server/src/agents/craftsman/tools.ts` — `hasEvidencePriorities()` branching in section writer

#### Dynamic Pipeline — Phase 4: Holistic Quality
- `server/src/agents/craftsman/tools.ts` — `crossSectionContext` from scratchpad in `write_section`
- `server/src/agents/craftsman/tools.ts` — "PREVIOUSLY WRITTEN SECTIONS" prompt block
- `server/src/agents/producer/tools.ts` — `check_narrative_coherence` tool (new)
- `server/src/agents/producer/tools.ts` — `select_template` SSE transparency
- `server/src/agents/producer/prompt.ts` — Updated workflow with narrative coherence step

#### Infrastructure Fixes
- `server/src/routes/pipeline.ts` — Pipeline heartbeat: 5-min `setInterval` touching `updated_at`
- `e2e/helpers/pipeline-responder.ts` — React native setter for textarea fills in zero-height panels

#### Framework
- `CLAUDE.md` — Added Scrum development framework and anti-drift rules
- `docs/ARCHITECTURE.md` — System architecture documentation (new)
- `docs/CONVENTIONS.md` — Code conventions and patterns (new)
- `docs/DECISIONS.md` — 6 ADRs for existing architectural decisions (new)
- `docs/BACKLOG.md` — Known work items organized as epics/stories (new)
- `docs/CURRENT_SPRINT.md` — Sprint 1: Framework Onboarding (new)
- `docs/SPRINT_LOG.md` — Sprint 0 retrospective (new)
- `docs/CHANGELOG.md` — This file (new)

### Decisions Made
- ADR-001 through ADR-006 documented retroactively (see DECISIONS.md)
- Scrum framework adopted for all future development

### Known Issues
- MaxListenersExceededWarning on long sessions
- 409 conflict errors when frontend sends during processing (Bug 18)
- Revision loop after user approval (Bug 16)
- Context forgetfulness on long sessions (Bug 17)
- PDF Unicode rendering (`?` characters)

### Next Steps
- Complete Sprint 1 (framework onboarding — this session)
- Plan Sprint 2 from backlog (production hardening candidates)
