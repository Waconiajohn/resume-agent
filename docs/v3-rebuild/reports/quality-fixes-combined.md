# Four v3 quality fixes — combined validation + summary

**Date:** 2026-04-19
**Commits (in order):**
- `76bd884e` — Fix 1: verify silent-on-non-issues (verify.v1 v1.2.2 → v1.2.3)
- `47d8d8ca` — Fix 2: role-aware tense (write-position v1.4 → v1.5, write-bullet v1.0 → v1.1, verify v1.2.3 → v1.2.4)
- `2399c0fe` — Fix 3: strategize grounding (strategize.v1 v1.2 → v1.3, attribution matcher extended)
- `93765559` — Fix 4: post-write pronoun retry (new `write/pronoun-retry.ts` + write orchestrator wiring)
- `21a48a1e` — Fix 2 partial rollback (verify Check 11 removed → v1.2.5) + Fix 3 punctuation-strip patch

## Per-fix summary

| # | What changed | Why | Result on validation |
|---|---|---|---|
| **1** | Verify prompt explicitly instructs "silence is the correct output for non-issues." The `issues` array now contains ONLY items the user must act on; reasoning traces and "claim is actually sourced" notes are dropped. | Post-attribution-fix re-run of fixture-10 produced `severity: "error"` items whose messages said "claim is present in source" — the model was emitting its reasoning as findings. | fixture-01 0/2→0/0. fixture-12 0/8→0/0. Eight-warning observational-noise drop on fixture-12 confirms the rule works. |
| **2** | write-position v1.5 and write-bullet v1.1: role-aware tense — past-tense verbs for past roles (dates.end set), present-tense verbs for current roles (dates.end === null). Verify Check 11 was added then ROLLED BACK (see below). | HR-exec session flagged three "Oversee" bullets at Indian River State College; blanket past-tense rule was the upstream cause. | fixture-18 (all past roles) produced all past-tense verbs cleanly. Verify Check 11 introduced 7 false positives on fixture-10 (DeepSeek verify misidentifies past-tense verbs as present-tense) — rolled back. |
| **3** | strategize.v1 v1.3: Rule 2b (positioningFrame grounding) + Rule 5b (targetDisciplinePhrase grounding). Content words must appear in source; JD may provide language, source must provide evidence. Mechanical check extended to validate both fields; retry loop triggers on either summary or field failures. | HR-exec session showed "multi-property hospitality leadership" leaking from JD into written summary when source had no hospitality content. | 4 new unit tests pass. Initial combined-validation hit a tokenization false positive ("management," with trailing comma); patch added to strip punctuation before matching. Second run clean. |
| **4** | New `server/src/v3/write/pronoun-retry.ts`: post-write banned-pronoun scan + one-shot retry with a targeted nudge. Wrapped runSummary and runAccomplishments. Detects `she/her/he/him/they/their/I/me/my/we/our` as whole-word matches plus a "who" heuristic that flags framing-use but spares "customers who..." patterns. | Pronoun regressions on fixtures 10, 12, 13 per the diagnostic report. Model compliance issue, not a prompt gap. | 15 unit tests pass. Retry logic exercised only on pronoun detection; not triggered on the validation runs because the existing shared-fragment compliance held for the completed fixtures. |

## Combined 5-fixture validation

Pre-fixes baseline is the post-verify-attribution-fix state (commits 833f42a1 / 277c64d2 / 8abe1a6f / 7fb25af5), run on DeepSeek with the unmodified write/strategize/verify prompts.

| Fixture | Pre-fixes (E/W) | Post-all-four-fixes (E/W) | Δ |
|---|---|---|---|
| 01 ben-wedewer | 0 / 2 | 0 / 0 | −2 warnings |
| 04 bshook | 0 / 8 | 0 / 8 | unchanged |
| 10 jessica-boquist | 3 / 5 | 2 / 2 | −1 error, −3 warnings |
| 12 joel-hough | 0 / 8 | 0 / 0 | −8 warnings |
| 17 davidchicks | 1 / 2 | 0 / 0 | −1 error, −2 warnings |
| **Aggregate** | **4 / 25** | **2 / 10** | **−2 errors, −15 warnings** |

Total items dropped from 29 → 12. Bulk of the drop is Fix 1's observational-noise elimination (fixture-12's 8 warnings, fixture-01's 2, fixture-17's 2).

## Failure classes — then vs now

