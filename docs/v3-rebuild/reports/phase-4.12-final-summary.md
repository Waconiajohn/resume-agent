# Phase 4.12 Final Summary — 19/19 ship-ready

**Branch:** `rebuild/v3`
**Date:** 2026-04-18
**Status:** **SHIP. 19/19 PASS.** Two closed prompt fixes (verify v1.2.1, write-summary v1.2) resolved the two known fixture-level failure modes. Phase 5 Week 0 kickoff awaits paste into fresh Claude Code.

---

## 1. Final validated production config

**Option B1 — smart hybrid, with verify v1.2.1 and write-summary v1.2.**

```
# Capability-to-backend routing
RESUME_V3_STRONG_REASONING_BACKEND=openai   # classify (cached) + strategize + verify (v1.2.1)
RESUME_V3_FAST_WRITER_BACKEND=vertex         # write-summary (v1.2) + accomplishments + competencies + custom-section
RESUME_V3_DEEP_WRITER_BACKEND=openai         # write-position (v1.4)

# Models
RESUME_V3_STRONG_REASONING_MODEL_OPENAI=gpt-4.1
RESUME_V3_DEEP_WRITER_MODEL_OPENAI=gpt-4.1
```

Full routing map and failover: `docs/v3-rebuild/06-Production-Routing.md`.

---

## 2. 19-fixture pass rate

**19/19 PASS. Zero errors.**

| Phase | Pass | Errors | Notes |
|---|---|---|---|
| Phase 4.6 Step A (pure-DeepSeek) | 11/19 | 20 | model-ceiling baseline |
| Phase 4.8 (pure-GPT-4.1) | 19/19 | 0 | measured quality ceiling |
| Phase 4.10 smart hybrid (verify v1.2) | 17/19 | 2 | Option B1 first ship candidate |
| Phase 4.11 (verify v1.2.1) | 18/19 | 1 | Check 9 brief-weight fix |
| **Phase 4.12 (+ write-summary v1.2)** | **19/19** | **0** | Unit fidelity rule closes fixture-10 |

Full per-fixture table + stability runs: `docs/v3-rebuild/reports/phase-4.12-validation.md`.

---

## 3. What's been verified

Every known fixture-level issue is resolved or assigned to shadow-deploy observability.

- **Fixture-10 write-summary unit conversion (percentage → dollars).** Resolved by write-summary Rule 2b (v1.2). Three stability runs confirmed the fix holds reproducibly. Summary now uses only source-faithful figures ("15% YoY ARR growth", "$8M+", "$150MM").
- **Fixture-10 verify Check 9 false positive (brief-weight zero bullets).** Resolved by verify v1.2.1 in Phase 4.11.
- **Fixture-19 editorial phrasing ("delivered to the highest standards").** Reproducibly passing on verify v1.2.1. No intervention needed.
- **Fixture-07 cross-role-highlight coverage warnings** (8 warnings): all are strategy-highlight-not-explicitly-paraphrased warnings, not errors. Pass rate is unaffected; this is signal for shadow-deploy human review to confirm the summary-selection judgment is sound on real traffic.
- **Custom-section title case differences** (scattered warnings): cosmetic pre-existing noise; not blocking.

---

## 4. Phase 5 readiness

**YES. Ship-ready.** No further prompt iteration recommended before shadow deploy.

The infrastructure prep task is in `docs/v3-rebuild/kickoffs/phase-5-kickoff.md`. That kickoff is unchanged from Phase 4.11; it covers Week 0 deliverables (Supabase migration, shadow worker, admin UI, runbook, OpenAI tier probe, env parity, smoke test).

### ⚠ Cost correction before kickoff

Phase 4.10's cost estimate of **$0.046/resume** was substantively under-counted. The measured Phase 4.12 per-resume cost is **$0.177** (write-position dominates at ~$0.123/resume across 6–11 parallel position calls on gpt-4.1). Doc 06 and doc 07 cost sections should be amended before Phase 5 Week 0 begins. The amendment is one line each — this does NOT require reopening the rollout plan, just correcting the cost table.

**User-month impact at $49 retail (corrected):**
- Standard tier (8 resumes/mo): $1.42/user-month = 2.9% of revenue. Healthy.
- Power tier (40 resumes/mo): $7.08/user-month = 14.5% of revenue. Watch.
- Heavy tier (120 resumes/mo): $21.24/user-month = 43.3% of revenue. **Requires tier pricing or cheaper routing before shipping to this cohort.**

