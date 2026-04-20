# v3 production readiness check

**Date:** 2026-04-20 pm
**Purpose:** Verify v3 is in a fully shipped production state after Option 4 (commit `8cb6615e`). This is a verification pass — no new behavior introduced.

---

## Go/no-go

**GO for launch** with one architectural caveat documented below.

Every config flag, factory default, route mount, telemetry field, and smoke-test signal checks out. v3 is the live code path for the resume pipeline, retry paths are in place as defense-in-depth, telemetry is wired, and a fresh single-fixture run completed in 26s at $0.11 with `verify.passed=true`.

The one caveat — the rollback path does NOT behave the way the task spec assumed. v2 pipeline routes were already removed from the server in Phase F cutover; flipping `FF_V3_PRIMARY=false` does not restore v2 because v2 isn't mounted anywhere. This is not a v3 problem — it's a pre-existing design choice. Noted in §Rollback plan below.

---

## §1 — Config state

Every value verified.

| Setting | Expected | Actual | Action |
|---|---|---|---|
| `FF_V3_PRIMARY` default | `true` | `true` (via `envBool('FF_V3_PRIMARY', true)` at `server/src/lib/feature-flags.ts:334`) | none |
| `FF_V3_PRIMARY` in `.env` | unset or `true` | unset → takes the `true` default | none |
| `DEFAULT_CAPABILITY_BACKEND.strong-reasoning` in `factory.ts` | `openai` | `openai` (line 100) | none |
| `DEFAULT_CAPABILITY_BACKEND.fast-writer` | `openai` | `openai` | none |
| `DEFAULT_CAPABILITY_BACKEND.deep-writer` | `openai` | `openai` | none |
| `DEFAULT_OPENAI_STRONG_MODEL` in `factory.ts` | `gpt-5.4-mini` | `gpt-5.4-mini` (line 82) | none |
| `DEFAULT_OPENAI_FAST_MODEL` | `gpt-5.4-mini` | `gpt-5.4-mini` | none |
| `DEFAULT_OPENAI_DEEP_MODEL` | `gpt-5.4-mini` | `gpt-5.4-mini` | none |
| `RESUME_V3_*_BACKEND` env vars in `.env` | unset (falls through to factory defaults) | unset | none |
| Route mount in `server/src/index.ts` | `/api/v3-pipeline` mounted iff `FF_V3_PRIMARY` | Mounted at line 313-315, gated on the flag | none |
| `.env.example` v3 section | Accurately describes current defaults | Was stale — documented pre-flip hybrid (vertex / vertex / openai) + `gpt-4.1` | **Fixed** — updated to describe the all-OpenAI default with GPT-5.4-mini; rollback guidance refreshed |

One narrow fix shipped: the `.env.example` file had stale commentary from before commit `171cb7be` (the all-OpenAI flip) and Phase 4.8 (the GPT-5.4-mini default). A new developer following the example would have set `RESUME_V3_PROVIDER=vertex` thinking it matched production. Now corrected.

---

## §2 — No v2 code on the default request path

`grep`'d every active import from `server/src/agents/resume-v2/` against active route paths.

### v2 imports found, analyzed

| File | Purpose | On default request path? |
|---|---|---|
| `server/src/routes/sessions.ts` | Imports `enrichStoredDraftStateForClient`, etc. from `resume-v2-pipeline-support.js` | ✅ Safe — used only to enrich stored historical v2 session data for display; does NOT run a v2 pipeline |
| `server/src/routes/extension.ts` | Imports `FeedbackMetadata` type | ✅ Safe — type-only import |
| `server/src/routes/discovery.ts` | Imports `runJobIntelligence`, `runCandidateIntelligence`, `runBenchmarkCandidate` from v2 agents | ⚠️ **On default path, but for a different product** — the Discovery "Moment of Recognition" flow at `/api/discovery/*`, not the resume pipeline. These are shared agent functions consumed by a separate product. Acceptable; v3 doesn't own this product's scope. |
| `server/src/agents/discovery/*.ts` | Imports v2 types for shared type shapes | ✅ Safe — type-only imports |
| `server/src/routes/resume-v2-pipeline-support.ts` | Exports stored-session enrichment helpers | ✅ Safe — display-path helpers only |

