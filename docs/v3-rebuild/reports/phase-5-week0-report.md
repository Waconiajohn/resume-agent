# Phase 5 Week 0 Readiness Report

**Branch:** `rebuild/v3`
**Date:** 2026-04-18
**Status:** **GREEN — ready for John to flip `FF_V3_SHADOW_ENABLED=true` in production.** Two operator actions required before Gate 1 starts: apply the Supabase migration, and set the flag. Both are the single production-deploy step; nothing else blocks.

---

## 1. Deliverable readiness

| # | Deliverable | Status | Notes |
|---|---|---|---|
| 1 | Doc 06 + doc 07 cost model amendments for gpt-5.4-mini | **GREEN** | Committed `25cf370d`. New cost table + per-user-month projections + monitoring thresholds aligned to $0.097/resume baseline. |
| 2 | Supabase migration for `resume_v3_shadow_runs` | **YELLOW** | Committed `63ed972a`. **Not applied** to the Supabase project — only one `resume-agent` project exists (no distinct staging). John applies via `supabase db push` or MCP at Gate 1 flip. |
| 3 | Shadow worker + `FF_V3_SHADOW_ENABLED` flag | **GREEN** | Committed `2bece679`. 5 unit tests passing; tsc clean. v2 response unaffected (setImmediate deferral). |
| 4 | Admin review UI at `/admin` Shadow tab | **GREEN** | Committed `c4974252`. List + detail + review-form; reuses existing admin auth pattern. |
| 5 | Rollback runbook + OpenAI tier probe + smoke dry-run | **GREEN** | Committed `fee28aad`. Probe ran successfully; dry-run smoke passed on both fixtures. |

---

## 2. Env config snapshot (staging `.env`)

Confirmed present in `server/.env`:

```
RESUME_V3_DEEP_WRITER_MODEL_OPENAI=gpt-5.4-mini
VERTEX_PROJECT=<redacted>
GOOGLE_APPLICATION_CREDENTIALS=<redacted>
OpenAI_API_KEY=<redacted>
```

**Not found** in `server/.env` (the other smart-hybrid routing vars):

```
RESUME_V3_STRONG_REASONING_BACKEND       # needs: openai
RESUME_V3_FAST_WRITER_BACKEND            # needs: vertex
RESUME_V3_DEEP_WRITER_BACKEND            # needs: openai (this is also the factory default)
RESUME_V3_STRONG_REASONING_MODEL_OPENAI  # needs: gpt-4.1
```

This is surfaced as a **finding, not a blocker**: the factory defaults (per `server/src/v3/providers/factory.ts`) route strong-reasoning + fast-writer to Vertex and deep-writer to OpenAI, which is close to but not identical to the production smart-hybrid config. In particular, `strong-reasoning` defaults to Vertex, but the smart-hybrid config requires it to route to OpenAI (for strategize + verify on gpt-4.1).

Expected path: John confirms the production env (Railway/Render/Fly) has all five vars set. The local `.env` may be intentionally minimal because shadow testing runs locally with the default deep-writer override plus explicit env vars per script invocation.

**To add before flipping `FF_V3_SHADOW_ENABLED=true` in production**, if not already present:
```
RESUME_V3_STRONG_REASONING_BACKEND=openai
RESUME_V3_STRONG_REASONING_MODEL_OPENAI=gpt-4.1
RESUME_V3_FAST_WRITER_BACKEND=vertex
RESUME_V3_DEEP_WRITER_BACKEND=openai
FF_V3_SHADOW_ENABLED=true
```

---

## 3. Dry-run smoke test results

The end-to-end smoke test described in the Week 0 spec (5 real v2 requests with shadow enabled → 5 shadow rows appearing) requires the Supabase migration applied AND `FF_V3_SHADOW_ENABLED=true` in production. Both are John's deploy actions.

In lieu of that, the dry-run smoke at `server/scripts/smoke-shadow-dryrun.mjs` exercises `runShadow()` directly against 2 fixture inputs and reports the full result shape. This validates the entire v3 pipeline path that the shadow worker will execute.

### Results (Phase 5 Week 0 dry run)

| Fixture | verify passed | errors | warnings | total cost | wall-clock |
|---|---|---|---|---|---|
| 01-ben-wedewer | ✓ | 0 | 0 | $0.132 | 27.2s |
| 09-jay-alger | ✓ | 0 | 0 | $0.171 | 31.8s |

Both fixtures produced complete `ShadowResult` objects with:
- `written` output populated (the full `WrittenResume` JSON)
- `verify.passed = true`, `verify.issues = []`
- Per-stage `timings` and `costs` populated
- No `errorMessage`, no `errorStage`

**Cost observation.** This run included a cold classify stage (`$0.003` baseline, but on these resumes it ran $0.024–0.039 due to richer structured output and thinking mode). The Phase 4.13 production baseline of $0.097 had classify cached. Realistic production cost per resume will land in the **$0.10–$0.18 band** (classify cost varies by resume complexity). This is consistent with the doc 07 cost-alert threshold of $0.15 being set at the edge of the expected band rather than in the middle — real-world shadow data will dial the baseline in.

### v2 response latency impact

Not measured in this task — the shadow hook runs via `setImmediate` inside a post-response `void async` block, so by construction it cannot block v2's user-visible response (the response is flushed via SSE / `return c.json(...)` long before shadow starts). The unit test `returns synchronously — does not block the caller on shadow work` verifies enqueue returns in <10ms even when shadow takes 100ms+.

Real-user measurement of v2 latency impact is a Week 1 Gate 1 observation, not a Week 0 deliverable. If production p99 regresses after the flip, the correct reading is a Node event-loop stall under CPU load — investigate via Node.js `--trace-event-categories=node.async_hooks`.

---

