# Verify attribution matcher — pre-fix audit

**Date:** 2026-04-19
**File audited:** `server/src/v3/verify/attribution.ts` (460 lines)
**Callers:** `server/src/v3/verify/index.ts` (main verify pre-check) and `server/src/v3/strategize/index.ts` (Phase 4.6 attribution-retry loop).
**Purpose of this doc:** document current matcher behavior before I change it, so the before/after delta is auditable.

## Public API surface

Two exported functions do the attribution work, plus a shared token extractor:

| Function | Consumer | Scope |
|---|---|---|
| `checkAttributionMechanically(written, source)` | `verify/index.ts` before the verify LLM call. Pre-checks every `is_new=true` bullet in each written position against that position's source material. Results feed the verify LLM prompt as structured evidence; verify still judges, but with concrete "missing token" hints. | Position-scoped haystack (per-position). |
| `checkStrategizeAttribution(strategy, source)` | `strategize/index.ts` inside the one-retry loop. Checks every `Strategy.emphasizedAccomplishments[].summary` against the whole-resume haystack. If any summary has missing tokens, strategize retries once with the flags surfaced. | Resume-wide haystack. |
| `extractClaimTokens(text)` / `extractClaimTokensTyped(text)` | Both functions above. Pulls atomic claim units out of text: dollar amounts, percentages, number+unit tuples, quoted strings, proper-noun phrases, acronyms, and "by/through X-ing" framing constructs. | N/A — pure extractor. |

## Token extraction — what counts as a claim

From `extractClaimTokensTyped()` (lines 262–324). Tokens are classified as either **`precise`** (substring-matched) or **`frame`** (word-bag matched, Phase 4.7 addition to tolerate paraphrase in framing constructs).

**Precise kinds:**

1. **Dollar amounts** — `/\$[\d.,]+\s*(?:[KMBkmb]|million|billion|thousand)?/g`.
   Catches `$40M`, `$1.3 million`, `$1.3million`, `$500K`, `$1,300`. The regex requires a `$`; naked numeric claims like `1.3 million dollars` slip through.
2. **Percentages** — `/\d+(?:\.\d+)?\s*%/g` and a wordy variant `/\d+(?:\.\d+)?\s*percent\b/gi`. Catches `22%`, `22 %`, `22 percent`.
3. **Number+unit tuples** — `/(?:~|>|<)?\d+(?:[.,]\d+)?[KMB]?\s+[A-Za-z][A-Za-z\-/]*/g`. A number followed by one adjacent noun. Filters out time-units (year/month/week/day/hour) and stray preposition-only tails. Catches `6,300 tons`, `742 staff`, `85 staff`, `15 Agile`, `3 days`.
4. **Quoted strings** — `/["""']([^"""']{3,})["""']/g`. The inner content is added as a precise token.
5. **Proper-noun phrases (2+)** — `/\b([A-Z][a-zA-Z]+(?:\s+(?:[A-Z][a-zA-Z]+|of|the|and|&)\s+)*(?:\s+[A-Z][a-zA-Z]+)+)\b/g`, filtered to length ≥ 6. Catches `Agile Release Trains`, `Scaled Agile Framework`.
6. **Acronyms** — `/\b([A-Z]{2,}(?:[\/&][A-Z]+)?s?|[A-Z]+[a-z]*[A-Z]+(?:[\/&][A-Z]+)?)\b/g`. Catches `CI/CD`, `SAFe`, `ERP`, `SCARs`.

**Frame kind (Phase 4.7):**

7. **"by/through [verb]-ing X"** — `/\b(?:by|through)\s+[a-z]+ing\s+[a-z][a-z\s-]{2,40}/gi`. Length filter ≥ 15. Matched by word-bag (content words after dropping stopwords must all appear in source, order-independent).

## Haystack construction

`buildPositionHaystack(sourcePos, source)` (lines 409–417) assembles the text a per-position bullet is checked against:

```
parts.push(sourcePos.title ?? '');
if (sourcePos.scope) parts.push(sourcePos.scope);
if (sourcePos.location) parts.push(sourcePos.location);
for (const b of sourcePos.bullets) parts.push(b.text);
for (const h of source.crossRoleHighlights) parts.push(h.text);
```

Included: `title`, `scope`, `location`, per-position `bullets[].text`, resume-wide `crossRoleHighlights[].text`.

