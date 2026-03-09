# Pipeline Heartbeat Pattern

**Date documented:** 2026-03-09
**Sprint introduced:** Sprint 8 (pipeline.ts) / Sprint 13 (product-route-factory.ts)
**Files:** `server/src/routes/product-route-factory.ts`

## Problem

Long-running pipelines (especially during the Strategist's 10-15 minute interview phase) have no DB writes other than the initial `INSERT` when the pipeline starts. Supabase's `moddatetime` trigger only fires on `UPDATE`, so `updated_at` freezes at pipeline start.

The stale pipeline recovery check (`STALE_PIPELINE_MS = 15 min`) compares `updated_at` to `Date.now()`. If a pipeline runs for longer than 15 minutes without a DB write, the next `POST /respond` or reconnect attempt would classify the pipeline as stale — killing it mid-run and losing all progress.

## Solution

A `setInterval` heartbeat running every 5 minutes updates `coach_sessions.updated_at` while the pipeline is running. The heartbeat is non-blocking and silently skipped if the session is no longer in the `runningProductPipelines` set.

## Implementation

```ts
// Constants in product-route-factory.ts
export const STALE_PIPELINE_MS = 15 * 60 * 1000;   // 15 minutes
const HEARTBEAT_MS = 5 * 60 * 1000;                  // 5 minutes

// Inside the pipeline start handler:
const heartbeatTimer = setInterval(() => {
  if (!runningProductPipelines.has(sessionId)) {
    clearInterval(heartbeatTimer);
    return;
  }
  supabaseAdmin
    .from('coach_sessions')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('pipeline_status', 'running')         // safety guard: only touch running sessions
    .then(({ error: heartbeatError }) => {
      if (heartbeatError) {
        logger.warn(
          { session_id: sessionId, error: heartbeatError.message },
          'Product pipeline heartbeat failed',
        );
      }
    });
}, HEARTBEAT_MS);
heartbeatTimer.unref();                       // don't block Node.js process exit
```

## Key Details

- `heartbeatTimer.unref()` — prevents the timer from holding the Node.js event loop open after all other work completes
- `.eq('pipeline_status', 'running')` guard — prevents accidental touches to sessions that have already completed or errored during the heartbeat interval
- Non-blocking `.then()` — heartbeat failure is logged as a warning but never propagates
- `runningProductPipelines.has(sessionId)` guard — self-terminates if the pipeline finishes between heartbeats
- Timer is NOT cleared in `.finally()` — the `runningProductPipelines` guard handles cleanup because `.finally()` runs before the timer fires again

## Thresholds

| Constant | Value | Purpose |
|----------|-------|---------|
| `STALE_PIPELINE_MS` | 15 min | Max age of `updated_at` before pipeline is considered stale |
| `IN_PROCESS_PIPELINE_TTL_MS` | 20 min | Maximum wall-clock time for any active pipeline |
| `HEARTBEAT_MS` | 5 min | Heartbeat interval (must be < STALE_PIPELINE_MS / 2) |

## When to Use This Pattern

Use a heartbeat whenever:
1. A long-running operation holds pipeline state open (waiting for user gates, running multi-step agent loops)
2. A DB `updated_at` column is used for stale detection
3. The operation can exceed the stale detection threshold

Do NOT use this pattern for short operations (<5 min expected duration) — unnecessary DB load.

## Related

- [[Project Hub]]
- ADR-005 in `docs/DECISIONS.md` — documents the original decision
- `server/src/routes/product-route-factory.ts` — canonical implementation

#type/snippet #sprint/8
