# Architecture — Resume Agent

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Backend | Hono + Node.js | Port 3001, ESM modules |
| Frontend | Vite + React 19 + TailwindCSS | Port 5173, glass morphism design system |
| Database | Supabase (PostgreSQL) | RLS on all tables, service-key admin client |
| Primary LLM | Z.AI GLM models (OpenAI-compatible) | 4-tier model routing |
| Fallback LLM | Anthropic Claude (optional) | Selectable via `LLM_PROVIDER` env var |
| E2E Testing | Playwright | Full pipeline tests (~28 min with Z.AI latency) |
| Unit Testing | Vitest | Server (577 tests) + App (281 tests) |

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
    coordinator.ts            # Thin orchestrator (~850 lines) — sequences agents, manages gates
    types.ts                  # PipelineState, PipelineSSEEvent, agent I/O interfaces
  src/routes/                 # pipeline.ts, sessions.ts, resumes.ts
  src/lib/                    # llm.ts, llm-provider.ts, supabase.ts, logger.ts, feature-flags.ts
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

### Coordinator (`agents/coordinator.ts`)
Thin orchestration layer (~850 lines). Sequences agents, manages user interaction (SSE events, gates), and routes inter-agent messages. Makes zero content decisions.

### Resume Strategist (`agents/strategist/`)
Owns understanding, intelligence, and positioning. Interviews the candidate like a world-class executive recruiter, researches the market, identifies competitive advantages, and designs the resume strategy. Runs as an agentic loop — the LLM decides which tools to call and when to iterate.

**Tools:** `parse_resume`, `analyze_jd`, `research_company`, `build_benchmark`, `interview_candidate`, `classify_fit`, `design_blueprint`, `emit_transparency`

### Resume Craftsman (`agents/craftsman/`)
Owns content creation. Writes each section following detailed rules in resume-guide.ts. Self-reviews every section before presenting to the user. Iterates based on feedback.

**Tools:** `write_section`, `self_review_section`, `revise_section`, `check_keyword_coverage`, `check_anti_patterns`, `check_evidence_integrity`, `present_to_user`, `emit_transparency`

### Resume Producer (`agents/producer/`)
Owns document production and quality assurance. Selects from 5 executive templates (resume-formatting-guide.md), verifies ATS compliance, runs multi-perspective quality checks. Can request content revisions from the Craftsman.

**Tools:** `select_template`, `adversarial_review`, `ats_compliance_check`, `humanize_check`, `check_blueprint_compliance`, `verify_cross_section_consistency`, `check_narrative_coherence`, `request_content_revision`, `emit_transparency`

### Inter-Agent Communication
Agents communicate through `AgentBus` (`runtime/agent-bus.ts`) using standard `AgentMessage` format. The Strategist passes strategy to the Craftsman. The Craftsman passes content to the Producer. The Producer can request revisions from the Craftsman via the bus.

## Agent Runtime (`agents/runtime/`)

- **agent-loop.ts** — Core agentic loop: multi-round LLM + tool calling with retries, timeouts. The LLM decides which tools to call and when to stop.
- **agent-bus.ts** — In-memory inter-agent message routing.
- **agent-protocol.ts** — Standard types: `AgentTool`, `AgentContext`, `AgentConfig`, `AgentMessage`.
- **agent-context.ts** — Creates runtime context (pipeline state, SSE, gates) for tools.

## LLM Model Routing

`server/src/lib/llm.ts` routes tools to cost-appropriate models via `getModelForTool()`:

| Tier | Model | Cost (in/out per M) | Used For |
|------|-------|---------------------|----------|
| PRIMARY | glm-4.7 | $0.60/$2.20 | Section writing, synthesis, adversarial review |
| MID | glm-4.5-air | $0.20/$1.10 | Question generation, benchmark, classify-fit, narrative coherence |
| ORCHESTRATOR | glm-4.7-flashx | $0.07/$0.40 | Main agent loop reasoning, fallback |
| LIGHT | glm-4.7-flash | FREE | JD analysis, humanize-check, research |

Agent loops use ORCHESTRATOR (cheap) for reasoning; individual tools route to their own cost tiers.

## LLM Provider Abstraction

`server/src/lib/llm-provider.ts` — `ZAIProvider` (primary) + `AnthropicProvider` (optional fallback).

- Translates between internal content-block format and OpenAI message format.
- `createCombinedAbortSignal(userSignal, timeoutMs)` for timeout management.
- Timeouts: ZAI chat 180s, ZAI stream 300s, Anthropic stream 300s.

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

**Key tables:** `master_resumes`, `job_applications`, `coach_sessions`, `messages`, `resumes`, `resume_sections`, `user_positioning_profiles`, `user_usage`, `pricing_plans`, `subscriptions`, `waitlist_emails`

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

## Auth

Supabase Auth (email/password) with `AuthContext` provider. React Router v7 with auth guard.

## Styling

TailwindCSS utility classes. Glass morphism design system: `GlassCard`, `GlassButton`, `GlassInput`. `cn()` helper for conditional class merging.

## Route → Agent System Mapping

| Route | Agent System | Status |
|-------|-------------|--------|
| `routes/pipeline.ts` | `agents/coordinator.ts` → 3-agent pipeline | **Active** |
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
