# Epic: Resume Agent v2 — 10-Agent Rebuild

**Goal:** Replace the 3-agent assembly-line pipeline with a 10-agent strategic positioning engine. Two-field intake, streaming accumulation UX, inline AI editing, creative gap analysis.
**Design Blueprint:** `docs/obsidian/30_Specs & Designs/Resume Agent v2 — Design Blueprint.md`
**ADR:** ADR-042

---

## Sprint V2-1: Tear Down + Foundation

**Goal:** Remove the old pipeline, define the new agent interfaces, build the first 3 analysis agents.
**Started:** 2026-03-11

### Story V2-1.1: Delete Old Resume Pipeline [LARGE]
- **As a** developer
- **I want to** remove all code for the Strategist/Craftsman/Producer pipeline
- **So that** the codebase is clean for the new 10-agent architecture
- **Acceptance Criteria:**
  - [ ] Delete `agents/strategist/` (entire directory)
  - [ ] Delete `agents/craftsman/` (entire directory)
  - [ ] Delete `agents/producer/` (entire directory)
  - [ ] Delete `agents/coordinator.ts`
  - [ ] Delete `agents/resume/` (product.ts, event-middleware.ts, route-hooks.ts)
  - [ ] Delete `agents/schemas/`
  - [ ] Delete `agents/knowledge/`
  - [ ] Delete `agents/architect.ts`, `agents/positioning-coach.ts`, `agents/section-writer.ts`
  - [ ] Delete `agents/intake.ts`, `agents/research.ts`, `agents/gap-analyst.ts`, `agents/quality-reviewer.ts`
  - [ ] Delete `agents/master-resume-merge.ts`, `agents/ats-rules.ts`, `agents/section-suggestion*.ts`
  - [ ] Delete `routes/resume-pipeline.ts`
  - [ ] Update `index.ts` — remove old pipeline imports
  - [ ] Clean `lib/feature-flags.ts` — remove pipeline-specific flags
  - [ ] `cd server && npx tsc --noEmit` passes (fix all broken imports)
  - [ ] Server starts without errors
- **Estimated complexity:** Large
- **Dependencies:** None

### Story V2-1.2: Define v2 Agent Types + Interfaces [MEDIUM]
- **As a** developer
- **I want to** define TypeScript interfaces for all 10 agent inputs/outputs
- **So that** agents have clear contracts before implementation begins
- **Acceptance Criteria:**
  - [ ] `agents/resume-v2/types.ts` — all agent I/O interfaces defined
  - [ ] JobIntelligenceOutput: competencies, responsibilities, cultural signals, seniority, business problems, hiring signals, company name
  - [ ] CandidateIntelligenceOutput: career themes, leadership scope, outcomes, industries, technologies, scale, contact info
  - [ ] BenchmarkCandidateOutput: ideal candidate profile per role
  - [ ] GapAnalysisOutput: requirement classifications (strong/partial/missing), evidence, creative strategies
  - [ ] NarrativeStrategyOutput: positioning narrative, themes, "Why Me" story, branded title
  - [ ] ResumeDraftOutput: complete resume document with sections
  - [ ] TruthVerificationOutput: claim-by-claim verification, flagged items
  - [ ] ATSOptimizationOutput: match score, missing keywords, suggestions
  - [ ] ExecutiveToneOutput: tone audit, flagged phrases, replacements
  - [ ] OrchestratorState: full pipeline state tracking all agent outputs
  - [ ] `cd server && npx tsc --noEmit` passes
- **Estimated complexity:** Medium
- **Dependencies:** V2-1.1

### Story V2-1.3: Resume Rules Knowledge Base [SMALL]
- **As a** Resume Writer agent
- **I want to** have the full resume writing rulebook available as structured data
- **So that** my prompts produce output following the executive resume rulebook
- **Acceptance Criteria:**
  - [ ] `agents/resume-v2/knowledge/resume-rules.ts` — all rules from design blueprint
  - [ ] Document format rules (2 pages, reverse-chron, single-column)
  - [ ] Section rules (header, exec summary, competencies, accomplishments, experience, earlier career, education)
  - [ ] Writing rules (action verbs, impact metrics, leader voice, authentic tone)
  - [ ] Age-proofing rules (no grad dates for 45+, no outdated tech, etc.)
  - [ ] Guardrails (no fabrication, verified metrics, reframing over inventing)
  - [ ] Banned phrases list
  - [ ] Exported as structured objects the agents can consume in prompts
  - [ ] `cd server && npx tsc --noEmit` passes
- **Estimated complexity:** Small
- **Dependencies:** V2-1.1

