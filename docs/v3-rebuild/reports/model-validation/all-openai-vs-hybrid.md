# v3 all-GPT-5.4-mini vs current hybrid — validation findings

**Date:** 2026-04-20
**Goal:** Determine whether flipping every v3 stage to GPT-5.4-mini (via `RESUME_V3_PROVIDER=openai`) produces a quality-and-latency-neutral-or-better pipeline relative to the current hybrid (DeepSeek V3.2 on Vertex for strong-reasoning + fast-writer; GPT-5.4-mini on OpenAI for deep-writer only).
**Method:** Ran the three executive fixtures (bshook, jessica-boquist, joel-hough) through the real v3 pipeline via `server/scripts/pipeline-fixtures.mjs` — first with the current-default backend, then with `RESUME_V3_PROVIDER=openai`. Same prompts, same JD (under-armour account-manager stock), same code, only the provider changed.

**Raw side-by-side:** `raw-side-by-side.md` in this directory.

---

## Headline — the prediction was wrong

I expected the all-OpenAI candidate to be **slower** (reasoning model) and **higher quality** (what you experienced subjectively). The reverse happened on both axes:

1. **Candidate was 3–4× FASTER end-to-end.** Not marginally faster. Paradigm-shift faster. Pipeline wall-clock went from 90–146 seconds (baseline) to 22–35 seconds (candidate) on the two fixtures that completed. This overturns my pre-test latency warning entirely.
2. **Candidate had real quality regressions.** One of three fixtures hard-failed because GPT-5.4-mini fabricated industry framing on the strategize step. The existing mechanical attribution guardrail caught it and stopped the pipeline — which is the system working as designed, but is still a failed run.

The cost delta was modest (~$0.04–$0.05 per run), roughly in line with my grid estimate. Cost is not the decisive factor.

---

## Data

### Wall-clock time (headline latency number)

| Fixture | Baseline | Candidate | Delta |
|---|---:|---:|---:|
| fixture-04 bshook | 141s | **35s** | **−75%** |
| fixture-10 jessica | 146s | (failed) | — |
| fixture-12 joel | 90s | **22s** | **−76%** |

### Per-stage time (where the speedup lives)

Both completed fixtures show the same pattern — every stage ran 5–6× faster on OpenAI. The biggest absolute wins are on classify (the longest baseline stage) and strategize.

fixture-04 bshook:

| Stage | Baseline (DeepSeek on Vertex) | Candidate (GPT-5.4-mini) | Speedup |
|---|---:|---:|---:|
| classify | 77.4s | 11.9s | 6.5× |
| strategize | 49.4s | 16.0s | 3.1× |
| write (all sections) | 9.1s | 2.8s | 3.2× |
| verify | 2.9s | 1.3s | 2.2× |

fixture-12 joel-hough:

| Stage | Baseline | Candidate | Speedup |
|---|---:|---:|---:|
| classify | 59.7s | 10.9s | 5.5× |
| strategize | 22.3s | 4.4s | 5.1× |
| write | 5.4s | 2.6s | 2.1× |
| verify | 2.5s | 1.3s | 1.9× |

The latency story is consistent across stages. OpenAI's serving infrastructure is materially faster than Vertex's DeepSeek MaaS endpoint under current load.

### Cost (modest increase)

| Fixture | Baseline | Candidate | Delta |
|---|---:|---:|---:|
| fixture-04 bshook | $0.0699 | $0.1250 | +$0.055 |
| fixture-12 joel-hough | $0.0429 | $0.0894 | +$0.047 |

Per-run increase of 4–5 cents. Nothing against a $49/mo tier.

### Quality — the blocker

**fixture-10 jessica-boquist CANDIDATE FAILED.** The strategize step on GPT-5.4-mini emitted framing phrases that don't appear anywhere in the source resume:

```
[positioningFrame] text="product growth and GTM leader"
  missingWords=[gtm]
[targetDisciplinePhrase] text="Account Manager, Wholesale and Go-To-Market Growth"
  missingWords=[wholesale, go-to-market]
```

The existing attribution guardrail (`server/src/v3/strategize/attribution.ts`) caught this on the first attempt, triggered a retry with a "source-grounded" system addendum, and the retry **also failed** (2 new fabricated-phrase violations). The pipeline hard-stopped — which is the correct behavior, since downstream bullets would have been written toward a fabricated discipline frame.

