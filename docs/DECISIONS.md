# Architecture Decision Records — Resume Agent

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