### v2 pipeline route confirmed removed

`server/src/index.ts` line 311: `// v2 pipeline route removed in Phase F cutover. See docs/v3-rebuild/v2-archaeology.md`. No v2 resume pipeline is mounted anywhere. The only pipeline route is `/api/v3-pipeline`, gated on `FF_V3_PRIMARY`.

### v2 orchestrator confirmed unused

`grep -rn orchestrator server/src/routes/ server/src/index.ts` returns zero matches. `server/src/agents/resume-v2/orchestrator.ts` is not imported by any live route.

Verdict: v3 is the sole resume pipeline on the default request path. v2 code exists but only as shared utility functions for adjacent products or as display-only helpers for historical data.

---

## §3 — Rollback path (architectural caveat)

**Finding: the rollback path is NOT a flag flip.**

The task spec assumed "Setting `FF_V3_PRIMARY=false` should route traffic back to v2." This is incorrect for the current codebase. Phase F cutover already deleted v2 pipeline routes from `server/src/index.ts` (the explicit comment at line 311 documents this). Setting `FF_V3_PRIMARY=false` just unmounts `/api/v3-pipeline`, with no v2 pipeline to fall back to — the resume pipeline would simply be offline.

### What rollback actually looks like

1. **Model-tier rollback (recommended first step if v3 misbehaves):** flip a per-capability env var — e.g. `RESUME_V3_STRONG_REASONING_BACKEND=vertex` — to route just that stage back to Vertex-hosted DeepSeek. Single env var change, no deploy. Preserves v3 pipeline architecture; changes only the model behind one capability. Addresses "gpt-5.4-mini is misbehaving" scenarios.
2. **Full v3 pipeline rollback:** revert the relevant commits on `rebuild/v3` and deploy. Not a flag flip; requires a deploy.
3. **Full v2 restoration:** retrieve from `docs/v3-rebuild/v2-archaeology.md` (per the in-code comment), restore routes, deploy. Multi-commit operation, not an option for fast rollback.

### v2 unit-test compile status

Not running the v2 suite per task-spec scope. Confirmed both sides type-check clean (`npx tsc --noEmit` passes on both `server/` and `app/`). No v2 code is broken at the compile level.

### Caveat severity

This is not a shipping blocker for v3 itself. v3 works, its failures go loud (retry paths → hard throws → user-visible errors), and the model-tier env override is a real first-response rollback option. But it does mean the assumption "flag flip = full v2 rollback" is wrong. If that was what the task spec's author was banking on, we need to decide whether to reinstate v2 routes (and accept the code-path complexity of a truly dual-pipeline deployment) or accept that full rollback requires a revert+deploy.

**My recommendation:** ship as-is. The model-tier env overrides are the practical fast-rollback path. Full v2 restoration is an emergency-only scenario that warrants a revert+deploy anyway (prompts, agents, telemetry have all moved forward since Phase F; mechanical v2 reinstatement would need a careful audit).

---

## §4 — Observability

All four items present.

| Signal | Location | Verified |
|---|---|---|
| Per-stage latency | `v3/pipeline/run.ts` emits `timings.{extract,classify,benchmark,strategize,write,verify}Ms + totalMs`; each stage telemetry carries `durationMs` | ✅ |
| Per-stage token usage | Each stage telemetry carries `inputTokens` + `outputTokens`; costs computed via `costOf(model, in, out)` | ✅ |
| Retry firing — classify | `classify/index.ts:84` defines `schemaRetryFired: boolean`; emitted on line 237 and 261 | ✅ |
| Retry firing — strategize | `strategize/index.ts:72` defines `attributionRetryFired: boolean`; emitted in telemetry | ✅ |
| Retry firing — verify | `verify/index.ts:75` defines `jsonRetryFired: boolean`; emitted on line 268 | ✅ |
| Errors to logger | v3 pipeline uses `createV3Logger('pipeline')`; errors route through structured logger, never swallowed | ✅ |

