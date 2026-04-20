# Option 4 — shipped

**Date:** 2026-04-20
**Branch:** `rebuild/v3`
**Final validation:** 18/19 on the full executive fixture corpus. Ship-recommended per the updated criteria John set at Fix 7+8.

---

## What Option 4 set out to do

Close the JD-vocabulary leak class that motivated the whole iteration, retire DeepSeek from v3 strong-reasoning, and land the model flip cleanly without regressing quality. The starting point was the 2026-04-20 morning 19-fixture validation that showed 5 cross-domain fixtures silently lifting the JD role-title bigram "Account Manager" into candidates' `targetDisciplinePhrase` without triggering the mechanical guardrail.

John's direction throughout: **fix the real problems, validate clean on the corpus, ship only when criteria are met. No softening of guardrails. No snapshot regeneration. No scope creep.**

---

## Every fix that landed

| # | Commit | What it did |
|---|---|---|
| 1 | `b8b3099b` | Strategize prompt v1.5 — explicit Rule 0a-title firewall naming the JD role-title bigram as a forbidden phrase with a concrete ✓/✗ example. |
| 2 | `ec611bd0` | Bigram-aware attribution verifier — added n-gram leak detection (2- and 3-word phrases appearing in JD but not source are flagged as JD-vocabulary leaks, unless pure role-shape like "senior manager"). |
| 3 | `0fcc7b57` | Classify prompt v1.4 — Rule 7 explicit instruction for "Additional experiences / Early career" entries that lack date ranges. `dates: { start: null, end: null, raw: "<section label>" }` required. |
| 5 | `165fdd4a` | Classify schema retry — mirror strategize's attribution-retry pattern for gpt-5.4-mini schema compliance. Fires on Zod validation failures; loud retry, not silent fallback. |
| 6 | `a0d0a7d5` | Canonicalizer MM/BB/KK — three-char regex fix so `$150M` and `$150MM` normalize to the same canonical string. Closes Jessica-boquist's persistent hard-fail. |
| 7 | `4037582e` | Bigram verifier stopword filter — skip n-grams where any word is a FRAME_STOPWORD ("and", "of", "the", etc.) to prevent false-positives on grammatical glue fragments. Closes Lisa-slagle's v3 hard-fail. |
| 8 | `4159c297` | Verify stage JSON retry — mirror classify Fix 5 but cover BOTH JSON-parse and Zod-validation failures. Defense-in-depth against gpt-5.4-mini truncation. Closes Diana-downs's v3 hard-fail. |

(Numbered 1–8 but with Fix 4 as v1 revalidation and Fix 9 as v4 revalidation — those were validation runs, not code changes.)

---

## Final 19-fixture pass rate

**18/19 complete.** 7 with `verify.passed=true` (clean pass). 11 completed with review notes (errors/warnings surfaced to the UI for user review, not pipeline failures).

One documented residual edge case:

**fixture-02 blas-ortiz — classify JSON parse failure (v4 only).** gpt-5.4-mini emitted malformed JSON at position 655. Fix 5 classify retry is scoped to Zod schema failures, not JSON-parse failures (deliberate scope call at Fix 5 time). This is a long-tail stochastic gpt-5.4-mini issue, single fixture, single occurrence. Per the spec's definition of "systematic" (3+ fixtures failing on the same root cause), not shipping-blocking. A future narrow fix — extending Fix 5 to also retry on JSON-parse, same as Fix 8 already does for verify — is backlog material.

No JD-vocabulary leaks across any completed fixture. The firewall holds.

---

## What changed in production behavior

### Latency

Measured on the executive fixtures (bshook, jessica-boquist, joel-hough) in the initial 2026-04-20 am all-OpenAI validation:

| Fixture | Old hybrid (DeepSeek on Vertex) | All-OpenAI (GPT-5.4-mini) | Delta |
|---|---:|---:|---:|
| bshook | 141s | 35s | −75% |
| joel-hough | 90s | 22s | −76% |

End-to-end pipeline wall-clock now runs in ~20–25 seconds per fixture where it was 90–150 seconds. This is the product-feel win: users on the new config see their tailored resume in about ~4× less time than they did on the DeepSeek hybrid.

### Cost

Per-fixture cost went from ~$0.05–$0.07 on the hybrid to ~$0.10–$0.18 on all-OpenAI. Roughly 1.8× increase. Absolute delta: +$0.04–$0.10 per resume. Not material against a $49/month tier.

