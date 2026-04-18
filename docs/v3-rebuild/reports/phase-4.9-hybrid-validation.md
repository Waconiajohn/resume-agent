# Phase 4.9 hybrid validation — deep-writer only on GPT-4.1

**Config:** `RESUME_V3_DEEP_WRITER_BACKEND=openai` (write-position → GPT-4.1), everything else on DeepSeek-on-Vertex. Strategize v1.2, write-position v1.4, verify v1.2 (reverted from v1.3), extractor with word-bag matching.

## Headline

**13/19 PASS, 14 total errors, $0.013/resume.**

| Config | Pass | Errors | Cost/resume |
|---|---|---|---|
| Phase 4.6 Step A (pure-DeepSeek) | 11/19 | 20 | $0.018 |
| Phase 4.8 (pure-gpt-4.1) | 19/19 | 0 | $0.200 |
| **Phase 4.9 hybrid (this run)** | **13/19** | **14** | **$0.013** |

Below the 17/19 ship threshold. Per spec stop condition (`<14/19 → halt`), not proceeding to docs 06/07.

## Per-fixture comparison

| # | fixture | 4.6 Step A (all-DeepSeek) | 4.8 pure-gpt-4.1 | 4.9 hybrid (this) |
|---|---|---|---|---|
|  1 | 01-ben-wedewer          | PASS 0 | PASS 0 | **FAIL 1** |
|  2 | 02-blas-ortiz           | PASS 0 | PASS 0 | **FAIL 1** |
|  3 | 03-brent-dullack        | FAIL 1 | PASS 0 | PASS 0 |
|  4 | 04-bshook               | FAIL 1 | PASS 0 | PASS 0 |
|  5 | 05-casey-cockrill       | PASS 0 | PASS 0 | PASS 0 |
|  6 | 06-chris-coerber        | PASS 0 | PASS 0 | PASS 0 |
|  7 | 07-diana-downs          | FAIL 3 | PASS 0 | PASS 0 |
|  8 | 08-j-vaughn             | FAIL 1 | PASS 0 | PASS 0 |
|  9 | 09-jay-alger            | FAIL 4 | PASS 0 | **FAIL 4** |
| 10 | 10-jessica-boquist      | PASS 0 | PASS 0 | **FAIL 1** |
| 11 | 11-jill-jordan          | FAIL 5 | PASS 0 | PASS 0 |
| 12 | 12-joel-hough           | PASS 0 | PASS 0 | **FAIL 2** |
| 13 | 13-lisa-slagle          | PASS 0 | PASS 0 | PASS 0 |
| 14 | 14-lj-2025              | FAIL 4 | PASS 0 | **FAIL 4** |
| 15 | 15-manzione             | PASS 0 | PASS 0 | PASS 0 |
| 16 | 16-mark-delorenzo       | PASS 0 | PASS 0 | PASS 0 |
| 17 | 17-david-chicks         | PASS 0 | PASS 0 | PASS 0 |
| 18 | 18-steve-alexander      | PASS 0 | PASS 0 | PASS 0 |
| 19 | 19-steve-goodwin        | FAIL 1 | PASS 0 | **FAIL 1** |

6 fixtures that passed on pure-gpt-4.1 fail on the hybrid.

## Error categorization — 11 of 14 errors are verify false positives

I read every error and source-compared. Categorization:

**~11 verify false positives** (verify-on-DeepSeek flags tense changes, whitespace differences, paraphrase reorderings that gpt-4.1 verify would not emit):

