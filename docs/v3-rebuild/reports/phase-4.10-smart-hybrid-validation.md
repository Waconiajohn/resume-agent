# Phase 4.10 smart hybrid validation — strong-reasoning + deep-writer on GPT-4.1

**Config:** `RESUME_V3_STRONG_REASONING_BACKEND=openai` (strategize + verify → GPT-4.1; classify cached), `RESUME_V3_FAST_WRITER_BACKEND=vertex` (write-summary/accomplishments/competencies/custom-section stay DeepSeek), `RESUME_V3_DEEP_WRITER_BACKEND=openai` (write-position → GPT-4.1). Both OpenAI model env vars → `gpt-4.1`.

## Headline

**17/19 PASS, 2 total errors, $0.046/resume.** At the ship threshold. Proceeding to docs 06 + 07.

| Config | Pass | Errors | Cost/resume |
|---|---|---|---|
| Pure-DeepSeek (Phase 4.6 Step A) | 11/19 | 20 | $0.018 |
| Write-only hybrid (Phase 4.9) | 13/19 | 14 | $0.013 |
| **Smart hybrid (Phase 4.10, this run)** | **17/19** | **2** | **$0.046** |
| Pure-GPT-4.1 (Phase 4.8) | 19/19 | 0 | $0.200 |

## Per-fixture comparison

| # | fixture | 4.6 Step A | 4.9 write-only | 4.10 smart hybrid | 4.8 pure-gpt-4.1 |
|---|---|---|---|---|---|
|  1 | 01-ben-wedewer          | PASS 0 | FAIL 1 | **PASS 0** | PASS 0 |
|  2 | 02-blas-ortiz           | PASS 0 | FAIL 1 | **PASS 0** | PASS 0 |
|  3 | 03-brent-dullack        | FAIL 1 | PASS 0 | PASS 0 | PASS 0 |
|  4 | 04-bshook               | FAIL 1 | PASS 0 | PASS 0 | PASS 0 |
|  5 | 05-casey-cockrill       | PASS 0 | PASS 0 | PASS 0 | PASS 0 |
|  6 | 06-chris-coerber        | PASS 0 | PASS 0 | PASS 0 | PASS 0 |
|  7 | 07-diana-downs          | FAIL 3 | PASS 0 | PASS 0 | PASS 0 |
|  8 | 08-j-vaughn             | FAIL 1 | PASS 0 | PASS 0 | PASS 0 |
|  9 | 09-jay-alger            | FAIL 4 | FAIL 4 | **PASS 0** | PASS 0 |
| 10 | 10-jessica-boquist      | PASS 0 | FAIL 1 | FAIL 1 | PASS 0 |
| 11 | 11-jill-jordan          | FAIL 5 | PASS 0 | PASS 0 | PASS 0 |
| 12 | 12-joel-hough           | PASS 0 | FAIL 2 | **PASS 0** | PASS 0 |
| 13 | 13-lisa-slagle          | PASS 0 | PASS 0 | PASS 0 | PASS 0 |
| 14 | 14-lj-2025              | FAIL 4 | FAIL 4 | **PASS 0** | PASS 0 |
| 15 | 15-manzione             | PASS 0 | PASS 0 | PASS 0 | PASS 0 |
| 16 | 16-mark-delorenzo       | PASS 0 | PASS 0 | PASS 0 | PASS 0 |
| 17 | 17-david-chicks         | PASS 0 | PASS 0 | PASS 0 | PASS 0 |
| 18 | 18-steve-alexander      | PASS 0 | PASS 0 | PASS 0 | PASS 0 |
| 19 | 19-steve-goodwin        | FAIL 1 | FAIL 1 | FAIL 1 | PASS 0 |

Zero regressions from pure-gpt-4.1 on 17 fixtures. 2 fixtures (10, 19) still fail.

## Remaining 2 errors

### fixture-10 — structural verify false positive

Error: *"Position 1 (GoMeta) has zero bullets in WrittenResume but is listed in strategy.positionEmphasis with weight 'brief'."*

**Category: false positive.** Write-position Rule 7 explicitly says `brief`-weight positions MAY have 0 bullets ("Title and dates are sufficient for old, unrelated roles"). The writer correctly emitted 0 bullets for this short-tenure role. Verify's Check 9 ("position has no bullets") doesn't know about Rule 7's explicit permission. This is a verify-prompt gap to fix in a future phase; not a write-position quality issue.

### fixture-19 — borderline paraphrase

Error: *"The claim 'Ensured IT service desk support and training were delivered to the highest standards across AMER regions' is not fully supported by the source bullet, which states 'Ensured that IT services desk support and training...'"*

**Category: borderline.** Source says "Ensured IT services desk support and training..." (no scope qualifier). Rewrite adds "delivered to the highest standards across AMER regions." The AMER qualifier IS in source context (earlier position content); "to the highest standards" is editorial framing. Verify on GPT-4.1 correctly flagged the editorial addition. This is a real — if minor — write-side attribution issue. Pure-gpt-4.1 (Phase 4.8) did not have this issue, suggesting DeepSeek's fast-writer for summary/accomplishments may be influencing the position-writer context.

## Cost analysis

| Stage | Backend | Model | Per-resume cost |
|---|---|---|---|
| Classify | Vertex | DeepSeek V3.2 | ~$0.003 (cached in production) |
| Strategize | OpenAI | gpt-4.1 | ~$0.017 |
| Write-summary, accomplishments, competencies, custom-section | Vertex | DeepSeek V3.2 | ~$0.003 total |
| Write-position | OpenAI | gpt-4.1 | ~$0.006-0.010 (6-11 positions parallel) |
| Verify | OpenAI | gpt-4.1 | ~$0.023 |
| **Total** | | | **~$0.046/resume** |

(Classify is $0 in this experiment because `--skip-classify` reuses Phase 3.5 baselines. Production will run classify fresh, adding ~$0.003.)

## User-month projections

At 8/12/40/120 resumes per user per month:

| Config | $/resume | 8/mo | 12/mo | 40/mo | 120/mo |
|---|---|---|---|---|---|
| Pure-DeepSeek (noisy) | $0.018 | $0.14 | $0.22 | $0.72 | $2.16 |
| **Smart hybrid (this)** | **$0.049** | **$0.39** | **$0.59** | **$1.96** | **$5.88** |
| Pure-gpt-4.1 | $0.200 | $1.60 | $2.40 | $8.00 | $24.00 |

At $49/month retail:
- Standard tier (8-12 resumes): smart hybrid 0.8-1.2% of revenue
- Power tier (40 resumes): 4.0% of revenue
- Heavy tier (120 resumes): 12.0% of revenue — still acceptable at this usage class

## Ship recommendation

**Ship Option B1 (smart hybrid) as production config.** 17/19 is at the spec's threshold; both failing fixtures have a clear explanation (verify-prompt gap on Rule 7 brief weight, one borderline editorial addition) and neither is catastrophic output. Both are candidates for Phase 5 observability to measure real-world impact before any further prompt iteration.

Writing doc 06 (Production Routing) and doc 07 (Phase 5 Shadow Deploy Plan) next.
