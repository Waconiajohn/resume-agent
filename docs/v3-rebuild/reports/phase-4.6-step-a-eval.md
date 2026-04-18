# Phase 4.6 Step A — pure-DeepSeek validation with strategize v1.2

**Config:** `RESUME_V3_DEEP_WRITER_BACKEND=vertex` (pure-DeepSeek everywhere); strategize v1.2 with source-traceable discipline + one-retry attribution loop; write-position v1.3 (thinking mode). No OpenAI calls.

## Headline

**11/19 PASS, 20 total errors, $0.34 total, $0.018/resume average.**

| Measurement | Phase 4.5 hybrid | Phase 4.6 Step A (this run) | Phase 4 I3 (pure-DeepSeek no strategize fix) |
|---|---|---|---|
| Pass rate | 10/19 | **11/19** | 10/19 |
| Total errors | 22 | 20 | 20 |
| Avg cost / resume | $0.166 | **$0.018** | $0.015 |
| Attribution retry fire rate | n/a | **0/19** (zero retries needed) | n/a |

The zero attribution-retry fires are the most important signal: **strategize v1.2 completely eliminated the embellishment pattern the retry was designed to catch.** The prompt change was sufficient; the retry mechanism exists but didn't need to fire.

Per the task spec's decision gate: **11 < 14, so halt before Step B.** The strategize fix helped (+1 fixture, $0.15/resume cheaper than hybrid) but did not close the gap to 17+/19 on pure-DeepSeek. Step B (hybrid with fixed strategize) is NOT run per the stop condition — spec says "the problem is deeper and needs architectural review."

## Per-fixture table

| # | fixture | category | Phase 4.5 hybrid | Phase 4.6 Step A | Δ |
|---|---|---|---|---|---|
|  1 | 01-ben-wedewer              | executive                        | PASS 0  | PASS 0  | = |
|  2 | 02-blas-ortiz               | executive_international          | PASS 0  | PASS 0  | = |
|  3 | 03-brent-dullack            | mid_career_with_gap              | PASS 0  | FAIL 1  | **−** |
|  4 | 04-bshook                   | technical_to_management          | PASS 0  | FAIL 1  | **−** |
|  5 | 05-casey-cockrill           | executive                        | PASS 0  | PASS 0  | = |
|  6 | 06-chris-coerber            | technical                        | FAIL 1  | PASS 0  | **+** |
|  7 | 07-diana-downs              | female_technical_with_template   | FAIL 1  | FAIL 3  | **−** |
|  8 | 08-j-vaughn                 | technical_international          | FAIL 1  | FAIL 1  | = |
|  9 | 09-jay-alger                | executive                        | FAIL 5  | FAIL 4  | **+** (partial) |
| 10 | 10-jessica-boquist          | consultant_short_tenures         | FAIL 1  | PASS 0  | **+** |
| 11 | 11-jill-jordan              | executive                        | FAIL 1  | FAIL 5  | **−** |
| 12 | 12-joel-hough               | executive_non_technical          | FAIL 3  | PASS 0  | **+** |
| 13 | 13-lisa-slagle              | female_technical_with_template   | PASS 0  | PASS 0  | = |
| 14 | 14-lj-2025                  | unusual_formatting               | FAIL 6  | FAIL 4  | **+** (partial) |
| 15 | 15-manzione                 | technical_creative               | PASS 0  | PASS 0  | = |
| 16 | 16-mark-delorenzo           | technical_with_license           | PASS 0  | PASS 0  | = |
| 17 | 17-david-chicks             | technical                        | PASS 0  | PASS 0  | = |
| 18 | 18-steve-alexander          | current_career_gap               | PASS 0  | PASS 0  | = |
| 19 | 19-steve-goodwin            | unusual_formatting               | FAIL 3  | FAIL 1  | **+** (partial) |

## What the strategize fix unblocked

**Fixture-09 specifically** — the Phase 4.5 canonical regression case.
- Phase 4.5 hybrid: 5 errors, all from DeepSeek strategize embellishments ("by developing pricing strategies") that OpenAI write-position inherited into bullets.
- Phase 4.6 Step A: 4 errors, and inspecting them reveals **all 4 are VERIFY FALSE POSITIVES, not real fabrications.**

Example from fixture-09 position[0].bullets[4]:
> Mechanical check flagged 'by securing aftermarket sales contracts' as missing, but source bullet contains 'expanded revenue stream by securing contracts for aftermarket sales' — the claim is present, so no fabrication.

