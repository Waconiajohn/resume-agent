/**
 * Agent Bus Factory — Process-level singleton accessor.
 *
 * Defaults to an in-memory AgentBus. At startup, index.ts calls
 * setAgentBus() with a RedisBus if REDIS_BUS_URL is configured.
 *
 * All per-pipeline code calls getAgentBus() instead of `new AgentBus()`.
 * This makes the Redis upgrade transparent to the rest of the codebase.
 */

import { AgentBus } from './agent-bus.js';

let singleton: AgentBus = new AgentBus();

/**
 * Replace the process-level bus singleton.
 * Must be called before any pipeline starts (i.e., during server startup).
 * Accepts any object structurally compatible with AgentBus (e.g. RedisBus).
 */
export function setAgentBus(bus: AgentBus): void {
  singleton = bus;
}

/**
 * Get the process-level bus singleton.
 * Returns the RedisBus (cast to AgentBus) when configured, otherwise the
 * default in-memory AgentBus.
 */
export function getAgentBus(): AgentBus {
  return singleton;
}
