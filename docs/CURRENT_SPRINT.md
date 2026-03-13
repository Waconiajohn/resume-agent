# Epic: Resume Agent v2 — 10-Agent Rebuild

**Goal:** Replace the 3-agent assembly-line pipeline with a 10-agent strategic positioning engine. Two-field intake, streaming accumulation UX, inline AI editing, creative gap analysis.
**Design Blueprint:** `docs/obsidian/30_Specs & Designs/Resume Agent v2 — Design Blueprint.md`
**ADR:** ADR-042

---

## Sprint G1: Gap Coaching UX Overhaul

**Goal:** Unify the gap strategy approval flow into a single conversational coaching experience, surface strategy placement before writing, and ensure re-runs re-emit coaching cards.
**Status:** DONE — committed 92a6084

### Story G1-1: Unify Strategy Approval Flow [LARGE]
- **As a** user reviewing my gap analysis
- **I want to** see one clear coaching conversation for each gap strategy
- **So that** I'm not confused by two different approval UIs that behave differently
- **Acceptance Criteria:**
  - [x] Remove thumbs up/down toggles from `GapAnalysisCard.tsx` — card becomes display-only (coverage score, requirement counts, classification breakdown)
  - [x] `GapCoachingCardList.tsx` becomes the single source of truth for strategy approval
  - [x] `strategyApprovals` state in `V2ResumeScreen` removed — no longer needed
  - [x] `GapAnalysisCard` no longer accepts `onStrategyChange` or `approvals` props
  - [x] Gap coaching responses flow directly to orchestrator (already works)
  - [x] When no pending strategies exist, GapAnalysisCard shows "Perfect match — no positioning strategies needed" message
  - [x] `cd app && npx tsc --noEmit` passes
- **Estimated complexity:** Large (touches GapAnalysisCard, GapCoachingCardList, V2StreamingDisplay, V2ResumeScreen)
- **Dependencies:** None

### Story G1-2: Enhance Coaching Card with Full Context [MEDIUM]
- **As a** user reviewing a gap strategy
- **I want to** see the evidence, inferred metrics, and reasoning all in one clear coaching card
- **So that** I understand exactly why this strategy was suggested and can make an informed decision
- **Acceptance Criteria:**
  - [x] `evidence_found` chips displayed prominently (currently hidden)
  - [x] `inference_rationale` shown below inferred metric with math explanation
  - [x] AI reasoning bubble uses larger, more readable typography
  - [x] Card shows requirement importance badge (must_have/important/nice_to_have) with color coding
  - [x] "What this means for your resume" — brief plain-language explanation of what approving does
  - [x] Skip action includes tooltip: "This gap won't be addressed on your resume. That's OK — your baseline is strong."
  - [x] `cd app && npx tsc --noEmit` passes
- **Estimated complexity:** Medium
- **Dependencies:** G1-1

### Story G1-3: Strategy Placement Preview [MEDIUM]
- **As a** user who approved gap strategies
- **I want to** see WHERE my approved strategies will appear in the resume before it's written
- **So that** I know what to expect and can course-correct before the AI writes
- **Acceptance Criteria:**
  - [x] New `StrategyPlacementCard.tsx` component renders after Narrative Strategy completes
  - [x] Displays `gap_positioning_map` from `NarrativeStrategyOutput`: requirement → section/role → narrative framing
  - [x] Shows approved strategies mapped to specific resume sections (e.g., "Enterprise CRM → Professional Experience, Acme Corp, bullets 2-3")
  - [x] `narrative_justification` shown as coaching explanation for each placement
  - [x] Card is informational (no user action required) — visual confirmation before writing begins
  - [x] Emitted as part of `narrative_strategy` SSE event (data already available, just not rendered)
  - [x] Glass morphism styling: `border-[#b5dec2]/15 bg-[#b5dec2]/[0.04]` (green tint — "approved and placed")
  - [x] `cd app && npx tsc --noEmit` passes
- **Estimated complexity:** Medium
- **Dependencies:** G1-1

