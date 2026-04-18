# Phase 4.5 validation — hybrid routing on 19 fixtures

**Config:** `RESUME_V3_DEEP_WRITER_BACKEND=openai` (default after this phase), everything else on Vertex-DeepSeek. Classify reused from v1.3 baseline via `--skip-classify`. Verify v1.2 with mechanical attribution pre-check.

## Headline result

**10/19 PASS, 22 total errors, $3.15 total cost (~$0.166 per resume).**

This matches Phase 4 cleanup Intervention 3's 10/19 pass rate (all-DeepSeek with thinking mode, 20 errors, ~$0.015/resume) in pass count — but at **~10× the cost** and with a **different distribution** of failing fixtures.

**The I4 diagnostic's 5/5 subset result (extrapolated to 17-19/19 on the full corpus) did not materialize in the hybrid config.**

Per the task spec's stop condition: *"Fixture validation shows <15/19 pass rate. (Big regression from the diagnostic — investigate before documenting.)"* Triggered. Proceeding with investigation; doc 06 (production routing) is deferred until the decision below is made.

## Per-fixture table

| # | fixture | category | verify | err | warn | $cost |
|---|---|---|---|---|---|---|
|  1 | 01-ben-wedewer              | executive                        | PASS |  0 |  2 | $0.15 |
|  2 | 02-blas-ortiz               | executive_international          | PASS |  0 |  4 | $0.18 |
|  3 | 03-brent-dullack            | mid_career_with_gap              | PASS |  0 |  8 | $0.21 |
|  4 | 04-bshook                   | technical_to_management          | PASS |  0 | 14 | $0.19 |
|  5 | 05-casey-cockrill           | executive                        | PASS |  0 |  3 | $0.18 |
|  6 | 06-chris-coerber            | technical                        | FAIL |  1 |  2 | $0.12 |
|  7 | 07-diana-downs              | female_technical_with_template   | FAIL |  1 |  9 | $0.19 |
|  8 | 08-j-vaughn                 | technical_international          | FAIL |  1 |  6 | $0.12 |
|  9 | 09-jay-alger                | executive                        | FAIL |  5 |  2 | $0.22 |
| 10 | 10-jessica-boquist          | consultant_short_tenures         | FAIL |  1 |  7 | $0.16 |
| 11 | 11-jill-jordan              | executive                        | FAIL |  1 |  2 | $0.16 |
| 12 | 12-joel-hough               | executive_non_technical          | FAIL |  3 |  0 | $0.13 |
| 13 | 13-lisa-slagle              | female_technical_with_template   | PASS |  0 |  2 | $0.10 |
| 14 | 14-lj-2025                  | unusual_formatting               | FAIL |  6 |  3 | $0.24 |
| 15 | 15-manzione                 | technical_creative               | PASS |  0 |  3 | $0.09 |
| 16 | 16-mark-delorenzo           | technical_with_license           | PASS |  0 |  5 | $0.12 |
| 17 | 17-david-chicks             | technical                        | PASS |  0 |  3 | $0.16 |
| 18 | 18-steve-alexander          | current_career_gap               | PASS |  0 |  4 | $0.16 |
| 19 | 19-steve-goodwin            | unusual_formatting               | FAIL |  3 |  8 | $0.29 |

## Comparison to prior runs

| | Hybrid (4.5) | Pure-DeepSeek I3 | Pure-OpenAI I4 (5-fixture subset) |
|---|---|---|---|
| Pass rate | 10/19 | 10/19 | 5/5 |
| Total errors | 22 | 20 | 0 |
| Avg cost per resume | $0.166 | $0.015 | $0.063 |

**Subset comparison** (fixtures where I4 ran pure-OpenAI: 01, 05, 09, 17, 19):

| fixture | I3 (all-DeepSeek) | I4 (all-OpenAI) | Hybrid (4.5) |
|---|---|---|---|
| 01 | FAIL 3 | PASS 0 | PASS 0 |
| 05 | PASS 0 | PASS 0 | PASS 0 |
| 09 | PASS 0 | PASS 0 | **FAIL 5 (regression)** |
| 17 | FAIL 1 | PASS 0 | PASS 0 |
| 19 | FAIL 1 | PASS 0 | **FAIL 3 (regression)** |

Two fixtures that passed pure-OpenAI (I4) regressed to FAIL on hybrid, including fixture-09 with 5 new errors. This is the single most important finding of this validation.

## Regression analysis — fixture-09 in detail

**Source resume has** (from classify.json): `$200M` (in "20+ multi-year contracts with a combined value of $200M"), `$50M` ("win $50M of opportunities"), `$2M` ("winning $2M in-year business"), `$1.2M` ("adding $1.2M of revenue"), `$1B` (elsewhere).

**DeepSeek strategize's emphasizedAccomplishments[4]** (on hybrid): paraphrases one source bullet as `"Secured over $200M in multi-year contracts by developing pricing strategies, writing proposals, and negotiating favorable terms..."`. The phrase **"by developing pricing strategies"** is strategize's paraphrase; the source bullet only mentions "promoting the performance and reliability of products."

**OpenAI write-position** faithfully paraphrases the strategize summary into a bullet: `"Secured 20+ multi-year contracts valued at $200M by developing pricing strategies..."`. Writer inherits the phrase **"by developing pricing strategies"** from the strategy input.

