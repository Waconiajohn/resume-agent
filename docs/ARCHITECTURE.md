# Architecture — Resume Agent

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Backend | Hono + Node.js | Port 3001, ESM modules |
| Frontend | Vite + React 19 + TailwindCSS | Port 5173, glass morphism design system |
| Database | Supabase (PostgreSQL) | RLS on all tables, service-key admin client |
| Primary LLM | Groq (LPU inference, OpenAI-compatible) | 4-tier model routing, sub-second latency |
| Fallback LLM | Z.AI GLM + Anthropic Claude | Selectable via `LLM_PROVIDER` env var |
| E2E Testing | Playwright | Full pipeline tests (~2-3 min with Groq, 15 min timeout) |
| Unit Testing | Vitest | Server (891 tests) + App (416 tests) |

## Monorepo Layout

```
app/                          # Frontend (Vite + React 19)
  src/components/panels/      # 11 right-panel components (panel-renderer.tsx dispatches)
  src/components/dashboard/   # 13 dashboard components (DashboardScreen dispatches tabs)
  src/hooks/                  # useAgent.ts (SSE), usePipeline.ts, useSession.ts, useAuth.ts
  src/types/                  # panels.ts (PanelData union), session.ts, resume.ts, platform.ts
  src/components/platform/    # ProductCatalogGrid.tsx, ProductLandingPage.tsx, ToolsScreen.tsx
server/                       # Backend (Hono + Node.js)
  src/agents/
    runtime/                  # Agent loop, bus, protocol, context (shared infrastructure)
                              #   product-config.ts — ProductConfig, AgentPhase, GateDef, InterAgentHandler, RuntimeParams
                              #   product-coordinator.ts — runProductPipeline() generic coordinator
                              #   shared-tools.ts — createEmitTransparency() factory
                              #   agent-registry.ts — capability-based discovery
    knowledge/                # Rules (resume-guide), formatting-guide (structured extracts)
    resume/                   # Resume product definition
                              #   product.ts — resumeProductConfig (ProductConfig impl)
                              #   event-middleware.ts — per-session SSE event processing (closure factory)
                              #   route-hooks.ts — lifecycle hooks for product route factory
    strategist/               # Agent 1: Understanding + intelligence + positioning
    craftsman/                # Agent 2: Content creation + self-review
    producer/                 # Agent 3: Quality assurance + document production
    cover-letter/             # Cover letter POC (2 agents, 5 tools, FF_COVER_LETTER)
                              #   analyst/ — JD + resume parsing agent
                              #   writer/ — letter drafting agent
                              #   product.ts — coverLetterProductConfig
    coordinator.ts            # Thin wrapper (~60 lines) — calls runProductPipeline(resumeProductConfig)
    types.ts                  # PipelineState, PipelineSSEEvent, agent I/O interfaces
  src/routes/                 # resume-pipeline.ts, sessions.ts, resumes.ts
                              #   product-route-factory.ts — createProductRoutes() factory
                              #   resume-pipeline.ts — resume routes via createProductRoutes() + hooks
                              #   cover-letter.ts — /api/cover-letter/* routes (FF_COVER_LETTER)
  src/lib/                    # llm.ts, llm-provider.ts, supabase.ts, logger.ts, feature-flags.ts, platform-context.ts, workflow-persistence.ts
supabase/
  migrations/                 # Numbered SQL migration files (001-012, then timestamped)
e2e/
  tests/                      # full-pipeline.spec.ts
  helpers/                    # pipeline-responder.ts, cleanup.ts
  fixtures/                   # real-resume-data.ts
docs/                         # Project documentation (this directory)
```

## 3-Agent Pipeline Architecture

The system uses 3 collaborative AI agents sequenced by a thin coordinator:

```
User → Coordinator → Strategist → [Blueprint Gate] → Craftsman → Producer → Export
              ↑                                           ↑           |
              |                                           +-----------+
              |                                        (revision requests)
              +--- SSE events to frontend ---+
```

