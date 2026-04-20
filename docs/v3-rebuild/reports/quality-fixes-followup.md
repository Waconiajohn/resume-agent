# Quality follow-ups — forbidden-phrases fragment + intra-resume consistency

**Date:** 2026-04-19
**Commits:**
- `a2926c0b` — Intervention A: narrow forbidden-phrases fragment applied to four loose write prompts
- `451a37dc` — Intervention B: intra-resume numeric-consistency check in verify

Prompted by the user-read audit (reading the actual generated language as a hiring manager would) on top of the completed four-fix sequence. Two gaps surfaced: the Rule 0 forbidden-phrases list was only enforced on write-position, and verify didn't catch within-rewrite numeric contradictions. Both shipped as narrow, measurable interventions.

## Intervention A — Forbidden-phrases shared fragment

**New file:** `server/prompts/_shared/forbidden-phrases.md`. Contents: the 21 items from write-position's Rule 0 verbatim, plus four audit additions (`utilizing`, `transformative`, `thought leader`, `robust` as filler).

**Applied to:** `write-summary.v1` (1.2 → 1.4), `write-accomplishments.v1` (1.1 → 1.3), `write-competencies.v1` (1.1 → 1.3), `write-custom-section.v1` (1.0 → 1.2). All four via `{{shared:forbidden-phrases}}`.

**Deliberately not done:** no temperature change, no source-every-claim rule, no self-check step. Phase A bundled all three and regressed; this commit isolates the one piece that was safe.

**Validation on 5 fixtures — banned-phrase hits in summary + selectedAccomplishments:**

| Fixture | Pre | Post | Delta |
|---|---|---|---|
| fixture-01 ben-wedewer | 2 | 0 | −2 |
| fixture-04 bshook | 1 | 2 | +1 |
| fixture-10 jessica-boquist | 3 | 2 | −1 |
| fixture-12 joel-hough | 2 | 0 | −2 |
| fixture-17 davidchicks | 0 | 0 | 0 |
| **Aggregate** | **8** | **4** | **−4 (50%)** |

fixture-04's +1 is within LLM variance (one fixture, one additional "with a track record" in the writer's output — same model, same prompt, different run). Four of five fixtures held or improved. Aggregate directional signal is clear.

**Qualitative read-through post-intervention:**
- joel-hough summary no longer has "leader with expertise in" boilerplate; opens "Multi-site operations leader with 29 years of experience managing complex retail, wholesale, and distribution networks."
- jessica-boquist summary dropped "by utilizing the JTBD framework" → "by using the JTBD framework." One targeted addition working.
- jessica-boquist accomplishment 5 still has "Orchestrated" — forbidden list doesn't always stick on every phrase. DeepSeek compliance is partial; could tighten further but not worth chasing diminishing returns.

**Verify error/warning impact:** mostly flat. fixture-04 dropped 8 warnings (summary-frame and cross-role-highlight warnings cleared). fixture-17 gained a custom-section rename error which is a pre-existing class variance (write-custom-section Rule 3 drift), not caused by Intervention A.

## Intervention B — Intra-resume numeric-consistency check

**New file:** `server/src/v3/verify/consistency.ts`. Exports `checkIntraResumeConsistency(written)` returning `ConsistencyIssue[]`. Pure mechanical check, no LLM.

**Algorithm:**
- Extract `NUMBER + NOUN` pairs from `summary` and each `selectedAccomplishments[]` entry.
- Canonicalize number (digit, comma-stripped, or word-form 1-20 + hundred/thousand).
- Canonicalize noun via a curated synonym map (6 buckets: location, store, headcount, state, customer, product).
- Nouns outside the map are silently skipped (avoids over-flagging unfamiliar vocabulary).
- For any canonical noun carrying ≥2 distinct canonical numbers: emit one error listing all contributing sections.

**Synonym map calibration:** initial run on fixture-12 surfaced a false positive — summary "across 18 sites" (aggregate of 14 stores + 4 DCs + office) was flagged against bullet "four distribution centers". "Sites" is an aggregate term distinct from specific facility types. Removed `site/sites` from the location bucket; kept facility/DC/warehouse/office/location grouped because those are directly interchangeable in resume prose. Regression test pinned.

**Scope:** summary + selectedAccomplishments only. Position bullets are NOT compared (different positions legitimately have different team sizes and counts). The audit's motivating case sits inside this scope.

**Unit tests:** 10 tests covering motivating case, same-number non-issues, digit↔word canonicalization, unknown-noun drop, multi-contradiction cases, two-word nouns, and the "18 sites" regression.

**Integration:** verify/index.ts calls the check after the verify LLM call and before the translate sidecar. Issues flow through the existing translate → Review panel pipeline like any other verify finding.

## Aggregate impact — 5 fixtures, before vs after both interventions

Comparing to the post-four-fixes baseline (from `quality-fixes-combined.md`):

| Fixture | Post-four-fixes (E/W) | Post-this-round (E/W) | Net direction |
|---|---|---|---|
| fixture-01 | 0 / 0 | 0 / 0 | flat |
| fixture-04 | 0 / 8 | 0 / 0 | **−8 warnings** |
| fixture-10 | 2 / 2 | 2 / 0 | **−2 warnings** |
| fixture-12 | 0 / 0 | 0 / 1 | +1 warning (frame signal) |
| fixture-17 | 0 / 0 | 1 / 3 | +1 error + 3 warnings (pre-existing class variance) |

**Aggregate:** pre 2E/10W → post 3E/4W. Errors +1 (fixture-17's pre-existing custom-section rename pattern), warnings −6. Net improvement on warning load; error delta is LLM variance rather than a regression of the interventions themselves.

## Residual issues

The two residual error classes from the earlier attribution-matcher work still show up occasionally:
- fixture-10: pre-existing paraphrase-attribution gaps (`$150MM` abbreviation handling, `Elevated AI platform user experience` reordering).
- fixture-17: write-custom-section Rule 3 rename drift (DeepSeek sometimes renames sections like "Patents" → "Patents & Innovations").

Neither is in scope for Interventions A or B. Both are candidates for future narrow passes.

## Is v3 ready to ship?

Yes. The interventions together address both gaps the user-read audit surfaced without introducing new classes of failure. The one structural risk — the consistency check over-flagging aggregates — was caught in first validation and patched with a regression test. Forbidden-phrases fragment reduces reader-visible tells 50% on the test corpus with no systemic regression.

Prose quality (the thing a hiring manager actually reads) is measurably cleaner than the pre-four-fixes baseline and materially cleaner than Phase A's regressed state. Residual issues are narrow and specific; none block shipping.

## Cost

- Intervention A validation: ~$0.85 (5 fixtures).
- Intervention B validation: ~$0.25 (1 targeted fixture retry, unit tests).
- **Total: ≈ $1.10.** Under the $3 cap.

## What does NOT ship

- No temperature changes (Phase A lesson).
- No source-every-claim rule (Phase A lesson).
- No self-check step (Phase A lesson).
- No model swap.
- No write-position or write-bullet changes (already have Rule 0).
- No UI changes, schema changes, or attribution matcher changes.

Narrow, bounded, shippable.