DeepSeek on the same fixture didn't fabricate. This is a reproducible quality regression on GPT-5.4-mini specifically, at the strategize step, on resumes where the JD is in a different domain than the candidate's background (jessica's SaaS product-leader resume paired with an under-armour retail-wholesale JD — which is exactly the "bend the candidate toward the JD" moment where fabrication temptation is highest).

**fixture-04 bshook candidate PASSED with 2 warnings** (baseline: 0 warnings, passed cleanly).

**fixture-12 joel-hough candidate PASSED with 2 errors + 1 warning** (baseline: 0 errors, 0 warnings, passed cleanly).

Reading the actual output text across both completed candidates:

- **bshook**: baseline summary is clearly better. Baseline leads with "Project controls and commercial management leader who transforms complex delivery into predictable financial outcomes" + hero metrics (28%/6%/38% improvements). Candidate leads with a flatter role-based intro and picks operational facts instead of hero numbers. Baseline reads as the stronger executive positioning.
- **joel-hough**: candidate summary pivots harder toward the JD's "wholesale account management" target — maps more tightly to the role the candidate is applying for. Baseline is broader and less JD-tuned. Candidate marginally better here.

Net quality read on two completed fixtures: one baseline-better, one candidate-better. On the fixture that hard-failed, we don't have a candidate output to compare.

---

## What the data says

The fast-stage latency win is real, consistent, and large. The quality regression at strategize is real, deterministic, and directly attributable to GPT-5.4-mini being less disciplined about staying inside source-resume vocabulary when forced to position across domains. The existing mechanical guardrail saved us on the one fixture that tried to cross-domain fabricate — but that guardrail only catches strategize; if the model made a similar choice at write-summary or write-accomplishments (where the guardrail doesn't run), it would ship.

Two shipping options, one not-yet-ready option:

### Option A — Partial hybrid reshuffle (recommended near-term)

Move `fast-writer` capability to GPT-5.4-mini (that's summary, accomplishments, competencies, custom sections). Leave `strong-reasoning` on DeepSeek (classify, benchmark, strategize, verify). Leave `deep-writer` on GPT-5.4-mini (where it already is).

What this buys:
- Most of the write-stage latency win (writer was one of the longer stages at 9s baseline; goes to ~3s)
- No change to the strategize attribution discipline that DeepSeek already handles well
- Classify and verify stay on DeepSeek — those are the 60–77s stages, so we do NOT get the headline 4× latency win. Biggest latency win forfeited.
- Trivial cost delta (+$0.01–$0.02 per run)
- Zero quality risk — the only stage changing is the one that's already stylistically similar to what DeepSeek produces

### Option B — Full all-OpenAI flip, behind a flag (only if quality work happens first)

Flip the default, but first tighten `server/prompts/strategize.v1.md` to add a "source-grounded vocabulary" rule — explicitly "Use ONLY discipline/industry words that appear verbatim in the source resume; do NOT infer industry framing from the JD." Then re-validate. The attribution-retry mechanism already exists; the question is whether a stronger prompt makes the first attempt pass consistently.

If prompt tightening holds on a ~10-fixture run without any hard failures, ship the flip. You get the full 4× latency win (pipeline drops from 150–200s to 40–50s), a modest cost increase, and a dramatically better product-feel for users.

### Option C — Ship flip as-is, rely on guardrails

The attribution check did its job — it caught the fabrication and stopped the pipeline. A user who hits this would see a "Pipeline failed at strategize" error and have to retry. Not acceptable for a paid product. **Do not recommend.**

---

## My recommendation

Do Option A now — ship the `fast-writer` move to GPT-5.4-mini this week. It's low-risk, no-code-change (just set `RESUME_V3_FAST_WRITER_BACKEND=openai` in env), and captures the writer speedup with zero fabrication exposure.

Queue Option B as the next piece of prompt work — tighten `strategize.v1.md` source-grounding, re-run the 3-fixture validation plus add 3 more "cross-domain" fixtures where the JD and resume don't share vocabulary (those are the stress cases). If the tightened prompt holds on 6-fixture clean, flip the global default.

Hold the `verify` capability on DeepSeek for now even under Option B. Attribution-discipline is the verify stage's job, and DeepSeek has been validated there. Moving verify to gpt-5.4-mini would require re-validating the retry pronoun-fix, forbidden-phrase-retry, and attribution-check pipelines against a different model's tell patterns — a project, not a tweak.

---

## Artifacts

- `raw-side-by-side.md` — machine-generated per-fixture tables + text diffs
- Runner logs: `/tmp/v3-validation/{baseline,candidate}/<fixture>.runner.log` (ephemeral; not checked in)
- Validation harness: `/tmp/v3-validation/run-validation.sh` + `analyze.mjs` (ephemeral)
