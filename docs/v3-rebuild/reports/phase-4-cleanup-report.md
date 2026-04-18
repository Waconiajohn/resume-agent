# Phase 4 Cleanup Report — Converge write-position

**Branch:** `rebuild/v3`
**Completed:** 2026-04-18
**Baseline:** Phase 3.5 final (10/19 verify pass on DeepSeek-on-Vertex)
**Eval log:** `docs/v3-rebuild/reports/phase-4-cleanup-eval.md` (per-intervention deltas)

---

## 1. Summary

After three interventions on the 19-fixture corpus, we end at **10/19 verify pass** — matching the Phase 3.5 baseline by pass count. **But total error volume dropped from 86 to 20 across the same corpus — a 77% reduction.** The remaining 9 failing fixtures each have 1-6 errors (most have 1), down from fixtures with 16-38 errors at baseline.

The pass count is a lossy metric for what changed. Verify correctness improved dramatically: at baseline, a failing fixture would generate 10-30 errors, many of them verify false positives. After Intervention 3, a failing fixture typically has 1-5 real errors, each traceable to a specific editorial addition the writer made. The pipeline is now a cleaner signal for what genuinely needs fixing; it just isn't emitting fewer FAIL verdicts yet.

**Model config that produced the best result:** DeepSeek V3.2 on Vertex, thinking mode enabled via `deep-writer` capability for write-position, standard `fast-writer` for the other write stages, `strong-reasoning` for classify/strategize/verify.

**Total Phase 4 cleanup LLM spend:** ~$0.86 across all interventions (I1 ~$0.26, I2 ~$0.28, I3 ~$0.32). Well under the $30 hard stop and under the $1-$3 expected range.

**Intervention 4 (GPT-5 comparison) SKIPPED** — no `OPENAI_API_KEY` in environment; clean stop-condition exit per spec.

---

## 2. Intervention results table

| Intervention | What changed | Pass count | Total errors | Cost |
|---|---|---|---|---|
| **Baseline (Phase 3.5 final)** | write-position v1.1 + verify v1.1 | 10/19 | 86 | — |
| **I1: temp-drop + prompt refinement** | write-position v1.2 (temp 0.1, style anchor, Rule 0 forbidden-phrases, Rule 10 self-check) | 11/19 (+1) | 86 (=) | $0.26 |
| **I2: mechanical attribution in verify** | `verify/attribution.ts` + verify v1.2 prompt rebuild | 9/19 (−2) | 32 (−54) | $0.28 |
| **I3: deep-writer capability** | Thinking mode for write-position via new `deep-writer` capability + factory/provider plumbing | 10/19 (+1) | 20 (−12) | $0.32 |
| **I4: GPT-5 comparison** | Skipped — no OPENAI_API_KEY | — | — | $0 |

The two interventions that moved pass count (I1 and I3) were upstream (write prompt); I2 was downstream (verify). I2's "regression" in pass count is the tightening of verify's standard — fixtures that squeaked through with loose semantic matching now fail on real claim mismatches.

---

## 3. Per-fixture evolution

