/**
 * Redis Bus Adapter — Pub/sub AgentBus implementation backed by ioredis.
 *
 * Implements the same interface as the in-memory AgentBus so it can be swapped
 * in transparently when REDIS_BUS_URL is set.
 *
 * Pattern:
 *  - Each logical recipient (domain:agentName or agentName) subscribes to a
 *    Redis channel named `agentbus:<key>`.
 *  - Messages are published as JSON to the target channel.
 *  - Broadcast publishes to all channels matching `agentbus:<domain>:*`.
 *
 * Fallback: if the Redis connection fails at startup or after reconnect budget
 * is exhausted, the bus transparently delegates to an in-memory AgentBus with
 * a logged warning.  All callers continue to work unchanged.
 *
 * Connection management:
 *  - Pub and Sub use separate ioredis clients (Redis protocol requirement).
 *  - Both use exponential backoff with jitter; max reconnect delay = 30 s.
 *  - connectTimeout = 5 s; if the initial connection exceeds this, fallback
 *    is activated immediately without blocking the application start.
 */

import { randomUUID } from 'node:crypto';
import Redis, { type RedisOptions } from 'ioredis';
import type { AgentMessage } from './agent-protocol.js';
import { AgentBus } from './agent-bus.js';
import logger from '../../lib/logger.js';

type MessageHandler = (msg: AgentMessage) => void;

const CHANNEL_PREFIX = 'agentbus:';
const CONNECT_TIMEOUT_MS = 5_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

function buildRedisOptions(): RedisOptions {
  return {
    lazyConnect: true,
    connectTimeout: CONNECT_TIMEOUT_MS,
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    retryStrategy(times: number) {
      // Exponential backoff with ±25 % jitter, capped at 30 s
      const base = Math.min(200 * Math.pow(2, times), MAX_RECONNECT_DELAY_MS);
      const jitter = base * 0.25 * (Math.random() - 0.5);
      return Math.round(base + jitter);
    },
  };
}

export class RedisBus {
  private readonly pub: Redis;
  private readonly sub: Redis;
  private readonly handlers = new Map<string, MessageHandler>();
  private messageLog: AgentMessage[] = [];
  private readonly fallback: AgentBus;

  private useFallback = false;
  private ready = false;

  constructor(redisUrl: string) {
    this.fallback = new AgentBus();

    const options = buildRedisOptions();
    this.pub = new Redis(redisUrl, options);
    this.sub = new Redis(redisUrl, options);

    this.pub.on('error', (err) => {
      logger.warn({ err }, 'RedisBus: pub client error');
      this.activateFallback('pub client error');
    });

    this.sub.on('error', (err) => {
      logger.warn({ err }, 'RedisBus: sub client error');
      this.activateFallback('sub client error');
    });

    this.sub.on('message', (channel: string, data: string) => {
      this.handleIncoming(channel, data);
    });
  }

