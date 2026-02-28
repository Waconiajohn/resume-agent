/**
 * Agent Context — Creates the runtime context passed to agent tools.
 *
 * Wraps pipeline state, SSE emission, user interaction, and the message bus
 * into a single context object that tools receive.
 *
 * This module is intentionally domain-agnostic. TState and TEvent are generic
 * parameters so any product can bind its own concrete types at the product layer.
 */

import type { AgentContext, AgentIdentity, AgentMessage, BaseState, BaseEvent } from './agent-protocol.js';
import type { AgentBus } from './agent-bus.js';

export interface CreateContextParams<
  TState extends BaseState = BaseState,
  TEvent extends BaseEvent = BaseEvent,
> {
  sessionId: string;
  userId: string;
  state: TState;
  emit: (event: TEvent) => void;
  waitForUser: <T>(gate: string) => Promise<T>;
  signal: AbortSignal;
  bus: AgentBus;
  identity: AgentIdentity;
}

/** Internals exposed to the coordinator (not to tools) */
export interface ContextInternals {
  /** Messages this agent sent to other agents */
  messagesOut: AgentMessage[];
}

/**
 * Create an AgentContext for a specific agent invocation.
 *
 * Returns both the context (passed to tools) and internals
 * (read by the coordinator after the agent completes).
 */
export function createAgentContext<
  TState extends BaseState = BaseState,
  TEvent extends BaseEvent = BaseEvent,
>(
  params: CreateContextParams<TState, TEvent>,
): { ctx: AgentContext<TState, TEvent>; internals: ContextInternals } {
  const { sessionId, userId, state, emit, waitForUser, signal, bus, identity } = params;
  const scratchpad: Record<string, unknown> = {};
  const internals: ContextInternals = { messagesOut: [] };

  const ctx: AgentContext<TState, TEvent> = {
    sessionId,
    userId,
    emit,
    waitForUser,
    signal,
    scratchpad,

    getState() {
      return state;
    },

    updateState(patch: Partial<TState>) {
      Object.assign(state, patch);
    },

    sendMessage(partial) {
      const msg = bus.send({
        ...partial,
        from: identity.name,
      });
      internals.messagesOut.push(msg);
    },
  };

  return { ctx, internals };
}
