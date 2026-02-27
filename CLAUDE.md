# CLAUDE.md — Scrum Development Framework & Anti-Drift Rules

> **This file is the single source of truth for all development on this project.**
> **Claude MUST read and follow these rules for EVERY task, no exceptions.**

---

## CORE PRINCIPLES — READ FIRST

1. **No vibe coding.** Every line of code must trace back to a story in the current sprint.
2. **No code bloat.** Never pile on code to fix mistakes. Understand the root cause first, then apply the minimal fix.
3. **No memory loss.** Every change is documented. Every decision is logged. Context is externalized, not assumed.
4. **No scope creep.** If it's not in the current sprint, it goes in the backlog. Period.

---

## PROJECT STRUCTURE REQUIREMENTS

Every project MUST maintain the following directory:

```
/docs/
  /docs/BACKLOG.md          <- All epics and stories not yet scheduled
  /docs/CURRENT_SPRINT.md   <- Active sprint with stories and acceptance criteria
  /docs/SPRINT_LOG.md       <- Completed sprints with retrospectives
  /docs/CHANGELOG.md        <- Every change, every session, timestamped
  /docs/ARCHITECTURE.md     <- System architecture and conventions
  /docs/CONVENTIONS.md      <- Code style, error handling, naming rules
  /docs/DECISIONS.md        <- Architecture Decision Records (ADRs)
```

**If these files do not exist, Claude MUST create them before writing any code.**

---

## SCRUM WORKFLOW — MANDATORY PROCESS

### Phase 1: Epic Decomposition

When starting a new feature or project area:

1. Define the **Epic** — a large chunk of work (e.g., "User Authentication")
2. Break the epic into **Stories** using this format:

```markdown
### Story: [SHORT_TITLE]
- **As a** [user/admin/system]
- **I want to** [specific action]
- **So that** [clear outcome]
- **Acceptance Criteria:**
  - [ ] Criterion 1 (testable, specific)
  - [ ] Criterion 2
  - [ ] Criterion 3
- **Estimated complexity:** [Small / Medium / Large]
- **Dependencies:** [list any blockers or prerequisite stories]
```

3. Stories MUST be small enough to complete **in a single focused session**
4. If a story feels too big, **split it further**. No story should require more than ~300 lines of new code.

### Phase 2: Sprint Planning

1. Select stories from the backlog for the current sprint
2. A sprint = a logical batch of related stories (typically 3-7 stories)
3. Document in `CURRENT_SPRINT.md`:

```markdown
# Sprint [NUMBER]: [THEME]
**Goal:** [One sentence describing what this sprint achieves]
**Started:** [Date]

## Stories This Sprint
1. [ ] Story A — [status: not started / in progress / review / done]
2. [ ] Story B — [status]
3. [ ] Story C — [status]

## Out of Scope (Explicitly)
- [Things we are NOT doing this sprint]
```

### Phase 3: Build (Per Story)

For EACH story, Claude MUST follow this sequence:

1. **Announce** — State which story is being worked on
2. **Plan** — Outline the approach BEFORE writing code (files to change, approach, risks)
3. **Implement** — Write the minimal code to satisfy acceptance criteria
4. **Test** — Verify each acceptance criterion is met
5. **Document** — Update CHANGELOG.md with what changed and why
6. **Commit message format:** `[SPRINT-X][STORY-NAME] Brief description of change`

### Phase 4: Sprint Review & Retrospective

When all stories in a sprint are complete:

1. Review each story — did it meet acceptance criteria?
2. Document in `SPRINT_LOG.md`:

```markdown
# Sprint [NUMBER] Retrospective
**Completed:** [Date]

## What was delivered
- Story A: [summary]
- Story B: [summary]

## What went well
- [specific observations]

## What went wrong
- [specific issues encountered]

## What to improve next sprint
- [actionable improvements]

## Technical debt identified
- [anything that needs cleanup later]
```

3. Move completed stories out of CURRENT_SPRINT.md
4. Plan the next sprint

---

## CODE QUALITY RULES — ENFORCED ALWAYS

### Before Writing Any Code

- [ ] Confirm which story this code is for
- [ ] Check CONVENTIONS.md for project patterns
- [ ] Check ARCHITECTURE.md for system constraints
- [ ] Verify no duplicate functionality already exists

### While Writing Code

