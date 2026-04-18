# Phase 4.6 Report — strategize attribution + validation

**Branch:** `rebuild/v3`
**Completed:** 2026-04-18
**Validation log:** `docs/v3-rebuild/reports/phase-4.6-step-a-eval.md`
**Status:** **Halted at the Step A decision gate** (11/19 pass is < 14/19 threshold). Step B not run per spec. Substantive progress made; one new issue class surfaced that needs its own follow-up.

---

## 1. Summary

**Final pass rate (pure-DeepSeek + strategize v1.2):** 11/19 verify pass, 20 total errors, **$0.018/resume average cost.**

**Progression:**

| Run | Config | Pass | Errors | Cost/resume |
|---|---|---|---|---|
| Phase 3.5 final | pure-DeepSeek, strategize v1.1 | 10/19 | 20 | $0.015 |
| Phase 4 I1 | + prompt iteration | 11/19 | 86 | $0.015 |
| Phase 4 I3 | + deep-writer thinking | 10/19 | 20 | $0.015 |
| Phase 4.5 hybrid | OpenAI write-position | 10/19 | 22 | $0.166 |
| **Phase 4.6 Step A** | **strategize v1.2 + attribution check, pure-DeepSeek** | **11/19** | **20** | **$0.018** |

Phase 4.6 restored the pure-DeepSeek cost profile (10× cheaper than hybrid) and +1 over the I3 baseline, with a zero-fire rate on the attribution retry mechanism (strategize's prompt-level discipline was sufficient).

**Not ready for Phase 5 shadow deploy.** Pass rate is below the 14/19 threshold. A second issue class (verify LLM compliance) needs a fix before shipping.

## 2. Before/after per-fixture table

| # | fixture | Phase 4.5 hybrid | Phase 4.6 Step A | Δ |
|---|---|---|---|---|
|  1 | 01-ben-wedewer              | PASS 0  | PASS 0  | = |
|  2 | 02-blas-ortiz               | PASS 0  | PASS 0  | = |
|  3 | 03-brent-dullack            | PASS 0  | FAIL 1  | **−** |
|  4 | 04-bshook                   | PASS 0  | FAIL 1  | **−** |
|  5 | 05-casey-cockrill           | PASS 0  | PASS 0  | = |
|  6 | 06-chris-coerber            | FAIL 1  | PASS 0  | **+** |
|  7 | 07-diana-downs              | FAIL 1  | FAIL 3  | **−** |
|  8 | 08-j-vaughn                 | FAIL 1  | FAIL 1  | = |
|  9 | 09-jay-alger                | FAIL 5  | FAIL 4  | **+** (partial) |
| 10 | 10-jessica-boquist          | FAIL 1  | PASS 0  | **+** |
| 11 | 11-jill-jordan              | FAIL 1  | FAIL 5  | **−** |
| 12 | 12-joel-hough               | FAIL 3  | PASS 0  | **+** |
| 13 | 13-lisa-slagle              | PASS 0  | PASS 0  | = |
| 14 | 14-lj-2025                  | FAIL 6  | FAIL 4  | **+** (partial) |
| 15 | 15-manzione                 | PASS 0  | PASS 0  | = |
| 16 | 16-mark-delorenzo           | PASS 0  | PASS 0  | = |
| 17 | 17-david-chicks             | PASS 0  | PASS 0  | = |
| 18 | 18-steve-alexander          | PASS 0  | PASS 0  | = |
| 19 | 19-steve-goodwin            | FAIL 3  | FAIL 1  | **+** (partial) |

**Step B (hybrid with fixed strategize) NOT run.** Per spec: "If pass rate < 14/19: Halt. The strategize fix isn't enough. Stop and report — do not attempt Step B."

## 3. What the strategize fix unblocked

**Fixture-09, the Phase 4.5 canonical regression case:**

- Phase 4.5 hybrid: 5 errors, all from DeepSeek strategize embellishments ("by developing pricing strategies") that OpenAI write-position inherited. Classic fabrication.
- Phase 4.6 Step A: 4 errors, **all 4 are verify false positives.** Example:
  > "Mechanical check flagged 'by securing aftermarket sales contracts' as missing, but source bullet contains 'expanded revenue stream by securing contracts for aftermarket sales' — the claim is present, so no fabrication."

  Verify's LLM acknowledges the claim IS present and STILL emits an error. The strategize embellishment is GONE. What remains is verify-side compliance noise.

**Zero attribution retries fired across all 19 fixtures.** Strategize v1.2's prompt-level discipline (Rule 0 forbidden-phrases list, Rule 1b source-traceability contract, temperature 0.2) prevented the embellishment pattern entirely. The retry mechanism exists as defense in depth but was not load-bearing on this corpus.

## 4. Stage coupling — Decision Log entry (new)

Added to `docs/v3-rebuild/04-Decision-Log.md` as the 2026-04-18 entry "Stage coupling is real; every claim-producing stage runs a mechanical attribution check before emitting."

Principle: every v3 stage producing claims that flow downstream runs a mechanical substring-attribution check against source BEFORE emitting. On detected unattributed claims, retry ONCE with structured context; on second failure, throw loudly.

The entry documents:
- Why stage coupling was invisible pre-4.5 (write's own embellishments masked strategize's)
- Why Phase 4.5 hybrid made it visible (OpenAI faithfulness exposed DeepSeek laxity upstream)
- The pattern forward: applies to any future stage emitting claims (LinkedIn writer, cover letter narrative, interview-prep content) — they all inherit this template
- The limit: mechanical extractor heuristics can produce false positives (e.g. "by X-ing Y" phrase capture when source uses different function words). The pattern is the architectural principle; the extractor needs ongoing calibration.

## 5. Hybrid wasn't needed (Option Cfeedback)

**Not needed for cost.** Pure-DeepSeek hit the same 10× cost savings at +1 pass rate. Hybrid infrastructure (Phase 4.5) remains in the codebase — `deep-writer` still has the OpenAI→Vertex fallback, per-capability `_BACKEND` env vars still work — but is not the production default after this phase.

**Not needed for quality.** Strategize v1.2 on DeepSeek produced CLEAN summaries that write-position could faithfully paraphrase. The quality uplift the hybrid provided in Phase 4.5 appears to have been "OpenAI write-position absorbing DeepSeek strategize's sloppiness less sloppily" — fixing strategize removes the need for OpenAI downstream.

## 6. Doc 06 (Production Routing) — still deferred

Not writing doc 06 this phase because the pass rate is below the ship threshold. Doc 06 must describe a production-ready config; 11/19 with known verify-compliance issues is not it.

The config that will eventually ship is almost certainly:

```
RESUME_V3_STRONG_REASONING_BACKEND=vertex
RESUME_V3_FAST_WRITER_BACKEND=vertex
RESUME_V3_DEEP_WRITER_BACKEND=vertex  ← flip from Phase 4.5 default of openai
```

Pure-DeepSeek everywhere. Cost ~$0.018/resume. But doc 06 waits until verify v1.3 brings pass rate to 17+/19.

## 7. Phase 5 readiness

**No.** The remaining 8 fixture failures break down as:

| Issue class | Affected fixtures | Root cause | Fix scope |
|---|---|---|---|
| Verify LLM emits error after confirming claim present | fixture-09 (all 4), fixture-11 (all 5), fixture-04 (1), fixture-08 (1), fixture-07 (2-3 of 3), fixture-03 (1) | verify v1.2 Rule 1 compliance issue — DeepSeek verifier says "claim is present, so no fabrication" and emits ERROR anyway | One verify prompt iteration; high confidence fix |
| write-position splitting/duplicating bullets | fixture-14 (all 4) | write-position takes one source bullet and creates two rewritten bullets with overlapping content | write-position prompt tweak |
| Genuine minor embellishment | fixture-19 (1), possibly 1-2 of fixture-07's 3 | write-position adding a small framing phrase | smaller write-position iteration |

The dominant problem (6-8 fixtures) is verify-compliance. A single prompt iteration on verify v1.2 likely converts 6+ fixtures from FAIL to PASS, bringing total to 17-18/19.

**Estimated scope to Phase 5 readiness:**
- Verify v1.3 prompt iteration: ~$0.40 (single 19-fixture re-run).
- Possibly one write-position tweak for fixture-14: ~$0.40.
- Total: ~$1 to close the gap.

## 8. What's uncertain / what's deferred

### Uncertain
- **Whether verify prompt tightening alone closes the gap to 17+/19.** The hypothesis is yes (the false-positive pattern is consistent across affected fixtures). Not verified.
- **fixture-14's write-position bullet-splitting** may or may not need a prompt fix. Its pattern is different from the other failures.
- **Mechanical extractor's "by X-ing" phrase capture.** It's producing false positives by capturing phrases longer than the source's contiguous substring. A less-greedy capture might help, or moving to word-bag matching for framing phrases specifically.

### Deferred
- **Doc 06 production routing.** Waits for 17+/19 config.
- **Step B (hybrid re-validation with fixed strategize).** Stop condition triggered; not run. Could be informative if John wants to know whether clean strategize + OpenAI write hits 18-19/19, but given pure-DeepSeek is already 11/19 at $0.018/resume, the case for the 10× cost premium is weak.
- **Phase 5 shadow deploy.** Waits for 17+/19 config.
- **Cover-letter stage applying the stage-coupling pattern.** Future feature. The Decision Log entry reserves the pattern for when it's built.

## 9. Questions for John

1. **Run a verify v1.3 iteration?** Most direct path to 17+/19 pass rate. Target: rewrite Check 1's "find-the-claim" clause to be more aggressive ("you MUST emit `verified: true` status when you locate the claim, regardless of what the mechanical pre-check flagged"). Estimated cost: $0.40 for the 19-fixture re-run. This is Option 1 from the Step A eval; it's my strong recommendation.

2. **Step B (hybrid with fixed strategize) — run for signal?** Not required to ship, but if there's interest in knowing whether clean strategize + OpenAI write produces 18-19/19, it's a ~$1.50 run. Low priority given pure-DeepSeek is already the cheap-and-close-enough answer.

3. **Expose stage coupling as a Phase 5 monitoring concern?** Should we instrument the pipeline so that stages log their attribution-check results to Supabase, letting us track over time whether new stages or model swaps re-introduce coupling? Small instrumentation lift; strong diagnostic value.

4. **The extractor's "by X-ing" capture is producing false positives.** Do you want the extractor tightened (back off on multi-word capture), OR do you want verify's prompt to treat framing-phrase tokens more leniently? Both are viable. Tightening the extractor risks under-detecting the next embellishment class; tightening verify's tolerance risks missing real fabrications. My vote: verify prompt tightening, keep extractor sensitive.

---

**Phase 4.6 commits on `origin/rebuild/v3`:**

- `abac74bc` — extend attribution to strategize + 11 unit tests
- `8c6e12b1` — strategize v1.2 (source-traceable discipline)
- `c63c7bbe` — strategize attribution check + one-retry loop
- (this commit) — Step A eval + final report + Decision Log entry on stage coupling

Total Phase 4.6 LLM spend: ~$0.60 (well under the $10 cap).
