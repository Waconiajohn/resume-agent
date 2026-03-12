# CLAUDE.md — CareerIQ Platform Development Framework

> **This file is the single source of truth for all development on this project.**
> **Claude MUST read and follow every rule in this file for EVERY task, no exceptions.**
> **When in doubt: read this file again before writing a single line of code.**

---

## ⚡ MANDATORY SESSION START — DO THIS FIRST, EVERY TIME

Before touching any code, Claude MUST complete this checklist in order:

1. Read this CLAUDE.md (automatic)
2. Read `CURRENT_SPRINT.md` — know what is active
3. Read `CONVENTIONS.md` — know project patterns
4. Read last 10 entries of `CHANGELOG.md` — know recent changes
5. Read `docs/obsidian/10_Resume Agent/Project Hub.md` — platform context and agent inventory
6. Read `docs/obsidian/10_Resume Agent/Status.md` — current health, concerns, recent decisions
7. If working on a specific agent, read its note from `docs/obsidian/10_Resume Agent/Agents/`
8. Declare: **"I've reviewed the project context. Current sprint is [X], working on [story]."**

This is non-negotiable. No exceptions. No shortcuts.

---

## CORE PRINCIPLES

1. **No vibe coding.** Every line of code traces back to a story in the current sprint.
2. **No code bloat.** Never pile on code to fix mistakes. Find the root cause. Apply the minimal fix.
3. **No memory loss.** Every change is documented. Every decision is logged. Context is externalized, not assumed.
4. **No scope creep.** If it's not in the current sprint, it goes in the backlog. Period.
5. **Agent-first, always.** Every feature must maximize the power of AI agents. Procedural pipelines are a last resort, never a first choice.

---

## 🤖 AGENT-FIRST ARCHITECTURE MANDATE

This platform is built around AI agents. This is not a preference — it is the architecture. Every feature, workflow, and data pipeline must maximize agent autonomy, creativity, and inter-agent communication.

### Before Writing Any Code, Ask These Questions

- Can an agent own this workflow end-to-end?
- Should a **new specialized agent** be created for this capability?
- Are agents communicating results to each other through the knowledge graph and agent bus?
- Is this the most agent-empowered solution possible — or just the easiest one to code?
- If a human had to oversee this, how do we eliminate that dependency through better agent design?

**If a new feature doesn't fit cleanly into an existing agent's domain, propose a new agent first. Do not write procedural code as a workaround.**

### Current Agent Roster (Resume Agent — Cornerstone Product)

| Agent | Domain |
|-------|--------|
| Resume Strategist | Candidate understanding, market research, positioning strategy |
| Resume Craftsman | Section writing, self-review, iterative revision |
| Resume Producer | Quality assurance, template selection, ATS compliance, document production |

This app is the cornerstone of a **33-agent platform**. Every agent built here sets the pattern for the platform. Build them right.

### Platform Service Lines (Full Scope)

The platform serves four lines, each powered by its own agent layer:

- **Career Coaching** — Resume writer, job board, LinkedIn profile builder, LinkedIn networker, interview prep, salary negotiation
- **Outplacement** — Employer-sponsored career transition services
- **Recruiting** — AI-driven talent matching and sourcing
- **Retirement Planning** — Financial wellness and planning (RIA-integrated)

When building features, consider cross-agent utility. A tool built for the Resume Strategist may serve the LinkedIn Profile agent. Design for reuse.

### Agent Design Standards

When a new agent is needed:

1. Define the agent's **single domain** — what it owns, what it does not own
2. Define its **tool set** — typed tool objects with Zod schemas
3. Define its **model routing tier** — which tier handles reasoning vs. execution
4. Define its **inter-agent communication** — what it sends and receives on the AgentBus
5. Create its Obsidian note in `docs/obsidian/10_Resume Agent/Agents/`
6. Update the agent table in `Project Hub.md`
7. Use `agent-tool-scaffold` skill for all new tools

**Never create agent-like functionality inside a route, utility, or coordinator. Agents own their domains.**

---

## 🚫 LEGACY REPO RULE — NON-NEGOTIABLE

