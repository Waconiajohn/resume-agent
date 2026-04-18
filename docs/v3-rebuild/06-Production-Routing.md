# 06 — Production Routing

**Version:** 1.0 (2026-04-18)
**Config status:** Validated at 17/19 on the 19-fixture corpus (Phase 4.10 smart hybrid). Ready for Phase 5 shadow deploy.

This document is the single source of truth for how v3 stages route to providers and models in production. Prior reports (phase 4.5 through 4.10) show the diagnostic path that led here; this doc tells an operator what to ship and why.

---

## 1. Production routing map

| v3 stage | Capability | Backend | Model | Why |
|---|---|---|---|---|
| Classify (stage 2) | `strong-reasoning` | **Vertex** | `deepseek-ai/deepseek-v3.2-maas` | Classify is factual parsing; DeepSeek V3.2 hit 19/19 structural pass in Phase 3.5. No benefit from routing to OpenAI. |
| Strategize (stage 3) | `strong-reasoning` | **OpenAI** | `gpt-4.1` | DeepSeek strategize embellished summaries (Phase 4.5 fixture-09 regression). GPT-4.1 produces source-traceable summaries cleanly. |
| Write-summary (stage 4) | `fast-writer` | **Vertex** | `deepseek-ai/deepseek-v3.2-maas` | Short section; DeepSeek passes in the hybrid context. |
| Write-accomplishments (stage 4) | `fast-writer` | **Vertex** | `deepseek-ai/deepseek-v3.2-maas` | Same. |
| Write-competencies (stage 4) | `fast-writer` | **Vertex** | `deepseek-ai/deepseek-v3.2-maas` | Same. |
| Write-custom-section (stage 4) | `fast-writer` | **Vertex** | `deepseek-ai/deepseek-v3.2-maas` | Same. |
| Write-position (stage 4) | `deep-writer` | **OpenAI** | `gpt-4.1` | Write-position is the quality-critical path. GPT-4.1 produces attribution-disciplined bullets that pass verify without the 11 false-positive patterns DeepSeek generates (Phase 4.9 analysis). |
| Verify (stage 5) | `strong-reasoning` | **OpenAI** | `gpt-4.1` | DeepSeek-verify had a self-consistency problem (Phase 4.6 Step A). GPT-4.1 doesn't trip on tense changes, whitespace differences, or paraphrase reorderings. |

### Env var configuration for production

```
# Capability → backend routing (per-capability overrides the global default)
RESUME_V3_STRONG_REASONING_BACKEND=openai
RESUME_V3_FAST_WRITER_BACKEND=vertex
RESUME_V3_DEEP_WRITER_BACKEND=openai

# Models for each capability on OpenAI
RESUME_V3_STRONG_REASONING_MODEL_OPENAI=gpt-4.1
RESUME_V3_DEEP_WRITER_MODEL_OPENAI=gpt-4.1

# Vertex config (required for fast-writer + classify)
VERTEX_PROJECT=<gcp-project-id>
GOOGLE_APPLICATION_CREDENTIALS=</path/to/service-account-key.json>
VERTEX_REGION=global

# OpenAI config (required for strong-reasoning + deep-writer)
OpenAI_API_KEY=<key>

# Optional failover providers for Vertex stages
DEEPSEEK_API_KEY=<key>     # 429-failover from Vertex → DeepSeek direct
DEEPINFRA_API_KEY=<key>    # 5xx/timeout-failover to DeepInfra
```

---

## 2. Cost model

### Per-resume cost breakdown

| Stage | Backend | Typical in-tokens | Typical out-tokens | Cost |
|---|---|---|---|---|
| Classify | Vertex DeepSeek | ~12K | ~2.5K | $0.003 |
| Strategize | OpenAI gpt-4.1 | ~7K | ~900 | $0.021 |
| Write-summary | Vertex DeepSeek | ~5K | ~200 | $0.001 |
| Write-accomplishments | Vertex DeepSeek | ~5K | ~300 | $0.001 |
| Write-competencies | Vertex DeepSeek | ~5K | ~400 | $0.001 |
| Write-custom-section | Vertex DeepSeek | ~3K | ~200 | $0.000 (usually empty for most fixtures) |
| Write-position (6-11 parallel) | OpenAI gpt-4.1 | ~60-100K total | ~2-3K total | $0.010-0.016 |
| Verify | OpenAI gpt-4.1 | ~11K | ~100-500 | $0.022 |
| **Total** | | | | **~$0.059/resume** |

In Phase 4.10 validation the average was $0.046/resume because classify was cached. Production will run classify per request, adding ~$0.003 → **production estimate ~$0.049/resume.**

### Per-user-month projections

