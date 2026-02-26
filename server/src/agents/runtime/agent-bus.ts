/**
 * Agent Bus — In-memory inter-agent message routing.
 *
 * Standard protocol for the 33-agent platform. Currently in-memory;
 * can be upgraded to Redis/NATS for distributed agents later.
 */

import { randomUUID } from 'node:crypto';
import type { AgentMessage } from './agent-protocol.js';
import logger from '../../lib/logger.js';

type MessageHandler = (msg: AgentMessage) => void;

export class AgentBus {
  private handlers = new Map<string, MessageHandler>();
  private messageLog: AgentMessage[] = [];

  /** Subscribe an agent to receive messages */
  subscribe(agentName: string, handler: MessageHandler): void {
    this.handlers.set(agentName, handler);
  }

  /** Unsubscribe an agent */
  unsubscribe(agentName: string): void {
    this.handlers.delete(agentName);
  }

  /** Send a message from one agent to another */
  send(partial: Omit<AgentMessage, 'id' | 'timestamp'>): AgentMessage {
    const msg: AgentMessage = {
      ...partial,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    };

    this.messageLog.push(msg);

    const handler = this.handlers.get(msg.to);
    if (handler) {
      try {
        handler(msg);
      } catch (err) {
        logger.error({ err, msg }, 'AgentBus: handler error');
      }
    } else {
      logger.warn({ to: msg.to, type: msg.type }, 'AgentBus: no handler for recipient');
    }

    return msg;
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
}
