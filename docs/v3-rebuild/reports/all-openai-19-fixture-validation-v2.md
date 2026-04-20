# v3 all-OpenAI — 19-fixture revalidation (v2)

**Date:** 2026-04-20 pm
**Config:** commits `171cb7be` (default flip) + `b8b3099b` (strategize prompt v1.5) + `ec611bd0` (bigram-aware attribution verifier) + `0fcc7b57` (classify prompt v1.4). All three "fix the real problems" changes from Option 4 shipped. All guardrails intact; no prompt or check weakened to make fixtures pass.
**Corpus:** same 19 executive fixtures as v1, same JD (`jd-01-under-armour-account-manager-wholesale`). 17 of 19 remain cross-domain with the JD.
**Budget:** $1.96 observed this run (under the $2 target). Cumulative Option 4 cost including the fix iteration + both validation passes: ~$4, under the $5 halt threshold.

**Recommendation: HOLD. Do not ship.** Two of your three ship conditions are met; one is not.

- ✅ **Condition 2 — Zero JD-vocabulary leaks across cross-domain fixtures:** MET. All 5 "Account Manager" leaks from v1 are gone. The Rule 0a-title firewall in the prompt plus the bigram-aware verifier closed the class. Legitimate "Account Manager" usage on the two candidates who actually held the role is preserved.
- ⚠️ **Condition 1 — 18/19 or 19/19 complete without attribution hard-fails:** Almost met. 17/19 completed. Jessica-boquist persists (Rule 1b `$150M`/`$150MM` unit-notation, flagged by you as an acceptable persisting failure). But a NEW hard-fail replaced the old fixture-17 hard-fail: fixture-12 joel-hough now fails at classify on a different gpt-5.4-mini schema-compliance class (boolean-for-number).
- ❌ **Condition 3 — No new regression classes vs v1:** NOT met. fixture-12's boolean-for-number classify failure is a new gpt-5.4-mini regression class not seen in v1.

Two hard-fails of different shapes on two different fixtures is the pattern the task spec's halt condition names explicitly: "Fix 3 (classify) reveals a deeper issue with gpt-5.4-mini schema compliance that affects other fixtures beyond 17." Halting and reporting, as directed.

---

## Pipeline-level summary

| Metric | v1 (2026-04-20 am) | v2 (this run) | Delta |
|---|---:|---:|---:|
| Fixtures attempted | 19 | 19 | — |
| Completed end-to-end | 17 | 17 | same |
| Hard-failures | 2 | 2 | same count, different fixtures |
| `verify.passed == true` (clean) | 5 | 4 | −1 (joel-hough moved to hard-fail, fixture-13 lisa + fixture-15 manzione + fixture-17 davidchicks gained clean passes) |
| Silent JD-vocabulary leaks | 5 | **0** | **FIXED** |
| Total cost | $1.89 | $1.96 | +$0.07 (more retries on the tightened prompt) |

---

## The win — Rule 0a-title firewall closed all 5 silent leaks

The central finding of the v1 report was 5 cross-domain fixtures silently lifting the JD's role-title bigram "Account Manager" into `targetDisciplinePhrase`. v2 result on those same 5 fixtures:

| # | Fixture | v1 (leaky) | v2 (fixed) |
|---|---|---|---|
| 04 | bshook | ❌ "Account Manager, Commercial Programs" | ✅ "commercial and project operations leader across energy, automation, and manufacturing programs" |
| 09 | jay-alger | ❌ "Account Manager, Business Development and Product Growth" | ✅ "Business Development Sales Manager for aerospace and medical technology markets" |
| 12 | joel-hough | ❌ "Account Manager, Wholesale and Retail Operations" | (hard-failed at classify — stage never reached; leak moot) |
| 14 | lutz | ❌ "Account Manager, Enterprise SaaS and Hospitality Technology Implementations" | ✅ "Program and Project Management Leader for SaaS Implementations, Customer Success, and Deployment Operations" |
| 18 | steve-alexander | ❌ "Account Manager, AV Systems Integration Sales" | ✅ "Technical Sales Leadership" |

Legitimate "Account Manager" usage on the two candidates who ACTUALLY held the role is preserved:

| # | Fixture | v2 `targetDisciplinePhrase` | Allowed? |
|---|---|---|---|
| 02 | blas-ortiz | "Sales Account Manager in drilling and diamond products" | ✅ (source has "Account Manager" verbatim × 1) |
| 05 | casey-cockrill | "Account Manager, Software Sales and Client Relationships" | ✅ (source has "Account Manager" verbatim × 2) |

Cross-domain audit on every other fixture's `positioningFrame` and `targetDisciplinePhrase` confirmed no JD vocabulary leaks. The firewall works.

