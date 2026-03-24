# CareerIQ Platform — Static Code Analysis Report

**Date:** 2026-03-11
**Scope:** `server/src/` and `app/src/`
**Exclusions:** `*.test.ts`, `*.spec.ts`, `*.test.tsx`, `*.spec.tsx`, `node_modules`
**Auditor:** QA Agent

---

## Overview

The codebase is in good shape by the metrics that matter most: zero `any` types in server code, zero `console.log` in server production code, zero hardcoded secrets. The Pino logger abstraction is consistently applied on the server side.

The primary areas to address are stale-closure density in `useAgent.ts`, two orphaned library modules, and three agent-first architecture violations in `lib/` that should be promoted to sprint stories.

---

## 1. `console.log` in Production Code

**Total occurrences:** 1 `console.log` in production code.

**Severity: Low**

### Server (`server/src/`)

0 `console.log` occurrences. The server correctly uses the Pino `logger` abstraction everywhere.

### App (`app/src/`)

1 `console.log` occurrence:

- `/Users/johnschrup/resume-agent/app/src/hooks/useSSEEventHandlers.ts:541` — wrapped in `if (data.duration_ms && import.meta.env.DEV)`, so it is development-only and will not appear in production builds. Acceptable as-is.

### Notable Pattern

`console.error` is used in 27 app files (68 total occurrences). These are almost exclusively in SSE stream error handlers (`useCoverLetter`, `useSSEConnection`, `useExecutiveBio`, etc.). This is a structurally reasonable pattern for surfacing unhandled fetch/stream errors to the browser console, but there is no central error telemetry integration at these callsites. In production, these errors are silent to ops.

### Assessment

The `console.log` situation is clean. The `console.error` count is high but structurally reasonable — each is an error path, not a debug trace. The gap is that none of these `console.error` calls feeds Sentry or a structured telemetry channel. That is a Medium technical debt item, not a critical bug.

---

## 2. TODO / FIXME / HACK Comments

**Total occurrences:** 4 (all in server; 0 in app)

**Severity: Medium**

| File | Line | Comment |
|------|------|---------|
| `/Users/johnschrup/resume-agent/server/src/lib/ni/boolean-search.ts` | 7 | `TODO: The LLM extraction step should become a generate_boolean_search agent tool` |
| `/Users/johnschrup/resume-agent/server/src/lib/ni/boolean-search.ts` | 20 | `TODO: When migrated to agent tool, replace this in-memory store with a [persistent store]` |
| `/Users/johnschrup/resume-agent/server/src/lib/job-search/ai-matcher.ts` | 174 | `TODO: This scoring logic should become a score_jobs_against_profile agent tool` |
| `/Users/johnschrup/resume-agent/server/src/routes/coach.ts` | 68 | `TODO: Consider adding a 30-60s per-user TTL cache for loadClientSnapshot` |

### Assessment

All four TODOs are architectural improvement notes, not broken functionality. The first three are explicitly flagged agent-first violations — procedural code in `lib/` that should be agent tools. These align directly with the CLAUDE.md mandate: "build procedural pipelines where an agent could own the work" is prohibited. They should be promoted to backlog stories. The cache TODO in `coach.ts` is a performance observation.

No FIXMEs or HACKs were found anywhere in the codebase.

---

## 3. `any` Types in TypeScript

**Total occurrences:** 2 (both in `app/src/`; 0 in `server/src/`)

**Severity: Low**

| File | Line | Usage |
|------|------|-------|
| `/Users/johnschrup/resume-agent/app/src/hooks/useSSEEventHandlers.ts` | 799 | `(window as any).__qualityScores__ = scores` |

The server has zero `any` usages in production code. The app has one `as any` cast. It is wrapped in a `DEV`-only guard (`import.meta.env.DEV && typeof window !== 'undefined'`) and exists specifically to expose quality scores on `window` for E2E test capture, because the quality dashboard panel is transient. A test file confirms this expectation at line 867.

### Assessment

The `as any` is intentional and documented. The DEV guard prevents it running in production. However, it would be cleaner to define `interface Window { __qualityScores__?: QualityScores }` in a `.d.ts` file to remove the cast entirely. This is Low severity technical debt.

---

## 4. `eslint-disable` Directives

**Total occurrences:** 30 (1 server production, 4 server test-only, 25 app production)

