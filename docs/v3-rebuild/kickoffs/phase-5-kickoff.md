# Claude Code Task — Phase 5 Week 0: Shadow Deploy Infrastructure Prep

Paste into a fresh Claude Code session as a single autonomous task.

---

**Task: Begin Phase 5 Week 0 prep. Build the shadow-run infrastructure so v3 can run silently alongside v2 on real user traffic. Deliver a ready-to-flip shadow system behind `FF_V3_SHADOW_ENABLED`, a `resume_v3_shadow_runs` Supabase table, an admin review UI for pairwise comparison, a rollback runbook, and a smoke test confirming end-to-end flow. No user-facing v3 traffic this week.**

## Context

v3 has been validated at **18/19** on the 19-fixture corpus (Phase 4.11). Ship config is Option B1 smart hybrid:
- `RESUME_V3_STRONG_REASONING_BACKEND=openai` (classify cached; strategize + verify on gpt-4.1)
- `RESUME_V3_FAST_WRITER_BACKEND=vertex` (DeepSeek V3.2 for write-summary/accomplishments/competencies/custom-section)
- `RESUME_V3_DEEP_WRITER_BACKEND=openai` (gpt-4.1 for write-position)

Full routing map, env vars, cost model, failover behavior: `docs/v3-rebuild/06-Production-Routing.md`.
Full 8-week rollout plan: `docs/v3-rebuild/07-Phase-5-Shadow-Deploy-Plan.md`. This kickoff executes **Week 0** (prep) from that plan.

The original comprehensive Phase 5 kickoff (full Steps 1–6 covering shadow → cutover → v2 deletion) is preserved at `docs/v3-rebuild/kickoffs/phase-5-kickoff-original-plan.md`. This Week 0 kickoff supersedes the "Step 1" portion of that plan with concrete deliverables.

## Read first

- `docs/v3-rebuild/06-Production-Routing.md` (authoritative production config)
- `docs/v3-rebuild/07-Phase-5-Shadow-Deploy-Plan.md` (authoritative rollout plan)
- `docs/v3-rebuild/reports/phase-4.11-final-summary.md`
- `docs/v3-rebuild/reports/phase-4.11-validation.md` (the 18/19 result, known fixture-10 finding)
- `server/src/routes/resume-pipeline.ts` (v2 pipeline — shadow fork hook attaches here)
- `server/src/v3/` (v3 stage implementations, already production-ready)
- `server/src/lib/feature-flags.ts` (where `FF_V3_SHADOW_ENABLED` will be registered)

## Scope — seven deliverables

### Deliverable 1 — Supabase migration for `resume_v3_shadow_runs`

Create a new migration file at `supabase/migrations/<timestamp>_resume_v3_shadow_runs.sql`. Use the schema defined in doc 07 section 2 as the baseline, with these augmentations:

- Add `v3_run_error TEXT` and `v3_run_error_stage TEXT` so shadow failures don't silently disappear.
- Indexes: `created_at desc`, `user_id`, `jd_hash`.
- RLS: admin-only read; service role insert/update (shadow worker uses service role; admin UI reads).
- Comment on table: "Phase 5 shadow deploy comparison rows. v2 is authoritative; v3 runs silently for quality measurement."

Apply to staging via `supabase db push` after writing. Verify the table exists.

**Commit:** `v3 phase 5 week 0: resume_v3_shadow_runs migration`

### Deliverable 2 — Shadow worker

Create `server/src/v3/shadow/` module. Three files:

- **`server/src/v3/shadow/enqueue.ts`** — `enqueueShadowRun(payload)` called from `resume-pipeline.ts` on v2 `onComplete`. Payload: `userId`, `sessionId`, `resume_text`, `jd_text`, `v2_output`, `v2_cost_usd`, `v2_duration_ms`, `v2_quality_scores`. Writes a Supabase row with v2 fields populated and `v3_*` fields null. Returns in < 5ms; never blocks user response. If Supabase write fails, log loudly but do NOT throw.
- **`server/src/v3/shadow/worker.ts`** — async consumer. Polls for rows where `v3_output IS NULL AND v3_run_error IS NULL`, oldest first. Runs the full v3 pipeline (extract → classify → strategize → write → verify). Updates the row with `v3_*` fields + `comparison_notes`. On failure: writes `v3_run_error` + `v3_run_error_stage` and moves on. Concurrency limit: 2 in-flight at once. Runs as a `setInterval` loop in the main Node process for Week 0.
- **`server/src/v3/shadow/compare.ts`** — computes `comparison_notes` struct (bullet counts, word counts, section counts, shared/unique bullet counts) from v2_output + v3_output.

Wire it:
- `server/src/routes/resume-pipeline.ts` v2 `onComplete` hook: after v2 finishes writing its response, call `enqueueShadowRun` fire-and-forget (wrap in `try/catch` that only logs).
- `server/src/index.ts` or equivalent startup file: if `FF_V3_SHADOW_ENABLED === true`, call `startShadowWorker()`.

Register the flag in `server/src/lib/feature-flags.ts`:
```typescript
FF_V3_SHADOW_ENABLED: process.env.FF_V3_SHADOW_ENABLED === 'true'
```
Default false.

**Technical decisions the implementation must honor:**

1. **Where shadow forks.** `resume-pipeline.ts` `onComplete` hook, AFTER the user response is sent. Rationale: zero latency impact on user response.
2. **Shadow failure behavior.** Loud pino log + Supabase row with `v3_run_error` populated. v2 response never affected.
3. **Sample rate.** 100% of v2 traffic for Weeks 1–2 (Gate 1). Doc 07 Gate 1 requires ≥ 200 runs; 100% is the simplest way to meet it.