- **Single Responsibility:** Each function/module does ONE thing
- **No dead code:** Remove unused imports, functions, variables immediately
- **No commented-out code:** Delete it. Git has history.
- **Error handling:** Every external call (API, DB, file) has explicit error handling per CONVENTIONS.md
- **Naming:** Follow CONVENTIONS.md exactly. No abbreviations unless defined there.
- **DRY:** Before creating something new, search for existing utilities first

### When Fixing Bugs

**CRITICAL: Never pile on code to fix a bug.**

Follow this sequence:
1. **Identify** the root cause (not just the symptom)
2. **Explain** the root cause before proposing a fix
3. **Fix** at the root level with the minimal change
4. **Verify** the fix doesn't break related functionality
5. **Document** the bug and fix in CHANGELOG.md

If a fix requires more than 20 lines of new code, STOP and reassess. The fix is probably wrong.

### When Refactoring

- Refactoring is its own story — never mix refactoring with feature work
- Create a story: "Refactor [component] to [improvement]"
- Schedule it in a sprint like any other work

---

## CONTEXT DRIFT PREVENTION — ANTI-DRIFT PROTOCOL

### Session Start Protocol

At the START of every session/conversation, Claude MUST:

1. Read this CLAUDE.md file (automatic)
2. Read `CURRENT_SPRINT.md` to know what's active
3. Read `CONVENTIONS.md` to know project patterns
4. Read `CHANGELOG.md` (last 10 entries) to know recent changes
5. State: "I've reviewed the project context. Current sprint is [X], working on [story]."

### Mid-Session Verification (Every 3-5 Significant Changes)

Claude MUST pause and run this internal check:

```
DRIFT CHECK:
- Am I still working on the assigned story? [yes/no]
- Am I following the conventions in CONVENTIONS.md? [yes/no]
- Am I following the error handling patterns? [yes/no]
- Am I following the architecture in ARCHITECTURE.md? [yes/no]
- Have I introduced any code that isn't required by the current story? [yes/no]
- Confidence score for current alignment: [1-10]
```

If confidence drops below 7, Claude MUST:
1. Stop coding
2. Re-read CONVENTIONS.md and ARCHITECTURE.md
3. Review the current story's acceptance criteria
4. State what drifted and correct course

### Session End Protocol

Before ending any session, Claude MUST:

1. Update CHANGELOG.md with all changes made
2. Update story status in CURRENT_SPRINT.md
3. Note any blockers, questions, or concerns for the next session
4. If a story is incomplete, document exactly where it left off

---

## CHANGELOG FORMAT

Every entry in CHANGELOG.md follows this format:

```markdown
## [DATE] — Session [N]
**Sprint:** [number] | **Story:** [name]
**Summary:** [One sentence]

### Changes Made
- `path/to/file.ext` — [what changed and why]
- `path/to/other.ext` — [what changed and why]

### Decisions Made
- [Any architectural or design decisions, with reasoning]

### Known Issues
- [Anything discovered but not yet fixed]

### Next Steps
- [What the next session should pick up]
```

---

## ARCHITECTURE DECISION RECORDS (DECISIONS.md)

When any significant technical decision is made, log it:

```markdown
## ADR-[NUMBER]: [TITLE]
**Date:** [date]
**Status:** [proposed / accepted / deprecated / superseded]
**Context:** [What situation prompted this decision]
**Decision:** [What was decided]
**Reasoning:** [Why this choice over alternatives]
**Consequences:** [What this means going forward]
```

---

## ABSOLUTE PROHIBITIONS

Claude MUST NEVER:

1. **Write code without an active story** — If no sprint is active, plan first
2. **Install packages without documenting why** — Every dependency gets an ADR
3. **Create "temporary" fixes** — Every fix is permanent or it's a documented tech debt item
4. **Ignore existing patterns** — If the project uses pattern X, new code uses pattern X
5. **Refactor while building features** — These are separate stories, always
6. **Skip the changelog** — Every session, every change, documented
7. **Assume context from previous sessions** — Always re-read project docs at session start
8. **Add functionality beyond the current story scope** — Backlog it instead
9. **Use `any` types, `eslint-disable`, or skip error handling** — Unless explicitly permitted in CONVENTIONS.md
10. **Delete or overwrite these framework files** — They are append-only (except CURRENT_SPRINT.md which rotates)

---

## NEW PROJECT INITIALIZATION CHECKLIST

When starting a brand new project, Claude MUST complete these steps before writing ANY application code:

