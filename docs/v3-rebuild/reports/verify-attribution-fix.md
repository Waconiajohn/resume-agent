# Verify attribution fix — summary and updated recommendation

**Date:** 2026-04-19
**Related commits:**
- `833f42a1` — audit (pre-fix behavior documented)
- `277c64d2` — fix (number canonicalization + field coverage + loose number+unit match + 15 unit tests)
- `8abe1a6f` — post-fix re-validation (re-run data at `verify-attribution-fix-data.json`)

## What the bug was

The verify attribution matcher in `server/src/v3/verify/attribution.ts` was substring-based with only three cosmetic normalizations (dash unification, whitespace collapse, lowercase). Any surface-form variation in how a number was written — commas, spaces between number and unit, "M" vs "million" — broke the match even when the claim was identical. Claims drawn from `position.company`, `position.dates.raw`, `source.discipline`, and `source.customSections` also weren't in the position-scoped haystack, so references to those fields were flagged as fabrications.

This mattered because verify is our quality oracle. Its error/warning counts drove two prior decisions:
- Phase A was declared a regression in part because fixture-12's summary gained fabrication errors ($1.3M / 6,300 tons / $100M).
- The fast-writer model-swap diagnostic reported Config B "mixed" because the same fabrication errors persisted on both configs (identical in count and substance).

Both of those reads had noise in them — the fabrications were verify false positives all along.

## What was fixed

Three changes in commit `277c64d2`:

1. **Number canonicalization** (`canonicalizeNumbers` helper added; called by `normalize()`). Unifies surface variations into a single canonical form:
   - Commas removed inside numbers (`6,300` → `6300`)
   - `percent` word → `%` (`22 percent` → `22%`)
   - Space inserted before attached unit words (`$1.3million` → `$1.3 million`)
   - Letter abbreviations expanded (`$40m` → `$40 million`, `$500k` → `$500 thousand`, `$2b` → `$2 billion`)
   Idempotent. `$1.3 million` / `$1.3million` / `$1.3M` all collapse to the same canonical form.

2. **Expanded position-scoped haystack.** `buildPositionHaystack` now explicitly lists and includes `position.company`, `position.dates.raw`, `source.discipline`, and `source.customSections` (title + entries) in addition to the existing title/scope/location/bullets/crossRoleHighlights. Explicit list in the doc comment so future audits can see coverage at a glance.

3. **Loose number+unit match fallback.** `haystackContains` now falls back to `numberUnitMatchLoose` when a plain substring fails on a `NUMBER UNIT` shaped token. The fallback accepts the pair if the number and unit both appear within 40 characters of each other in either order. Motivating case: written "742 staff" vs source scope "staff of 742". The 40-char proximity window bounds false-positive risk — the pair must cooccur in the same clause, not anywhere in the resume.

15 unit tests cover the three diagnostic failure cases plus idempotency, negative cases, and the new field coverage. 16 pre-existing strategize-attribution tests still pass.

## Re-run error counts — 5 diagnostic fixtures, DeepSeek baseline

Data: `docs/v3-rebuild/reports/verify-attribution-fix-data.json` (full error text for both runs).

| Fixture | Pre-fix (E/W) | Post-fix (E/W) | ΔErrors |
|---|---|---|---|
| 01 ben-wedewer | 0 / 1 | 0 / 2 | 0 |
| 04 bshook | 0 / 8 | 0 / 8 | 0 |
| 10 jessica-boquist | 2 / 3 | 3 / 5 | +1 |
| **12 joel-hough** | **3 / 1** | **0 / 8** | **−3** |
| 17 davidchicks | 0 / 2 | 1 / 2 | +1 |
| **Aggregate** | **5 / 15** | **4 / 25** | **−1** |

## What the data says

### Fixture-12 is the clean win

The three specific fabrication errors on "$1.3 million", "6,300 tons", and "$100 million" disappeared after the fix — exactly as predicted in the audit. Fixture-12 went from `3 errors + 1 warning` to `0 errors + 8 warnings`. The 8 new warnings are all a *different* class: verify observing that several bullets are generic framing without specific claims (e.g., *"Managed high-performing sales teams focused on acquiring, cultivating, and retaining key customer accounts"* flagged as "sourced but editorial"). This is verify doing its real job — calling out weak content. Signal, not noise.

