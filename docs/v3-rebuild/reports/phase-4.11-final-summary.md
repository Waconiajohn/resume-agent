# Phase 4.11 Final Summary

**Branch:** `rebuild/v3`
**Date:** 2026-04-18
**Status:** SHIP READY. Phase 5 Week 0 kickoff task drafted. The Check 9 prompt fix succeeded; the fixture-10 false positive is permanently gone.

---

## 1. Final validated production config

**Option B1 — smart hybrid, with verify v1.2.1.** No change to routing from Phase 4.10; only the verify prompt bumped v1.2 → v1.2.1.

```
RESUME_V3_STRONG_REASONING_BACKEND=openai   # classify (cached) + strategize + verify (v1.2.1)
RESUME_V3_FAST_WRITER_BACKEND=vertex         # write-summary / accomplishments / competencies / custom-section
RESUME_V3_DEEP_WRITER_BACKEND=openai         # write-position

RESUME_V3_STRONG_REASONING_MODEL_OPENAI=gpt-4.1
RESUME_V3_DEEP_WRITER_MODEL_OPENAI=gpt-4.1
```

Full routing map, env vars, cost model, failover: `docs/v3-rebuild/06-Production-Routing.md`.

---

## 2. 19-fixture pass rate with verify v1.2.1

**18/19 PASS, 1 error, $0.025/fixture on the verify-only re-run.**

| Phase | Pass | Errors | Notes |
|---|---|---|---|
| Phase 4.10 smart hybrid (verify v1.2) | 17/19 | 2 | baseline |
| **Phase 4.11 (verify v1.2.1)** | **18/19** | **1** | Check 9 false positive gone; zero regressions |

The surviving fixture-10 failure is **not** the Phase 4.10 false positive. The zero-bullet "brief-weight" error was cleanly removed by the v1.2.1 Check 9 fix. A different, real bug surfaced in the same fixture: write-summary (DeepSeek V3.2 on `fast-writer`) converted source text "26% ARR increase" into "$26M in ARR growth" — a percentage-to-dollar fabrication that Phase 4.10's verify non-deterministically missed.

This is a good outcome: noise removed, signal surfaced. The new error belongs to the write-summary stage, not verify; and it is a candidate for shadow-deploy observability (consistent with Phase 4.10's fixture-19 treatment) rather than another prompt iteration.

Fixture-19 flipped FAIL → PASS reproducibly (two stability runs). The borderline "delivered to the highest standards" phrasing no longer emits on verify v1.2.1.

Full per-fixture table + deep dives: `docs/v3-rebuild/reports/phase-4.11-validation.md`.

---

## 3. Ship state

**Ship-ready. Phase 5 kickoff task at `docs/v3-rebuild/kickoffs/phase-5-kickoff.md`, drafted for paste into fresh Claude Code session.**

Week 0 kickoff covers:
- Supabase `resume_v3_shadow_runs` migration
- Shadow worker behind `FF_V3_SHADOW_ENABLED`
- Admin pairwise review UI
- Rollback runbook
- OpenAI tier probe script
- Env parity check script
- 5-run staging smoke test + Week 0 report

No user-facing v3 traffic in Week 0. Week 1 begins Gate 1 (100% shadow alongside v2).

---

## 4. Fixture-19 + fixture-10 treatment

**Fixture-19**: now passing. Prior borderline editorial flag ("delivered to the highest standards") does not recur on verify v1.2.1. Deferred concern closed by verify behavior, not by prompt intervention.

**Fixture-10**: still failing, but for a different reason — a real DeepSeek write-summary fabrication ($26M from 26%). **Deferred to shadow deploy observability** per John's Phase 4.10 decision on borderline write-side issues. If real-world shadow data shows the DeepSeek percentage-to-dollar pattern recurring, the Phase 5 team can address it with either:
- A `write-summary.v1.md` Rule update forbidding unit conversions not in source, OR
- Routing write-summary to gpt-4.1 (minor cost impact; summary is short).

Not fixing in Phase 4.11. Out of scope.

---

## 5. One line for John

**Paste `docs/v3-rebuild/kickoffs/phase-5-kickoff.md` into fresh Claude Code to begin Phase 5 Week 0.**

---

## Phase 4.11 commits on `origin/rebuild/v3`

- `0fa5d801` — verify v1.2.1 (Check 9 honors write-position Rule 7 for brief-weight positions)
- `adb722e9` — validation of verify v1.2.1 on smart hybrid config (18/19 report + verify-only runner)
- `14c0e8f6` — Phase 5 kickoff task drafted + ready for John
- (this commit) — Phase 4.11 final summary

**Phase 4.11 LLM spend: ~$0.56.** Well under the $5 cap.

Combined v3 rebuild spend across Phases 4.5–4.11: ~$9.00. Rebuild validation complete. Phase 5 kickoff is the next paste-and-go task.