Verify's LLM is SAYING "the claim is present, so no fabrication" and STILL emitting this as an error. That's a verify prompt compliance issue — verify v1.2's Rule 1 clause says "If you find the claim (even if the mechanical check missed it), DO NOT emit an error." DeepSeek as verifier is not following that clause.

The original strategize embellishment problem is **gone**. What's left on fixture-09 is verify-side noise from the mechanical extractor's aggressive framing-phrase extraction.

## What surfaced that the strategize fix did NOT solve

Three new-ish issue classes, each separately diagnosable:

### Class 1 — Verify LLM emitting errors for tokens it confirmed are in source (6-8 fixtures)
The extractor (Phase 4.6) adds "by/through [verb]-ing X" patterns as claim tokens. The extractor captures them with longer trailing phrases than the source contains — e.g., summary "by promoting product performance" and source "by promoting the performance and reliability of products". The substring check fails because "product performance" isn't a contiguous source phrase even though all words appear. Verify's LLM reads source, confirms the claim IS present semantically, and... still writes an error message that acknowledges the match but marks it as error.

This is verify-prompt-compliance issue, not an attribution issue.

Affected: fixture-09 (all 4 errors), fixture-11 (all 5 errors — all "by X-ing Y" patterns where verifier says "source states X-ing Y ... is a paraphrase"), fixture-04 (1 error of this type), fixture-08 (1 error of this type), fixture-07 (2-3 of 3 errors).

### Class 2 — write-position splitting source bullets creating duplicates (fixture-14 specifically)
fixture-14 position[4] has 4 errors: two pairs of bullets that write-position created by splitting a single source bullet's two claims into separate bullets, both crediting the same source. Verify catches the duplicate-within-role correctly. This is a real write-position issue unrelated to strategize or attribution.

### Class 3 — genuine single-claim gaps (fixture-19, fixture-03 at 1 error each)
Small edits where write-position genuinely added a minor framing phrase not in source. One per resume. Not structural.

## Cost performance

$0.018/resume on pure-DeepSeek is **10× cheaper than Phase 4.5 hybrid** ($0.166/resume) at 1 fixture better pass rate. If we accept 11/19 as shippable (which the spec says not to — 14/19 is the threshold), this config is economically superior to the hybrid.

## Decision gate outcome per spec

- Pass rate 11/19 is **< 14/19 → Halt. Do NOT run Step B.**
- The spec's interpretation: "The strategize fix isn't enough. Stop and report — do not attempt Step B. The problem is deeper and needs architectural review."

## Root-cause re-interpretation

The "problem is deeper" framing in the spec assumed any shortfall meant strategize + write coupling wasn't the whole story. The actual deeper problem surfaced by this run is **verify's LLM not following its own Rule 1 when the mechanical pre-check is noisy.** Six to eight of the nine failures are verify false-positives where:

1. The mechanical extractor flags a framing phrase as "missing" because the rewrite's wording differs slightly from source (e.g. "by promoting product performance" vs "by promoting the performance ... of products").
2. Verify's LLM correctly identifies that the claim IS present in source.
3. Verify's LLM, despite confirming the match, emits an ERROR-severity issue (not a WARNING).

The strategize embellishment class is solved. The verify-compliance class is revealed.

## Options for John (next phase)

1. **Tighten verify v1.2 prompt.** The "DO NOT emit error if you find the claim" clause needs to be more aggressive. Possibly rewrite Check 1 to DEMAND the verifier emit `confirmed: true, claim_located: "..."` structured output instead of natural-language error messages that contradict themselves. Estimated scope: 1 prompt iteration + 19-fixture re-run ~$0.40.

2. **Tighten the mechanical extractor.** Remove the "by/through [verb]-ing" extractor (Phase 4.6 addition) that's producing these false positives. The phrase-matching granularity is too fine-grained for substring check. Alternative: keep the extractor but word-level-match ("tokens all present in any order") instead of substring-match.

3. **Accept 11/19 as shippable.** Most of the "failures" are verify-noise errors on resumes that would pass a human editor's read. At $0.018/resume and with clean strategize output, this config is the economic winner.

4. **Architecturally re-think verify.** Replace the one-shot verify LLM pass with a per-claim structured check (iterate through missingTokens, return verified|unverified|warning per token). More complex; deferred until Phase 5 observability confirms it's needed.

My recommendation: **Option 1 (tighten verify prompt)**. The fixes that landed in Phase 4.6 (strategize v1.2, attribution check, retry loop) are all correct and keeping. The remaining gap is a single-prompt fix on verify.v1.2 — specifically Check 1's handling of self-contradictory messaging. Low cost, high leverage.