### Generic Coordinator (`agents/runtime/product-coordinator.ts`)
`runProductPipeline(config, state, emit, signal)` — the domain-agnostic orchestration engine. Accepts a `ProductConfig` and drives the multi-phase agent sequence: sets up inter-agent bus subscriptions, emits stage SSE events, manages gates via `waitForUser()`, and advances phases. Makes zero content decisions and contains zero product-specific logic.

### Resume Coordinator (`agents/coordinator.ts`)
Thin wrapper (~60 lines, rewritten from ~1430 lines in Sprint 12). Constructs initial `PipelineState`, calls `runProductPipeline(resumeProductConfig, ...)`, and handles the pipeline heartbeat. All resume-specific logic now lives in `agents/resume/product.ts`.

### Resume Product Definition (`agents/resume/product.ts`)
Implements `ProductConfig` for the resume pipeline. Declares: the three-agent phase sequence (Strategist → Craftsman → Producer), phase start/end hooks, inter-agent message handlers (Producer-to-Craftsman revision routing), gate definitions, stage messaging labels, and runtime params.

### Resume Strategist (`agents/strategist/`)
Owns understanding, intelligence, and positioning. Researches the market, identifies competitive advantages, and designs the resume strategy. Runs as an agentic loop — the LLM decides which tools to call and when to iterate.

Candidate interviewing uses **batch-only mode** (see ADR-016): all questions are delivered at once as a structured `QuestionnairePanel` rather than one at a time. The `interview_candidate` single-question tool has been removed.

**Tools:** `parse_resume`, `analyze_jd`, `research_company`, `build_benchmark`, `classify_fit`, `design_blueprint`, `emit_transparency`

### Resume Craftsman (`agents/craftsman/`)
Owns content creation. Writes each section following detailed rules in resume-guide.ts. Self-reviews every section before presenting to the user. Iterates based on feedback.

**Tools:** `write_section`, `self_review_section`, `revise_section`, `check_keyword_coverage`, `check_anti_patterns`, `check_evidence_integrity`, `present_to_user`, `emit_transparency`

### Resume Producer (`agents/producer/`)
Owns document production and quality assurance. Selects from 5 executive templates (resume-formatting-guide.md), verifies ATS compliance, runs multi-perspective quality checks. Can request content revisions from the Craftsman.

**Tools:** `select_template`, `adversarial_review`, `ats_compliance_check`, `humanize_check`, `check_blueprint_compliance`, `verify_cross_section_consistency`, `check_narrative_coherence`, `request_content_revision`, `emit_transparency`

### Inter-Agent Communication
Agents communicate through `AgentBus` (`runtime/agent-bus.ts`) using standard `AgentMessage` format with namespaced routing. The bus supports:
- **Namespaced routing**: Subscribers register as `domain:agentName` (e.g., `resume:craftsman`). Messages resolve via `domain:to` first, falling back to name-only for backward compatibility.
- **Broadcast**: `sendBroadcast(domain, msg)` delivers to all agents in a domain (skips sender).
- **Discovery**: `listSubscribers(domain?)` returns subscribed agent keys.

The Strategist passes strategy to the Craftsman. The Craftsman passes content to the Producer. The Producer can request revisions from the Craftsman via the bus.

## Agent Runtime (`agents/runtime/`)

