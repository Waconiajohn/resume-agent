# CareerIQ Platform — Architecture Review
## Unified QA Audit Report

**Date:** 2026-03-11
**Audited By:** QA Agent (4-domain parallel audit)
**Scope:** Route Security, Agent Architecture, Frontend/Data Systems, Static Analysis

---

## Executive Summary

This report consolidates findings from four independent QA audits across the CareerIQ platform. A total of **57 findings** were identified across all domains.

| Severity | Count |
|----------|-------|
| Critical | 3 |
| High | 6 |
| Medium | 22 |
| Low | 26 |
| **Total** | **57** |

### Top Priorities

1. **DB-2 (Critical):** `user_platform_context.context_type` CHECK constraint is stale — 9 context types added since initial migration will be silently rejected by Postgres. Breaks Onboarding, Retirement Bridge, Emotional Baseline, and every cross-product context feature.
2. **ROUTE-CRIT-1 (Critical):** Admin routes are completely unprotected when `ADMIN_API_KEY` is unset and `NODE_ENV=development` — includes a DoS vector against dev/staging instances.
3. **FE-DB-2 (Critical):** RLS INSERT/UPDATE policies on `onboarding_assessments` and `retirement_readiness_assessments` use `WITH CHECK (true)` — any authenticated user can write rows for any `user_id`.
4. **AGENT-H1 (High):** `interview_candidate_batch` missing `isInteractive: true` — session termination during live interviews if tool is renamed.
5. **ROUTE-H1 through ROUTE-H3 (High):** Three authorization gaps in `planner-handoff.ts` and `b2b-admin.ts` allow cross-user data access.
6. **FE-SSE-1 (High):** Virtual Coach `recommendation_ready` SSE events are silently discarded — the coach's primary output never reaches the UI.

The core product pipeline (3-agent resume flow, product-route-factory, panel system) is fundamentally sound. The issues are concentrated in newer features and auxiliary routes that were not built through the hardened factory pattern.

---

---

# Section 1: Route Security & Correctness Audit

**Files Audited:** 40 route files in `server/src/routes/`

## Section Executive Summary

The route layer is broadly well-engineered. `product-route-factory.ts` centralizes authentication, rate limiting, body size limits, and session ownership checks, meaning every agent pipeline product inherits correct security controls by construction. The most serious issue is a security flaw on the admin route and two authorization gaps in specialized routes. The bulk of findings are medium-to-low severity design concerns.

---

## Critical Findings

### ROUTE-CRIT-1: Admin Routes Unprotected in Development with No Key Set

**Severity:** Critical
**File:** `server/src/routes/admin.ts` lines 23–27

**Description:**
```ts
if (!adminKey) {
  if (process.env.NODE_ENV === 'development') {
    logger.warn('ADMIN_API_KEY not set — admin routes unprotected in development');
    await next();
    return;
  }
```

When `ADMIN_API_KEY` is not set and `NODE_ENV === 'development'`, any HTTP client can call `POST /api/admin/reset-rate-limits`, `POST /api/admin/feature-overrides`, or `POST /api/admin/promo-codes` without any credential. The `reset-rate-limits` endpoint calls `resetSessionRouteStateForTests()` which clears all in-memory SSE connection state, processing session locks, and idempotency keys — a denial-of-service vector against a local dev instance.

The `NODE_ENV` environment variable is frequently unset or set inconsistently in Docker containers and some staging environments, meaning this bypass can silently activate in non-local environments.

**Root Cause:** The guard relies on `NODE_ENV === 'development'` being correctly set by the deployment environment.

**Suggested Fix:** Remove the development bypass entirely. Require `ADMIN_API_KEY` to be set in all environments. If developers need to call admin endpoints locally, they should set the key in `.env.local`. The 503 response path is the correct universal behavior.

---

## High Severity Findings

### ROUTE-H1: `PATCH /planner-handoff/:id/status` Has No Ownership Check

**Severity:** High
**File:** `server/src/routes/planner-handoff.ts` lines 206–229

