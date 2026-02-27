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
