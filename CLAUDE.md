# CLAUDE.md — Resume Agent

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
- Feature flags: `FF_INTAKE_QUIZ`, `FF_RESEARCH_VALIDATION`, `FF_GAP_ANALYSIS_QUIZ`, `FF_QUALITY_REVIEW_APPROVAL` (all default true)

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

**Tools:** `select_template`, `adversarial_review`, `ats_compliance_check`, `humanize_check`, `check_blueprint_compliance`, `verify_cross_section_consistency`, `request_content_revision`, `emit_transparency`

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

Migrations in `supabase/migrations/` — numbered sequentially (001–012, then timestamped).

## Key Patterns & Conventions

- **Agentic loop**: Each agent runs as a multi-round LLM loop (`agent-loop.ts`). The LLM decides which tools to call and when to stop. Tools execute against the shared `AgentContext`.
- **Agent tools**: Typed objects `{ name, description, input_schema, execute }`. Tools wrap existing pipeline functions (e.g., `parse_resume` wraps `runIntakeAgent`). The LLM sees the schema; `execute` runs when called.
- **Inter-agent messaging**: Agents communicate through `AgentBus` using standard `AgentMessage` format. The coordinator subscribes to bus events to handle cross-agent requests (e.g., Producer → Craftsman revision requests).
- **Self-review loop**: The Craftsman writes each section, then self-reviews against quality checklist and anti-pattern list before presenting to the user. This write-review-revise cycle happens autonomously within the agent loop.
- **Pipeline gates**: `waitForUser()` pauses → SSE event to frontend → user interacts → `POST /api/pipeline/respond` → pipeline resumes.
- **Tool-to-model routing**: `getModelForTool(toolName)` in `llm.ts` maps each tool to the right cost tier. Agent loops use `MODEL_ORCHESTRATOR` (cheap) for reasoning; individual tools route to their own cost tiers.
- **Panel rendering**: `panel-renderer.tsx` maps `PanelData.type` → component. `PanelErrorBoundary` wraps each panel.
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

No automated test suite — verify via manual E2E pipeline runs:

1. Login with test credentials → start new session
2. Paste a job description → run through all 7 pipeline stages
3. Verify each gate pauses for user interaction
4. Check right-panel content at each stage
5. Export PDF and verify Unicode handling (no `?` characters)
6. TypeScript compilation (`tsc --noEmit`) is the primary CI gate
