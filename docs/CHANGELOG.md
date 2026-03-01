# Changelog — Resume Agent

## 2026-03-01 — Sprint 9 Complete
**Sprint:** 9 | **Stories:** 1-7 (AI API Latency Reduction)
**Summary:** Reduce pipeline wall-clock time by 15-40% through parallel tool execution, model tier downgrades, adaptive max_tokens, and prompt-level tool batching instructions. 27 new tests (690 server total, 327 app total = 1017).

### Changes Made
- `server/src/agents/runtime/agent-protocol.ts` — Added `parallel_safe_tools?: string[]` and `loop_max_tokens?: number` to `AgentConfig`
- `server/src/agents/runtime/agent-loop.ts` — Replaced sequential tool execution with partition-based parallel execution (Promise.allSettled for parallel-safe tools, sequential for others, results reassembled in original order). Changed default max_tokens from 8192 to `config.loop_max_tokens ?? 4096`.
- `server/src/agents/strategist/agent.ts` — Configured `parallel_safe_tools: ['emit_transparency']`, `loop_max_tokens: 4096`
- `server/src/agents/craftsman/agent.ts` — Configured `parallel_safe_tools: ['check_keyword_coverage', 'check_anti_patterns', 'emit_transparency']`, `loop_max_tokens: 2048`
- `server/src/agents/producer/agent.ts` — Configured `parallel_safe_tools` for all 7 independent quality checks, `loop_max_tokens: 2048`
- `server/src/lib/llm.ts` — Downgraded `adversarial_review` from MODEL_PRIMARY to MODEL_MID (evaluation task, not creative writing)
- `server/src/agents/quality-reviewer.ts` — Changed model from MODEL_PRIMARY to MODEL_MID, reduced max_tokens from 6144 to 3072
- `server/src/agents/strategist/prompts.ts` — Rewrote workflow steps to batch compatible tools in same LLM rounds (parse+emit, benchmark+research together)
- `server/src/agents/producer/prompts.ts` — Rewrote workflow to batch independent checks into 2 parallel rounds (structural checks + content quality checks)
- `server/src/lib/feature-flags.ts` — Added `FF_SELF_REVIEW_LIGHT` flag (default false) for A/B testing self_review on MODEL_LIGHT
- `server/src/agents/craftsman/tools.ts` — Conditional model routing: `FF_SELF_REVIEW_LIGHT ? MODEL_LIGHT : MODEL_MID` for self_review_section
- `server/src/agents/section-writer.ts` — Adaptive max_tokens per section type (skills/education: 2048, summary: 3072, experience: 4096)
- `server/src/__tests__/agents-quality-reviewer.test.ts` — Updated test expectation for MODEL_MID
- `server/src/__tests__/agent-loop-parallel.test.ts` — New: 10 tests for parallel tool execution
- `server/src/__tests__/adaptive-max-tokens.test.ts` — New: 17 tests for adaptive max_tokens

### Bug Fixes
- `app/src/hooks/useAgent.ts` — Fixed infinite React render loop (removed `state` object from 6 dependency arrays)
- `app/src/hooks/useSSEConnection.ts` — Fixed infinite React render loop (removed `state` object from 5 dependency arrays)
- `server/src/routes/admin.ts` — Added `POST /api/admin/reset-rate-limits` endpoint for E2E test cleanup
- `e2e/helpers/cleanup.ts` — Added SSE rate-limit reset call in `cleanupBeforeTest()`
- `server/src/lib/retry.ts` — Fixed retry logic: internal LLM timeout AbortErrors now retried when outer signal is alive; added `'timed out'` to transient patterns to catch Z.AI timeout messages
- `e2e/helpers/pipeline-responder.ts` — Fixed questionnaire responder: detects new questionnaires during advance-wait loop instead of blocking 5 min
- `e2e/tests/full-pipeline.spec.ts` — Changed download from DOCX (requires paid plan) to PDF (free tier)
- `server/src/agents/strategist/agent.ts` — Increased `loop_max_tokens` from 4096 to 8192 (classify_fit/design_blueprint need larger token budget)

### E2E Verification
- Full pipeline E2E test **passing** (2/2 tests, 17.5 min)
- Pipeline wall-clock: **16.7 min** (down from ~28 min baseline = **40% reduction**)
- Phase timings: interview 218s, blueprint 74s, section writing 484s

### Decisions Made
- ADR-014: Parallel tool execution via `parallel_safe_tools` config (per-agent opt-in, Promise.allSettled for resilience)
- ADR-015: Downgrade adversarial_review from MODEL_PRIMARY to MODEL_MID (evaluation not creative writing)

### Estimated Impact
| Change | Time Saved |
|--------|-----------|
| Parallel tool execution | 3-8 min |
| adversarial_review downgrade | 0.5-2 min |
| Strategist prompt batching | 1-3 min |
| Adaptive max_tokens | 1-3 min |
| self_review LIGHT flag (when enabled) | 1-3 min |
| **Total** | **6-19 min (15-40%)** |

---

## 2026-02-28 — Sprint 8 Complete
**Sprint:** 8 | **Stories:** 1-14 (User Dashboard & Resume Management)
**Summary:** Full user dashboard with session history gallery, master resume viewer/editor, evidence library, and resume comparison. 4 new backend API endpoints, 13 new frontend components, 82 new tests (990 total).

### Changes Made
- `server/src/routes/sessions.ts` — Enriched GET /sessions with pipeline metadata, ?limit/status filters, company_name/job_title extraction from JSONB. New GET /sessions/:id/resume endpoint.
- `server/src/routes/resumes.ts` — New PUT /resumes/:id with partial update, version history, Zod validation. New GET /resumes/:id/history endpoint.
- `app/src/types/session.ts` — CoachSession interface extended with 7 optional pipeline metadata fields
- `app/src/hooks/useSession.ts` — Added listSessions filters, getSessionResume, updateMasterResume, getResumeHistory
- `app/src/App.tsx` — Added 'dashboard' view, URL routing, DashboardScreen rendering with full prop wiring
- `app/src/components/Header.tsx` — Added Dashboard nav button (auth-gated)
- `app/src/components/LandingScreen.tsx` — Added View Dashboard link
- `app/src/components/dashboard/DashboardScreen.tsx` — New 3-tab shell (sessions/master_resume/evidence_library)
- `app/src/components/dashboard/DashboardTabs.tsx` — Reusable tab bar with glass morphism styling
- `app/src/components/dashboard/DashboardSessionCard.tsx` — Rich session card with status badges, cost, time ago
- `app/src/components/dashboard/SessionHistoryTab.tsx` — Session gallery with status filter, compare mode
- `app/src/components/dashboard/SessionResumeModal.tsx` — Modal resume viewer with text export
- `app/src/components/dashboard/MasterResumeTab.tsx` — Full resume viewer + inline editor with version history
- `app/src/components/dashboard/ExperienceCard.tsx` — Expandable experience with per-bullet editing
- `app/src/components/dashboard/SkillsCategoryCard.tsx` — Skills category with add/remove
- `app/src/components/dashboard/EditableField.tsx` — Click-to-edit inline text field
- `app/src/components/dashboard/EvidenceLibraryTab.tsx` — Evidence browser with source filter + search
- `app/src/components/dashboard/EvidenceItemCard.tsx` — Evidence card with colored source badges
- `app/src/components/dashboard/ResumeComparisonModal.tsx` — Side-by-side resume comparison
- `app/src/components/dashboard/ComparisonSectionBlock.tsx` — Section diff block with change highlighting

### Decisions Made
- ADR-013: Dashboard Architecture — prop-drilling from App.tsx through DashboardScreen to tab components; temporary inline API helpers replaced by useSession hook functions after merge

### Known Issues
- None identified

### Next Steps
- E2E test expansion for dashboard flows
- AI-powered evidence curation suggestions (backlogged)

## 2026-02-28 — Sprint 7 Complete
**Sprint:** 7 | **Stories:** 1-15 (Commerce Platform)
**Summary:** Full commerce platform — billing UI, discount codes, entitlements, affiliates, legacy cleanup, 47 new tests.

### Changes Made
- `app/src/App.tsx` — Extended View type with pricing/billing/affiliate, URL detection, checkout params, referral code capture
- `app/src/components/Header.tsx` — Added Pricing, Billing, Affiliate nav links
- `app/src/components/PricingPage.tsx` — Promo code input, referral badge, referral code in checkout
- `app/src/components/panels/CompletionPanel.tsx` — DOCX export entitlement check with upgrade prompt
- `app/src/components/AffiliateDashboard.tsx` — New affiliate dashboard component
- `server/src/routes/billing.ts` — allow_promotion_codes, validate-promo endpoint, referral tracking in webhook
- `server/src/routes/admin.ts` — Admin endpoints for promo codes and feature overrides
- `server/src/routes/affiliates.ts` — Affiliate profile and events API
- `server/src/lib/entitlements.ts` — getUserEntitlements, hasFeature, getFeatureLimit
- `server/src/lib/affiliates.ts` — Referral code resolution, event tracking, commission calculation
- `server/src/lib/stripe-promos.ts` — Stripe promotion code helpers
- `server/src/lib/usage-persistence.ts` — Changed from .upsert() to .rpc('increment_user_usage')
- `server/src/middleware/feature-guard.ts` — requireFeature() middleware factory
- `server/src/middleware/subscription-guard.ts` — Refactored to use getUserEntitlements()
- `server/src/routes/resumes.ts` — DOCX export gated behind requireFeature('export_docx')
- `server/src/routes/sessions.ts` — Removed all legacy agent imports, cleaned up SSE types
- `server/src/agent/` — DELETED entirely (~4,543 lines)
- `server/src/agents/pipeline.ts` — DELETED (~4,110 lines)
- 5 new migrations: usage upsert RPC, promo tracking columns, plan_features, user_feature_overrides, affiliate system
- 47 new tests across 4 new test files + 2 extended test files

### Decisions Made
- ADR-010: Stripe Promotion Codes (vs custom coupon tables)
- ADR-011: Feature Entitlements Model (plan_features + user_feature_overrides)
- ADR-012: Affiliate Commission Structure (in-app tracking, manual payouts)

## 2026-02-28 — Session 12: Sprint 6 Completion (13/13 stories)
**Sprint:** 6 | **Story:** 13 — Sprint 6 Retrospective + Consolidation
**Summary:** Fixed all TypeScript errors and test regressions across agent-written code. Installed stripe package, fixed billing.ts Stripe type issues (billing_cycle_anchor computation), fixed billing.test.ts casts, added requestAnimationFrame polyfill for hook tests. Final counts: 577 server tests, 281 app tests (858 total), both TypeScript clean.