**Severity: Medium**

### Server Production (1 occurrence)

| File | Line | Directive | Reason |
|------|------|-----------|--------|
| `/Users/johnschrup/resume-agent/server/src/agents/runtime/product-coordinator.ts` | 252 | `eslint-disable-next-line no-constant-condition` | `while (true)` gate loop with explicit break conditions |

This is legitimate. The gate loop at line 253 has a `MAX_GATE_RERUNS` bound and an abort-signal break at the top of every iteration. The suppress is justified.

### App Production (25 occurrences)

All 25 app suppressions are `react-hooks/exhaustive-deps`. They are distributed across:

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

### Assessment

The `react-hooks/exhaustive-deps` suppressions are the dominant pattern. Many are legitimately intentional — hooks that use refs (stable identity) or explicitly want mount-only effects. However, 9 suppressions in `useAgent.ts` alone is a concentration risk. Each suppression is a potential stale-closure bug waiting to manifest when the surrounding code changes. `useAgent.ts` is the most critical path in the entire frontend and warrants a dedicated audit story.

---

## 5. Hardcoded Secrets / Credentials

**Severity: Low (no critical findings)**

### Findings

**Hardcoded test credentials in non-test files:** None found. `jjschrup@yahoo.com` / `Scout123` do not appear in any production source file.

**Hardcoded `localhost` in server production code:** 3 occurrences, all legitimate:

- `/Users/johnschrup/resume-agent/server/src/index.ts:74` — CORS allowlist for dev origins. Correctly gated as the non-production branch of a conditional.
- `/Users/johnschrup/resume-agent/server/src/index.ts:412` — `logger.info` startup message. No security impact.
- `/Users/johnschrup/resume-agent/server/src/routes/billing.ts:96,295` — Fallback `origin` value used when `origin` header is absent.

**Hardcoded `localhost` in app production code:** None. All app localhost references are inside test files.

**API keys / secrets in source:** None found. All sensitive values reference `process.env.*` or `import.meta.env.*`.

### Notable Finding: Billing Route Localhost Fallback

```
/Users/johnschrup/resume-agent/server/src/routes/billing.ts:96
const origin = c.req.header('origin') ?? 'http://localhost:5173';
```

This pattern appears twice. If this route is hit in production without an `Origin` header (e.g., server-side curl, misconfigured proxy), the Stripe success/cancel redirect URLs would be `http://localhost:5173/...`. Stripe would redirect the user to their own machine. This is a Medium severity issue — it requires a missing-header scenario to trigger, but the consequence (broken checkout flow in production) would be confusing to both users and ops. This issue is also tracked as ROUTE-M4 in the Route Security audit.

---

## 6. Unused Exports (Sample Check)

**Files sampled from `server/src/lib/`:** `affiliates.ts`, `cognitive-reframing.ts`, `draft-readiness-compat.ts`, `workflow-nodes.ts`, `sleep.ts`, `planner-handoff.ts`

**Severity: Medium (2 confirmed orphan modules)**

| Module | Exported Symbols | Imported Elsewhere | Status |
|--------|------------------|--------------------|--------|
| `affiliates.ts` | `resolveReferralCode`, `trackReferralEvent`, `getAffiliateByUserId`, `getAffiliateStats` | `routes/affiliates.ts`, `lib/billing-service.ts` | Used |
| `cognitive-reframing.ts` | `detectStalls`, `generateCoachingMessage`, `StallSignal`, `StallTriggerType` | No production imports found | **Orphaned** |
| `draft-readiness-compat.ts` | `normalizeCoverageOnlyReadiness`, `normalizeDraftPathDecisionCompat`, `buildCoverageOnlyDraftPathDecisionMessage` | No production imports found | **Orphaned** |
| `workflow-nodes.ts` | `WORKFLOW_NODE_KEYS`, `WorkflowNodeKey`, `workflowNodeFromStage` | `routes/workflow.ts`, `agents/resume/event-middleware.ts`, `lib/workflow-persistence.ts` | Used |
| `planner-handoff.ts` | `matchPlanners`, `updateReferralStatus`, `getUserReferrals` | `routes/planner-handoff.ts`, `lib/planner-handoff-service.ts` | Used |

### Confirmed Orphan: `cognitive-reframing.ts`

