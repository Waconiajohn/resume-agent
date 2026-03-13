# Epic: Resume Agent v2 — 10-Agent Rebuild

**Goal:** Replace the 3-agent assembly-line pipeline with a 10-agent strategic positioning engine. Two-field intake, streaming accumulation UX, inline AI editing, creative gap analysis.
**Design Blueprint:** `docs/obsidian/30_Specs & Designs/Resume Agent v2 — Design Blueprint.md`
**ADR:** ADR-042

---

## Sprint G1: Gap Coaching UX Overhaul

**Goal:** Unify the gap strategy approval flow into a single conversational coaching experience, surface strategy placement before writing, and ensure re-runs re-emit coaching cards.
**Status:** Not started

### Story G1-1: Unify Strategy Approval Flow [LARGE]
- **As a** user reviewing my gap analysis
- **I want to** see one clear coaching conversation for each gap strategy
- **So that** I'm not confused by two different approval UIs that behave differently
- **Acceptance Criteria:**
  - [ ] Remove thumbs up/down toggles from `GapAnalysisCard.tsx` — card becomes display-only (coverage score, requirement counts, classification breakdown)
  - [ ] `GapCoachingCardList.tsx` becomes the single source of truth for strategy approval
  - [ ] `strategyApprovals` state in `V2ResumeScreen` removed — no longer needed
  - [ ] `GapAnalysisCard` no longer accepts `onStrategyChange` or `approvals` props
  - [ ] Gap coaching responses flow directly to orchestrator (already works)
  - [ ] When no pending strategies exist, GapAnalysisCard shows "Perfect match — no positioning strategies needed" message
  - [ ] `cd app && npx tsc --noEmit` passes
- **Estimated complexity:** Large (touches GapAnalysisCard, GapCoachingCardList, V2StreamingDisplay, V2ResumeScreen)
- **Dependencies:** None

### Story G1-2: Enhance Coaching Card with Full Context [MEDIUM]
- **As a** user reviewing a gap strategy
- **I want to** see the evidence, inferred metrics, and reasoning all in one clear coaching card
- **So that** I understand exactly why this strategy was suggested and can make an informed decision
- **Acceptance Criteria:**
  - [ ] `evidence_found` chips displayed prominently (currently hidden)
  - [ ] `inference_rationale` shown below inferred metric with math explanation
  - [ ] AI reasoning bubble uses larger, more readable typography
  - [ ] Card shows requirement importance badge (must_have/important/nice_to_have) with color coding
  - [ ] "What this means for your resume" — brief plain-language explanation of what approving does
  - [ ] Skip action includes tooltip: "This gap won't be addressed on your resume. That's OK — your baseline is strong."
  - [ ] `cd app && npx tsc --noEmit` passes
- **Estimated complexity:** Medium
- **Dependencies:** G1-1

### Story G1-3: Strategy Placement Preview [MEDIUM]
- **As a** user who approved gap strategies
- **I want to** see WHERE my approved strategies will appear in the resume before it's written
- **So that** I know what to expect and can course-correct before the AI writes
- **Acceptance Criteria:**
  - [ ] New `StrategyPlacementCard.tsx` component renders after Narrative Strategy completes
  - [ ] Displays `gap_positioning_map` from `NarrativeStrategyOutput`: requirement → section/role → narrative framing
  - [ ] Shows approved strategies mapped to specific resume sections (e.g., "Enterprise CRM → Professional Experience, Acme Corp, bullets 2-3")
  - [ ] `narrative_justification` shown as coaching explanation for each placement
  - [ ] Card is informational (no user action required) — visual confirmation before writing begins
  - [ ] Emitted as part of `narrative_strategy` SSE event (data already available, just not rendered)
  - [ ] Glass morphism styling: `border-[#b5dec2]/15 bg-[#b5dec2]/[0.04]` (green tint — "approved and placed")
  - [ ] `cd app && npx tsc --noEmit` passes
- **Estimated complexity:** Medium
- **Dependencies:** G1-1

### Story G1-4: Re-emit Coaching Cards on Context Re-run [MEDIUM]
- **As a** user who added context and triggered a re-run
- **I want to** see updated coaching cards for any new or changed strategies
- **So that** I can approve/reject strategies based on my new context instead of implicit re-approval
- **Acceptance Criteria:**
  - [ ] Backend: Orchestrator always emits `gap_coaching` SSE event when `pending_strategies.length > 0`, regardless of `options.gap_coaching_responses`
  - [ ] Frontend: `V2StreamingDisplay` clears previous coaching card state on re-run
  - [ ] User sees fresh coaching cards with updated evidence from their added context
  - [ ] Previously-approved strategies show "Previously approved" badge but still allow re-evaluation
  - [ ] Pipeline pauses for coaching gate on re-run (same as first run)
  - [ ] `cd server && npx tsc --noEmit` passes
  - [ ] `cd app && npx tsc --noEmit` passes
- **Estimated complexity:** Medium
- **Dependencies:** G1-1

### Story G1-5: Rejection Guidance & Edge Cases [SMALL]
- **As a** user who rejects all strategies or provides vague context
- **I want to** understand the implications and get helpful guidance
- **So that** I make informed decisions without dead ends
- **Acceptance Criteria:**
  - [ ] When all strategies skipped: show summary card "Your resume will highlight your direct matches — no inferred positioning will be used. You can add context anytime to unlock new strategies."
  - [ ] When user adds context < 20 chars: show "Be specific — mention job titles, team sizes, budget amounts, or project outcomes"
  - [ ] Context textarea shows 3 example prompts as placeholder: "e.g., 'I managed a $6M annual budget for cloud infrastructure at Company X'"
  - [ ] `cd app && npx tsc --noEmit` passes
