# SSE Scaling Strategy — Resume Agent

## Problem

SSE connections are stored in an in-memory `Map<string, Array<emitter>>` in `routes/sessions.ts`. Three routes access this Map:

| Route | Access Pattern |
|-------|---------------|
| `sessions.ts` | Registers SSE connections, broadcasts chat events |
| `pipeline.ts` | Broadcasts pipeline events (stage_start, section_draft, etc.) |
| `workflow.ts` | Broadcasts workflow events (replan, preferences, etc.) |

With a single server instance, this works perfectly — the pipeline runs in the same process that holds the SSE connection. With multiple instances, events are lost because the pipeline may run on a different instance than the one holding the SSE client.

## Current Architecture

```
┌─────────────┐       ┌──────────────────────────┐
│   Browser    │──SSE──│  Single Server Instance   │
│   (Client)   │       │  ┌────────────────────┐   │
│              │       │  │  sseConnections Map │   │
│              │       │  └────────┬───────────┘   │
│              │       │           │               │
│              │       │  ┌────────▼───────────┐   │
│              │       │  │  Pipeline Runner    │   │
│              │       │  └────────────────────┘   │
└─────────────┘       └──────────────────────────┘
```

## Phase 1: Sticky Sessions (Recommended First Step)

### What

Configure the load balancer to route all requests for a given session to the same server instance. No code changes needed.

### How

**Railway configuration:**
Railway uses a cookie-based session affinity mechanism. When a request hits a Railway service with multiple instances:

1. Set `RAILWAY_SERVICE_TIMEOUT` appropriately for long SSE connections (default 30s may be too short)
2. Enable session affinity in Railway service settings
3. The first request creates a sticky cookie; subsequent requests route to the same instance

**Alternative: Header-based routing**
If cookie-based affinity isn't available, implement via a custom header:
- Frontend sends `X-Session-ID` header with all requests
- Load balancer uses consistent hashing on this header

### Limitations

- **Instance restart**: If the instance holding the SSE connection restarts (deploy, crash, OOM), the client loses the connection. The frontend already handles this with reconnection logic (`useSSEConnection`).
- **Uneven load**: If one session is very long-running, its instance may be underutilized while others are overloaded.
- **Scale ceiling**: With N instances and sticky sessions, the max concurrent sessions is still limited by a single instance's resources (because a session's entire pipeline runs on one instance).

### When This Breaks

Sticky sessions become insufficient when:
- Deploying frequently (each deploy bounces all connections)
- Single sessions use more resources than one instance can provide (unlikely for this workload)
- You need true fault tolerance (automatic failover to another instance mid-pipeline)

## Phase 2: Redis Pub/Sub for SSE Fan-Out

### What

Pipeline publishes events to a Redis channel. All server instances subscribe to Redis and forward events to their local SSE clients.

### Architecture

```
┌─────────────┐       ┌──────────────────────┐
│   Browser    │──SSE──│  Instance A           │
│   (Client)   │       │  sseConnections Map   │◀──subscribe──┐
└─────────────┘       └──────────────────────┘              │
                                                      ┌─────┴─────┐
┌─────────────┐       ┌──────────────────────┐       │   Redis    │
│   Browser    │──SSE──│  Instance B           │       │  Pub/Sub   │
│   (Client)   │       │  sseConnections Map   │◀──subscribe──┤ Channels  │
└─────────────┘       └──────────────────────┘              │           │
                                                            └─────┬─────┘
                      ┌──────────────────────┐                    │
                      │  Instance C           │                    │
                      │  (runs pipeline)      │──publish──────────┘
                      └──────────────────────┘
```

### Implementation Plan

1. **Create `server/src/lib/sse-broadcaster.ts`**
   ```typescript
   interface SSEBroadcaster {
     publish(sessionId: string, event: PipelineSSEEvent): void;
     subscribe(sessionId: string, handler: (event: PipelineSSEEvent) => void): () => void;
     shutdown(): Promise<void>;
   }
   ```

2. **Two implementations behind feature flag:**
   - `LocalBroadcaster` — current in-memory Map (default)
   - `RedisBroadcaster` — Redis Pub/Sub with JSON serialization

3. **Redis channel naming:** `sse:session:{sessionId}`

4. **Modify routes to use broadcaster:**
   Replace direct `sseConnections.get(sessionId)` calls with `broadcaster.publish(sessionId, event)`. The broadcaster handles local delivery (in-memory Map) and cross-instance delivery (Redis).

5. **Connection registration unchanged:**
   Each instance still maintains its own `sseConnections` Map for local client tracking. The broadcaster adds the cross-instance fan-out layer on top.

### Redis Configuration

- Shared with rate limiting (Story 8's `redis-client.ts`)
- Feature flag: `FF_REDIS_SSE_BROADCAST` (default false)
- Fallback: If Redis is unavailable, fall back to local-only broadcasting (current behavior)

### Migration Path

1. Deploy Phase 1 (sticky sessions) — zero code changes
2. Deploy Redis for rate limiting (Story 8) — validates Redis infrastructure
3. Deploy SSE broadcaster with `FF_REDIS_SSE_BROADCAST=false` — code ships but inactive
4. Enable `FF_REDIS_SSE_BROADCAST=true` — cross-instance events flow
5. Remove sticky session requirement (optional — keeping sticky sessions as optimization reduces Redis traffic)

## Phase 3: Supabase Realtime (Not Recommended)

### What

Use Supabase's built-in Realtime channels for SSE event delivery. The pipeline publishes to a Supabase channel; the frontend subscribes directly.

### Why Not Recommended

- Adds latency (event → Supabase → client vs. event → client)
- Makes the core pipeline dependent on Supabase Realtime availability
- Supabase Realtime has connection limits per project
- Would require significant frontend changes (replace SSE with Supabase Realtime SDK)
- Current SSE protocol is custom (typed events, gate responses) — would need adaptation layer

### When It Makes Sense

If the product moves to a serverless architecture (e.g., Supabase Edge Functions for pipeline), Supabase Realtime becomes the natural event transport.

## Recommendation

**Today (single instance):** No changes needed. In-memory Map works.

**First scaling step:** Phase 1 — sticky sessions on Railway. Zero code changes, 5-minute configuration.

**When deploying frequently or needing fault tolerance:** Phase 2 — Redis Pub/Sub. Builds on existing Redis infrastructure from rate limiting. ~200 lines of new code.

**Timeline:** Phase 1 when scaling to 2+ instances. Phase 2 when sticky sessions cause deployment friction. Phase 3 only if architecture shifts to serverless.