1. [ ] Create `/docs/` directory with all required files
2. [ ] Define at least the first epic and its stories in BACKLOG.md
3. [ ] Populate ARCHITECTURE.md with initial tech stack, folder structure, and patterns
4. [ ] Populate CONVENTIONS.md with coding standards, naming conventions, error handling approach
5. [ ] Create CURRENT_SPRINT.md with Sprint 1 stories selected from backlog
6. [ ] Initialize CHANGELOG.md with project creation entry
7. [ ] Confirm all files are created, then begin Sprint 1, Story 1

---

## EXISTING PROJECT ONBOARDING

When adding this framework to an existing project:

1. [ ] Create `/docs/` directory with all required files
2. [ ] Audit current codebase — document existing architecture in ARCHITECTURE.md
3. [ ] Document existing conventions (even informal ones) in CONVENTIONS.md
4. [ ] Identify current work in progress — create stories for it
5. [ ] Identify tech debt and bugs — add to BACKLOG.md
6. [ ] Create a "Sprint 0: Framework Onboarding" in SPRINT_LOG.md
7. [ ] Start Sprint 1 with the most critical pending work

---

## USER PROMPT TEMPLATE FOR OPTIMAL SESSIONS

When starting a new coding session, the developer should provide:

```
I'm continuing work on [PROJECT_NAME].
Current sprint: [number]
I want to work on: [story name or "next story in sprint"]
```

This gives Claude the minimal context needed to orient, and Claude will then follow the Session Start Protocol above to fully load context.

---

## THE DIAGNOSTIC PROMPT — USE WHEN THINGS FEEL OFF

If at any point the developer suspects drift or quality degradation, paste this:

```
SYSTEM VERIFICATION CHECK:
Halt current generation.
Review this CLAUDE.md file.
Review CONVENTIONS.md and ARCHITECTURE.md.
Output the exact conventions mandated for this project.
Identify deviations in your last three outputs.
Self-correct.
Output a confidence score for current alignment (1-10).
Resume only when confidence is 8 or above.
```

---

*This framework is version 1.0. Update it through the normal story/sprint process — never ad hoc.*

---
---

# Resume Agent — Product & Technical Reference

## Product Mission & Philosophy

We take mid-level executives and optimally position them for every job they apply to, starting from the premise that they are already highly qualified.

**The process**: Resume intake → job description analysis → benchmark candidate profiling (profession, industry, niche) → gap analysis comparing the user to the benchmark and JD → guided interview to fill gaps with real experience → resume crafting that positions the user as the benchmark others are compared to.

**Core insight**: Most executives' professional lives are only ~1% reflected on their resume. There is an enormous amount of real, relevant experience to surface through guided questioning. Executives are better suited for far more roles than they originally believe.

**What we are NOT**: We never fabricate experience, inflate credentials, or misrepresent clients. We better position real skills, abilities, and accomplishments. We better demonstrate why the candidate is a genuine fit.

**The goal**: The finished resume positions the executive so they are viewed as the benchmark candidate — the standard everyone else is measured against.

This philosophy must guide all LLM prompts, tool implementations, and UX decisions. When writing system prompts or section content, prioritize authentic positioning over embellishment.

## Interaction Principles

- Produce a useful draft as early as possible, then improve iteratively.
- Ask the minimum number of questions required to materially improve quality.
- Prefer targeted evidence capture over exhaustive interviewing.
- The user may navigate non-linearly across workflow steps.
- Benchmark assumptions and gap conclusions must be inspectable and editable.
- If benchmark assumptions are edited before section writing, apply them to the current run at the next safe checkpoint.
- If benchmark assumptions are edited after section writing starts, require confirmation and rebuild downstream work from gap analysis.
- Never trap the user in a step when a safe fallback draft can be produced.
- Preserve authenticity at all times; never fabricate experience, metrics, credentials, or scope.

## Question Budget & Stop Conditions

- Support three workflow modes: `fast_draft`, `balanced`, and `deep_dive`.
- `fast_draft` should aggressively reduce friction via batched questions, bundled reviews, and auto-approval of lower-risk steps.
- `balanced` should preserve quality while reducing unnecessary gates and section-by-section approvals.
- `deep_dive` may use the full interactive review experience.
- Questioning should stop when the evidence target and coverage confidence threshold are met.
- If evidence target is met but must-have coverage confidence is still below threshold, ask only a small number of high-impact follow-up questions and then draft.
- Deferred or skipped non-critical questions should not block draft generation.
- High-risk authenticity/evidence-integrity issues remain blocking in all modes.

## Technical Overview

