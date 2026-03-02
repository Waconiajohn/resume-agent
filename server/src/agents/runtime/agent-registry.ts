/**
 * Agent Registry — Central registry for agent configurations.
 *
 * Allows agents to register themselves on module load and be
 * discovered by name or domain. Designed for the 33-agent platform
 * so the coordinator can instantiate agents without hard-coded imports.
 */

import type { AgentConfig, BaseState, BaseEvent } from './agent-protocol.js';

// Internal widened type used by the registry store.
// Callers register via registerAgent() which handles this widening safely.
type AnyAgentConfig = AgentConfig<BaseState, BaseEvent>;

class AgentRegistry {
  private readonly agents = new Map<string, AnyAgentConfig>();

  /** Register an agent config. Key is `domain:name` (e.g. `resume:strategist`). */
  register(config: AnyAgentConfig): void {
    const key = `${config.identity.domain}:${config.identity.name}`;
    if (this.agents.has(key)) {
      throw new Error(`Agent already registered: ${key}`);
    }
    this.agents.set(key, config);
  }

  /** Look up an agent by domain and name, cast to the expected config type. */
  get<T extends AnyAgentConfig = AnyAgentConfig>(domain: string, name: string): T | undefined {
    return this.agents.get(`${domain}:${name}`) as T | undefined;
  }

  /** Look up an agent by name only (returns first match across domains). */
  getByName<T extends AnyAgentConfig = AnyAgentConfig>(name: string): T | undefined {
    for (const [, config] of this.agents) {
      if (config.identity.name === name) return config as T;
    }
    return undefined;
  }

  /** List all agents registered for a domain. */
  listByDomain(domain: string): AnyAgentConfig[] {
    return [...this.agents.values()].filter(c => c.identity.domain === domain);
  }

  /** List all registered agents. */
  list(): AnyAgentConfig[] {
    return [...this.agents.values()];
  }

  /** Check if an agent is registered. */
  has(domain: string, name: string): boolean {
    return this.agents.has(`${domain}:${name}`);
  }

  /** Number of registered agents. */
  get size(): number {
    return this.agents.size;
  }

  /** Clear all registrations (useful for testing). */
  clear(): void {
    this.agents.clear();
  }
}

/** Singleton registry shared across the application. */
export const agentRegistry = new AgentRegistry();

/**
 * Type-safe helper for registering an agent config.
 *
 * Accepts a fully-typed `AgentConfig<TState, TEvent>` and widens it to the
 * registry's internal `AnyAgentConfig` type without requiring callers to use
 * `as unknown as AgentConfig` casts.
 *
 * Usage (in each agent.ts):
 * ```ts
 * import { registerAgent } from '../runtime/agent-registry.js';
 * registerAgent(myConfig);
 * ```
 */
export function registerAgent<
  TState extends BaseState,
  TEvent extends BaseEvent,
>(config: AgentConfig<TState, TEvent>): void {
  // Type widening: AgentConfig<TState, TEvent> → AgentConfig<BaseState, BaseEvent>.
  // Function parameters are contravariant so a direct cast is rejected by TS.
  // The double cast is confined to this one helper so callers never need it.
  agentRegistry.register(config as unknown as AnyAgentConfig);
}

export type { AgentRegistry };