### Story V2-1.4: Job Intelligence Agent [MEDIUM]
- **As a** pipeline
- **I want to** extract structured intelligence from a job description
- **So that** downstream agents know exactly what the hiring manager wants
- **Acceptance Criteria:**
  - [ ] `agents/resume-v2/job-intelligence/agent.ts` — single-prompt agent (not agentic loop)
  - [ ] Input: raw JD text
  - [ ] Output: `JobIntelligenceOutput` — competencies, responsibilities, cultural signals, seniority level, business problems, hidden hiring signals, extracted company name
  - [ ] Model: MODEL_MID
  - [ ] Prompt ignores HR fluff, focuses on what hiring manager actually cares about
  - [ ] Extracts company name from JD (no separate field needed)
  - [ ] Unit tests with real JD examples
  - [ ] `cd server && npx tsc --noEmit` passes
- **Estimated complexity:** Medium
- **Dependencies:** V2-1.2

### Story V2-1.5: Candidate Intelligence Agent [MEDIUM]
- **As a** pipeline
- **I want to** parse a resume into a structured candidate profile
- **So that** downstream agents have quantified achievements and contact info
- **Acceptance Criteria:**
  - [ ] `agents/resume-v2/candidate-intelligence/agent.ts` — single-prompt agent
  - [ ] Input: raw resume text
  - [ ] Output: `CandidateIntelligenceOutput` — career themes, leadership scope, quantified outcomes, industry depth, technologies, operational scale, career span, contact info (name, phone, email, LinkedIn)
  - [ ] Model: MODEL_MID
  - [ ] Detects hidden accomplishments (infers budget from team size, etc.)
  - [ ] Parses contact info accurately — **no "John Doe" ever**
  - [ ] Unit tests with real resume examples
  - [ ] `cd server && npx tsc --noEmit` passes
- **Estimated complexity:** Medium
- **Dependencies:** V2-1.2

### Story V2-1.6: Benchmark Candidate Agent [MEDIUM]
- **As a** pipeline
- **I want to** construct the ideal candidate profile for a specific role
- **So that** the gap analysis has a target to compare against
- **Acceptance Criteria:**
  - [ ] `agents/resume-v2/benchmark-candidate/agent.ts` — single-prompt agent
  - [ ] Input: `JobIntelligenceOutput` + industry context
  - [ ] Output: `BenchmarkCandidateOutput` — the hiring manager's ideal hire
  - [ ] Model: MODEL_PRIMARY (this is the most important agent)
  - [ ] Builds a realistic archetype, not a fantasy
  - [ ] Includes expected achievements, leadership scope, industry knowledge, technical skills
  - [ ] Unit tests
  - [ ] `cd server && npx tsc --noEmit` passes
- **Estimated complexity:** Medium
- **Dependencies:** V2-1.2

## Out of Scope (Explicitly)
- Frontend changes (Sprint V2-3)
- Inline editing UX (Sprint V2-3)
- "Add Context" re-run flow (Sprint V2-3)
- Export enhancements
- Tests for deleted code (they go away with the code)

---

## Sprint V2-2: Strategy + Creation + Verification

**Goal:** Build the remaining 7 agents (Gap Analysis, Narrative Strategy, Resume Writer, 3 verification agents, Assembly) and wire the orchestrator.

### Story V2-2.1: Gap Analysis Agent [LARGE]
- **As a** pipeline
- **I want to** compare the candidate against the benchmark with creative positioning strategies
- **So that** partial/missing gaps get solved, not just classified
- **Acceptance Criteria:**
  - [ ] `agents/resume-v2/gap-analysis/agent.ts` — single-prompt agent
  - [ ] Input: `CandidateIntelligenceOutput` + `BenchmarkCandidateOutput` + `JobIntelligenceOutput`
  - [ ] Output: `GapAnalysisOutput` — requirement-by-requirement (strong/partial/missing), evidence, creative strategies
  - [ ] Model: MODEL_PRIMARY
  - [ ] Creative strategies: infer budgets from team size (back off 10-20%), reframe adjacent skills, position working knowledge
  - [ ] Strategies presented as suggestions user can confirm/reject
  - [ ] Unit tests covering creative strategy generation
  - [ ] `cd server && npx tsc --noEmit` passes
- **Estimated complexity:** Large
- **Dependencies:** V2-1.4, V2-1.5, V2-1.6

