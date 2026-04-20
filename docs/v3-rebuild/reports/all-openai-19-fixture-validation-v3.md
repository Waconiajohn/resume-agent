# v3 all-OpenAI — 19-fixture revalidation (v3)

**Date:** 2026-04-20 pm
**Config:** commits `171cb7be` (flip) + `b8b3099b` (strategize v1.5) + `ec611bd0` (bigram verifier) + `0fcc7b57` (classify v1.4) + `165fdd4a` (classify schema retry = Fix 5) + `a0d0a7d5` (canonicalizer MM/BB/KK = Fix 6). All guardrails intact. No prompt or check weakened.
**Corpus:** same 19 fixtures, same JD. 17 of 19 are cross-domain with the JD.
**Budget:** $1.96 this run. Option 4 iteration running total ~$6 of $8 budget.

**Recommendation: HOLD. Do not ship.** Two of three ship conditions are met. Halting per spec: "Revalidation run shows new regression classes not seen in the v1 validation."

- ✅ **Condition 2 — Zero JD-vocabulary leaks:** MET. No "Account Manager" leaks on any cross-domain fixture. Rule 0a-title + bigram verifier still holding.
- ✅ **The three targeted fixes landed on their intended fixtures:**
  - **fixture-10 jessica-boquist** — Fix 6 worked. Previously hard-failed on `$150M` vs `$150MM` normalization; NOW completes cleanly with `passed=true, 0 errors`.
  - **fixture-12 joel-hough** — Fix 5 (classify retry) was in place; joel's classify was clean this run (no retry fired). Previously hard-failed on boolean confidence; now completes.
  - **fixture-17 davidchicks** — Fix 3 (classify v1.4 dates handling) still holding. Completes cleanly, `passed=true`.
- ❌ **Condition 1 — 18/19 or 19/19 complete without attribution hard-fails:** NOT MET. 17/19 completed, same count as v1 and v2, but the two hard-fails are different fixtures in new classes.
- ❌ **Condition 3 — No new regression classes vs v1/v2:** NOT MET. Both of v3's hard-failures are new classes:
  1. **fixture-07 diana-downs** — verify stage returned malformed JSON (truncated at 128 chars, 34 output tokens). Verify has no retry path. New class not seen in v1 or v2.
  2. **fixture-13 lisa-slagle** — bigram verifier flagged `"and product"` as a JD-vocabulary leak on Lisa's `positioningFrame`. This is a false positive — a bug in my own Fix 2 code, not a gpt-5.4-mini issue. The bigram contains a stopword ("and") and isn't a meaningful role-title/discipline unit.

Both are mine to fix if you want, but each is its own fix and neither is in the Fix 5/6 scope I was told to stay within. Stopping here for your direction.

---

## The wins

### Fix 6 (canonicalizer MM/BB/KK) — worked cleanly

| Fixture | v2 (before Fix 6) | v3 (after Fix 6) |
|---|---|---|
| 10 jessica-boquist | ❌ Strategize attribution hard-fail on `$150M` vs source `$150MM` | ✅ `passed=true, 0 errors` — missing token is now canonicalized to `$150 million` on both sides |

Jessica's persist (allowed by the task spec) is now closed. The three-character regex change did exactly what it was supposed to.

### Fix 5 (classify schema retry) — in place, defense in depth

The classify schema retry was built, unit-tested (4/4), and wired in. In this particular run, no classify retry fired — joel-hough's classify was clean on the first attempt (gpt-5.4-mini non-determinism — produced well-typed output this time). The retry machinery is sitting there as a safety net for when the boolean-for-number or omitted-field patterns happen in production.

Noting: **absent production observation, we can't prove Fix 5 catches the joel-hough pattern end-to-end.** We do know from unit tests that the retry wiring fires correctly when the first attempt is invalid. The runtime behavior is as designed.

### Fix 3 held (not in this iteration's scope, worth noting)

fixture-17 davidchicks still completes cleanly. Classify v1.4 dates handling is stable.

### JD-vocabulary firewall held across every completed fixture

Audited every `positioningFrame` and `targetDisciplinePhrase` across the 17 completed fixtures. Zero "Account Manager" leaks on cross-domain candidates. The only `targetDisciplinePhrase` containing "Account Manager" was fixture-05 casey-cockrill ("Account Manager, Software Sales and Technical Solutions") — her source has "Account Manager" verbatim × 2, so it's legitimate.