- **agent-loop.ts** — Core agentic loop: multi-round LLM + tool calling with retries, timeouts. The LLM decides which tools to call and when to stop. Calls `config.onInit()` before the first LLM round and `config.onShutdown()` in a `finally` block (guaranteed even on error). Hook failures are logged but don't abort the agent or mask loop errors.
- **agent-bus.ts** — In-memory inter-agent message routing with cross-product namespace support. Resolves handlers via `domain:name` first, then name-only fallback.
- **agent-protocol.ts** — Standard types: `AgentTool`, `AgentContext`, `AgentConfig`, `AgentMessage`. `AgentConfig` includes optional `capabilities`, `onInit`, and `onShutdown` fields. `AgentTool` includes optional `model_tier` field for declarative cost-tier routing.
- **agent-context.ts** — Creates runtime context (pipeline state, SSE, gates) for tools.
- **agent-registry.ts** — Agent self-registration on module load via `registerAgent<TState, TEvent>()` helper. Supports capability-based discovery (`findByCapability`), domain listing (`listDomains`), and agent description (`describe`).
- **shared-tools.ts** — Domain-agnostic tool factories shared across agents. Currently exports `createEmitTransparency<TState, TEvent>(config?)` which accepts an optional `prefix` string and returns a fully-typed `AgentTool`.
- **product-config.ts** — `ProductConfig` interface (plain object, not a class) declaring phases, inter-agent handlers, gate definitions, stage labels, and runtime params. Also exports `AgentPhase`, `GateDef`, `InterAgentHandler`, and `RuntimeParams` types.
- **product-coordinator.ts** — `runProductPipeline(config, state, emit, signal)` generic coordinator. Wires bus subscriptions from `config.interAgentHandlers`, sequences phases, manages gates, emits SSE stage events. Zero product-specific logic.

### Shared Tool Factory Pattern

Tools that are functionally identical across agents are defined once as factory functions in `shared-tools.ts` and instantiated per agent:

```typescript
// In strategist/tools.ts
import { createEmitTransparency } from '../runtime/shared-tools.js';
const emitTransparencyTool = createEmitTransparency<PipelineState, PipelineSSEEvent>();

// In producer/tools.ts
const emitTransparencyTool = createEmitTransparency<PipelineState, PipelineSSEEvent>({ prefix: 'Producer: ' });
```

Factories return `{ success: false }` on empty messages (never emit empty SSE events). Return `{ emitted: true, message }` on success. Adding a new shared tool follows the same factory pattern — domain-specific config via an optional config parameter.

### Agent Registration

Agents self-register using the typed helper to avoid `as unknown as AgentConfig` casts at call sites:

```typescript
// In strategist/agent.ts
import { registerAgent } from '../runtime/agent-registry.js';
registerAgent(strategistConfig); // fully typed, no cast
```

The registry stores agents as `AgentConfig<BaseState, BaseEvent>` internally. The widening cast is confined to the `registerAgent()` function in `agent-registry.ts` (one documented location).

## LLM Model Routing

`server/src/lib/llm.ts` routes tools to cost-appropriate models. Provider-aware: each tier maps to different concrete models depending on `LLM_PROVIDER`. Tools declare their cost tier via the `model_tier` field on `AgentTool`. `resolveToolModel(tool, registry?)` checks `tool.model_tier` first, then falls back to `MODEL_ORCHESTRATOR`.

**Groq models (primary — `LLM_PROVIDER=groq`):**

| Tier | Model | Cost (in/out per M) | Used For |
|------|-------|---------------------|----------|
| PRIMARY | llama-3.3-70b-versatile | $0.59/$0.79 | Section writing, adversarial review |
| MID | llama-4-scout-17b-16e-instruct | $0.11/$0.34 | Self-review, gap analysis, benchmarking |
| ORCHESTRATOR | llama-3.3-70b-versatile | $0.59/$0.79 | Agent loop reasoning (all 3 agents) |
| LIGHT | llama-3.1-8b-instant | $0.05/$0.08 | Text extraction, JD analysis |

**Z.AI models (fallback — `LLM_PROVIDER=zai`):**

| Tier | Model | Cost (in/out per M) | Used For |
|------|-------|---------------------|----------|
| PRIMARY | glm-4.7 | $0.60/$2.20 | Section writing, synthesis, adversarial review |
| MID | glm-4.5-air | $0.20/$1.10 | Question generation, benchmark, classify-fit |
| ORCHESTRATOR | glm-4.7-flashx | $0.07/$0.40 | Main agent loop reasoning, fallback |
| LIGHT | glm-4.7-flash | FREE | JD analysis, humanize-check, research |