**Description:**
The endpoint accepts any authenticated user's request to update any referral's status by referral ID. There is no check that the referral belongs to the authenticated user — only that the user is authenticated via `authMiddleware`. Any authenticated user who can guess or enumerate a referral UUID can change its status (e.g., mark a competitor's referral as `declined` or `expired`).

**Suggested Fix:** Add a `user_id` ownership check before calling `updateReferralStatus`. Either scope the DB update to `WHERE id = referralId AND user_id = user.id`, or fetch the referral first and verify ownership, returning 404 if it does not belong to this user.

---

### ROUTE-H2: `POST /seats/:seatId/activate` Has No Org Ownership Check

**Severity:** High
**File:** `server/src/routes/b2b-admin.ts` lines 438–467

**Description:**
The seat activation endpoint takes a `seatId` and a `user_id` from the request body. It does not verify that the seat belongs to an organization that the authenticated user administers. Any authenticated user can activate any seat in any organization if they know the seat UUID, and can set that seat's `user_id` to any arbitrary user UUID.

**Suggested Fix:** `activateSeat` should first look up the seat's `org_id`, then verify the calling user is the admin for that org before performing the activation. Alternatively, restructure the route to `POST /orgs/:orgId/seats/:seatId/activate` to make org scoping explicit and allow `requireOrgAdmin` to be applied.

---

### ROUTE-H3: `GET /b2b/orgs/:orgId` and `GET /b2b/orgs/slug/:slug` Expose Org Data Without Admin Check

**Severity:** High
**File:** `server/src/routes/b2b-admin.ts` lines 218–261

**Description:**
Both endpoints return organization objects to any authenticated user without verifying they are the org admin. Any authenticated platform user can enumerate organization data (name, admin email, branding, settings) for any org ID or slug they know or can guess. The `GET /user/branding` endpoint is correctly scoped — but the direct org lookup endpoints have no such scoping.

**Suggested Fix:** Either apply `requireOrgAdmin` to these GET endpoints, or define an explicit allowlist of which fields are "public" and return only those. The `admin_email` field should never be returned to non-admins.

---

## Medium Severity Findings

### ROUTE-M1: `sessions.ts` SSE Endpoint Auth is Manual, Not Middleware

**Severity:** Medium
**File:** `server/src/routes/sessions.ts` lines 216–242

The SSE endpoint implements its own auth inline using `getCachedUser` and `supabaseAdmin.auth.getUser`. While functionally equivalent, future changes to `authMiddleware` will silently diverge from the SSE path.

**Suggested Fix:** Document this explicitly with a comment that this endpoint intentionally implements auth manually to enable pre-stream auth checks, and add a test that exercises the SSE auth path separately.

---

### ROUTE-M2: `admin.ts` Routes Use Raw `c.req.json()` Without Body Size Limit

**Severity:** Medium
**File:** `server/src/routes/admin.ts` lines 46–50, 143–147

Admin routes call `await c.req.json()` directly without `parseJsonBodyWithLimit`. An operator (or an attacker bypassing the key check) could send arbitrarily large request bodies.

**Suggested Fix:** Replace `c.req.json()` calls in admin routes with `parseJsonBodyWithLimit(c, 10_000)`.

---

### ROUTE-M3: `ni.ts` — Approximately 10 Endpoints Have No Rate Limiting

**Severity:** Medium
**File:** `server/src/routes/ni.ts`

The following NI endpoints have no `rateLimitMiddleware` applied: `GET /connections`, `GET /connections/count`, `GET /connections/companies`, `GET /target-titles`, `POST /target-titles`, `DELETE /target-titles/:id`, `GET /matches`, `POST /matches`, `PATCH /matches/:id/status`, `GET /boolean-search/:id`, `GET /scrape/status/:id`.

**Suggested Fix:** Apply `rateLimitMiddleware` to all NI endpoints. Conservative limits: reads at 60/min, writes at 30/min, deletes at 30/min.

---

### ROUTE-M4: `billing.ts` Checkout Uses Raw `origin` Header Without Validation

**Severity:** Medium
**File:** `server/src/routes/billing.ts` lines 96, 295

```ts
const origin = c.req.header('origin') ?? 'http://localhost:5173';
success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
```

The `origin` header is taken directly from the request and used to construct Stripe redirect URLs. An attacker could send `Origin: https://evil.example.com`, causing Stripe to redirect the user there after payment.

**Suggested Fix:** Maintain a server-side allowlist of valid origins from environment variables and validate against it before use. Fall back to a hardcoded production URL if the origin is not in the list.

---

### ROUTE-M5: `content-calendar.ts` Report ID Validation Is Weaker Than Project Standard

**Severity:** Medium
**File:** `server/src/routes/content-calendar.ts` line 173

The regex `[0-9a-f-]{36}` allows strings like `------------------------------------` to pass validation. The project-standard UUID regex is stricter and validates the version nibble and variant bits.

**Suggested Fix:** Reuse the project-standard `UUID_RE`: `/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`.

---

### ROUTE-M6: `interview-debrief.ts` Uses a Looser UUID Regex

**Severity:** Medium
**File:** `server/src/routes/interview-debrief.ts` line 19

The regex does not enforce UUID version or variant bits, creating an inconsistency in client-facing error responses.

**Suggested Fix:** Use the project-standard UUID regex from `sessions.ts`.

---

### ROUTE-M7: `workflow.ts` Restart Endpoint Makes an Internal Fetch Without Timeout

**Severity:** Medium
**File:** `server/src/routes/workflow.ts` lines 488–504

`pipelineRouter.fetch(proxyRequest)` has no timeout. If the pipeline's `/start` handler hangs, the outer request will hang indefinitely.

**Suggested Fix:** Wrap the `pipelineRouter.fetch` call in a `Promise.race` with a reasonable timeout (e.g., 10 seconds).

---

## Low Severity Findings

### ROUTE-L1: Missing Rate Limiting on Several `/reports/latest` GET Endpoints

**Severity:** Low
**Files:** `executive-bio.ts`, `ninety-day-plan.ts`, `salary-negotiation.ts`, `personal-brand.ts`, `case-study.ts`, `thank-you-note.ts`

These endpoints do not have `rateLimitMiddleware` applied and are open to polling abuse.

**Suggested Fix:** Apply `rateLimitMiddleware(60, 60_000)` to each `/reports/latest` endpoint.

---

### ROUTE-L2: Feature Flag Check in `/reports/latest` Uses Wrong Response Pattern

**Severity:** Low
**File:** `executive-bio.ts` + 5 others

The factory returns `403` when a flag is off, but inline checks in `/reports/latest` return `200` (some return `404`). This leads to inconsistent client-side behavior.

**Suggested Fix:** Remove the inline feature flag checks from all `/reports/latest` endpoints — the factory's global guard already handles this correctly.

---

### ROUTE-L3: `platform-context.ts` — Rate Limit Applied Before Auth Middleware

**Severity:** Low
**File:** `server/src/routes/platform-context.ts` lines 39–41

The rate limit middleware runs before auth, meaning unauthenticated requests consume rate limit quota before being rejected.

**Suggested Fix:** Reorder so auth runs first: `app.use('/summary', authMiddleware, rateLimitMiddleware(60, 60_000))`.

---

### ROUTE-L4: `coach.ts` — `/mode` Endpoint Has No Rate Limiting

**Severity:** Low
**File:** `server/src/routes/coach.ts` line 274

`POST /mode` updates the database but has no `rateLimitMiddleware`, while other coach endpoints all have rate limits.

**Suggested Fix:** Add `rateLimitMiddleware(30, 60_000)` to the `/mode` route.

---

### ROUTE-L5: `sessions.ts` — `product_type` Field Not Validated on Session Create

**Severity:** Low
**File:** `server/src/routes/sessions.ts` lines 390–447

`product_type` is accepted from the request body without validation and passed directly to the DB insert. A client could set it to any arbitrary string.

**Suggested Fix:** Add a Zod schema to validate the session creation body and constrain `product_type` to the known enum values.

---

## Route Section Summary

| File | Critical | High | Medium | Low |
|------|----------|------|--------|-----|
| `admin.ts` | Dev bypass without API key | — | No body size limits | — |
| `planner-handoff.ts` | — | No ownership on PATCH status | — | — |
| `b2b-admin.ts` | — | Seat activate no org check; GET orgs no admin check | — | — |
| `billing.ts` | — | — | Origin header injection | — |
| `ni.ts` | — | — | ~10 endpoints no rate limit | — |
| `content-calendar.ts` | — | — | Weak UUID regex | — |
| `interview-debrief.ts` | — | — | Weak UUID regex | — |
| `workflow.ts` | — | — | Internal fetch no timeout | — |
| `sessions.ts` | — | — | Manual SSE auth | product_type not validated |
| `platform-context.ts` | — | — | — | Rate limit before auth |
| `coach.ts` | — | — | — | /mode no rate limit |
| 6 `/reports/latest` endpoints | — | — | — | Wrong FF response + no rate limit |

**Route audit totals: 1 Critical, 3 High, 7 Medium, 5 Low**

---

---

# Section 2: Agent Architecture Audit

**Scope:** Strategist, Craftsman, Producer, Onboarding, Retirement-Bridge, Coach agents; Agent Runtime; Coordinator; Model Routing

## Section Executive Summary

The agent architecture is fundamentally sound. The runtime layer (agent-loop, agent-bus, agent-protocol, agent-registry) is well-engineered with proper timeout handling, cleanup, and error propagation. The three core resume agents have comprehensive tool definitions with Zod schema validation and graceful degradation. Several issues warrant attention — one High, multiple Medium, and several Low severity findings.

---

## High Severity Findings

### AGENT-H1: `interview_candidate_batch` Missing `isInteractive: true`

**Severity:** High
**File:** `server/src/agents/strategist/tools.ts` (line ~325)

The `interview_candidate_batch` tool calls `ctx.waitForUser()`, pausing the agent loop waiting for user input. However, the tool does not set `isInteractive: true`. The agent-loop fallback heuristic catches this because the name includes `'interview'`, but if the tool is renamed, the heuristic silently breaks and the per-round timeout will fire on a user-waiting tool, killing live interview sessions.

**Suggested Fix:** Add `isInteractive: true` to the `interviewCandidateBatchTool` definition.

---

## Medium Severity Findings

### AGENT-M1: `resultMap.get(tc.id)!` Non-Null Assertion Can Produce Undefined in Tool Result Blocks

**Severity:** Medium
**File:** `server/src/agents/runtime/agent-loop.ts` line 297

The parallel tool path stores results using `outcome.value.id` which could differ from `tc.id` if the tool implementation returns a different `id` field. The `!` assertion hides this, and the reassembly would produce an array with `undefined` entries serialized as `null` to the LLM.

**Suggested Fix:** Replace the non-null assertion with an explicit check that logs an error and returns a structured error block on miss.

---

### AGENT-M2: `revise_section` Reads `blueprint_slice_${section}` Which `write_section` Never Writes

**Severity:** Medium
**File:** `server/src/agents/craftsman/tools.ts` line 505

`revise_section` reads `ctx.scratchpad['blueprint_slice_${section}']` but `write_section` stores results under `section_${section}`, not `blueprint_slice_${section}`. This means `revise_section` always falls back to `{}` for blueprint context, losing section-specific blueprint guidance on every revision.

**Suggested Fix:** In `write_section`, additionally store the blueprint slice: `ctx.scratchpad['blueprint_slice_${section}'] = blueprint_slice`.

---

### AGENT-M3: `self_review_section` Recomputes `passed` Overriding the Zod-Validated LLM Response

**Severity:** Medium
**File:** `server/src/agents/craftsman/tools.ts` line 458

After schema validation, the tool recomputes `passed` using a hardcoded formula (`score >= 7 && issues.length <= 2`) that ignores the `passed` field validated from the LLM. The formula may disagree with the LLM's intent and creates a dual source of truth.

---

### AGENT-M4: `analyze_jd` Description Misleads the LLM About What It Does

**Severity:** Medium
**File:** `server/src/agents/strategist/tools.ts`

The tool description says "Analyze the job description" but internally calls `runResearchAgent()` which does JD analysis, company research, and benchmark building in parallel. The LLM may call `research_company` and `build_benchmark` unnecessarily (they are cached, so no data duplication, but the description creates a sequencing risk if the LLM skips `analyze_jd` and calls `research_company` first).

---

### AGENT-M5: `createRevisionHandler` Subscribes as `'craftsman'` but Producer Sends to `domain: 'resume'`

**Severity:** Medium
**File:** `server/src/agents/runtime/agent-bus.ts`

The handler registers as plain `'craftsman'` (not `'resume:craftsman'`). The Producer sends to `to: 'craftsman'` with `domain: 'resume'`. The `resolveHandler` tries `domain:to` first and falls back to name-only. This works via fallback but the asymmetry means if two concurrent sessions ever shared a bus, messages would cross-contaminate.

---

### AGENT-M6: `signal` and `session_id` Omitted from All `llm.chat` Calls in Onboarding and Retirement-Bridge

**Severity:** Medium
**Files:** `server/src/agents/onboarding/assessor/tools.ts`, `server/src/agents/retirement-bridge/assessor/tools.ts`

All four onboarding tools and all three retirement-bridge tools omit `signal: ctx.signal` and `session_id: ctx.sessionId` from their `llm.chat` calls. Abort signals (user cancellation, server shutdown) are not forwarded to in-flight LLM HTTP requests, and usage tracking may not attribute tokens correctly.

**Suggested Fix:** Add `signal: ctx.signal, session_id: ctx.sessionId` to every `llm.chat` call in both tool files.

---

### AGENT-M7: `ats_compliance_check` Drops `ctx` Parameter

**Severity:** Medium
**File:** `server/src/agents/producer/tools.ts`

This tool's execute signature omits the `ctx` argument. The tool cannot emit transparency events or use `ctx.signal` for cancellation. This is inconsistent with every other tool in the codebase.

---

### AGENT-M8: Coach Agent `overall_timeout_ms` of 120,000ms May Be Insufficient

**Severity:** Medium
**File:** `server/src/agents/coach/agent.ts`

The coach agent has tools like `dispatch-pipeline` and `auto-respond-gate` which could interact with long-running pipelines. If the coach initiates a pipeline check and waits, 2 minutes may terminate the session prematurely. The strategist has a 5-minute overall timeout. For a coaching session that includes pipeline interaction, this would appear to the user as the coach dropping out mid-conversation.

---

## Low Severity Findings

### AGENT-L1: Coach Agent Registered Only When Its Route Module Loads, Not at Startup

**Severity:** Low
**File:** `server/src/agents/runtime/agent-registry.ts`

`coordinator.ts` imports resume agents to trigger self-registration at startup. The coach agent calls `registerAgent(coachAgentConfig)` at module load, but there is no evidence it is imported at server startup the same way. If `validateRegisteredAgents()` runs before the coach route module loads, `resolveToolModel()` will fall back to `MODEL_ORCHESTRATOR` for all coach tools regardless of their declared `model_tier`.

---

### AGENT-L2: `verify_cross_section_consistency` and `check_blueprint_compliance` Also Drop `ctx`

**Severity:** Low
**File:** `server/src/agents/producer/tools.ts`

Same pattern as AGENT-M7. These tools cannot respond to abort signals or emit transparency. Given they are fast synchronous operations this is low risk, but is inconsistent and will require a signature change if logging or abort behavior is needed later.

---

### AGENT-L3: `check_blueprint_compliance` Uses `slice(0, 20)` Substring Matching

**Severity:** Low
**File:** `server/src/agents/producer/tools.ts` line 567

Short `must_include` elements like "P&L" or "SVP" work correctly. But an element that starts with a common word (e.g., "strong leadership of cross-functional teams") sliced to "strong leadership of " could match accidentally against unrelated content. The first-20-chars heuristic is fragile for short, generic must_include items.

---

### AGENT-L4: `build_readiness_summary` Input Schema Uses `planner_questions` Key; Tool Stores `questions_to_ask_planner`

**Severity:** Low
**File:** `server/src/agents/retirement-bridge/assessor/tools.ts`

The Zod/JSON schema for `build_readiness_summary` describes the property as `planner_questions` but `evaluateReadinessTool` stores it as `questions_to_ask_planner`. If the LLM passes back the `evaluateReadiness` output verbatim under `planner_questions`, it would be `undefined` and fall through to the empty-array fallback silently.

---

### AGENT-L5: `onInit` Errors Are Silently Swallowed Without Abort Option

**Severity:** Low
**File:** `server/src/agents/runtime/agent-loop.ts` lines 109–113

Init hook errors are logged but don't abort the agent. If `onInit` is meant to perform pre-flight validation, silently proceeding after it fails could lead to a corrupt agent run.

---

### AGENT-L6: `MODEL_ORCHESTRATOR_COMPLEX` Has No Corresponding `model_tier` Value

**Severity:** Low
**File:** `server/src/lib/llm.ts`

The `AgentTool.model_tier` type union is `'primary' | 'mid' | 'orchestrator' | 'light'`. `MODEL_ORCHESTRATOR_COMPLEX` has no corresponding tier. A tool needing this model must reference it by constant name in its execute body, bypassing the registry routing system entirely.

---

### AGENT-L7: Fresh Scratchpad Per Agent Is a Trap for New Product Implementations

**Severity:** Low
**File:** `server/src/agents/resume/product.ts`

Each `createAgentContext()` creates a fresh scratchpad. The `product-coordinator.ts` `onComplete` hook is the only mechanism to transfer scratchpad data to shared state. If a new product forgets to wire `onComplete`, inter-agent data is permanently lost between phases. This is not a bug in the current code but is an undocumented trap.

---

## Agent Section Summary

| # | Severity | Area | Description |
|---|----------|------|-------------|
| AGENT-H1 | High | strategist/tools.ts | `interview_candidate_batch` missing `isInteractive: true` |
| AGENT-M1 | Medium | agent-loop.ts | `resultMap.get(tc.id)!` non-null assertion can produce undefined |
| AGENT-M2 | Medium | craftsman/tools.ts | `revise_section` reads blueprint_slice key never written by `write_section` |
| AGENT-M3 | Medium | craftsman/tools.ts | `self_review_section` recomputes `passed` overriding validated LLM response |
| AGENT-M4 | Medium | strategist/tools.ts | `analyze_jd` description misleads the LLM about scope |
| AGENT-M5 | Medium | agent-bus.ts | Craftsman handler subscription asymmetry with Producer send path |
| AGENT-M6 | Medium | onboarding + retirement-bridge | `signal` and `session_id` omitted from all `llm.chat` calls |
| AGENT-M7 | Medium | producer/tools.ts | `ats_compliance_check` drops `ctx` — cannot abort or emit transparency |
| AGENT-M8 | Medium | coach/agent.ts | `overall_timeout_ms: 120_000` may be too short for pipeline dispatch |
| AGENT-L1 | Low | agent-registry.ts | Coach agent not registered at startup like resume agents |
| AGENT-L2 | Low | producer/tools.ts | `verify_cross_section_consistency` and `check_blueprint_compliance` drop `ctx` |
| AGENT-L3 | Low | producer/tools.ts | `check_blueprint_compliance` uses `slice(0, 20)` for fuzzy matching |
| AGENT-L4 | Low | retirement-bridge/tools.ts | `build_readiness_summary` schema key mismatch with stored key |
| AGENT-L5 | Low | agent-loop.ts | `onInit` errors silently swallowed without abort option |
| AGENT-L6 | Low | llm.ts | `MODEL_ORCHESTRATOR_COMPLEX` has no corresponding `model_tier` value |
| AGENT-L7 | Low | agent-context.ts | Fresh scratchpad per agent is a trap for new product implementations |

**Agent audit totals: 0 Critical, 1 High, 8 Medium, 7 Low**

---

---

# Section 3: Frontend & Data Systems Audit

**Scope:** Panel system, SSE events, Career-IQ rooms, database migrations, feature flags

## Section Executive Summary

The panel system is fully exhaustive-checked with a `never` default that catches unhandled types at compile time. RLS is enabled on every user-scoped table sampled. The primary concerns are a critical stale DB constraint that silently rejects writes for newer context types, two high-severity issues in SSE event handling and room feature-flag enforcement, and several medium-severity database policy gaps.

---

## Critical Findings

### FE-DB-2: `user_platform_context.context_type` CHECK Constraint Is Stale

**Severity:** Critical
**Files:** `supabase/migrations/20260302120000_user_platform_context.sql`, `server/src/lib/platform-context.ts`

The original migration defined a 4-value CHECK constraint (`positioning_strategy`, `evidence_item`, `career_narrative`, `target_role`). As the platform grew, 9 new context types were added to the TypeScript `ContextType` union without a corresponding migration. Since CHECK constraints are enforced regardless of Postgres role, every insert of a newer context type silently fails. `upsertUserContext` logs the error and returns `null`, swallowing the failure.

**Affected context types (in code, rejected by DB):**
- `client_profile`
- `positioning_foundation`
- `benchmark_candidate`
- `gap_analysis`
- `industry_research`
- `job_discovery_results`
- `content_post`
- `retirement_readiness`
- `emotional_baseline`

**Suggested Fix:** A migration that either drops the CHECK constraint or expands it to include all current valid values. The TypeScript `ContextType` union should be the canonical source of truth.

---

## High Severity Findings

### FE-SSE-1: Coach SSE Events `context_loaded`, `phase_assessed`, `recommendation_ready` Have No Frontend Handler

**Severity:** High
**Files:** `server/src/agents/coach/types.ts`, `app/src/hooks/useSSEEventHandlers.ts`

All three coach-specific events fall through to the `default` warn-and-discard branch. The `recommendation_ready` event carries `{ action, product, room, urgency }` — the recommendation the user should see — but the frontend discards it. The Virtual Coach's primary output never reaches the UI.

**Root Cause:** `CoachSSEEvent` defines events specific to the Virtual Coach agent pipeline. The SSE event router was built for the resume pipeline's `PipelineSSEEvent` union and was never extended for coach-specific events.

**Suggested Fix:** Add `context_loaded`, `phase_assessed`, and `recommendation_ready` case handlers in `createSSEEventRouter`, or build a separate SSE router for the coach endpoint.

---

### FE-R1: Feature-Flag-Off Rooms Render Full UI Without Checking Flag Status

**Severity:** High
**Files:** `app/src/components/career-iq/CareerIQScreen.tsx`, multiple room components

`SalaryNegotiationRoom` (and other flagged rooms) render fully when the feature flag is off, including hooks that call the flagged API endpoints. Since the server returns 404, the user sees a partially loaded room with a generic error state — not a clear "feature disabled" message. The sidebar marks rooms as `gated: true` but that only controls a visual lock icon and does not prevent navigation.

**Suggested Fix:** `CareerIQScreen` should check feature flag state at the room routing level and render a "coming soon" or locked state for rooms whose flags are off.

---

## Medium Severity Findings

### FE-DB-1: Open INSERT/UPDATE RLS Policies on Assessment Tables

**Severity:** Medium
**Files:** `supabase/migrations/20260307100000_onboarding_assessments.sql`, `supabase/migrations/20260308240000_retirement_readiness_assessments.sql`

Both `onboarding_assessments` and `retirement_readiness_assessments` have INSERT/UPDATE policies with `WITH CHECK (true)` and `USING (true)`. The policy comment says "Service role can insert/update" but the policy does NOT restrict to `auth.role() = 'service_role'`. Any authenticated user who crafts an API call directly to Supabase could insert assessment rows with an arbitrary `user_id`.

**Suggested Fix:** Add `USING (auth.role() = 'service_role')` to the INSERT and UPDATE policies on both tables. This is the same approach used in `b2b_organizations` and `coach_budget`.

---

### FE-DB-3: Missing DELETE Policies on Several Core Tables

**Severity:** Medium
**Files:** `001_initial_schema.sql` and related

The following user-scoped tables have SELECT/INSERT/UPDATE policies but no DELETE policy: `master_resumes`, `job_applications`, `coach_sessions`, `why_me_stories`. A user cannot delete their own data from these tables through the client Supabase SDK. This may be a GDPR concern if intentional retention is not documented.

---

### FE-SSE-3: `draft_path_decision` and `questionnaire_reuse_summary` Events Are Handled but Never Surfaced

**Severity:** Medium
**Files:** `app/src/hooks/useSSEEventHandlers.ts` lines 1468–1469

These events hit the `default` warn path — their data is never surfaced to the user. Users have no visibility into why a draft was triggered early or why questionnaire questions were skipped. This is a UX gap, not a crash.

---

### FE-R2: `learning` and `financial` Rooms Have No Feature Flag

**Severity:** Medium
**Files:** `app/src/components/career-iq/CareerIQScreen.tsx`

The `learning` room (maps to `LiveSessionsRoom`) and `financial` room (maps to `FinancialWellnessRoom`) have no corresponding feature flag. Both are always-on from the frontend perspective regardless of server readiness.

---

### FE-FF1: Inaccurate Comment in `feature-flags.ts` About Default States

**Severity:** Medium
**File:** `server/src/lib/feature-flags.ts`

The reference comment block says `intake_quiz` and `research_validation` are "default true in dev." This is inaccurate — both default to `false`. A future deployer could be misled into skipping these gates in production.

---

## Low Severity Findings

### FE-P1: `BrandFindingsReviewData` Naming Inconsistency

**Severity:** Low
**File:** `app/src/types/panels.ts`

`BrandFindingsReviewData` uses the type identifier `findings_review` in the union but the data interface name is `BrandFindingsReviewData`, not `FindingsReviewData`. Cosmetic inconsistency, not a runtime bug.

---

### FE-SSE-2: No Single Canonical Source of Truth for SSE Event Types

**Severity:** Low
**Files:** `server/src/agents/resume/types.ts`, `app/src/hooks/useSSEEventHandlers.ts`

Client handles events like `export_ready`, `session_restore`, `text_delta`, etc. that do not appear in the server's `PipelineSSEEvent` union. These come from different layers (route factory, agent loop runtime, coach coordinator). There is no single document describing which events come from which layer.

**Suggested Fix:** Add a comment to `useSSEEventHandlers.ts` listing which events come from the agent loop runtime vs. product pipeline vs. coach agent.

---

### FE-R3: `CareerIQScreen` Queries `job_applications` on Every Mount Regardless of Active Room

**Severity:** Low
**File:** `app/src/components/career-iq/CareerIQScreen.tsx` lines 138–150

The `job_applications` query for `JobCommandCenterRoom` fires on every mount of `CareerIQScreen`, not lazily. For users with large `job_applications` tables, this is an unnecessary query on every dashboard load.

---

### FE-DB-4: `coaching_requests` Table Has No Admin Visibility Policy

**Severity:** Low

The `coaching_requests` table has `FOR ALL` user-scoped policies. An admin cannot read coaching requests submitted by users without a separate service-role query. Human coaches who need to respond to these requests have no way to query the table through a normal Supabase interface.

---

### FE-FF2: No `FF_VIRTUAL_COACH` Check in `CareerIQScreen` or `CoachDrawer`

**Severity:** Low
**File:** `app/src/components/career-iq/CareerIQScreen.tsx`

The coach drawer renders and is accessible regardless of `FF_VIRTUAL_COACH` state. The server correctly returns 404 when the flag is off, so this is cosmetic — but the drawer's persistent visibility creates an expectation mismatch.

---

## Frontend/Data Section Summary

| Area | Critical | High | Medium | Low |
|------|----------|------|--------|-----|
| Panel System | 0 | 0 | 0 | 1 |
| SSE Events | 0 | 1 | 1 | 1 |
| Career-IQ Rooms | 0 | 1 | 1 | 2 |
| Database Migrations | 1 | 0 | 2 | 1 |
| Feature Flags | 0 | 0 | 1 | 1 |

**Frontend/Data audit totals: 1 Critical, 2 High, 5 Medium, 6 Low**

---

---

# Section 4: Static Code Analysis

**Scope:** `server/src/` and `app/src/` (excluding test files and node_modules)

## Section Executive Summary

The codebase is in good shape by the metrics that matter most: zero `any` types in server code, zero `console.log` in server production code, zero hardcoded secrets. The Pino logger abstraction is consistently applied server-side. The primary areas to address are stale-closure density in `useAgent.ts`, two orphaned library modules, and three agent-first architecture violations in `lib/` that should be sprint stories.

---

## Findings

### SA-1: `console.log` in Production Code

**Severity:** Low

**Server:** 0 `console.log` occurrences. Pino `logger` abstraction used everywhere.

**App:** 1 `console.log` occurrence at `app/src/hooks/useSSEEventHandlers.ts:541`, wrapped in `if (data.duration_ms && import.meta.env.DEV)`. Development-only and will not appear in production builds.

**Notable:** `console.error` is used in 27 app files (68 total occurrences), almost exclusively in SSE stream error handlers. These are structurally reasonable but none feed Sentry or a structured telemetry channel. This is a Medium technical debt item — in production, these errors are silent to ops.

---

### SA-2: TODO / FIXME / HACK Comments

**Severity:** Medium

**Total:** 4 occurrences (all in server; 0 in app). No FIXMEs or HACKs found anywhere.

| File | Line | Comment |
|------|------|---------|
| `server/src/lib/ni/boolean-search.ts` | 7 | `TODO: The LLM extraction step should become a generate_boolean_search agent tool` |
| `server/src/lib/ni/boolean-search.ts` | 20 | `TODO: When migrated to agent tool, replace this in-memory store with a [persistent store]` |
| `server/src/lib/job-search/ai-matcher.ts` | 174 | `TODO: This scoring logic should become a score_jobs_against_profile agent tool` |
| `server/src/routes/coach.ts` | 68 | `TODO: Consider adding a 30-60s per-user TTL cache for loadClientSnapshot` |

All four TODOs are architectural improvement notes, not broken functionality. The first three are explicit agent-first violations — procedural code in `lib/` that should be agent tools, per the CLAUDE.md mandate. These should be promoted to backlog stories.

---

### SA-3: `any` Types in TypeScript

**Severity:** Low

**Server:** 0 `any` usages in production code.

**App:** 1 `as any` cast at `app/src/hooks/useSSEEventHandlers.ts:799`:
```ts
(window as any).__qualityScores__ = scores
```
Wrapped in a `DEV`-only guard. Exists specifically to expose quality scores on `window` for E2E test capture.

**Suggested Fix:** Define `interface Window { __qualityScores__?: QualityScores }` in a `.d.ts` file to remove the cast entirely.

---

### SA-4: `eslint-disable` Directives

**Severity:** Medium

**Total:** 30 occurrences (1 server production, 4 server test-only, 25 app production).

**Server Production (1):** `product-coordinator.ts` line 252 — `eslint-disable-next-line no-constant-condition` on a bounded `while (true)` gate loop with explicit break conditions and a `MAX_GATE_RERUNS` bound. Legitimate.

**App Production (25):** All 25 suppressions are `react-hooks/exhaustive-deps`, distributed across:

| File | Count |
|------|-------|
| `useAgent.ts` | 9 |
| `useSSEConnection.ts` | 5 |
| `CoachScreen.tsx` | 2 |
| `useTypingAnimation.ts` | 2 |
| `WorkbenchSuggestions.tsx` | 1 |
| `CoverLetterIntakeForm.tsx` | 1 |
| `NetworkingHubRoom.tsx` | 1 |
| `JobCommandCenterRoom.tsx` | 1 |
| `useContentPosts.ts` | 1 |
| `useContentCalendar.ts` | 1 |
| `useStaleDetection.ts` | 1 |
| `useRuleOfFour.ts` | 1 |

The 9 suppressions in `useAgent.ts` alone is a concentration risk. Each suppression is a potential stale-closure bug waiting to manifest when the surrounding code changes. `useAgent.ts` is the most critical path in the entire frontend and warrants a dedicated audit story.

---

### SA-5: Hardcoded Secrets / Credentials

**Severity:** Low (no critical findings)

- Test credentials (`jjschrup@yahoo.com` / `Scout123`) do not appear in any production source file.
- All sensitive values reference `process.env.*` or `import.meta.env.*`.
- 3 `localhost` references in server production code — all legitimate (CORS allowlist, startup log, billing fallback).
- The billing route localhost fallback (`const origin = c.req.header('origin') ?? 'http://localhost:5173'`) is a Medium-risk item: if hit in production without an `Origin` header, Stripe redirect URLs would point to `localhost:5173`. This is the same issue documented in ROUTE-M4.

---

### SA-6: Orphaned Modules

**Severity:** Medium (2 confirmed)

| Module | Exports | Status |
|--------|---------|--------|
| `server/src/lib/cognitive-reframing.ts` | `detectStalls`, `generateCoachingMessage`, `StallSignal`, `StallTriggerType` | **Orphaned** — zero production imports found |
| `server/src/lib/draft-readiness-compat.ts` | `normalizeCoverageOnlyReadiness`, `normalizeDraftPathDecisionCompat`, `buildCoverageOnlyDraftPathDecisionMessage` | **Orphaned** — zero production imports; only a test target |

`cognitive-reframing.ts` imports `supabaseAdmin`, `llm`, and `emotional-baseline` — a real implementation built but never wired to a route or scheduled job.

`draft-readiness-compat.ts` appears to have been a migration compatibility shim that was never integrated into the live codepath.

**Action Required:** Either connect these modules or delete them. Dead code produces maintenance burden and inflates bundle weight.

---

### SA-7: Zod Schema Drift

**Severity:** Low (1 minor finding)

All three schema pairs checked (planner-handoff, cover-letter, resume-pipeline) are clean. One functional gap:

`usePlannerHandoff.ts` match call sends only `{ geography, asset_range }` but the server `matchSchema` accepts an optional `specializations: z.array(z.string()).max(10)`. The `specializations` field is permanently bypassed by the frontend. If planner matching quality depends on specialization filtering, this is a functional gap worth addressing.

---

## Static Analysis Section Summary

| Category | Severity | Count | Action Required |
|----------|----------|-------|-----------------|
| `console.log` in production | Low | 1 (dev-guarded) | None |
| `console.error` without telemetry | Medium | 68 | Backlog: wire to Sentry |
| TODO/FIXME/HACK | Medium | 4 | 3 are agent-first violations — promote to stories |
| `any` types | Low | 1 (dev-guarded) | Add `Window` type declaration |
| `eslint-disable` in production | Medium | 25 app (all `react-hooks/exhaustive-deps`) | Audit `useAgent.ts` suppressions (9 of 25) |
| Hardcoded localhost billing fallback | Medium | 2 | Add env-var guard on Stripe origin (see ROUTE-M4) |
| Orphaned modules | Medium | 2 confirmed | Delete or connect `cognitive-reframing.ts`, `draft-readiness-compat.ts` |
| Zod schema drift | Low | 1 functional gap | `specializations` never sent to match endpoint |

**Static analysis totals: 0 Critical, 0 High, 6 Medium, 3 Low**

---

---

# Consolidated Summary Table — All Findings

## All 57 Findings

| ID | Severity | Domain | Description |
|----|----------|--------|-------------|
| ROUTE-CRIT-1 | Critical | Route Security | Admin routes unprotected when `ADMIN_API_KEY` unset and `NODE_ENV=development` |
| FE-DB-2 | Critical | Frontend/DB | `user_platform_context` CHECK constraint stale — 9 context types silently rejected |
| FE-DB-1 | Critical | Frontend/DB | Open RLS INSERT/UPDATE on assessment tables — any auth user can write any `user_id` |
| ROUTE-H1 | High | Route Security | `PATCH /planner-handoff/:id/status` has no ownership check |
| ROUTE-H2 | High | Route Security | `POST /seats/:seatId/activate` has no org ownership check |
| ROUTE-H3 | High | Route Security | `GET /b2b/orgs/:orgId` and `/slug/:slug` expose org data without admin check |
| AGENT-H1 | High | Agent Architecture | `interview_candidate_batch` missing `isInteractive: true` — heuristic fallback is fragile |
| FE-SSE-1 | High | Frontend/SSE | Coach SSE events `recommendation_ready` etc. silently discarded — coach output never reaches UI |
| FE-R1 | High | Frontend/Rooms | Feature-flag-off rooms render full UI with error states instead of "coming soon" messaging |
| ROUTE-M1 | Medium | Route Security | `sessions.ts` SSE endpoint auth is manual, diverges from `authMiddleware` |
| ROUTE-M2 | Medium | Route Security | `admin.ts` routes use raw `c.req.json()` without body size limit |
| ROUTE-M3 | Medium | Route Security | ~10 NI endpoints have no rate limiting |
| ROUTE-M4 | Medium | Route Security | `billing.ts` uses raw `origin` header for Stripe redirect URLs without validation |
| ROUTE-M5 | Medium | Route Security | `content-calendar.ts` weak UUID regex allows malformed UUIDs |
| ROUTE-M6 | Medium | Route Security | `interview-debrief.ts` UUID regex does not enforce version/variant bits |
| ROUTE-M7 | Medium | Route Security | `workflow.ts` restart internal fetch has no timeout |
| AGENT-M1 | Medium | Agent Architecture | `resultMap.get(tc.id)!` non-null assertion can produce `undefined` in tool result blocks |
| AGENT-M2 | Medium | Agent Architecture | `revise_section` reads `blueprint_slice_${section}` which `write_section` never writes |
| AGENT-M3 | Medium | Agent Architecture | `self_review_section` recomputes `passed` overriding Zod-validated LLM response |
| AGENT-M4 | Medium | Agent Architecture | `analyze_jd` description misleads the LLM about its actual scope |
| AGENT-M5 | Medium | Agent Architecture | Craftsman bus subscription asymmetry with Producer send path |
| AGENT-M6 | Medium | Agent Architecture | `signal` and `session_id` omitted from all `llm.chat` calls in onboarding + retirement-bridge |
| AGENT-M7 | Medium | Agent Architecture | `ats_compliance_check` drops `ctx` — cannot abort or emit transparency |
| AGENT-M8 | Medium | Agent Architecture | Coach `overall_timeout_ms: 120_000` (2 min) may be too short for pipeline dispatch |
| FE-DB-3 | Medium | Frontend/DB | Missing DELETE RLS policies on `master_resumes`, `job_applications`, `coach_sessions`, `why_me_stories` |
| FE-SSE-3 | Medium | Frontend/SSE | `draft_path_decision` and `questionnaire_reuse_summary` events handled but never surfaced to user |
| FE-R2 | Medium | Frontend/Rooms | `learning` and `financial` rooms have no feature flag — always-on regardless of server readiness |
| FE-FF1 | Medium | Frontend/Flags | Inaccurate comment in `feature-flags.ts` about default states of `intake_quiz` and `research_validation` |
| SA-2 | Medium | Static Analysis | 4 TODO comments — 3 are explicit agent-first violations in `lib/` |
| SA-4 | Medium | Static Analysis | 25 `eslint-disable` in app production (all `react-hooks/exhaustive-deps`); 9 in `useAgent.ts` |
| SA-6 | Medium | Static Analysis | 2 confirmed orphaned modules: `cognitive-reframing.ts`, `draft-readiness-compat.ts` |
| SA-console | Medium | Static Analysis | 68 `console.error` calls have no Sentry/telemetry integration |
| SA-billing | Medium | Static Analysis | Billing route `localhost:5173` fallback if `Origin` header absent in production (see also ROUTE-M4) |
| ROUTE-L1 | Low | Route Security | Missing rate limiting on 6 `/reports/latest` GET endpoints |
| ROUTE-L2 | Low | Route Security | `/reports/latest` endpoints use wrong response pattern for feature flag checks |
| ROUTE-L3 | Low | Route Security | `platform-context.ts` rate limit applied before auth middleware |
| ROUTE-L4 | Low | Route Security | `coach.ts` `/mode` endpoint has no rate limiting |
| ROUTE-L5 | Low | Route Security | `sessions.ts` `product_type` not validated on session create |
| AGENT-L1 | Low | Agent Architecture | Coach agent not registered at startup like resume agents |
| AGENT-L2 | Low | Agent Architecture | `verify_cross_section_consistency` and `check_blueprint_compliance` drop `ctx` |
| AGENT-L3 | Low | Agent Architecture | `check_blueprint_compliance` uses `slice(0, 20)` for fuzzy matching |
| AGENT-L4 | Low | Agent Architecture | `build_readiness_summary` schema key mismatch: `planner_questions` vs `questions_to_ask_planner` |
| AGENT-L5 | Low | Agent Architecture | `onInit` errors silently swallowed without abort option |
| AGENT-L6 | Low | Agent Architecture | `MODEL_ORCHESTRATOR_COMPLEX` has no corresponding `model_tier` value |
| AGENT-L7 | Low | Agent Architecture | Fresh scratchpad per agent is undocumented trap for new product implementations |
| FE-P1 | Low | Frontend/Panels | `BrandFindingsReviewData` naming inconsistency with `findings_review` type identifier |
| FE-SSE-2 | Low | Frontend/SSE | No single canonical source of truth for SSE event types across layers |
| FE-R3 | Low | Frontend/Rooms | `CareerIQScreen` queries `job_applications` on every mount regardless of active room |
| FE-DB-4 | Low | Frontend/DB | `coaching_requests` table has no admin visibility policy |
| FE-FF2 | Low | Frontend/Flags | No `FF_VIRTUAL_COACH` check in `CareerIQScreen` or `CoachDrawer` |
| SA-1 | Low | Static Analysis | 1 `console.log` in app (dev-guarded) |
| SA-3 | Low | Static Analysis | 1 `as any` cast in app (dev-guarded) — add Window type declaration |
| SA-5 | Low | Static Analysis | Billing localhost fallback (production concern if `Origin` header missing) |
| SA-7 | Low | Static Analysis | `usePlannerHandoff` never sends `specializations` to match endpoint |

---

## Total Counts by Severity

| Severity | Route Security | Agent Architecture | Frontend/Data | Static Analysis | **Total** |
|----------|---------------|-------------------|---------------|-----------------|-----------|
| Critical | 1 | 0 | 2 | 0 | **3** |
| High | 3 | 1 | 2 | 0 | **6** |
| Medium | 7 | 8 | 5 | 6 | **26** |
| Low | 5 | 7 | 6 | 3 | **21** |
| **Total** | **16** | **16** | **15** | **9** | **57** |

---

## Recommended Fix Order

### Immediate (Critical — Fix Before Next Release)

1. **FE-DB-2** — Add migration to expand `user_platform_context.context_type` CHECK constraint. This silently breaks every cross-product feature that has shipped since Sprint 37.
2. **ROUTE-CRIT-1** — Remove the `NODE_ENV=development` bypass from `admin.ts`. Require `ADMIN_API_KEY` universally.
3. **FE-DB-1** — Tighten INSERT/UPDATE RLS on `onboarding_assessments` and `retirement_readiness_assessments` to `service_role` only.

### Sprint-Ready (High)

4. **ROUTE-H1, H2, H3** — Add ownership checks to planner-handoff PATCH and b2b-admin seat/org endpoints.
5. **AGENT-H1** — Add `isInteractive: true` to `interview_candidate_batch` tool definition (1-line fix).
6. **FE-SSE-1** — Add coach SSE event handlers to `useSSEEventHandlers.ts`.
7. **FE-R1** — Add feature flag awareness to room routing in `CareerIQScreen`.

### Backlog (Medium and Low)

8. **AGENT-M2** — Store blueprint slice in `write_section` to fix `revise_section` context.
9. **AGENT-M6** — Add `signal` and `session_id` to all `llm.chat` calls in onboarding and retirement-bridge tools.
10. **SA-6** — Delete or connect `cognitive-reframing.ts` and `draft-readiness-compat.ts`.
11. **SA-4** — Dedicated audit story for `useAgent.ts` stale-closure suppressions.
12. **SA-2** — Promote the 3 agent-first TODOs in `boolean-search.ts` and `ai-matcher.ts` to sprint stories.

---