- **Backend**: Hono + Node.js (port 3001)
- **Frontend**: Vite + React 19 + TailwindCSS (port 5173)
- **Database**: Supabase (PostgreSQL) with RLS policies
- **LLM**: Z.AI GLM models (OpenAI-compatible) as primary provider, with optional Anthropic fallback

## Monorepo Layout

```
app/                          # Frontend (Vite + React 19)
  src/components/panels/      # 11 right-panel components (panel-renderer.tsx dispatches)
  src/hooks/                  # useAgent.ts (SSE), usePipeline.ts, useSession.ts, useAuth.ts
  src/types/                  # panels.ts (PanelData union), session.ts, resume.ts
server/                       # Backend (Hono + Node.js)
  src/agents/
    runtime/                  # Agent loop, bus, protocol, context (shared infrastructure)
    knowledge/                # Rules (resume-guide), formatting-guide (structured extracts)
    strategist/               # Agent 1: Understanding + intelligence + positioning
    craftsman/                # Agent 2: Content creation + self-review
    producer/                 # Agent 3: Quality assurance + document production
    coordinator.ts            # Thin orchestrator (~800 lines) — sequences agents, manages gates
    types.ts                  # PipelineState, PipelineSSEEvent, agent I/O interfaces
  src/agent/                  # Legacy monolithic loop (used by chat route, being phased out)
  src/routes/                 # pipeline.ts, sessions.ts, resumes.ts
  src/lib/                    # llm.ts, llm-provider.ts, supabase.ts, logger.ts, feature-flags.ts
supabase/
  migrations/                 # Numbered SQL migration files
```

## Dev Setup & Commands

**Environment variables** (in `server/.env`):
- `LLM_PROVIDER` optional (defaults to `zai` when `ZAI_API_KEY` exists; can be set to `anthropic`)
- `ZAI_API_KEY`, `PERPLEXITY_API_KEY`
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- Optional: `ZAI_MODEL_PRIMARY`, `ZAI_MODEL_MID`, `ZAI_MODEL_ORCHESTRATOR`, `ZAI_MODEL_LIGHT`
- Feature flags: `FF_INTAKE_QUIZ`, `FF_RESEARCH_VALIDATION`, `FF_GAP_ANALYSIS_QUIZ`, `FF_QUALITY_REVIEW_APPROVAL`, `FF_BLUEPRINT_APPROVAL` (all default true)

**Commands**:
- Start server: `cd server && npm run dev` (port 3001)
- Start frontend: `cd app && npm run dev` (port 5173)
- TypeScript check (app): `cd app && npx tsc --noEmit`
- TypeScript check (server): `cd server && npx tsc --noEmit`
- Test credentials: `jjschrup@yahoo.com` / `Scout123`

## Server Architecture

### Agent Architecture (3 Agents + Coordinator)

This app is the cornerstone product of a 33-agent platform. It is built around 3 collaborative AI agents that demonstrate the power of agentic AI.

**Coordinator** (`server/src/agents/coordinator.ts`) — Thin orchestration layer (~800 lines) that sequences agents, manages user interaction (SSE events, gates), and routes inter-agent messages. Makes zero content decisions.

#### Resume Strategist (`server/src/agents/strategist/`)
Owns understanding, intelligence, and positioning. Interviews the candidate like a world-class executive recruiter, researches the market, identifies competitive advantages, and designs the resume strategy. Runs as an agentic loop — the LLM decides which tools to call and when to iterate.

**Tools:** `parse_resume`, `analyze_jd`, `research_company`, `build_benchmark`, `interview_candidate`, `classify_fit`, `design_blueprint`, `emit_transparency`

**Rules it owns:** `AGE_AWARENESS_RULES`, `QUALITY_CHECKLIST`, `SECTION_GUIDANCE` (structure)

#### Resume Craftsman (`server/src/agents/craftsman/`)
Owns content creation. Writes each section following the detailed rules in resume-guide.ts (section guidance, bullet frameworks, keyword targets, anti-patterns). Self-reviews every section before presenting to the user. Iterates based on feedback.

**Tools:** `write_section`, `self_review_section`, `revise_section`, `check_keyword_coverage`, `check_anti_patterns`, `check_evidence_integrity`, `present_to_user`, `emit_transparency`

**Rules it owns:** `SECTION_GUIDANCE` (writing), `RESUME_ANTI_PATTERNS`, `ATS_FORMATTING_RULES`

#### Resume Producer (`server/src/agents/producer/`)
Owns document production and quality assurance. Selects from 5 executive templates (resume-formatting-guide.md), verifies ATS compliance across 5 systems, runs multi-perspective quality checks. Can request content revisions from the Craftsman.