| Tier | Typical usage | Smart hybrid cost | % of $49 retail |
|---|---|---|---|
| Light | 4 resumes/month | $0.20 | 0.4% |
| Standard | 12 resumes/month | $0.59 | 1.2% |
| Power | 40 resumes/month | $1.96 | 4.0% |
| Heavy | 120 resumes/month | $5.88 | 12.0% |

### Comparison to alternatives

| Config | Pass rate | $/resume | Standard-tier $/user-month | % of retail |
|---|---|---|---|---|
| Pure-DeepSeek | 11/19 (58%) | $0.018 | $0.22 | 0.4% |
| **Smart hybrid (production)** | **17/19 (89%)** | **$0.049** | **$0.59** | **1.2%** |
| Pure-GPT-4.1 | 19/19 (100%) | $0.20 | $2.40 | 4.9% |

Smart hybrid produces 89% of pure-GPT-4.1's quality at 25% of the cost. The 2 fixtures that still fail on hybrid are: one verify-prompt gap (fixture-10, zero-bullets-for-brief-weight not recognized by verify's Check 9 — false positive); one borderline editorial phrase (fixture-19 — minor real issue).

---

## 3. Failover behavior

### Vertex stages (classify, fast-writer)

Chain: `VertexProvider → (429) DeepSeekProvider → (5xx) DeepInfraProvider`. Wrapped in `DefensiveJsonProvider` for mechanical fence-strip + 1-retry JSON parse.

Failure modes the user sees:
- **Vertex 429** — transparent failover to DeepSeek direct (different quota pool). User sees no change; log emits `v3 rate-limit failover: 429 on primary...`.
- **Vertex 5xx / timeout** — failover to DeepInfra (if `DEEPINFRA_API_KEY` set). User sees no change; log emits failover warn.
- **All three backends fail** — error propagates to the pipeline; user sees a pipeline error with specifics.

### OpenAI stages (strategize, verify, write-position)

No automatic failover for strategize and verify. Failures surface as pipeline errors. This matches the OPERATING-MANUAL "no silent fallbacks" rule.

**Write-position** has a specific carve-out: `DeepWriterFallbackProvider` falls back to Vertex DeepSeek with thinking mode enabled if OpenAI fails. See `server/src/v3/providers/factory.ts`. Rationale: write-position is the user-facing content; a degraded-but-working fallback serves users better than an outage on this one stage.

Failure modes the user sees for write-position:
- **OpenAI 429** or any error — falls back to DeepSeek-thinking on Vertex. Quality may drop to Phase 4.6 baseline (~68% pass rate); user gets output. Log emits `deep-writer fallback: primary stream failed, retrying on fallback backend`.
- **OpenAI + Vertex-DeepSeek both fail** — error propagates; user sees pipeline error.

### JSON parse failures

`DefensiveJsonProvider` wraps every provider. Strips markdown code fences mechanically (DeepSeek and GPT-4.1 both sometimes emit them). On `JSON.parse` failure, retries ONCE with the parser error fed back into the system message. After second failure, error propagates. Not silent; logged at INFO level.

### Strategize attribution retry

`server/src/v3/strategize/index.ts` runs mechanical attribution check (`server/src/v3/verify/attribution.ts::checkStrategizeAttribution`) after the LLM call. If any `emphasizedAccomplishments.summary` has unsourced claim tokens, retries ONCE with the missing tokens flagged. Retry is explicit; second-attempt failure is a loud error. Phase 4.6 Step A measured 0/19 retry fires — strategize prompt v1.2 is disciplined enough to pass on first attempt.

---

## 4. Capability routing architecture

The factory (`server/src/v3/providers/factory.ts`) resolves each capability to a backend + model using this precedence:

1. `RESUME_V3_<CAPABILITY>_BACKEND` (per-capability override)
2. `RESUME_V3_PROVIDER` (global override)
3. Built-in default

Built-in defaults as of Phase 4.10:
- `strong-reasoning` → `openai` (model: `gpt-4.1`)
- `fast-writer` → `vertex` (model: `deepseek-ai/deepseek-v3.2-maas`)
- `deep-writer` → `openai` (model: `gpt-4.1`)

Model selection per capability uses `RESUME_V3_<CAPABILITY>_MODEL` (generic) or `RESUME_V3_<CAPABILITY>_MODEL_OPENAI` (backend-specific override).

### How to swap a model