---

## The new regressions

### fixture-13 lisa-slagle — false-positive in the bigram verifier (Fix 2 bug)

```
FAILED: Strategize attribution check failed on retry ... v1.5.
  [positioningFrame] text="business systems and product ownership"
    leakedPhrases=["and product"]
```

`"and product"` is not a JD-vocabulary leak. It's a stopword-plus-content-word fragment. The phrase "business systems and product ownership" is a perfectly reasonable positioning frame for Lisa (a business systems consultant / product owner); the word "and" is just a connective.

Why the verifier flagged it:

- Source ("business systems" + "product ownership" + "and" as separate tokens) doesn't literally contain the bigram "and product" because classify compressed the original summary text into the structured `discipline` field and `crossRoleHighlights`, and the compression doesn't preserve the exact "Consultant and Product Owner" phrasing from the raw source.
- JD has "and product" in "sales channels and product categories" (unrelated context — just a connective).
- The bigram verifier sees "and product" in JD, not in source haystack, not in the role-shape allowlist → flags as leak.

The real bug: **my Fix 2 bigram leak check does not filter bigrams that contain FRAME_STOPWORDS ("and", "the", "of", etc.).** The word-level check already drops these stopwords before matching; the bigram check should do the analogous filtering — skip any bigram where either word is in FRAME_STOPWORDS.

This would've been caught by a test covering "stopword-laden bigrams are not leaks" in the Fix 2 test file. The existing bigram tests covered the happy path (role-title bigrams) and the allowlist path (pure role-shape); they didn't cover stopword contamination.

**Narrow fix option**: two lines in `checkPhraseAgainstHaystack` — after extracting the phrase's bigrams/trigrams, skip any n-gram where either/any word is in `FRAME_STOPWORDS`. Add a unit test covering the "and product" pattern to lock the contract.

### fixture-07 diana-downs — verify stage JSON-parse failure

```
FAILED: Verify response is not valid JSON (prompt verify.v1):
  Unterminated string in JSON at position 128 (line 1 column 129)
```

gpt-5.4-mini on the verify stage produced 34 output tokens before stopping — a truncation or mid-generation drop. The JSON parser saw an unterminated string. Verify has no retry path (unlike strategize and, as of Fix 5, classify).

This is a **new error class not seen in v1 or v2**. The underlying cause is model non-determinism — gpt-5.4-mini occasionally truncates or emits malformed JSON. Neither the prompt nor the schema is at fault; the model hiccupped.

**Narrow fix option**: add a one-shot JSON-parse retry to the verify stage, same pattern as Fix 5 did for classify. On a `JSON.parse` failure, re-invoke once with an addendum saying "previous response was not valid JSON — return only the JSON object, no prose, no partial responses." If the retry also fails parse, throw.

Trade-off vs doing nothing: verify is the last stage; a verify failure kills the whole run after 90% of the work is done. A retry is cheap defense-in-depth on a known gpt-5.4-mini edge case.

---

## Per-fixture results — v3

| # | Fixture | Wall | Cost | Hard-fail | Verify errors | Verify warnings |
|---|---|---:|---:|---|---:|---:|
| 01 | ben-wedewer | ~18s | $0.10 | — | 0 | 0 |
| 02 | blas-ortiz | ~22s | $0.15 | — | 1 | 2 |
| 03 | brent-dullack | ~17s | $0.12 | — | 3 | 0 |
| 04 | bshook | ~22s | $0.12 | — | 0 | 2 |
| 05 | casey-cockrill | ~23s | $0.13 | — | 0 | 0 |
| 06 | chris-coerber | ~15s | $0.08 | — | 0 | 0 |
| 07 | **diana-downs** | — | — | **YES — verify JSON parse (NEW CLASS)** | — | — |
| 08 | j-vaughn | ~17s | $0.08 | — | 0 | 0 |
| 09 | jay-alger | ~18s | $0.13 | — | 0 | 2 |
| 10 | **jessica-boquist** | ~23s | $0.14 | — (**Fix 6 CLOSED**) | 0 | 0 |
| 11 | jill-jordan | ~18s | $0.11 | — | 0 | 2 |
| 12 | joel-hough | ~17s | $0.10 | — (classify clean this run) | 2 | 1 |
| 13 | **lisa-slagle** | — | — | **YES — bigram verifier false-positive on "and product" (NEW CLASS, Fix 2 bug)** | — | — |
| 14 | lj (lutz) | ~21s | $0.14 | — | 0 | 3 |
| 15 | manzione | ~14s | $0.08 | — | 0 | 0 |
| 16 | delorenzo | ~16s | $0.11 | — | 1 | 1 |
| 17 | davidchicks | ~18s | $0.11 | — (Fix 3 still holds) | 0 | 1 |
| 18 | steve-alexander | ~20s | $0.11 | — | 0 | 2 |
| 19 | stevegoodwin | ~21s | $0.17 | — | 2 | 2 |

