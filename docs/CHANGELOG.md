# Changelog — Resume Agent

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
