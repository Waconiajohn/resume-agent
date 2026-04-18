# Phase 4.5 Report — Hybrid routing plumbing + validation-triggered halt

**Branch:** `rebuild/v3`
**Completed:** 2026-04-18
**Validation log:** `docs/v3-rebuild/reports/phase-4.5-validation.md`
**Status:** **Halted at the validation stop condition.** Doc 06 (production routing) and the "ready for Phase 5" recommendation are deferred until John selects an Option from the validation report.

---

## 1. What was built

Three deliverables landed cleanly:

1. **Per-capability backend routing in the factory.** New env vars:
   - `RESUME_V3_STRONG_REASONING_BACKEND`
   - `RESUME_V3_FAST_WRITER_BACKEND`
   - `RESUME_V3_DEEP_WRITER_BACKEND`
   
   Precedence: per-capability > global `RESUME_V3_PROVIDER` > built-in default. Built-in defaults: `vertex` / `vertex` / `openai` (the intended hybrid).
   
   New `Backend` type with `vertex` | `openai` | `anthropic` values. `resolveBackend(capability)` exposed for unit testing.
   
   File: `server/src/v3/providers/factory.ts`.

2. **Deep-writer OpenAI fallback.** New `DeepWriterFallbackProvider` wraps OpenAI primary with DeepSeek-thinking-on-Vertex fallback. Triggers on any OpenAI error (auth, rate limit, timeout, network, 5xx). Abort errors bypass. Adds `thinking: true` on the Vertex fallback path; strips it from the OpenAI primary call. Logs at WARN when fallback activates. This is the ONE explicit fallback in the whole system, carved out per the task spec.
   
   File: same factory.

3. **Production env config documentation.**
   - `server/.env.example` gets a new "v3 Pipeline (Phase 4.5 hybrid routing)" section with every RESUME_V3_* var and local-dev override examples.
   - `server/src/v3/providers/README.md` rewritten with: capability table (with fallback column), backend-precedence code block, failover chain diagrams for Vertex + deep-writer hybrid, usage example, local-dev override cookbook.

4. **Unit tests (21/21 passing):** `server/src/__tests__/v3/provider-factory.test.ts`.
   - `resolveBackend` precedence: default, global override, per-capability override, mixed-case input, invalid value.
   - `getProvider` model resolution: vertex defaults, openai defaults with `_MODEL_OPENAI` override, env-var override.
   - Deep-writer hybrid fallback: fires on OpenAI stream failure, skips on abort, strips thinking flag from OpenAI call, does NOT fire for strong-reasoning.
   - Caching + `_resetProviderCache`.

All four deliverables are on `origin/rebuild/v3` as commits `3fb90fae` and `1a3dfb18`.

## 2. Final hybrid config validated against 19 fixtures

**Configuration:** Factory defaults (strong-reasoning=vertex, fast-writer=vertex, deep-writer=openai). GPT-4.1 for write-position; DeepSeek V3.2 on Vertex for everything else. Verify v1.2 with mechanical attribution pre-check.

## 3. Production pass rate and cost

| Metric | Hybrid 4.5 | Pure-DeepSeek I3 | Pure-OpenAI I4 (5-fixture subset) |
|---|---|---|---|
| Pass rate | **10/19 (53%)** | 10/19 (53%) | 5/5 (diagnostic subset) |
| Total errors | 22 | 20 | 0 |
| Avg cost / resume | **$0.166** | $0.015 | $0.063 |
| Monthly cost @ 8 resumes/user | **$1.33 (2.7% of $49 retail)** | $0.12 (0.2%) | $0.50 (1.0%) |

**The hybrid did not deliver the I4-diagnostic extrapolation to 17-19/19.** It matches pure-DeepSeek in pass count at 10× the cost.

## 4. Fixtures still failing and their diagnosis

Nine fixtures fail (6, 7, 8, 9, 10, 11, 12, 14, 19). Total 22 errors; most have 1-3; two have 5-6 (fixture-09, fixture-14). Per-fixture detail in the validation log.

**Root cause:** stage-level quality coupling between DeepSeek strategize and OpenAI write-position. Validation log section "Regression analysis — fixture-09 in detail" walks through a complete reproduction. Abbreviated:

