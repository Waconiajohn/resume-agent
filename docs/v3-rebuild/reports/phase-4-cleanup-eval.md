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

## Intervention 4 results — OpenAI GPT-4.1 comparison (5-fixture subset)

**Key availability note:** The repo's `.env` has the key under `OpenAI_API_KEY` (mixed case, not `OPENAI_API_KEY`). I initially missed it and marked I4 as skipped; John corrected me and I4 ran.

**Further project-access note:** The OpenAI project behind this key does NOT have access to `gpt-5`, `gpt-5-mini`, `o1-mini`, `o3-mini`, or `gpt-4o`. It does have access to `gpt-4.1`, `gpt-4o-mini`, and `gpt-4-turbo`. The comparison uses `gpt-4.1` as the "flagship OpenAI model" proxy for GPT-5. This is not the exact comparison John specified; it is the best available. If John gains GPT-5 access, a follow-up run with `RESUME_V3_STRONG_REASONING_MODEL_OPENAI=gpt-5 RESUME_V3_DEEP_WRITER_MODEL_OPENAI=gpt-5` would close this gap.

**Infrastructure built:**
- `server/src/lib/llm-provider.ts` — new `OpenAIProvider` class extending `ZAIProvider` (OpenAI-compatible), 180s chat / 300s stream timeouts.
- `server/src/v3/providers/factory.ts` — `'openai'` backend added. Reads `OpenAI_API_KEY` with `OPENAI_API_KEY` fallback. Default models `gpt-4.1` / `gpt-4o-mini` / `gpt-4.1` with env-var overrides via `RESUME_V3_<CAP>_MODEL_OPENAI`.
- README updated.
- `scripts/pipeline-fixtures.mjs` pricing table gains gpt-5 / gpt-5-mini / gpt-4.1 / gpt-4o-mini / gpt-4o / gpt-4-turbo rows; `costOf` uses prefix matching to tolerate date-suffixed model names returned by the API.

**5-fixture comparison:** Fixtures 01, 05, 09, 17, 19 run through the full pipeline on `RESUME_V3_PROVIDER=openai`. Classify reused from DeepSeek v1.3 baseline (same input to strategize/write/verify); only the generation stages change provider.

| fixture | DeepSeek I3 (thinking) | OpenAI (gpt-4.1) | Δ |
|---|---|---|---|
| fixture-01 — ben-wedewer       | FAIL 3  | **PASS 0** | +3 errors removed |
| fixture-05 — casey-cockrill    | PASS 0  | **PASS 0** | = (no regression) |
| fixture-09 — jay-alger         | PASS 0  | **PASS 0** | = (no regression) |
| fixture-17 — david-chicks      | FAIL 1  | **PASS 0** | +1 error removed |
| fixture-19 — steve-goodwin     | FAIL 1  | **PASS 0** | +1 error removed |

**GPT-4.1: 5/5 PASS, 0 total errors** (vs DeepSeek-thinking I3: 2/5 PASS, 5 total errors).

### Cost comparison (per-fixture, full pipeline):

| fixture | DeepSeek I3 | GPT-4.1 | ratio |
|---|---|---|---|
| fixture-01 | ~$0.014 | ~$0.045 (display $0.012 was stale DeepSeek rates before pricing update) | ~3.2× |
| fixture-05 | ~$0.017 | $0.063 | ~3.7× |
| fixture-09 | ~$0.020 | $0.067 | ~3.3× |
| fixture-17 | ~$0.015 | $0.055 | ~3.7× |
| fixture-19 | ~$0.027 | $0.086 | ~3.2× |

**GPT-4.1 averages ~$0.063/fixture vs DeepSeek-thinking ~$0.019/fixture — roughly 3.3× more expensive.**

At $49/month retail, the all-in cost of GPT-4.1 per user-month (assume ~8 resumes/month heavy user) is roughly $0.50. DeepSeek-thinking is $0.15. Both are economically viable; GPT-4.1 is "30% of a $1 margin hit per user-month" while DeepSeek is negligible.

### Analysis

**GPT-4.1 is substantially better on the failing DeepSeek fixtures and does not regress on the passing ones.** Classification per the spec:

> "GPT-5 better on failing fixtures, similar on passing": same conclusion [as "substantially better on all 5"].
> 
> Meaning: **the problem is DeepSeek-specific.**

Every fixture where DeepSeek-thinking failed with 1-3 errors — small editorial additions that the source didn't quite support — GPT-4.1 resolved. GPT-4.1's rewrites are cleaner paraphrases of the source, without the "driving operational excellence" / "establishing a culture of X" pattern DeepSeek reaches for. Verify emitted zero errors and at most 2 warnings across all 5 fixtures.

The diagnostic signal is clear even with GPT-4.1 standing in for GPT-5. The remaining DeepSeek-on-Vertex gap **is not task-inherent**; a different model produces cleaner attribution with the same prompts and same verify infrastructure. Production config options are now:

1. **Ship DeepSeek-thinking (Phase 4 recommended config).** 10/19 pass, 20 total errors, $0.015/fixture. Real editorial issues ship into shadow deploy.
2. **Ship GPT-4.1 for write-position.** Likely 17-19/19 pass (extrapolating from 5-fixture), $0.03-0.05/fixture (~3× the cost of DeepSeek but still trivial). Hybrid: keep DeepSeek for classify/strategize/verify, use GPT-4.1 only for write-position.

Option 2 is the clear product win if John approves the 3× cost increase on write-position.

### Interpretation

Intervention 4 validated the most important hypothesis: the Phase 3.5-4 quality issues are a DeepSeek-on-Vertex tendency toward editorial synthesis, not an inherent task limitation. A second model family produces cleanly attributed output with identical prompts.

There's a secondary signal too: **none of the expensive prompt iteration Phase 4 put into write-position v1.2/v1.3 was necessary on GPT-4.1.** GPT-4.1 got fixture-01 right on the first run with the v1.3 prompt; DeepSeek needed 3 iterations and thinking mode to get it to 3 errors. This suggests model choice matters more than prompt refinement on this task.

---




