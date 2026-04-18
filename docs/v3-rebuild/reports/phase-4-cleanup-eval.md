# Phase 4 cleanup — intervention eval log

This is a running eval log across the four Phase 4 interventions. Each section records what was run, the per-fixture results, and the deltas from the prior state. Baseline is Phase 3.5 final (10/19 verify pass on the 19-fixture corpus against JD `jd-01-under-armour-account-manager-wholesale`, classify reused from v1.3 baseline).

---

## Intervention 1 results — write-position v1.2 (temp 0.1, style anchor, forbidden phrases, ceiling rule, self-check)

**Prompts changed:**
- `server/prompts/write-position.v1.md` → v1.2 (archived v1.1 to `prompts/archive/write-position.v1.1.md`)
  - Frontmatter: `temperature: 0.4` → `0.1`
  - Added ~120-word style-anchor paragraph at top ("faithful / compressed / executive / quietly confident")
  - New Rule 0: explicit forbidden-phrases list with 16 ✗ examples ("driving operational excellence", "establishing a culture of", "spearheaded", "leveraged", "orchestrated", etc.)
  - Rule 1 rewritten with "ceiling, not target" framing + fresh ✓/✗ contrasts
  - New Rule 10: self-check instruction at the end of the system message
  - Example at bottom trimmed from 6 bullets to 5 (one per source bullet, no synthesis)

**Full-pipeline run:** 19 fixtures, DeepSeek-on-Vertex, classify reused from v1.3 baseline.

| # | fixture | Baseline (3.5) | Intervention 1 | Δ |
|---|---|---|---|---|
|  1 | 01-ben-wedewer              | FAIL 5 err  | PASS 0 err  | **+** |
|  2 | 02-blas-ortiz               | PASS 0 err  | PASS 0 err  | = |
|  3 | 03-brent-dullack            | FAIL 5 err  | FAIL 17 err | **−** (regressed) |
|  4 | 04-bshook                   | FAIL 2 err  | FAIL 2 err  | = |
|  5 | 05-casey-cockrill           | FAIL 16 err | PASS 0 err  | **+** |
|  6 | 06-chris-coerber            | PASS 0 err  | PASS 0 err  | = |
|  7 | 07-diana-downs              | FAIL 6 err  | FAIL 2 err  | **+** (partial) |
|  8 | 08-j-vaughn                 | PASS 0 err  | FAIL 2 err  | **−** (regressed) |
|  9 | 09-jay-alger                | PASS 0 err  | PASS 0 err  | = |
| 10 | 10-jessica-boquist          | FAIL 13 err | FAIL 6 err  | **+** (partial) |
| 11 | 11-jill-jordan              | PASS 0 err  | PASS 0 err  | = |
| 12 | 12-joel-hough               | PASS 0 err  | PASS 0 err  | = |
| 13 | 13-lisa-slagle              | PASS 0 err  | PASS 0 err  | = |
| 14 | 14-lj-2025                  | PASS 0 err  | PASS 0 err  | = |
| 15 | 15-manzione                 | PASS 0 err  | PASS 0 err  | = |
| 16 | 16-mark-delorenzo           | FAIL 12 err | FAIL 16 err | **−** (regressed) |
| 17 | 17-david-chicks             | FAIL 18 err | FAIL 3 err  | **+** (partial) |
| 18 | 18-steve-alexander          | PASS 0 err  | PASS 0 err  | = |
| 19 | 19-steve-goodwin            | FAIL 26 err | FAIL 38 err | **−** (regressed) |

**Verify pass rate:** 11/19 (58%) — vs 10/19 (53%) baseline. **+1 fixture**.

**Intervention 1 cost:** ~$0.26 for the 19-fixture run.

### Analysis

- **Net positive**: fixture-01 and fixture-05 both converted from FAIL to PASS. Fixture-05 went from 16 errors to 0 — the large-fabrication case that looked structural in Phase 3.5 responded to temp=0.1 + forbidden-phrases list.
- **Four fixtures partial improvements**: 07, 10, 17 saw errors drop (6→2, 13→6, 18→3). These failed verify but moved directionally.
- **Four fixtures regressed**: 03 (5→17), 08 (0→2), 16 (12→16), 19 (26→38). The regressions are concerning — fixture-08 flipped from a clean pass to 2 errors, and fixture-19 got worse. Temperature 0.1 amplified DeepSeek's confidence on its own synthesis in these cases; the forbidden-phrase list didn't fully generalize.
- **Core pattern**: Intervention 1 improved the fixtures that had the WORST baseline errors (05, 17) and regressed some that were cleaner. The distribution of failure is bimodal: either a fixture converges completely (0 errors) or it regresses into deeper synthesis.
- **Key failure class remaining**: fixture-19 with 38 errors is a large resume with many dense bullets. DeepSeek appears to invoke its editorial-synthesis tendency more strongly on long positions with rich source material. Rule 0's forbidden-phrases list doesn't cover every novel editorial tail DeepSeek invents; every fixture gets its own menu of fabrications.

### Interpretation

Intervention 1 worked as a prompt-hardening pass but didn't converge the corpus. The regressions suggest the model's baseline tendency (adding editorial framing) is deep enough that targeted examples can't fully suppress it via prompt alone. Per the task spec's proceed criteria (11/19 is between 10/19 baseline and the 13/19 threshold), Intervention 2 (mechanical substring attribution) becomes the primary hope: reading the prompt cannot fix what the model is determined to do, but a mechanical pre-check before verify gives verify's LLM call structured evidence to rely on, reducing both (a) DeepSeek verify's false positives and (b) DeepSeek write's confidence that its synthesis will slip past verify.

Proceeding to Intervention 2.

---