Key design: ORCHESTRATOR = PRIMARY on Groq (both 70B). The agent "brain" deciding tool sequencing is as capable as the "hands" writing content. Estimated pipeline cost: ~$0.23/run (Groq) vs ~$0.26/run (Z.AI). See ADR-028 and ADR-029 for rationale.

All 26 tools have `model_tier` set. Agent loops use ORCHESTRATOR for reasoning; individual tools route to their own cost tiers via `getModelForTier(tier)`.

## LLM Provider Abstraction

`server/src/lib/llm-provider.ts` — `GroqProvider` (primary) + `ZAIProvider` (fallback) + `AnthropicProvider` (optional).

- `GroqProvider` extends `ZAIProvider` with Groq-specific defaults: 45s chat timeout, 60s stream timeout, `disableParallelToolCalls: true`, `strict: false` on tool schemas.
- Translates between internal content-block format and OpenAI message format.
- `createCombinedAbortSignal(userSignal, timeoutMs)` for timeout management.
- Timeouts: Groq chat 45s / stream 60s, ZAI chat 180s / stream 300s, Anthropic stream 300s.
- `recoverFromToolValidation()` — recovers tool calls from Groq's `tool_use_failed` 400 responses (JSON and XML formats). Safety net; should trigger rarely with 70B orchestrator.

### Agent Loop Resilience (`agents/runtime/agent-loop.ts`)

- **History compaction**: Sliding window (MAX_HISTORY_MESSAGES=60, KEEP_RECENT=40) prevents context overflow. With 70B's 131K context, compaction rarely triggers.
- **Parameter coercion**: `coerceToolParameters()` defensively parses stringified JSON parameters. Should trigger rarely with 70B. Logged at warn level for monitoring.
- **JSON comment stripping**: `stripJsonComments()` in `json-repair.ts` handles Llama-generated comments in JSON output.

## SSE Communication

Pipeline emits events via `PipelineEmitter` callback. Frontend connects via fetch-based SSE.

Key event types:
- `stage_start` / `stage_complete` — pipeline progress
- `positioning_question` — interview questions for user
- `blueprint_ready` — strategy output for review
- `section_draft` / `section_revised` / `section_approved` — section lifecycle
- `section_context` — enrichment data before section draft
- `quality_scores` — review results
- `pipeline_gate` — user interaction required
- `questionnaire` — structured input forms
- `right_panel_update` — updates right-side panel content
- `pipeline_complete` / `pipeline_error` — terminal events

## Pipeline Gates

Pipeline pauses at interaction points using `waitForUser()`:
1. Frontend receives gate event via SSE
2. Appropriate panel renders (positioning interview, blueprint review, section review, etc.)
3. User interacts and submits
4. Frontend calls `POST /api/pipeline/respond`
5. Pipeline resumes with user response

Feature flags control optional gates: `FF_INTAKE_QUIZ`, `FF_RESEARCH_VALIDATION`, `FF_GAP_ANALYSIS_QUIZ`, `FF_QUALITY_REVIEW_APPROVAL`, `FF_BLUEPRINT_APPROVAL`.

## Database Schema

Supabase (PostgreSQL) with RLS on all tables. Admin client uses service key (bypasses RLS).

**Key tables:** `master_resumes`, `job_applications`, `coach_sessions`, `messages`, `resumes`, `resume_sections`, `user_positioning_profiles`, `user_usage`, `pricing_plans`, `subscriptions`, `waitlist_emails`, `user_platform_context`

- `moddatetime` extension + trigger on `coach_sessions` keeps `updated_at` fresh.
- Migrations in `supabase/migrations/` — numbered sequentially.

## Infrastructure

