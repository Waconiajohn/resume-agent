# Architecture Decision Records — Resume Agent

## ADR-045: react-joyride for Guided Onboarding Tour
**Date:** 2026-03-23
**Status:** accepted
**Context:** The platform serves 55+ executives who may be unfamiliar with complex web applications. No guided onboarding existed; new users landed on the workspace with no context about where to start or what each room does.
**Decision:** Install `react-joyride` v3 and build an 8-step guided tour that auto-starts on first visit (gated by `localStorage` key `careeriq_tour_completed`). The tour is replayable via a Help (HelpCircle) button in the header. A separate `JargonTooltip` component provides inline glossary hover-tooltips for platform-specific terms.
**Reasoning:** react-joyride is React-native (no jQuery dependency), TypeScript-typed, lightweight, and compatible with React 19. The custom `tooltipComponent` prop allows full design-system compliance (CSS custom properties, matching `--surface-elevated` background and `--text-strong` text). Shepherd.js was considered but is heavier and less React-native. A built-from-scratch implementation was considered but unnecessary given the library is well-maintained.
**Consequences:** `react-joyride` added as a production dependency. Tour targets are set via `data-tour` attributes on sidebar nav buttons and the theme toggle. The `OnboardingTour` is mounted only inside `CareerIQScreen` (desktop layout) so it only runs on the workspace route. The `HelpCircle` button in `Header` is conditionally rendered only when `onReplayTour` is provided (currently only on the `/workspace` route).

## ADR-001: 3-Agent Architecture (Strategist / Craftsman / Producer)
**Date:** 2026-02-26
**Status:** accepted
**Context:** The original monolithic pipeline (`agents/pipeline.ts`) handled all stages — intake, research, writing, review — in a single sequential flow. As the system grew, the pipeline became difficult to extend, and responsibilities were tangled. The product is designed to be the cornerstone of a 33-agent platform.
**Decision:** Rebuild the pipeline as 3 autonomous agents (Strategist, Craftsman, Producer) coordinated by a thin orchestrator (`coordinator.ts`). Each agent runs its own agentic loop with dedicated tools and owns a clear domain. Inter-agent communication uses a standard message bus (`agent-bus.ts`).
**Reasoning:** Separation of concerns — understanding/positioning vs. content creation vs. quality assurance — maps naturally to the resume workflow. Agent autonomy allows each to iterate independently (e.g., Craftsman self-reviews before presenting). The bus pattern is designed for the 33-agent platform.
**Consequences:** Legacy `agent/` directory and `agents/pipeline.ts` retained for chat route compatibility. Coordinator is ~850 lines but makes zero content decisions. Each agent can be evolved independently.

## ADR-002: Z.AI GLM as Primary LLM Provider
**Date:** 2026-02-01
**Status:** accepted
**Context:** Needed a cost-effective LLM provider for a multi-agent system where each pipeline run involves dozens of LLM calls across 4 cost tiers (PRIMARY, MID, ORCHESTRATOR, LIGHT).
**Decision:** Use Z.AI GLM models as the primary provider with OpenAI-compatible API. Anthropic Claude available as optional fallback via `LLM_PROVIDER` env var.
**Reasoning:** Z.AI offers a free tier (glm-4.7-flash) for high-volume low-stakes calls, and competitive pricing at higher tiers. The OpenAI-compatible API reduces integration complexity. The 4-tier routing (`getModelForTool()` in `llm.ts`) maps each tool to the cheapest model that can handle it.
**Consequences:** Z.AI has 1-5 min latency per call, requiring generous timeouts (180s chat, 300s stream). Sometimes returns objects where strings are expected — runtime coercion needed. JSON responses often malformed — `json-repair.ts` handles this.

## ADR-003: Strategic Blueprint Replaces Prescriptive Bullet Instructions
**Date:** 2026-02-27
**Status:** accepted
**Context:** The Strategist's blueprint originally prescribed exact bullets for each section (`bullets_to_write` array). This over-constrained the Craftsman, producing mechanical, formulaic content.
**Decision:** Replace prescriptive bullet lists with strategic guidance: `evidence_priorities` (requirement + available evidence + importance level + narrative notes), `bullet_count_range`, and `do_not_include`. The Craftsman has creative authority within strategic guardrails.
**Reasoning:** Writers produce better content when given a strategic brief rather than a paint-by-numbers outline. The evidence priority system tells the Craftsman *what matters and why* without dictating *how to write it*. The "Your Creative Authority" prompt section explicitly grants creative freedom.
**Consequences:** Backward compatible — `normalizeEvidenceAllocation()` handles legacy `bullets_to_write` format. `hasEvidencePriorities()` detects mode and branches the prompt. Resume quality improved measurably.

## ADR-004: Blueprint Approval Gate for User Control
**Date:** 2026-02-27
**Status:** accepted
**Context:** Users had no visibility into or control over the Strategist's positioning decisions before the Craftsman began writing. If the strategy was wrong, users discovered it only after sections were already drafted.
**Decision:** Add a `waitForUser('architect_review')` gate between Strategist completion and Craftsman start. BlueprintReviewPanel shows positioning angle, section order, and evidence allocation. Users can edit positioning angle and reorder sections before approving.
**Reasoning:** The blueprint is the most consequential decision point — it determines everything downstream. User review at this stage catches misalignment early, saving entire revision cycles.
**Consequences:** Feature-flagged via `FF_BLUEPRINT_APPROVAL` (default true, skipped in `fast_draft` mode). Coordinator merges user edits into `state.architect` before Craftsman starts.

## ADR-005: Pipeline Heartbeat for Stale Recovery Resilience
**Date:** 2026-02-27
**Status:** accepted
**Context:** `ctx.updateState()` is in-memory only (no DB write). During the Strategist's 10-15+ min interview phase, `updated_at` on `coach_sessions` never refreshed. The stale pipeline recovery mechanism (15 min threshold) was killing active pipelines mid-run.
**Decision:** Add a `setInterval` heartbeat in `routes/pipeline.ts` that touches `updated_at` every 5 minutes while the pipeline is running. Cleared in `.finally()`.
**Reasoning:** The stale recovery mechanism is essential for cleaning up crashed pipelines, but it must not interfere with legitimately long-running pipelines. A 5-min heartbeat with a 15-min stale threshold provides a safe margin.
**Consequences:** `STALE_PIPELINE_MS = 15 min`, `IN_PROCESS_PIPELINE_TTL_MS = 20 min`, heartbeat interval = 5 min. The heartbeat is a lightweight Supabase update, negligible cost.

## ADR-006: React Native Setter for E2E Textarea Fills
**Date:** 2026-02-27
**Status:** accepted
**Context:** The positioning interview panel renders inside a container that can have zero computed height due to CSS layout (banners/cards consuming all space). Playwright's `fill()` and `fill({ force: true })` don't reliably trigger React's onChange handler in this zero-height context.
**Decision:** Use `page.evaluate()` with React's native value setter (`Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set`) plus a synthetic `input` event to fill textareas in E2E tests.
**Reasoning:** React's synthetic event system relies on its own value tracking. Setting `.value` directly doesn't trigger onChange. The native setter trick is the standard workaround for programmatic React input manipulation. Combined with `page.evaluate()` for DOM-direct access, this bypasses all layout visibility issues.
**Consequences:** E2E interview responder skips suggestion selection to avoid `needsElaboration` validation trap. All E2E interactions in zero-height panels must use `page.evaluate()` for DOM-direct access.

## ADR-007: Redis Agent Bus — Spike and Decision
**Date:** 2026-02-28
**Status:** accepted (spike result: rejected for current scale, design archived for future use)

**Context:**
The current `AgentBus` (`server/src/agents/runtime/agent-bus.ts`) is an in-memory EventEmitter-style router. It holds agent subscriptions in a `Map<string, MessageHandler>` and a capped in-process message log (500 entries). The platform is designed as the cornerstone of a 33-agent system, and the bus comment itself notes it "can be upgraded to Redis/NATS for distributed agents later."

Three concrete scaling concerns prompted this spike:
1. **Crash recovery**: A Node.js crash kills all in-flight agent subscriptions and the message log. Revision requests from the Producer to the Craftsman are lost.
2. **Horizontal scaling**: Running multiple server instances (for load or availability) means an agent on instance A cannot message an agent on instance B.
3. **Observability**: The in-memory log is ephemeral; there is no durable audit trail of inter-agent messages.

**Options Evaluated:**

### Option A — Redis Pub/Sub
Each agent subscribes to a channel (e.g., `agent:craftsman:session_abc`). Publishers PUBLISH to the channel; all subscribers receive the message.

- **Ordering**: No guarantee. Messages can arrive out of order under load.
- **Durability**: Zero. If a subscriber is not connected when a message is published, the message is lost permanently.
- **Delivery**: At-most-once. No acknowledgment protocol.
- **Latency**: Sub-millisecond within a Redis instance; ~1ms over a local network.
- **Fit**: Poor. The Producer-to-Craftsman revision request is a stateful, at-least-once operation. Dropped messages cause silent data loss (revision is never applied). Pub/Sub is appropriate for ephemeral notifications (e.g., cache invalidation), not workflow handoffs.

### Option B — Redis Sorted Sets
Messages stored as members of a sorted set keyed by session. Score encodes timestamp for ordering.