An older codebase exists and is accessible for reference. It is **ideas only**.

| ✅ Permitted | ❌ Prohibited |
|-------------|--------------|
| Read it to understand what a feature was trying to accomplish | Copy any code from it |
| Use it to identify logic flows worth reimagining | Adapt or port any of its patterns |
| Draw inspiration for feature scope | Use its architecture as a template |
| Identify gaps the old system had | Treat any of its code as a starting point |

**The old codebase is procedural, non-agent, and pre-AI. Its architecture is incompatible with this platform by design.**

If you find yourself writing something that structurally resembles the old repo — stop. Redesign it agent-first from scratch.

---

## PROJECT STRUCTURE REQUIREMENTS

Every project MUST maintain this directory:

```
/docs/
  BACKLOG.md          ← All epics and stories not yet scheduled
  CURRENT_SPRINT.md   ← Active sprint with stories and acceptance criteria
  SPRINT_LOG.md       ← Completed sprints with retrospectives
  CHANGELOG.md        ← Every change, every session, timestamped
  ARCHITECTURE.md     ← System architecture and conventions
  CONVENTIONS.md      ← Code style, error handling, naming rules
  DECISIONS.md        ← Architecture Decision Records (ADRs)
```

**If these files do not exist, Claude MUST create them before writing any code.**

---

## SCRUM WORKFLOW

### Phase 1: Epic Decomposition

When starting a new feature area:

1. Define the **Epic** (e.g., "LinkedIn Profile Agent")
2. Break it into **Stories** using this format:

```markdown
### Story: [SHORT_TITLE]
- **As a** [user/admin/system]
- **I want to** [specific action]
- **So that** [clear outcome]
- **Acceptance Criteria:**
  - [ ] Criterion 1 (testable, specific)
  - [ ] Criterion 2
- **Estimated complexity:** [Small / Medium / Large]
- **Dependencies:** [list any blockers or prerequisite stories]
```

Stories must be completable in a single focused session. No story should require more than ~300 lines of new code. If it feels too big, split it.

### Phase 2: Sprint Planning

```markdown
# Sprint [NUMBER]: [THEME]
**Goal:** [One sentence describing what this sprint achieves]
**Started:** [Date]

## Stories This Sprint
1. [ ] Story A — [not started / in progress / review / done]
2. [ ] Story B
3. [ ] Story C

## Out of Scope (Explicitly)
- [Things we are NOT doing this sprint]
```

### Phase 3: Build (Per Story)

For EACH story, follow this sequence without exception:

1. **Announce** — State which story is being worked on
2. **Plan** — Outline the approach BEFORE writing code (files to change, approach, risks)
3. **Implement** — Write the minimal code to satisfy acceptance criteria
4. **Test** — Verify each acceptance criterion is met
5. **Document** — Update CHANGELOG.md
6. **Commit format:** `[SPRINT-X][STORY-NAME] Brief description`

### Phase 4: Sprint Retrospective

```markdown
# Sprint [NUMBER] Retrospective
**Completed:** [Date]

## What was delivered
## What went well
## What went wrong
## What to improve next sprint
## Technical debt identified
```

Move completed stories out of CURRENT_SPRINT.md. Plan the next sprint.

---

## CODE QUALITY RULES

### Before Writing Any Code

- [ ] Confirm which story this code belongs to
- [ ] Check CONVENTIONS.md for project patterns
- [ ] Check ARCHITECTURE.md for system constraints
- [ ] Verify no duplicate functionality already exists

### While Writing Code

- **Single Responsibility** — each function/module does ONE thing
- **No dead code** — remove unused imports, functions, variables immediately
- **No commented-out code** — delete it, Git has history
- **Error handling** — every external call (API, DB, file) has explicit error handling per CONVENTIONS.md
- **Naming** — follow CONVENTIONS.md exactly, no ad hoc abbreviations
- **DRY** — search for existing utilities before creating new ones

### Bug Fixing Protocol

**Never pile on code to fix a bug.**

1. **Identify** the root cause (not the symptom)
2. **Explain** the root cause before proposing a fix
3. **Fix** at the root level with minimal change
4. **Verify** the fix doesn't break related functionality
5. **Document** in CHANGELOG.md