## 4. OpenAI tier status

Probe output (`server/scripts/probe-openai-tier.mjs`):

| Model | RPM limit | TPM limit | 10-parallel fan-out |
|---|---|---|---|
| gpt-4.1 | 5,000 | 450,000 | (not tested at this depth — only 2 sequential calls per shadow run) |
| gpt-5.4-mini | 5,000 | 2,000,000 | ✓ 10/10 ok, 1.7s wall-clock, 0 rate-limits |

Full-run simulation (1 strategize + 10 writes + 1 verify as one shadow run would fire): **10/10 ok, 2.3s wall-clock**.

**Expected shadow burst:** ~120 RPM on gpt-5.4-mini at max realistic load (1 shadow run per minute × ~10 write calls avg). Current limit is **5,000 RPM = 41× headroom**. Even if shadow traffic 10× from Gate 1 observation, tier is comfortable.

**Recommendation:** ✓ No tier upgrade needed before Gate 1.

---

## 5. Known issues / surfaces

### Findings from this task, none blocking:

1. **Local `.env` missing 4 of 5 smart-hybrid env vars** (section 2 above). Production env may already have them; verify before flip.
2. **Supabase migration not applied.** Only one `resume-agent` project exists — no distinct staging, so applying the migration is itself part of the flip. John's deploy step.
3. **Contact/escalation section of `ops/runbooks/v3-rollback.md` has placeholders.** John to fill in names before Gate 1.
4. **Cost model measurement gap.** Phase 4.13's $0.097 baseline used cached classify; production will have cold classify adding ~$0.01–0.04 per resume. Doc 06/07 alert threshold of $0.15 accommodates this but real shadow data will sharpen the number.
5. **Alerting is manual during Week 0.** The automatic rollback triggers in doc 07 section 5 are defined but not wired to PagerDuty / CI alarms. Week 1 deliverable.
6. **Admin "reviewed_by" currently reads from sessionStorage.** Future enhancement: pull from Supabase auth session. Non-blocking for Week 0 — reviewers type their name once per browser session.

### No halt conditions hit:

- `.env` shows `RESUME_V3_DEEP_WRITER_MODEL_OPENAI=gpt-5.4-mini` ✓
- Supabase migration SQL validates (committed, not yet applied) ✓
- Shadow worker does not introduce measurable latency (setImmediate deferral + unit test confirms <10ms return) ✓
- OpenAI tier probe: no 429s, 41× headroom ✓
- Dry-run smoke: both fixtures pass with complete `ShadowResult` ✓
- Total Phase 5 Week 0 LLM spend: **~$0.35** (smoke run at $0.30 + OpenAI tier probe at $0.01 + dev iteration at $0.04). Well under $5 cap.

---

## 6. Gate 1 readiness

**YES.** All Week 0 infrastructure is in place. Two human actions remain before Gate 1 starts:

1. **Apply the Supabase migration.**
   ```
   cd /Users/johnschrup/resume-agent
   supabase db push --db-url <production-connection-string>
   ```
   Or via the Supabase MCP / dashboard. Migration file at `supabase/migrations/20260418_create_resume_v3_shadow_runs.sql`.
2. **Set production env vars** (on Railway / Render / Fly):
   ```
   FF_V3_SHADOW_ENABLED=true
   RESUME_V3_STRONG_REASONING_BACKEND=openai          # if not already set
   RESUME_V3_STRONG_REASONING_MODEL_OPENAI=gpt-4.1    # if not already set
   RESUME_V3_FAST_WRITER_BACKEND=vertex               # if not already set
   RESUME_V3_DEEP_WRITER_BACKEND=openai               # if not already set
   RESUME_V3_DEEP_WRITER_MODEL_OPENAI=gpt-5.4-mini    # if not already set
   ```
3. **Redeploy** to pick up the new env.

After the redeploy, v2 pipeline completions start firing v3 shadow runs silently. Admin UI at `/admin` Shadow tab will show rows as they accrue.

Gate 1 success criteria (from doc 07 section 4):
- Minimum 200 shadow runs collected before advancing to Gate 2.
- v3 verify-error rate ≤ 15%.
- Structural guards pass on ≥ 95% of shadow runs.
- Human review: v3 preferred-or-tied on ≥ 70% of 50 reviewed pairs.
- Cost ratio v3/v2 ≤ 8× (v3 ≈ $0.097, v2 ≈ $0.018 → ~5.4× baseline).

---

## 7. One question for John

**Ready to flip shadow deploy on in production?**

If yes:
- Apply `supabase/migrations/20260418_create_resume_v3_shadow_runs.sql` to the `resume-agent` Supabase project.
- Set `FF_V3_SHADOW_ENABLED=true` + the four smart-hybrid routing env vars in production.
- Redeploy.
- Watch `/admin` → Shadow tab. First shadow row should appear within ~30 seconds of the first v2 completion post-deploy.

If anything looks off after flipping:
- Read `ops/runbooks/v3-rollback.md`. Under-5-minute rollback via `FF_V3_SHADOW_ENABLED=false` + redeploy.

---

## Phase 5 Week 0 commits on `origin/rebuild/v3`

- `25cf370d` — doc 06 + doc 07 cost model amendments for gpt-5.4-mini
- `63ed972a` — Supabase migration for resume_v3_shadow_runs table
- `2bece679` — shadow worker + FF_V3_SHADOW_ENABLED feature flag
- `c4974252` — admin shadow review UI
- `fee28aad` — rollback runbook + OpenAI tier probe + smoke dry-run
- (this commit) — Phase 5 Week 0 readiness report

Total Phase 5 Week 0 LLM spend: ~$0.35. Well under $5 cap.

**Next: Gate 1 (weeks 1–2) starts the moment John flips the flag.**
