# Phase 4.12 validation — write-summary v1.2 (unit fidelity)

**Change:** Single prompt rule in `server/prompts/write-summary.v1.md`, v1.1 → v1.2. New Rule 2b forbids unit conversions not present in source (percentage ↔ absolute number, currency types, time periods, scale prefixes).

**Method:** Full smart-hybrid pipeline re-run across all 19 resume fixtures with `--skip-classify` (classify cached). Write stages exercised fresh. Verify on v1.2.1. All OpenAI models on gpt-4.1.

**Config:** Option B1 smart hybrid.
- `RESUME_V3_STRONG_REASONING_BACKEND=openai` (strategize + verify on gpt-4.1)
- `RESUME_V3_FAST_WRITER_BACKEND=vertex` (write-summary + write-accomplishments + write-competencies + write-custom-section on DeepSeek V3.2)
- `RESUME_V3_DEEP_WRITER_BACKEND=openai` (write-position on gpt-4.1)

## Headline

**19/19 PASS. Zero errors. $3.30 for the full 19-fixture run.**

| Config | Pass | Errors | Cost/fixture (full pipeline) |
|---|---|---|---|
| Phase 4.10 (verify v1.2, write-summary v1.1) | 17/19 | 2 | $0.046 (reported; actual ~$0.17 — see cost correction) |
| Phase 4.11 (verify v1.2.1, write-summary v1.1) | 18/19 | 1 | — (verify-only re-run, $0.025/fixture) |
| **Phase 4.12 (verify v1.2.1 + write-summary v1.2)** | **19/19** | **0** | **$0.174** |
| Pure-GPT-4.1 (ceiling reference) | 19/19 | 0 | $0.20 |

Zero regressions. Every fixture that passed in Phase 4.11 still passes.

## Per-fixture comparison

| # | fixture | 4.10 | 4.11 | 4.12 |
|---|---|---|---|---|
|  1 | 01-ben-wedewer          | PASS | PASS | **PASS** |
|  2 | 02-blas-ortiz           | PASS | PASS | **PASS** |
|  3 | 03-brent-dullack        | PASS | PASS | **PASS** |
|  4 | 04-bshook               | PASS | PASS | **PASS** |
|  5 | 05-casey-cockrill       | PASS | PASS | **PASS** |
|  6 | 06-chris-coerber        | PASS | PASS | **PASS** |
|  7 | 07-diana-downs          | PASS | PASS | **PASS** |
|  8 | 08-j-vaughn             | PASS | PASS | **PASS** |
|  9 | 09-jay-alger            | PASS | PASS | **PASS** |
| 10 | **10-jessica-boquist**  | **FAIL 1** | **FAIL 1** | **PASS** ✓ |
| 11 | 11-jill-jordan          | PASS | PASS | **PASS** |
| 12 | 12-joel-hough           | PASS | PASS | **PASS** |
| 13 | 13-lisa-slagle          | PASS | PASS | **PASS** |
| 14 | 14-lj-2025              | PASS | PASS | **PASS** |
| 15 | 15-manzione             | PASS | PASS | **PASS** |
| 16 | 16-mark-delorenzo       | PASS | PASS | **PASS** |
| 17 | 17-david-chicks         | PASS | PASS | **PASS** |
| 18 | 18-steve-alexander      | PASS | PASS | **PASS** |
| 19 | 19-steve-goodwin        | FAIL 1 | PASS | **PASS** |

## Fixture-10 deep dive — the $26M fabrication is gone

**Phase 4.11 error (write-summary v1.1 + verify v1.2.1):**
> `summary` — The summary claims "Delivered $26M in ARR growth", but no supporting evidence for $26M ARR growth appears in the StructuredResume or source bullets; this is a fabricated metric.

**Phase 4.12 summary output (write-summary v1.2 + verify v1.2.1):**
> "Growth-focused product leader who bridges strategy and sales to drive commercial outcomes. **Delivered 15% YoY ARR growth** through data-driven renewal strategy and customer feedback loops. Built a product-sales collaboration framework validating **$8M+** in roadmap value and accelerating expansion deals. Orchestrated ecommerce programs that boosted a Fortune 500 retailer's annual revenue by **$150MM**. Consistently aligns multi-product SaaS portfolios to revenue, retention, and expansion goals in high-growth environments."

Every number in the Phase 4.12 summary traces verbatim to source:
- "15% YoY ARR growth" → source `crossRoleHighlights[]`: "Delivered 15% YoY ARR growth through data-driven renewal strategy..."
- "$8M+ in roadmap value" → source: "Built product-sales collaboration framework validating $8M+ in roadmap value..."
- "$150MM" → source (Fortune 500 retailer bullet)

**No percentage-to-dollar conversions appear.** The source's "26% ARR increase" — which Phase 4.11 saw fabricated into "$26M in ARR growth" — is now either omitted (the summary picked the 15% ARR highlight instead) or would appear as "26%" in a faithful rewrite.

### Stability verification

Re-ran fixture-10 twice more to confirm Rule 2b reproducibility:

**Run 2:** `...Delivered 15% YoY ARR growth through data-driven renewal strategy and customer feedback loops. Built a product-sales collaboration framework that validated $8M+ in roadmap value and accelerated expansion deals. Orchestrated complex ecommerce programs that boosted a Fortune 500 retailer's annual revenue by $150MM...` — PASS.