If a fix requires more than 20 lines of new code, stop and reassess. The fix is probably wrong.

### Refactoring Rule

Refactoring is always its own story. Never mix refactoring with feature work. Schedule it like any other sprint story.

---

## CONTEXT DRIFT PREVENTION

### Mid-Session Verification (Every 3–5 Significant Changes)

Run this internal check:

```
DRIFT CHECK:
- Am I still working on the assigned story? [yes/no]
- Am I following CONVENTIONS.md? [yes/no]
- Am I following ARCHITECTURE.md? [yes/no]
- Have I introduced code not required by the current story? [yes/no]
- Am I maximizing agent autonomy in this implementation? [yes/no]
- Confidence score: [1-10]
```

If confidence drops below 7:
1. Stop coding
2. Re-read CONVENTIONS.md and ARCHITECTURE.md
3. Review the current story's acceptance criteria
4. State what drifted and correct course

### Post-Implementation Review (Before Declaring "Done")

After completing any batch of implementation work — whether a single story, multiple stories, or autonomous agent work — Claude MUST run a semantic review pass before declaring the work complete. This catches logic bugs, data flow gaps, and semantic errors that TypeScript compilation cannot detect.

Review checklist:
1. **Data flow completeness** — Does every UI input reach the backend? Does every backend response reach the UI?
2. **Edge cases** — Division by zero, empty arrays, null/undefined vs falsy (e.g., `!score` hides score of 0)
3. **Business logic correctness** — Are approvals, gates, and state transitions doing what the user expects?
4. **Event timing** — Are SSE events emitted at the right moment, not one step early/late?
5. **Enum/constant alignment** — Do frontend and backend use the same string values?
6. **Initialization** — Are arrays, objects, and accumulators initialized before first use?
7. **Resource limits** — Are `max_tokens`, `max_rounds`, `slice()` limits sufficient for real-world data?

For autonomous/subagent work: each agent MUST run this review on its own output before completing. The orchestrating session MUST also run a cross-agent review after merging.

### Pre-Commit Hook (Automated)

A Claude Code hook at `.claude/hooks/pre-commit-check.sh` runs automatically before every `git commit`. It compiles both `app/` and `server/` with `tsc --noEmit` and blocks the commit if either fails. This is enforced by `.claude/settings.json` — do not remove or bypass it.

### Session End Protocol

Before ending any session, Claude MUST:

1. Update CHANGELOG.md with all changes made
2. Update story status in CURRENT_SPRINT.md
3. Update `docs/obsidian/10_Resume Agent/Status.md` with current health, concerns, test counts
4. Note any blockers, questions, or concerns for the next session
5. If a story is incomplete, document exactly where it left off

---

## CHANGELOG FORMAT

```markdown
## [DATE] — Session [N]
**Sprint:** [number] | **Story:** [name]
**Summary:** [One sentence]

### Changes Made
- `path/to/file.ext` — [what changed and why]

### Decisions Made
- [Architectural or design decisions with reasoning]

### Known Issues
- [Discovered but not yet fixed]

### Next Steps
- [What the next session should pick up]
```

---

## ARCHITECTURE DECISION RECORDS

```markdown
## ADR-[NUMBER]: [TITLE]
**Date:** [date]
**Status:** [proposed / accepted / deprecated / superseded]
**Context:** [What situation prompted this]
**Decision:** [What was decided]
**Reasoning:** [Why this over alternatives]
**Consequences:** [What this means going forward]
```

---

## OBSIDIAN KNOWLEDGE BASE (`docs/obsidian/`)

The Obsidian vault is the platform's extended memory. It contains navigable reference notes on architecture, all agents, model routing, SSE events, and the platform blueprint.

```
docs/obsidian/
  10_Resume Agent/
    Project Hub.md          ← Central entry point (read at session start)
    Architecture Overview.md
    Platform Blueprint.md
    Model Routing.md
    SSE Event System.md
    Agents/                 ← One note per agent (#1–#20+)
  20_Prompts/               ← Prompt patterns and templates
  30_Specs & Designs/       ← Feature specs, UX flows
  40_Snippets & APIs/       ← Code patterns, API contracts
  Templates/                ← Note templates
```