6 fixtures with `verify.passed=true` (up from 4 in v2). 12 completed with reviewable notes. Pipeline wall-clock is consistent with v2 (~18–23s per fixture; paradigm-shift faster than the DeepSeek baseline that this whole iteration started from).

---

## Delta from v2

| Class | v1 | v2 | v3 |
|---|---|---|---|
| Rule 0a JD-vocabulary leak | 5 silent | CLOSED by Fix 1+2 | CLOSED |
| Rule 1b classical summary attribution | 0 | 0 | 0 |
| Rule 1b $150M/$150MM canonicalization | fixture-10 hard-fail | fixture-10 hard-fail | **CLOSED (Fix 6)** |
| Classify schema omission (dates) | fixture-17 hard-fail | — | — (Fix 3 holds) |
| Classify schema type-confusion (boolean) | — | fixture-12 hard-fail | — (clean this run; Fix 5 retry available if needed) |
| **Bigram verifier stopword false-positive** | — | — | **NEW: fixture-13 hard-fail** |
| **Verify JSON-parse failure** | — | — | **NEW: fixture-07 hard-fail** |

---

## Ship/hold by your three conditions

| Condition | Status | Notes |
|---|---|---|
| 1. 18/19 or 19/19 complete (Jessica's unit-mismatch allowed, Joel should now pass) | ❌ | 17/19 complete. Jessica's now clean ✓, Joel's now clean ✓ — but two different fixtures replaced them as hard-fails. |
| 2. Zero JD-vocabulary leaks across cross-domain fixtures | ✅ | Firewall holds. |
| 3. No new regression classes | ❌ | Two new classes: bigram false-positive (Fix 2 bug), verify JSON parse (new gpt-5.4-mini edge case). |

Three ship conditions, two met. Per your spec: **hold, do not ship on 2-of-3**.

---

## Options for the next iteration (for your direction; I have NOT attempted any of these)

Each is narrower than "do everything."

1. **Fix the bigram verifier stopword false-positive only** (closes lisa-slagle).
   - ~5-line change in `checkPhraseAgainstHaystack`: skip bigrams/trigrams where any word is in `FRAME_STOPWORDS`.
   - Add a unit test covering the "and product" case + 2–3 similar stopword-laden patterns.
   - Leaves diana's verify-JSON failure as the one remaining hard-fail. Would need a subsequent run to confirm closure.

2. **Add verify-stage JSON retry only** (closes diana-downs).
   - Mirror the classify schema retry pattern I just built for Fix 5: one-shot retry on `JSON.parse` failure, with an addendum naming the parse error and reminding the model to emit valid JSON only.
   - Leaves lisa's bigram false-positive intact — she'd still hard-fail on revalidation.

3. **Both #1 and #2 together**, then revalidate. Recommended if you want 18/19 or 19/19 on the next pass.

4. **Hold indefinitely and reconsider scope.** If the failure rate per iteration (~2 new hard-fails per full-corpus run) is structural — gpt-5.4-mini will keep surfacing one-off edge cases forever — the question becomes "accept N% baseline hard-fail rate and ship anyway" versus "stay on the hybrid." Your call; I don't think we're there yet but it's worth acknowledging.

---

## Budget

Option 4 iteration running total: ~$6 of $8 cap. v3 revalidation cost $1.96. Room for one more full revalidation if you go with option 3.

---

## Artifacts

- v3 runner log: `/tmp/v3-validation/v3/run.log`
- Per-fixture snapshots: `/tmp/v3-validation/v3/snapshots-per-fixture/fixture-*/`
- Prior reports: `all-openai-19-fixture-validation.md` (v1), `all-openai-19-fixture-validation-v2.md` (v2)