**Verify** correctly flags: *"Claim 'Secured 20+ multi-year contracts valued at $200M by developing pricing strategies' is not found in source bullets or scope."*

All 5 fixture-09 errors follow this exact pattern. **The embellishment originates in DeepSeek strategize, not in OpenAI write-position.** OpenAI writer is being faithful to its input — but its input (the strategy object) is already slightly embellished.

### What this reveals

**Stage-level quality coupling.** In pure-DeepSeek (I3), strategize embellished AND write-DeepSeek-thinking also embellished, but the write-side embellishments dominated the verify signal. In pure-OpenAI (I4), strategize-OpenAI didn't embellish so write had clean input. In hybrid, DeepSeek strategize's embellishments are passed verbatim into OpenAI write's context and OpenAI writes them down as facts.

**DeepSeek strategize's emphasizedAccomplishments format appears to include "rationale-adjacent" summary paraphrasing** that reads like extra context but is actually invented framing. The write prompt correctly uses this as "context" — hybrid exposed that the context is unreliable input when write is faithful.

This is NOT a failure of the hybrid routing infrastructure (which works correctly — stages route to the right backends and fall back properly). It's a failure of the **prompt design for strategize**: its `emphasizedAccomplishments` summaries assume a slightly loose downstream writer. OpenAI's write is not loose enough to absorb strategize's embellishments.

## Cost analysis

The hybrid costs 10× more than pure-DeepSeek for the same pass count. Breakdown per average resume:

- Classify (DeepSeek, cached): free in this run (reused v1.3 baseline)
- Strategize (DeepSeek): ~$0.002
- Write (OpenAI GPT-4.1 on positions, DeepSeek on summary/acc/comp/custom): ~$0.15
- Verify (DeepSeek): ~$0.002

**The write stage accounts for 90%+ of the hybrid cost, driven entirely by GPT-4.1's pricing on the per-position calls (which can number 6-11 positions per resume with 6-8 bullets each).** The cost-per-resume estimate in the Phase 4 cleanup report (~$0.063) was derived from the 5-fixture subset where the average position count was lower; the full-19 average is higher because fixtures 09, 14, 19 have 8-11 positions each.

Actual production cost at $49/month retail with 8 resumes/user/month:
- Hybrid: $1.33/user-month → 2.7% of retail price
- Pure-OpenAI: ~$0.50/user-month → 1.0% of retail
- Pure-DeepSeek (I3): ~$0.12/user-month → 0.2% of retail

The 10× premium on pure-DeepSeek is non-trivial at scale. If the hybrid delivered 17-19/19 pass as extrapolated, the cost would be justified. At 10/19 it is not.

## Options for the path forward

### Option A — Revert to pure-DeepSeek I3 config
Set `RESUME_V3_DEEP_WRITER_BACKEND=vertex` in production. Ships 10/19 pass, 20 errors, $0.015/resume. This is the cost-optimal position; quality matches the hybrid.

### Option B — Move to full-OpenAI (all three capabilities)
Set `RESUME_V3_PROVIDER=openai`. Extrapolated 17-19/19 pass on the 5-fixture diagnostic. Cost ~$0.50/user-month at scale. Run the full 19 on pure-OpenAI before committing ($2.50 of runs).

### Option C — Fix strategize prompt, then re-run hybrid
The root cause of the hybrid regression is DeepSeek strategize embellishing summaries. Tighten the strategize prompt to emit only source-traceable phrases in `emphasizedAccomplishments.summary` (the same discipline already demanded of write-position). Then rerun hybrid; possibly recovers the I4-subset quality at the hybrid cost.

Estimated scope: 1-2 prompt iterations on strategize.v1 + 19-fixture re-run = ~$3-5 more. Likely lowest-cost path to 17-19/19.

### Option D — Accept "hybrid" but define it differently
If I4's 5-fixture PASS was real (and the regression on hybrid is specifically strategize-write coupling), **routing strategize to OpenAI alongside write-position** would keep the "DeepSeek for classify + verify" economy and fix the coupling. That's:
- classify, verify: DeepSeek (cheap, no regressions)
- strategize, write-position: OpenAI (quality)
- write-summary/acc/comp/custom-section: DeepSeek (short sections, DeepSeek is fine)

Cost: ~$0.18/resume (similar to current hybrid). Quality: likely 17-19/19 based on I4. Worth testing as a "D" variant.

## What was built but not yet validated

The Phase 4.5 infrastructure (per-capability backend routing, OpenAI fallback for deep-writer, `_MODEL_OPENAI` env var overrides) **all works correctly** — 21/21 unit tests pass. The code is ready to ship; what's not ready is the prompt layer.

Specifically, the factory's `resolveBackend()` handles all precedence cases, the `DeepWriterFallbackProvider` falls back on OpenAI failures (verified via mock tests), and the env-config plumbing supports any combination of backend/model/capability. This infrastructure remains valuable regardless of which Option (A-D) John chooses.

## Stop and await decision

Not writing doc 06 until an Option is selected — documenting a 10/19 config as production would be dishonest. Also not writing the final report until John decides between reverting (Option A) and one of the forward paths (B, C, D).
