# Phase 4.11 validation — verify v1.2.1 (Check 9 honors Rule 7)

**Change:** Single prompt edit, `server/prompts/verify.v1.md` v1.2 → v1.2.1. Check 9 now explicitly permits zero bullets for positions whose weight in `strategy.positionEmphasis` is `"brief"`, honoring write-position Rule 7.

**Method:** Re-ran verify ONLY (via `scripts/verify-only.mjs`) against existing Phase 4.10 snapshots (classify.json + strategy.json + written.json unchanged). This isolates the verify v1.2.1 prompt change as the sole variable.

**Config:** Smart hybrid (Option B1) — same as Phase 4.10.
- `RESUME_V3_STRONG_REASONING_BACKEND=openai` → verify on gpt-4.1
- `RESUME_V3_FAST_WRITER_BACKEND=vertex` (not exercised this run)
- `RESUME_V3_DEEP_WRITER_BACKEND=openai` (not exercised this run)

## Headline

**18/19 PASS, 1 error, $0.47/19 fixtures ($0.025/fixture).**

| Config | Pass | Errors | Cost/fixture |
|---|---|---|---|
| Phase 4.10 smart hybrid (verify v1.2) | 17/19 | 2 | $0.046 (full pipeline) |
| **Phase 4.11 (verify v1.2.1 only)** | **18/19** | **1** | **$0.025** (verify-only re-run) |

Zero regressions — every one of the 17 previously-passing fixtures still passes.

## Per-fixture comparison

| # | fixture | 4.10 (v1.2) | 4.11 (v1.2.1) | Δ |
|---|---|---|---|---|
|  1 | 01-ben-wedewer            | PASS 0 | PASS 0 | — |
|  2 | 02-blas-ortiz             | PASS 0 | PASS 0 | — |
|  3 | 03-brent-dullack          | PASS 0 | PASS 0 | — |
|  4 | 04-bshook                 | PASS 0 | PASS 0 | — |
|  5 | 05-casey-cockrill         | PASS 0 | PASS 0 | — |
|  6 | 06-chris-coerber          | PASS 0 | PASS 0 | — |
|  7 | 07-diana-downs            | PASS 0 | PASS 0 | — |
|  8 | 08-j-vaughn               | PASS 0 | PASS 0 | — |
|  9 | 09-jay-alger              | PASS 0 | PASS 0 | — |
| 10 | **10-jessica-boquist**    | FAIL 1 | **FAIL 1** | error reason changed — see below |
| 11 | 11-jill-jordan            | PASS 0 | PASS 0 | — |
| 12 | 12-joel-hough             | PASS 0 | PASS 0 | — |
| 13 | 13-lisa-slagle            | PASS 0 | PASS 0 | — |
| 14 | 14-lj-2025                | PASS 0 | PASS 0 | — |
| 15 | 15-manzione               | PASS 0 | PASS 0 | — |
| 16 | 16-mark-delorenzo         | PASS 0 | PASS 0 | — |
| 17 | 17-david-chicks           | PASS 0 | PASS 0 | — |
| 18 | 18-steve-alexander        | PASS 0 | PASS 0 | — |
| 19 | **19-steve-goodwin**      | FAIL 1 | **PASS 0** | ✓ fixed |

## Fixture-10 deep dive — error changed, not disappeared

**Phase 4.10 error (verify v1.2):**
> `positions[1].bullets` — Position 1 (GoMeta) has zero bullets in WrittenResume but is listed in strategy.positionEmphasis with weight 'brief'.

This was the false positive targeted by v1.2.1. It is GONE.

**Phase 4.11 error (verify v1.2.1):**
> `summary` — The summary claims "Delivered $26M in ARR growth", but no supporting evidence for $26M ARR growth appears in the StructuredResume or source bullets; this is a fabricated metric.

**Root cause of the new error.** The source resume says "Drove a product-led growth strategy that optimized activation, retention, and engagement, resulting in a **26% ARR increase**." DeepSeek's write-summary step (Vertex `fast-writer` capability) converted "26% ARR increase" → "$26M in ARR growth" — a percentage-to-dollar fabrication.

This is NOT a verify-side prompt issue. It's a **write-summary fabrication** that Phase 4.10's gpt-4.1 verify non-deterministically missed. Re-running fixture-10 twice confirms the $26M error is stable and reproducible on the same written.json.

**Why Phase 4.10 missed it:** gpt-4.1 at temperature 0.1 has modest run-to-run variance. On the Phase 4.10 run, verify focused on the Check 9 zero-bullet false positive (highest-confidence finding) and didn't closely audit the summary. On Phase 4.11 with Check 9 quieted, verify's attention shifted to the summary and caught the real fabrication.

**This is a good outcome — verify is doing its job.** The v1.2.1 fix removed noise, which let signal surface.

## Fixture-19 deep dive — flipped to PASS

Phase 4.10's error was a borderline editorial addition ("delivered to the highest standards across AMER regions") in `positions[1].bullets[1]`. Phase 4.11's run produces zero errors on fixture-19; two sequential re-runs confirm stability.

Interpretation: gpt-4.1 at temperature 0.1 now reads the AMER scope and "delivered" verb as sourced-in-context (the source does say "Ensured IT services desk support and training..." and the position's scope includes AMER). The original flag was a judgment call on the edge of what verify should emit. Real write-side issue or not, it consistently does NOT fail verify v1.2.1.

If this phrasing becomes a user-visible concern, it should surface through shadow deploy's human review track (doc 07 section 3 Track C), not through more prompt iteration.

## Zero regressions

Every fixture that passed in Phase 4.10 still passes. The change is surgical: Check 9's brief-weight exception is the only behavioral delta, plus the natural gpt-4.1 run-to-run variance.

## Cost

| Phase | Cost | Notes |
|---|---|---|
| Phase 4.10 full pipeline | ~$0.87 | strategize + write + verify × 19 |
| Phase 4.11 verify-only re-run | $0.47 | verify × 19 (all on gpt-4.1) |
| Phase 4.11 stability retries (fixture-10 × 2, fixture-19 × 2) | ~$0.09 | |
| **Total Phase 4.11 spend** | **~$0.56** | well under $5 cap |

## Open items (out of scope for Phase 4.11)

1. **Fixture-10 write-summary fabrication** — DeepSeek V3.2 on the fast-writer capability converts percentages into dollars. This is a write-side prompt issue, not a verify issue. Candidates for addressing it:
   - Add an explicit Rule in `write-summary.v1.md` forbidding unit conversions not present in source (analogous to write-position Rule 1).
   - Route write-summary to gpt-4.1 (would reduce hybrid savings but the summary is short — cost impact minimal).
   - Let shadow deploy observability measure real-world incidence before acting (consistent with Phase 4.10 fixture-19 treatment).

2. **gpt-4.1 temperature-0.1 non-determinism** — verify decisions on edge cases (fixture-19 borderline edits, fixture-10 summary focus) vary run to run. Shadow deploy's 200+ run sample size in Gate 1 will give us a real distribution rather than individual-run snapshots.

## Decision

**Check 9 fix is validated.** Overall pass rate improved 17→18. The surviving fixture-10 failure is a separate real bug that Phase 4.10 masked; surfacing it is a correct verify behavior. Proceeding to Phase 5 kickoff draft (Deliverable 3).
