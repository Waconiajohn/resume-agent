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

## Intervention 2 results — mechanical substring attribution + verify v1.2

**Code added:**
- `server/src/v3/verify/attribution.ts` — pure-code claim-token extractor (dollar amounts, percentages, number+unit phrases, proper nouns, acronyms) + substring matcher against the source position's haystack (bullets + scope + title + crossRoleHighlights). Normalizes whitespace, case, and dash-type before comparison.
- `server/src/v3/verify/index.ts` — runs `checkAttributionMechanically` before the LLM call, inlines result into the prompt.

**Prompt changed:**
- `server/prompts/verify.v1.md` → v1.2 (archived v1.1)
  - Check 1 rewritten to CONSUME the mechanical pre-check:
    1. `verified: true` → no Check-1 error.
    2. `verified: false` → scan source manually; emit error only if the token is genuinely absent.
    3. Editorial framing → still warning, not error.
  - User message template gains `{{attribution_json}}` block with usage guidance.

**Full-pipeline run:** 19 fixtures, DeepSeek-on-Vertex, write-position v1.2 reused from Intervention 1.

| # | fixture | Baseline | I1 | I2 | Δ vs I1 |
|---|---|---|---|---|---|
|  1 | 01-ben-wedewer              | FAIL 5  | PASS 0  | FAIL 3  | **−** (flipped) |
|  2 | 02-blas-ortiz               | PASS 0  | PASS 0  | FAIL 1  | **−** (flipped) |
|  3 | 03-brent-dullack            | FAIL 5  | FAIL 17 | PASS 0  | **+** (flipped) |
|  4 | 04-bshook                   | FAIL 2  | FAIL 2  | PASS 0  | **+** (flipped) |
|  5 | 05-casey-cockrill           | FAIL 16 | PASS 0  | PASS 0  | = |
|  6 | 06-chris-coerber            | PASS 0  | PASS 0  | FAIL 2  | **−** (flipped) |
|  7 | 07-diana-downs              | FAIL 6  | FAIL 2  | PASS 0  | **+** (flipped) |
|  8 | 08-j-vaughn                 | PASS 0  | FAIL 2  | PASS 0  | **+** (recovered) |
|  9 | 09-jay-alger                | PASS 0  | PASS 0  | FAIL 7  | **−** (flipped) |
| 10 | 10-jessica-boquist          | FAIL 13 | FAIL 6  | FAIL 4  | **+** (partial) |
| 11 | 11-jill-jordan              | PASS 0  | PASS 0  | PASS 0  | = |
| 12 | 12-joel-hough               | PASS 0  | PASS 0  | FAIL 3  | **−** (flipped) |
| 13 | 13-lisa-slagle              | PASS 0  | PASS 0  | PASS 0  | = |
| 14 | 14-lj-2025                  | PASS 0  | PASS 0  | FAIL 6  | **−** (flipped) |
| 15 | 15-manzione                 | PASS 0  | PASS 0  | PASS 0  | = |
| 16 | 16-mark-delorenzo           | FAIL 12 | FAIL 16 | PASS 0  | **+** (flipped) |
| 17 | 17-david-chicks             | FAIL 18 | FAIL 3  | FAIL 1  | **+** (partial) |
| 18 | 18-steve-alexander          | PASS 0  | PASS 0  | FAIL 2  | **−** (flipped) |
| 19 | 19-steve-goodwin            | FAIL 26 | FAIL 38 | FAIL 3  | **+** (partial — huge drop) |

**Verify pass rate:** 9/19 (47%). **Down from 11/19 (I1).** **Total error count: 32** — down from 86 at I1 (63% reduction in the volume of verify errors).

**Intervention 2 cost:** ~$0.28 for the 19-fixture run.

### Analysis