- **Pipeline heartbeat** (`routes/pipeline.ts`): Touches `updated_at` every 5 min during long runs. Prevents stale recovery (15 min threshold) from killing active pipelines.
- **Session locks** (`session-lock.ts`): Prevents concurrent pipeline runs per session.
- **Stale recovery**: `STALE_PIPELINE_MS = 15 min`, `IN_PROCESS_PIPELINE_TTL_MS = 20 min`.
- **HTTP body guard** (`http-body-guard.ts`): Request size limits.
- **Pending gate queue** (`pending-gate-queue.ts`): Prevents gate response overwrites during concurrent interactions.
- **Request metrics** (`request-metrics.ts`): Timing instrumentation.
- **JSON repair** (`json-repair.ts`): Handles malformed LLM JSON responses.

## Frontend Panel System

11 panel types rendered in the right pane, dispatched by `panel-renderer.tsx`:

`onboarding_summary` | `research_dashboard` | `gap_analysis` | `design_options` | `live_resume` | `quality_dashboard` | `completion` | `positioning_interview` | `blueprint_review` | `section_review` | `questionnaire`

- `PanelData` is a discriminated union in `app/src/types/panels.ts`.
- `PanelErrorBoundary` wraps each panel for graceful error handling.
- Section review renders `SectionWorkbench` (full-screen workbench with 25-deep undo/redo, review tokens, action locking).

## User Dashboard

`/dashboard` route renders `DashboardScreen.tsx` with 3 tabs dispatched by `DashboardTabs.tsx`:

| Tab | Component | Features |
|-----|-----------|----------|
| Sessions | `SessionHistoryTab` | Session gallery with status filter, rich cards (`DashboardSessionCard`), resume viewer modal (`SessionResumeModal`), compare mode (`ResumeComparisonModal`) |
| Master Resume | `MasterResumeTab` | Full resume viewer + inline editor, expandable experience (`ExperienceCard`), skill categories (`SkillsCategoryCard`), inline field editing (`EditableField`), version history |
| Evidence Library | `EvidenceLibraryTab` | Evidence browser with source filter (crafted/upgraded/interview), text search, per-item delete (`EvidenceItemCard`) |

Props flow: `App.tsx` → `DashboardScreen` → tab components. API calls via `useSession` hook functions (`getSessionResume`, `updateMasterResume`, `getResumeHistory`).

## Platform Catalog

The `/tools` route renders a `ProductCatalogGrid` — a responsive grid of GlassCards showing all available agent-powered products. The catalog is a static frontend constant (`PRODUCT_CATALOG` in `app/src/types/platform.ts`), not a database table.

Each product has: id, slug, name, shortDescription, icon, status (`active` | `coming_soon` | `beta`), route, and category. Active products are clickable and navigate to their route. Coming-soon products are grayed with a badge. The Header includes a "Tools" navigation item.

Current catalog: Resume Strategist (active), Cover Letter Writer (coming soon), Interview Prep Coach (coming soon), LinkedIn Optimizer (coming soon).

## Shared Platform Context

`server/src/lib/platform-context.ts` provides cross-product access to user intelligence (positioning strategies, evidence items, career narratives, target roles).

**Table:** `user_platform_context` — id (uuid), user_id (FK), context_type (text), content (jsonb), source_product (text), source_session_id (uuid nullable), version (int), created_at, updated_at. RLS: users read/write own rows only. Index on (user_id, context_type).

**Functions:** `getUserContext(userId, contextType)`, `upsertUserContext(userId, contextType, content, sourceProduct, sourceSessionId?)`, `listUserContextByType(userId, types?)`. All use admin Supabase client with try/catch error handling.

The resume pipeline persists positioning strategy and evidence items on completion via `persistPlatformContext()` in `agents/resume/product.ts` (best-effort, try/catch — never blocks pipeline completion).

## Auth

Supabase Auth (email/password) with `AuthContext` provider. React Router v7 with auth guard.