**Run 3:** `...Delivered 15% YoY ARR growth through data-driven renewal strategies and customer feedback loops. Built a product-sales collaboration framework that validated $8M+ in roadmap value and accelerated expansion deals. Orchestrated complex ecommerce programs that boosted a Fortune 500 retailer's annual revenue by $150MM...` — PASS.

All three runs produce distinct phrasings (DeepSeek temperature 0.4 provides natural variation) but **zero** runs reintroduce the $26M fabrication. Rule 2b is holding reliably.

## Cost correction — Phase 4.10 estimate was light

The Phase 4.10 validation report projected **$0.046/resume** for smart hybrid. The actual full-pipeline cost measured across 19 fixtures in Phase 4.12 is **$0.174/resume** — about 3.8× higher.

### Accurate per-stage breakdown (Phase 4.12 measured)

| Stage | Backend | Model | Avg cost/resume |
|---|---|---|---|
| Classify | Vertex | DeepSeek V3.2 | ~$0.003 (cached in this run; add back in production) |
| Strategize | OpenAI | gpt-4.1 | $0.023 |
| Write-summary | Vertex | DeepSeek V3.2 | $0.001 |
| Write-accomplishments | Vertex | DeepSeek V3.2 | $0.001 |
| Write-competencies | Vertex | DeepSeek V3.2 | $0.001 |
| Write-custom-section | Vertex | DeepSeek V3.2 | ~$0.000 (rare; 0 in this corpus) |
| Write-position (avg 6-11 positions) | OpenAI | gpt-4.1 | $0.123 |
| Verify | OpenAI | gpt-4.1 | $0.025 |
| **Total** | | | **~$0.177** (incl. classify) |

The dominant cost is write-position: 6–11 positions × ~$0.014/position on gpt-4.1. Phase 4.10's report under-counted this because it estimated per-position cost too low.

### Corrected user-month projections

| Config | $/resume | 8/mo | 12/mo | 40/mo | 120/mo |
|---|---|---|---|---|---|
| Pure-DeepSeek | $0.018 | $0.14 | $0.22 | $0.72 | $2.16 |
| **Smart hybrid (measured)** | **$0.177** | **$1.42** | **$2.12** | **$7.08** | **$21.24** |
| Pure-GPT-4.1 | $0.200 | $1.60 | $2.40 | $8.00 | $24.00 |

At $49/month retail:
- Standard tier (8 resumes): smart hybrid is 2.9% of revenue (was projected as 0.8%).
- Power tier (40 resumes): 14.5% of revenue (was projected as 3.8%).
- Heavy tier (120 resumes): 43.3% of revenue — **above healthy tier economics**.

**Implications for Phase 5:**
1. Doc 06 section 2 (Cost model) and section 7 (Future optimizations) need revision to reflect the measured $0.177 number. The gpt-5.4-mini swap optimization path becomes more interesting: gpt-5-mini at $0.50/$1.50 per M would drop write-position cost ~75%, bringing smart-hybrid to ~$0.08/resume.
2. Doc 07 section 3 cost monitoring threshold of "v3/v2 ratio > 5×" still holds; v2 at DeepSeek is ~$0.018, so 5× = $0.09. Current smart hybrid at $0.177 would trigger that alert. The threshold needs revision OR shadow deploy will report ~10× ratio as expected-baseline.
3. Heavy tier (120 resumes/month) may require a pricing decision or a cheaper routing variant before shipping to that cohort at scale.

This cost correction does **not** affect the ship decision (19/19 still achievable) but DOES require a doc 06/07 amendment before Phase 5 begins. Flagging for John in the final summary.

## Zero regressions

Phase 4.11's 18 passing fixtures all still pass. Warnings distribution is similar (most fixtures have 0 warnings; a handful have 1–8 mostly from cross-role-highlight coverage and custom-section-title case differences — unchanged from prior phases).

## Remaining warnings (non-blocking)

Across 19 fixtures, 8/19 had non-zero warning counts in Phase 4.12, totaling ~15 warnings. All warnings are one of:
- Custom-section title case mismatch ("Additional Experience" vs "additional experience") — cosmetic, pre-existing.
- Cross-role highlight not explicitly paraphrased in summary — strategy-endorsed but writer chose different content (within budget).
- Editorial-framing warnings (the class Phase 4.11 report expected shadow deploy to observe; these are warnings, not errors).

None affect pass rate. None require immediate action. These are the exact signals shadow deploy is designed to aggregate across real traffic.

## Decision

**SHIP.** 19/19 PASS with zero errors across the corpus. The Check 9 Phase 4.11 fix and the Unit Fidelity Phase 4.12 fix close the two known fixture-level failure modes. Rule 2b reproducibly holds on three consecutive fixture-10 runs.

Cost correction is out of scope to remediate in this phase; flagged for doc 06/07 amendment before Phase 5 Week 0 executes.

## Cost ledger

| Item | Amount |
|---|---|
| 19-fixture full-pipeline run | $3.30 |
| fixture-10 smoke test (single fixture) | $0.06 |
| fixture-10 × 2 stability re-runs | $0.12 |
| **Phase 4.12 total spend** | **$3.48** |

Well under the $5 cap.
