# Phase 4.10 Final Summary

**Branch:** `rebuild/v3`
**Date:** 2026-04-18
**Status:** SHIP READY. Option B1 smart hybrid validated at 17/19. Docs 06 + 07 written and committed. Phase 5 shadow deploy can begin.

---

## 1. Final production config

**Option B1 — smart hybrid.** Validated 17/19 PASS at $0.046/resume.

```
# Capability-to-backend routing
RESUME_V3_STRONG_REASONING_BACKEND=openai   # classify (cached) + strategize + verify
RESUME_V3_FAST_WRITER_BACKEND=vertex         # write-summary, write-accomplishments, write-competencies, write-custom-section
RESUME_V3_DEEP_WRITER_BACKEND=openai         # write-position

# Models
RESUME_V3_STRONG_REASONING_MODEL_OPENAI=gpt-4.1
RESUME_V3_DEEP_WRITER_MODEL_OPENAI=gpt-4.1

# (Vertex deep-writer and fast-writer models stay at defaults: deepseek-v3.2-maas)
```

Full routing map, env vars, cost model, and failover behavior: see `docs/v3-rebuild/06-Production-Routing.md`.

---

## 2. Pass rate on the 19-fixture corpus

| Config | Pass | Errors | Cost/resume | Notes |
|---|---|---|---|---|
| Pure-DeepSeek (Phase 4.6 Step A) | 11/19 (58%) | 20 | $0.018 | Baseline; DeepSeek-write fabrications + DeepSeek-verify false positives |
| Phase 4.9 hybrid (deep-writer only) | 13/19 (68%) | 14 | $0.013 | Write-position on GPT-4.1; verify still on DeepSeek noisy |
| **Phase 4.10 Option B1 smart hybrid** | **17/19 (89%)** | **2** | **$0.046** | Write-position + strategize + verify on GPT-4.1; fast-writer on DeepSeek |
| Pure-GPT-4.1 (Phase 4.8 ceiling) | 19/19 (100%) | 0 | $0.200 | Reference ceiling |

Zero regressions from pure-GPT-4.1 on 17 fixtures. Remaining 2 failures:
- **fixture-10**: verify-side false positive (Check 9 doesn't know Rule 7 allows 0 bullets for `brief`-weight positions). Prompt-fix candidate.
- **fixture-19**: borderline write-side editorial addition ("delivered to the highest standards across AMER regions"). Minor.

Neither is catastrophic output; both are documented in doc 06 section 5 and are Phase 5 observability candidates.

---

## 3. Cost projections

| Config | $/resume | 8/mo | 12/mo | 40/mo | 120/mo |
|---|---|---|---|---|---|
| Pure-DeepSeek (noisy) | $0.018 | $0.14 | $0.22 | $0.72 | $2.16 |
| **Smart hybrid (ship config)** | **$0.046** | **$0.37** | **$0.55** | **$1.84** | **$5.52** |
| Pure-GPT-4.1 | $0.200 | $1.60 | $2.40 | $8.00 | $24.00 |

At $49/month retail:
- Standard tier (8–12 resumes): smart hybrid is 0.8–1.2% of revenue. Negligible.
- Power tier (40 resumes): 3.8% of revenue. Healthy.
- Heavy tier (120 resumes): 11.3% of revenue. Still acceptable; would be the first place to look at cost-side optimization (gpt-5.4-mini swap).

Versus the pure-GPT-4.1 ceiling, smart hybrid delivers 89% of the quality at 23% of the cost.

---

## 4. Phase 5 readiness

**Yes, ready.**

Pre-week (week 0) checklist before shadow traffic:
- [ ] `resume_v3_shadow_runs` table migration written and applied
- [ ] Shadow worker process deployed in staging with `FF_V3_SHADOW_ENABLED`
- [ ] Admin review UI built (1-day effort, reuse admin dashboard component)
- [ ] Rollback runbook at `ops/runbooks/v3-rollback.md`
- [ ] OpenAI tier verified for expected shadow volume (~500 RPM headroom needed)
- [ ] Staging → prod env-var parity confirmed
- [ ] Smoke test: 5 live v2 pipelines with shadow enabled, confirm shadow rows are being written

Once the checklist is clear, flip `FF_V3_SHADOW_ENABLED=true` in production and begin Gate 1 (weeks 1–2). Full timeline + gate criteria in `docs/v3-rebuild/07-Phase-5-Shadow-Deploy-Plan.md`.

**Phase 5 total duration: 8 weeks from kickoff to v3 fully promoted.** Compressing risks missing real-user dispersion effects the 19-fixture corpus cannot capture.

---

## 5. The one decision for John

**Approve Phase 5 shadow deploy kickoff?** Yes/no.

If yes:
- Next session is the pre-week prep (migration, shadow worker, admin UI, runbook).
- Phase 5 execution estimated at 8 weeks through v3 full promotion.
- Budget: shadow traffic alone is $0.046 × (v2 traffic volume). At current usage that's <$50/month for the full shadow period. OpenAI tier and Vertex quota both have headroom.

If no (needs more validation):
- Candidate add-on work: 2-fixture prompt fixes for fixture-10 verify Check 9 + fixture-19 borderline edit. Would push validation to 19/19 at ~$0.50 iteration cost. Could run in parallel with shadow prep if yes is conditional on 19/19.
- Alternative: fold gpt-5.4-mini swap into Phase 4.11 validation if OpenAI project access has stabilized. Could reduce per-resume cost ~30% with one env var change + one re-validation run.

My recommendation: kick off Phase 5 shadow prep now. The 17/19 result meets the spec's ship threshold with clear explanations for the 2 failures, and the shadow window itself provides 4 weeks of real-user data to drive any further prompt iteration before v3 becomes user-visible.

---

## Phase 4.10 commits on `origin/rebuild/v3`

- `8c9485f8` — Phase 4.10 smart hybrid validation report
- `22d2d9ad` — doc 06 Production Routing
- `f0cdaacc` — doc 07 Phase 5 Shadow Deploy Plan
- (this commit) — Phase 4.10 final summary

**Phase 4.10 LLM spend: ~$0.90** (19-fixture smart hybrid run at $0.046/resume, plus handful of sequential retry runs for stale fixtures). Well under the $5 cap.

Combined v3 rebuild spend across Phases 4.5–4.10: ~$8.50. Rebuild validation complete.