### Fixtures 10 and 17 appear to regress, but non-deterministically

Each pipeline run produces slightly different content (write is probabilistic). The pre-fix vs post-fix comparison isn't a clean A/B because the underlying resume content changed between runs. Examples:

- **Fixture-10 post-fix had 3 errors. Two of them are new-class issues** where verify's own message text contradicts its severity label. Verify says:
  > *"The bullet claims '$150MM' revenue boost, but the source bullet states '$150MM' (same value, different abbreviation); mechanical check missed due to abbreviation difference, but **the claim is present in source**."*
  > *"The paraphrase is acceptable and **the claim is sourced, so no fabrication**."*
  Yet both are labeled `severity: "error"`. That's a separate verify-stage bug — probably in the verify prompt or the translate sidecar's severity-preservation rule — not something the attribution fix can address.
- **Fixture-17 gained 1 error** about a renamed custom section ("Patents & Innovations" vs source "Patents"). Write-custom-section Rule 3 prohibits renames; this is a real write-stage issue, not a matcher problem.

### The "elevated AI" false-positive on fixture-10 is gone

Pre-fix fixture-10 had: *"Mechanical attribution flagged 'Elevated AI' as missing, but source bullet ... contains the claim; no factual fabrication found."* That specific false positive doesn't reappear post-fix. The new paraphrase-class false positives on fixture-10 are a different verify wording issue (see above).

## Updated recommendation

**The fix is working as intended. The oracle is cleaner.** Phase A's "DeepSeek makes stuff up" diagnosis on the fabrication-class of errors was partially wrong — at least three of the fixture-12 errors driving that conclusion were matcher false positives. The editorial-tail regressions and pronoun regressions from the Phase A report are still real; the fabrication-regression slice isn't.

### What this changes for the fast-writer diagnostic

The model-swap diagnostic's headline ("mixed, leaning favorable — do not swap") stands. Re-running both configs post-fix would likely still show:
- Config B (gpt-4.1-mini) cleanly wins on pronoun compliance
- Config B has editorial tails that Config A doesn't
- Most of the fabrication-class "errors" either disappear (comma/space variants) or stay (real write-stage issues like renamed custom sections) in both configs equally

No reason to re-run the full diagnostic; the qualitative conclusion isn't sensitive to the 3 fabrication false positives that the fix eliminated.

### What this changes for write-stage work

**Narrow pronoun fix becomes the top candidate.** The recommendation matrix from the diagnostic holds, but the "hold — do nothing" path is now more viable because the noisier failure class is gone. Ranked order:

1. **Narrow pronoun fix** — detect banned pronouns post-write, one-shot retry with a nudge. This is the cleanest remaining win and doesn't require swapping the backend or tightening every write prompt. Recommended.
2. **Do nothing further on write** — with the fix, baseline verify counts are cleaner; Phase A's "regression" data should be re-read through this lens. If the remaining non-pronoun failures (cross-role-highlight drops on fixture-04, occasional renamed custom sections) aren't priorities, leaving the write stage alone is defensible.
3. **Continue investigating hybrid routing (gpt-4.1-mini only on write-summary)** — still on the table, but the pronoun-retry option is cheaper and more surgical.

### Second verify bug surfaced (not in scope here)

Post-fix testing also found that verify sometimes emits `severity: "error"` on issues whose message text explicitly says "the claim is sourced, no fabrication found" (fixture-10 examples above). That's a verify-prompt or translate-sidecar issue — the LLM should not be producing self-contradictory severity labels. Worth its own narrow audit separately from this fix.

### Do not combine this with write-prompt changes

Phase A regressed. The fix did not retry Phase A. The data here says the fabrication class had noise; that does NOT validate Phase A's approach. Any write-stage iteration should start from the reverted prompts with a narrow intervention (pronoun-retry), measure, and decide.

## Cost spent

- Post-fix re-run of 5 fixtures: ~$0.80 (within cost cap of $2).
- Total diagnostic + fix + re-run since Phase A revert: ~$1.60.