### Story G1-4: Re-emit Coaching Cards on Context Re-run [MEDIUM]
- **As a** user who added context and triggered a re-run
- **I want to** see updated coaching cards for any new or changed strategies
- **So that** I can approve/reject strategies based on my new context instead of implicit re-approval
- **Acceptance Criteria:**
  - [x] Backend: Orchestrator always emits `gap_coaching` SSE event when `pending_strategies.length > 0`, regardless of `options.gap_coaching_responses`
  - [x] Frontend: `V2StreamingDisplay` clears previous coaching card state on re-run
  - [x] User sees fresh coaching cards with updated evidence from their added context
  - [x] Previously-approved strategies show "Previously approved" badge but still allow re-evaluation
  - [x] Pipeline pauses for coaching gate on re-run (same as first run)
  - [x] `cd server && npx tsc --noEmit` passes
  - [x] `cd app && npx tsc --noEmit` passes
- **Estimated complexity:** Medium
- **Dependencies:** G1-1

### Story G1-5: Rejection Guidance & Edge Cases [SMALL]
- **As a** user who rejects all strategies or provides vague context
- **I want to** understand the implications and get helpful guidance
- **So that** I make informed decisions without dead ends
- **Acceptance Criteria:**
  - [x] When all strategies skipped: show summary card "Your resume will highlight your direct matches — no inferred positioning will be used. You can add context anytime to unlock new strategies."
  - [x] When user adds context < 20 chars: show "Be specific — mention job titles, team sizes, budget amounts, or project outcomes"
  - [x] Context textarea shows 3 example prompts as placeholder: "e.g., 'I managed a $6M annual budget for cloud infrastructure at Company X'"
  - [x] `cd app && npx tsc --noEmit` passes
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
**Status:** DONE — committed adedd5b

### Story G2-1: Strategy Audit Card [LARGE] — DONE
- **As a** user viewing my completed resume
- **I want to** see which resume bullets came from my approved gap strategies
- **So that** I can verify strategies were integrated correctly and know what to prepare for in interviews
- **Acceptance Criteria:**
  - [x] New `StrategyAuditCard.tsx` — appears after resume completion, before export
  - [x] Maps each approved strategy to the bullet(s) that address it using `addresses_requirements` from `ResumeBullet` + `positioning_assessment` from Assembly
  - [x] Each entry shows: Requirement → Strategy Used → Resulting Bullet (with section context)
  - [x] Status indicators: "Positioned" (strategy used), "Direct Match" (no strategy needed), "Gap" (requirement not addressed)
  - [x] Entries with `strategy_used` have a subtle green accent thread connecting strategy to bullet
  - [x] Expandable: collapsed shows counts ("4 positioned, 6 direct matches, 1 gap"), expanded shows full mapping
  - [x] `cd app && npx tsc --noEmit` passes
- **Estimated complexity:** Large
- **Dependencies:** G1-3

### Story G2-2: Resume Bullet Strategy Markers [MEDIUM] — DONE
- **As a** user reading my resume
- **I want to** see which bullets were enhanced by AI gap strategies vs. taken from my original resume
- **So that** I know exactly what's new and can prepare to defend those claims
- **Acceptance Criteria:**
  - [x] Bullets with `is_new: true` show a subtle `(New)` marker (already partially implemented)
  - [x] Bullets that address a gap requirement show a small strategy icon (e.g., compass or lightbulb) on hover
  - [x] Hovering the strategy icon shows a tooltip: "This bullet addresses: [requirement]. Strategy: [positioning]"
  - [x] `addresses_requirements` data displayed as subtle tags below each bullet on hover
  - [x] Color coding: `#b5dec2` (green) for direct matches, `#afc4ff` (blue) for repositioned, `#f0d99f` (yellow) for partial
  - [x] `cd app && npx tsc --noEmit` passes
- **Estimated complexity:** Medium
- **Dependencies:** G2-1

### Story G2-3: Narrative Positioning Transparency [MEDIUM] — DONE
- **As a** user reviewing my positioning strategy
- **I want to** see how the narrative angle will be reinforced across my resume
- **So that** I understand the strategic logic before the resume is written
- **Acceptance Criteria:**
  - [x] Enhance `NarrativeStrategyCard` to show `section_guidance` — how each section will be framed
  - [x] Show `why_me_story` (full), `why_me_concise` (interview version), and `why_me_best_line` (soundbite) in expandable sections
  - [x] Show `unique_differentiators` as highlight chips
  - [x] `narrative_angle_rationale` displayed as coaching explanation
  - [x] Interview talking points shown as a "Prepare for These Questions" section
  - [x] `cd app && npx tsc --noEmit` passes