The module exports `detectStalls` and `generateCoachingMessage`. Searching the entire `server/src/` tree finds zero production imports. It is only referenced by its own file name in comments. The module imports `supabaseAdmin`, `llm`, and `emotional-baseline` — it is a real implementation that was built but never wired to a route or scheduled job. This is dead code producing a maintenance burden.

### Confirmed Orphan: `draft-readiness-compat.ts`

The module exports three normalization functions. Searching the entire `server/src/` tree finds zero production imports. The module exists only as a test target (`__tests__/draft-readiness-compat.test.ts`). The module appears to have been a migration compatibility shim that was never integrated into the live codepath.

**Action Required:** Either connect these modules to a live codepath or delete them.

---

## 7. Zod Schema Drift

**Pairs checked:** `planner-handoff` (server schema vs `usePlannerHandoff.ts`), `cover-letter/start` (server schema vs `useCoverLetter.ts`), `resume-pipeline/start` (server schema vs frontend call site)

**Severity: Low (1 minor finding)**

### Planner Handoff: Clean

The server `referSchema` requires `career_situation` and `transition_context` as optional string fields (max 2000 chars). The `usePlannerHandoff.ts` `selectPlanner` call omits both fields entirely — it sends only `user_id`, `planner_id`, `opt_in`, `asset_range`, `geography`. Since both server fields are `.optional()`, this is valid. The frontend never surfaces UI for entering career situation or transition context, which means those server fields are permanently unpopulated in practice. This is a feature gap, not a schema error.

### Cover Letter: Clean

The server `startSchema` requires `session_id`, `resume_text`, `job_description`, `company_name`. The `useCoverLetter.ts` hook connects via SSE stream and handles all recognized server event types. No drift detected.

### Resume Pipeline: Clean

The server `startSchema` requires `session_id`, `raw_resume_text`, `job_description`, `company_name` with optional `workflow_mode`, `minimum_evidence_target`, `resume_priority`, `seniority_delta`. No drift was found at the schema boundary.

### Minor Finding: `usePlannerHandoff` `matchSchema` Omits `specializations`

The server `matchSchema` accepts an optional `specializations: z.array(z.string()).max(10)` field. The `usePlannerHandoff.ts` match call sends only `{ geography, asset_range }` — `specializations` is never populated. This is not breaking (field is optional), but the filtering capability is permanently bypassed by the frontend. If planner matching quality depends on specialization filtering, this is a functional gap worth addressing.

---

## Summary Table

| Category | Severity | Count | Action Required |
|----------|----------|-------|-----------------|
| `console.log` in production | Low | 1 (dev-guarded) | None |
| `console.error` without telemetry | Medium | 68 | Backlog: wire to Sentry |
| TODO/FIXME/HACK | Medium | 4 | 3 are agent-first violations — promote to stories |
| `any` types | Low | 1 (dev-guarded) | Add `Window` type declaration |
| `eslint-disable` in production | Medium | 25 app (all `react-hooks/exhaustive-deps`) | Audit `useAgent.ts` suppressions (9 of 25) |
| Hardcoded localhost (billing fallback) | Medium | 2 occurrences | Add env-var guard on Stripe origin |
| Orphaned modules | Medium | 2 confirmed | Delete or connect `cognitive-reframing.ts`, `draft-readiness-compat.ts` |
| Zod schema drift | Low | 1 functional gap | `specializations` never sent to match endpoint |

**Total: 0 Critical, 0 High, 6 Medium, 3 Low**

---

## Overall Assessment

**What is clean:**

- Zero `any` types in server production code
- Zero `console.log` in server production code
- Zero hardcoded secrets anywhere
- Pino logger abstraction consistently applied server-side
- No FIXMEs or HACKs in the codebase

**Top priorities:**

1. **`useAgent.ts` eslint-disable density** — 9 stale-closure suppressions on the most critical frontend hook. Schedule a dedicated audit story.
2. **Two orphaned lib modules** — `cognitive-reframing.ts` and `draft-readiness-compat.ts` are built, tested, and unwired. Either connect them or delete them.
3. **Three agent-first TODOs** — The `boolean-search.ts` and `ai-matcher.ts` TODOs are explicit acknowledgments that procedural code exists where agent tools should be. These should be sprint stories.
4. **Billing localhost fallback** — Low probability but high-confusion impact if triggered in production. Pair the fix with ROUTE-M4.

---