1. DeepSeek strategize's `emphasizedAccomplishments.summary` paraphrases source bullets with slight framing additions ("by developing pricing strategies" for a bullet that says "promoting the performance and reliability of products").
2. OpenAI write-position faithfully inherits those framed summaries and writes bullets that include the added framing.
3. Verify correctly flags the framed phrases as "not in source bullets or scope."

The embellishment originates in strategize, not write-position. In pure-DeepSeek (I3), write-DeepSeek's own embellishments dominated the verify signal. In pure-OpenAI (I4), strategize was also OpenAI so embellishments didn't happen upstream. The hybrid has the worst combination.

**This is a prompt-level issue, not an infrastructure issue.** The factory routing works; it just revealed a quality coupling between stage outputs that was previously masked.

## 5. Ready for Phase 5 shadow deploy?

**No, not as currently configured.** The hybrid defaults in the factory would ship a 10/19 config at 10× the cost of pure-DeepSeek — worse on both axes. Setting `RESUME_V3_DEEP_WRITER_BACKEND=vertex` in production would revert to pure-DeepSeek I3 behavior (10/19, $0.015/resume), which IS the same quality at 1/10 the cost — if we're accepting 10/19 pass.

Phase 5 shadow deploy is ready as a PROCESS (the pipeline runs end-to-end on any of the four Options in the validation log). What's not ready is the DECISION about which Option to ship.

## 6. Questions for John

Full context in `docs/v3-rebuild/reports/phase-4.5-validation.md`. Summary of the four options:

1. **Option A: Revert to pure-DeepSeek I3.** One env var change (`RESUME_V3_DEEP_WRITER_BACKEND=vertex`). 10/19 pass, $0.015/resume. Ships today.

2. **Option B: Move to full-OpenAI.** Set `RESUME_V3_PROVIDER=openai` everywhere. Extrapolated 17-19/19 based on I4. Cost ~$0.50/user-month. Needs a 19-fixture run on pure-OpenAI to confirm; est $2-3.

3. **Option C: Fix the strategize prompt.** Root-cause fix for the regression. Tighten strategize's `emphasizedAccomplishments.summary` to be source-traceable only; stop embellishing. Then re-run hybrid. Estimated scope: 1-2 strategize prompt iterations + 19-fixture re-run ~$3-5. Likely lowest-cost path to 17-19/19 at hybrid-plus-lower cost.

4. **Option D: Different hybrid.** Route strategize + write-position to OpenAI, keep classify/verify/fast-writer on DeepSeek. Breaks the strategize-write coupling while keeping most-stages DeepSeek. Cost similar to current hybrid (~$0.18/resume). Quality likely 17-19/19 based on I4.

**My recommendation: Option C.** The regression is traceable to a specific prompt (strategize embellishment) and fixing that prompt likely fixes the coupling for both hybrid and pure paths. Cheaper than Option B (full-OpenAI) at steady state and more reliable than Option A (shipping 10/19 as production).

If Option C converges to 17-19/19 with strategize tightened, the hybrid is the shipping config and Phase 5 is ready.

**Budget status:** Phase 4.5 spent ~$3.15 (validation run) + minor for factory tests. Budget was $5; $1.85 remains. Any of Options B/C/D fits.

---

**Infrastructure built in Phase 4.5 remains intact regardless of Option chosen.** The per-capability backend routing, OpenAI fallback for deep-writer, and env var overrides all work correctly and serve every Option. What gets decided is which combination of capabilities routes to which backend in production.

## What's NOT in this report

- **Doc 06 (Production Routing).** Deferred — cannot document a config that didn't validate at the production-quality bar.
- **Phase 5 readiness.** Deferred — same reason.

Both will follow once Option is selected and (for B/C/D) revalidated.

## Commits

- `3fb90fae` — factory per-capability routing + deep-writer OpenAI fallback + 21 unit tests
- `1a3dfb18` — env config + provider README
- `f83fe1cf` — 19-fixture hybrid validation (this report's source)
- (this commit) — final report with halt + decision request