A Phase 6 follow-on task to evaluate gpt-5-mini on write-position ($0.50/$1.50 per M vs gpt-4.1's $2/$8) would drop the heavy-tier cost ~75% — a clear near-term optimization candidate.

This cost correction does **not** block Phase 5. 19/19 ships. But the pricing/tiering conversation should happen before heavy-tier users migrate to v3.

---

## 5. One line for John

**Paste `docs/v3-rebuild/kickoffs/phase-5-kickoff.md` into fresh Claude Code to begin Phase 5 Week 0.**

Also read `docs/v3-rebuild/reports/phase-4.12-validation.md` section "Cost correction" and amend doc 06 section 2 + doc 07 section 3 with the measured $0.177/resume figure before the kickoff session runs.

---

## 6. Combined Phase 4.5–4.12 totals (close-out)

**LLM spend**

| Phase | Spend | Focus |
|---|---|---|
| 4.5 | ~$1.20 | hybrid first pass (failed on dirty strategize) |
| 4.6 | ~$0.90 | strategize clean (v1.2 attribution retry) |
| 4.7 | ~$0.40 | verify v1.3 experiment (reverted) |
| 4.8 | ~$3.80 | pure-GPT-4.1 ceiling measurement |
| 4.9 | ~$0.25 | write-only hybrid diagnostic |
| 4.10 | ~$0.87 | smart hybrid validation |
| 4.11 | ~$0.56 | verify v1.2.1 (Check 9 fix) |
| 4.12 | ~$3.48 | write-summary v1.2 + full validation |
| **Total Phase 4.5–4.12** | **~$11.46** | |

**Pass-rate evolution**

| Milestone | Pass | Error count |
|---|---|---|
| Phase 3.5 baseline | 8/19 | ~30 |
| Phase 4.6 Step A (pure-DeepSeek) | 11/19 | 20 |
| Phase 4.10 smart hybrid | 17/19 | 2 |
| **Phase 4.12 smart hybrid (final)** | **19/19** | **0** |

**Deliverables shipped**

- 3 prompt files iterated past their initial Phase 3.5 port: `strategize.v1.md` (v1.2), `write-position.v1.md` (v1.4), `verify.v1.md` (v1.2.1), `write-summary.v1.md` (v1.2).
- Capability-based provider routing (`server/src/v3/providers/factory.ts`) with per-capability env overrides.
- `DeepWriterFallbackProvider` (Vertex DeepSeek thinking-mode fallback when OpenAI errors).
- Mechanical attribution pre-check with precise + frame (word-bag) matching (`server/src/v3/verify/attribution.ts`).
- 7 phase reports + 2 authoritative docs (06 Production Routing, 07 Phase 5 Shadow Deploy Plan) + 1 kickoff task.
- `scripts/verify-only.mjs` runner for isolated prompt iteration on verify without re-running writes.

**What this rebuild proved**

1. The v3 architecture (5 stages, capability-based routing, attribution discipline) is correct. Every failure during Phases 4.5–4.12 was a prompt-tuning or model-ceiling issue, never an architectural one.
2. DeepSeek V3.2 has a usable quality floor for most stages but fails at the attribution bar for strategize + verify + long-form write-position. Smart hybrid puts the right model on each stage at 80% the cost of pure-gpt-4.1.
3. Cost estimates need actual measurement, not analytical projection — Phase 4.10's estimate was 3.8× low. Future-phase budgeting must be grounded in telemetry.
4. One-prompt-rule changes (Check 9 brief-weight, write-summary Rule 2b) close clearly-articulated failure modes without reopening architecture. This is how Phase 5 ongoing prompt iteration should work too.

---

## Phase 4.12 commits on `origin/rebuild/v3`

- `fbfc44ec` — write-summary v1.2 (Rule 2b unit fidelity)
- `cade8611` — Phase 4.12 validation report (19/19 PASS)
- (this commit) — Phase 4.12 final summary

**Phase 4.12 LLM spend: ~$3.48.** Well under $5 cap.

---

**v3 rebuild validation complete. Phase 5 Week 0 kickoff ready.**