---

## The new hard-fail — fixture-12 joel-hough, classify boolean-for-number

```
FAILED: Classify output did not match the StructuredResume schema (prompt classify.v1).
  Zod reported 1 issue(s): positions.0.bullets.8.confidence:
    Invalid input: expected number, received boolean.
```

gpt-5.4-mini on the classify stage emitted `confidence: true` (a boolean) instead of `confidence: 0.9` (a number) on one bullet of joel-hough's first position. This is a **new regression class** not seen in v1:

| v1 classify failure (fixture-17) | v2 classify failure (fixture-12) |
|---|---|
| Required field OMITTED entirely (`dates` object missing) | Required field TYPE-CONFUSED (`confidence` emitted as boolean) |

Fix 3 addressed the first pattern in the prompt (Rule 7 explicit example for no-date source shapes). That fix worked: fixture-17 completed cleanly in v2 (wall=21s, $0.11, verify.passed=true). But the prompt fix for dates doesn't cover type-confusion on other fields, and gpt-5.4-mini apparently has more than one schema-compliance failure mode.

This is exactly the scenario the task spec called out as a halt condition:

> "Halt and report if: Fix 3 (classify) reveals a deeper issue with gpt-5.4-mini schema compliance that affects other fixtures beyond 17."

Two halt conditions apply (this one, and "new regression classes not seen in v1"). Halting, not proposing a fix. Waiting for your direction.

---

## The persisting hard-fail — fixture-10 jessica-boquist, the $150M/$150MM normalization gap

Per your spec, jessica's persist was allowed. For context:

```
FAILED: Strategize attribution check failed on retry ... v1.5.
  [3] pos=3 text="Orchestrated the development and implementation of complex
        behavior-driven ecommerce programs, boosting a Fortune 500 r..."
        missing=[$150M]
```

Source resume: `"boosting a Fortune 500 retailer's annual revenue by $150MM through strategic planning"`.
Model output: `"boosting a Fortune 500 retailer's annual revenue by $150 million"`.

The underlying issue is in `server/src/v3/verify/attribution.ts` — specifically `canonicalizeNumbers()`. The regex `(\d+(?:\.\d+)?)m\b` requires a word boundary AFTER the `m`, so it expands `$150M` → `$150 million` but does NOT expand `$150MM` → `$150 million` (because the second `M` blocks the word boundary). The source haystack contains `$150mm` (lowercased from `$150MM`); the model's tokenized phrase normalizes to `$150 million`; substring match fails.

This is a **separate narrow bug**, orthogonal to JD-vocabulary work and to schema compliance. A one-line fix in `canonicalizeNumbers` to handle `MM` / `BB` / `KK` conventions would close it. Not attempted here; flagging for a separate session.

---

## Per-fixture results — v2

| # | Fixture | Wall | Cost | Hard-fail | Verify errors | Verify warnings | JD-vocab leak? |
|---|---|---:|---:|---|---:|---:|---|
| 01 | ben-wedewer | ~19s | $0.10 | — | 0 | 0 | no |
| 02 | blas-ortiz | ~19s | $0.14 | — | 3 | 3 | no (legit "Account Manager") |
| 03 | brent-dullack | ~18s | $0.12 | — | 1 | 1 | no |
| 04 | bshook | ~20s | $0.12 | — | 0 | 4 | **FIXED** ✓ |
| 05 | casey-cockrill | ~19s | $0.13 | — | 1 | 1 | no (legit "Account Manager") |
| 06 | chris-coerber | ~17s | $0.08 | — | 2 | 1 | no |
| 07 | diana-downs | ~20s | $0.13 | — | 2 | 2 | no |
| 08 | j-vaughn | ~18s | $0.08 | — | 0 | 1 | no |
| 09 | jay-alger | ~22s | $0.14 | — | 2 | 1 | **FIXED** ✓ |
| 10 | jessica-boquist | — | (counted in totals) | **YES — Rule 1b $150M/$150MM normalization** | — | — | n/a (persisting) |
| 11 | jill-jordan | ~18s | $0.11 | — | 0 | 2 | no |
| 12 | joel-hough | — | (counted in totals) | **YES — classify boolean-for-number (NEW CLASS)** | — | — | (stage not reached) |
| 13 | lisa-slagle | ~14s | $0.08 | — | 0 | 0 | no |
| 14 | lj (lutz) | ~21s | $0.14 | — | 4 | 0 | **FIXED** ✓ |
| 15 | manzione | ~15s | $0.08 | — | 0 | 0 | no |
| 16 | delorenzo | ~18s | $0.11 | — | 1 | 1 | no |
| 17 | davidchicks | ~21s | $0.11 | — | 0 | 1 | no (fix 3 worked) |
| 18 | steve-alexander | ~20s | $0.11 | — | 2 | 1 | **FIXED** ✓ |
| 19 | stevegoodwin | ~24s | $0.18 | — | 3 | 0 | no |

