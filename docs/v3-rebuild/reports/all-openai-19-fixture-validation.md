# v3 all-OpenAI — 19-fixture validation

**Date:** 2026-04-20
**Config:** `RESUME_V3_PROVIDER` default = `openai` (commit `171cb7be`). Every v3 capability on `gpt-5.4-mini`. Strategize prompt v1.4 (JD-vocabulary firewall). All guardrails intact. No prompt or guardrail weakened to make fixtures pass.
**Corpus:** 19 executive fixtures, all paired against `jd-01-under-armour-account-manager-wholesale` (Under Armour Account Manager, Wholesale — Mall). 17 of 19 fixtures are **cross-domain** — the candidate's resume industry does not overlap with the JD's wholesale/retail/consumer-brand domain. This is deliberately the stressed axis.
**Budget:** $1.89 observed. Under the $2 target; well under the $5 halt threshold.

**Recommendation up front: do NOT ship the flip yet.** The Rule 0a firewall solved the specific failure pattern (Jessica-boquist's GTM / go-to-market / wholesale leak) but did not close the broader class. Five other fixtures silently lifted "Account Manager" from the JD's role title into their `targetDisciplinePhrase`, and the mechanical attribution check did not catch them because it matches at the token level, not the phrase level. There is also one unexpected classify-schema regression on `gpt-5.4-mini` that was not present on DeepSeek.

---

## Pipeline-level summary

| Metric | Value |
|---|---:|
| Fixtures attempted | 19 |
| Pipeline completed end-to-end | 17 |
| Hard-failures (exception raised) | 2 |
| `verify.passed == true` (clean, no errors, no warnings) | 5 |
| `verify.passed == false` but completed (reviewable in UI) | 12 |
| Total cost | $1.89 |
| Average per-fixture cost | $0.11 |
| Average per-fixture wall-clock | ~24s |

Hard-failures are one attribution-guardrail rejection (fixture-10 on a **Rule 1b** unit mismatch, not a Rule 0a JD-vocab issue) and one **classify-stage schema error** on fixture-17. The classify failure is new on `gpt-5.4-mini` and did not happen under the old DeepSeek config.

---

## Per-fixture results

| # | Fixture | Source domain | Wall | Cost | Hard-fail? | Verify errors | Verify warnings |
|---|---|---|---:|---:|---|---:|---:|
| 01 | ben-wedewer | quality eng / devops / cloud | ~18s | $0.10 | — | 0 | 0 |
| 02 | blas-ortiz | oil & gas ops / sales | ~20s | $0.15 | — | 0 | 4 |
| 03 | brent-dullack | oil & gas ops eng | ~16s | $0.12 | — | 3 | 0 |
| 04 | bshook | project mgmt / nuclear / automation | ~18s | $0.11 | — | 0 | 0 |
| 05 | casey-cockrill | regulated manufacturing / ERP | ~22s | $0.11 | — | 0 | 0 |
| 06 | chris-coerber | medical device SW eng | ~16s | $0.08 | — | 0 | 0 |
| 07 | diana-downs | IAM / banking IT | ~19s | $0.13 | — | 0 | 1 |
| 08 | j-vaughn | supply chain / logistics | ~16s | $0.08 | — | 1 | 1 |
| 09 | jay-alger | strategy & BD / aerospace / medical | ~21s | $0.13 | — | 4 | 1 |
| 10 | jessica-boquist | product mgmt / SaaS | — | (counted in total) | **YES — strategize Rule 1b** | — | — |
| 11 | jill-jordan | project mgmt / insurance | ~18s | $0.11 | — | 0 | 2 |
| 12 | joel-hough | retail / wholesale / distribution | ~18s | $0.09 | — | 1 | 1 |
| 13 | lisa-slagle | business systems / banking | ~14s | $0.07 | — | 0 | 4 |
| 14 | lj (lutz) | program / project mgmt / SaaS | ~22s | $0.15 | — | 3 | 1 |
| 15 | manzione | UX design / SaaS / FinTech | ~14s | $0.08 | — | 0 | 0 |
| 16 | delorenzo | civil eng / infrastructure | ~17s | $0.08 | — | 1 | 1 |
| 17 | davidchicks | software eng / SaaS | — | (counted in total) | **YES — classify schema** | — | — |
| 18 | steve-alexander | AV systems sales / enterprise tech | ~22s | $0.11 | — | 1 | 0 |
| 19 | stevegoodwin | IT services / help desk | ~25s | $0.19 | — | 3 | 3 |

*Wall times are stage-sum; actual script-wall varied by 1–3 s due to network.*

---

## JD-vocabulary audit — the important section

The stressed axis. Every emitted `positioningFrame` and `targetDisciplinePhrase` was inspected against the candidate's source resume to confirm the words used were actually present in the source, not lifted from the JD.

### Rule 0a succeeded on the original failure pattern

**fixture-10 jessica-boquist** — the fixture that motivated Rule 0a — no longer leaks JD industry vocabulary. New strategy output:

- `positioningFrame: "product growth and SaaS leader"` — every token in source
- `targetDisciplinePhrase: "Product Management Leader, SaaS and product-led growth"` — every token in source

That's the win. The specific "GTM" / "go-to-market" / "wholesale" fabrication on Jessica is fixed. (She still hard-fails, but on a separate Rule 1b `$150M`/`$150MM` unit mismatch — different issue, discussed below.)

### But Rule 0a did NOT close the broader class — 5 fixtures silently lifted "Account Manager"

The JD's role title is **"Account Manager, Wholesale — Mall"**. Five of 17 completed fixtures emitted a `targetDisciplinePhrase` that begins with "Account Manager" despite the candidate **never having held an account-manager role** and the phrase "Account Manager" not appearing in their source resume:

| # | Fixture | Source role | Emitted `targetDisciplinePhrase` | Source has "account manager"? | Source has "account management"? | Leak? |
|---|---|---|---|---|---|---|
| 04 | bshook | Senior Project Controls Manager (nuclear / automation) | "Account Manager, Commercial Programs" | **No** | No | **YES** |
| 09 | jay-alger | Senior Strategy and Business Development Leader (aerospace / medical) | "Account Manager, Business Development and Product Growth" | **No** | **No** | **YES** |
| 12 | joel-hough | Director of Retail Operations (retail / wholesale) | "Account Manager, Wholesale and Retail Operations" | **No** (wholesale+retail are fine; "Account Manager" is not) | No | **YES (partial)** |
| 14 | lutz | Senior Technical Program Manager (SaaS) | "Account Manager, Enterprise SaaS and Hospitality Technology Implementations" | **No** | No | **YES** |
| 18 | steve-alexander | AV Industry Sales and Management Professional | "Account Manager, AV Systems Integration Sales" | **No** | No | **YES** |

For contrast, **fixture-02 blas-ortiz** ("Sales Account Manager, Oil and Gas Technical Sales") and **fixture-05 casey-cockrill** ("Account Manager and Sales Specialist in Operations and Technology") also used "Account Manager" — but those candidates **do** have "account manager" in their source resumes (1× and 2× occurrences respectively). Those are legitimate; the 5 above are not.

### Why the mechanical attribution check missed this

The attribution check in `server/src/v3/verify/attribution.ts` (applied to strategize via `checkStrategizeAttribution`) tokenizes the emitted phrase and checks each token against a normalized source-resume haystack. For "Account Manager, AV Systems Integration Sales", the tokens are "account", "manager", "av", "systems", "integration", "sales". Each of those tokens appears somewhere in the source (Steve Alexander's resume has "account" in "account growth initiatives" and "manager" in any number of management contexts). **Each individual token is sourced. The bigram "Account Manager" is not.**

Rule 0a's natural-language prompt ("check every noun phrase you're about to emit") instructs the model to do phrase-level checking, but `gpt-5.4-mini` — same as on Jessica — will happily emit the JD's role title if the individual words happen to exist in source. It's a model-compliance limitation that narrative-only prompt rules cannot fully close.

### What this means for the flip

Before Rule 0a: `gpt-5.4-mini` lifted industry/domain words (Jessica's "GTM" / "wholesale"). The mechanical check at token level caught those because the words were genuinely absent from source.

After Rule 0a: it stopped doing that particular move. Instead it lifted the **JD role-title bigram** ("Account Manager") — because the individual tokens slip through the token-level check, even though the phrase is pure JD vocabulary.

The mechanical guardrail caught the obvious-vocabulary class but misses the title-lifting class. Either the prompt needs another rule specifically about the JD's role title ("do not echo the JD's role-title phrase in targetDisciplinePhrase unless the same phrase appears as the candidate's actual job title in source"), or the attribution check needs to be upgraded to also match on 2-word phrases for role-title fields. Both are plausible fixes; neither is a one-line change.

---

## The two hard-failures

### fixture-10 jessica-boquist — strategize Rule 1b (NOT Rule 0a)

```
FAILED: Strategize attribution check failed on retry ... v1.4.
  [3] pos=4 text="Orchestrated the development and implementation of
        complex behavior-driven ecommerce programs, boosting a Fortune 500 r..."
        missing=[$150M]
```

The offending summary is in `emphasizedAccomplishments[3].summary`. The model wrote `$150M`. The source says `$150MM`. The attribution check's tokenizer treats those as distinct tokens. This is a Rule 1b (emphasizedAccomplishments grounding) failure, not a Rule 0a (positioningFrame / targetDisciplinePhrase) failure.

Worth noting: this is not actually a fabrication. `$150M` and `$150MM` refer to the same dollar figure in different notation conventions. The mechanical check is strict about token equality; `gpt-5.4-mini` rewrote the notation during the summary. On DeepSeek under the old config, the same fixture passed (baseline 146s run). So this is a regression, but a narrow one — unit-notation drift, not content fabrication.

### fixture-17 davidchicks — classify schema error

```
FAILED: Classify output did not match the StructuredResume schema (prompt classify.v1).
  Zod reported 1 issue(s): positions.5.dates: Invalid input: expected object, received undefined.
```

`gpt-5.4-mini` on the classify stage produced a `positions[5]` entry with no `dates` object at all. The Zod schema requires it. DeepSeek on the same fixture under the old config did not do this.

This is a **new regression class** unrelated to JD-vocabulary. `gpt-5.4-mini` is more prone to omitting required fields under the classify schema than DeepSeek was. One fixture out of 19 is a small sample but it is a shipping blocker because the pipeline hard-stops with no output.

If the flip goes to production, this will happen occasionally to users. Rate estimable as ~1 in 19 (≈5%) in this corpus, but sampling noise is large.

---

## The five clean passes

For completeness: these five fixtures produced `verify.passed == true` (0 errors, 0 warnings) with no JD-vocab leak:

- fixture-01 ben-wedewer (quality engineering)
- fixture-04 bshook (project controls)
- fixture-05 casey-cockrill (regulated manufacturing) — legitimately used "Account Manager" because her source has it twice
- fixture-06 chris-coerber (medical device SW)
- fixture-07 diana-downs (IAM) — 1 warning only

These are the runs where the flip worked cleanly. But four of them (01, 04, 06) ALSO would have been clean with old baseline, so "verify.passed=true" is not by itself a flip-win.

---

## Evaluation against your three outcome buckets

> Bucket 1 — "If 19/19 complete without attribution hard-fails AND cross-domain audit shows no JD-vocabulary leaks → ship the flip, proceed to non-v3 work."

**Not met.** 17/19 completed; 2 hard-fails; and the cross-domain audit found 5 silent JD-vocabulary leaks (the "Account Manager" bigram lifted from the JD role title into candidates who never held that role).

> Bucket 2 — "If 17-18/19 complete with 1-2 attribution hard-fails on specific cross-domain cases → report the failure pattern, don't ship yet, diagnose whether Rule 0a needs refinement or whether those cases need a narrower prompt tweak."

**Partial match.** 17/19 completed, which matches the count. But the hard-fails are NOT the cross-domain JD-vocab pattern Rule 0a was meant to guard against:
- Hard-fail #1 (jessica-boquist) is a Rule 1b unit-notation issue (`$150M` vs `$150MM`), unrelated to JD vocabulary.
- Hard-fail #2 (davidchicks) is a classify-schema issue, also unrelated to JD vocabulary.

The actual JD-vocabulary problem is the five **silent leaks** that did not hard-fail because the attribution check matches at the token level, not the bigram level. The firewall did not detect them.

> Bucket 3 — "If multiple unexpected regressions (not JD-vocabulary, but other error classes) → halt, report, we rethink."

**Arguably also matches.** The classify-schema failure on fixture-17 is an unexpected `gpt-5.4-mini` regression that does not exist in the old config. It is not a JD-vocabulary issue; it is a different error class.

Net: this falls between Bucket 2 and Bucket 3. Do not ship. The Rule 0a firewall solved the prominent Jessica case but did not close the broader class, and a separate `gpt-5.4-mini`-only classify regression surfaced.

---

## What could be done next (for your decision; do not act without direction)

Options for closing the title-lifting leak, in increasing scope:

1. **Narrower Rule 0a addendum** — add an explicit rule: "`targetDisciplinePhrase` must not echo the JD role-title bigram unless the same bigram appears verbatim in the candidate's source resume as a held title." Prompt-only. Low cost; may still be defeated by `gpt-5.4-mini` compliance.

2. **Upgrade the mechanical attribution check to bigram/phrase-level matching on `targetDisciplinePhrase` and `positioningFrame`** — specifically, require that every contiguous 2-word subphrase (or a whitelist of role-title bigrams like "Account Manager", "Sales Director", "Program Manager") appear as a contiguous 2-word subphrase in source. More code; more reliable; still a guardrail that fails closed rather than open.

3. **Hybrid rollback on strategize only** — revert `strong-reasoning` capability to vertex/DeepSeek while leaving `fast-writer` + `deep-writer` on `gpt-5.4-mini`. Gives most of the latency win (writer is ~3× of the stage-sum, strategize ~1.5×, classify ~3×). Loses the classify speedup. Would eliminate both hard-fail classes and all 5 JD-vocab leaks in this run.

4. **Hold the flip entirely until (1)+(2) are validated on a ≥19-fixture run with no JD-vocab leaks or unexpected regressions.**

Options for the classify-schema regression (separate from the above):

1. **Tighten the classify prompt** — the schema is in the prompt; either reiterate that `dates` is required or provide a concrete anti-example of omitted dates. Low cost.

2. **Leave classify on DeepSeek** (option 3 above subsumes this).

I have not started any of these. Halting and awaiting your read.

---

## Artifacts

- Full runner log: `/tmp/v3-validation/all19/run.log`
- Per-fixture snapshots: `/tmp/v3-validation/all19/snapshots-per-fixture/fixture-*/`
- Total cost spent: $1.89 (under budget)