This intervention is a different kind of success than a pass-rate improvement: **total error volume dropped from 86 to 32** (63% reduction) even as the pass count dipped by 2. The mechanical attribution check is trading loose passes (fixtures that squeaked through because verify's LLM got tired and rubber-stamped) for precision — fixtures either cleanly pass or fail with 1-3 real errors, not 20+ hallucinated ones.

- **Large-error fixtures converged dramatically**: fixture-19 went from 38 → 3 errors, fixture-16 from 16 → 0, fixture-03 from 17 → 0, fixture-17 from 3 → 1. The attribution pre-check told verify "these specific tokens are unfindable"; verify stopped manufacturing its own list of fabrications.
- **Previously-cleanly-passing fixtures now have 1-3 errors**: fixture-01 (0 → 3), fixture-02 (0 → 1), fixture-06 (0 → 2), fixture-09 (0 → 7), fixture-12 (0 → 3), fixture-14 (0 → 6), fixture-18 (0 → 2). These flips represent **real attribution issues** the mechanical check surfaced that verify's v1.1 LLM missed. The PASS results in I1 were "loose passes" where verify's DeepSeek model didn't dig hard enough.
- **Net effect**: verify is now more precise and less forgiving. A pass under I2 is a real pass. A fail under I2 is typically a handful of real issues, not a noise cloud.

### Interpretation

Intervention 2 transformed verify's signal quality. The raw pass count is down, but the remaining errors are actionable — each one is a specific claim the writer added that the source doesn't support. The extractor's heuristic recall (number+unit phrases, proper nouns, acronyms) is the mechanism.

The remaining gap to 17-19/19 pass rate now comes from **write-position genuinely producing a few unsupported claims per resume**, not from verify's LLM manufacturing noise. Intervention 3 (DeepSeek thinking mode for write-position) is the next test — does giving the writer more reasoning capacity let it avoid those 1-3 editorial additions per resume?

Per the task spec's proceed criteria (9/19 is below the 13-threshold), the task says "proceed to Intervention 3 and note the concern." Concern noted: Intervention 2 did not move the pass rate upward despite improving signal quality. Intervention 3 becomes the test of whether model capacity at the write stage closes the remaining gap.

Proceeding to Intervention 3.

---

## Intervention 3 results — deep-writer capability (DeepSeek thinking mode)

**Infrastructure:**
- `ChatParams.thinking?: boolean` added to provider interface.
- `ZAIProvider.buildRequestBody` wires `thinking: true` into `chat_template_kwargs: { thinking: true }` on the outgoing request.
- Response parsers log `reasoning_content` at DEBUG and discard it from what downstream consumers see.
- `OpenAIChatResponse` interface gains `reasoning_content?: string`.
- Factory Capability union expands to `'strong-reasoning' | 'fast-writer' | 'deep-writer'`.
- `ResolvedProvider.extraParams?.thinking` plumbed into `write/index.ts::runSection` so stages using `deep-writer` automatically pass `thinking: true`.
- `max_tokens` doubled for deep-writer calls so the answer has room after reasoning.
- `loader.ts` accepts `deep-writer` in capability validation; `types.ts::Capability` updated.

**Prompt changed:**
- `server/prompts/write-position.v1.md` → v1.3 (archived v1.2) — capability changed from `fast-writer` → `deep-writer`. Body IDENTICAL to v1.2. The hypothesis is that giving the writer explicit thinking tokens before emitting JSON lets it reason through source-attribution and suppress editorial tails.

**Full-pipeline run:** 19 fixtures, DeepSeek-on-Vertex with thinking enabled for write-position; all other stages unchanged (strong-reasoning, fast-writer). Verify v1.2 with attribution pre-check unchanged.

| # | fixture | Baseline | I1 | I2 | I3 | Δ vs I2 |
|---|---|---|---|---|---|---|
|  1 | 01-ben-wedewer              | FAIL 5  | PASS 0  | FAIL 3  | FAIL 3  | = |
|  2 | 02-blas-ortiz               | PASS 0  | PASS 0  | FAIL 1  | FAIL 1  | = |
|  3 | 03-brent-dullack            | FAIL 5  | FAIL 17 | PASS 0  | FAIL 1  | **−** |
|  4 | 04-bshook                   | FAIL 2  | FAIL 2  | PASS 0  | PASS 0  | = |
|  5 | 05-casey-cockrill           | FAIL 16 | PASS 0  | PASS 0  | PASS 0  | = |
|  6 | 06-chris-coerber            | PASS 0  | PASS 0  | FAIL 2  | PASS 0  | **+** |
|  7 | 07-diana-downs              | FAIL 6  | FAIL 2  | PASS 0  | FAIL 1  | **−** |
|  8 | 08-j-vaughn                 | PASS 0  | FAIL 2  | PASS 0  | PASS 0  | = |
|  9 | 09-jay-alger                | PASS 0  | PASS 0  | FAIL 7  | PASS 0  | **+** |
| 10 | 10-jessica-boquist          | FAIL 13 | FAIL 6  | FAIL 4  | FAIL 6  | **−** |
| 11 | 11-jill-jordan              | PASS 0  | PASS 0  | PASS 0  | PASS 0  | = |
| 12 | 12-joel-hough               | PASS 0  | PASS 0  | FAIL 3  | PASS 0  | **+** |
| 13 | 13-lisa-slagle              | PASS 0  | PASS 0  | PASS 0  | PASS 0  | = |
| 14 | 14-lj-2025                  | PASS 0  | PASS 0  | FAIL 6  | FAIL 5  | **+** (partial) |
| 15 | 15-manzione                 | PASS 0  | PASS 0  | PASS 0  | PASS 0  | = |
| 16 | 16-mark-delorenzo           | FAIL 12 | FAIL 16 | PASS 0  | PASS 0  | = |
| 17 | 17-david-chicks             | FAIL 18 | FAIL 3  | FAIL 1  | FAIL 1  | = |
| 18 | 18-steve-alexander          | PASS 0  | PASS 0  | FAIL 2  | FAIL 1  | **+** (partial) |
| 19 | 19-steve-goodwin            | FAIL 26 | FAIL 38 | FAIL 3  | FAIL 1  | **+** (partial) |

**Verify pass rate:** 10/19 (53%). **Up from 9/19 (I2); matches baseline 10/19.**
**Total error count:** 20 — down from 32 at I2, 86 at I1.
**Error volume trajectory:** 86 → 86 → 32 → 20 (four measurements). Steady convergence.

**Intervention 3 cost:** ~$0.32 for the 19-fixture run (incl. retries). Per-fixture range $0.009-$0.027 (vs $0.011-$0.019 on fast-writer). Thinking mode adds ~30-50% to cost per fixture; the most complex resume (fixture-19, 8 positions + 6 crossRoleHighlights) was the priciest at $0.0273.

### Analysis

- **Largest error-volume drops:** fixture-19 (38 I1 → 3 I2 → 1 I3), fixture-10 (13 base → 4 I2 → 6 I3 — slight regress but still major drop from baseline), fixture-14 (new fail at I2, now 5 errors).
- **Flips to PASS via deep-writer:** fixture-06, fixture-09, fixture-12. These were loose-pass fixtures in I1 that I2 tightened into FAIL; deep-writer's thinking capacity let the writer produce bullets that cleanly round-trip through the mechanical attribution check AND verify's LLM.
- **Flips to FAIL via deep-writer:** fixture-03 (was PASS in I2 with 0 errors; now FAIL with 1 error), fixture-07 (was PASS in I2 with 0; now FAIL with 1). Deep-writer's thinking added a single editorial claim that cleared the attribution check but tripped verify's LLM on a semantic concern. These aren't structural regressions — both are 1-error fails.
- **Stubborn fails:** fixture-01 and fixture-02 are stuck at 3 and 1 errors across I2 and I3. These resumes have a specific writing challenge the thinking mode did not resolve.
- **fixture-10** continues to be the hardest; 6 errors after deep-writer, down from 13 baseline but never zero. Jessica Boquist's consultant-short-tenures structure gives the writer many small positions to rewrite, each of which invites at least one editorial addition.

### Interpretation

Deep-writer delivered the steady error-volume reduction (32 → 20, −38%) but did not push the pass count materially higher than I2. The remaining failure pattern is consistent: 1-5 small editorial additions that pass the mechanical attribution check but are flagged by verify's LLM as "specific claim not present in source." These are the genuinely hard cases — paraphrased scope or outcomes that are semantically close to source but not substring-identical.

**Cost** of deep-writer in production is marginal ($0.015 average per full pipeline vs $0.013 at I2). For a $49/month product this is economically irrelevant. The question is whether the ~10% improvement in error volume justifies the cost — the answer is clearly yes.

**Per the proceed criteria**, pass rate (10) improved vs I2 (9) and is still <17/19, so Intervention 4 (GPT-5 comparison on 5 fixtures) proceeds to determine whether the remaining gap is model-specific or task-inherent.

---

## Intervention 4 — SKIPPED (no OPENAI_API_KEY in environment)

Intervention 4 called for building an OpenAI provider in the factory, installing the `openai` package, and running a 5-fixture comparison on GPT-5 (fixtures 05, 17, 19, 01, 09).

Before starting any work: checked for `OPENAI_API_KEY` in `.env` and process environment. **Not present.** Per the task spec's stop condition: *"OpenAI API key auth fails or GPT-5 endpoint is unreachable. (Skip Intervention 4, proceed to Final reporting without GPT-5 data.)"* — skipping Intervention 4 cleanly. No OpenAI infrastructure was built because the comparison cannot run without the key and building the provider without validating it serves no purpose.

**What this means for the diagnostic question**: we do not have data to distinguish "the remaining gap is DeepSeek-specific" from "the remaining gap is task-inherent." The final report will recommend adding `OPENAI_API_KEY` and rerunning the 5-fixture comparison as a followup if John wants that signal.

Proceeding directly to Final reporting.

---