- **Estimated complexity:** Medium
- **Dependencies:** None (can parallel with G2-1)

### Story G2-4: Strategy Thread Animation [SMALL] — DONE
- **As a** user
- **I want to** visually trace how a gap strategy flows from coaching → placement → bullet
- **So that** the connection between AI coaching and the final resume is tangible
- **Acceptance Criteria:**
  - [x] When user clicks a strategy in the Strategy Audit Card, the corresponding coaching card scrolls into view with a brief highlight animation
  - [x] When user clicks a positioned bullet in the resume, the Strategy Audit Card highlights the corresponding entry
  - [x] Smooth scroll + 300ms glow animation using `border-[#afc4ff]/40` → `border-[#afc4ff]/10` fade
  - [x] Uses `scrollIntoView({ behavior: 'smooth', block: 'center' })` + CSS transition
  - [x] No external animation libraries — CSS transitions only
  - [x] `cd app && npx tsc --noEmit` passes
- **Estimated complexity:** Small
- **Dependencies:** G2-1, G2-2

### Story G2-5: "What Changed" Diff on Re-run [SMALL] — DONE
- **As a** user who re-ran with additional context
- **I want to** see what changed in my resume compared to the previous version
- **So that** I know the impact of my added context
- **Acceptance Criteria:**
  - [x] After re-run completes, show a summary card: "Changes from your added context"
  - [x] List new bullets added, bullets modified, strategies added/removed
  - [x] Use existing `DiffView.tsx` pattern for before/after on modified bullets
  - [x] Card dismissible after review
  - [x] `cd app && npx tsc --noEmit` passes
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

---

## Sprint T1: V2 Test Coverage — DONE

**Goal:** Add comprehensive test coverage for the V2 pipeline — assembly, orchestrator, all 9 LLM agents, and frontend gap coaching cards.
**Status:** DONE — committed 73f93e4

- [x] T1-1: Assembly agent tests (47 tests)
- [x] T1-2: Orchestrator tests (77 tests)
- [x] T1-3: All 9 LLM agent tests (58 tests)
- [x] T1-4: Frontend gap coaching card tests (52 tests)

Total: 234 new tests.

---

## Sprint P1: Session Persistence & Resumption — DONE

**Goal:** Save full V2 pipeline data to DB so completed sessions can be loaded from the dashboard, enabling users to revisit, edit, and re-run historical V2 resumes.
**Status:** DONE

### Story P1-1: Save Full V2 Pipeline Data [MEDIUM] — DONE
- **As a** system
- **I want to** persist all agent outputs (not just final_resume) when a V2 pipeline completes
- **So that** completed sessions can be fully hydrated in the V2 UI later
- **Acceptance Criteria:**
  - [x] `resume-v2-pipeline.ts` saves `{ version: 'v2', pipeline_data: {...}, inputs: {...} }` to `tailored_sections` JSONB
  - [x] Pipeline data includes: jobIntelligence, candidateIntelligence, benchmarkCandidate, gapAnalysis, preScores, narrativeStrategy, resumeDraft, assembly
  - [x] Inputs (resume_text, job_description) saved alongside for re-run capability
  - [x] `cd server && npx tsc --noEmit` passes

### Story P1-2: Enhance GET Result Endpoint [SMALL] — DONE
- **As a** frontend client
- **I want to** fetch full V2 pipeline data from `GET /:sessionId/result`
- **So that** loaded sessions render the complete V2 streaming display
- **Acceptance Criteria:**
  - [x] Endpoint detects `version: 'v2'` and returns `{ version, pipeline_data, inputs }`
  - [x] Legacy sessions still return `{ result: ... }` for backward compatibility
  - [x] `cd server && npx tsc --noEmit` passes