**Tools:** `select_template`, `adversarial_review`, `ats_compliance_check`, `humanize_check`, `check_blueprint_compliance`, `verify_cross_section_consistency`, `check_narrative_coherence`, `request_content_revision`, `emit_transparency`

**Rules it owns:** `resume-formatting-guide.md` (756 lines), 5 executive templates, ATS compatibility rules

#### Inter-Agent Communication
Agents communicate through a standard message bus (`server/src/agents/runtime/agent-bus.ts`) using a protocol designed for the 33-agent platform. The Strategist passes strategy to the Craftsman. The Craftsman passes content to the Producer. The Producer can request revisions from the Craftsman.

#### Agent Runtime (`server/src/agents/runtime/`)
- `agent-loop.ts` — Core agentic loop: multi-round LLM + tool calling with retries, timeouts
- `agent-bus.ts` — In-memory inter-agent message routing
- `agent-protocol.ts` — Standard types: AgentTool, AgentContext, AgentConfig, AgentMessage
- `agent-context.ts` — Creates runtime context (pipeline state, SSE, gates) for tools

#### Knowledge Layer (`server/src/agents/knowledge/`)
- `rules.ts` — Re-exports SECTION_GUIDANCE, QUALITY_CHECKLIST, RESUME_ANTI_PATTERNS, AGE_AWARENESS_RULES, ATS rules
- `formatting-guide.ts` — Structured extracts from resume-formatting-guide.md (templates, typography, margins)

All agent types are in `server/src/agents/types.ts` — `PipelineState`, `PipelineStage`, `PipelineSSEEvent`, and per-agent I/O interfaces.

### LLM Provider

`server/src/lib/llm-provider.ts` — `ZAIProvider` (primary) + `AnthropicProvider` (optional fallback). Selectable via `LLM_PROVIDER` env var.

### Model Routing

`server/src/lib/llm.ts` — routes tools to cost-appropriate models:

| Tier | Model | Cost (in/out per M) | Used For |
|------|-------|---------------------|----------|
| PRIMARY | glm-4.7 | $0.60/$2.20 | generate_section, propose_section_edit, adversarial_review |
| MID | glm-4.5-air | $0.20/$1.10 | classify_fit, build_benchmark |
| ORCHESTRATOR | glm-4.7-flashx | $0.07/$0.40 | Main loop, fallback for unknown tools |
| LIGHT | glm-4.7-flash | FREE | analyze_jd, humanize_check, research_*, export_resume |

### SSE Communication

Pipeline emits events via `PipelineEmitter` callback → frontend receives via fetch-based SSE connection. Key event types:
- `stage_start` / `stage_complete` — pipeline progress
- `positioning_question` — interview questions for user
- `blueprint_ready` — architect output for review
- `section_draft` / `section_revised` / `section_approved` — section lifecycle
- `quality_scores` — review results
- `pipeline_gate` → user interaction required
- `questionnaire` — structured questionnaire for user input
- `right_panel_update` — updates right-side panel content
- `pipeline_complete` / `pipeline_error` — terminal events

### Interactive Gates

Pipeline pauses at interaction points using `waitForUser()`. Frontend receives gate events, shows appropriate UI, and responds via `POST /api/pipeline/respond`. Questionnaires are gated behind feature flags (`FF_INTAKE_QUIZ`, etc.).

### Routes

- `POST /api/pipeline/start` — begins pipeline for a session
- `GET /api/pipeline/:sessionId/stream` — SSE event stream
- `POST /api/pipeline/respond` — user response to gates/questionnaires
- `GET /api/sessions/:id` — session data
- `GET/POST /api/resumes/...` — resume CRUD, PDF export

### Utilities

- `logger.ts` — pino logger with per-session child loggers
- `supabase.ts` — admin client (service key, bypasses RLS)
- `retry.ts` — `withRetry()` wrapper for flaky LLM calls
- `json-repair.ts` — repairs malformed JSON from LLM responses
- `session-lock.ts` — prevents concurrent pipeline runs per session
- `questionnaire-helpers.ts` — builds questionnaire SSE events

## Frontend Architecture

### Panel System

11 panel types rendered in the right pane, dispatched by `panel-renderer.tsx`:

`onboarding_summary` | `research_dashboard` | `gap_analysis` | `design_options` | `live_resume` | `quality_dashboard` | `completion` | `positioning_interview` | `blueprint_review` | `section_review` | `questionnaire`