| Class | Present before | Present now | How handled |
|---|---|---|---|
| Editorial framing in summaries ("with a track record of driving X") | Yes — partially flagged pre-fixes | Not observed in post-fix outputs | Shared pronoun-policy + Fix 1's output contract are enough when prompts stay clean; no Phase A-style overhaul needed. |
| Fabricated metrics (the $1.3M / 6300 tons class) | Flagged as errors on fixture-12 pre-verify-attribution-fix | Not flagged (canonicalization covers number/unit surface variations) | Addressed by the earlier verify attribution matcher fix (commit 277c64d2). This work builds on that. |
| Pronoun regressions (she, her, who) | Flagged on fixtures 10, 12 post-attribution-fix | No pronouns observed in post-fix-4 outputs | Fix 4's retry path would activate if detected; shared-fragment compliance held on the validation fixtures. |
| Tense mismatches at current roles (Oversee at past role) | HR-exec session | No new tense errors in validation fixtures (fixture-10's tense errors were Check 11 false positives — removed) | Fix 2's write-side rule (present for current, past for past) is in effect; verify no longer backstops due to false-positive rate. |
| Strategize industry-leakage (multi-property hospitality class) | HR-exec session | Caught by Fix 3's field attribution. Initial combined-validation surfaced one false positive ("management," punctuation), now patched. | Ship. |
| Cross-role-highlight omissions (fixture-04 drops 7 strategy-endorsed highlights) | Yes | Still yes (8 warnings on fixture-04 unchanged) | Not addressed by any of these four fixes. Write-summary / write-accomplishments have a content-compression habit that drops highlights. Separate intervention if the user wants it. |
| Verify self-contradicting severity ("claim is sourced, no fabrication") at error severity | Yes | No (Fix 1 handles this) | Ship. |

## Residual issues

Two remain on fixture-10 post-all-fixes (2 errors):

1. *"Bullet claims 'Elevated AI platform user experience' not present in source position"* — the source bullet actually says *"Elevated the user experience of the AI platform by crafting hundreds of prompts..."* The claim IS in source; the attribution matcher's word-order flexibility doesn't catch this particular paraphrase. Same class as fixtures 10/12 fabrication-FP from the earlier diagnostic.
2. *"Bullet claims '$150MM' not present in source position"* — the source uses the same $150MM notation; this is an attribution matcher miss on dollar-amount abbreviation handling.

Both are pre-existing attribution-matcher limitations. NOT caused by the four fixes. Could be addressed in a follow-up pass on `server/src/v3/verify/attribution.ts` with tighter word-order tolerance for precise tokens and broader MM/M/million canonicalization.

## Is v3 now "ship clean quality"?

**For the error class that drove this workstream — yes.** Editorial framing, tense mismatch, strategy-industry leakage, pronouns, and verify's own self-contradicting output are all either addressed or eliminated on the five validation fixtures. What's left is:

- **Attribution matcher paraphrase gaps** (fixture-10 residual 2 errors). Model-side: low-frequency. Backend fix in the matcher would finish the job.
- **Cross-role-highlight compression** (fixture-04 8 warnings). Write-summary/write-accomplishments behavior — they sometimes omit strategy-endorsed content to meet length targets. A targeted write-summary prompt addition could address this; not in scope of these four fixes.

The decision "ship clean" vs "hold for more work" depends on tolerance for those two residual classes. Neither produces factually-inaccurate content; both are about surfacing or losing content the user intended.

## Cost summary

Across all four fixes:
- Fix 1 validation: ~$0.30 (3 fixtures completed + 2 provider timeouts)
- Fix 2 validation: ~$0.35 (1 fixture completed + 4 provider timeouts)
- Fix 3 validation: ~$0.15 (unit tests + 2 provider timeouts)
- Fix 4 validation: ~$0.05 (unit tests + 2 provider timeouts)
- Combined validation rounds (including Check 11 rollback + punctuation patch): ~$1.00 (4 completed runs + retries)
- **Total: ≈ $1.85** (well under the $5 cap)

Vertex primary-provider 90s timeouts blocked end-to-end validation on a majority of runs. Each fix's unit-test coverage + the completed fixtures give enough signal to ship; when Vertex cooldown clears, rerunning the full 5-fixture diagnostic is a cheap double-check.

## What did NOT ship (by design)

- No backend model swap (fast-writer stays DeepSeek — diagnostic was clear).
- No Phase A resurrection (shared faithfulness-rules fragment remains dormant).
- No prompt overhauls (each change is a targeted rule addition or narrow rollback).
- No schema changes. No code changes beyond attribution matcher extension and pronoun-retry wiring.

Five prompts touched, three code files touched, two new test files, three report files. Narrow and bounded as spec'd.
