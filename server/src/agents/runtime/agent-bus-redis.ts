/**
 * Agent Bus (Redis Streams) — Proof-of-concept implementation.
 *
 * Feature-flagged via FF_REDIS_BUS (default: false). NOT used in production.
 * See docs/DECISIONS.md ADR-007 for the full evaluation and decision.
 *
 * This implementation mirrors the in-memory AgentBus interface exactly so
 * the coordinator requires zero changes to adopt it.
 *
 * Design:
 *   - One Redis Stream per logical queue: `agent-bus:{sessionId}:{recipientAgent}`
 *   - Messages published via XADD (append to stream, guaranteed ordering)
 *   - Messages consumed via XREADGROUP with consumer groups (at-least-once delivery)
 *   - Messages acknowledged via XACK after successful handler execution
 *   - Streams are trimmed to MAXLEN 1000 to bound memory usage
 *   - Graceful disconnect flushes pending reads and releases consumer group memberships
 *
 * Usage (when FF_REDIS_BUS=true and REDIS_URL is set):
 *   import { createAgentBus } from './agent-bus-redis.js';
 *   const bus = await createAgentBus({ sessionId: 'sess_123' });
 *   // ... use bus identically to AgentBus ...
 *   await bus.disconnect();
 *
 * Dependencies: requires `ioredis` package to be installed.
 *   npm install ioredis
 *   npm install --save-dev @types/ioredis  (types are bundled with ioredis v5+)
 *
 * NOTE: This file uses a locally-defined minimal Redis interface so it compiles
 * without ioredis installed. Replace `MinimalRedis` with `import Redis from 'ioredis'`
 * when activating for real use.
 */

import { randomUUID } from 'node:crypto';
import type { AgentMessage } from './agent-protocol.js';
import logger from '../../lib/logger.js';

// ─── Minimal Redis interface (mirrors ioredis surface used here) ──────
//
// This type stub lets the file compile without ioredis installed.
// When activating: replace this block with `import Redis from 'ioredis'`
// and remove the `createRedisClient` stub below.

interface StreamEntry {
  id: string;
  message: Record<string, string>;
}

interface MinimalRedis {
  xadd(
    key: string,
    id: string,
    ...fieldValues: string[]
  ): Promise<string | null>;

  xgroup(
    command: 'CREATE',
    key: string,
    groupName: string,
    id: string,
    makeStream: 'MKSTREAM',
  ): Promise<'OK'>;

  xreadgroup(
    groupCommand: 'GROUP',
    groupName: string,
    consumerName: string,
    countCommand: 'COUNT',
    count: number,
    blockCommand: 'BLOCK',
    blockMs: number,
    streamsCommand: 'STREAMS',
    key: string,
    id: string,
  ): Promise<Array<[string, StreamEntry[]]> | null>;

  xack(key: string, groupName: string, ...ids: string[]): Promise<number>;

  xpending(
    key: string,
    groupName: string,
    start: string,
    end: string,
    count: number,
  ): Promise<Array<[string, string, number, number]>>;

  xclaim(
    key: string,
    groupName: string,
    consumerName: string,
    minIdleTimeMs: number,
    ...ids: string[]
  ): Promise<StreamEntry[]>;

  del(key: string): Promise<number>;

  quit(): Promise<'OK'>;
}

// ─── Stub factory — replace with real ioredis when activating ─────────

/**
 * Creates a real Redis client from the REDIS_URL environment variable.
 *
 * To activate: replace this function body with:
 *   import Redis from 'ioredis';
 *   return new Redis(url, { lazyConnect: true, enableReadyCheck: true });
 */
function createRedisClient(_url: string): MinimalRedis {
  // This stub throws at runtime if accidentally invoked with FF_REDIS_BUS=false.
  // When FF_REDIS_BUS=true, replace this with a real ioredis client.
  throw new Error(
    'agent-bus-redis: ioredis is not installed. ' +
    'Run `npm install ioredis` and replace createRedisClient() with a real ioredis instance. ' +
    'See docs/DECISIONS.md ADR-007.',
  );
}

