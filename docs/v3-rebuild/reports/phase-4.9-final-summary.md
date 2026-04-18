# Phase 4.9 Final Summary

**Branch:** `rebuild/v3`
**Date:** 2026-04-18
**Status:** Halted at the 17/19 ship decision gate. Docs 06/07 deferred by one more validation run.

## 1. Final production config (or what's blocking)

Not finalized. The current hybrid config (GPT-4.1 write-position + DeepSeek for all other stages) hit **13/19**, below the 17/19 threshold. The gap is **verify false positives on DeepSeek**, not architectural. Recommended next step is one more validation run that also routes verify to GPT-4.1.

**Projected ship config** (pending Option B1 validation):
- `RESUME_V3_STRONG_REASONING_BACKEND=openai` (classify cached; strategize + verify to GPT-4.1)
- `RESUME_V3_FAST_WRITER_BACKEND=vertex` (DeepSeek for write-summary/accomplishments/competencies/custom-section)
- `RESUME_V3_DEEP_WRITER_BACKEND=openai` (GPT-4.1 for write-position)

## 2. Pass rate on the 19-fixture corpus

| Config | Pass | Errors | Cost/resume |
|---|---|---|---|
| Pure-DeepSeek (baseline) | 11/19 (58%) | 20 | $0.018 |
| Phase 4.9 hybrid (deep-writer only) | 13/19 (68%) | 14 | $0.013 |
| Pure-gpt-4.1 (measured ceiling) | 19/19 (100%) | 0 | $0.200 |
| Option B1 smart hybrid (projected) | 17-19/19 (89-100%) | — | ~$0.05 |

## 3. Cost per resume and projected per-user-month costs

At 12, 40, 120 resumes/user/month:

| Config | $/resume | 12 res/mo | 40 res/mo | 120 res/mo |
|---|---|---|---|---|
| Pure-DeepSeek | $0.018 | $0.22 | $0.72 | $2.16 |
| Phase 4.9 hybrid | $0.013 | $0.16 | $0.52 | $1.56 |
| **Option B1 smart hybrid (projected)** | **$0.05** | **$0.60** | **$2.00** | **$6.00** |
| Pure-gpt-4.1 | $0.20 | $2.40 | $8.00 | $24.00 |

At $49 retail and typical 8-12 resumes/month, Option B1 sits at $0.40-$0.60/user-month — under 2% of revenue. Pure-gpt-4.1 is still viable at standard tier but more expensive than necessary.

## 4. Ready for Phase 5 shadow deploy? Yes/no with specifics

**Not yet — needs one more validation round.**

Blocker: confirm Option B1 (smart hybrid with verify on GPT-4.1) hits 17+/19 on the 19-fixture corpus.

**Unblocking work:**
- One 19-fixture run with `RESUME_V3_STRONG_REASONING_BACKEND=openai` + `RESUME_V3_DEEP_WRITER_BACKEND=openai`.
- Cost: ~$1.50.
- Expected outcome: 17-19/19 (11 of 14 Phase 4.9 errors are DeepSeek-verify false positives that disappear with GPT-4.1 verify; 3 real issues may or may not remain).
- Duration: ~15 minutes end-to-end with batched runs.

If Option B1 hits 17+/19: doc 06 + doc 07 + Phase 5 shadow deploy kickoff.
If Option B1 hits 14-16/19: inspect remaining 3-4 errors and prompt-tune.
If Option B1 hits <14/19 (very unlikely given the 11-error-to-noise analysis): escalate to pure-gpt-4.1.

## 5. What's deferred and why

- **Doc 06 (Production Routing):** deferred one validation round. Writing it prematurely would document a 13/19 config that's not the final ship target.
- **Doc 07 (Phase 5 Shadow Deploy Plan):** deferred with doc 06 — they're written together.
- **GPT-5.4-mini retry:** OpenAI project's GPT-5 access is unstable under parallel load (Phase 4.8 finding). Once stable, one env var swap (`RESUME_V3_DEEP_WRITER_MODEL_OPENAI=gpt-5.4-mini`) drops Option B1 cost further.
- **Verify v1.3 refinement:** abandoned after Phase 4.7 regression. The proper fix for DeepSeek-verify false positives is routing to GPT-4.1, not more prompt iteration.

## 6. The one remaining decision John needs to make

**Run Option B1 validation now?** Yes/no.

If yes: I execute the 19-fixture smart-hybrid run (~15 min, ~$1.50). On a 17+/19 result, I immediately write doc 06 + doc 07 + a revised final summary, and we're ready for Phase 5 execution kickoff.

If no (or "use Option C instead"): I write doc 06/07 for pure-gpt-4.1 (Option C) as the ship config. Phase 5 ready immediately; just more expensive in perpetuity.

---

**Phase 4.9 commits on `origin/rebuild/v3`:**
- `d9a4d9e4` — Phase 4.9 hybrid validation report with failure categorization
- (this commit) — final summary

Phase 4.9 LLM spend: ~$0.25 (19-fixture run at hybrid cost profile). Well under the $5 budget; the remaining $4.75 covers the Option B1 validation plus headroom for Option C if needed.