### Story V2-2.2: Narrative Strategy Agent [MEDIUM]
- **As a** pipeline
- **I want to** generate the positioning narrative, "Why Me" story, and branded title
- **So that** the Resume Writer has strategic guardrails and the user has their positioning story
- **Acceptance Criteria:**
  - [ ] `agents/resume-v2/narrative-strategy/agent.ts` — single-prompt agent
  - [ ] Input: `GapAnalysisOutput` + `CandidateIntelligenceOutput` + `JobIntelligenceOutput`
  - [ ] Output: `NarrativeStrategyOutput` — primary narrative, supporting themes, "Why Me" story, branded title line
  - [ ] Model: MODEL_PRIMARY
  - [ ] Only chooses narratives supported by real evidence
  - [ ] "Why Me" story quality matches the Dan Baumann example standard
  - [ ] Unit tests
  - [ ] `cd server && npx tsc --noEmit` passes
- **Estimated complexity:** Medium
- **Dependencies:** V2-2.1

### Story V2-2.3: Resume Writer Agent [LARGE]
- **As a** pipeline
- **I want to** generate a complete 2-page resume in a single pass
- **So that** the output feels like a $3,000 executive resume writer produced it
- **Acceptance Criteria:**
  - [ ] `agents/resume-v2/resume-writer/agent.ts` — single powerful prompt, NOT a tool-calling loop
  - [ ] Input: all outputs from agents 1-5 + resume rules knowledge base + user-approved gap strategies
  - [ ] Output: `ResumeDraftOutput` — complete structured resume with all sections
  - [ ] Model: MODEL_PRIMARY
  - [ ] Resume structure per rulebook: Header → Exec Summary → Core Competencies → Selected Accomplishments → Professional Experience → Earlier Career → Education
  - [ ] `(New)` markers on all AI-enhanced content not from original resume
  - [ ] Follows all writing rules, age-proofing, banned phrases
  - [ ] Creative authority within strategic guardrails from Narrative Strategy
  - [ ] Unit tests with real resume + JD input
  - [ ] `cd server && npx tsc --noEmit` passes
- **Estimated complexity:** Large
- **Dependencies:** V2-2.2, V2-1.3

### Story V2-2.4: Verification Agents (Truth + ATS + Tone) [MEDIUM]
- **As a** pipeline
- **I want to** verify the resume draft for accuracy, ATS compliance, and executive tone
- **So that** no hallucinated claims, missing keywords, or junior language make it to the user
- **Acceptance Criteria:**
  - [ ] `agents/resume-v2/truth-verification/agent.ts` — MODEL_MID, claim-by-claim verification against source data
  - [ ] `agents/resume-v2/ats-optimization/agent.ts` — MODEL_LIGHT, keyword match score, missing keywords, formatting check
  - [ ] `agents/resume-v2/executive-tone/agent.ts` — MODEL_MID, flag junior/AI language, banned phrases, passive voice
  - [ ] All 3 run in parallel after Resume Writer completes
  - [ ] Each produces structured output per its interface
  - [ ] Unit tests for each
  - [ ] `cd server && npx tsc --noEmit` passes
- **Estimated complexity:** Medium
- **Dependencies:** V2-2.3

### Story V2-2.5: Resume Assembly Agent [SMALL]
- **As a** pipeline
- **I want to** merge verification feedback into the final document
- **So that** the user gets a clean, verified, formatted resume
- **Acceptance Criteria:**
  - [ ] `agents/resume-v2/assembly/agent.ts` — deterministic (no LLM), applies verification fixes
  - [ ] Input: resume draft + truth verification + ATS optimization + tone audit
  - [ ] Output: final structured document ready for rendering/export
  - [ ] Max 2 pages enforced
  - [ ] `cd server && npx tsc --noEmit` passes
- **Estimated complexity:** Small
- **Dependencies:** V2-2.4

### Story V2-2.6: Orchestrator + SSE Streaming [LARGE]
- **As a** user
- **I want to** see analysis results accumulating on screen as agents complete
- **So that** I can read each stage while later stages are still generating
- **Acceptance Criteria:**
  - [ ] `agents/resume-v2/orchestrator.ts` — thin coordinator, zero content decisions
  - [ ] Sequences: [1,2] parallel → 3 → 4 → 5 → 6 → [7,8,9] parallel → 10
  - [ ] SSE events stream each agent's output as it completes (accumulation, not replacement)
  - [ ] New `routes/resume-v2-pipeline.ts` using `createProductRoutes()`
  - [ ] Pipeline state tracks all agent outputs
  - [ ] Error handling — individual agent failure doesn't kill entire pipeline
  - [ ] `cd server && npx tsc --noEmit` passes
- **Estimated complexity:** Large
- **Dependencies:** V2-2.5

---

## Sprint V2-3: Frontend + Polish

**Goal:** Build the new frontend experience — two-field intake, streaming display, inline AI editing, "Add Context" flow, export.