### Vault Maintenance (Mandatory)

| Event | Action |
|-------|--------|
| New agent built | Create note in `Agents/`, update agent table in `Project Hub.md` |
| Architecture changes | Update `Architecture Overview.md`, `Model Routing.md`, or `SSE Event System.md` |
| Session end | Update `Status.md` with test counts, concerns, decisions |
| New prompt pattern | Add to `20_Prompts/` |
| Significant bug fixed | Add postmortem to `40_Snippets & APIs/` |
| New feature spec | Add to `30_Specs & Designs/` |

Rules: reference don't duplicate, one concept per note, use tags consistently (`#agent/name`, `#status/todo|in-progress|done`, `#type/spec|decision|bug|prompt`, `#sprint/N`).

---

## CLAUDE CODE SKILLS — USE PROACTIVELY

Skills in `~/.claude/skills/` encode this project's patterns. **Use them automatically when the task matches — don't wait to be asked.**

| Trigger | Skill | What it does |
|---------|-------|-------------|
| Adding a new agent tool | **agent-tool-scaffold** | Creates tool def, Zod schema, model routing in llm.ts, agent registration, test file |
| Adding a new SSE event or panel | **sse-event-pipeline** | Creates PanelData union type, backend emission, event handler, panel component, panel-renderer case |
| Before ANY commit | **qa-gate** | Runs tsc (app + server), import resolution, stale closures |
| Starting/ending a session | **scrum-session** | Automates Session Start/End Protocol |
| After implementing any feature | **component-test-gen** | Generates tests with project-specific mocks |
| Creating/modifying DB tables | **supabase-migration** | Generates migration with RLS policies |
| Making architectural decisions | **adr-writer** | Creates ADR in docs/DECISIONS.md |
| Adding error handling | **error-pattern** | Pipeline error emission, Pino logging, Sentry integration |
| Modifying prompts or model routing | **llm-prompt-lab** | Prompt versioning, cost estimation, model-specific handling |
| Suspecting unused code | **dead-code-hunter** | Scans for orphaned components, unused exports, legacy agent code |

### Mandatory Skill Usage

1. **qa-gate** — MUST run before every commit. Both `app` and `server` tsc must pass.
2. **agent-tool-scaffold** — MUST use when adding tools to any agent. The 5-file sequence is error-prone without it — especially the model routing entry in `llm.ts`, which silently falls back to the wrong tier if missing.
3. **sse-event-pipeline** — MUST use when adding new panel types. The 4-file sequence must stay in sync.
4. **scrum-session** — SHOULD use at session start/end.
5. **component-test-gen** — SHOULD generate tests for new components.

### Quality Floor (Do Not Regress Below)

- Server tests: **1,014 passing, 0 failures**
- App tests: **586 passing, 0 failures**
- TypeScript: both `app` and `server` tsc must pass

---

## ABSOLUTE PROHIBITIONS

Claude MUST NEVER:

1. **Write code without an active story** — no sprint active means plan first
2. **Install packages without documenting why** — every dependency gets an ADR
3. **Create "temporary" fixes** — every fix is permanent or it's documented tech debt
4. **Ignore existing patterns** — if the project uses pattern X, new code uses pattern X
5. **Refactor while building features** — always separate stories
6. **Skip the changelog** — every session, every change, documented
7. **Assume context from previous sessions** — always re-read project docs at session start
8. **Add functionality beyond current story scope** — backlog it instead
9. **Use `any` types, `eslint-disable`, or skip error handling** — unless explicitly permitted in CONVENTIONS.md
10. **Delete or overwrite these framework files** — append-only (except CURRENT_SPRINT.md which rotates)
11. **Copy, adapt, or port code from the legacy repository** — ideas only, never code
12. **Build procedural pipelines where an agent could own the work** — agent-first, always
13. **Create a new agent without defining its domain, tools, and AgentBus contracts first**

---

## PRODUCT MISSION

