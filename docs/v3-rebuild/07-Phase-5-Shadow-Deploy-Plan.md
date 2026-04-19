# 07 — Phase 5 Shadow Deploy Plan

**Version:** 1.0 (2026-04-18)
**Ship config:** Option B1 smart hybrid (validated 17/19 in Phase 4.10). See doc 06 for the routing map.
**Prerequisite:** Doc 06 env config applied in a staging environment with real Vertex + OpenAI credentials.

This doc describes how v3 rolls out to production alongside v2 without disrupting live users. The core idea: run v3 in shadow against every v2 pipeline call for a bounded observation window, compare both outputs against the same source resume + JD, then promote v3 in a gated rollout once shadow data confirms parity.

---

## 1. Shadow deploy architecture

```
                    ┌──────────────────────────────────────┐
 user clicks        │  /api/pipeline/start (existing v2)   │
 "Generate resume" →│  resume-pipeline.ts runs v2 end-to-  │
                    │  end, emits SSE, returns to user     │
                    └──────────────┬───────────────────────┘
                                   │
                                   │  emits shadow event
                                   ▼
                    ┌──────────────────────────────────────┐
                    │  shadow queue (Supabase Queue /      │
                    │  pg_cron / BullMQ — pick one)        │
                    └──────────────┬───────────────────────┘
                                   │
                                   │  async worker picks up job
                                   ▼
                    ┌──────────────────────────────────────┐
                    │  v3 shadow worker                    │
                    │  — Same resume + JD input as v2      │
                    │  — Runs full v3 5-stage pipeline     │
                    │  — Writes outputs to shadow table    │
                    │  — No SSE, no user-visible output    │
                    └──────────────┬───────────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────────────┐
                    │  resume_v3_shadow_runs table         │
                    │  — v2 output, v3 output              │
                    │  — v2 cost, v3 cost                  │
                    │  — v2 duration, v3 duration          │
                    │  — verify errors, quality scores     │
                    └──────────────────────────────────────┘
```

### Implementation sketch

- **Event emission**: in `server/src/routes/resume-pipeline.ts` at the `onComplete` hook, enqueue a shadow job with the exact request payload (resume_text, jd_text, optional intake_overrides). Fire-and-forget — never block the user-facing pipeline.
- **Queue**: use Supabase `pg_cron` + a `resume_v3_shadow_queue` table if there's no existing job runner, or BullMQ if Redis is already provisioned. Queue must survive server restarts.
- **Worker**: a single-process consumer runs 1–3 shadow pipelines concurrently. Rate-limited to stay within OpenAI tier limits (~500 RPM for gpt-4.1) and to bound cost.
- **Isolation**: shadow worker runs in the same Node process as the API server in staging; in production, run it as a separate `resume-v3-shadow` service with its own container, its own OpenAI key slot, and independent autoscaling.
- **Safety kill switch**: `FF_V3_SHADOW_ENABLED` feature flag. Off → queue insertion is skipped. This is the one-env-var off switch if shadow traffic starts costing more than forecast.

### What the user sees

Nothing. Shadow is invisible. v2 is authoritative for every user-facing output during this phase.

---

## 2. v2 vs v3 comparison logging

Each shadow run produces one row in `resume_v3_shadow_runs`. Schema:

```sql
create table resume_v3_shadow_runs (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  user_id         uuid references auth.users(id),
  session_id      uuid,                                   -- v2 pipeline session id for join
  jd_hash         text not null,                          -- sha256 of normalized JD
  resume_hash     text not null,                          -- sha256 of normalized source resume

  -- v2 side
  v2_output       jsonb,                                   -- final resume JSON
  v2_cost_usd     numeric(10,4),
  v2_duration_ms  integer,
  v2_verify_errors integer,                               -- v2 doesn't have verify; set null
  v2_quality_scores jsonb,                                -- from v2's quality dashboard

  -- v3 side
  v3_output       jsonb,                                   -- WrittenResume from v3
  v3_cost_usd     numeric(10,4),                          -- from stage telemetry sum
  v3_duration_ms  integer,
  v3_verify_errors integer,                               -- count from verify.json
  v3_verify_issues jsonb,                                  -- full issues array for root-causing
  v3_stage_telemetry jsonb,                                -- per-stage telemetry dump

  -- Comparison metadata
  comparison_notes jsonb,                                  -- structural diff: bullet count, word count, etc.
  human_preferred  text check (human_preferred in ('v2','v3','tie','not_reviewed')) default 'not_reviewed',
  human_reviewer_id uuid,
  human_review_notes text
);

create index resume_v3_shadow_runs_created_at on resume_v3_shadow_runs(created_at desc);
create index resume_v3_shadow_runs_user_id on resume_v3_shadow_runs(user_id);
create index resume_v3_shadow_runs_jd_hash on resume_v3_shadow_runs(jd_hash);
```

Every field is logged at run time. `human_preferred` + `human_review_notes` are populated during the daily review cycle (see section 3).