### Story P1-3: Add loadSession to useV2Pipeline [MEDIUM] — DONE
- **As a** frontend component
- **I want to** call `loadSession(sessionId)` to hydrate V2PipelineData from a completed session
- **So that** historical sessions render identically to live-streamed ones
- **Acceptance Criteria:**
  - [x] `useV2Pipeline` exports `loadSession(sessionId): Promise<{ resume_text, job_description } | false>`
  - [x] On success: hydrates all V2PipelineData fields, sets isComplete=true
  - [x] Returns saved inputs for re-run capability
  - [x] Returns false for non-V2 or incomplete sessions
  - [x] `cd app && npx tsc --noEmit` passes

### Story P1-4: Route V2 Sessions from Dashboard [MEDIUM] — DONE
- **As a** user on the dashboard
- **I want to** click a V2 session and see the full V2 resume view
- **So that** I can review, edit, and re-run historical V2 resumes
- **Acceptance Criteria:**
  - [x] `handleResumeSession` in App.tsx detects `product_type === 'resume_v2'` and routes to V2 screen
  - [x] V2ResumeScreen accepts `initialSessionId` prop, loads session on mount
  - [x] Loaded session seeds resumeText + jobDescription for re-run and inline edit context
  - [x] "New Resume" / startOver clears loaded session state
  - [x] `cd app && npx tsc --noEmit` passes

### Out of Scope (Sprint P1)
- Gap coaching card persistence (coaching is a live interaction, not saved)
- Session comparison / diff between historical runs
- Stage messages / timeline replay from history

---

## Sprint LS1: LinkedIn Studio — Unified Workspace

**Goal:** Enhance the unified LinkedIn Studio with a series management view, two new utility tools (Recruiter Search Simulator, Writing Analyzer), and a dedicated Tools tab.
**Status:** DONE — Session 80

### Story LS1-1: LinkedIn Post Generator [VERIFIED EXISTING]
- Verified the PostComposer sub-component and linkedin-content agent pipeline already provide full single-post generation.
- No new work required.

### Story LS1-2: Series Management [DONE]
- **Acceptance Criteria:**
  - [x] Calendar tab in `LinkedInStudioRoom.tsx` gains a view toggle: "Full Calendar" vs "Series View"
  - [x] `SeriesPlanner` component renders structured posts (from `useContentCalendar` `posts` array) grouped by content type
  - [x] Each content type group shows post count and average quality score
  - [x] Individual posts are collapsible — show hook, day, word count, type badge, quality badge in collapsed; full body + copy button when expanded
  - [x] Empty state when no posts have been generated
  - [x] `cd app && npx tsc --noEmit` passes

### Story LS1-3: LinkedIn Tools — Recruiter Sim & Writing Analyzer [DONE]
- **Acceptance Criteria:**
  - [x] `server/src/routes/linkedin-tools.ts` created with POST /recruiter-sim and POST /writing-analyzer
  - [x] Both endpoints use MODEL_LIGHT, are stateless, require auth
  - [x] Feature-flagged via FF_LINKEDIN_TOOLS (default false)
  - [x] Registered at /api/linkedin-tools in index.ts
  - [x] `RecruiterSimulator` component: search terms input + optional profile sections, result shows visibility score (0-100), rank assessment badge, keyword matches/gaps chips, top recommendation, expandable explanation
  - [x] `WritingAnalyzer` component: text paste area + context selector (post/headline/about/experience/comment), result shows overall score, authenticity, hook quality, engagement prediction, strengths, improvements, stronger opening suggestion
  - [x] `cd server && npx tsc --noEmit` passes (no new errors)
  - [x] `cd app && npx tsc --noEmit` passes

### Story LS1-4: Unified LinkedIn Studio Shell [DONE]
- **Acceptance Criteria:**
  - [x] `StudioTab` type extended with 'tools' variant
  - [x] New "Tools" tab added to the tab bar (Wrench icon)
  - [x] `ToolsPanel` component renders tool selector (Recruiter Sim / Writing Analyzer) + active tool below
  - [x] Tab routes to the correct sub-component
  - [x] `cd app && npx tsc --noEmit` passes

---

## Epic Complete

All sprints delivered. The Resume Agent v2 10-agent pipeline is fully built end-to-end: backend agents, orchestrator, SSE streaming, frontend intake/display/editing/export, gap coaching UX, strategy transparency, test coverage, and session persistence.

### Known Tech Debt (Separate Sprints)
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