## Styling

TailwindCSS utility classes. Glass morphism design system: `GlassCard`, `GlassButton`, `GlassInput`. `cn()` helper for conditional class merging.

### Progressive Disclosure Pattern

Advanced settings and developer telemetry are hidden behind native HTML `<details>`/`<summary>` elements styled with Tailwind. This pattern:
- Requires no React state management (auto-collapses on remount)
- Works with glass morphism aesthetic via `group` + `group-open:rotate-90` arrow animation
- Used in: PipelineIntakeForm ("Advanced Options"), CoachScreenBanners ("Run Settings"), ChatPanel/WorkflowStatsRail/PipelineActivityBanner ("Details")

## Product Route Factory

`server/src/routes/product-route-factory.ts` exports `createProductRoutes(config)`. Given a `ProductRouteConfig`, the factory generates a standard set of Hono routes:

- `POST /start` — begins a pipeline run for a session
- `GET /:sessionId/stream` — SSE event stream
- `POST /respond` — user response to gates/questionnaires

The factory handles session creation, SSE registration, gate wiring, and error responses generically. Products pass their config and get working routes without writing boilerplate.

### Lifecycle Hooks

`ProductRouteConfig` supports 7 optional lifecycle hooks that let products inject domain-specific logic:

| Hook | When | Can short-circuit? |
|------|------|-------------------|
| `onBeforeStart` | After input validation, before pipeline run | Yes (return `Response`) |
| `transformInput` | After `onBeforeStart`, enriches validated input | No |
| `onEvent` | Per SSE event, before broadcast | Yes (return transformed event) |
| `onBeforeRespond` | In `/respond`, after pipeline_status check | Yes (return `Response`) |
| `onRespond` | After gate response is persisted | No |
| `onComplete` | Pipeline finished successfully | No |
| `onError` | Pipeline failed with error | No |

All hooks are optional — the cover letter POC uses none. The resume product uses all 7.

### Resume Pipeline Wiring

`server/src/routes/resume-pipeline.ts` wires the resume product into the factory:

- `onBeforeStart` — stale pipeline recovery, capacity checks, pipeline slot claim, workflow init, per-session event middleware creation
- `transformInput` — JD URL resolution (SSRF-protected), master resume loading
- `onEvent` — delegates to per-session `ResumeEventMiddleware` (panel persistence, workflow artifacts, runtime metrics)
- `onBeforeRespond` — stale pipeline detection on respond
- `onRespond` — question response persistence
- `onComplete` / `onError` — middleware cleanup, running pipeline unregistration

The per-session event middleware is created as a closure factory (`createResumeEventMiddleware()`) that returns `{ onEvent, onComplete, onError, flushPanelPersists, dispose }`. Instances are tracked in a `Map<sessionId, middleware>` and cleaned up on complete/error.

## Cover Letter POC (`agents/cover-letter/`)

A minimal second product validating the `ProductConfig` abstraction. Feature-flagged via `FF_COVER_LETTER` (default false). Routes mounted at `/api/cover-letter/*` using `createProductRoutes()`.

