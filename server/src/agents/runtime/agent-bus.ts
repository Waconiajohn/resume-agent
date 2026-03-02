/**
 * Agent Bus — In-memory inter-agent message routing.
 *
 * Standard protocol for the 33-agent platform. Currently in-memory;
 * can be upgraded to Redis/NATS for distributed agents later.
 *
 * Supports namespaced routing via `domain:agentName` keys for cross-product
 * communication. Backward compatible: name-only keys still work.
 */

import { randomUUID } from 'node:crypto';
import type { AgentMessage } from './agent-protocol.js';
import logger from '../../lib/logger.js';

type MessageHandler = (msg: AgentMessage) => void;

export class AgentBus {
  private handlers = new Map<string, MessageHandler>();
  private messageLog: AgentMessage[] = [];

  /**
   * Subscribe an agent to receive messages.
   * Key can be namespaced (`domain:agentName`) or simple (`agentName`).
   * Namespaced keys enable cross-product routing; simple keys provide
   * backward compatibility with existing code.
   */
  subscribe(key: string, handler: MessageHandler): void {
    this.handlers.set(key, handler);
  }

  /** Unsubscribe an agent by key */
  unsubscribe(key: string): void {
    this.handlers.delete(key);
  }

  /**
   * Send a message from one agent to another.
   * Resolves the recipient handler by trying `domain:to` first,
   * then falling back to `to` (name-only) for backward compatibility.
   */
  send(partial: Omit<AgentMessage, 'id' | 'timestamp'>): AgentMessage {
    const msg: AgentMessage = {
      ...partial,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    };

    this.appendToLog(msg);

    const handler = this.resolveHandler(msg.to, msg.domain);
    if (handler) {
      try {
        handler(msg);
      } catch (err) {
        logger.error({ err, msg }, 'AgentBus: handler error');
      }
    } else {
      logger.warn({ to: msg.to, domain: msg.domain, type: msg.type }, 'AgentBus: no handler for recipient');
    }

    return msg;
  }

  /**
   * Broadcast a message to all agents subscribed in a domain.
   * Skips the sender (msg.from) to avoid echo loops.
   */
  sendBroadcast(domain: string, partial: Omit<AgentMessage, 'id' | 'timestamp' | 'to'>): AgentMessage[] {
    const prefix = `${domain}:`;
    const sent: AgentMessage[] = [];

    for (const [key, handler] of this.handlers) {
      // Match keys in the target domain
      if (!key.startsWith(prefix)) continue;

      const agentName = key.slice(prefix.length);
      // Skip the sender
      if (agentName === partial.from) continue;

      const msg: AgentMessage = {
        ...partial,
        to: agentName,
        id: randomUUID(),
        timestamp: new Date().toISOString(),
      };

      this.appendToLog(msg);

      try {
        handler(msg);
      } catch (err) {
        logger.error({ err, msg }, 'AgentBus: broadcast handler error');
      }

      sent.push(msg);
    }

    return sent;
  }

  /**
   * List subscribed agent keys, optionally filtered by domain.
   * Returns keys in `domain:name` or `name` format as registered.
   */
  listSubscribers(domain?: string): string[] {
    if (!domain) {
      return [...this.handlers.keys()];
    }
    const prefix = `${domain}:`;
    return [...this.handlers.keys()].filter(k => k.startsWith(prefix));
  }

  /** Get all messages sent during this session (for debugging/audit) */
  getLog(): readonly AgentMessage[] {
    return this.messageLog;
  }

  /** Clear all handlers and message log */
  reset(): void {
    this.handlers.clear();
    this.messageLog = [];
  }

  // ─── Private Helpers ────────────────────────────────────────────────

  /**
   * Resolve the handler for a recipient. Tries `domain:to` first (namespaced),
   * then falls back to `to` (name-only) for backward compatibility.
   */
  private resolveHandler(to: string, domain?: string): MessageHandler | undefined {
    if (domain) {
      const namespacedKey = `${domain}:${to}`;
      const handler = this.handlers.get(namespacedKey);
      if (handler) return handler;
    }
    // Fallback: name-only lookup for backward compatibility
    return this.handlers.get(to);
  }

  /** Append a message to the log, capping at 500 entries */
  private appendToLog(msg: AgentMessage): void {
    this.messageLog.push(msg);
    if (this.messageLog.length > 500) {
      this.messageLog = this.messageLog.slice(-250);
    }
  }
}
