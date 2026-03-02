/**
 * Sprint 11 — Story 8: Dynamic Agent Discovery
 *
 * Tests capability search, domain listing, and describe.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { agentRegistry } from '../agents/runtime/agent-registry.js';
import type { AgentConfig, BaseState, BaseEvent } from '../agents/runtime/agent-protocol.js';

function makeConfig(
  name: string,
  domain: string,
  capabilities: string[] = [],
): AgentConfig<BaseState, BaseEvent> {
  return {
    identity: { name, domain },
    system_prompt: `You are ${name}`,
    tools: [
      {
        name: `${name}_tool`,
        description: `Tool for ${name}`,
        input_schema: { type: 'object', properties: {} },
        execute: async () => 'ok',
      },
    ],
    model: 'test-model',
    max_rounds: 5,
    round_timeout_ms: 10000,
    overall_timeout_ms: 60000,
    capabilities,
  };
}

describe('AgentRegistry — Dynamic Discovery', () => {
  beforeEach(() => {
    agentRegistry.clear();
  });

  // ─── findByCapability ───────────────────────────────────────────

  it('finds agents by capability', () => {
    agentRegistry.register(makeConfig('strategist', 'resume', ['research', 'positioning']));
    agentRegistry.register(makeConfig('craftsman', 'resume', ['content_creation', 'self_review']));
    agentRegistry.register(makeConfig('producer', 'resume', ['quality_review']));

    const researchers = agentRegistry.findByCapability('research');
    expect(researchers).toHaveLength(1);
    expect(researchers[0].identity.name).toBe('strategist');
  });

  it('finds multiple agents sharing a capability', () => {
    agentRegistry.register(makeConfig('strategist', 'resume', ['research', 'quality_review']));
    agentRegistry.register(makeConfig('producer', 'resume', ['quality_review']));

    const reviewers = agentRegistry.findByCapability('quality_review');
    expect(reviewers).toHaveLength(2);
  });

  it('filters capability search by domain', () => {
    agentRegistry.register(makeConfig('strategist', 'resume', ['research']));
    agentRegistry.register(makeConfig('analyst', 'sales', ['research']));

    const resumeResearchers = agentRegistry.findByCapability('research', 'resume');
    expect(resumeResearchers).toHaveLength(1);
    expect(resumeResearchers[0].identity.domain).toBe('resume');
  });

  it('returns empty for unknown capability', () => {
    agentRegistry.register(makeConfig('strategist', 'resume', ['research']));
    expect(agentRegistry.findByCapability('teleportation')).toHaveLength(0);
  });

  it('handles agents with no capabilities', () => {
    agentRegistry.register(makeConfig('basic', 'resume'));
    expect(agentRegistry.findByCapability('research')).toHaveLength(0);
  });

  // ─── listDomains ───────────────────────────────────────────────

  it('lists all unique domains', () => {
    agentRegistry.register(makeConfig('strategist', 'resume', ['research']));
    agentRegistry.register(makeConfig('craftsman', 'resume', ['content_creation']));
    agentRegistry.register(makeConfig('analyst', 'sales', ['research']));

    const domains = agentRegistry.listDomains();
    expect(domains).toHaveLength(2);
    expect(domains).toContain('resume');
    expect(domains).toContain('sales');
  });

  it('returns empty domains for empty registry', () => {
    expect(agentRegistry.listDomains()).toHaveLength(0);
  });

  // ─── describe ──────────────────────────────────────────────────

  it('returns agent description with identity, capabilities, tools, model', () => {
    agentRegistry.register(makeConfig('strategist', 'resume', ['research', 'positioning']));

    const desc = agentRegistry.describe('resume', 'strategist');
    expect(desc).toBeDefined();
    expect(desc!.identity).toEqual({ name: 'strategist', domain: 'resume' });
    expect(desc!.capabilities).toEqual(['research', 'positioning']);
    expect(desc!.tools).toEqual(['strategist_tool']);
    expect(desc!.model).toBe('test-model');
    expect(desc!.max_rounds).toBe(5);
  });

  it('returns undefined for unknown agent', () => {
    expect(agentRegistry.describe('resume', 'nonexistent')).toBeUndefined();
  });

  it('returns empty capabilities array when agent has none', () => {
    agentRegistry.register(makeConfig('basic', 'resume'));
    const desc = agentRegistry.describe('resume', 'basic');
    expect(desc!.capabilities).toEqual([]);
  });
});