- **analyst/** — `analyze_job` and `analyze_resume` tools. Parses the job description and candidate resume.
- **writer/** — `draft_opening`, `draft_body`, `draft_closing` tools. Writes the three cover letter sections.
- **product.ts** — `coverLetterProductConfig` implementing `ProductConfig` with 2 phases and zero user gates.

The POC runs fully autonomously (no `waitForUser()` calls). Its purpose is to prove that `runProductPipeline()` supports any product, not just the resume pipeline.

## Route → Agent System Mapping

| Route | Agent System | Status |
|-------|-------------|--------|
| `routes/resume-pipeline.ts` | `createProductRoutes()` + resume hooks → `runProductPipeline(resumeProductConfig)` | **Active** |
| `routes/cover-letter.ts` | `createProductRoutes(coverLetterProductConfig)` → 2-agent pipeline | **Active (FF_COVER_LETTER=false)** |
| `routes/sessions.ts` | Grounded status replies only (chat loop decommissioned) | **Active** |

## Commerce

### Billing Flow

Stripe Checkout (hosted page) drives new subscription creation. The user selects a plan on `PricingPage.tsx`, clicks "Subscribe", and the frontend calls `POST /api/billing/checkout` which creates a Stripe Checkout Session and returns a redirect URL. The user completes payment on Stripe's hosted page and is redirected back to the app.

Stripe sends webhook events to `POST /api/billing/webhook`. The webhook handler processes four lifecycle events: `checkout.session.completed` (creates/updates `user_subscriptions` row), `customer.subscription.updated` (updates plan and status), `customer.subscription.deleted` (marks subscription inactive), and `invoice.payment_failed` (flags subscription as past due).

Promotion codes are applied via Stripe's native mechanism. Checkout sessions are created with `allow_promotion_codes: true`. Users enter codes at checkout on Stripe's hosted page. No custom coupon table is maintained — Stripe is the source of truth. Webhook discount metadata is extracted and stored in `user_subscriptions` for analytics.

Customer self-service (plan changes, cancellation) is handled by Stripe Customer Portal. The frontend calls `POST /api/billing/portal` which returns a portal URL. No cancel/upgrade UI is built in the app.

### Entitlements Model

Feature access is controlled by two database tables:

- **`plan_features`** — maps `plan_id → feature_key → feature_value (JSONB)`. Each plan row defines what's included (e.g., `{ "enabled": true }`, `{ "limit": 50 }`).
- **`user_feature_overrides`** — maps `user_id → feature_key → override_value (JSONB)`. Individual grants that override plan defaults (a la carte purchases, manual grants, support adjustments).

`getUserEntitlements(userId)` in `server/src/lib/entitlements.ts` merges both sources: plan defaults first, then override wins. Returns a flat feature map. Fail-open on DB errors — returns free-tier defaults.

Feature guards are enforced via `requireFeature()` middleware factory in `server/src/middleware/feature-guard.ts`. New features require seed data in `plan_features`. The `subscription-guard.ts` middleware uses `getUserEntitlements()` to enforce session limits.

### Affiliate System

The affiliate system lives in `server/src/lib/affiliates.ts` with routes in `server/src/routes/affiliates.ts`.

- **`affiliates`** table — stores affiliate profile: `user_id`, `referral_code` (unique), `commission_rate`, `status`.
- **`referral_events`** table — tracks the funnel: clicks, signups, and subscriptions tied to a referral code.

Referral flow: when a visitor lands on `/?ref=CODE`, the frontend captures the code in `localStorage`. On checkout, the referral code is read from storage and passed to `POST /api/billing/checkout` as a query parameter, which attaches it to the Stripe Checkout Session metadata. The webhook handler reads the metadata on `checkout.session.completed` and records a subscription event in `referral_events`.

Commission is calculated as `affiliate.commission_rate * subscription_revenue`. Payouts are manual for MVP — the affiliate dashboard shows stats and events but no automated payout is wired. Stripe Connect for automated payouts is planned as a future story.

### Discount Code Strategy

All discount codes use Stripe Promotion Codes (not custom coupon tables). Promotion codes are created via the Stripe admin API or dashboard and map to Stripe Coupon objects. Validation and redemption are handled server-side by Stripe.

Code categories in use:
- **Financial planning client codes** — 100% off, limited redemptions.
- **Friends and family codes** — 50% off, limited redemptions.
- **General promo codes** — variable discount, typically time-limited.

`allow_promotion_codes: true` is set on all Checkout Sessions, exposing the promo code input field on Stripe's hosted page. Admin endpoints in `server/src/routes/admin.ts` allow creating and listing promo codes via the Stripe API. The `ADMIN_API_KEY` env var protects these endpoints.