We take mid-level executives and optimally position them for every job they apply to, starting from the premise that they are already highly qualified.

**The process:** Resume intake → job description analysis → benchmark candidate profiling → gap analysis → guided interview to surface real experience → resume crafting that positions the user as the benchmark others are compared to.

**Core insight:** Most executives' professional lives are only ~1% reflected on their resume. There is an enormous amount of real, relevant experience to surface. Executives are better suited for far more roles than they originally believe.

**What we are NOT:** We never fabricate experience, inflate credentials, or misrepresent clients. We better position real skills, abilities, and accomplishments. We better demonstrate why the candidate is a genuine fit.

**The goal:** The finished resume positions the executive so they are viewed as the benchmark candidate — the standard everyone else is measured against.

This philosophy must guide all LLM prompts, tool implementations, and UX decisions.

---

## SESSION PROMPT TEMPLATE

When starting a new coding session, provide:

```
I'm continuing work on CareerIQ / Resume Agent.
Current sprint: [number]
I want to work on: [story name or "next story in sprint"]
```

Claude will then execute the Session Start Protocol above before touching any code.

---

## THE DIAGNOSTIC PROMPT — USE WHEN THINGS FEEL OFF

If at any point you suspect drift or quality degradation, paste this:

```
SYSTEM VERIFICATION CHECK:
Halt current generation.
Review this CLAUDE.md file.
Review CONVENTIONS.md and ARCHITECTURE.md.
Output the exact conventions mandated for this project.
Identify deviations in your last three outputs.
Check: am I maximizing agent architecture, not working around it?
Check: have I pulled anything from the legacy repo?
Self-correct.
Output a confidence score for current alignment (1-10).
Resume only when confidence is 8 or above.
```

---

## TECHNICAL REFERENCE

### Tech Stack

- **Backend:** Hono + Node.js (port 3001)
- **Frontend:** Vite + React 19 + TailwindCSS (port 5173)
- **Database:** Supabase (PostgreSQL) with RLS policies
- **LLM Primary:** Groq (LPU inference, OpenAI-compatible)
- **LLM Fallbacks:** Z.AI GLM, Anthropic Claude (via `LLM_PROVIDER` env var)

### Monorepo Layout

```
app/                          # Frontend (Vite + React 19)
  src/components/panels/      # 11 right-panel components
  src/hooks/                  # useAgent.ts (SSE), usePipeline.ts, useSession.ts, useAuth.ts
  src/types/                  # panels.ts (PanelData union), session.ts, resume.ts
server/                       # Backend (Hono + Node.js)
  src/agents/
    runtime/                  # Agent loop, bus, protocol, context
    knowledge/                # Rules, formatting-guide
    strategist/               # Agent 1: Understanding + intelligence + positioning
    craftsman/                # Agent 2: Content creation + self-review
    producer/                 # Agent 3: QA + document production
    coordinator.ts            # Thin orchestrator (~800 lines)
    types.ts                  # PipelineState, PipelineSSEEvent, agent I/O interfaces
  src/agent/                  # Legacy monolithic loop (being phased out)
  src/routes/                 # pipeline.ts, sessions.ts, resumes.ts
  src/lib/                    # llm.ts, llm-provider.ts, supabase.ts, logger.ts, feature-flags.ts
supabase/
  migrations/                 # Numbered SQL migration files
```

### Dev Commands

- Start server: `cd server && npm run dev` (port 3001)
- Start frontend: `cd app && npm run dev` (port 5173)
- TypeScript check (app): `cd app && npx tsc --noEmit`
- TypeScript check (server): `cd server && npx tsc --noEmit`
- Test credentials: `jjschrup@yahoo.com` / `Scout123`

### Agent Architecture

**Coordinator** (`coordinator.ts`) — Thin orchestration layer. Sequences agents, manages SSE events and gates, routes inter-agent messages. Makes zero content decisions.

**Resume Strategist** — Owns understanding, research, positioning. Runs as agentic loop. Tools: `parse_resume`, `analyze_jd`, `research_company`, `build_benchmark`, `interview_candidate`, `classify_fit`, `design_blueprint`, `emit_transparency`