Average v4 fixture cost: **$0.11**.

### New retry paths in production

Three guardrails that didn't exist before Option 4:
1. **Strategize attribution retry** — already shipped pre-Option-4; now also plumbed with the Fix 2 bigram verifier and Fix 7 stopword filter. Fires on Rule 0a / Rule 2b / Rule 5b attribution failures.
2. **Classify schema retry (Fix 5)** — one-shot retry on Zod validation failures with the specific validation errors fed back.
3. **Verify JSON/schema retry (Fix 8)** — one-shot retry on JSON parse OR Zod validation failures with error-kind-aware addendum.

All three are loud — they emit INFO telemetry when fired (`schemaRetryFired`, `jsonRetryFired`, `attributionRetryFired` on their respective stages). None are silent fallbacks. All honor OPERATING-MANUAL's "no silent fallbacks" principle by making retry fires visible.

### Prompt tightening

Two prompts got meaningful updates:
- `strategize.v1` bumped 1.3 → 1.4 → 1.5. Rule 0a firewall for JD vocabulary, then Rule 0a-title specifically naming the role-title bigram case.
- `classify.v1` bumped 1.3 → 1.4. Rule 7 explicit handling for "no dates at all" source patterns.

### Mechanical verifier additions

- `checkStrategizeAttribution` now accepts an optional `jd` parameter and performs bigram/trigram leak detection when passed (Fix 2).
- New helpers `isPureRoleShapeNgram`, `containsFrameStopword`, `buildNgramSet` in `server/src/v3/verify/attribution.ts`.
- `canonicalizeNumbers` extended to cover MM/BB/KK doubled-letter finance notation.

---

## Total cost of the Option 4 iteration

Roughly **$8 of $8 budget**. Four full 19-fixture validations at ~$2 each; fixes cost $0 (pure prompt + code + unit tests, no LLM calls).

Under-budget by a hair. No further validation runs warranted — shipping.

---

## What's next

### Immediate operational work (not v3 scope)

- **Non-v3 product flip** — still queued for a separate session. The cost grid in `docs/v3-rebuild/reports/model-cost-grid.md` and the plumbing discussion at the end of the first exchange remain the starting point. Moving cover letter / executive bio / thank-you note / LinkedIn editor to GPT-5.4-mini is the small, high-value first pass. Heavier products (interview prep, negotiation, 90-day plan) should get per-product quality tests before lifting.
- The global ACTIVE_PROVIDER plumbing in `server/src/lib/model-constants.ts` doesn't yet accept `openai` as a value. Non-v3 flip work would need to extend it, following the `RESUME_V2_WRITER_PROVIDER` pattern.

### Open issues to track

- **Classify JSON-parse retry gap** (fixture-02 blas-ortiz failure mode). Narrow fix: extend Fix 5 to also retry on `JSON.parse` failures, mirroring Fix 8's choice on verify. Schedule alongside next v3 touch-up.
- **Classify / verify retry semantics inconsistency.** Fix 5 retries schema-only; Fix 8 retries JSON-parse and schema. When classify JSON-parse extension lands, the two stages become consistent.
- **V3 test count baseline** now 208 passing on `server` side. Don't regress below this.

### What's NOT broken that was before

- Every cross-domain fixture's framing phrases sit inside the candidate's actual source vocabulary. No more "Account Manager" lifts from the JD onto candidates who aren't account managers.
- Jessica-boquist no longer hard-fails on unit notation (`$150M`/`$150MM` now canonicalize to the same string).
- gpt-5.4-mini schema-compliance edge cases (type-confusion, field omission) have retry coverage.
- Lisa-slagle-style bigram false-positives can't trigger — stopword-laden fragments auto-skip.
- Diana-downs-style verify truncation has retry coverage.

---

## Who shipped this

Joint work between John (product direction, ship/hold calls, guardrail-discipline calls, dessert-of-refusing-scope-creep) and Claude Opus 4.7 1M (implementation + validation + reporting). Every fix was validated against the 19-fixture corpus before declaring done. Zero guardrails softened, zero fixture snapshots regenerated, zero scope creep from the spec.

The whole iteration was an exercise in the same pattern the project has run on from the start: reveal the failure class, fix the real problem, prove it on the corpus, ship.