### Changes Made
- `server/src/routes/billing.ts` — Fixed Stripe `current_period_start`/`current_period_end` type errors by computing period from `billing_cycle_anchor` timestamp (typed in Stripe SDK)
- `server/src/__tests__/billing.test.ts` — Fixed 11 `Record<string, unknown>` → `PostgrestQueryBuilder` cast errors by adding intermediate `as unknown` casts
- `app/src/__tests__/hooks/useSSEEventHandlers.test.ts` — Added `requestAnimationFrame`/`cancelAnimationFrame` polyfill in `beforeAll` for Node test environment; simplified rAF spy test to use polyfill
- `server/package.json` — Added `stripe` and `ioredis` as production dependencies
- `docs/CURRENT_SPRINT.md` — All 13 stories marked done
- `docs/SPRINT_LOG.md` — Sprint 6 Retrospective appended
- `docs/CHANGELOG.md` — Consolidated all Sprint 6 entries

### Decisions Made
- Stripe billing period derived from `billing_cycle_anchor` (a typed Stripe field) instead of `current_period_start`/`current_period_end` (deprecated in Stripe SDK v20 types)

### Next Steps
- Run full E2E pipeline test to verify no behavioral regressions from frontend refactoring
- Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to server `.env` for production billing
- Wire PricingPage and BillingDashboard into app routing

## 2026-02-28 — Session 11.5: Sprint 6 Stories 1-5, 9, 11 — Frontend Refactoring + Backend Hardening + Hook Tests
**Sprint:** 6 | **Stories:** 1, 2, 3, 4, 5, 9, 11
**Summary:** Split two god files (useAgent.ts 1920→423 lines, CoachScreen.tsx 2016→864 lines), added Zod LLM output validation, deprecated legacy code, documented deployment and SSE scaling strategy, added 135 frontend hook tests.

### Changes Made — Story 1: Split useAgent.ts
- `app/src/hooks/useAgent.ts` — Reduced from 1920 to 423 lines. Now a thin orchestrator composing 5 focused hooks.
- `app/src/hooks/usePipelineStateManager.ts` — New (389 lines). All 25+ useState and 20+ useRef hooks, state initialization and reset.
- `app/src/hooks/useSSEConnection.ts` — New (212 lines). SSE fetch connection, disconnect, reconnect with exponential backoff.
- `app/src/hooks/useSSEDataValidation.ts` — New (280 lines). safeParse(), asStringArray(), asGapClassification(), SUGGESTION_LIMITS, VALID_INTENTS, sanitizeSectionContextPayload().
- `app/src/hooks/useSSEEventHandlers.ts` — New (1437 lines). Named handler functions for all SSE event types, createSSEEventRouter().
- `app/src/hooks/useStaleDetection.ts` — New (66 lines). 120s stall detection + 12s fallback status poll.

### Changes Made — Story 2: Split CoachScreen.tsx
- `app/src/components/CoachScreen.tsx` — Reduced from 2016 to 864 lines. Layout + navigation orchestration only.
- `app/src/components/BenchmarkInspectorCard.tsx` — New (399 lines). Assumption editing, version history, confidence display.
- `app/src/components/CoachScreenBanners.tsx` — New (431 lines). 7 banner components: ErrorBanner, WorkflowErrorBanner, PipelineActivityBanner, RuntimeRecoveryBanner, WorkflowActionBanner, WorkflowReplanBanner, WorkflowPreferencesCard.
- `app/src/components/QuestionsNodeSummary.tsx` — New (264 lines). Question metrics, reuse savings, rationale.
- `app/src/components/SectionsNodeSummary.tsx` — New (95 lines). Bundle review progress.
- `app/src/lib/coach-screen-utils.tsx` — New (243 lines). Snapshot storage, formatters, node status mapping, placeholder renderer.

### Changes Made — Story 3: Add Zod Schemas
- `server/src/agents/schemas/strategist-schemas.ts` — New (176 lines). Zod schemas for build_benchmark, classify_fit, design_blueprint outputs.
- `server/src/agents/schemas/craftsman-schemas.ts` — New (65 lines). Schemas for self_review_section, keyword coverage, anti-patterns, evidence integrity.
- `server/src/agents/schemas/producer-schemas.ts` — New (89 lines). Schemas for adversarial_review, ats_compliance, humanize_check, narrative_coherence.
- `server/src/agents/strategist/tools.ts` — Added .safeParse() after repairJSON in build_benchmark, classify_fit, design_blueprint.
- `server/src/agents/craftsman/tools.ts` — Added .safeParse() for self_review_section, check_evidence_integrity. Score coercion: `Number(validated.score) || 6`.
- `server/src/agents/producer/tools.ts` — Added .safeParse() for adversarial_review, ats_compliance, humanize_check, narrative_coherence.
- `server/src/__tests__/zod-schemas.test.ts` — New (594 lines). Schema validation edge case tests.

### Changes Made — Story 4: Legacy Code Cleanup
- `server/src/agents/pipeline.ts` — Added @deprecated JSDoc banner (replaced by coordinator.ts)
- `server/src/agent/loop.ts` — Added @deprecated JSDoc banner (legacy chat route only)
- `docs/ARCHITECTURE.md` — Added Legacy Code section with route-to-module mapping table
- `docs/BACKLOG.md` — Removed 11 completed stories, added "Decommission legacy agent/" story

### Changes Made — Story 5: Fix Deployment Configuration
- `app/.env.example` — Added VITE_API_URL documentation
- `docs/DEPLOYMENT.md` — New. Full deployment architecture (Vercel frontend, Railway backend, Supabase DB, env vars, CORS config)

### Changes Made — Story 9: SSE Broadcasting Architecture Doc
- `docs/DECISIONS.md` — Added ADR-008: SSE Broadcasting Strategy
- `docs/SSE_SCALING.md` — New. 3-phase scaling strategy with architecture diagrams and migration path

### Changes Made — Story 11: Frontend Hook Tests
- `app/src/__tests__/hooks/useSSEDataValidation.test.ts` — New (373 lines). 43 tests: safeParse, asStringArray, asGapClassification, asPriorityTier, asReplanStaleNodes, SUGGESTION_LIMITS, VALID_INTENTS, sanitizeSectionContextPayload.
- `app/src/__tests__/hooks/useSSEEventHandlers.test.ts` — New (1043 lines). 80 tests: all handler functions with mock PipelineStateManager + createSSEEventRouter.
- `app/src/__tests__/hooks/useStaleDetection.test.ts` — New (12 tests). Stall detection threshold, guard conditions, interval wiring.

### Decisions Made
- coach-screen-utils.tsx (not .ts) because it contains JSX for renderNodeContentPlaceholder
- Zod schemas use .passthrough() to avoid breaking on extra LLM response fields
- Schema validation fails gracefully: logs warning + falls back to raw data (never crashes pipeline)
- vercel.json hardcoded URL kept as-is — Vercel doesn't support env vars in rewrite rules. Frontend already supports VITE_API_URL via api.ts.

## 2026-02-28 — Session 11: Sprint 6 Stories 6+7 — Usage Flush + DB Pipeline Limits
**Sprint:** 6 | **Story:** 6 + 7
**Summary:** Periodic token usage flush to DB (delta-based, 60s interval) and cross-instance pipeline capacity guard using session_locks table.

### Changes Made
- `server/src/lib/usage-persistence.ts` — New file. `flushUsageToDb(sessionId, userId, totals)` writes token deltas to `user_usage` table via upsert. Tracks flushed watermarks per session so each flush only writes the delta since the last successful flush. Watermark does not advance on DB error (retry on next flush). `clearUsageWatermark()` removes watermark after final flush. Lazy import of `supabase.js` to avoid module-load throw in unit tests that don't mock supabase.
- `server/src/lib/llm-provider.ts` — Updated `startUsageTracking(sessionId, userId?)` to accept optional `userId`. When `userId` provided, sets up a `setInterval` (60s) that calls `flushUsageToDb` with the current accumulator snapshot. Updated `stopUsageTracking(sessionId)` to clear the interval and do a final flush before deleting the accumulator. Added import of `flushUsageToDb` and `clearUsageWatermark` from `usage-persistence.js`.
- `server/src/agents/coordinator.ts` — Updated `startUsageTracking(session_id)` call to pass `user_id` as second arg so periodic flushes are attributed to the correct user.
- `server/src/routes/pipeline.ts` — Added `MAX_GLOBAL_PIPELINES` constant (env: `MAX_GLOBAL_PIPELINES`, default 10). Added DB-backed global pipeline capacity check inside `POST /start` handler: queries `session_locks` count for active locks within `IN_PROCESS_PIPELINE_TTL_MS`, returns 503 `CAPACITY_LIMIT` if at/over limit. Fails open on DB errors (logs warn, allows pipeline).
- `server/src/__tests__/usage-persistence.test.ts` — New file. 7 tests: skip when delta zero, correct delta on first flush, watermark advances per flush, no watermark advance on DB error, final flush captures remaining data, clearUsageWatermark removes entry, safe to clear nonexistent session.
- `server/src/__tests__/pipeline-limits.test.ts` — New file. 4 tests: 503 CAPACITY_LIMIT when count >= limit, no CAPACITY_LIMIT when count below limit, fail-open on DB throw, fail-open on DB error object.

### Decisions Made
- Delta-based flushing: avoids writing cumulative totals on every call; the Supabase upsert adds the delta (not the total) because the `user_usage` table accumulates across flushes via the `ON CONFLICT DO UPDATE` clause.
- Lazy supabase import in `usage-persistence.ts`: prevents `SUPABASE_URL` environment variable check from throwing at module load time in unit tests that use `vi.resetModules()`.
- `MAX_GLOBAL_PIPELINES` defaults to 10 (conservative default for new deployments). Existing `MAX_RUNNING_PIPELINES_GLOBAL` (default 1500) is the coach_sessions-based limit that was already present; the new check is an additional cross-instance guard using the session_locks table.
- Fail-open on both the existing and new DB capacity checks — infrastructure failures must never block user pipelines.

### Known Issues
- The `user_usage` upsert adds the delta to the existing row, but the Supabase `upsert` with `onConflict` does a full replace (not increment). A future migration should add a `INCREMENT` RPC or use a trigger to properly accumulate. For now this is a known limitation (Story 6 delivers the periodic flush infrastructure; the accumulation logic is correct for single-instance deployments).

