# Epic: Resume Agent v2 — 10-Agent Rebuild

**Goal:** Replace the 3-agent assembly-line pipeline with a 10-agent strategic positioning engine. Two-field intake, streaming accumulation UX, inline AI editing, creative gap analysis.
**Design Blueprint:** `docs/obsidian/30_Specs & Designs/Resume Agent v2 — Design Blueprint.md`
**ADR:** ADR-042

---

## Sprint V2-1: Tear Down + Foundation — DONE

**Goal:** Remove the old pipeline, define the new agent interfaces, build the first 3 analysis agents.
**Started:** 2026-03-11 | **Completed:** 2026-03-12

### Story V2-1.1: Delete Old Resume Pipeline [LARGE] — DONE
- **Acceptance Criteria:**
  - [x] Delete `agents/strategist/`, `agents/craftsman/`, `agents/producer/`
  - [x] Delete `agents/coordinator.ts`, `agents/resume/`, `agents/schemas/`, `agents/knowledge/`
  - [x] Delete `agents/architect.ts`, `agents/positioning-coach.ts`, `agents/section-writer.ts`
  - [x] Delete `agents/intake.ts`, `agents/research.ts`, `agents/gap-analyst.ts`, `agents/quality-reviewer.ts`
  - [x] Delete `agents/master-resume-merge.ts`, `agents/ats-rules.ts`, `agents/section-suggestion*.ts`
  - [x] Delete `routes/resume-pipeline.ts`
  - [x] Update `index.ts` — remove old pipeline imports
  - [x] Server starts without errors

### Story V2-1.2: Define v2 Agent Types + Interfaces [MEDIUM] — DONE
- **Acceptance Criteria:**
  - [x] `agents/resume-v2/types.ts` — all 10 agent I/O interfaces defined (~500 lines)
  - [x] `V2PipelineState` — full orchestrator state tracking all agent outputs
  - [x] `V2PipelineSSEEvent` — 15 distinct event types for frontend streaming
  - [x] `GapStrategy`, `RequirementGap`, `ResumeBullet`, `PositioningAssessment` supporting types

### Story V2-1.3: Resume Rules Knowledge Base [SMALL] — DONE
- **Acceptance Criteria:**
  - [x] `agents/resume-v2/knowledge/resume-rules.ts` (~197 lines)
  - [x] `DOCUMENT_FORMAT`, `SECTION_ORDER`, `SECTION_RULES`, `WRITING_RULES`
  - [x] `BANNED_PHRASES` (28 phrases), `AGE_PROOFING_RULES`, `GUARDRAILS`
  - [x] `getResumeRulesPrompt()` assembles full rulebook for prompt injection

### Story V2-1.4: Job Intelligence Agent [MEDIUM] — DONE
- **Acceptance Criteria:**
  - [x] `agents/resume-v2/job-intelligence/agent.ts` — single-prompt, MODEL_MID
  - [x] Extracts competencies, responsibilities, cultural signals, seniority, business problems, hidden signals, company name
  - [x] 2-attempt JSON extraction with retry fallback
  - [ ] ~~Unit tests~~ (not written — tracked as tech debt)

### Story V2-1.5: Candidate Intelligence Agent [MEDIUM] — DONE
- **Acceptance Criteria:**
  - [x] `agents/resume-v2/candidate-intelligence/agent.ts` — single-prompt, MODEL_MID
  - [x] Extracts career themes, leadership scope, quantified outcomes, hidden accomplishments, contact info
  - [x] Placeholder name guardrail (no "John Doe")
  - [x] Infers scope from context (team of 40 = ~$3M payroll budget)
  - [ ] ~~Unit tests~~ (not written — tracked as tech debt)

### Story V2-1.6: Benchmark Candidate Agent [MEDIUM] — DONE
- **Acceptance Criteria:**
  - [x] `agents/resume-v2/benchmark-candidate/agent.ts` — single-prompt, MODEL_PRIMARY
  - [x] Builds realistic archetype with expected achievements, leadership scope, differentiators
  - [ ] ~~Unit tests~~ (not written — tracked as tech debt)