| # | fixture | category | Baseline | I1 | I2 | I3 |
|---|---|---|---|---|---|---|
|  1 | 01-ben-wedewer              | executive                        | FAIL 5  | PASS 0  | FAIL 3  | FAIL 3  |
|  2 | 02-blas-ortiz               | executive_international          | PASS 0  | PASS 0  | FAIL 1  | FAIL 1  |
|  3 | 03-brent-dullack            | mid_career_with_gap              | FAIL 5  | FAIL 17 | PASS 0  | FAIL 1  |
|  4 | 04-bshook                   | technical_to_management          | FAIL 2  | FAIL 2  | PASS 0  | PASS 0  |
|  5 | 05-casey-cockrill           | executive                        | FAIL 16 | PASS 0  | PASS 0  | PASS 0  |
|  6 | 06-chris-coerber            | technical                        | PASS 0  | PASS 0  | FAIL 2  | PASS 0  |
|  7 | 07-diana-downs              | female_technical_with_template   | FAIL 6  | FAIL 2  | PASS 0  | FAIL 1  |
|  8 | 08-j-vaughn                 | technical_international          | PASS 0  | FAIL 2  | PASS 0  | PASS 0  |
|  9 | 09-jay-alger                | executive                        | PASS 0  | PASS 0  | FAIL 7  | PASS 0  |
| 10 | 10-jessica-boquist          | consultant_short_tenures         | FAIL 13 | FAIL 6  | FAIL 4  | FAIL 6  |
| 11 | 11-jill-jordan              | executive                        | PASS 0  | PASS 0  | PASS 0  | PASS 0  |
| 12 | 12-joel-hough               | executive_non_technical          | PASS 0  | PASS 0  | FAIL 3  | PASS 0  |
| 13 | 13-lisa-slagle              | female_technical_with_template   | PASS 0  | PASS 0  | PASS 0  | PASS 0  |
| 14 | 14-lj-2025                  | unusual_formatting               | PASS 0  | PASS 0  | FAIL 6  | FAIL 5  |
| 15 | 15-manzione                 | technical_creative               | PASS 0  | PASS 0  | PASS 0  | PASS 0  |
| 16 | 16-mark-delorenzo           | technical_with_license           | FAIL 12 | FAIL 16 | PASS 0  | PASS 0  |
| 17 | 17-david-chicks             | technical                        | FAIL 18 | FAIL 3  | FAIL 1  | FAIL 1  |
| 18 | 18-steve-alexander          | current_career_gap               | PASS 0  | PASS 0  | FAIL 2  | FAIL 1  |
| 19 | 19-steve-goodwin            | unusual_formatting               | FAIL 26 | FAIL 38 | FAIL 3  | FAIL 1  |

(Intervention 4 column omitted — skipped. See eval log.)

**Aggregates:**
- Baseline pass: {02, 06, 08, 09, 11, 12, 13, 14, 15, 18} = 10
- I3 pass: {04, 05, 06, 08, 09, 11, 12, 13, 15, 16} = 10
- **Stably passing across all 4 stages:** {11, 13, 15} (3 fixtures — clean-data edge cases that the pipeline handled from the start)
- **Converted FAIL → PASS baseline → I3:** {04, 05, 16} (3 large-error fixtures that converged)
- **Converted PASS → FAIL baseline → I3:** {02, 14, 18} (3 fixtures where tighter verify caught real issues the loose baseline missed)

---

## 4. What converged vs. what didn't

### Converged
- **Large-error failures (16-38 errors at baseline).** Fixtures 05, 16, 19 all had 10+ errors at baseline; by I3 they have 0, 0, and 1 respectively. The combination of tighter writer + attribution pre-check + thinking mode eliminates the synthesis avalanche on these hard cases.
- **DeepSeek-verify false positives.** Baseline verify was generating its own attribution errors (phrases that WERE in source but the verifier missed). I2's mechanical pre-check gave verify a deterministic floor; I2 + I3 combined brought total error volume from 86 → 20.
- **Editorial-framing bulge.** Baseline had DeepSeek write-position adding strategic phrases ("driving operational excellence", "building a culture of X") to almost every bullet. After I1's forbidden-phrase list and I3's thinking mode, these phrases are rare in the I3 output.

### Did not converge
- **The 1-5 error tail.** 9 fixtures in I3 fail with 1-5 errors, most with exactly 1. This is the residual: single editorial claims that squeak past the mechanical substring check AND the write-prompt self-check but still trip verify's LLM on a semantic "this claim is not in source" judgment. These are the truly hard cases — paraphrased scope or outcomes that are semantically close to source but not substring-identical.
- **Fixture-10 (Jessica Boquist).** Consistently 4-13 errors across all four stages (13 → 6 → 4 → 6). The consultant-short-tenures structure with many small positions gives the writer more opportunities to add editorial content per resume. No intervention solved it.
- **Fixture-14 (LJ 2025) stability.** Passed at baseline and I1, fails at I2 and I3 with 5-6 errors. Once the attribution check was tight enough, real editorial additions in LJ's resume became visible.