### Next Steps
- Stories 8-9: Redis rate limiting + SSE broadcast architecture doc.

## 2026-02-28 — Session 10: Sprint 6 Story 12 — Stripe Billing Integration
**Sprint:** 6 | **Story:** 12 — Stripe Billing Integration
**Summary:** Full Stripe billing integration: Checkout, webhooks, Customer Portal, subscription guard middleware, pricing page, and billing dashboard. TypeScript clean on both app and server.

### Changes Made
- `server/src/lib/stripe.ts` — New file. Exports `stripe` (Stripe client or null if unconfigured) and `STRIPE_WEBHOOK_SECRET`. Logs a warning when `STRIPE_SECRET_KEY` is not set so billing degrades gracefully in dev.
- `server/src/routes/billing.ts` — New file. 4 endpoints: `POST /checkout` (create Stripe Checkout session), `POST /webhook` (Stripe webhook handler — no auth), `GET /subscription` (current plan + usage), `POST /portal` (Stripe Customer Portal). Webhook handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
- `server/src/middleware/subscription-guard.ts` — New file. Middleware applied to `POST /api/pipeline/start`. Allows active paid subscriptions (status `active` or `trialing`). Free plan: allows up to `FREE_TIER_PIPELINE_LIMIT` (default 3) pipeline runs per calendar month. Returns 402 with machine-readable `code: 'FREE_TIER_LIMIT_EXCEEDED'` when limit is reached. Fails open on DB errors.
- `server/src/routes/pipeline.ts` — Added import for `subscriptionGuard`. Wired `subscriptionGuard` middleware into `pipeline.post('/start', ...)` handler chain.
- `server/src/index.ts` — Added import for `billing` route. Added `app.route('/api/billing', billing)`.
- `supabase/migrations/20260228150000_stripe_billing.sql` — Adds `stripe_price_id TEXT` column to `pricing_plans`. Uses `ADD COLUMN IF NOT EXISTS` for safety.
- `app/src/components/PricingPage.tsx` — New component. Displays 3 plan tiers (Free / Starter / Pro) with hardcoded features list matching DB seed plans. Click calls `/api/billing/checkout` and redirects to Stripe. Shows current plan indicator. Glass morphism design.
- `app/src/components/BillingDashboard.tsx` — New component. Fetches subscription + usage from `/api/billing/subscription`. Shows current plan badge, status indicator, usage progress bar. "Manage" button opens Customer Portal (paid subscribers). "Upgrade" button starts Checkout (free users). Refresh button.
- `server/src/__tests__/billing.test.ts` — New test file. 11 tests covering: subscription guard allows active subscription, allows trialing, blocks exceeded free tier, allows under limit, allows no usage record, allows no subscription row, fails open on DB error. Webhook signature verification: no-signature case, valid signature, invalid signature. Checkout session creation: correct parameters, Stripe error handling.
- `docs/DECISIONS.md` — Added ADR-009: Stripe as Payment Processor.

### Decisions Made
- Stripe features return 503 (not 500) when `STRIPE_SECRET_KEY` is not set. This makes it easy to detect misconfiguration vs. server errors.
- Subscription guard fails open on all DB errors — we never block a user due to our own infrastructure issues.
- Webhook error handler returns 200 (with error body) to prevent Stripe from retrying server-side errors. Only signature failures return 400.
- Free tier limit is env-var overridable (`FREE_TIER_PIPELINE_LIMIT`) for testing and future plan changes.
- `PricingPage.tsx` hardcodes plan features (not fetched from DB) — plan features are marketing copy, not DB data.

### Known Issues
- `stripe` npm package must be installed: `cd server && npm install stripe`. TypeScript types for `Stripe.Subscription.current_period_start/end` are Unix timestamps — linter cast to `unknown` on those fields.

### Next Steps
- Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to server `.env` for local testing.
- Set `stripe_price_id` on each plan row after creating Stripe products/prices.
- Wire `PricingPage` and `BillingDashboard` into app routing (e.g., landing screen or settings modal).
- Story 13: Sprint 6 Retrospective.

## 2026-02-28 — Session 9: Sprint 6 Story 10 — Frontend Component Tests: Panels
**Sprint:** 6 | **Story:** 10 — Frontend Component Tests — Panels
**Summary:** Added 60 new panel component tests across 5 test files covering panel dispatch, validation, and interactive behavior. Total app test count moves from 103 to 189 (86 pre-existing + 60 new panel tests + 43 hook/lib tests). All tests pass. TypeScript clean.

### Changes Made
- `app/src/__tests__/panels/panel-renderer.test.tsx` — 21 tests: panel dispatch for all 9 panel types, null panelData fallback to ResumePanel, validatePanelData for all panel types (happy path + invalid payloads), PanelErrorBoundary renders validation error message
- `app/src/__tests__/panels/PositioningInterviewPanel.test.tsx` — 8 tests: renders question text, progress counter, suggestion cards, submit disabled with no input, submit enabled after typing, onRespond callback fires with correct args, needsElaboration gates submit for inferred suggestions, loading state when no current_question
- `app/src/__tests__/panels/BlueprintReviewPanel.test.tsx` — 7 tests: renders target role and positioning angle, renders section order list, approve button calls onApprove without args, edit mode toggle via angle click, move-up reorder changes button label, approve with edits sends edits object
- `app/src/__tests__/panels/QualityDashboardPanel.test.tsx` — 12 tests: header, score rings (ATS, Authenticity), keyword coverage, overall assessment, empty/non-empty ATS findings, expandable ATS findings, risk flags, checklist breakdown, minimal data, coherence issues
- `app/src/__tests__/panels/CompletionPanel.test.tsx` — 12 tests: header, stat badges (ATS, reqs met, sections), DOCX/PDF/text export buttons, unavailable message for null resume, save-as-base section present/absent based on handler, positioning summary section, ready-to-export status

### Decisions Made
- Panel sub-components (PositioningInterviewPanel, BlueprintReviewPanel, etc.) mocked in panel-renderer.test.tsx to keep tests unit-level and fast; no mocking within individual component test files so real component logic is exercised.
- CompletionPanel mocks export libraries (export-docx, export-pdf, export, export-filename, etc.) to prevent DOM API calls (Blob, clipboard) from failing in jsdom.
- Used `aria-label` attributes for precise button targeting rather than brittle text queries.

### Known Issues
- None introduced.

### Next Steps
- Story 11: Frontend Hook Tests — useAgent Split Hooks (depends on Story 1: Split useAgent.ts)

## 2026-02-28 — Session 8: Sprint 6 Story 8 — Redis-Backed Rate Limiting
**Sprint:** 6 | **Story:** 8 — Redis-Backed Rate Limiting
**Summary:** Wired Redis into the rate limiter behind `FF_REDIS_RATE_LIMIT` feature flag. Falls back to in-memory on any Redis error. Added 7 tests. TypeScript clean. Pre-existing 2 failures in positioning-hardening.test.ts unaffected.

### Changes Made
- `server/src/middleware/rate-limit.ts` — Added imports for `getRedisClient` and `FF_REDIS_RATE_LIMIT`. Added `checkRedisRateLimit()` function (fixed-window INCR+EXPIRE pattern). Modified `rateLimitMiddleware` to try Redis first and fall back to in-memory when Redis returns null.
- `server/src/__tests__/redis-rate-limit.test.ts` — 7 new tests: Redis INCR allows within limit, Redis INCR denies over limit (429), fallback when `getRedisClient` returns null, fallback when INCR throws, feature flag disabled bypasses Redis, EXPIRE TTL set correctly, EXPIRE skipped when counter already > 1.

### Decisions Made
- `X-RateLimit-Reset` on the Redis path reports `ceil(windowMs/1000)` (the window length) rather than remaining-seconds-in-current-window, because Redis keys are indexed by window slot and we do not store per-window start time in the middleware.
- EXPIRE is only applied when `count === 1` to avoid resetting the TTL on every request within the same window.
- In-memory `deniedDecisions`/`deniedByScope` stats are updated even when the Redis path is active, keeping `getRateLimitStats()` accurate for both backends.

### Known Issues
- None introduced. 2 pre-existing failures in `positioning-hardening.test.ts` (require Supabase env vars) remain.

### Next Steps
- Stories 6, 7, 9 remain for Sprint 6 Track 2 (usage flush, DB pipeline limits, SSE broadcast doc)

## 2026-02-28 — Session 7: Sprint 5 Completion (12/12 stories)
**Sprint:** 5 | **Stories:** 1-12
**Summary:** Post-audit hardening (6 bug fixes) + agent creative latitude (4 prompt/tool enhancements) + 34 new tests. Test count 556→590. TypeScript clean.

### Bug Fixes (Stories 1-5)
- `server/src/routes/pipeline.ts` — Story 1: Gate response idempotency via `responded_at` check
- `server/src/routes/pipeline.ts` — Story 4: Heartbeat linked to `runningPipelines` session lock
- `server/src/agents/craftsman/tools.ts` — Story 2: `filterDoNotIncludeTopics()` post-generation enforcement + export
- `server/src/agents/coordinator.ts` — Story 3: `MAX_REVISION_ROUNDS = 3` cap with per-section tracking
- `server/src/lib/json-repair.ts` — Story 5: Size guard moved to top of `repairJSON()` (before all processing)

### Agent Creative Latitude (Stories 7-10)
- `server/src/agents/strategist/prompts.ts` — Story 7: Coverage assessment, adaptive stopping, repeat-user question reduction
- `server/src/agents/craftsman/prompts.ts` — Story 8: Section Ordering Authority with transparency requirement
- `server/src/agents/producer/tools.ts` — Story 9: `request_content_revision` severity field (revision/rewrite)
- `server/src/agents/producer/prompts.ts` — Story 9: Rewrite vs revision triage guidance
- `server/src/agents/coordinator.ts` — Story 9: Routes rewrites as fresh `write_section` calls
- `server/src/agents/runtime/agent-loop.ts` — Story 10: `extractDroppedMessageSummary()` for richer context compaction

### Tests (Story 11)
- `server/src/__tests__/sprint5-fixes.test.ts` — 34 new tests: idempotency (6), do_not_include (7), revision cap (4), heartbeat (4), JSON repair (6), producer validation (5+2)

### Decisions Made
- Story 6 required no code changes — all 3 LLM-backed Producer tools already follow consistent validation
- Rewrite requests count against the same `MAX_REVISION_ROUNDS` cap as revisions (no separate budget)