---

## Sprint V2-2: Strategy + Creation + Verification — DONE

**Goal:** Build the remaining 7 agents and wire the orchestrator.
**Started:** 2026-03-11 | **Completed:** 2026-03-12

### Story V2-2.1: Gap Analysis Agent [LARGE] — DONE
- **Acceptance Criteria:**
  - [x] `agents/resume-v2/gap-analysis/agent.ts` — single-prompt, MODEL_PRIMARY
  - [x] Requirement-by-requirement classification (strong/partial/missing) with evidence
  - [x] Creative strategies with inference rationale and ai_reasoning coaching text
  - [x] 10-20% backoff on inferred metrics, never fabricate
  - [ ] ~~Unit tests~~ (not written — tracked as tech debt)

### Story V2-2.2: Narrative Strategy Agent [MEDIUM] — DONE
- **Acceptance Criteria:**
  - [x] `agents/resume-v2/narrative-strategy/agent.ts` — single-prompt, MODEL_PRIMARY
  - [x] 5-layer narrative scaffolding, "Why Me" story (full + concise + best line)
  - [x] Branded title, gap positioning map, interview talking points, section guidance
  - [x] max_tokens: 16384 (largest budget in pipeline)
  - [ ] ~~Unit tests~~ (not written — tracked as tech debt)

### Story V2-2.3: Resume Writer Agent [LARGE] — DONE
- **Acceptance Criteria:**
  - [x] `agents/resume-v2/resume-writer/agent.ts` — single powerful prompt, MODEL_PRIMARY
  - [x] Complete 2-page resume in one pass (header → education)
  - [x] `is_new` flag on AI-enhanced content
  - [x] Creative authority within strategic guardrails from Narrative Strategy
  - [ ] ~~Unit tests~~ (not written — tracked as tech debt)

### Story V2-2.4: Verification Agents (Truth + ATS + Tone) [MEDIUM] — DONE
- **Acceptance Criteria:**
  - [x] `truth-verification/agent.ts` — MODEL_PRIMARY, claim-by-claim with confidence levels
  - [x] `ats-optimization/agent.ts` — MODEL_LIGHT, keyword match score + suggestions
  - [x] `executive-tone/agent.ts` — MODEL_MID, flags junior/AI/banned language
  - [x] All 3 run in parallel after Resume Writer
  - [ ] ~~Unit tests~~ (not written — tracked as tech debt)

### Story V2-2.5: Resume Assembly Agent [SMALL] — DONE
- **Acceptance Criteria:**
  - [x] `agents/resume-v2/assembly/agent.ts` — deterministic (no LLM)
  - [x] Applies tone fixes, computes scores, builds quick wins, positioning assessment
  - [ ] ~~Unit tests~~ (not written — tracked as tech debt)

### Story V2-2.6: Orchestrator + SSE Streaming [LARGE] — DONE
- **Acceptance Criteria:**
  - [x] `agents/resume-v2/orchestrator.ts` — thin coordinator (~287 lines), zero content decisions
  - [x] Sequence: [1,2] parallel → 3 → 4 → 5 → 6 → [7,8,9] parallel → 10
  - [x] SSE events stream each agent's output as it completes
  - [x] `routes/resume-v2-pipeline.ts` with session management, rate limiting
  - [x] Error handling — emits pipeline_error SSE event
  - [x] AbortSignal support throughout

### Post-Sprint Hardening (completed after V2-2)
- [x] `[V2-AUDIT]` — 30 findings fixed from comprehensive audit + pre-commit hook
- [x] `[FIX]` — Retry + diagnostic logging added to all 9 LLM-calling agents
- [x] `[V2-PROMPTS]` — Narrative Strategy + Resume Writer prompts elevated for stronger Why Me
- [x] Pipeline enrichment: AI gap coaching cards, positioning assessment, pre-scores, key phrases, one-click keyword integration
- [x] Dashboard polish: CTA alignment, pipeline interview rounds, weekly schedule