| Fixture | Error | Source actually says | Classification |
|---|---|---|---|
| 01 | "by standardizing GitHub Actions CI" not found | "standardized GitHub Actions CI/CD pipelines" | Tense mismatch (-ing vs past participle) |
| 02 | "by leading a major contract with ExxonMobil" not in source | "Spearheaded a major contract with ExxonMobil, securing over $1M" | Paraphrase reorder |
| 09 pos[0].bullets[2] | "1.2M in" missing | "$1.2M of revenue in first year" | Explicit self-contradiction: *"claim is verified, no error"* + emitted as error |
| 09 pos[2].bullets[1] | "by analyzing sales history datasets" missing | "combing sales history datasets" | Self-contradiction: verify says "claim is verified" |
| 10 | position[1] has zero bullets but has weight brief | — | Verify doesn't know Rule 7 allows 0-bullet briefs |
| 12 bullets[1] | "$100 million in inventory" not found | "$100million" (no space) | Whitespace mismatch |
| 12 bullets[2] | "$1.3 million" and "6,300 tons" not found | "$1.3million" (no space), "6300 tons" (no comma) | Whitespace + comma mismatch |
| 14 pos[3].bullets[0] | "through onboarding and oversaw product knowledge" | "through onboarding and oversee comprehensive product knowledge" | Tense mismatch + extra "comprehensive" |
| 14 pos[4].bullets[0] | "Led Deployment Services" fabricated | "Lead Deployment Services team" | Tense mismatch |
| 14 pos[4].bullets[1] | "10.7M in" not found | "$10.7M (2010)" | Parenthesis → "in" substitution |
| 14 pos[5].bullets[1] | "Led Deployment Activations" fabricated | "Lead Deployment Activations team" | Tense mismatch |

**3 real issues (would fail on pure-gpt-4.1 too if not for gpt-4.1's better write-side output):**

| Fixture | Error | Classification |
|---|---|---|
| 09 summary | "he" pronoun with `resume.pronoun: null` | Real — write-summary on gpt-4.1 leaked pronoun |
| 09 pos[5].bullets[2] | Firm language with `evidence_found: false` | Real — write-position used "Drove" when it should have used softer language given uncertain attribution |
| 19 pos[1].bullets[1] | "delivered to the highest standards across AMER regions" not fully supported | Borderline — source says similar but more hedged |

## Interpretation

The hybrid fixes DeepSeek-write's fabrications (strategize v1.2 + GPT-4.1 write-position). It does NOT fix DeepSeek-verify's self-consistency issue, which was the dominant failure class on Phase 4.6 Step A and remains dominant here.

On **pure-GPT-4.1 (Phase 4.8)**, these verify false positives vanish because GPT-4.1 is more careful about tense/whitespace/paraphrase matching. The "hybrid fixes only write-position" approach leaves verify as the weak link.

## Options from here

### Option B1 — SMART hybrid: also route verify to GPT-4.1

Set additionally:
- `RESUME_V3_STRONG_REASONING_BACKEND=openai` (routes classify/strategize/verify to OpenAI — but classify is cached via `--skip-classify` in production anyway)

Projected outcome: ~17-19/19 (11 of the 14 errors disappear when verify-on-GPT-4.1 doesn't emit tense/whitespace false positives).

Projected cost: roughly $0.045/resume for the OpenAI portion (strategize ~$0.005 + verify ~$0.02 + write-position ~$0.02), plus ~$0.008/resume for the fast-writer DeepSeek stages = **~$0.05/resume total**. That's 4× DeepSeek cost, ~1/4 of pure-gpt-4.1 cost.

Needs a $1.50 re-validation run to confirm. High-probability path to ship config.

### Option C — Ship pure-GPT-4.1 (known 19/19)

Measured at $0.20/resume. Safest. Enterprise-tier config.

### Option A — Accept hybrid at 13/19

Ship with the current hybrid (13/19) and known verify noise on ~30% of resumes. Not recommended — the noise is eliminated by a single env var change (B1).

## Recommendation

**Run Option B1 validation next.** Cost ~$1.50. Expected 17-19/19. If it hits, ship that config in doc 06. One more validation round; not a deeper architectural issue.

The diagnosis from Phase 4.6 Step A ("verify's DeepSeek compliance is the remaining gap") matches exactly what we see here. Routing verify to GPT-4.1 closes that gap without paying for GPT-4.1 on the cheap fast-writer stages.