// ─── Constants ────────────────────────────────────────────────────────

const STREAM_MAX_LEN = 1_000;
const CONSUMER_GROUP = 'coordinator';
const CONSUMER_PREFIX = 'worker';
const READ_BLOCK_MS = 100;          // Block up to 100ms waiting for new entries
const READ_COUNT_PER_POLL = 10;     // Max messages to read per XREADGROUP call
const POLL_INTERVAL_MS = 50;        // Interval between poll cycles (if not blocking)
const PENDING_RECLAIM_IDLE_MS = 30_000; // Reclaim unacknowledged messages after 30s

// ─── Types ────────────────────────────────────────────────────────────

type MessageHandler = (msg: AgentMessage) => void;

interface Subscription {
  agentName: string;
  handler: MessageHandler;
  consumerName: string;
  streamKey: string;
  pollTimer: ReturnType<typeof setInterval> | null;
  stopping: boolean;
}

interface AgentBusRedisOptions {
  sessionId: string;
  redisUrl?: string;
}

// ─── AgentBusRedis ────────────────────────────────────────────────────

/**
 * Redis Streams-backed implementation of the AgentBus interface.
 *
 * Ordering: guaranteed within each stream (XADD assigns monotonically
 * increasing IDs: millisecond-epoch + sequence number).
 *
 * Durability: messages persist in Redis until the stream is trimmed
 * (MAXLEN 1000) or explicitly deleted on reset(). Survive Node.js restarts.
 *
 * Delivery: at-least-once via consumer groups. Handlers must be idempotent.
 * Unacknowledged messages in XPENDING are reclaimed after PENDING_RECLAIM_IDLE_MS.
 */
export class AgentBusRedis {
  private readonly redis: MinimalRedis;
  private readonly sessionId: string;
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly messageLog: AgentMessage[] = [];
  private disconnected = false;

  private constructor(redis: MinimalRedis, sessionId: string) {
    this.redis = redis;
    this.sessionId = sessionId;
  }

  /** Factory: connect to Redis and return a ready-to-use bus instance. */
  static async create(options: AgentBusRedisOptions): Promise<AgentBusRedis> {
    const url = options.redisUrl ?? process.env['REDIS_URL'];
    if (!url) {
      throw new Error(
        'AgentBusRedis: REDIS_URL environment variable is required. ' +
        'Set it in server/.env or pass redisUrl in options.',
      );
    }

    const redis = createRedisClient(url);
    const bus = new AgentBusRedis(redis, options.sessionId);

    logger.info({ sessionId: options.sessionId }, 'AgentBusRedis: connected');
    return bus;
  }

  // ─── Public interface (matches AgentBus) ──────────────────────────

  /** Subscribe an agent to receive messages sent to its name. */
  subscribe(agentName: string, handler: MessageHandler): void {
    if (this.disconnected) {
      throw new Error('AgentBusRedis: cannot subscribe after disconnect()');
    }
    if (this.subscriptions.has(agentName)) {
      logger.warn({ agentName }, 'AgentBusRedis: replacing existing subscription');
      this.unsubscribe(agentName);
    }

    const streamKey = this.streamKey(agentName);
    const consumerName = `${CONSUMER_PREFIX}-${randomUUID().slice(0, 8)}`;

    const sub: Subscription = {
      agentName,
      handler,
      consumerName,
      streamKey,
      pollTimer: null,
      stopping: false,
    };

    this.subscriptions.set(agentName, sub);

    // Kick off the async setup (create group + start polling)
    void this.setupSubscription(sub);
  }