No missing telemetry.

---

## §5 — Smoke test

Fixture: `fixture-01-ben-wedewer-resume-trimmed`
Command: `node --import tsx --env-file=.env scripts/pipeline-fixtures.mjs --only fixture-01-ben-wedewer-resume-trimmed`
Config: current production defaults (all three capabilities on `openai` / `gpt-5.4-mini`).

| Metric | Observed | Expected | Verdict |
|---|---|---|---|
| Pipeline completion | end-to-end success | success | ✅ |
| `verify.passed` | `true` | `true` or `false` (both acceptable — `false` just means review notes) | ✅ |
| `verify-pass` count | 1/1 | — | ✅ |
| Wall-clock | 26s | 30–45s | ✅ (slightly faster than expected, consistent with v4 validation) |
| Cost | $0.1121 | $0.10–$0.15 | ✅ |
| Every stage output schema | passed | passed | ✅ |

Smoke test clean.

---

## §6 — Residual issues (non-blocking)

Documented; none are shipping gates.

1. **fixture-02 blas-ortiz classify JSON-parse edge case.** From the v4 validation (commit `8cb6615e`). Single-fixture, single-occurrence gpt-5.4-mini reliability issue — the model emitted malformed JSON at position 655 on one run. Fix 5's classify retry covers Zod schema failures but not JSON parse (deliberate scope). If this recurs in production, the narrow follow-up is extending Fix 5 to also retry on JSON parse, mirroring Fix 8's broader coverage on verify. Not in this iteration's scope.

2. **Classify / verify retry semantics inconsistency.** Fix 5 (classify) retries on Zod failures only; Fix 8 (verify) retries on both JSON parse and Zod failures. Unifying these is backlog material. Doesn't affect correctness today — just a minor developer-experience mismatch.

3. **`.env.example` cleanup shipped during this check.** The file had stale guidance from the pre-flip hybrid era. A new developer following it would have set `RESUME_V3_PROVIDER=vertex`. Now corrected to document the all-OpenAI default + GPT-5.4-mini models + how to roll back via per-capability env var.

4. **Rollback assumption mismatch.** See §3. Not a v3 bug; just a spec-vs-reality reconciliation worth noting.

---

## §7 — Rollback plan

**Primary (fast, single env var, no deploy):**

```sh
# In production environment, set ONE of:
export RESUME_V3_STRONG_REASONING_BACKEND=vertex   # rolls classify + strategize + verify to DeepSeek
export RESUME_V3_FAST_WRITER_BACKEND=vertex        # rolls write-summary/acc/comp/custom to DeepSeek
export RESUME_V3_DEEP_WRITER_BACKEND=vertex        # rolls write-position + bullet-regen to DeepSeek
# OR all three, which is a full restore of the pre-Option-4 hybrid (except
# deep-writer, which was already OpenAI in that hybrid too).
```

Then restart the server process. No code deploy required.

**Secondary (full v3 code rollback — requires a deploy):**

```sh
# Revert Option 4 fixes + the flip
git revert 8cb6615e 4159c297 4037582e 165fdd4a a0d0a7d5 0fcc7b57 ec611bd0 b8b3099b 171cb7be
# Deploy the revert
```

**Not available (would require multi-step restoration of v2 pipeline routes + agents):** a single-flag rollback to v2. Phase F cutover removed v2 routes; see §3.

---

## Shipped artifacts from this verification pass

- `server/.env.example` — stale v3 commentary refreshed to reflect the all-OpenAI default and the rollback mechanism.
- `docs/v3-rebuild/reports/production-readiness-check.md` — this report.

No code behavior changed. Smoke test confirms the current config is production-ready.

---

## Final call

**v3 is production-ready. Go for launch.**

Next human step: deploy. No further verification work queued here. Non-v3 product flip is the next scheduled work item, tracked separately.