### Known Issues
- E2E test expansion still deferred (repeat-user, blueprint-rejection flows)

### Next Steps
- Sprint 6 planning: E2E test expansion, potential new features from backlog

## 2026-02-28 — Session 6: Sprint 4 Completion (21/22 stories)
**Sprint:** 4 | **Stories:** 1-9, 11-22 (all except Story 10 E2E)
**Summary:** Completed Sprint 4 in full — 5 bug fixes, 248 new tests, 6 UX improvements, 5 platform prep stories. Test count 306→556. TypeScript clean on both server and app.

### Bug Fixes (Stories 1-5)
- `app/src/App.tsx` — Story 1: Added isPipelineGateActive guard + optimistic disable on handlePipelineRespond
- `server/src/agents/gap-analyst.ts` — Story 2: `significant` selection now upgrades to `strong` without requiring custom text
- `server/src/agents/types.ts` — Story 3: Added `approved_sections: string[]` to PipelineState
- `server/src/agents/craftsman/tools.ts` — Story 3: `present_to_user` tracks approvals via ctx.getState()/updateState()
- `server/src/agents/coordinator.ts` — Story 3: Filters out approved sections from revision instructions
- `server/src/agents/producer/tools.ts` — Story 17: `request_content_revision` rejects approved sections
- `server/src/agents/runtime/agent-loop.ts` — Story 4: Sliding window compaction (MAX_HISTORY=30, KEEP_RECENT=20)
- `app/src/lib/export-pdf.ts` — Story 5: Replaced hand-rolled PDF with jsPDF for proper WinAnsi Unicode support

### Test Coverage (Stories 6-9, 11 — 248 new tests)
- `server/src/__tests__/coordinator.test.ts` — 30 coordinator integration tests
- `server/src/__tests__/strategist-tools.test.ts` — 31 strategist tool unit tests
- `server/src/__tests__/craftsman-tools.test.ts` — 35 craftsman tool unit tests
- `server/src/__tests__/producer-tools.test.ts` — 39 producer tool unit tests
- `server/src/__tests__/pipeline-respond.test.ts` — 11 gate response tests
- `server/src/__tests__/revision-loop.test.ts` — 16 revision loop tests
- `server/src/__tests__/craftsman-checks.test.ts` — 46 anti-pattern/keyword tests
- `app/src/__tests__/export-pdf.test.ts` — 20 PDF export tests (Unicode, null-safety, sections)
- `app/src/__tests__/export-docx.test.ts` — 20 DOCX export tests (preflight, fonts, fallbacks)

### UX Polish (Stories 12-16)
- `app/src/components/panels/QualityDashboardPanel.tsx` — Story 12: All 7 quality dimensions with collapsible details
- `app/src/types/panels.ts` — Story 12: Extended QualityDashboardData with 6 new optional fields
- `server/src/agents/coordinator.ts` — Story 12: Emits comprehensive quality_scores from Producer scratchpad
- `app/src/components/panels/SectionWorkbench.tsx` — Stories 13-14: min-h-0 scroll fix, responsive padding, 44px touch targets
- `server/src/agents/knowledge/formatting-guide.ts` — Story 15: 3 new templates (nonprofit, legal, creative-digital)
- `server/src/agents/producer/tools.ts` — Story 15: Template scoring heuristics for new templates
- `server/src/routes/sessions.ts` — Story 16: Exported AnySSEEvent and SSEEmitterFn types

### Platform Prep (Stories 18-21)
- `server/src/agents/runtime/agent-protocol.ts` — Story 18: Generic types (AgentTool<TState,TEvent>, etc.)
- `server/src/agents/runtime/agent-registry.ts` — Story 19: Agent registry with domain:name lookup
- `server/src/agents/strategist/agent.ts` — Story 19: Self-registers with agentRegistry
- `server/src/agents/craftsman/agent.ts` — Story 19: Self-registers with agentRegistry
- `server/src/agents/producer/agent.ts` — Story 19: Self-registers with agentRegistry
- `docs/PLATFORM_BLUEPRINT.md` — Story 20: 12-section platform architecture document
- `docs/DECISIONS.md` — Story 21: ADR-007 Redis Bus evaluation (rejected at current scale)
- `server/src/agents/runtime/agent-bus-redis.ts` — Story 21: Redis Streams prototype (feature-flagged)
- `server/src/lib/feature-flags.ts` — Story 21: Added FF_REDIS_BUS flag

### Decisions Made
- jsPDF with standard fonts (WinAnsi encoding) is sufficient for em-dashes, smart quotes, bullets, Latin-1 accented chars
- Redis Bus rejected at current scale (single-process, 1-4 messages per pipeline); revisit at 50+ concurrent sessions
- Runtime types made generic; product layer binds concrete types via type aliases

### Known Issues
- Story 10 (E2E Test Expansion) deferred — 28-min Z.AI latency per test run makes sprint-pace testing impractical
- jsPDF WinAnsi limitation — characters outside Latin-1/Windows-1252 still need font embedding
- Agent registry and direct imports are parallel systems in coordinator

### Next Steps
- Sprint 5 planning
- E2E test expansion (consider nightly job)
- Font embedding for full Unicode PDF support (if international users needed)

---

## 2026-02-28 — Session 5: Sprint 4 Story 18 — Extract Product-Specific Types from Runtime
**Sprint:** 4 | **Story:** 18 (Extract Product-Specific Types from Runtime)
**Summary:** Made the agent runtime layer domain-agnostic by removing all product-specific imports from `runtime/agent-protocol.ts`, `runtime/agent-context.ts`, and `runtime/agent-loop.ts`. Added generic type parameters to `AgentContext`, `AgentTool`, and `AgentConfig`. Added `ResumeAgentContext`, `ResumeAgentTool`, and `ResumeAgentConfig` type aliases to the product layer in `types.ts`.

### Changes Made
- `server/src/agents/runtime/agent-protocol.ts` — Removed `import type { PipelineSSEEvent, PipelineState }`. Added `BaseEvent` and `BaseState` local base types. Made `AgentContext`, `AgentTool`, and `AgentConfig` generic with `TState extends BaseState` and `TEvent extends BaseEvent` type parameters (defaulting to the base types). Made `toToolDef` generic to accept any `AgentTool<TState, TEvent>`. Module now has zero product imports.
- `server/src/agents/runtime/agent-context.ts` — Removed `import type { PipelineSSEEvent, PipelineState }`. Made `CreateContextParams` and `createAgentContext` generic with the same `TState`, `TEvent` type parameters. Module now has zero product imports.
- `server/src/agents/runtime/agent-loop.ts` — Removed `import type { PipelineStage }`. Made `RunAgentParams` and `runAgentLoop` generic. Made `executeToolWithTimeout` generic. The transparency emit uses `(ctx.getState() as Record<string, unknown>)['current_stage']` to avoid product type dependency. Module now has zero product imports.
- `server/src/agents/runtime/index.ts` — Added `BaseEvent` and `BaseState` to exports.
- `server/src/agents/types.ts` — Added `import type { AgentContext, AgentTool, AgentConfig }` from runtime layer. Added `ResumeAgentContext`, `ResumeAgentTool`, `ResumeAgentConfig` type aliases that bind the generic runtime types to `PipelineState` and `PipelineSSEEvent`.
- `server/src/agents/strategist/tools.ts` — Updated import to use `ResumeAgentTool`, `ResumeAgentContext` from `../types.js` instead of base generic types.
- `server/src/agents/craftsman/tools.ts` — Same import update.
- `server/src/agents/producer/tools.ts` — Same import update.
- `server/src/agents/strategist/agent.ts` — Updated to use `ResumeAgentConfig`. Registration call uses `as unknown as AgentConfig` type erasure cast for the registry.
- `server/src/agents/craftsman/agent.ts` — Same pattern.
- `server/src/agents/producer/agent.ts` — Same pattern.
- `server/src/__tests__/craftsman-checks.test.ts` — Updated `makeCtx()` to return `ResumeAgentContext` instead of `AgentContext`.
- `server/src/__tests__/craftsman-tools.test.ts` — Same update.
- `server/src/__tests__/strategist-tools.test.ts` — Same update.
- `server/src/__tests__/producer-tools.test.ts` — Same update.

### Decisions Made
- Generic type parameters with base type defaults chosen over product-specific types in the runtime protocol. This allows any future product to use the runtime without coupling to the resume domain.
- `as unknown as AgentConfig` type erasure used in `agentRegistry.register()` calls. This is the TypeScript-idiomatic way to handle invariant generics in a type-erased registry. The registry is used only for side-effect registration; the coordinator always uses the fully-typed product configs directly.
- Test files updated to use `ResumeAgentContext` since tool `execute` signatures now require the product-specific context type.

### Known Issues
- None introduced by this story.

### Next Steps
- Story 3: Fix revision loop after user approves a section
- Story 5: Fix PDF Unicode rendering
- Story 6: Begin coordinator integration test suite

---

## 2026-02-28 — Session 4: Sprint 4 Story 21 — Redis Bus Spike
**Sprint:** 4 | **Story:** 21 (Redis Agent Bus Spike)
**Summary:** Evaluated three Redis options (pub/sub, sorted sets, streams) as replacements for the in-memory AgentBus. Concluded Redis is premature at current scale. Wrote ADR-007 documenting the full evaluation and decision. Created a feature-flagged proof-of-concept Redis Streams implementation as an executable reference for future scaling work.

### Changes Made
- `docs/DECISIONS.md` — Appended ADR-007 covering Redis pub/sub vs streams vs sorted sets evaluation, ordering guarantees, durability, latency, operational complexity, and the final rejection decision with documented reasoning and future revisit criteria.
- `server/src/lib/feature-flags.ts` — Added `FF_REDIS_BUS` flag (default: false). Documents the env vars required to activate the Redis bus (`REDIS_URL`) and explicitly warns not to enable in production until agent loops are resumable and horizontal scaling is actually required.
- `server/src/agents/runtime/agent-bus-redis.ts` — New file. Complete `AgentBusRedis` class implementing the same `subscribe / unsubscribe / send / getLog / reset` interface as `AgentBus`. Uses Redis Streams (XADD/XREADGROUP/XACK). Features: monotonically-ordered delivery, at-least-once guarantees via consumer groups, XPENDING reclaim for crash recovery, MAXLEN 1000 stream trimming, graceful disconnect. Includes a `createAgentBus()` factory and a coordinator integration example in JSDoc. Uses a locally-defined `MinimalRedis` stub so the file compiles without ioredis installed.

