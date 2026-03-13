/**
 * Agent Bus Factory — Process-level singleton accessor.
 *
 * Defaults to an in-memory AgentBus. At startup, index.ts calls
 * setAgentBus() with a RedisBus if REDIS_BUS_URL is configured.
 *
 * All per-pipeline code calls getAgentBus() instead of `new AgentBus()`.
 * This makes the Redis upgrade transparent to the rest of the codebase.
 */

import { AgentBus, type IAgentBus } from './agent-bus.js';

let singleton: IAgentBus = new AgentBus();

/**
 * Replace the process-level bus singleton.
 * Must be called before any pipeline starts (i.e., during server startup).
 * Accepts any IAgentBus implementation (AgentBus, RedisBus, etc.).
 */
export function setAgentBus(bus: IAgentBus): void {
  singleton = bus;
}

/**
 * Get the process-level bus singleton.
 * Returns the RedisBus when configured, otherwise the default in-memory AgentBus.
 */
export function getAgentBus(): IAgentBus {
  return singleton;
}