**Commit:** `v3 phase 5 week 0: shadow worker behind FF_V3_SHADOW_ENABLED`

### Deliverable 3 — Admin review UI

Build `app/src/pages/AdminShadowReview.tsx`. Reuse existing admin dashboard components. 1-day effort.

Features:
- **List view**: paginated table of `resume_v3_shadow_runs`, newest first. Columns: created_at, user_id (masked), v2_cost, v3_cost, v3_verify_errors, human_preferred, quick actions.
- **Detail view**: side-by-side v2 vs v3 output (reuse resume preview component if possible). Below: `human_preferred` radio (v2 / v3 / tie / not_reviewed), `human_review_notes` textarea, save.
- **Filter bar**: date range, `human_preferred` status, has-errors-only toggle.
- Admin-only route. Reuse existing admin-gate middleware.

Backend: `server/src/routes/admin-shadow.ts` with:
- `GET /api/admin/shadow-runs` (paginated list + filters)
- `POST /api/admin/shadow-runs/:id/review` (save review decision)

**Commit:** `v3 phase 5 week 0: admin shadow review UI`

### Deliverable 4 — Rollback runbook

Write `ops/runbooks/v3-rollback.md`:

1. **Instant rollback** — `FF_V3_CANARY=false` kills traffic to v3 (for later phases). For Week 0, `FF_V3_SHADOW_ENABLED=false` is the kill switch.
2. **Selective rollback** — `FF_V3_CANARY_DENYLIST` usage (later phases).
3. **Automatic rollback triggers** — four conditions from doc 07 section 5, with concrete thresholds and alert wiring.
4. **Data safety** — 90-day retention; shadow rows stay on rollback.
5. **Manual intervention** — how to pause the shadow worker without dropping in-flight jobs.
6. **Contact** — who pages whom.

**Commit:** `ops: v3 rollback runbook`

### Deliverable 5 — OpenAI tier verification

`server/scripts/check-openai-tier.ts`:
1. Reads `OpenAI_API_KEY` (or `OPENAI_API_KEY`) from env.
2. Probes org's RPM/TPM limits via lightweight request inspecting `x-ratelimit-*` headers.
3. Compares to expected shadow volume (assume 2× current v2 traffic rate on gpt-4.1 for strategize + verify + write-position).
4. Emits PASS/FAIL report with concrete numbers.

Run it. Include output in the Week 0 report. If tier insufficient → flag as blocker and halt.

**Commit:** `v3 phase 5 week 0: OpenAI tier probe script`

### Deliverable 6 — Staging ↔ production env parity check

`server/scripts/check-v3-env-parity.ts`. Reads env from current process, confirms the 5 v3 capability/model vars for smart hybrid (doc 06 env snippet). Also confirms Vertex + OpenAI credentials. Emits PASS/FAIL.

Run in staging. Document outcome. If missing/wrong, fix staging and re-run. Production parity is ops' task.

**Commit:** `v3 phase 5 week 0: env parity check script`

### Deliverable 7 — Smoke test

Run 5 real v2 pipelines end-to-end in staging with `FF_V3_SHADOW_ENABLED=true`. For each:
- Confirm v2 response reaches user normally.
- Confirm a `resume_v3_shadow_runs` row is written with v2 fields populated.
- Wait up to 5 min for the shadow worker to process; confirm v3 fields populated and `v3_run_error IS NULL`.
- Eyeball v3 output for sanity.

Write results into `docs/v3-rebuild/reports/phase-5-week0-report.md`.

**Commit:** `v3 phase 5 week 0: smoke test + Week 0 report`

## Out of scope for Week 0

- **No traffic rollout.** `FF_V3_CANARY` stays off. Week 0 is strictly shadow infrastructure.
- **No v2 code modifications** beyond the one `onComplete` hook.
- **No v2 deletion.** v2 stays authoritative until Gate 4 (Week 8).
- **No prompt iteration.** The fixture-10 $26M write-summary fabrication (Phase 4.11 finding) should surface via shadow deploy Gate 1 data, not pre-emptive prompt engineering.
- **No model swaps.** gpt-5.4-mini exploration stays deferred (doc 06 section 7).

## Budget and stop conditions

- **Cost cap: $5 for Week 0.** No LLM calls in infrastructure work; smoke test is ~5 shadow runs × $0.046 = $0.23.
- **Halt conditions:**
  - Supabase migration fails in staging (schema or RLS misconfiguration).
  - OpenAI tier probe reports insufficient headroom.
  - Shadow fork introduces measurable latency in v2 response (> 50ms p99 regression).
  - Smoke test fails in any of 5 runs.

If any halt condition fires, write the Week 0 report with the blocker and recommend no Week 1 start until addressed.

## Phase 5 Week 0 report

Write `docs/v3-rebuild/reports/phase-5-week0-report.md` at the end:

1. **Deliverable status** — pass/fail per deliverable.
2. **Smoke test results** — 5 runs × pass/fail + notes.
3. **OpenAI tier** — current RPM/TPM vs expected shadow volume; headroom.
4. **Env parity** — staging confirmed; production pending ops.
5. **Blockers** — any halt conditions hit.
6. **Week 1 readiness** — ready / not ready + what's missing.
7. **Cost spent** — should be < $1.

**Commit:** `v3 phase 5 week 0: final Week 0 report`

## The one thing to remember

Week 0 is infrastructure only. The goal is a system that can run silently alongside v2 for two weeks (Gate 1) without touching user-facing behavior. Build it, test it, document it, hand off to ops. The real Phase 5 value — learning from real-user data — starts in Week 1.

Begin.