**Resume Craftsman** — Owns content creation and self-review. Tools: `write_section`, `self_review_section`, `revise_section`, `check_keyword_coverage`, `check_anti_patterns`, `check_evidence_integrity`, `present_to_user`, `emit_transparency`

**Resume Producer** — Owns QA and document production. Tools: `select_template`, `adversarial_review`, `ats_compliance_check`, `humanize_check`, `check_blueprint_compliance`, `verify_cross_section_consistency`, `check_narrative_coherence`, `request_content_revision`, `emit_transparency`

**Agent Runtime** (`server/src/agents/runtime/`):
- `agent-loop.ts` — Core agentic loop: multi-round LLM + tool calling with retries, timeouts
- `agent-bus.ts` — In-memory inter-agent message routing
- `agent-protocol.ts` — Standard types: AgentTool, AgentContext, AgentConfig, AgentMessage
- `agent-context.ts` — Creates runtime context for tools

### Model Routing (Groq — Primary)

| Tier | Model | Cost (per M in/out) | Used For |
|------|-------|---------------------|----------|
| PRIMARY | llama-3.3-70b-versatile | $0.59/$0.79 | Section writing, adversarial review |
| MID | llama-4-scout-17b-16e-instruct | $0.11/$0.34 | Self-review, gap analysis, benchmarking |
| ORCHESTRATOR | llama-3.3-70b-versatile | $0.59/$0.79 | Agent loop reasoning (all 3 agents) |
| LIGHT | llama-3.1-8b-instant | $0.05/$0.08 | Text extraction, JD analysis |

Estimated pipeline cost: ~$0.23/pipeline (Groq) | ~$0.26/pipeline (Z.AI) | Pipeline time: 2–3 min (Groq)

### SSE Event Types

`stage_start` / `stage_complete` | `positioning_question` | `blueprint_ready` | `section_draft` / `section_revised` / `section_approved` | `quality_scores` | `pipeline_gate` | `questionnaire` | `right_panel_update` | `pipeline_complete` / `pipeline_error`

### Panel Types (11)

`onboarding_summary` | `research_dashboard` | `gap_analysis` | `design_options` | `live_resume` | `quality_dashboard` | `completion` | `positioning_interview` | `blueprint_review` | `section_review` | `questionnaire`

### Database Tables

`master_resumes` | `job_applications` | `coach_sessions` | `messages` | `resumes` | `resume_sections` | `user_positioning_profiles` | `user_usage` | `pricing_plans` | `subscriptions` | `waitlist_emails`

### Key Patterns

- **Agentic loop** — Each agent runs multi-round LLM loop. The LLM decides which tools to call and when to stop.
- **Agent tools** — Typed objects `{ name, description, input_schema, execute }`. LLM sees the schema; `execute` runs when called.
- **Inter-agent messaging** — Agents communicate through `AgentBus` using `AgentMessage` format.
- **Self-review loop** — Craftsman writes, self-reviews, then presents to user. Write-review-revise happens autonomously.
- **Pipeline gates** — `waitForUser()` pauses → SSE event → user interacts → `POST /api/pipeline/respond` → resumes.
- **Tool-to-model routing** — `getModelForTool(toolName)` in `llm.ts` maps each tool to the right cost tier.
- **Imports** — `@/` alias for app; `.js` extensions for server (ESM).
- **Error handling** — Pipeline wraps each stage in try/catch, emits `pipeline_error`. Never throw from SSE handlers.
- **TypeScript** — Strict mode. Both `app/` and `server/` must pass `tsc --noEmit`. Avoid `any`.

### Known Issues

- **Bug 16** — Revision loops: agent may re-propose edits after user approves a section
- **Bug 17** — Context forgetfulness on long sessions (mitigated by MAX_HISTORY_MESSAGES=60)
- **Bug 18** — 409 Conflict: frontend sends messages while agent is still processing
- **MaxListenersExceededWarning** — Abort listeners exceed 10 on long sessions
- **PDF Unicode** — Check exports for `?` characters replacing special chars

---

*This framework is version 2.0. Update it through the normal story/sprint process — never ad hoc.*
