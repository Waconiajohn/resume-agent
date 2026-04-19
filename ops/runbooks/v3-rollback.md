# v3 Rollback Runbook

**Scope:** how to stop v3 shadow deploy (or future canary/full rollout) without affecting user-facing v2 traffic.

**Applies to:** Phase 5 Week 0 onward. Week 0 is shadow-only; this runbook covers both the Week 0 kill switch and forward-compatible canary / full-rollout flags for later gates.

---

## TL;DR — the four-minute rollback

1. In the production environment manager (Railway / Render / Fly / whatever hosts the Node process), set:
   ```
   FF_V3_SHADOW_ENABLED=false
   ```
   (For Week 3+ canary: `FF_V3_CANARY=false`. For Week 5 full rollout: both to false to return 100% to v2.)
2. Redeploy. Most platforms pick up env changes on deploy; in-place env mutation without redeploy is NOT sufficient — the Node process reads env at startup.
3. Confirm the flag took effect: see "Verify shadow is stopped" below.
4. Expected total time: under 5 minutes.

---

## How to verify shadow is stopped

Run against the production Supabase project (via MCP, psql, or dashboard):

```sql
select max(created_at) as last_shadow_row
from resume_v3_shadow_runs;
```

If the most recent row is older than your rollback timestamp, shadow is stopped. No more rows should accrue.

Secondary check: watch the `shadow run complete` / `v3 shadow enqueue` log lines in production — they should stop appearing after the redeploy.

---

## How to restart shadow deploy

Reverse the rollback:

```
FF_V3_SHADOW_ENABLED=true
```

Redeploy. New shadow rows should start appearing within ~30 seconds of the first v2 pipeline completion.

---

## Automatic rollback triggers

Per `docs/v3-rebuild/07-Phase-5-Shadow-Deploy-Plan.md` section 5, automatic rollback via CI/CD alarm fires if ANY of the following breach for >10 minutes during shadow or canary phases:

1. **Verify-error rate > 20%** on v3 cohort rows (shadow or canary). Query:
   ```sql
   select
     count(*) filter (where (v3_verify_result_json->>'passed')::boolean = false)::float
     / nullif(count(*), 0) as fail_rate
   from resume_v3_shadow_runs
   where created_at > now() - interval '10 minutes'
     and v3_pipeline_error is null;
   ```
2. **User-completion rate drops > 20%** vs 7-day baseline (v2 coach_sessions end-to-end completion rate).
3. **OpenAI error rate > 5%** over 10 min (rate limits, 5xx, auth). Monitor via OpenAI dashboard or pino logs tagged `backend=openai`.
4. **Cost per resume > $0.15** sustained over 10 min. Query:
   ```sql
   select avg((v3_stage_costs_json->>'total')::numeric) as avg_cost
   from resume_v3_shadow_runs
   where created_at > now() - interval '10 minutes'
     and v3_pipeline_error is null;
   ```

Alerting is currently manual during Week 0 — John will check these on each daily review pass. Automated alerting is a Week 1+ deliverable.

---

## Data safety

- `resume_v3_shadow_runs` rows are retained **90 days**.
- **Rollback does not delete rows.** All shadow history is preserved for post-incident analysis.
- No user-facing output is backed by this table; its disappearance would not affect any live UI.

---

## Manual intervention: pausing the shadow worker without dropping in-flight jobs

The shadow worker fires via `setImmediate` + `async` inside the Node process. There is no external queue, so "in-flight" means "already picked up but not yet written to Supabase."

To pause without data loss:

1. Flip `FF_V3_SHADOW_ENABLED=false` and redeploy. New v2 completions stop firing shadow.
2. Wait 90 seconds after the last v2 completion for in-flight shadows to finish (each has a 90s wall-clock ceiling).
3. Confirm no new rows with `created_at` inside the wait window.

The shadow worker is stateless across process restarts — there is no queue to drain. Restarting the Node process while shadow is running drops in-flight shadows with no persistent trace (they are log-only). Acceptable loss during Week 0.

For Week 1+ if persistent queuing becomes necessary: migrate `enqueueShadow` to write a job row to a `resume_v3_shadow_queue` table, then a separate worker process consumes with idempotent inserts. Not in scope for Week 0.

---

## Contact / escalation path

Fill in before Week 1 goes live. Placeholders for now:

- **v3 owner / primary contact:** TBD (John will assign)
- **On-call for OpenAI outages:** TBD
- **On-call for Supabase / Vertex outages:** TBD
- **Escalation — if the rollback itself fails:** page the infra on-call; they can force-kill the Node process and redeploy. Supabase rows are persisted independently, so forcing a process restart is safe.

---

## Not scope for this runbook

- v2 pipeline rollback (v2 is currently authoritative and not changing).
- Supabase migration rollback (the migration at `supabase/migrations/20260418_create_resume_v3_shadow_runs.sql` has an in-file rollback block; apply it directly if the table itself needs to be dropped).
- Code rollback (`git revert` on the relevant Phase 5 Week 0 commits if the shadow worker itself is misbehaving).

---

## Update history

- 2026-04-18 — Initial Phase 5 Week 0 runbook. Shadow-only; canary/full-rollout sections are forward-compatible but not exercised yet.