Each panel type has a corresponding component in `app/src/components/panels/`. `PanelData` is a discriminated union in `app/src/types/panels.ts` — the `type` field determines which component renders.

`PanelErrorBoundary` wraps each panel to catch render errors gracefully.

### SSE Hooks

- `usePipeline.ts` — connects to `/api/pipeline/:sessionId/stream`, parses SSE events, manages panel state and gate state
- `useAgent.ts` — legacy SSE hook (being replaced by pipeline)
- `useSession.ts` — session lifecycle management
- `useAuth.ts` — Supabase auth state

### Styling

- TailwindCSS utility classes throughout
- Glass morphism design: `GlassCard`, `GlassButton`, `GlassInput` components
- `cn()` helper from `@/lib/utils` for conditional class merging
- Routing: React Router v7 with auth guard
- Auth: Supabase Auth (email/password), `AuthContext` provider

## Database

Supabase (PostgreSQL) with RLS policies on all tables. Admin client in `server/src/lib/supabase.ts` uses service key (bypasses RLS).

**Key tables**: `master_resumes`, `job_applications`, `coach_sessions`, `messages`, `resumes`, `resume_sections`, `user_positioning_profiles`, `user_usage`, `pricing_plans`, `subscriptions`, `waitlist_emails`

Migrations in `supabase/migrations/` — numbered sequentially (001-012, then timestamped).

## Key Patterns & Conventions

- **Agentic loop**: Each agent runs as a multi-round LLM loop (`agent-loop.ts`). The LLM decides which tools to call and when to stop. Tools execute against the shared `AgentContext`.
- **Agent tools**: Typed objects `{ name, description, input_schema, execute }`. Tools wrap existing pipeline functions (e.g., `parse_resume` wraps `runIntakeAgent`). The LLM sees the schema; `execute` runs when called.
- **Inter-agent messaging**: Agents communicate through `AgentBus` using standard `AgentMessage` format. The coordinator subscribes to bus events to handle cross-agent requests (e.g., Producer -> Craftsman revision requests).
- **Self-review loop**: The Craftsman writes each section, then self-reviews against quality checklist and anti-pattern list before presenting to the user. This write-review-revise cycle happens autonomously within the agent loop.
- **Pipeline gates**: `waitForUser()` pauses -> SSE event to frontend -> user interacts -> `POST /api/pipeline/respond` -> pipeline resumes.
- **Tool-to-model routing**: `getModelForTool(toolName)` in `llm.ts` maps each tool to the right cost tier. Agent loops use `MODEL_ORCHESTRATOR` (cheap) for reasoning; individual tools route to their own cost tiers.
- **Panel rendering**: `panel-renderer.tsx` maps `PanelData.type` -> component. `PanelErrorBoundary` wraps each panel.
- **Message format**: Internal content-block format; `ZAIProvider` translates to/from OpenAI format when active.
- **Imports**: `@/` alias for app imports; `.js` extensions for server imports (ESM).
- **Error handling**: Pipeline wraps each stage in try/catch, emits `pipeline_error` events. Never throw from SSE handlers.
- **TypeScript**: Strict mode. Both `app/` and `server/` must pass `tsc --noEmit`. Avoid `any` where possible.
- **JSON repair**: LLM responses often contain malformed JSON — `json-repair.ts` handles this.
- **Session locks**: `session-lock.ts` prevents concurrent pipeline runs on the same session.

## Known Issues

- **Z.AI API latency**: 1-5 min per call; timeouts at 3min (chat) / 5min (stream) in `llm-provider.ts`
- **Z.AI type coercion**: Sometimes returns objects where strings expected — runtime coercion in several tools
- **MaxListenersExceededWarning**: Abort listeners exceed 10 on long sessions
- **Revision loops (Bug 16)**: Agent may re-propose edits after user approves a section
- **Context forgetfulness (Bug 17)**: Agent may forget completed sections on long sessions (context window)
- **409 Conflict (Bug 18)**: Frontend sends messages while agent is still processing
- **PDF Unicode**: Check PDF exports for `?` characters replacing special chars

## Testing & Verification

- **Server**: 53 tests passing (`cd server && npx vitest run`)
- **App**: 19 tests passing (`cd app && npx vitest run`)
- **E2E full pipeline**: 2 tests passing (`npx playwright test --project=full-pipeline`, ~28 min)
- TypeScript compilation (`tsc --noEmit`) is the primary CI gate
- Manual E2E: Login with test credentials -> start new session -> paste JD -> run through all stages -> export PDF