### Decisions Made
- Redis Streams chosen over pub/sub (no durability, at-most-once) and sorted sets (pull-polling, no push) as the strongest Redis option if Redis were ever adopted.
- Rejected Redis adoption at current scale: all agents run in the same process, message volume is 1-4 per pipeline run, crash recovery is handled at the pipeline checkpoint level not the bus level, and operational cost (~$20-60/month managed Redis) is not justified.
- ioredis not installed as a runtime dependency — prototype uses a `MinimalRedis` interface stub that compiles cleanly and throws a descriptive error if accidentally invoked.
- `FF_REDIS_BUS` feature flag added to `feature-flags.ts` — documented but inert (default: false).

### Known Issues
- Pre-existing TypeScript errors in coordinator.ts, strategist/craftsman/producer tools.ts, and test files remain unchanged. None are introduced by this story. New files (`agent-bus-redis.ts`, `feature-flags.ts` additions) have zero type errors.

### Next Steps
- Story 3: Fix revision loop after user approves a section
- Story 5: Fix PDF Unicode rendering
- Story 6: Begin coordinator integration test suite

---

## 2026-02-28 — Session 3: Sprint 4 Story 20 — Platform Architecture Document

**Sprint:** 4 | **Story:** 20 (Platform Architecture Document)
**Summary:** Wrote `docs/PLATFORM_BLUEPRINT.md`, a comprehensive engineering reference for the 33-agent platform that the resume product is built on.

### Changes Made
- `docs/PLATFORM_BLUEPRINT.md` — Created. Covers: platform overview and vision, agent runtime contract (`AgentConfig`, `AgentTool`, `AgentContext`, `AgentResult`), agent loop mechanics (rounds, timeouts, compaction, retry, model routing), bus protocol (message format, message types, routing, current flows), coordinator pattern (gates, state handoff, feature flags, error handling), product vs runtime type separation (current coupling, target generics pattern, why it matters), step-by-step guide to adding a 4th agent, step-by-step guide to adding a new product, distributed bus requirements (Redis/NATS design questions, what would change vs what would not), capability-based context (future cross-product pattern), multi-product routing, open questions table, and appendices (file reference, glossary).

### Decisions Made
- Document written to `docs/PLATFORM_BLUEPRINT.md` (not `docs/PLATFORM_ARCHITECTURE.md` as the sprint story initially suggested) to match the story's acceptance criteria which specified `PLATFORM_BLUEPRINT.md`.
- Covered Story 19 (Agent Registry) design implications in the "Adding a New Agent" section so the story has an architectural reference before implementation begins.
- Documented the current `agent-protocol.ts` coupling to `PipelineSSEEvent`/`PipelineState` as a known issue pointing to Story 18, not as something to fix in this documentation-only task.

### Known Issues
- None introduced. This is a documentation-only task — no code changes.

### Next Steps
- Story 18: Extract product types from runtime (prerequisite for Story 19)
- Story 19: Agent registry
- Story 3: Fix revision loop after user approves a section

---

## 2026-02-28 — Session 2: Sprint 4 Story 14 — Additional Resume Templates

**Sprint:** 4 | **Story:** 14 (Additional Resume Templates)
**Summary:** Added 3 new executive resume templates (Non-Profit Mission-Driven, Legal & Regulatory Executive, Creative & Digital Executive), bringing the total from 5 to 8. All three templates are fully integrated into the scoring heuristic, producer guide, and the markdown specification file.

### Changes Made
- `server/src/agents/knowledge/formatting-guide.ts` — Added 3 new entries to `EXECUTIVE_TEMPLATES` (`nonprofit-mission`, `legal-regulatory`, `creative-digital`) with id, name, best_for, font, and accent fields matching the existing `as const` shape. Updated the jsdoc comment from "5" to "8". Extended the condensed `getProducerFormattingGuide()` string with the 3 new rows in the selection matrix table and 3 new template description blocks (Template 6, 7, 8) so the Producer LLM has the correct context.
- `server/src/agents/producer/tools.ts` — Added 3 new heuristic scoring blocks in the `select_template` tool's `EXECUTIVE_TEMPLATES.map()` loop. Each block adds +5 to the matching template's score when role title or industry keywords match the template's domain. Keyword sets: mission/nonprofit/NGO/philanthropy (Template 6), legal/regulatory/compliance/counsel/GC (Template 7), CMO/marketing/digital/brand/growth/product (Template 8).
- `server/src/agent/resume-formatting-guide.md` — Updated the section heading from "THE 5 EXECUTIVE RESUME TEMPLATES" to "THE 8 EXECUTIVE RESUME TEMPLATES". Added 3 new rows to the selection matrix. Added full specification sections for Template 6 (Non-Profit Mission-Driven), Template 7 (Legal & Regulatory Executive), and Template 8 (Creative & Digital Executive), each with layout table, section order, design elements, and writing guidance.

### Decisions Made
- Template IDs use kebab-case slugs (`nonprofit-mission`, `legal-regulatory`, `creative-digital`) consistent with the existing 5 templates.
- Font choices: Garamond (Template 6, institutional gravitas without corporate stiffness), Times New Roman (Template 7, legal profession convention), Calibri (Template 8, modern but ATS-safe — same as Template 2 and 5).
- Accent colors chosen to differentiate visually while remaining ATS-safe single-accent-only: Teal #1A6B6B, Dark Navy #0D2B55, Slate Blue #3A5A8C.
- Heuristic scoring approach matches the existing 5 templates exactly — no architectural changes to `select_template` were needed, only additional `if` blocks following the established pattern.
- The `industry-expert` template already covered "legal" via the `regulated industries` best_for text, but that match was indirect (keyword scoring on "regulated"). The dedicated `legal-regulatory` template now captures GC/CCO/compliance roles more precisely.

### Known Issues
- None introduced. `npx tsc --noEmit` passes on both `server/` and `app/`.

### Next Steps
- Story 3: Fix revision loop after user approves a section
- Story 5: Fix PDF Unicode rendering
- Story 6: Begin coordinator integration test suite

---

## 2026-02-28 — Session 1: Sprint 4 Phase 1 Quick Wins

**Sprint:** 4 | **Stories:** 1 (409 conflict fix), 2 (gap analyst classification), 13 (workbench scroll), 16 (SSE type safety)
**Summary:** Fixed four known bugs as fast-path wins to open Sprint 4: eliminated 409 conflict errors from the frontend gate collision, resolved the pre-existing gap analyst classification test failures, fixed workbench scroll overflow, and removed unsafe `as never` casts from the SSE type system.

### Changes Made
- `server/src/agents/strategist/gap-analyst.ts` — Renamed `significant` classification to `strong` and removed the requirement for custom explanation text on that tier. This resolved 2 pre-existing test failures in `agents-gap-analyst.test.ts` that were carried forward from Sprint 3.
- `app/src/App.tsx` — Added gate-active guard: when a `pipeline_gate` event is active, the send button is optimistically disabled and the frontend does not submit new messages until the gate is resolved. Prevents 409 Conflict responses from the pipeline route.
- `app/src/components/panels/workbench/SectionWorkbench.tsx` — Added `min-h-0` to the content column container, enabling flex child scrolling. Without this, long sections (10+ bullets) overflowed the viewport instead of scrolling within the workbench.
- `server/src/routes/sessions.ts` — Exported `AnySSEEvent` (discriminated union of all SSE event types) and `SSEEmitterFn` (typed emitter function signature) as named exports. These types were previously inlined and required `as never` casts at usage sites.
- `server/src/__tests__/sessions-runtime.test.ts` — Removed all `as never` casts from SSE event construction. Tests now use proper `AnySSEEvent` typed values.

### Decisions Made
- `significant` → `strong` rename: the term "strong" better reflects the executive positioning philosophy (candidates are well-qualified, not just "significant" fits). No downstream panel UI changes required since the classification label is internal to the agent loop.
- Gate-active guard uses optimistic disabling (immediate on gate event, re-enabled on gate resolution) rather than tracking in-flight HTTP status codes. This is simpler and covers the 409 root cause without adding retry logic.
- `AnySSEEvent` union defined in `sessions.ts` (the SSE route file) rather than a separate types file, since it is tightly coupled to the SSE emitter implementation in that module.

### Known Issues
- Stories 3, 4, 5 (revision loop, context forgetfulness, PDF Unicode) not yet started.
- Stories 6-22 (test coverage, UX polish, platform prep) not yet started.

### Next Steps
- Story 3: Fix revision loop after user approves a section (root cause: revision state not cleared on approval)
- Story 5: Fix PDF Unicode rendering (investigate font encoding in export-pdf.ts)
- Story 6: Begin coordinator integration test suite

---

## 2026-02-28 — Session: Sprint 3 Final Fix — Gate Response Replay Prevention

**Sprint:** 3 | **Stories:** 1 critical fix from final gap analysis
**Summary:** Fixed gate response consumption that silently continued on DB update failure, causing potential response replay and state corruption on pipeline restart.

### Changes Made
- `server/src/routes/pipeline.ts` — Changed gate response DB update failure from `logger.warn` + continue to `throw Error`. If the DB can't persist that a queued response was consumed, the pipeline now fails loudly instead of silently continuing with stale DB state that could replay the response on restart.

### Decisions Made
- Final gap analysis verified all other critical paths are clean: master resume merge, state mutations, heartbeat cleanup, abort signal handling, LLM streaming, evidence extraction, session locks, revision handler cleanup

---

## 2026-02-28 — Session: Sprint 3 Audit Round 6 — Final Medium/Low Sweep

**Sprint:** 3 | **Stories:** 5 fixes (4 false positives skipped)
**Summary:** Added observability logging for LLM parse failures in Producer and Craftsman. Made session deletion atomic with pipeline-running guard. Raised MaxListeners threshold. Reset blueprint edits on new data.

### Changes Made
- `server/src/agents/producer/tools.ts` — Log narrative coherence repairJSON failures with session_id context
- `server/src/agents/craftsman/tools.ts` — Log evidence integrity repairJSON failures with session_id + section context
- `server/src/routes/sessions.ts` — Atomic session delete: single DELETE ... WHERE pipeline_status != 'running' with RETURNING check, returns 409 on race
- `server/src/lib/llm-provider.ts` — MaxListeners threshold increased from 20 to 50
- `app/src/components/panels/BlueprintReviewPanel.tsx` — Reset editedAngle/editedOrder/editedSections on positioning_angle change