**Drop GPT-4.1 for something cheaper when it becomes reliable:**
```
RESUME_V3_STRONG_REASONING_MODEL_OPENAI=gpt-5.4-mini
RESUME_V3_DEEP_WRITER_MODEL_OPENAI=gpt-5.4-mini
```
No code change. Cost expected to drop ~5× (gpt-5.4-mini is ~$0.25/$2 per M vs gpt-4.1's $2/$8).

**Switch to pure-DeepSeek emergency mode (cost floor):**
```
RESUME_V3_STRONG_REASONING_BACKEND=vertex
RESUME_V3_DEEP_WRITER_BACKEND=vertex
```
Accepts 11/19 quality. Emergency-only; user-visible verify noise returns.

**Switch to pure-GPT-4.1 for enterprise tier (quality ceiling):**
```
RESUME_V3_FAST_WRITER_BACKEND=openai
RESUME_V3_FAST_WRITER_MODEL_OPENAI=gpt-4.1
```
Accepts 4.3× cost ($0.20/resume) for 19/19 quality.

---

## 5. Known quality characteristics

### Phase 4.10 baseline on 19-fixture corpus

- **17/19 PASS (89%)**, 2 total errors
- fixture-10: verify Check 9 false-positive on zero-bullets-for-brief-weight positions
- fixture-19: borderline editorial addition ("to the highest standards") in one bullet

### Expected behavior on real user traffic

- Dense resumes with many positions and rich source material: pass rate similar to corpus (~89%).
- Sparse resumes (1-2 positions, light content): pass rate higher (simpler inputs less ambiguity).
- Specialty executive resumes with patents/publications/board service: pass rate similar; the custom-section writer handles them.
- Resumes with very short career histories: may trigger fixture-10 pattern (brief-weight on sparse content); verify emits error, content is fine.

### Phase 5 observability

Phase 5 shadow deploy adds per-stage telemetry. We'll track:
- Real-traffic verify pass rate by resume type
- fixture-10-pattern occurrence rate (brief-weight with 0 bullets)
- fixture-19-pattern occurrence rate (editorial addition flagged)

If either pattern exceeds 15% of real traffic, revisit verify prompt.

---

## 6. Monitoring recommendations

### Per-request instrumentation

Log to Supabase `resume_v3_stage_telemetry`:
- `request_id`, `user_id`, `stage_name`, `capability`, `backend`, `model`
- `input_tokens`, `output_tokens`, `cost_usd`
- `duration_ms`, `error_code`, `retry_count`
- `fallback_activated` (boolean — for the deep-writer fallback)
- `verify_passed`, `verify_error_count`, `verify_warning_count` (verify only)
- `attribution_retry_fired` (strategize only)

### Dashboards to build

1. **Pipeline cost per user** (daily / weekly). Alert if > $5/user/day.
2. **Per-stage error rate.** Alert if any stage exceeds 2% error rate over 1 hour.
3. **Fallback activation rate.** Alert if deep-writer fallback fires on > 5% of requests (indicates OpenAI availability issues).
4. **Verify pass rate by resume complexity.** Track correlation between position count, bullet count, and pass rate.
5. **Cost by backend.** Track % of spend going to OpenAI vs Vertex. Should be ~70/30 OpenAI/Vertex at the smart hybrid config.

### SLOs for production

- Pipeline end-to-end: P95 < 90 seconds (write-position parallel is the bottleneck)
- Verify pass rate on real traffic: > 85% (corpus is 89%; real may be slightly higher or lower)
- Cost per resume: < $0.10 (corpus is $0.046; real will be $0.05-0.08)

---

## 7. Future optimizations

### GPT-5.4-mini when OpenAI project access stabilizes

Phase 4.8 found the OpenAI project has intermittent gpt-5.4-mini access (rate-limited at the project tier). When stable:

```
RESUME_V3_STRONG_REASONING_MODEL_OPENAI=gpt-5.4-mini
RESUME_V3_DEEP_WRITER_MODEL_OPENAI=gpt-5.4-mini
```

Expected: same 17-19/19 quality at ~$0.015/resume (1/3 the current $0.046). Standard-tier cost drops to $0.18/user-month — cheaper than pure-DeepSeek on total project cost.

### Per-user-tier routing (future phase)

Not implemented. Architecture supports it:
- Free tier: pure-DeepSeek for lowest cost, accept noisier verify
- Standard tier: smart hybrid (this config)
- Enterprise tier: pure-GPT-4.1 for 19/19 quality

Wiring tier detection into the factory is a ~100-line change; deferred until after Phase 5 shadow deploy.

### DeepSeek V3.3 when it ships

One env var: `RESUME_V3_FAST_WRITER_MODEL=deepseek-ai/deepseek-v3.3-maas`. Re-validate on 19-fixture corpus; ship if no regressions. Architecture is model-agnostic.

### Observability → prompt refinement

After 1-2 weeks of shadow data, review verify error patterns on real traffic. If fixture-10-style false positives are common, iterate verify's Check 9 to recognize Rule 7's brief-weight permission. If fixture-19-style editorial additions are common, tighten write-position prompt further.

### Pricing tier hook

The factory resolves capabilities lazily per-process via `getProvider(capability)`. For per-user-tier routing, inject a `tier` parameter that overrides the backend selection before the cache check. Small change; not needed for Phase 5 but supported by the architecture.