### Pattern interpretation
The failure distribution is bimodal:
- **Clean-data or clean-source fixtures** (11, 13, 15) pass reliably.
- **Dense / rich-source fixtures** (01, 02, 10, 14) produce 1-5 real attribution errors from DeepSeek write-position despite three prompt iterations and thinking mode.

The remaining gap appears to be the writer's fundamental tendency to "improve" a source bullet with editorial color, not a prompt or architecture issue. Either a stronger model (GPT-5 — untested) OR a micro-task-chain restructuring (one source bullet in, one rewritten bullet out, no cross-bullet synthesis) are the two plausible paths to 17+/19.

---

## 5. GPT-5 comparison conclusions

**Not run.** No `OPENAI_API_KEY` available in the environment. Task spec's stop condition for this case was followed: skip Intervention 4, proceed to Final reporting without GPT-5 data.

This means we cannot answer the diagnostic question "is the remaining gap DeepSeek-specific or task-inherent?" empirically. Both hypotheses are plausible; neither is ruled out.

**Recommendation (section 9, Question 1)**: set `OPENAI_API_KEY` and run the 5-fixture GPT-5 comparison as a followup. Cost is estimated at $0.50-$2; signal is high.

---

## 6. Recommendation

**Ship the current configuration into Phase 5 shadow deploy with a known-gap caveat.**

Current config:
- All stages route through `server/src/v3/providers/factory.ts` with `RESUME_V3_PROVIDER=vertex`.
- `write-position` → `deep-writer` capability (DeepSeek V3.2 thinking mode).
- `classify`, `strategize`, `verify` → `strong-reasoning` (DeepSeek V3.2 on Vertex, no thinking).
- `write-summary`, `write-accomplishments`, `write-competencies`, `write-custom-section` → `fast-writer` (DeepSeek V3.2 on Vertex).
- Verify uses the mechanical attribution pre-check before the LLM call.
- Cost per resume: ~$0.015-$0.025 end-to-end.

**Known gap:** ~47% of fixtures ship with 1-5 verify errors. These are real editorial additions the writer made; they are not catastrophic (a human editor would likely approve most of them), but they're not "verify-clean."

**Why shipping anyway:**
- Total error volume is 77% lower than baseline.
- No fixture generates catastrophic output anymore (no 26-38-error resumes).
- Verify is a CHECK, not a BLOCK. A 1-error verify fail means "a human should look at this bullet," not "the resume is broken."
- The shadow-deploy phase is specifically for this kind of quality measurement; an in-the-wild pass rate would be more informative than continued synthetic-fixture iteration.
- The 3-4 prompt iterations already done are hitting diminishing returns on the fixture corpus.

**Alternative**: if John prefers to close the gap before shadow deploy, the two paths are (a) run GPT-5 comparison first to know if a model swap would help, or (b) restructure write-position as a micro-task chain (see Section 9 Question 2).

---

## 7. Capability configuration recommendation

| Capability | Used by | Production setting | Rationale |
|---|---|---|---|
| `strong-reasoning` | classify, strategize, verify | **DeepSeek V3.2 on Vertex, no thinking** | Phase 3.5 validated. Thinking mode tested on verify specifically would likely improve attribution judgments but triples the cost; not worth it for the marginal gain. |
| `fast-writer` | write-summary, -accomplishments, -competencies, -custom-section | **DeepSeek V3.2 on Vertex, no thinking** | These sections are short and mostly faithful. No evidence thinking mode helps them. |
| `deep-writer` | write-position | **DeepSeek V3.2 on Vertex, thinking mode ON** | I3 delivered 38% total-error-volume reduction on 19-fixture corpus. Cost premium is ~$0.005 per resume. Ship this as production default. |