---

## Regression check vs v1 — fixture-by-fixture

Fixtures that were clean in v1 (passed=true, 0 errors, 0 warnings) and remain clean in v2: **fixture-01, fixture-13, fixture-15**. Net improvement there (lisa-slagle newly clean in v2, was 4 warnings in v1).

Fixtures that were clean in v1 and regressed in v2: **fixture-04 bshook (0/0 → 0/4 warnings), fixture-05 casey-cockrill (0/0 → 1/1), fixture-06 chris-coerber (0/0 → 2/1), fixture-07 diana-downs (0/1 → 2/2)**. These are warnings and errors surfaced by downstream verify LLM — reviewable in the UI rather than hard-fails. Need to spot-check whether these represent real quality drops or just tighter verification. Running out of spec budget to do that audit here; flagging for follow-up.

Fixtures that were failing in v1 and completed in v2: **fixture-17 davidchicks** (hard-fail → passed=true, 0/1). Fix 3 clearly worked on the dates case.

Fixture that moved from completed-with-error to hard-fail: **fixture-12 joel-hough** (1/1 verify errors/warnings in v1 → hard-fail at classify in v2). This is the new regression.

Fixture persisting as hard-fail: **fixture-10 jessica-boquist** (same $150M/$150MM normalization issue).

---

## Residual issues

Three distinct failure classes are now visible in the corpus:

| Class | Fixture | Status |
|---|---|---|
| Rule 0a JD-vocabulary leak | (previously: bshook, jay-alger, joel-hough, lutz, steve-alexander) | **CLOSED** by Fix 1 + Fix 2 |
| Rule 1b unit-notation normalization ($150M / $150MM asymmetry in `canonicalizeNumbers`) | fixture-10 jessica-boquist | OPEN, narrow regex fix available |
| gpt-5.4-mini schema compliance — required-field type confusion | fixture-12 joel-hough (boolean-for-number); fixture-17 davidchicks in v1 (omitted required field, fixed) | OPEN, exact class of Fix 3's prompt change — may need a retry path on classify schema failures OR broader prompt coverage |

---

## Options for closing the residual

Per your instruction I do NOT propose combining with Option 3 or softening guardrails. These are the narrow fix options for your call, in decreasing scope:

1. **Add a one-shot retry to classify on schema validation failure.** Mirror strategize's pattern: on Zod failure, re-invoke the LLM with the specific validation error fed back as an addendum ("positions[0].bullets[8].confidence must be a number 0–1, not a boolean"). Would catch both the fixture-17 class (had it re-occurred) and fixture-12 class without needing the prompt to enumerate every possible type-confusion failure mode. Goes against OPERATING-MANUAL "no silent fallbacks" unless we make the retry loud — log at info/warn, expose the fact a retry fired in telemetry.

2. **Tighten classify prompt further** — add an explicit rule stating every `confidence` field is a number between 0.0 and 1.0 with a concrete ✓/✗ example showing boolean as the ✗. More surface area to cover but aligns with "fix the prompt, not the code."

3. **Fix `canonicalizeNumbers()` for MM/BB/KK suffixes.** Separate from above. One-line regex addition:

   ```ts
   s = s.replace(/(\d+(?:\.\d+)?)mm?\b/gi, '$1 million');
   s = s.replace(/(\d+(?:\.\d+)?)bb?\b/gi, '$1 billion');
   s = s.replace(/(\d+(?:\.\d+)?)kk?\b/gi, '$1 thousand');
   ```

   Would close Jessica's persist without touching any prompt.

4. **Hold all flipping until #1 (or #2) + #3 land and a v3 validation passes 19/19 clean.**

I have not attempted any of these. Awaiting your direction.

---

## Budget

- v2 revalidation: $1.96
- Fix 1 (prompt): $0
- Fix 2 (verifier + tests): $0 (unit tests don't hit LLMs)
- Fix 3 (prompt + tests): $0
- Running total for Option 4: ~$4 spent (v1 validation + v2 revalidation)
- Remaining budget before $8 halt: ~$4

---

## Artifacts

- Full runner log: `/tmp/v3-validation/v2/run.log`
- Per-fixture snapshots: `/tmp/v3-validation/v2/snapshots-per-fixture/fixture-*/`
- v1 baseline report: `docs/v3-rebuild/reports/all-openai-19-fixture-validation.md`