### Structural diff computation

`comparison_notes` is computed at shadow-run completion:

```typescript
{
  v2_bullet_count: number;
  v3_bullet_count: number;
  v2_word_count: number;
  v3_word_count: number;
  v2_section_count: number;
  v3_section_count: number;
  bullet_delta_pct: number;        // (v3-v2)/v2 × 100
  shared_bullet_count: number;     // bullets appearing verbatim in both
  v3_only_bullet_count: number;
  v2_only_bullet_count: number;
  has_verify_errors: boolean;
}
```

This lets us slice shadow data without reading full resume JSON.

---

## 3. Quality measurement during shadow phase

Three parallel tracks.

### Track A — automated verify signals

v3 has a built-in verify stage; v2 does not. Every shadow run records `v3_verify_errors`. Daily report: count of runs with errors > 0, broken down by fixture archetype.

**Acceptance threshold**: 17 of 19 (the Phase 4.10 fixture baseline) = ~10% failure rate. On real user traffic the rate may be different because real resumes are more heterogeneous. If shadow verify rate exceeds 15%, halt and investigate before proceeding to the gated rollout.

### Track B — structural comparison

Automated diff between v2 and v3 for every shadow run:

- Both outputs emit valid JSON and pass the DOCX/PDF export round-trip.
- Bullet count per position is within ±30% of v2 (guard against over-trimming or bloat).
- Keyword coverage: v3's ATS-score equivalent ≥ v2's ATS-score − 5%.

**Alert if**: more than 5% of shadow runs fail any of these structural guards.

### Track C — human pairwise review

Daily random sample of 10 shadow runs. Human reviewer (John or designated coach) sees v2 output side-by-side with v3 output (no labels indicating which is which) and picks one of: v2 / v3 / tie. Populate `human_preferred` + `human_review_notes`.

**Acceptance threshold**: v3 preferred or tied in ≥80% of human reviews over a rolling 50-review window.

The review UI is a simple admin page; build it as a Phase 5 deliverable (estimated 1 day).

### Cost monitoring

Daily sum of `v3_cost_usd` vs `v2_cost_usd` for the same time window. Sanity check: v3 should cost **roughly 5× v2** (v2 is all DeepSeek ~$0.018/resume; v3 smart hybrid is ~$0.097/resume with gpt-5.4-mini on write-position). If the ratio exceeds **8×**, investigate — likely a stage is retrying, hitting DeepWriterFallbackProvider (gpt-5.4-mini→Vertex thinking), or the write-position token counts are drifting. Per-resume dollar threshold: **v3_cost_usd > $0.15** (55% over forecast) triggers alert.

Cost model validated on 19-fixture corpus in Phase 4.13. Re-measure against real production traffic during shadow deploy to confirm fixture-corpus ↔ production translation holds.

---

## 4. Rollout gates

Four promotion stages. Each gate has a measurable criterion; advance only when all criteria are met.

### Gate 1 — shadow observation (weeks 1–2)

- Shadow runs for 100% of v2 traffic.
- Minimum 200 shadow runs collected before advancing.
- v3 verify-error rate ≤ 15% of shadow runs.
- Structural guards pass on ≥ 95% of shadow runs.
- Human review: v3 preferred-or-tied on ≥ 70% of 50 reviewed pairs.
- Cost ratio v3/v2 ≤ 8× (measured baseline ~5× on smart hybrid with gpt-5.4-mini write-position).

**If any fail**: fix the root cause (prompt iteration, provider swap, telemetry fix) and reset the 2-week observation window.

### Gate 2 — 10% canary (week 3)

- Feature flag `FF_V3_CANARY` enabled for 10% of users (hash-based assignment on user_id).
- Canary users get v3 as their live pipeline; v2 runs in shadow for comparison.
- Monitor the same structural + verify + cost signals.
- NEW SIGNAL: user-reported bugs / support tickets for canary cohort. Threshold: ≤ 2× baseline.

Run canary for 7 days. Advance if:
- No unresolved P0/P1 bugs originating from the canary cohort.
- Canary cohort's v3 verify-error rate ≤ 12% (slightly tighter than shadow threshold).
- Canary cohort's user-completion rate (pipeline start → DOCX download) ≥ parity with non-canary.

### Gate 3 — 50% rollout (week 4)

- `FF_V3_CANARY` flips to 50% assignment.
- Shadow mode DISABLED for 50% cohort (they ARE the v3 production); v2 runs as reference only, not shadow.
- Continue monitoring for 7 days.

Advance if:
- Verify-error rate stable at ≤ 12%.
- No regression in user-completion rate.
- Support ticket volume within 1.5× baseline.

### Gate 4 — 100% rollout (week 5)

- `FF_V3_CANARY` = true for all users. v2 pipeline kept warm for rollback.
- v2 shadow runs DISABLED.
- Run at 100% for 14 days before declaring v2 deprecated.