### Known Tech Debt from V2-1 + V2-2
- **Zero test coverage** for all 10 agents and orchestrator
- No feature flag gating (V2 is always-on, no A/B testing against old pipeline)
- No prompt versioning or generation analytics

---

## Sprint V2-3: Frontend + Polish — DONE

**Goal:** Build the new frontend experience — two-field intake, streaming display, inline AI editing, "Add Context" flow, export.
**Completed:** 2026-03-13

### Story V2-3.1: Two-Field Intake + Streaming Display [LARGE] — DONE
- **Acceptance Criteria:**
  - [x] `V2IntakeForm.tsx` — two text areas (resume + JD) with file upload, min 50 char validation
  - [x] `V2StreamingDisplay.tsx` — accumulation display, 7-stage progression, scroll-safe
  - [x] Five stages visible as agents complete
  - [x] `V2ResumeScreen` orchestrates via `view === 'resume-v2'` in App.tsx
  - [x] Old panel infrastructure retained (Coach view still uses it for other products)

### Story V2-3.2: Inline AI Editing on Resume Document [LARGE] — DONE
- **Acceptance Criteria:**
  - [x] `InlineEditToolbar.tsx` — 7 actions (Strengthen, +Metrics, Shorten, +Keywords, Rewrite, Custom, Not my voice)
  - [x] `useInlineEdit.ts` hook — edit state, 25-deep undo/redo
  - [x] `DiffView.tsx` — before/after comparison with Accept/Reject
  - [x] Backend `POST /:sessionId/edit` endpoint with action-specific prompts (MODEL_MID)

### Story V2-3.3: Live ATS Score Sidebar [SMALL] — DONE
- **Acceptance Criteria:**
  - [x] `KeywordScoreDashboard.tsx` — ATS score, keywords found/missing, top suggestions
  - [x] `useLiveScoring.ts` hook — debounced rescore on edits
  - [x] Backend `POST /:sessionId/rescore` endpoint (MODEL_LIGHT)

### Story V2-3.4: "Add Context" Re-Run Flow [MEDIUM] — DONE
- **Acceptance Criteria:**
  - [x] `AddContextCard.tsx` — "Tell us what we missed" text area
  - [x] Re-run triggers Gap Analysis → Narrative → Writer → Verification with merged context
  - [x] Clears edit history and editable state on re-run

### Story V2-3.5: Gap Strategy Confirmation UX [SMALL] — DONE
- **Acceptance Criteria:**
  - [x] `GapAnalysisCard.tsx` + `GapCoachingCard.tsx` — approve/skip/context per strategy
  - [x] Only approved strategies passed to Resume Writer on re-run

### Story V2-3.6: Export + App Routing Cleanup [MEDIUM] — DONE
- **Acceptance Criteria:**
  - [x] `ExportBar.tsx` — DOCX and PDF export via `resumeDraftToFinalResume()` converter
  - [x] `App.tsx` — new `resume-v2` view routing active
  - [x] Old Coach view retained (other products depend on it — not V2 cleanup scope)

---

## Epic Complete

All 3 sprints (V2-1, V2-2, V2-3) are delivered. The Resume Agent v2 10-agent pipeline is fully built end-to-end: backend agents, orchestrator, SSE streaming, frontend intake/display/editing/export.

### Known Tech Debt (Separate Sprints)
- **Zero test coverage** for all 10 V2 agents and orchestrator
- No feature flag gating (V2 is always-on, no A/B against old pipeline)
- No prompt versioning or generation analytics
- Legacy Coach view infrastructure still present (used by other products)
- E2E test suite needs rebuild for V2 pipeline
- Old `usePipelineStateManager`, `useSSEEventHandlers` hooks still exist (legacy Coach dependency)

### Out of Scope (Future Work)
- Thematic Agent (company voice matching)
- Redis/distributed bus
- Other products (Coach, LinkedIn, Job Command Center) — untouched
- E2E test suite rebuild
- Unit tests for V2 agents