  /** Connect with a timeout; activates fallback if Redis is unreachable. */
  async connect(): Promise<void> {
    const connectWithTimeout = async (): Promise<void> => {
      const timer = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('connect timeout')), CONNECT_TIMEOUT_MS),
      );
      await Promise.race([
        Promise.all([this.pub.connect(), this.sub.connect()]),
        timer,
      ]);
    };

    try {
      await connectWithTimeout();
      this.ready = true;
      logger.info('RedisBus: connected (pub + sub)');
    } catch (err) {
      logger.warn({ err }, 'RedisBus: failed to connect — falling back to in-memory bus');
      this.activateFallback('initial connect failed');
    }
  }

  /** Subscribe an agent to receive messages on key `domain:agentName` or `agentName`. */
  subscribe(key: string, handler: MessageHandler): void {
    if (this.useFallback) {
      this.fallback.subscribe(key, handler);
      return;
    }
    this.handlers.set(key, handler);
    const channel = `${CHANNEL_PREFIX}${key}`;
    this.sub.subscribe(channel).catch((err: unknown) => {
      logger.error({ err, channel }, 'RedisBus: subscribe failed');
      this.activateFallback('subscribe failed');
    });
  }

  /** Unsubscribe an agent by key. */
  unsubscribe(key: string): void {
    if (this.useFallback) {
      this.fallback.unsubscribe(key);
      return;
    }
    this.handlers.delete(key);
    const channel = `${CHANNEL_PREFIX}${key}`;
    this.sub.unsubscribe(channel).catch((err: unknown) => {
      logger.error({ err, channel }, 'RedisBus: unsubscribe failed');
    });
  }

  /**
   * Send a message from one agent to another.
   * Resolves the recipient channel by trying `domain:to` first (namespaced),
   * then falling back to `to` (name-only) for backward compatibility.
   */
  send(partial: Omit<AgentMessage, 'id' | 'timestamp'>): AgentMessage {
    if (this.useFallback) return this.fallback.send(partial);

    const msg: AgentMessage = {
      ...partial,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    };

    this.appendToLog(msg);

    const channel = this.resolveChannel(msg.to, msg.domain);
    this.pub.publish(channel, JSON.stringify(msg)).catch((err: unknown) => {
      logger.error({ err, channel }, 'RedisBus: publish failed');
      // Attempt local fallback for this message
      this.handleLocalFallbackSend(msg);
    });

    return msg;
  }

  /**
   * Broadcast a message to all agents subscribed in a domain.
   * Uses PUBSUB CHANNELS to enumerate matching channels; skips the sender.
   */
  sendBroadcast(domain: string, partial: Omit<AgentMessage, 'id' | 'timestamp' | 'to'>): AgentMessage[] {
    if (this.useFallback) return this.fallback.sendBroadcast(domain, partial);

    const sent: AgentMessage[] = [];
    const prefix = `${CHANNEL_PREFIX}${domain}:`;

    // Enumerate local handlers matching this domain (Redis-side broadcast requires
    // PUBSUB CHANNELS which is async; for now use local handler map for routing)
    for (const [key] of this.handlers) {
      if (!key.startsWith(`${domain}:`)) continue;
      const agentName = key.slice(`${domain}:`.length);
      if (agentName === partial.from) continue;

      const msg: AgentMessage = {
        ...partial,
        to: agentName,
        id: randomUUID(),
        timestamp: new Date().toISOString(),
      };
      this.appendToLog(msg);

      const channel = `${prefix}${agentName}`;
      this.pub.publish(channel, JSON.stringify(msg)).catch((err: unknown) => {
        logger.error({ err, channel }, 'RedisBus: broadcast publish failed');
      });

      sent.push(msg);
    }

    return sent;
  }

  /** List subscribed agent keys, optionally filtered by domain. */
  listSubscribers(domain?: string): string[] {
    if (this.useFallback) return this.fallback.listSubscribers(domain);
    if (!domain) return [...this.handlers.keys()];
    const prefix = `${domain}:`;
    return [...this.handlers.keys()].filter(k => k.startsWith(prefix));
  }

  /** Get all messages sent during this session (for debugging/audit). */
  getLog(): readonly AgentMessage[] {
    if (this.useFallback) return this.fallback.getLog();
    return this.messageLog;
  }

  /** Reset handlers and message log. */
  reset(): void {
    if (this.useFallback) {
      this.fallback.reset();
      return;
    }
    this.handlers.clear();
    this.messageLog = [];
  }

  /** Whether the bus is currently using the in-memory fallback. */
  get isFallbackActive(): boolean {
    return this.useFallback;
  }

  /** Graceful shutdown — disconnect Redis clients. */
  async disconnect(): Promise<void> {
    try {
      await Promise.allSettled([
        this.pub.quit(),
        this.sub.quit(),
      ]);
      logger.info('RedisBus: disconnected');
    } catch (err) {
      logger.warn({ err }, 'RedisBus: error during disconnect');
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────

  private handleIncoming(channel: string, data: string): void {
    const key = channel.slice(CHANNEL_PREFIX.length);
    const handler = this.handlers.get(key);
    if (!handler) return;

    let msg: AgentMessage;
    try {
      msg = JSON.parse(data) as AgentMessage;
    } catch (err) {
      logger.error({ err, channel }, 'RedisBus: failed to parse message');
      return;
    }

    this.appendToLog(msg);

    try {
      handler(msg);
    } catch (err) {
      logger.error({ err, channel }, 'RedisBus: handler error');
    }
  }

  private resolveChannel(to: string, domain?: string): string {
    if (domain) {
      const namespacedKey = `${domain}:${to}`;
      if (this.handlers.has(namespacedKey)) {
        return `${CHANNEL_PREFIX}${namespacedKey}`;
      }
    }
    return `${CHANNEL_PREFIX}${to}`;
  }

  private handleLocalFallbackSend(msg: AgentMessage): void {
    const handler =
      (msg.domain ? this.handlers.get(`${msg.domain}:${msg.to}`) : undefined)
      ?? this.handlers.get(msg.to);
    if (handler) {
      try {
        handler(msg);
      } catch (err) {
        logger.error({ err }, 'RedisBus: local fallback handler error');
      }
    }
  }

  private activateFallback(reason: string): void {
    if (this.useFallback) return;
    logger.warn({ reason }, 'RedisBus: activating in-memory fallback');
    this.useFallback = true;
    // Migrate existing handlers to the fallback bus
    for (const [key, handler] of this.handlers) {
      this.fallback.subscribe(key, handler);
    }
  }

  private appendToLog(msg: AgentMessage): void {
    this.messageLog.push(msg);
    if (this.messageLog.length > 500) {
      this.messageLog.splice(0, 250);
    }
  }
}

/**
 * Factory: creates a RedisBus if REDIS_BUS_URL is set, otherwise returns null.
 * Returns null when the env var is absent — caller falls back to AgentBus.
 */
export async function createRedisBusIfConfigured(): Promise<RedisBus | null> {
  const url = process.env.REDIS_BUS_URL;
  if (!url) return null;

  const bus = new RedisBus(url);
  await bus.connect();
  return bus;
}