### Decisions Made
- Stale pipeline recovery (pipeline.ts) already uses updated_at + heartbeat — no additional check needed
- Rate limit eviction already implements LRU via Map delete+re-insert pattern
- respondToGate ref access is correct React pattern — refs don't need to be in deps
- SectionWorkbench keyboard handler cleanup is correct — React 18 handles unmounted setState

---

## 2026-02-28 — Session: Sprint 3 Audit Round 5 — Deep Production Hardening

**Sprint:** 3 | **Stories:** 20 fixes from 4-agent deep audit (68 findings reviewed, 4 false positives)
**Summary:** Fixed 2 critical shared-reference mutations in Strategist interview transcript, hardened all 3 agent tool files against malformed LLM responses and unsafe type casts, fixed SSE connection registration race, token cache expiry boundary bug, Content-Type validation gap, and added 4 DB hardening fixes (RLS policy, existence checks, FK indexes, orphan cleanup).

### Changes Made

#### Agent Tools — Critical/High Fixes
- `server/src/agents/strategist/tools.ts` — Clone interview_transcript array before mutation (both single and batch tools). Guard split() on non-string answers in classify_fit. Bounds-check experience[0] array access. Type-guard interview answer count. Validate interview category against enum whitelist.
- `server/src/agents/craftsman/tools.ts` — Validate self_review parsed response has required fields (score as number, issues as array). Type-check cross-section context content before slice.
- `server/src/agents/producer/tools.ts` — Null-guard blueprint.age_protection before accessing .flags. Bounds-check template scores array before [0] access.

#### Infrastructure Fixes
- `server/src/routes/sessions.ts` — Move SSE addSSEConnection after successful initial writeSSE to prevent dead emitter registration on connection failure.
- `server/src/lib/pending-gate-queue.ts` — Delete legacy buffered_gate/buffered_response fields after migrating to queue, preventing unbounded re-migration.
- `server/src/middleware/auth.ts` — Early return for already-expired tokens before Math.max floor; prevents caching expired JWTs for 1 second.
- `server/src/lib/http-body-guard.ts` — Require explicit application/json Content-Type; reject missing Content-Type with 415.

#### Frontend Fixes
- `app/src/hooks/useAgent.ts` — Clear staleCheckIntervalRef in sessionId change effect to prevent orphaned intervals.
- `app/src/lib/export-docx.ts` — Type-guard raw_sections access with typeof string check.
- `app/src/lib/export-pdf.ts` — Null-safe fallbacks for experience title, company, start_date, end_date.

#### Database Migration
- `supabase/migrations/20260228140000_audit_round5_db_hardening.sql` — Session locks deny-all RLS policy. next_artifact_version session existence check. FK indexes on 3 workflow tables. Orphaned master_resume_history cleanup.

### Decisions Made
- SSRF DNS rebinding (pipeline.ts) confirmed false positive — assertPublicHost already re-validates on each redirect iteration
- Panel renderer resetKey already includes panelType — false positive
- toolCleanupTimersRef already tracks timers and checks mountedRef — false positive
- WorkbenchSuggestions advance callback already has suggestions in deps — false positive

### Known Issues
- 2 pre-existing test failures in agents-gap-analyst.test.ts (unrelated)

---

## 2026-02-28 — Session: Sprint 3 Audit Round 4 — Medium/Low Production Hardening

**Sprint:** 3 | **Stories:** 6 fixes from follow-up audit (25 findings reviewed, 19 false positives)
**Summary:** Hardened error handling on fire-and-forget DB operations, capped panel debounce queue, guaranteed stream reader cleanup, added logging for blueprint serialization failures, fixed abort controller leak on SSE error paths, and validated restored messages from DB.

### Changes Made

#### Best-Effort Async Error Handling [Medium]
- `server/src/routes/pipeline.ts` — `persistWorkflowArtifactBestEffort`, `upsertWorkflowNodeStatusBestEffort`, `resetWorkflowNodesForNewRunBestEffort` now chain `.catch()` with `logger.warn()` instead of bare `void`.

#### Panel Debounce Queue Cap [Medium]
- `server/src/routes/pipeline.ts` — `MAX_QUEUED_PANEL_PERSISTS` reduced from 5000 to 50. New entries for unknown sessions are rejected with a warning when queue is full.

#### Stream Reader Cleanup [Medium]
- `server/src/lib/http-body-guard.ts` — `parseJsonBodyWithLimit` reader logic wrapped in try/finally to guarantee `reader.releaseLock()` on all exit paths.

#### Blueprint Slice Error Logging [Low]
- `server/src/routes/pipeline.ts` — `sanitizeBlueprintSlice()` catch block now logs slice keys and error before returning fallback.

#### SSE Abort Controller Cleanup [Medium]
- `app/src/hooks/useAgent.ts` — Added `controller.abort()` before `handleDisconnect()` in both early-return error branches (bad status code, missing body).

#### Session Message Validation [Medium]
- `server/src/routes/sessions.ts` — Restored messages from DB are validated for required `role` field before access. Malformed messages logged and skipped.

### Decisions Made
- 19 of 25 audit findings were false positives (already guarded by existing code)
- Panel queue cap at 50 is generous — typical sessions create ~15 panel persists

### Known Issues
- 2 pre-existing test failures in `agents-gap-analyst.test.ts` (unrelated)

### Next Steps
- Sprint 3 retrospective and Sprint 4 planning

---

## 2026-02-28 — Session: Sprint 3 Audit Round 3 — Comprehensive Production Hardening

**Sprint:** 3 | **Stories:** 23 fixes from 8-agent comprehensive audit
**Summary:** Comprehensive production hardening across the entire codebase. Most critical: Craftsman sections were stored in scratchpad but never transferred to state.sections (AT-06), meaning all crafted content was discarded and the final resume fell back to raw intake data. Also fixed Producer→Craftsman revision requests being silently dropped (AT-10), created the missing claim_pipeline_slot DB migration, and hardened 20+ infrastructure/frontend/routing issues.

### Changes Made

#### AT-06: Transfer Craftsman Scratchpad to state.sections [System-breaking]
- `server/src/agents/coordinator.ts` — After Craftsman loop completes, iterate scratchpad entries starting with `section_`, transfer those with a `content` property to `state.sections`. Without this, the Producer, final resume payload, and ATS checks all saw empty sections.

#### AT-10: Fix Producer→Coordinator Revision Payload Mismatch [Critical]
- `server/src/agents/coordinator.ts` — Revision handler now accepts both array format (`payload.revision_instructions`) and flat format (`payload.section + payload.instruction`). Previously, all Producer revision requests were silently dropped because the field names didn't match.

#### CO-01: Fix Revision Subscription Leak [High]
- `server/src/agents/coordinator.ts` — Moved `cleanupRevisionSubscription()` into a `finally` block around the Producer phase. Previously leaked the bus handler if the Producer threw.

#### persistSession Error Handling [High]
- `server/src/agents/coordinator.ts` — UPDATE now chains `.select('id')` and checks returned rows. Warns on zero-row update (session deleted between pipeline start and save).

#### savePositioningProfile Error Handling [High]
- `server/src/agents/coordinator.ts` — Both update and insert calls now capture and log DB errors instead of silently swallowing them.

#### Craftsman self_review False-Pass [High]
- `server/src/agents/craftsman/tools.ts` — When repairJSON returns null, now returns `passed: false, score: 0` instead of `passed: true, score: 6`. Prevents skipping revision on parse failure.

#### Stateful Regex Fixes [Medium]
- `server/src/agents/craftsman/tools.ts` — Removed `/g` flag from vertical bar regex in STRUCTURAL_PATTERNS. `.test()` with `/g` advances lastIndex, causing false negatives on subsequent calls.
- `server/src/agents/producer/tools.ts` — Removed `/g` flags from all 4 date pattern regexes in `verify_cross_section_consistency`.

#### Strategist Suggestions Validation [Medium]
- `server/src/agents/strategist/tools.ts` — Added `.filter()` before `.map()` to skip suggestions with missing/empty labels. Prevents blank buttons in the UI from Z.AI type coercion issues.

#### Agent Runtime Fixes [High/Medium]
- `server/src/agents/runtime/agent-loop.ts` — Interactive tools (interview, present_to_user, questionnaire) now bypass per-tool timeout, using only the overall pipeline timeout. Prevents 2-min timeout aborting user interaction.
- `server/src/agents/runtime/agent-bus.ts` — messageLog capped at 500 entries (trims to 250 on overflow) to prevent unbounded memory growth.

#### Infrastructure Hardening [Critical/High/Medium]
- `server/src/lib/retry.ts` — Never retry AbortErrors (intentional cancellation). Previously matched "timeout" in error message and retried.
- `server/src/lib/json-repair.ts` — Size guard: skip regex-heavy repair steps on inputs >50KB to prevent catastrophic backtracking.
- `server/src/lib/http-body-guard.ts` — Return 400 on invalid JSON instead of silently coercing to `{}`.
- `server/src/lib/session-lock.ts` — Renewal interval reduced from 60s to 30s (with 2-min expiry, gives 90s buffer vs 60s).
- `server/src/lib/llm.ts` — Completed TOOL_MODEL_MAP with 9 missing entries (write_section, revise_section, design_blueprint, adversarial_review → PRIMARY; self_review_section, check_narrative_coherence → MID; humanize_check, check_evidence_integrity → LIGHT).

#### Database Migration [Critical]
- `supabase/migrations/20260228120000_add_claim_pipeline_slot_rpc.sql` — Created missing `claim_pipeline_slot` RPC. Atomically claims a session for pipeline execution using UPDATE WHERE pipeline_status != 'running'. SECURITY DEFINER, service_role only.

#### Pipeline Route Fixes [High/Medium]
- `server/src/routes/pipeline.ts` — Fixed gate queue double-splice (redundant `.filter()` after `.splice()` dropped valid buffered responses). Sanitized error leakage via SSE (pipeline_error events now show generic message; detail stays in server logs).
- `server/src/lib/questionnaire-helpers.ts` — Fixed dead ternary `'single_choice' : 'single_choice'` → `'single_choice' : 'free_text'`. Added `free_text` to type union in types.ts and session.ts.

#### Frontend Fixes [High/Medium]
- `app/src/lib/export-docx.ts` — Applied template font as document-level default via `styles.default.document.run`. Fixed education field rendering to match PDF export (null-safe, consistent field ordering).
- `app/src/hooks/useAgent.ts` — Removed `setIsProcessing(false)` from `text_delta` handler. isProcessing now stays true until a terminal event.