### Gate order is serial, not parallel

Do not skip a gate. A feature that passes gate 1 can fail gate 2 on real-user behavior the fixture corpus didn't capture — resume length distribution, JD unusual formats, user-session abandonment.

---

## 5. Rollback plan

### Instant rollback (< 60 seconds)

One env var flip: `FF_V3_CANARY=false`. All user traffic returns to v2. Shadow worker continues if shadow flag is on; the user-facing pipeline is unaffected.

### Selective rollback (targeted user cohort)

If the issue affects a specific subset (one user, one JD archetype, one industry), use `FF_V3_CANARY_DENYLIST` (comma-separated user IDs or JD hashes). Users on the denylist fall back to v2; everyone else stays on v3.

### Rollback triggers — the automatic ones

Fire `FF_V3_CANARY=false` programmatically when any of these breach for > 10 minutes:
- Verify-error rate > 20% on v3 cohort (any gate).
- User-completion rate drops > 20% vs baseline.
- OpenAI error rate > 5% (rate limits, 5xx, auth).
- Cost per resume > $0.15 (55% over the $0.097 forecast on gpt-5.4-mini).

Rollback runbook in `ops/runbooks/v3-rollback.md` (write in Phase 5 prep week).

### Data safety

Every shadow-run row is retained for 90 days. No user data is deleted on rollback — the shadow table is an auditable trail for investigating whatever triggered the rollback.

---

## 6. Success criteria for full promotion

All must be true after the 14-day 100% rollout (Gate 4 observation period):

1. **Verify-error rate** — v3 on real traffic ≤ 12% of runs. (Fixture baseline was 10.5%; real-world dispersion could push slightly higher.)
2. **Human review** — v3 preferred-or-tied on ≥ 80% of a 100-review pairwise sample drawn across the 14 days.
3. **Cost** — sustained cost per resume $0.08–$0.12 (measured baseline $0.097 on gpt-5.4-mini; range accommodates position-count + resume-size variance). Deviations outside this band investigated.
4. **User outcomes** — no statistically significant regression in pipeline-completion rate, DOCX-export rate, or user-reported bugs vs the v2-era baseline from the 4 weeks pre-rollout.
5. **Stage telemetry** — no single stage accounts for > 20% of verify errors. (If yes, that stage needs a prompt iteration before v2 can be deprecated.)
6. **Operational stability** — no unresolved P1 bugs against v3 routing, failover, or telemetry.

**When all six pass**: write a "v3 promoted" ADR, set `FF_V3_CANARY` as a no-op, remove the v2 code path in a subsequent refactor sprint.

---

## 7. Timeline

| Week | Phase | Actions | Gate |
|---|---|---|---|
| Pre-week (week 0) | Prep | Build shadow worker, `resume_v3_shadow_runs` table, admin review UI, rollback runbook. Deploy to staging. Smoke test with 5 live pipelines. | — |
| Week 1 | Shadow | Enable shadow for 100% traffic. Collect ≥ 100 runs. Begin daily human review (10/day). | — |
| Week 2 | Shadow | Continue; target ≥ 200 runs total. Evaluate Gate 1. | **Gate 1** at end |
| Week 3 | 10% canary | Flip `FF_V3_CANARY` for 10% assignment. Monitor daily. Evaluate Gate 2. | **Gate 2** at end |
| Week 4 | 50% rollout | Flip to 50%. Disable shadow for 50% cohort. Evaluate Gate 3. | **Gate 3** at end |
| Week 5 | 100% rollout | Flip to 100%. Disable all shadow runs. Begin 14-day observation. | — |
| Weeks 6–7 | Observation | 14-day monitoring window. Evaluate Gate 4. | **Gate 4** at end |
| Week 8 | Promotion | ADR documenting promotion. v2 code path scheduled for removal. | — |

**Total: 8 weeks from Phase 5 kickoff to v3 fully promoted.** Compressing is risky — the two-week observation windows exist because real-user dispersion takes that long to surface the edge cases the 19-fixture corpus can't capture.

### Parallel work during Phase 5

- Prompt iteration on the 2 remaining failure modes (fixture-10 verify Check 9 gap; fixture-19 borderline editorial edit) can ship as hotfixes during the observation windows.
- gpt-5.4-mini retry (doc 06 section 7) — one env var swap + a 19-fixture re-validation. If it hits 17+/19 at lower cost, fold into the 50% rollout cohort for final A/B.

### What blocks this timeline

- OpenAI tier escalation needed if shadow volume exceeds current RPM ceiling.
- Staging → production environment parity not yet confirmed (DeepSeek on Vertex in staging vs production).
- Admin review UI not yet built — this is the one piece of new frontend work Phase 5 introduces. 1-day effort if reusing the existing admin dashboard component.

Everything else (factory routing, fallback provider, telemetry, per-stage models) is already shipped on `rebuild/v3` and validated at 17/19.