- **Ordering**: Guaranteed by score — strictly monotonic if scores are assigned carefully.
- **Durability**: Persistent (subject to Redis persistence config). Messages survive subscriber restarts.
- **Delivery**: Pull-based polling. Agents must ZRANGEBYSCORE + ZREM in a loop; no push notification.
- **Latency**: Polling interval introduces artificial delay (100ms–1s typical). Requires a separate goroutine/interval per active session.
- **Fit**: Weak. The pull model imposes polling complexity with no inherent advantage over Streams for this use case. Sorted sets are designed for leaderboards and time-series queries, not message queues.

### Option C — Redis Streams (XADD / XREADGROUP)
A persistent, ordered append log per logical queue. Consumer groups provide at-least-once delivery with acknowledgment. Dead-letter handling via XPENDING.

- **Ordering**: Guaranteed within a stream. Entry IDs are monotonically increasing (millisecond + sequence number).
- **Durability**: Persistent with configurable MAXLEN trimming. Messages survive consumer restarts.
- **Delivery**: At-least-once via consumer groups. XACK removes entries from the pending list. Unacknowledged entries remain in XPENDING and can be reclaimed.
- **Latency**: ~1ms publish latency. XREADGROUP with BLOCK 0 provides efficient push-like delivery without polling.
- **Fit**: Best option if Redis is adopted. Matches the workflow semantics (ordered, durable, acknowledgeable handoffs).

### Option D — Keep In-Memory (Status Quo)
No Redis dependency. Single-process, synchronous delivery in ~microseconds.

- **Ordering**: Guaranteed (synchronous dispatch).
- **Durability**: None. Crash = message loss. For the current 3-agent, single-pipeline-per-session design this is acceptable because a crashed pipeline is restarted from the last DB checkpoint, not from the bus state.
- **Latency**: Microseconds.
- **Operational complexity**: Zero additional infrastructure.
- **Fit**: Entirely adequate for the current scale. All three agents run in the same process. The bus carries a low volume of messages per pipeline run (typically 1–3: one Strategist-to-Craftsman handoff, 0–N Producer revision requests). No message has ever been observed to be lost in production.

**Decision:**
Reject Redis adoption for the AgentBus at current scale. Keep the in-memory implementation.

**Reasoning:**

The core argument for Redis is durability and horizontal scalability. Both concerns are premature given the current architecture:

1. **No horizontal scaling today**: The pipeline is session-scoped. A session lock (`session-lock.ts`) prevents concurrent pipeline runs on the same session. All agents for a session already run in the same process on the same server. Adding Redis would introduce a network hop for every message that currently resolves in microseconds.

2. **Crash recovery is handled at the pipeline level, not the bus level**: When a pipeline crashes, the coordinator restarts from the last persisted `coach_sessions` checkpoint. The bus state (which agents are subscribed, pending messages) is reconstruction from coordinator startup — not from a persistent queue. Making the bus durable without also making the agent loops resumable (a much larger change) would give a false sense of crash safety.

3. **Message volume is too low to justify the complexity**: A typical pipeline run sends 1–4 bus messages. The Producer-to-Craftsman revision request is the most critical. If it is lost (due to a crash mid-pipeline), the user experiences a degraded but not broken result — the resume is still exported without that specific revision. This is an acceptable failure mode at current scale; it is not a data-loss event.

4. **Operational cost is non-trivial**: Redis adds a required infrastructure dependency (managed Redis instance on Supabase/Upstash/Railway, ~$20–60/month), connection pooling concerns, authentication configuration, and a new failure mode (Redis outage blocks all inter-agent messaging).

5. **The in-memory bus already has the right interface**: The `AgentBus` class (`subscribe`, `unsubscribe`, `send`, `getLog`, `reset`) is interface-compatible with a Redis Streams implementation. The switch can be made transparently behind a feature flag when horizontal scaling becomes necessary.

**When to revisit:**
- When the platform scales to 5+ agent types running in separate processes or containers.
- When a session must survive a server restart mid-pipeline (requires resumable agent loops, not just a durable bus).
- When pipeline throughput exceeds ~50 concurrent sessions (at which point a single Node.js EventEmitter becomes a bottleneck).

**Proof-of-Concept:**
`server/src/agents/runtime/agent-bus-redis.ts` — A complete Redis Streams implementation of the `AgentBus` interface. Feature-flagged via `FF_REDIS_BUS` env var (default false). Not connected to production paths. Uses `ioredis` (installed as dev dependency). Demonstrates XADD publish, XREADGROUP consume, XACK acknowledge, and graceful disconnect. Can be activated by setting `FF_REDIS_BUS=true` and `REDIS_URL` env vars.

**Consequences:**
- In-memory bus remains in production with no change.
- The Redis prototype is an executable reference for future platform scaling work.
- The `FF_REDIS_BUS` feature flag and `REDIS_URL` env var are documented but inert.
- When horizontal scaling is needed, the interface contract (subscribe/unsubscribe/send/getLog/reset) must be preserved so the coordinator requires no changes.

## ADR-008: SSE Broadcasting Strategy for Horizontal Scaling
**Date:** 2026-02-28
**Status:** accepted (design document — implementation deferred)

**Context:**
SSE connections are stored in an in-memory `Map<string, Array<emitter>>` (`sseConnections` in `routes/sessions.ts`). This Map is imported by `pipeline.ts` and `workflow.ts` for event broadcasting. This is the #1 blocker for horizontal scaling: if Instance A runs the pipeline and Instance B holds the SSE client connection, events never reach the user.

The `sseConnections` Map is accessed in 3 routes: `sessions.ts` (SSE endpoint), `pipeline.ts` (pipeline events), and `workflow.ts` (workflow events). All 3 import the same Map.

**Options Evaluated:**

1. **Sticky Sessions on Load Balancer** — Route all requests for a session to the same instance. Simplest. Railway supports session affinity via cookies.
2. **Redis Pub/Sub for SSE Fan-Out** — Pipeline publishes events to a Redis channel; all instances subscribe and forward to their local SSE clients. True horizontal scaling.
3. **Supabase Realtime** — Use Supabase's built-in Realtime channels for event delivery. Eliminates custom infrastructure but adds vendor dependency for core feature.

**Decision:**
Phase 1: Sticky sessions (when horizontal scaling is needed). Phase 2: Redis Pub/Sub (when sticky sessions become insufficient).

**Reasoning:**
Sticky sessions solve 95% of the scaling problem with zero code changes. Railway supports it natively. The only edge case is instance restarts mid-pipeline — the user must reconnect. Redis Pub/Sub is the right long-term solution but requires Redis infrastructure (shared with rate limiting per ADR-008/Story 8). Supabase Realtime adds latency and makes the core pipeline dependent on Supabase's real-time infrastructure.

**Consequences:**
- Detailed design document in `docs/SSE_SCALING.md`
- No code changes in this ADR — design only
- Sticky sessions can be enabled with Railway configuration changes only
- Redis Pub/Sub implementation planned as a separate story when Redis is in production