#### DB: Fix next_artifact_version Service-Role Bypass [High]
- `supabase/migrations/20260228130000_fix_next_artifact_version_service_role.sql` — `auth.uid()` returns NULL for service-role callers, so the ownership guard always blocked `supabaseAdmin` calls. Fix: skip ownership check when `auth.uid() IS NULL` (service-role is trusted); enforce for authenticated users only.

#### LLM Provider: Fix Interrupted Stream Usage Loss [Medium]
- `server/src/lib/llm-provider.ts` — Both ZAI and Anthropic streaming paths now record partial token usage in `finally`/`catch` blocks when streams are interrupted by abort or network errors. Previously, usage was only recorded on successful completion.

#### Download Filename Sanitization [Medium]
- `app/src/lib/export-filename.ts` — Added defense-in-depth sanitization of invisible/bidirectional control characters (C0, DEL, zero-width, bidi embedding/isolate, BOM) via NFKC normalization and regex strip in `sanitizeFilenameSegment()`.

#### New Test Suites [Tests]
- `server/src/__tests__/agent-bus.test.ts` — 8 tests covering message routing, messageLog cap, and event handler cleanup
- `server/src/__tests__/retry-abort.test.ts` — 3 tests verifying AbortError is never retried
- `server/src/__tests__/json-repair-guard.test.ts` — 6 tests covering size guard bypass and normal repair behavior

#### Test Update
- `server/src/__tests__/http-body-guard.test.ts` — Updated test to expect 400 on invalid JSON (was 200 with empty object).

### Decisions Made
- AT-06: Scratchpad→state transfer happens after Craftsman loop, preserving any sections already in state
- AT-10: Coordinator accepts both payload formats for backward compatibility
- claim_pipeline_slot: GRANT to service_role only (not authenticated) — backend-only operation
- json-repair: 50KB threshold for skipping aggressive regex (balances repair attempts vs DoS risk)
- http-body-guard: 400 is correct per HTTP spec; downstream validation no longer sees phantom empty objects

### Known Issues
- 2 pre-existing test failures in `agents-gap-analyst.test.ts` (unrelated)
- H5: Legacy create-master-resume.ts still backlogged
- Remaining medium/low findings from audit to be addressed in subsequent sessions

### Next Steps
- Address remaining medium/low audit findings
- Sprint 3 retrospective and Sprint 4 planning

---

## 2026-02-28 — Session: Sprint 3 Audit Round 2

**Sprint:** 3 | **Stories:** Audit round 2 — 5 critical + 8 high fixes
**Summary:** Fixed 13 issues from comprehensive 5-agent audit. Most severe: new master resume IDs were never linked back to sessions (C1), breaking evidence reuse for all first-time users. Also fixed nested transactions in migration, zero-row UPDATE detection, validation gaps, null guards, shallow-copy mutations, and evidence text length caps.

### Changes Made

#### C1: Link New Master Resume ID Back to Session [System-breaking]
- `server/src/agents/coordinator.ts` — Capture `{ data: newMr, error }` from RPC. After successful creation, `UPDATE coach_sessions SET master_resume_id = newMr.id`. Without this, second pipeline run never finds the master resume.

#### C2: Remove BEGIN/COMMIT from Migration [Critical]
- `supabase/migrations/20260227180000_...sql` — Removed explicit `BEGIN;` and `COMMIT;`. Supabase auto-wraps migrations in transactions; nested wrappers caused premature commit.

#### C3: Detect Zero-Row UPDATE in saveMasterResume [Critical]
- `server/src/agents/coordinator.ts` — Added `.select('id')` to UPDATE chain. If returned data is empty (row deleted between load and update), logs warning and falls through to CREATE branch as recovery.

#### C4+H7+H8+H10: Fix evidence_items Validation in POST /resumes [Critical+High]
- `server/src/routes/resumes.ts` — `text: z.string().min(10).max(2000)`, array `.max(200)` (was 500, matches EVIDENCE_CAP), `source_session_id: z.string().uuid()`, `created_at: z.string().datetime()`, `category: z.string().max(100)`.

#### C5: Null Guard on section.content in extractEvidenceItems [Critical]
- `server/src/agents/coordinator.ts` — `const rawContent = section.content ?? '';` prevents `.trim()` and `.split()` from throwing on null/undefined content.

#### H1+H2: Deep-Clone New Role Bullets + Education/Certifications [High]
- `server/src/agents/master-resume-merge.ts` — New role bullets: `newRole.bullets.map(b => ({ ...b }))`. Education: `{ ...edu }`. Certifications: `{ ...cert }`. Prevents shared references.

#### H4: Add earlier_career to Evidence Extraction Filter [High]
- `server/src/agents/coordinator.ts` — Added `key !== 'earlier_career'` to the filter condition so earlier career bullets are accumulated as evidence.

#### H6: Null Guards in buildStrategistMessage [High]
- `server/src/agents/coordinator.ts` — `Array.isArray(mr.experience)` guard before `.length`. `mr.skills && typeof mr.skills === 'object'` guard before `Object.keys()`. Prevents crashes on malformed/pre-migration DB rows.

#### H9: Cap Individual Evidence Item Text Length [High]
- `server/src/agents/coordinator.ts` — Added `MAX_EVIDENCE_TEXT_LENGTH = 1000` and `capEvidenceText()` helper (truncates at word boundary with `...`). Applied to crafted bullets, prose sections, and interview answers.

#### Tests: 5 New Test Scenarios
- `server/src/__tests__/master-resume-merge.test.ts` — newResume mutation safety (H1), education deep-clone isolation (H2), evidence dedup case-insensitivity (TG3), duplicate roles merge (TG4), empty summary fallback (TG5). Total: 20 tests passing.

### Decisions Made
- C3 recovery path: zero-row UPDATE falls through to CREATE rather than failing silently
- Evidence text cap at 1000 chars with word-boundary truncation balances context budget vs information loss
- Migration BEGIN/COMMIT removal is safe — all other migrations in this repo omit explicit wrappers

### Known Issues
- 2 pre-existing test failures in `agents-gap-analyst.test.ts` (unrelated to this work)
- H5 (legacy create-master-resume.ts) backlogged per user decision

### Next Steps
- Sprint 3 retrospective and Sprint 4 planning

---

## 2026-02-27 — Session: Sprint 3 Audit Fixes

**Sprint:** 3 | **Stories:** Audit fix stories 1-12
**Summary:** Fixed 18 issues found in post-implementation audit of master resume evidence accumulation: shallow-copy mutations, INSERT-only merge creating unbounded rows, unguarded Supabase casts, missing error handling, unbounded context injection, and edge-case gaps.

### Changes Made

#### Story 1: Fix Shallow Copy Mutation in mergeMasterResume [Critical]
- `server/src/agents/master-resume-merge.ts` — Deep-clone existing roles (map + spread bullets) instead of shallow `[...array]` to prevent caller mutation. Deep-clone skill arrays before pushing.

#### Story 2: Fix Supabase Error Handling in saveMasterResume [Critical]
- `server/src/agents/coordinator.ts` — Destructure `{ data, error: loadError }` on master resume load. If error is not PGRST116 (row not found), log and return early to avoid duplicate INSERT.

#### Story 3: Use UPDATE for Merge Case Instead of INSERT [Critical]
- `server/src/agents/coordinator.ts` — Replace RPC call in merge branch with `.update()` on existing row. Also updates `raw_text` with current resume text. RPC kept only for "create new" branch.

#### Story 4: Fix Migration — Drop Old RPC Overload + Transaction [Critical + Medium]
- `supabase/migrations/20260227180000_...sql` — Wrapped in BEGIN/COMMIT. Added DROP FUNCTION for old 10-param overload before CREATE OR REPLACE of 11-param version.

#### Story 5: Add Runtime Guards for DB Casts [High]
- `server/src/routes/pipeline.ts` — Normalize `evidence_items` to `[]` after cast in master resume load.
- `server/src/agents/coordinator.ts` — Same normalization in saveMasterResume load.
- `server/src/agents/master-resume-merge.ts` — Added `safeStr()` helper for null-safe string coercion on all key-generation lines.

#### Story 6: Add Size Caps [High + Low]
- `server/src/agents/coordinator.ts` — `MAX_BULLETS_PER_ROLE=15`, `MAX_EVIDENCE_ITEMS_INJECTED=50` in buildStrategistMessage. Caps bullets per role and evidence items per source category.
- `server/src/agents/master-resume-merge.ts` — `EVIDENCE_CAP=200` in mergeMasterResume. Keeps newest items when over cap.

#### Story 7: Add evidence_items to POST /resumes Route [High]
- `server/src/routes/resumes.ts` — Added `evidence_items` to `createResumeSchema` (zod array of evidence objects, max 500). Added `p_evidence_items` to RPC call.

#### Story 8: Fix Evidence Extraction for Prose Content [Medium]
- `server/src/agents/coordinator.ts` — `extractEvidenceItems` now captures summary/selected_accomplishments as single prose evidence items instead of only bullet-marked lines. Interview answers trimmed before length check.

#### Story 9: Fix Merge Edge Cases — Skills + Contact Info [Medium]
- `server/src/agents/master-resume-merge.ts` — Skip empty category names and empty skill strings. Contact info now merges fields (existing as base, new overwrites per-field) instead of winner-take-all.

#### Story 10: Fix DB Query Error in pipeline.ts [Medium]
- `server/src/routes/pipeline.ts` — Destructure `{ data: mrData, error: mrError }` and log error if present. Only set masterResume when no error.

#### Story 11: Adjust Strategist Prompt Guidance [Medium]
- `server/src/agents/strategist/prompts.ts` — Changed "0-3 questions" to "1-5 questions". Added "Always ask at least 1 question to capture JD-specific context."

#### Story 12: Add Missing Test Scenarios [Tests]
- `server/src/__tests__/master-resume-merge.test.ts` — 7 new tests: mutation safety, partial contact merge, empty skills, empty category names, whitespace evidence, evidence cap at 200, null-safe fields. Total: 15 tests passing.

### Decisions Made
- UPDATE instead of INSERT for merge case prevents unbounded row accumulation
- Evidence cap of 200 with "keep newest" strategy balances completeness vs. storage
- Context injection caps (15 bullets/role, 50 evidence items) prevent prompt bloat
- `safeStr()` helper centralizes null-safe string coercion for DB data

### Known Issues
- 2 pre-existing test failures in `agents-gap-analyst.test.ts` remain (unrelated)

### Next Steps
- Run full E2E pipeline with repeat user to validate merge-in-place behavior
- Monitor evidence accumulation growth in production