  /** Unsubscribe an agent. In-flight messages are allowed to drain. */
  unsubscribe(agentName: string): void {
    const sub = this.subscriptions.get(agentName);
    if (!sub) return;

    sub.stopping = true;
    if (sub.pollTimer !== null) {
      clearInterval(sub.pollTimer);
      sub.pollTimer = null;
    }

    this.subscriptions.delete(agentName);
    logger.debug({ agentName }, 'AgentBusRedis: unsubscribed');
  }

  /**
   * Publish a message to a recipient agent's stream.
   *
   * Returns the fully-formed AgentMessage with generated id and timestamp.
   * The message is durably appended to the Redis stream before returning.
   */
  send(partial: Omit<AgentMessage, 'id' | 'timestamp'>): AgentMessage {
    if (this.disconnected) {
      throw new Error('AgentBusRedis: cannot send after disconnect()');
    }

    const msg: AgentMessage = {
      ...partial,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    };

    // Append to in-process log (matches in-memory bus behaviour)
    this.messageLog.push(msg);
    if (this.messageLog.length > 500) {
      this.messageLog.splice(0, this.messageLog.length - 250);
    }

    // Fire-and-forget publish — errors are logged, not thrown.
    // The caller cannot await a void-returning send() (interface parity with AgentBus).
    void this.publishMessage(msg);

    return msg;
  }

  /** Get all messages sent during this session (matches AgentBus.getLog()). */
  getLog(): readonly AgentMessage[] {
    return this.messageLog;
  }

  /**
   * Clear all handlers, message log, and delete all streams for this session.
   * Called at end of pipeline to reclaim Redis memory.
   */
  reset(): void {
    // Stop all subscriptions
    for (const agentName of this.subscriptions.keys()) {
      this.unsubscribe(agentName);
    }
    this.messageLog.length = 0;

    // Best-effort delete streams
    void this.deleteAllStreams();
  }