- **Estimated complexity:** Small
- **Dependencies:** G1-1

## Out of Scope (Sprint G1)
- Strategy audit after writing (Sprint G2)
- Inline strategy highlighting on resume document (Sprint G2)
- Backend agent changes (prompts, model routing) — agents are solid
- Tests (separate sprint, tracked as tech debt)

---

## Sprint G2: Strategy Transparency & Feedback Loop

**Goal:** After the resume is written, show users exactly how their approved strategies became resume content. Close the feedback loop from coaching → placement → final bullet.
**Status:** Not started — depends on G1

### Story G2-1: Strategy Audit Card [LARGE]
- **As a** user viewing my completed resume
- **I want to** see which resume bullets came from my approved gap strategies
- **So that** I can verify strategies were integrated correctly and know what to prepare for in interviews
- **Acceptance Criteria:**
  - [ ] New `StrategyAuditCard.tsx` — appears after resume completion, before export
  - [ ] Maps each approved strategy to the bullet(s) that address it using `addresses_requirements` from `ResumeBullet` + `positioning_assessment` from Assembly
  - [ ] Each entry shows: Requirement → Strategy Used → Resulting Bullet (with section context)
  - [ ] Status indicators: "Positioned" (strategy used), "Direct Match" (no strategy needed), "Gap" (requirement not addressed)
  - [ ] Entries with `strategy_used` have a subtle green accent thread connecting strategy to bullet
  - [ ] Expandable: collapsed shows counts ("4 positioned, 6 direct matches, 1 gap"), expanded shows full mapping
  - [ ] `cd app && npx tsc --noEmit` passes
- **Estimated complexity:** Large
- **Dependencies:** G1-3

### Story G2-2: Resume Bullet Strategy Markers [MEDIUM]
- **As a** user reading my resume
- **I want to** see which bullets were enhanced by AI gap strategies vs. taken from my original resume
- **So that** I know exactly what's new and can prepare to defend those claims
- **Acceptance Criteria:**
  - [ ] Bullets with `is_new: true` show a subtle `(New)` marker (already partially implemented)
  - [ ] Bullets that address a gap requirement show a small strategy icon (e.g., compass or lightbulb) on hover
  - [ ] Hovering the strategy icon shows a tooltip: "This bullet addresses: [requirement]. Strategy: [positioning]"
  - [ ] `addresses_requirements` data displayed as subtle tags below each bullet on hover
  - [ ] Color coding: `#b5dec2` (green) for direct matches, `#afc4ff` (blue) for repositioned, `#f0d99f` (yellow) for partial
  - [ ] `cd app && npx tsc --noEmit` passes
- **Estimated complexity:** Medium
- **Dependencies:** G2-1

### Story G2-3: Narrative Positioning Transparency [MEDIUM]
- **As a** user reviewing my positioning strategy
- **I want to** see how the narrative angle will be reinforced across my resume
- **So that** I understand the strategic logic before the resume is written
- **Acceptance Criteria:**
  - [ ] Enhance `NarrativeStrategyCard` to show `section_guidance` — how each section will be framed
  - [ ] Show `why_me_story` (full), `why_me_concise` (interview version), and `why_me_best_line` (soundbite) in expandable sections
  - [ ] Show `unique_differentiators` as highlight chips
  - [ ] `narrative_angle_rationale` displayed as coaching explanation
  - [ ] Interview talking points shown as a "Prepare for These Questions" section
  - [ ] `cd app && npx tsc --noEmit` passes
- **Estimated complexity:** Medium
- **Dependencies:** None (can parallel with G2-1)

### Story G2-4: Strategy Thread Animation [SMALL]
- **As a** user
- **I want to** visually trace how a gap strategy flows from coaching → placement → bullet
- **So that** the connection between AI coaching and the final resume is tangible
- **Acceptance Criteria:**
  - [ ] When user clicks a strategy in the Strategy Audit Card, the corresponding coaching card scrolls into view with a brief highlight animation
  - [ ] When user clicks a positioned bullet in the resume, the Strategy Audit Card highlights the corresponding entry
  - [ ] Smooth scroll + 300ms glow animation using `border-[#afc4ff]/40` → `border-[#afc4ff]/10` fade
  - [ ] Uses `scrollIntoView({ behavior: 'smooth', block: 'center' })` + CSS transition
  - [ ] No external animation libraries — CSS transitions only
  - [ ] `cd app && npx tsc --noEmit` passes
- **Estimated complexity:** Small
- **Dependencies:** G2-1, G2-2

### Story G2-5: "What Changed" Diff on Re-run [SMALL]
- **As a** user who re-ran with additional context
- **I want to** see what changed in my resume compared to the previous version
- **So that** I know the impact of my added context
- **Acceptance Criteria:**
  - [ ] After re-run completes, show a summary card: "Changes from your added context"
  - [ ] List new bullets added, bullets modified, strategies added/removed
  - [ ] Use existing `DiffView.tsx` pattern for before/after on modified bullets
  - [ ] Card dismissible after review
  - [ ] `cd app && npx tsc --noEmit` passes
- **Estimated complexity:** Small
- **Dependencies:** G1-4

## Out of Scope (Sprint G2)
- Backend prompt changes
- Gap strategy approval by category (gap vs. improvement)
- ATS score breakdown per strategy
- Tests (separate sprint)

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