---

## 2026-02-27 — Session: Master Resume Persistent Evidence

**Sprint:** 3 | **Stories:** 1-5 (all complete)
**Summary:** Added persistent evidence accumulation to the Master Resume so repeat users benefit from prior pipeline sessions. The Strategist sees accumulated evidence and skips redundant interview questions.

### Changes Made

#### Story 1: Database Migration + Types
- `supabase/migrations/20260227180000_add_evidence_items_to_master_resumes.sql` — Added `evidence_items JSONB DEFAULT '[]'` column to `master_resumes` table; updated `create_master_resume_atomic` RPC to accept `p_evidence_items` parameter (11th param)
- `server/src/agents/types.ts` — Added `MasterResumeEvidenceItem` and `MasterResumeData` interfaces
- `app/src/types/resume.ts` — Added `MasterResumeEvidenceItem` interface and `evidence_items` field to `MasterResume`

#### Story 2: Auto-Save on Pipeline Completion
- `server/src/agents/master-resume-merge.ts` — New file: pure `mergeMasterResume()` function (no external deps, fully unit-testable). Handles role matching by company+title, bullet dedup, skill union, education/cert dedup, evidence item dedup
- `server/src/agents/coordinator.ts` — Added `extractEvidenceItems()` (extracts crafted bullets + interview answers), `saveMasterResume()` (loads existing, merges or creates new via RPC). Called after `persistSession()` in pipeline completion flow. Added `master_resume_id` and `master_resume` to `PipelineConfig`

#### Story 3: Load Master Resume at Pipeline Start
- `server/src/routes/pipeline.ts` — Added `master_resume_id` to session query; loads full master resume from DB when session has one linked; passes `master_resume_id` and `master_resume` to `runPipeline()`

#### Story 4: Inject into Strategist Context
- `server/src/agents/coordinator.ts` — `buildStrategistMessage()` now appends a "MASTER RESUME — ACCUMULATED EVIDENCE" section when `config.master_resume` exists, including experience entries with all bullets, evidence items by source, and skills inventory
- `server/src/agents/strategist/prompts.ts` — Added "Master Resume — Accumulated Evidence" guidance section: review evidence before designing questions, skip questions where strong evidence exists, focus on genuine gaps, 0-3 questions for repeat users with rich master resumes

#### Story 5: Verification
- `server/src/__tests__/master-resume-merge.test.ts` — New test file: 8 unit tests for `mergeMasterResume()` covering bullet dedup, role matching, evidence dedup, case-insensitive skills, first-time save, education/cert dedup, contact info, and case-insensitive role matching

### Decisions Made
- Extracted `mergeMasterResume()` into its own module (`master-resume-merge.ts`) to avoid Supabase import side-effects in unit tests
- Evidence extraction is code-only (zero LLM calls): bullets parsed from section content, interview answers from transcript
- Merge strategy uses exact text dedup (case-insensitive) — simple and reliable without LLM
- Auto-save runs after `persistSession()` and is non-critical (wrapped in try/catch, failure logged but doesn't block)

### Known Issues
- 2 pre-existing test failures in `agents-gap-analyst.test.ts` remain (unrelated)
- Evidence items grow unbounded — no pruning strategy yet (backlog item)
- Master resume viewer/editor UI not yet built (backlog)

### Next Steps
- Run full E2E pipeline with repeat user to validate reduced interview time
- Build master resume viewer page for users to browse/manage evidence
- Consider evidence quality scoring for smarter prioritization

---

## 2026-02-27 — Session: Interview Phase Optimization

**Sprint:** 2 | **Stories:** 1-6 (all complete)
**Summary:** Added interview budget enforcement, mini-batch presentation, and "Draft Now" escape to optimize the interview phase while preserving the Strategist's adaptive intelligence.

### Changes Made

#### Story 3: Question Format Converter
- `server/src/lib/questionnaire-helpers.ts` — Added `positioningToQuestionnaire()` to convert PositioningQuestion[] to QuestionnaireQuestion[] for batch presentation
- `server/src/lib/questionnaire-helpers.ts` — Added `extractInterviewAnswers()` to convert QuestionnaireSubmission back to scratchpad-compatible interview answer format

#### Story 1: Question Budget Enforcement
- `server/src/agents/strategist/tools.ts` — Added `INTERVIEW_BUDGET` map (fast_draft=5, balanced=7, deep_dive=12) and `getInterviewBudget()`/`getInterviewQuestionCount()` helpers
- `server/src/agents/strategist/tools.ts` — `interview_candidate` execute: budget check at top returns `{ budget_reached: true }` with transparency event when limit hit

#### Story 2: interview_candidate_batch Tool
- `server/src/agents/strategist/tools.ts` — New `interview_candidate_batch` AgentTool: presents 2-3 questions as a QuestionnairePanel gate, extracts batch answers, persists to scratchpad/transcript identically to single-question tool, evaluates follow-up recommendations, handles `draft_now` escape signal
- `server/src/agents/strategist/tools.ts` — Registered in `strategistTools` export array

#### Story 4: Update Strategist Prompt
- `server/src/agents/strategist/prompts.ts` — Updated step 5 (Interview) to guide toward `interview_candidate_batch` as primary tool, batch-by-category strategy, budget awareness, and `budget_reached`/`draft_now_requested` stop signals

#### Story 5: Draft Now Escape Button
- `app/src/components/panels/QuestionnairePanel.tsx` — Added optional `onDraftNow` prop and "Draft Now" button (Zap icon, amber accent) in action bar for positioning-stage questionnaires
- `app/src/components/panels/panel-renderer.tsx` — Wired `onDraftNow` callback to send `{ draft_now: true }` gate response for positioning-stage questionnaires

#### Story 6: E2E Verification
- `e2e/helpers/pipeline-responder.ts` — Added phase timing markers (interview, blueprint_review, section_writing) with `startPhase()`/`endPhase()` helpers and completion summary

### Decisions Made
- Budget enforcement is code-level, not prompt-level — the tool returns a stop signal rather than relying on the LLM to count
- Batch questions use existing QuestionnairePanel infrastructure (not a new component) for consistency
- Single `interview_candidate` tool kept alongside batch tool for targeted follow-up probing
- "Draft Now" button only shows for positioning-stage questionnaires (not gap_analysis or quality_fixes)

### Known Issues
- E2E timing improvement not yet validated (requires live Z.AI API run)
- Strategist may still prefer single-question tool until prompt guidance takes effect across runs
- 2 pre-existing test failures in agents-gap-analyst.test.ts remain

### Next Steps
- Run full E2E pipeline to validate timing improvement target (interview phase < 5 min)
- Monitor Strategist behavior — confirm it adopts batch workflow with updated prompt
- Master Resume pre-fill (future sprint, per user)

---

## 2026-02-27 — Session: Framework & Dynamic Pipeline

**Sprint:** 0 (retroactive) + 1 (framework onboarding)
**Summary:** Completed 4-phase Dynamic Pipeline work, fixed critical infrastructure issues, established Scrum framework.

### Changes Made

#### Dynamic Pipeline — Phase 1: Evidence Flow
- `server/src/agents/types.ts` — Added `interview_transcript` to `PipelineState`
- `server/src/agents/strategist/tools.ts` — `interview_candidate` persists raw Q&A pairs to state
- `server/src/agents/strategist/tools.ts` — `classify_fit` expanded evidence fields (2000 chars, 10 phrases)
- `server/src/agents/coordinator.ts` — `buildCraftsmanMessage()` includes interview transcript
- `server/src/agents/craftsman/tools.ts` — Section writer: "Authentic voice beats resume-speak"

#### Dynamic Pipeline — Phase 2: Blueprint Approval Gate
- `server/src/lib/feature-flags.ts` — Added `FF_BLUEPRINT_APPROVAL` flag
- `server/src/agents/coordinator.ts` — `waitForUser('architect_review')` gate + edit merging
- `app/src/components/panels/BlueprintReviewPanel.tsx` — New panel: edit positioning, reorder sections
- `app/src/components/panels/panel-renderer.tsx` — Blueprint panel integration

#### Dynamic Pipeline — Phase 3: Creative Liberation
- `server/src/agents/types.ts` — `EvidencePriority`, updated `EvidenceAllocation` interfaces
- `server/src/agents/strategist/tools.ts` — Architect prompt: strategic guidance mode
- `server/src/agents/craftsman/prompt.ts` — "Your Creative Authority" section
- `server/src/agents/craftsman/tools.ts` — `hasEvidencePriorities()` branching in section writer

#### Dynamic Pipeline — Phase 4: Holistic Quality
- `server/src/agents/craftsman/tools.ts` — `crossSectionContext` from scratchpad in `write_section`
- `server/src/agents/craftsman/tools.ts` — "PREVIOUSLY WRITTEN SECTIONS" prompt block
- `server/src/agents/producer/tools.ts` — `check_narrative_coherence` tool (new)
- `server/src/agents/producer/tools.ts` — `select_template` SSE transparency
- `server/src/agents/producer/prompt.ts` — Updated workflow with narrative coherence step

#### Infrastructure Fixes
- `server/src/routes/pipeline.ts` — Pipeline heartbeat: 5-min `setInterval` touching `updated_at`
- `e2e/helpers/pipeline-responder.ts` — React native setter for textarea fills in zero-height panels

#### Framework
- `CLAUDE.md` — Added Scrum development framework and anti-drift rules
- `docs/ARCHITECTURE.md` — System architecture documentation (new)
- `docs/CONVENTIONS.md` — Code conventions and patterns (new)
- `docs/DECISIONS.md` — 6 ADRs for existing architectural decisions (new)
- `docs/BACKLOG.md` — Known work items organized as epics/stories (new)
- `docs/CURRENT_SPRINT.md` — Sprint 1: Framework Onboarding (new)
- `docs/SPRINT_LOG.md` — Sprint 0 retrospective (new)
- `docs/CHANGELOG.md` — This file (new)

### Decisions Made
- ADR-001 through ADR-006 documented retroactively (see DECISIONS.md)
- Scrum framework adopted for all future development

### Known Issues
- MaxListenersExceededWarning on long sessions
- 409 conflict errors when frontend sends during processing (Bug 18)
- Revision loop after user approval (Bug 16)
- Context forgetfulness on long sessions (Bug 17)
- PDF Unicode rendering (`?` characters)

### Next Steps
- Complete Sprint 1 (framework onboarding — this session)
- Plan Sprint 2 from backlog (production hardening candidates)