### Story V2-3.1: Two-Field Intake + Streaming Display [LARGE]
- **As a** user
- **I want to** paste my resume + JD and see results accumulating
- **So that** I get a complete draft in under 2 minutes with visible progress
- **Acceptance Criteria:**
  - [ ] New intake screen: two text areas (resume + JD), single "Go" button
  - [ ] Streaming display: each agent's output appears and stays visible
  - [ ] Five stages visible: "What they're looking for" → "What you bring" → "The benchmark" → "Your positioning" → "Your resume"
  - [ ] Nothing flashes by — user can scroll up while later stages generate
  - [ ] Delete old panel components, panel-renderer, CoachScreen, InterviewLayout
  - [ ] Delete old pipeline hooks (usePipelineStateManager, useSSEEventHandlers, etc.)
  - [ ] `cd app && npx tsc --noEmit` passes
- **Estimated complexity:** Large
- **Dependencies:** V2-2.6

### Story V2-3.2: Inline AI Editing on Resume Document [LARGE]
- **As a** user
- **I want to** select text in my resume and apply AI actions
- **So that** I can refine my resume with AI assistance directly on the document
- **Acceptance Criteria:**
  - [ ] `LiveResumeDocument.tsx` adapted for inline editing
  - [ ] Floating toolbar on text selection: Strengthen | + Metrics | Shorten | + Keywords | Rewrite | Custom | "Not my voice"
  - [ ] Each action sends selected text + full context + JD to LLM
  - [ ] Diff view (original vs. new) with Accept/Reject
  - [ ] Undo/redo stack
  - [ ] `(New)` markers on AI-enhanced content with accept/reject per item
  - [ ] `cd app && npx tsc --noEmit` passes
- **Estimated complexity:** Large
- **Dependencies:** V2-3.1

### Story V2-3.3: Live ATS Score Sidebar [SMALL]
- **As a** user
- **I want to** see my ATS match score update in real time as I edit
- **So that** I know how my changes affect keyword matching
- **Acceptance Criteria:**
  - [ ] Persistent sidebar/header showing ATS Match Score, Truth Score, Top 3 Quick Wins
  - [ ] Score updates after every edit (debounced)
  - [ ] Backend endpoint for on-demand ATS re-scoring
  - [ ] `cd app && npx tsc --noEmit` passes
- **Estimated complexity:** Small
- **Dependencies:** V2-3.2

### Story V2-3.4: "Add Context" Re-Run Flow [MEDIUM]
- **As a** user
- **I want to** tell the system what it missed and get an updated resume
- **So that** hidden experience gets integrated without answering interview questions
- **Acceptance Criteria:**
  - [ ] Text area below gap analysis: "Tell us what we missed"
  - [ ] Submit triggers re-run: Gap Analysis → Narrative Strategy → Resume Writer → Verification
  - [ ] New context merged into Candidate Intelligence before re-run
  - [ ] Updated resume shows `(New)` markers on changed content
  - [ ] Gap analysis and ATS score update accordingly
  - [ ] `cd app && npx tsc --noEmit` passes
- **Estimated complexity:** Medium
- **Dependencies:** V2-3.1

### Story V2-3.5: Gap Strategy Confirmation UX [SMALL]
- **As a** user
- **I want to** review and approve/reject creative gap strategies before they're used
- **So that** I only claim things I can defend in an interview
- **Acceptance Criteria:**
  - [ ] Gap analysis display shows each strategy with approve/reject toggle
  - [ ] Inferred numbers shown with conservative estimates (10-20% back-off)
  - [ ] Only approved strategies passed to Resume Writer
  - [ ] `cd app && npx tsc --noEmit` passes
- **Estimated complexity:** Small
- **Dependencies:** V2-3.1

### Story V2-3.6: Export + App Routing Cleanup [MEDIUM]
- **As a** user
- **I want to** download my finished resume as DOCX or PDF
- **So that** I have an ATS-optimized document ready to submit
- **Acceptance Criteria:**
  - [ ] Export buttons (DOCX primary, PDF secondary) on completed resume
  - [ ] Existing export libs wired to new resume structure
  - [ ] `App.tsx` updated with new routing (remove old pipeline routes)
  - [ ] `Header.tsx` simplified
  - [ ] Delete remaining old frontend files (WorkspaceShell, ModeTransition, etc.)
  - [ ] `cd app && npx tsc --noEmit` passes
- **Estimated complexity:** Medium
- **Dependencies:** V2-3.2

## Out of Scope (Explicitly)
- Thematic Agent (company voice matching) — future sprint
- Redis/distributed bus — not needed yet
- Other products (Coach, LinkedIn, Job Command Center) — untouched
- E2E test suite rebuild — separate sprint after frontend stabilizes