## ADR-009: Stripe as Payment Processor
**Date:** 2026-02-28
**Status:** accepted
**Context:** The product needs a payment system. `pricing_plans` and `user_subscriptions` tables already exist in Supabase (migration 011). No payment processing was wired up. The platform needs a hosted checkout experience, subscription lifecycle management, and a customer self-service portal with minimal frontend complexity.
**Decision:** Use Stripe for all payment processing. Stripe Checkout (hosted page) for new subscriptions, Stripe Customer Portal for self-service management, and Stripe webhooks for subscription lifecycle events (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`).
**Reasoning:** Stripe is the industry standard for SaaS subscription billing. The hosted Checkout page eliminates PCI scope from the frontend. The Customer Portal eliminates the need to build upgrade/downgrade/cancel UIs. Webhook-driven updates keep the `user_subscriptions` table authoritative without polling. The `stripe` npm package (v17+) is mature and well-typed.
**Consequences:**
- New env vars required: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- `pricing_plans` table gains a `stripe_price_id TEXT` column (migration `20260228150000_stripe_billing.sql`).
- New route file: `server/src/routes/billing.ts` (4 endpoints: `/checkout`, `/webhook`, `/subscription`, `/portal`).
- New middleware: `server/src/middleware/subscription-guard.ts` — blocks pipeline start when free tier limit exceeded.
- Frontend components: `PricingPage.tsx` (plan selection), `BillingDashboard.tsx` (current plan + usage).
- Free tier: 3 pipeline runs/month by default (override via `FREE_TIER_PIPELINE_LIMIT` env var).
- Stripe features are disabled (503 responses) when `STRIPE_SECRET_KEY` is not set, allowing dev environments without Stripe credentials.

## ADR-010: Stripe Promotion Codes for Discounts
**Date:** 2026-02-28
**Status:** accepted
**Context:** The product needed discount infrastructure for financial planning clients (100% off), friends and family (50% off), and general promotional campaigns. Options included building custom coupon tables in the application database or using Stripe's native Promotion Codes feature.
**Decision:** Use Stripe Promotion Codes mapped to Stripe Coupons. All discount validation, redemption tracking, and usage limits are handled server-side by Stripe. Checkout sessions are created with `allow_promotion_codes: true`. Admin endpoints in `server/src/routes/admin.ts` allow creating promotion codes via the Stripe API. Applied promo metadata is extracted from webhook events and stored in `user_subscriptions` for analytics.
**Reasoning:** Stripe Promotion Codes eliminate the need to build custom coupon tables, validation logic, usage counting, and expiry logic. There are no race conditions (Stripe handles atomic usage increment). The checkout UX is automatic — Stripe's hosted page shows the promo code input field with no frontend code. Analytics are built into the Stripe dashboard. Custom tables would duplicate battle-tested logic that Stripe already provides.
**Consequences:** Promo codes are not stored in the application database — Stripe is the source of truth. Admin creates codes via API or Stripe dashboard. `user_subscriptions` stores the applied promo code identifier for analytics queries. Requires `STRIPE_SECRET_KEY` to be set in production.

## ADR-011: Feature Entitlements Model
**Date:** 2026-02-28
**Status:** accepted
**Context:** Feature access was controlled by env var feature flags — an all-or-nothing mechanism with no per-plan or per-user granularity. The product needed free vs. paid plan differentiation (e.g., free gets 3 sessions, starter gets DOCX export, pro gets unlimited sessions) plus the ability to grant individual features outside of a plan (a la carte purchases, support grants).
**Decision:** Introduce two database tables: `plan_features` (plan_id, feature_key, feature_value JSONB) and `user_feature_overrides` (user_id, feature_key, override_value JSONB). `getUserEntitlements(userId)` in `server/src/lib/entitlements.ts` merges plan defaults with overrides. Feature guards are enforced via `requireFeature()` middleware factory.
**Reasoning:** JSONB feature values are flexible — a feature can be boolean (`{ "enabled": true }`) or quantity-based (`{ "limit": 50 }`), and both are handled by the same schema. The override table enables a la carte grants without modifying plan definitions. Fail-open design (DB error returns free-tier defaults) prevents entitlement failures from blocking users. The middleware approach keeps route handlers clean.
**Consequences:** New features require seed data in `plan_features` before they can be gated. Entitlement logic is centralized in `entitlements.ts` — all feature checks go through `getUserEntitlements()`. The `subscription-guard.ts` middleware was refactored to use `getUserEntitlements()` instead of direct DB queries.

## ADR-012: Affiliate Commission Structure
**Date:** 2026-02-28
**Status:** accepted
**Context:** The product needed an affiliate marketing system to support referral-based growth. Options included using a third-party affiliate platform (e.g., Impact, ShareASale) or building in-app tracking.
**Decision:** Build in-app affiliate tracking using two database tables: `affiliates` (affiliate profile with referral_code and commission_rate) and `referral_events` (click/signup/subscription events per referral code). Referral codes are captured via `?ref=CODE` query parameter, persisted in `localStorage`, and attached to Stripe Checkout Session metadata. The webhook records conversion events on successful subscription. Commission is calculated as `commission_rate * subscription_revenue`. Payouts are manual for MVP.
**Reasoning:** An in-app system avoids the monthly cost of an external affiliate platform ($50-500/month). The referral code flow through Stripe metadata ensures attribution is tied to actual payment events, not just signups. Configurable per-affiliate commission rates allow flexibility without changing the schema. Manual payouts are acceptable for MVP scale (low affiliate count).
**Consequences:** No automated payouts — affiliate dashboard shows stats and events, but commission disbursement is a manual admin operation. Future upgrade path is Stripe Connect for automated payouts. The affiliate dashboard is a separate component (`AffiliateDashboard.tsx`) accessible to affiliates once their account is set up.

## ADR-013: Dashboard Architecture — Prop-Drilling vs Context
**Date:** 2026-02-28
**Status:** accepted
**Context:** Sprint 8 added a user dashboard with 3 tabs (Sessions, Master Resume, Evidence Library) and 13 new components. The dashboard needs access to session data, resume data, and several API functions (listSessions, getSessionResume, updateMasterResume, getResumeHistory, etc.). Options: (1) create a DashboardContext provider, (2) prop-drill from App.tsx through DashboardScreen to tab components, (3) have tab components call useSession directly.
**Decision:** Prop-drill from App.tsx → DashboardScreen → tab components. All API functions are destructured from `useSession()` in App.tsx and passed as props. Tab components receive only the data and callbacks they need.
**Reasoning:** Prop-drilling is the simplest approach for a 2-level component tree. A Context provider adds indirection without meaningful benefit at this nesting depth. Having tab components call useSession directly would create multiple hook instances with duplicated state. The prop-drill approach keeps state centralized in App.tsx (single source of truth) and makes data flow explicit and testable.
**Consequences:** DashboardScreen has a large props interface (~15 props). If the dashboard grows significantly deeper (3+ levels), a DashboardContext may become worthwhile. Tab components are pure — they receive data and callbacks, making them easy to test with mock props.

## ADR-014: Parallel Tool Execution via `parallel_safe_tools` Config
**Date:** 2026-03-01
**Status:** accepted
**Context:** Each agent's tool calls execute sequentially in `agent-loop.ts` (line 168 for-loop). When the LLM calls multiple independent tools in a single round (e.g., Producer calling 3 quality checks), they wait for each other despite having no data dependencies. Z.AI API latency (1-5 min per call) makes this the largest single source of pipeline delay.
**Decision:** Add `parallel_safe_tools?: string[]` to `AgentConfig`. During tool execution, partition the round's tool calls into sequential (not in the list) and parallel (in the list). Run sequential tools first in order, then run parallel tools concurrently via `Promise.allSettled()`. Reassemble results in the original `tool_calls` order.
**Reasoning:** `Promise.allSettled()` was chosen over `Promise.all()` because one failing tool should not abort its siblings — each tool result (success or error) is reported independently to the LLM. Per-agent opt-in via config is safer than global parallelism — only tools explicitly declared safe are parallelized. The Producer benefits most (7 independent checks), the Craftsman benefits moderately (keyword + anti-pattern checks), and the Strategist benefits minimally (only emit_transparency).
**Consequences:** Tool execution order within a round is no longer strictly sequential for parallel-safe tools. Tools must not have hidden state dependencies to be declared parallel-safe. The `present_to_user` and `interview_candidate` tools are never parallel-safe (they wait for user input). Estimated saving: 3-8 minutes per pipeline run.

## ADR-015: Downgrade adversarial_review from MODEL_PRIMARY to MODEL_MID
**Date:** 2026-03-01
**Status:** accepted
**Context:** `adversarial_review` was routed to MODEL_PRIMARY (glm-4.7, $0.60/$2.20 per M tokens) — the most expensive tier. However, adversarial review is an analytical evaluation task (structured JSON scoring across 6 dimensions), not creative writing. Other evaluation tools like `classify_fit`, `self_review_section`, and `check_narrative_coherence` already use MODEL_MID successfully.
**Decision:** Route `adversarial_review` to MODEL_MID (glm-4.5-air, $0.20/$1.10 per M tokens). Reduce max_tokens from 6144 to 3072 in the quality reviewer.
**Reasoning:** Evaluation tasks produce structured JSON with scores and issue lists — they don't require the creative capacity of MODEL_PRIMARY. MODEL_MID handles all other evaluation tools well. The 3x cost reduction compounds across every pipeline run. The max_tokens reduction reflects that quality review responses rarely exceed 2000 tokens.
**Consequences:** Slight risk of lower-quality issue detection in edge cases. Monitor quality scores across pipeline runs to verify no regression. Can revert by changing one line in `llm.ts` if quality degrades.

## ADR-016: Batch-Only Interview Mode — Remove Single-Question `interview_candidate` Tool
**Date:** 2026-03-01
**Status:** accepted
**Context:** The Strategist originally had two interview modes: (1) a single-question conversational mode via the `interview_candidate` tool that asked questions one at a time via `ask_user` SSE events, and (2) a batch mode via `positioningToQuestionnaire()` that assembled all questions into a single `QuestionnairePanel`. The coexistence of both modes created complexity: the Strategist prompt had to handle branching logic, two code paths needed maintenance, and the LLM could choose either path inconsistently. The `QuestionnairePanel` UI (Sprint 6+) was specifically built to support the richer batch mode with clickable suggestion chips and multi-select answers. Sprint 10 Stories 1-2 added rich concrete suggestions to both LLM-generated and fallback questions — improvements that only benefit the batch path.
**Decision:** Remove `interviewCandidateTool` from the Strategist's tool exports entirely. All candidate interviews now use the `QuestionnairePanel` batch flow via `positioningToQuestionnaire()`. Update the Strategist system prompt to remove instructions referencing the removed tool.
**Reasoning:** A single consistent interview mode is simpler to maintain and test. The batch questionnaire mode is demonstrably better UX: users see all questions at once, can select from concrete options, and submit in a single interaction rather than paging through one question at a time. The single-question mode had no distinct advantages — it was a holdover from an earlier design. Removing it reduces the Strategist's tool surface by one tool and eliminates a class of prompt ambiguity.
**Consequences:** `interview_candidate` tool is no longer available to the Strategist LLM. The `interview_transcript` field in `PipelineState` is now populated exclusively through the questionnaire→`extractInterviewAnswers()` path. Any Strategist prompt guidance referencing the single-question mode must be removed. E2E tests reference the questionnaire flow only.

## ADR-017: Shared Tool Factory Pattern for Cross-Agent Tools
**Date:** 2026-03-01
**Status:** accepted
**Context:** All three agents (Strategist, Craftsman, Producer) implemented their own local `emit_transparency` tool with near-identical logic (~30 lines each). The implementations diverged slightly over time: Strategist and Craftsman guarded against empty messages; Producer did not (safeStr passed '' through). Strategist returned `{ success: true }`, Craftsman returned `{ emitted: true }`, and Producer had no consistent return shape. Each agent's tool file also needed its own SSE emission wiring. This ~90 lines of near-duplicate code was a maintenance liability.
**Decision:** Create `server/src/agents/runtime/shared-tools.ts` with a `createEmitTransparency<TState, TEvent>(config?)` factory function. The factory accepts an optional `{ prefix?: string }` config. Each agent instantiates the factory with its own type parameters at module load. The `runtime/` directory is already domain-agnostic (zero product imports) — this extends that design to shared tool logic.
**Reasoning:** A factory function is the right abstraction: it is generic (typed via `<TState, TEvent>`), configurable (optional prefix for the Producer), and testable in isolation. It enforces consistent behavior (empty message guard, `{ emitted: true }` return shape) without requiring each agent to remember to implement the guard. Placing it in `runtime/` maintains the existing separation: runtime contains domain-agnostic infrastructure; product-specific behavior stays in agent tool files.
**Consequences:** All three agents import `createEmitTransparency` from `runtime/shared-tools.js`. The return shape is standardized to `{ emitted: true, message }` on success and `{ success: false }` on empty message. Test assertions in `strategist-tools.test.ts` and `producer-tools.test.ts` updated to match the unified shape. Future shared tools (e.g., a shared `log_decision` tool) follow the same factory pattern in `shared-tools.ts`.

## ADR-018: Cross-Product Agent Bus Routing
**Date:** 2026-03-01
**Status:** accepted
**Context:** The agent bus (`agent-bus.ts`) used simple name-based routing (`subscribe('craftsman', handler)`). For the 33-agent platform, agents from different products (resume, sales, onboarding) need to communicate without name collisions. A `sales:craftsman` and `resume:craftsman` must coexist and be independently addressable.
**Decision:** Extend `AgentBus` with namespaced routing using `domain:agentName` keys. `subscribe()` accepts either `domain:name` or `name` keys. `send()` resolves handlers by trying `domain:to` first, then falling back to name-only for backward compatibility. Added `sendBroadcast(domain, msg)` for domain-wide notifications and `listSubscribers(domain?)` for discovery. The existing resume pipeline continues to work without changes due to backward-compatible fallback.
**Reasoning:** Namespacing is the simplest cross-product isolation mechanism. The `domain` field already existed on `AgentMessage` (added in the protocol design phase) but wasn't used for routing. Backward compatibility ensures zero migration cost for the existing resume product. Broadcast enables platform-level events (shutdown, health checks) without enumerating agents. In-memory implementation is sufficient for single-process deployment; the interface is clean enough for a future Redis/NATS adapter.
**Consequences:** The bus now supports multi-product deployment in a single process. New products register with their own domain prefix. The existing coordinator's `bus.subscribe('craftsman', handler)` continues to work via name-only fallback. The registry's `AgentConfig` gained optional `capabilities?: string[]` for discovery, and the registry gained `findByCapability()`, `listDomains()`, and `describe()` methods. Agent lifecycle hooks (`onInit`/`onShutdown`) are now wired in `runAgentLoop()`. These three features (bus routing, capability discovery, lifecycle hooks) form the platform foundation for multi-product deployment.

## ADR-019: Product Definition Layer — ProductConfig as Plain Object
**Date:** 2026-03-01
**Status:** accepted
**Context:** Sprint 12 set out to decouple resume-specific orchestration logic from a generic coordinator so that other products (cover letter, sales, onboarding) can run through the same runtime infrastructure without duplicating the entire `coordinator.ts` file. The key design question was: what shape does a "product definition" take? Options were (1) a class implementing an interface, (2) a plain configuration object, or (3) a factory function returning a coordinator.
**Decision:** `ProductConfig` is a plain object (no class, no factory). It declares the product's agents, phases (as `AgentPhase[]` with start/end hooks), inter-agent handlers (as `InterAgentHandler[]` with `listenTo` + `handler`), stage messaging labels, and `RuntimeParams`. The generic coordinator (`runProductPipeline()` in `runtime/product-coordinator.ts`) consumes a `ProductConfig` and drives the multi-phase agent sequence with gates, bus wiring, and SSE emission handled generically.
**Reasoning:** A plain object matches the existing `AgentConfig` pattern in the codebase — the runtime already treats agent definitions as data objects, not class instances. Plain objects are simpler to serialize, inspect, and test than class hierarchies. A factory function would add an unnecessary indirection layer. The declarative `interAgentHandlers` array (each entry is `{ listenTo: string, handler: fn }`) lets products wire cross-agent message handling without subclassing or overriding methods — the coordinator sets up all subscriptions at startup.
**Consequences:** `server/src/agents/runtime/product-config.ts` defines `ProductConfig`, `AgentPhase`, `GateDef`, `InterAgentHandler`, and `RuntimeParams` types. The existing `coordinator.ts` was rewritten from ~1430 lines to ~60 lines — it is now a thin wrapper that calls `runProductPipeline(resumeProductConfig, state, emit, signal)`. The cover letter POC (`agents/cover-letter/product.ts`) implements a second `ProductConfig` proving the abstraction is reusable. `pipeline.ts` was NOT refactored to use the factory route (deferred — 1985-line file has too much resume-specific routing logic for this sprint scope).

## ADR-020: Tool Model Routing via model_tier Property
**Date:** 2026-03-01
**Status:** accepted
**Context:** Model routing was implemented via `TOOL_MODEL_MAP`, a hard-coded `Record<string, string>` in `llm.ts` mapping tool names to model IDs. This design has two problems: (1) every new tool requires a manual addition to `TOOL_MODEL_MAP` in `llm.ts`, creating tight coupling between the LLM routing module and all product tool definitions; (2) the map has no way to route tools from a new product without modifying `llm.ts`.
**Decision:** Add `model_tier?: 'primary' | 'mid' | 'orchestrator' | 'light'` to `AgentTool`. Introduce `getModelForTier(tier)` in `llm.ts` to translate tier → model ID, and `resolveToolModel(tool, registry?)` to check `tool.model_tier` first, falling back to `TOOL_MODEL_MAP` for backward compatibility. The `registry` parameter is optional (dependency injection) to avoid a circular import between `llm.ts` and the tool files.
**Reasoning:** Embedding tier declarations on the tool definition itself is self-documenting — you know a tool's cost tier by looking at its definition, not by cross-referencing a central map. The fallback to `TOOL_MODEL_MAP` ensures zero regression for existing tools that predate `model_tier`. DI via the optional `registry` parameter avoids circular imports (tools import `llm.ts`, `llm.ts` cannot import tools). All 26 tools now have `model_tier` set; `TOOL_MODEL_MAP` is kept as a deprecated fallback and will be removed in a future sprint when all tools have been verified.
**Consequences:** `AgentTool` in `agent-protocol.ts` gains optional `model_tier` field. `llm.ts` exports `getModelForTier()` and `resolveToolModel()`. Craftsman tools.ts (4 tools) and Producer tools.ts (6 tools) updated with `model_tier`. Cover letter tools define `model_tier` from the start. `TOOL_MODEL_MAP` remains but is now dead code for any tool with `model_tier` set.

## ADR-021: Cover Letter as Minimal POC — No User Gates
**Date:** 2026-03-01
**Status:** accepted
**Context:** The Sprint 12 goal was to validate the `ProductConfig` abstraction with a second product. The cover letter product needs two agents (an analyst to parse the job and resume, a writer to draft the letter), but the team debated whether to include user-facing gates (approve draft, provide feedback) in the POC or defer them.
**Decision:** The cover letter POC includes 2 agents and 5 tools but zero user gates. The pipeline runs fully autonomously from start to finish. The output is streamed to the client but there is no `waitForUser()` call — the product definition's `gates` array is empty.
**Reasoning:** The goal of the POC is to validate the abstraction (can a second product run through the generic coordinator?), not to build a production cover letter product. User gates require frontend UI work (new panel types, response handling), which is out of scope for a backend-only validation sprint. A zero-gate pipeline still exercises all the core machinery: `ProductConfig`, `runProductPipeline()`, inter-agent communication, the product route factory, and SSE emission. If the abstraction holds for a zero-gate product, it will hold for any gate configuration.
**Consequences:** Cover letter is feature-flagged via `FF_COVER_LETTER` (default false). Routes mounted at `/api/cover-letter/*`. No frontend changes required. The POC demonstrates the abstraction is sound; a full cover letter product with gates, templates, and frontend UI is a separate future epic.

## ADR-022: Pipeline Route Migration — Event Middleware Hook Design
**Date:** 2026-03-02
**Status:** accepted
**Context:** `routes/pipeline.ts` (1,985 lines) was the last resume-specific monolith. Sprint 12's product route factory (`createProductRoutes()`) provided generic routes, but the resume pipeline had ~1,200 lines of SSE event processing (panel persistence, workflow artifacts, runtime metrics, section context sanitization), ~500 lines of route-level logic (JD resolution, capacity checks, stale recovery, question persistence), and domain-specific lifecycle management that didn't fit the generic factory.
**Decision:** Extract resume-specific logic into two modules that implement factory hooks:
1. `agents/resume/event-middleware.ts` — Closure-based factory (`createResumeEventMiddleware()`) returning `{ onEvent, onComplete, onError, flushPanelPersists, dispose }`. Per-session instances manage panel persistence queues, runtime metrics, and section context state.
2. `agents/resume/route-hooks.ts` — Stateless hook functions (`resumeBeforeStart`, `resumeTransformInput`, `resumeOnRespond`) plus module-level `runningPipelines` Map for in-process capacity tracking.
3. `routes/resume-pipeline.ts` — Thin wiring layer (~150 lines) that registers per-session middleware in `onBeforeStart`, dispatches to it from `onEvent`/`onComplete`/`onError`, and adds the `/status` endpoint.
**Reasoning:** The closure factory pattern (not classes) matches the codebase convention. Per-session state (panel queues, metrics) requires per-session instances — a static `onEvent` callback can't hold this state, so the wiring layer maintains a `Map<sessionId, middleware>`. The `onBeforeRespond` hook was added to the factory for stale pipeline detection because it must short-circuit before the factory's gate persistence logic runs. All hooks are optional, so existing products (cover letter) are unaffected.
**Consequences:** `routes/pipeline.ts` deleted. Resume pipeline behavior unchanged (verified by 864 passing tests). The factory now supports 7 lifecycle hooks: `onBeforeStart`, `transformInput`, `onEvent`, `onBeforeRespond`, `onRespond`, `onComplete`, `onError`. New products get the hook system for free. Minor tech debt: duplicate workflow persistence helpers in both event-middleware.ts and route-hooks.ts (pragmatic duplication, different call sites).

## ADR-023: Shared Platform Context — Cross-Product User Intelligence Store
**Date:** 2026-03-02
**Status:** accepted
**Context:** The resume agent produces high-value user intelligence: positioning strategies, evidence items, career narratives, and target roles. Each pipeline run rediscovers this intelligence from scratch. As the platform expands to additional products (cover letter, LinkedIn optimizer, interview prep), every new product needs the same intelligence gathering phase. There was no shared store for persisting and retrieving this intelligence across product boundaries.
**Decision:** Introduce a `user_platform_context` table in Supabase and a `server/src/lib/platform-context.ts` module with three functions: `getUserContext(userId, contextType)`, `upsertUserContext(userId, contextType, content, sourceProduct, sourceSessionId?)`, and `listUserContextByType(userId, types?)`. The resume product's `persistResult` hook calls `savePlatformContext()` (best-effort, wrapped in try/catch) to persist positioning strategy and evidence items on pipeline completion.
**Reasoning:** A dedicated cross-product table is simpler than trying to reuse product-specific tables (e.g., `user_positioning_profiles`, `master_resumes`). The `(user_id, context_type, source_product)` upsert key means the store reflects the latest run per product rather than accumulating unlimited rows. Using the admin client for writes ensures the data is always persisted regardless of which user session is active, while RLS policies ensure users can only query their own rows via the public client. The best-effort pattern (try/catch wrapping) ensures platform context failures never block pipeline completion — the core user deliverable (the resume) is never affected by a context persistence error.
**Consequences:** `user_platform_context` table created (migration `20260302120000_user_platform_context.sql`). `platform-context.ts` exports three typed functions with full error handling. The resume pipeline's `persistResult` now calls `savePlatformContext()` as a final best-effort step. Future products call `getUserContext()` or `listUserContextByType()` to bootstrap from accumulated intelligence. The `ContextType` union (`'positioning_strategy' | 'evidence_item' | 'career_narrative' | 'target_role'`) can be extended as new context shapes emerge.

## ADR-024: Own CoverLetterScreen (Not CoachScreen Reuse)
**Date:** 2026-03-02
**Status:** accepted
**Context:** The cover letter frontend needed a workspace screen. CoachScreen is 728 lines with 11 panel types, sidebar workflow navigation, snapshot management, and gate handling. The cover letter pipeline is a straight-through 2-agent flow (Analyst → Writer) with no user gates.
**Decision:** Create a dedicated `CoverLetterScreen` component (~180 lines) with its own internal state machine (intake → running → complete → error) rather than reusing or parameterizing CoachScreen.
**Reasoning:** CoachScreen's complexity is driven by the resume workflow's interactive gates, snapshot navigation, and 11 panel types. The cover letter needs none of this — it's a form submission → progress display → letter output flow. Attempting to make CoachScreen configurable would add complexity to both products. A dedicated screen is simpler and more maintainable.
**Consequences:** `app/src/components/cover-letter/CoverLetterScreen.tsx` is a standalone component. If future products need similar straight-through flows, this screen can be used as a template.

## ADR-025: New useCoverLetter Hook (Not Configurable useSession)
**Date:** 2026-03-02
**Status:** accepted
**Context:** The cover letter frontend needs SSE streaming from `/api/cover-letter/{sessionId}/stream`. The existing `useSession` hook manages 13 resume-specific operations (create session, list resumes, save base resume, etc.). The existing `useSSEConnection` hook is tightly coupled to `PipelineStateManager`.
**Decision:** Create a new `useCoverLetter` hook (~220 lines) that manages the cover letter pipeline lifecycle: start pipeline, SSE connection, event parsing, and state management.
**Reasoning:** `useSession` bundles too many resume-specific concerns. `useSSEConnection` requires the full `PipelineStateManager` interface with 20+ refs and setters. A dedicated hook that directly uses `fetch` + `parseSSEStream` is far simpler and avoids coupling to resume infrastructure.
**Consequences:** `app/src/hooks/useCoverLetter.ts` handles 6 CoverLetterSSEEvent types. Reconnect with exponential backoff (max 3 attempts). AbortController cleanup on unmount. Tested via pure state-transition unit tests (9 tests).

## ADR-026: Cover Letter as 'cover-letter' View in App.tsx
**Date:** 2026-03-02
**Status:** accepted
**Context:** The cover letter product needed URL routing. The resume product uses `view === 'coach'` and the tools catalog uses `view === 'tools'`.
**Decision:** Add `'cover-letter'` to the `View` type union. ProductCatalogGrid CTA navigates to `/cover-letter`. `navigateTo()` and `popstate` handler recognize the new path.
**Reasoning:** Consistent with the existing routing pattern. Each product gets its own view and URL path. The ToolsScreen's `onNavigate` is updated to pass `/cover-letter` through to the App router rather than treating it as a `/tools/*` subpath.
**Consequences:** `App.tsx` renders `CoverLetterScreen` when `view === 'cover-letter'`. The cover letter product in `PRODUCT_CATALOG` uses route `/cover-letter` (not `/tools/cover-letter`) and status `'active'`.

## ADR-027: Groq as Alternative LLM Provider for Latency Reduction
**Date:** 2026-03-02
**Status:** accepted
**Context:** Z.AI has 1-5 minute latency per LLM call. A balanced pipeline makes ~30-40 calls, resulting in 15-30+ minute total pipeline time — the #1 UX pain point. Groq offers sub-second latency via custom LPU hardware with OpenAI-compatible API.
**Decision:** Add `GroqProvider` class (extends `ZAIProvider` with shorter timeouts) and provider-aware model tier mapping. Selectable via `LLM_PROVIDER=groq` + `GROQ_API_KEY`. Z.AI remains available as `LLM_PROVIDER=zai`. Default model mapping: PRIMARY → `llama-3.3-70b-versatile` ($0.59/$0.79), MID → `llama-4-scout` ($0.11/$0.34), ORCHESTRATOR/LIGHT → `llama-3.1-8b-instant` ($0.05/$0.08). All models overridable via `GROQ_MODEL_{TIER}` env vars.
**Reasoning:** Groq's LPU architecture delivers deterministic sub-second latency (400-1500 tok/sec). Estimated pipeline time drops from 15-30 min to 1-3 min. Cost is ~$0.12/pipeline vs $0.26 on Z.AI (~54% savings). The OpenAI-compatible API means `GroqProvider` reuses all of `ZAIProvider`'s message translation, streaming, and tool-call parsing — only timeouts and base URL differ. SiliconFlow was considered but has less proven infrastructure and fewer model options.
**Consequences:** `ZAIConfig` now accepts optional `chatTimeoutMs`/`streamTimeoutMs`/`providerName` fields (backward compatible). Groq uses 30s chat / 60s stream timeouts (vs Z.AI's 180s/300s). The heartbeat workaround and stale pipeline recovery may need tuning for faster pipelines. Quality should be validated with 3-5 full pipeline runs before production switch.

## ADR-028: Model Tier Restructure — 70B for Agent Orchestration
**Date:** 2026-03-03
**Status:** accepted
**Context:** After the Sprint 19 Groq migration, all three agent loops (Strategist, Craftsman, Producer) used Scout 17B ($0.11/$0.34/M) for their main reasoning — deciding what tool to call, how to sequence work, and generating tool call parameters. The actual section writing used 70B ($0.59/$0.79/M). This was backwards: a weak "brain" coordinating strong "hands." Scout 17B is a Preview model with documented tool-calling quirks that required multiple workarounds (tool validation recovery, parameter coercion, JSON comment stripping).
**Decision:** Upgrade `GROQ_MODEL_ORCHESTRATOR` from `meta-llama/llama-4-scout-17b-16e-instruct` (Scout 17B) to `llama-3.3-70b-versatile` (70B). All three agent loops now use the same model as section writing. `MODEL_ORCHESTRATOR_COMPLEX` now maps to the same model as `MODEL_ORCHESTRATOR` on Groq (kept for backward compatibility). Agent timeouts reduced to reflect Groq's sub-second latency: round timeouts from 120-180s → 60s, overall timeouts from 600-900s → 300-600s. GroqProvider chatTimeoutMs increased from 30s → 45s to accommodate 70B's slightly higher latency per request.
**Reasoning:** Even with 70B for all agent loops, estimated cost per pipeline is ~$0.23 — still cheaper than Z.AI's ~$0.26, with 10x faster execution. The agent's reasoning quality (tool selection, sequencing, parameter generation) directly determines resume quality. Scout 17B's Preview status and tool-calling quirks are a liability for a production product. 70B is GA, has full tool calling support, and 131K context window. The "quality-first" principle: the agent brain should be as capable as the hands.
**Consequences:** Pipeline cost increases from ~$0.13 to ~$0.23 (77% increase but still below Z.AI). Workaround code (tool validation recovery, parameter coercion) kept as safety nets but expected to trigger less frequently. May reduce need for prescriptive "call X then Y then Z" system prompts since 70B can reason about tool sequencing independently.

## ADR-029: MID Tier — Keep Scout 17B for Non-Orchestration Tasks
**Date:** 2026-03-03
**Status:** accepted
**Context:** With the ORCHESTRATOR tier upgraded to 70B, the MID tier (Scout 17B) is now only used for `self_review_section`, `classify_fit`, and `build_benchmark` — tasks that don't require tool calling. Alternatives considered: Qwen3 32B ($0.29/$0.59, Preview, parallel tool calling), GPT-OSS 120B ($0.15/$0.60, GA, no parallel tool calling), or collapsing MID into PRIMARY (all 70B).
**Decision:** Keep Scout 17B ($0.11/$0.34) for the MID tier. These tasks are structured analysis (not creative writing or tool calling), and Scout handles them adequately. The MID tier no longer drives any agent loop reasoning.
**Reasoning:** Scout's tool-calling quirks don't affect MID tier tasks — `self_review_section` and `classify_fit` receive structured input and produce structured output without tool calls. Upgrading to Qwen3 32B would cost ~2.6x more with uncertain quality benefit. Collapsing MID into PRIMARY (70B) would add ~$0.10/pipeline for marginal quality gain on analysis tasks. If self-review quality degrades after the 70B orchestrator upgrade, Qwen3 32B is the recommended next step.
**Consequences:** MID tier cost unchanged. Scout 17B's Preview status remains a minor risk — if Groq deprecates it, Qwen3 32B is the ready fallback. Monitor self-review quality in pipeline runs.

## ADR-030: Claude Code Skills System Adoption
**Date:** 2026-03-05
**Status:** accepted
**Context:** Development follows a strict scrum framework (CLAUDE.md) but certain tasks — adding new agent tools, creating SSE panels, running pre-commit quality checks — require touching 4-5 files in the right order with project-specific patterns. These multi-file operations are error-prone, especially model routing entries in `llm.ts` which silently fall back to the wrong tier if missing.
**Decision:** Adopt 12 Claude Code skills (`~/.claude/skills/`) that encode project-specific patterns. Skills applicable to this project: qa-gate, agent-tool-scaffold, sse-event-pipeline, component-test-gen, supabase-migration, scrum-session, dead-code-hunter, llm-prompt-lab, error-pattern, adr-writer.
**Reasoning:** Skills persist across sessions — the agent-tool-scaffold skill encodes the exact 5-file sequence (tool definition, Zod schema, model routing, agent registration, test file) and warns about the input_schema/Zod mismatch pitfall and model routing fallback issue. The scrum-session skill automates the session start/end protocol from CLAUDE.md, reducing manual compliance overhead. The qa-gate skill codifies the quality checklist that prevents stale closures, import resolution failures, and type mismatches.
**Consequences:** CLAUDE.md updated with skills reference section. Skills are validated against real tasks before being trusted. Skills may need updates as the agent runtime evolves (e.g., new agent bus protocol, Redis migration).

## ADR-031: 4-Tier Model Routing for Cost Optimization

**Date:** 2026-03-05 (retroactive — established ~2026-02)
**Status:** accepted
**Context:** A full pipeline run invokes 30-50 LLM calls across different tools with vastly different complexity requirements. Using a single model for all calls wastes money on simple tasks and risks quality on complex ones.
**Decision:** Implement 4-tier model routing in `llm.ts`: PRIMARY (section writing, adversarial review), MID (self-review, benchmarking, gap analysis), ORCHESTRATOR (agent loop reasoning), LIGHT (text extraction, JD analysis). Each tool maps to one tier via `getModelForTool()`.
**Reasoning:** Cost optimization — LIGHT tier is free on Z.AI and $0.05/M on Groq. Pipeline cost dropped from ~$2.50 to ~$0.23 per run on Groq. Tool complexity naturally clusters into 4 levels: extraction (trivial), analysis (moderate), creation (complex), reasoning (complex + long-context).
**Consequences:** Adding new tools requires explicit tier assignment in `llm.ts`. Unknown tools fall back to ORCHESTRATOR tier. Each provider (Groq, Z.AI, Anthropic) maps tiers to different concrete models. Model overrides available via env vars.

## ADR-032: Panel-Based Right Pane UX (Not Chat-First)

**Date:** 2026-03-05 (retroactive — established ~2026-02)
**Status:** accepted
**Context:** Early prototypes used a chat-first UI where all agent output appeared as messages. This created a wall-of-text experience inappropriate for structured resume workflow stages (blueprint review, section editing, gap visualization).
**Decision:** Replace chat-first with a panel system. The right pane renders specialized components (11 panel types) dispatched by `panel-renderer.tsx`. Each pipeline stage emits `right_panel_update` SSE events carrying typed `PanelData` payloads.
**Reasoning:** Different workflow stages need fundamentally different UIs — a gap analysis matrix, a section editor with diff view, a questionnaire form. A chat interface forces all of these into text, losing structure. The panel discriminated union (`PanelData.type`) provides type safety for the frontend.
**Consequences:** New panel types require: TypeScript type in `panels.ts` union, component in `panels/`, renderer case in `panel-renderer.tsx`, backend SSE emission. The sse-event-pipeline skill automates this 4-file sequence.

## ADR-033: Self-Review Loop Before User Presentation

**Date:** 2026-03-05 (retroactive — established ~2026-02)
**Status:** accepted
**Context:** Initial drafts from the Craftsman often contained anti-patterns (buzzword density, weak action verbs, missing quantification) that the user would catch and request fixes for, creating unnecessary revision cycles.
**Decision:** The Craftsman runs an autonomous self-review loop after each section draft: `write_section` → `self_review_section` → `revise_section` (if needed) → `present_to_user`. The self-review checks against the quality checklist and anti-pattern list before any human sees the output.
**Reasoning:** Catching issues before user presentation reduces revision rounds by ~60%. The self-review uses the MID tier model (cheaper than PRIMARY), so the cost overhead is minimal. This also teaches the agent to internalize quality standards over the course of a pipeline run.
**Consequences:** Each section takes 2-3 LLM calls instead of 1, but user satisfaction is higher. The `check_anti_patterns` and `check_evidence_integrity` tools run during self-review. If self-review fails 3x, the section is presented with a quality warning.

## ADR-034: JSON Repair Layer for LLM Response Reliability

**Date:** 2026-03-05 (retroactive — established ~2026-01)
**Status:** accepted
**Context:** LLM responses frequently contain malformed JSON: trailing commas, JavaScript-style comments, unquoted keys, markdown code fences wrapping JSON, truncated responses. This caused pipeline crashes at JSON.parse boundaries.
**Decision:** Implement `json-repair.ts` as a universal repair layer applied to all LLM JSON responses. It strips comments, fixes trailing commas, removes code fences, repairs truncated objects, and coerces stringified values. `coerceToolParameters()` in `agent-loop.ts` handles the specific case of stringified JSON in tool call arguments.
**Reasoning:** Defensive parsing is cheaper than retrying failed LLM calls. The repair layer adds <1ms per call. Different models have different failure modes — Z.AI adds comments, Groq occasionally truncates, all models sometimes wrap JSON in markdown fences.
**Consequences:** Pipeline reliability improved dramatically. The repair layer logs warnings when it intervenes, enabling monitoring of model-specific issues. Risk: repair could silently fix a genuine error, but this is acceptable given the alternative (crash).

## ADR-035: React.lazy Code Splitting for CareerIQ Room Components

**Date:** 2026-03-06
**Status:** accepted

**Context:**
CareerIQ has 8 room components plus RoomPlaceholder, all imported eagerly in CareerIQScreen.tsx. Users typically visit 1-2 rooms per session, meaning 6-7 room bundles are downloaded but never rendered. As rooms grew richer (InterviewLabRoom ~400 lines, NetworkingHubRoom ~350 lines), the wasted initial payload became significant.

**Decision:**
Lazy-load all room components using `React.lazy()` with a shared `<Suspense fallback={<RoomLoadingSkeleton />}>` wrapper. Eagerly import only always-visible components (Sidebar, DashboardHome, WelcomeState, WhyMeEngine, LivePulseStrip, MobileBriefing, useWhyMeStory, useMediaQuery). Use the named-export lazy pattern: `lazy(() => import('./Room').then(m => ({ default: m.Room })))`.

**Consequences:**

*Positive:*
- Initial bundle reduced — only dashboard shell + active room loaded
- Vite handles chunk splitting automatically, no manual configuration needed
- RoomLoadingSkeleton provides consistent loading UX across all rooms

*Negative:*
- Named export pattern is slightly verbose compared to default exports
- First navigation to a room has a brief loading flash (mitigated by skeleton)

*Neutral:*
- Type imports (e.g., `PipelineInterviewCard`) still use eager `import type` — no lazy loading needed for types

## ADR-036: Computed Signals from Existing Data (No New API Calls)

**Date:** 2026-03-06
**Status:** accepted

**Context:**
Zone 4 (Your Signals) displayed 3 static mock signal cards. The design brief called for real signals reflecting the user's positioning strength, activity level, and market alignment. Options were: (1) create a new backend endpoint that computes signals server-side, (2) derive signals client-side from data already in the component tree (Why-Me signals, session count, pipeline stats).

**Decision:**
Compute all 3 signals client-side from existing data already available in CareerIQScreen: Positioning Strength from Why-Me signal levels, Activity Score from session count + pipeline card count, Market Alignment from pipeline stage distribution. ZoneYourSignals accepts optional `whyMeSignals`, `sessionCount`, and `pipelineStats` props, falling back to mock data when props are absent.

**Consequences:**

*Positive:*
- Zero new API calls — no added latency or backend work
- Signals update instantly as users complete Why-Me steps or add pipeline cards
- Graceful fallback: new users see mock signals until they generate real data

*Negative:*
- Signals are limited to data available in the frontend — no server-side analytics (e.g., resume quality scoring)
- Pipeline stats require pipeline data to be loaded in DashboardHome (currently not — noted as tech debt)

*Neutral:*
- Signal computation is pure functions — easily testable and relocatable to a hook if needed later

## ADR-037: Optimistic Drag-and-Drop with Supabase Rollback for Pipeline

**Date:** 2026-03-06
**Status:** accepted

**Context:**
ZoneYourPipeline implements a 5-stage Kanban board backed by Supabase `job_applications`. The UX question was whether to (1) wait for Supabase confirmation before updating the UI (pessimistic), (2) update UI immediately and persist in background (optimistic), or (3) use local-only state with periodic sync.

**Decision:**
Optimistic updates: drag-and-drop immediately moves the card in local state via `setCards()`, then fires an async Supabase upsert. On error, the component re-fetches the full card list from Supabase to rollback to server truth. Archive uses the same pattern — optimistic remove, then Supabase `status='archived'` update.

**Consequences:**

*Positive:*
- Instant UI feedback — no perceptible latency on drag-and-drop
- Rollback by re-fetch is simpler and more reliable than tracking previous state

*Negative:*
- Brief inconsistency window between UI and server state
- If Supabase is completely down, rollback re-fetch also fails — user sees a flash of cards reappearing then disappearing

*Neutral:*
- Falls back to mock data on initial load if Supabase is unreachable — pipeline is fully usable in offline/demo mode

## ADR-038: Cross-Room Data Flow via CareerIQScreen Prop Passing

**Date:** 2026-03-06
**Status:** accepted

**Context:**
Multiple rooms need access to the same data: Interview Lab needs pipeline cards in "Interviewing" stage, DashboardHome needs session data for computed signals and agent feed, Job Command Center needs pipeline summary. Options were: (1) each room loads its own data independently, (2) shared React context/provider, (3) parent component loads data and passes via props.

**Decision:**
CareerIQScreen acts as the data orchestration layer — it loads pipeline "Interviewing" cards from Supabase once and passes them to InterviewLabRoom as `pipelineInterviews` prop. It passes `recentSessions` and `sessionCount` to DashboardHome, which derives computed signals and feed events. PipelineSummary loads its own data independently (acceptable because it's a different query shape).

**Consequences:**

*Positive:*
- No new dependencies (no context provider, no state library)
- Data loading happens once at the parent level, preventing duplicate Supabase calls for Interview Lab
- Type-safe prop passing catches mismatches at compile time

*Negative:*
- Pipeline data is still loaded independently in 3 places (ZoneYourPipeline, PipelineSummary, CareerIQScreen) — consolidation via shared context is identified tech debt
- Adding new cross-room data flows requires threading props through CareerIQScreen

*Neutral:*
- This pattern is consistent with the existing approach (App.tsx passes sessions/resumes to CareerIQScreen the same way)

## ADR-039: Post-Deploy Stabilization Period

**Date:** 2026-03-08
**Status:** accepted

**Context:**
Sprints 50-53 shipped a large volume of work: Retirement Bridge agent (Sprint 50), B2B Outplacement with admin portal and white-label (Sprint 51), production foundation with all 39 DB migrations applied and environment configuration (Sprint 52), and observability with Sentry enrichment, pipeline metrics, and smoke tests (Sprint 53). The production deployment on 2026-03-08 was the first time many of these features ran against real infrastructure. The codebase had 2,103 server tests and 1,018 app tests, both tsc clean, but accumulated tech debt from rapid feature development needed attention.

**Decision:**
Run Sprint 54 as a dedicated cleanup sprint with zero new agents or large features. Focus on: removing orphaned code from earlier sprints, deduplicating UI messages, extracting shared test infrastructure, and filling small feature gaps (cover letter DOCX export). Let production stabilize while monitoring Sentry alerts and pipeline metrics.

**Reasoning:**
Post-deploy is when real usage patterns expose issues that tests miss. Shipping new features during this window compounds risk — a new bug could be confused with a deploy regression, and investigation becomes harder when the codebase is changing. A cleanup sprint also pays down tech debt while the context from recent sprints is still fresh, and shared test utilities established now reduce boilerplate for all future sprints.

**Consequences:**

*Positive:*
- One sprint of zero feature velocity, but production stability is preserved
- Tech debt from Sprints 50-53 is addressed while context is fresh
- Shared test infrastructure reduces per-test boilerplate going forward
- Sets a precedent: major deploys should be followed by a stabilization sprint

*Negative:*
- One sprint of zero feature velocity delays the next batch of platform agents

## ADR-040: @dnd-kit for Kanban Drag-Drop

**Date:** 2026-03-08
**Status:** accepted

**Context:**
The Job Command Center Kanban board needs drag-and-drop for moving applications between pipeline stages. The existing board used dropdown menus for stage transitions. We need a lightweight, accessible drag-drop library compatible with React 19.

**Decision:**
Use `@dnd-kit/core` + `@dnd-kit/utilities` for Kanban drag-drop. Chose @dnd-kit over react-beautiful-dnd (unmaintained, React 18 only), react-dnd (heavier, more complex API for our use case), and native HTML5 drag API (poor mobile support, no collision detection).

**Reasoning:**
- @dnd-kit is actively maintained, supports React 19, and has first-class TypeScript support
- Lightweight: ~12KB gzipped for core + utilities
- Accessible: keyboard navigation out of the box
- PointerSensor with distance activation constraint prevents accidental drags on click
- useDroppable/useDraggable hooks integrate cleanly with our glass morphism component patterns
- Does not require a backend — purely client-side for optimistic UI updates

**Consequences:**
- New dev dependency: `@dnd-kit/core`, `@dnd-kit/utilities`
- Stage dropdown kept as fallback for accessibility and precision
- Cards use `onPointerDown` stopPropagation for buttons to prevent drag interference
- Future: may add @dnd-kit/sortable if we need intra-column card reordering

## ADR-041: JSON Schema for Tool input_schema, Zod Optional for LLM Output Validation
**Date:** 2026-03-09
**Status:** accepted

**Context:**
The `agent-tool-scaffold` skill generates plain JSON Schema objects for `input_schema` on every tool. Examining the codebase confirms this is the consistent pattern across all 16+ non-resume agents (interview-prep, linkedin-content, linkedin-optimizer, networking-outreach, cover-letter, etc.). The Resume Builder's strategist/tools.ts imports `BenchmarkCandidateSchema`, `ClassifyFitOutputSchema`, and `DesignBlueprintOutputSchema` from `agents/schemas/strategist-schemas.ts` — these are Zod schemas used to validate and parse LLM *responses* (structured JSON output), not the `input_schema` field that the LLM reads. The two concerns are distinct.

**Decision:**
Plain JSON Schema objects (`{ type: 'object', properties: {...}, required: [...] }`) are the accepted platform standard for tool `input_schema`. This is what the LLM provider receives and uses to validate tool call arguments. Zod schemas are recommended but optional for validating LLM *output* (parsing structured JSON responses from non-tool-call LLM requests). New agents should use JSON Schema for `input_schema` and may use Zod + `parseAndValidateLLMOutput` / `repairJSON` for output parsing.

**Reasoning:**
- LLM providers (OpenAI-compatible APIs) accept JSON Schema directly for tool definitions — there is no benefit to wrapping `input_schema` in Zod since it must be serialized to plain JSON anyway.
- Zod adds value for output validation (type safety, runtime coercion, fallback handling) but is not required — `repairJSON` + manual coercion is an equally valid pattern already used by most agents.
- The `agent-tool-scaffold` skill generates correct plain JSON Schema without Zod, matching all existing agents.
- Introducing Zod for `input_schema` across 16+ agents would be pure churn with no runtime benefit.

**Consequences:**
- No migration needed for existing agents.
- When CLAUDE.md or agent notes mention "Zod schemas," this refers to output validation only.
- The `agents/schemas/` directory in the Resume Builder stores output-validation schemas — this is the correct placement for any new Zod schemas added to other agents.

## ADR-042: Resume Agent v2 — 10-Agent Rebuild
**Date:** 2026-03-11
**Status:** accepted

**Context:**
The current 3-agent resume pipeline (Strategist/Craftsman/Producer) treats AI like an assembly-line worker. A cheap orchestrator LLM decides what tools to call, questions come out generic, stages flash by unreadable, and the pipeline produces inferior results to a single well-crafted ChatGPT prompt. The panel-based UX with 11 panel types, approval gates, and section-by-section review creates friction without adding value.

**Decision:**
Replace the entire resume pipeline with a 10-agent architecture: Job Intelligence, Candidate Intelligence, Benchmark Candidate (parallel) → Gap Analysis → Narrative Strategy (sequential) → Resume Writer → Truth Verification + ATS Optimization + Executive Tone (parallel) → Resume Assembly. Two-field intake (resume + JD). Streaming accumulation UX replacing panels. Inline AI editing on the resume document. "Add Context" text box replacing the positioning interview.

Keep: agent runtime (`agents/runtime/`), SSE infrastructure, model routing, product route factory, all non-resume platform code, Glass design system, export libs, auth.
Delete: `agents/strategist/`, `agents/craftsman/`, `agents/producer/`, `agents/coordinator.ts`, `agents/resume/`, all supporting agent files, all 11 panel components, pipeline-specific hooks/types.
Modify: `LiveResumeDocument.tsx` (inline editing), `useAgent.ts` (streaming), `App.tsx` (new routing).

**Reasoning:**
Each agent in the new system owns one clear responsibility and uses a quality prompt with full context — not a tool-calling loop driven by a cheap orchestrator. The Gap Analysis Agent creatively closes gaps (inferring budgets, reframing adjacent skills). The Resume Writer Agent produces a complete document in one pass. The streaming UX shows output accumulating (like ChatGPT) instead of flashing panel transitions. The platform infrastructure (runtime, routes, auth, design system, other products) is sound and stays.

**Consequences:**
- Complete rewrite of the resume product layer — no incremental migration
- All current resume pipeline tests become invalid (they test deleted code)
- Design blueprint: `docs/obsidian/30_Specs & Designs/Resume Agent v2 — Design Blueprint.md`
- Other products (Coach, Onboarding, Retirement Bridge, Job Command Center) are unaffected
- The scaffold skill remains the authoritative generator for new tools — it produces JSON Schema for `input_schema` by design.

## ADR-043: Stateless LLM Utility Endpoints in Route Handlers
**Date:** 2026-03-13
**Status:** accepted

**Context:**
The platform's Agent-First Architecture Mandate states that every feature, workflow, and data pipeline must maximize agent autonomy. The mandate is explicit: "If a new feature doesn't fit cleanly into an existing agent's domain, propose a new agent first. Do not write procedural code as a workaround." This rule exists to prevent LLM logic from leaking into procedural route handlers, which destroys adaptability, reasoning depth, and inter-agent composability.

However, a class of product feature has emerged that is genuinely incompatible with the agent runtime model: lightweight, stateless analysis utilities embedded in product toolboxes. The LinkedIn Studio's recruiter simulator (`POST /api/linkedin-tools/recruiter-sim`) and writing analyzer (`POST /api/linkedin-tools/writing-analyzer`) are the canonical examples. Both are instant-feedback tools: the user submits text, receives a structured JSON analysis, and the interaction is complete. There is no session, no conversation history, no tool-calling loop, no multi-step reasoning, and no downstream pipeline dependency.

Forcing either endpoint into the agent runtime would require instantiating an `AgentContext`, a `ProductConfig`, and a `runAgentLoop` call — infrastructure that adds latency, complexity, and cost overhead with zero improvement in output quality. The agent loop earns its overhead by enabling multi-round reasoning, tool selection autonomy, and inter-agent communication. None of those capabilities are relevant when the entire workflow is: receive text → call LLM once → parse JSON → return.

**Decision:**
Direct `llm.chat()` calls are permitted inside Hono route handlers for stateless, single-LLM-call utility endpoints, provided ALL of the following conditions are true simultaneously:

1. **No session state.** The endpoint does not read from or write to any session, pipeline state, or `PipelineState` object. It takes its entire input from the request body.
2. **Single LLM call.** Exactly one `llm.chat()` call per request. No chained calls, no conditional second calls, no retry loops with different prompts.
3. **No tool calling.** The LLM call uses no tools and no function/tool schemas. The model is instructed to return structured JSON directly via its system prompt.
4. **No multi-step reasoning.** The prompt does not ask the model to reason across multiple phases, compare documents, or synthesize inputs from prior LLM calls.
5. **Structured JSON response only.** The endpoint returns a typed, validated JSON object. The response is terminal — it is not fed into any other agent or pipeline stage.
6. **MODEL_LIGHT tier.** The call uses `MODEL_LIGHT` (the fastest, cheapest model tier). If the analysis requires `MODEL_MID` or above, that is a signal the work is complex enough to belong in an agent tool.

The reference implementation is `server/src/routes/linkedin-tools.ts`: two endpoints, each making one `MODEL_LIGHT` call with a structured JSON prompt, `repairJSON` parsing, typed fallback on parse failure, and a flat `try/catch` with `logger.error`. No state, no tools, no loop.

**Reasoning:**
The Agent-First Mandate exists to prevent reasoning and decision-making from being hard-coded into procedural application logic. The mandate is violated when a route handler encodes sequencing decisions, conditional branching across LLM calls, or multi-phase reasoning that should belong to an autonomous agent. None of those conditions apply to a single-call utility endpoint.

Wrapping a single `llm.chat()` call in an agent runtime would be architectural theater: the overhead of `AgentContext`, `ProductConfig`, `runAgentLoop`, and an `onComplete` handler would exist solely to satisfy a mandate designed for situations that don't apply. Good architecture applies constraints where they prevent harm. A single-call endpoint has no multi-step reasoning to protect, no state to corrupt, and no agent autonomy to suppress. The agent runtime adds nothing and costs latency, memory, and code complexity.

The six conditions above define the exact boundary. They are not guidelines — they are hard gates. If any condition is not met, the work belongs in an agent tool, not a route handler. The purpose of the conditions is to make the exception narrow enough that it cannot be stretched to justify agent-like logic living in routes.

**Consequences:**
- `server/src/routes/linkedin-tools.ts` is the only current file operating under this exception. Both of its endpoints satisfy all six conditions.
- Any developer adding a new utility endpoint must verify all six conditions before choosing the route-handler pattern. If a second LLM call is ever needed (e.g., "if the score is below 40, also call a remediation analyzer"), the endpoint must be migrated to an agent tool. There is no "almost stateless" exception.
- This ADR does NOT authorize: multi-call chains in routes, any use of `MODEL_MID` or above in routes without a separate ADR, passing route handler results into a pipeline or agent as structured state, or adding tool schemas to a route-level LLM call.
- Future utility endpoints in other product toolboxes (e.g., a LinkedIn headline scorer, a cover letter tone checker) may follow this pattern if and only if all six conditions are satisfied at the time of implementation and remain satisfied as the endpoint evolves.
- If an endpoint built under this exception later requires a second LLM call or session context, it MUST be refactored into an agent tool before that capability is added. No gradual expansion of route-handler LLM logic is permitted.

## ADR-044: Codex Operating Guardrails + Shared AI Workflow Model
**Date:** 2026-03-22
**Status:** accepted

**Context:**
The product has repeatedly drifted into local UI copy fixes, room-specific helper behavior, and downstream hardening for problems that are actually shared across the application. The result is repeated rescue work: weak or generic LLM outputs are corrected in one room, then reappear in another room or later stage. `CLAUDE.md` contains strong project history and philosophy, but Codex does not automatically treat it as the active operating brief. The repository did not have a Codex-native guardrail file (`AGENTS.md`) or a concise shared AI workflow contract for the active product.

**Decision:**
Adopt a Codex-native control layer made of:

1. `AGENTS.md` at the repository root as the required operating brief for Codex
2. `docs/AI_OPERATING_MODEL.md` as the canonical shared AI/user-task contract
3. `docs/CODEX_IMPLEMENTATION_GUARDRAILS.md` as the anti-drift checklist
4. `docs/APP_WIDE_OVERHAUL_PLAN.md` as the sequencing plan for the application-wide refactor

All active-room AI work must map back to the shared model:

- goal
- what we know
- what is missing
- best next action
- AI help inside the action
- review / apply

Before implementing AI/workflow changes, Codex must review the documents above plus the current sprint and conventions docs.

**Reasoning:**
The product problem is no longer just resume quality. It is a repeated architecture and interaction-pattern problem. Without a small set of required documents that Codex re-reads every session, work can regress into local patching, sidecar AI tools, duplicated analysis views, and increasingly heavy downstream hardening. The new document set creates explicit stopgaps: recurring issues must be mapped to the shared model before code is written, and downstream hardening is treated as a safety net rather than the primary strategy.

**Consequences:**
- `AGENTS.md` becomes the Codex-native equivalent of a mandatory session brief
- shared workflow logic must be justified against `docs/AI_OPERATING_MODEL.md`
- if a problem repeats across rooms, the shared docs must be updated before local fixes continue
- future work should prioritize upstream context quality and shared contracts before room-specific rescue logic