Missing:
- `sourcePos.company` — company name not in the haystack. Claims that reference the company ("at Travelport", "Flexential") will only match via proper-noun capture if the bullet text repeats the company name.
- `sourcePos.dates.raw` — year ranges aren't available. Claims like "2020-2025" or "over 5 years" can't match dates.
- `source.discipline` — the resume-wide discipline field (a short natural-language phrase describing the candidate's domain) isn't per-position accessible.
- `source.customSections[]` — board seats, patents, awards, speeches. If a written bullet pulls from customSections (rare but legal), the position-scoped haystack won't include it.
- `source.education` / `source.certifications` / `source.skills` — listed source fields not covered. These rarely surface in bullet claims but can (e.g., "MBA from Wharton" or "PMP-certified" in a summary).

`buildResumeHaystack(source)` (lines 424–442, used by the strategize-summary checker) is broader — adds `discipline`, `company` per position, `customSections[].title` and `customSections[].entries[].text`. Still missing: education, certifications, skills.

## Normalization applied before matching

`normalize(s)` (lines 454–460):

```js
s.replace(/[\u2010-\u2014\u2212\u2013]/g, '-')   // unify dash types
 .replace(/\s+/g, ' ')                            // collapse whitespace
 .toLowerCase()
 .trim();
```

That's it. Three operations: dash unification, whitespace collapse, lowercase.

No number-format normalization. No comma removal. No unit-word unification. No space insertion between number-and-letter-unit.

Implication: the needle and haystack must match byte-for-byte (after the three normalizations above). Any surface variation in how a number is written breaks the match, even when the claim is identical.

## Matching rule

`haystackContains(haystack, token)` for precise tokens (line 444): pure `haystack.includes(normalize(token))`. A substring check, nothing more.

`haystackContainsFramePhrase(haystack, phrase)` for frame tokens (line 375): word-bag match. Each content word (non-stopword) must appear somewhere in the haystack. Uses substring inclusion (not word-boundary) so `"product"` matches `"products"`.

No stemming beyond the substring accept for frame-kind. No fuzzy match. No Levenshtein. No synonym table.

## How this produces the two false-positive classes from the diagnostic report

### Class 1 — Comma-less / space-less number mismatch

**Fixture-12 source bullet[0]:** *"Added 38% efficiency by adding automation into distribution center network saving nearly **$1.3million** and reducing manual lifting by **6300 tons** annually."*

**Written bullet (both configs):** *"…saving nearly **$1.3 million** and reducing manual lifting by **6,300 tons**…"* (space inserted before "million"; comma inserted into "6300"). The writer normalized the number to human-readable form — in fact the CORRECT form a reader expects.

**Matcher behavior:**
- Token extraction on written bullet → `$1.3 million`, `6,300 tons` (precise).
- `normalize()` → haystack still contains `$1.3million` and `6300 tons`. Needle is `$1.3 million` and `6,300 tons`.
- `haystack.includes("$1.3 million")` → **false** (space mismatch).
- `haystack.includes("6,300 tons")` → **false** (comma mismatch).
- Verify LLM receives these as "missing tokens" and (correctly, given the evidence it has) reports them as fabrications.

This is a pure string-normalization bug. The claims are in the source; the matcher is blind to cosmetic formatting differences.

### Class 2 — Scope-sourced content not recognized

**Fixture-12 Config A source scope:** *"Managed fourteen stores, a corporate office, and three distribution centers spanning five states (PA, NJ, MD, DE, FL) **with a staff of 742**. Directly supervised…"*

**Config B wrote "742 staff" in bullet[1].** The string `"742 staff"` (number first, unit after) does not appear contiguously in the source scope; source says `"staff of 742"` (unit first, number after).

Scope IS included in the position-scoped haystack (good), but the substring matcher can't tolerate the reordering.

Note: on this fixture Config B's classify output happened to produce `scope: null` for position[0] and rewrote the scope content into a new bullet — a separate fluke unrelated to attribution. But the matcher-reordering issue is still real: even when scope is correctly populated, `"742 staff"` written vs `"staff of 742"` in scope fails substring match.

This isn't purely a normalization fix — it requires either:
- extracting just the number and accepting any nearby noun as the unit, OR
- accepting "number in haystack AND unit in haystack within N characters" as a looser match, OR
- extracting the number separately and keeping the unit as a contextual anchor rather than a strict substring.

The cleaner fix is: canonicalize numbers to a bare-number form, then check that the bare number AND the unit token both exist in the haystack. This accepts re-ordering while still rejecting a genuine fabrication (where the number isn't in the source at all).

## Behavior summary (what changes when)

| Written bullet has… | Source has… | Current matcher verdict |
|---|---|---|
| `$40M` | `$40M` | match ✓ |
| `$40M` | `$40 million` | **no match** ✗ |
| `$40 million` | `$40M` | **no match** ✗ |
| `$1.3 million` | `$1.3million` | **no match** ✗ |
| `6,300 tons` | `6300 tons` | **no match** ✗ |
| `742 staff` | `staff of 742` | **no match** ✗ |
| `22%` | `22 percent` | **no match** ✗ |
| `$26M in automation ROI` | literally in bullet | match ✓ |
| `Travelport` (proper noun) | in position.company only | **no match** ✗ (company missing from position haystack) |
| `Agile Release Trains` | in another position's bullet | **no match** ✗ (position-scoped haystack) |

## Verdict

Matcher is substring-based with three cosmetic normalizations and no number canonicalization. This works for tokens that happen to be written in the same surface form as the source. It fails predictably for every format variation a writer might legitimately introduce (commas, spaces around units, M/million interchangeability, reordering of number/unit, written-out vs numeric percentages).

Fix scope is small and mechanical:

1. **Add number canonicalization** to `normalize()` (or to a separate `canonicalizeNumbers()` step applied after it). Before substring-matching, rewrite both needle and haystack so that number-shaped tokens take a single canonical form.
2. **Add `company` and `dates.raw` to the position-scoped haystack** so proper-noun and date claims match.
3. **Consider number-plus-unit decoupling** for cases like "742 staff" vs "staff of 742". Simple version: extract the bare number; if it's in the haystack and the unit word is anywhere in the haystack, accept it. Strict version: keep current behavior and accept the reordering as a frame-kind match (word-bag).

Each fix is independently shippable and independently testable. The unit tests the user specified cover cases 1 and 3; case 2 (scope field — already covered) is confirmed working in code review above, but the unit test should still exist to pin the behavior.