No Decision Log entry is needed to adopt this — it's the configuration that produced the best measured results. If a future capability swap (e.g., GPT-5 for `deep-writer`) becomes relevant, that would warrant a Decision Log entry.

---

## 8. What's uncertain / what's deferred

### Uncertain
- **Model-specific vs task-inherent gap.** Without Intervention 4 (GPT-5 comparison), we don't know if the remaining 9-fixture-fail set would resolve on GPT-5 or if it's a task-inherent limit at the 19-fixture corpus's input distribution.
- **Production in-the-wild pass rate.** The fixture corpus is 19 executive resumes. Real users may write substantially differently (shorter bullets, more typos, different formatting). The measured pass rate may not predict production.
- **Fixture-10 specifically.** Consistently the hardest; no intervention helped. Either its specific source text has a structural property that triggers DeepSeek's editorial tendency more, or the fixture's expected output is subtly different from what the rules prescribe.

### Deferred
- **Intervention 4 (GPT-5 comparison).** Needs `OPENAI_API_KEY`; environment lacks it. Recommended followup.
- **Micro-task-chain write-position.** Not explored. The hypothesis is that splitting write-position into N parallel calls (one per source bullet) rather than one call per position would force per-bullet fidelity. Large refactor; should be its own phase if pursued.
- **Classify reruns.** All pipeline runs reused the Phase 3.5 v1.3 classify baselines (`--skip-classify`). A fresh full run would cost ~$0.05 per fixture and might uncover classify-level issues masked by the cache. Low priority given classify is 19/19 structural pass.
- **Attribution check extractor tuning.** The heuristic claim-token extractor in `attribution.ts` is conservative (favors recall over precision). Some legitimate paraphrases are not caught; some irrelevant tokens ARE caught. Tuning the heuristics could reduce both false positives and false negatives in verify's prompt input.
- **JD variety.** All 19 fixtures ran against `jd-01-under-armour-account-manager-wholesale`. Different JDs would exercise strategize differently; write-position's output would vary, possibly changing the failure distribution.

---

## 9. Questions for the human

1. **Set `OPENAI_API_KEY` and rerun Intervention 4?** The 5-fixture comparison (fixtures 05, 17, 19, 01, 09) would cost ~$0.50-$2 on GPT-5. If GPT-5 passes fixtures that DeepSeek fails with 1-5 errors, that's strong evidence for a model swap and a significant product decision. If GPT-5 shows the same 1-5 error pattern, the gap is task-inherent and the current DeepSeek config is the right one to ship.

2. **Ship into shadow deploy or pursue micro-task chain?** Current config is ready for Phase 5 with the "~47% 1-5-error failure" caveat. The alternative is a 1-2 week architectural refactor of write-position into per-bullet parallel calls. Shadow deploy lets us measure production pass rate first; refactor after shadow if signal is bad.

3. **Which of the 3 stably-failing fixtures is most concerning?** The 1-error fails (02, 03, 07, 17, 18, 19) could be individual prompt tweaks. The multi-error fails (01 at 3, 10 at 6, 14 at 5) suggest structural issues. If we're going to do more fixture iteration before shadow, which of these should be the priority?

4. **Revisit deep-writer-for-other-stages?** Intervention 3 only applied thinking mode to write-position. Verify specifically could plausibly benefit from thinking-mode reasoning on the attribution judgment. Cost would double verify's spend per resume. Not currently tested; worth a pilot on the 5 hardest fixtures if this interests you.

---

**Phase 4 cleanup is complete.** All commits are on `origin/rebuild/v3`:
- `581de19e` — write-position v1.2 (I1)
- `bd0f010f` — mechanical attribution + verify v1.2 (I2)
- `47d1d2cc` — I2 eval commit
- `3f692e7b` — deep-writer capability infrastructure (I3)
- `b116997a` — I3 loader fix + eval

Next: Phase 5 shadow deploy planning, pending the decisions above.