  /**
   * Gracefully stop all polling loops and release the Redis connection.
   * Call this after reset() or when the coordinator finishes.
   */
  async disconnect(): Promise<void> {
    if (this.disconnected) return;
    this.disconnected = true;

    for (const agentName of [...this.subscriptions.keys()]) {
      this.unsubscribe(agentName);
    }

    try {
      await this.redis.quit();
      logger.info({ sessionId: this.sessionId }, 'AgentBusRedis: disconnected');
    } catch (err) {
      logger.warn({ err }, 'AgentBusRedis: error during disconnect (ignored)');
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────

  private streamKey(agentName: string): string {
    // Namespaced by session so different pipeline runs don't collide.
    // Example: `agent-bus:sess_abc123:craftsman`
    return `agent-bus:${this.sessionId}:${agentName}`;
  }

  private async setupSubscription(sub: Subscription): Promise<void> {
    try {
      // XGROUP CREATE ... MKSTREAM creates the stream if it doesn't exist.
      // '$' means: only read messages published after this subscriber joined.
      // Use '0' if you want to replay all messages from stream start (redelivery scenario).
      await this.redis.xgroup('CREATE', sub.streamKey, CONSUMER_GROUP, '$', 'MKSTREAM');
      logger.debug(
        { agentName: sub.agentName, stream: sub.streamKey },
        'AgentBusRedis: consumer group created',
      );
    } catch (err) {
      // BUSYGROUP error means the group already exists — safe to ignore.
      const errMsg = err instanceof Error ? err.message : String(err);
      if (!errMsg.includes('BUSYGROUP')) {
        logger.error({ err, agentName: sub.agentName }, 'AgentBusRedis: XGROUP CREATE failed');
        return;
      }
    }

    // Start the poll loop
    await this.pollLoop(sub);
  }

  /**
   * Main message delivery loop for a subscriber.
   *
   * Uses XREADGROUP BLOCK to wait efficiently for new messages.
   * When a message arrives, calls the handler synchronously, then XACKs.
   * On handler error, the message remains in XPENDING for reclaim.
   */
  private async pollLoop(sub: Subscription): Promise<void> {
    // First, reclaim any messages this consumer had pending from a prior run
    await this.reclaimPendingMessages(sub);

    while (!sub.stopping && !this.disconnected) {
      try {
        // XREADGROUP GROUP <group> <consumer> COUNT <n> BLOCK <ms> STREAMS <key> >
        // '>' means: read new messages not yet delivered to any consumer in this group.
        const results = await this.redis.xreadgroup(
          'GROUP', CONSUMER_GROUP, sub.consumerName,
          'COUNT', READ_COUNT_PER_POLL,
          'BLOCK', READ_BLOCK_MS,
          'STREAMS', sub.streamKey,
          '>',
        );

        if (sub.stopping || this.disconnected) break;
        if (!results || results.length === 0) continue;

        const [, entries] = results[0] ?? ['', []];
        if (!entries || entries.length === 0) continue;

        for (const entry of entries) {
          await this.deliverEntry(sub, entry);
        }
      } catch (err) {
        if (sub.stopping || this.disconnected) break;

        const errMsg = err instanceof Error ? err.message : String(err);
        // NOGROUP error: stream was deleted (e.g., reset() called) — stop gracefully.
        if (errMsg.includes('NOGROUP') || errMsg.includes('ERR no such key')) {
          logger.info({ agentName: sub.agentName }, 'AgentBusRedis: stream gone, stopping poll');
          break;
        }

        logger.warn(
          { err, agentName: sub.agentName },
          'AgentBusRedis: XREADGROUP error, will retry',
        );
        // Brief pause before retry to avoid hot-looping on persistent errors
        await sleep(POLL_INTERVAL_MS);
      }
    }
  }

  private async deliverEntry(sub: Subscription, entry: StreamEntry): Promise<void> {
    const { id, message } = entry;

    // Deserialize the AgentMessage from the Redis hash fields
    let msg: AgentMessage;
    try {
      const raw = message['payload'];
      if (!raw) {
        logger.warn({ id, agentName: sub.agentName }, 'AgentBusRedis: entry missing payload field');
        await this.redis.xack(sub.streamKey, CONSUMER_GROUP, id);
        return;
      }
      msg = JSON.parse(raw) as AgentMessage;
    } catch (err) {
      logger.error({ err, id }, 'AgentBusRedis: failed to deserialize message, discarding');
      // ACK so it doesn't stay in XPENDING forever
      await this.redis.xack(sub.streamKey, CONSUMER_GROUP, id);
      return;
    }

    // Invoke the handler
    try {
      sub.handler(msg);
      // ACK on success — removes from XPENDING
      await this.redis.xack(sub.streamKey, CONSUMER_GROUP, id);
      logger.debug(
        { id, agentName: sub.agentName, msgType: msg.type },
        'AgentBusRedis: message delivered and acknowledged',
      );
    } catch (err) {
      // Do NOT ACK on handler error — message stays in XPENDING for reclaim.
      // The coordinator's syncHandler wraps async handlers in void, so handler
      // errors should not reach here in practice, but we guard defensively.
      logger.error(
        { err, id, agentName: sub.agentName },
        'AgentBusRedis: handler threw, message left in XPENDING for reclaim',
      );
    }
  }

  /**
   * Reclaim messages that were delivered but never acknowledged in a prior run.
   *
   * This is the at-least-once delivery guarantee: if a consumer crashed between
   * XREADGROUP and XACK, the message stays in XPENDING and will be redelivered
   * here on the next subscribe() call.
   */
  private async reclaimPendingMessages(sub: Subscription): Promise<void> {
    try {
      const pending = await this.redis.xpending(
        sub.streamKey,
        CONSUMER_GROUP,
        '-', '+',
        READ_COUNT_PER_POLL,
      );

      if (!pending || pending.length === 0) return;

      const idleEnough = pending
        .filter(([, , idleMs]) => idleMs >= PENDING_RECLAIM_IDLE_MS)
        .map(([id]) => id);

      if (idleEnough.length === 0) return;

      const claimed = await this.redis.xclaim(
        sub.streamKey,
        CONSUMER_GROUP,
        sub.consumerName,
        PENDING_RECLAIM_IDLE_MS,
        ...idleEnough,
      );

      logger.info(
        { agentName: sub.agentName, count: claimed.length },
        'AgentBusRedis: reclaimed pending messages',
      );

      for (const entry of claimed) {
        await this.deliverEntry(sub, entry);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // Stream or group may not exist yet — that's fine.
      if (!errMsg.includes('NOGROUP') && !errMsg.includes('ERR no such key')) {
        logger.warn({ err, agentName: sub.agentName }, 'AgentBusRedis: reclaim failed (ignored)');
      }
    }
  }

  /**
   * Publish an AgentMessage to the recipient's stream.
   *
   * Serializes the full message as a single `payload` field in the Redis hash.
   * Using a single field (rather than one field per AgentMessage key) keeps the
   * serialization/deserialization simple and avoids type coercion issues with
   * Redis's string-only field storage.
   */
  private async publishMessage(msg: AgentMessage): Promise<void> {
    const streamKey = this.streamKey(msg.to);

    try {
      // XADD <key> MAXLEN ~ 1000 * payload <json>
      // '*' = auto-generate ID (millisecond-epoch + sequence)
      // MAXLEN ~ 1000 = trim to approximately 1000 entries (amortized)
      await this.redis.xadd(
        streamKey,
        `MAXLEN ~ ${STREAM_MAX_LEN}` as unknown as string, // ioredis overloaded signature
        '*',
        'payload', JSON.stringify(msg),
        'from', msg.from,
        'to', msg.to,
        'type', msg.type,
        'msgId', msg.id,
      );

      logger.debug(
        { from: msg.from, to: msg.to, type: msg.type, stream: streamKey },
        'AgentBusRedis: message published',
      );
    } catch (err) {
      logger.error(
        { err, from: msg.from, to: msg.to, type: msg.type },
        'AgentBusRedis: XADD failed — message lost',
      );
      // Re-throw so callers can detect publish failures in tests
      throw err;
    }
  }

  private async deleteAllStreams(): Promise<void> {
    const agentNames = ['strategist', 'craftsman', 'producer'];
    for (const name of agentNames) {
      try {
        await this.redis.del(this.streamKey(name));
      } catch {
        // Best-effort — ignore errors on cleanup
      }
    }
    logger.debug({ sessionId: this.sessionId }, 'AgentBusRedis: streams deleted');
  }
}

// ─── Helper ───────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Factory function ─────────────────────────────────────────────────

/**
 * Create a Redis-backed AgentBus for a session.
 *
 * Caller MUST call `await bus.disconnect()` when the pipeline completes
 * to release the Redis connection.
 *
 * Feature-flagged: only call this when FF_REDIS_BUS is true.
 *
 * Example integration in coordinator.ts:
 *
 *   import { FF_REDIS_BUS } from '../lib/feature-flags.js';
 *   import { AgentBus } from './runtime/agent-bus.js';
 *   import { AgentBusRedis } from './runtime/agent-bus-redis.js';
 *
 *   let bus: AgentBus | AgentBusRedis;
 *   let busDisconnect: (() => Promise<void>) | null = null;
 *
 *   if (FF_REDIS_BUS) {
 *     const redisBus = await AgentBusRedis.create({ sessionId: session_id });
 *     bus = redisBus as unknown as AgentBus; // same interface, different backing
 *     busDisconnect = () => redisBus.disconnect();
 *   } else {
 *     bus = new AgentBus();
 *   }
 *
 *   try {
 *     // ... run pipeline ...
 *   } finally {
 *     if (busDisconnect) await busDisconnect();
 *   }
 */
export async function createAgentBus(options: AgentBusRedisOptions): Promise<AgentBusRedis> {
  return AgentBusRedis.create(options);
}
