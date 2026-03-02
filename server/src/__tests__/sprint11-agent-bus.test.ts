/**
 * Sprint 11 — Story 7: Agent Bus Cross-Product Routing
 *
 * Tests namespaced routing, broadcast, backward compatibility,
 * and subscriber listing.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentBus } from '../agents/runtime/agent-bus.js';
import type { AgentMessage } from '../agents/runtime/agent-protocol.js';

// Suppress logger output in tests
vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

describe('AgentBus — Cross-Product Routing', () => {
  let bus: AgentBus;

  beforeEach(() => {
    bus = new AgentBus();
  });

  // ─── Namespaced Routing ─────────────────────────────────────────

  it('routes to namespaced subscriber (domain:name)', () => {
    const handler = vi.fn();
    bus.subscribe('resume:craftsman', handler);

    bus.send({
      from: 'producer',
      to: 'craftsman',
      domain: 'resume',
      type: 'request',
      payload: { instruction: 'revise summary' },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({
      from: 'producer',
      to: 'craftsman',
      domain: 'resume',
      type: 'request',
    });
  });

  it('routes cross-domain messages to correct namespace', () => {
    const resumeHandler = vi.fn();
    const salesHandler = vi.fn();
    bus.subscribe('resume:craftsman', resumeHandler);
    bus.subscribe('sales:craftsman', salesHandler);

    bus.send({
      from: 'producer',
      to: 'craftsman',
      domain: 'sales',
      type: 'request',
      payload: {},
    });

    expect(resumeHandler).not.toHaveBeenCalled();
    expect(salesHandler).toHaveBeenCalledTimes(1);
  });

  // ─── Backward Compatibility ─────────────────────────────────────

  it('falls back to name-only routing for backward compatibility', () => {
    const handler = vi.fn();
    bus.subscribe('craftsman', handler); // name-only subscription

    bus.send({
      from: 'producer',
      to: 'craftsman',
      domain: 'resume',
      type: 'request',
      payload: {},
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('prefers namespaced handler over name-only when both exist', () => {
    const nameHandler = vi.fn();
    const nsHandler = vi.fn();
    bus.subscribe('craftsman', nameHandler);
    bus.subscribe('resume:craftsman', nsHandler);

    bus.send({
      from: 'producer',
      to: 'craftsman',
      domain: 'resume',
      type: 'request',
      payload: {},
    });

    expect(nsHandler).toHaveBeenCalledTimes(1);
    expect(nameHandler).not.toHaveBeenCalled();
  });

  it('routes to name-only handler when no domain provided', () => {
    const handler = vi.fn();
    bus.subscribe('craftsman', handler);

    bus.send({
      from: 'producer',
      to: 'craftsman',
      domain: '', // empty domain
      type: 'request',
      payload: {},
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  // ─── Broadcast ──────────────────────────────────────────────────

  it('broadcasts to all agents in a domain', () => {
    const strategist = vi.fn();
    const craftsman = vi.fn();
    const producer = vi.fn();
    bus.subscribe('resume:strategist', strategist);
    bus.subscribe('resume:craftsman', craftsman);
    bus.subscribe('resume:producer', producer);

    const sent = bus.sendBroadcast('resume', {
      from: 'coordinator',
      domain: 'resume',
      type: 'notification',
      payload: { message: 'pipeline complete' },
    });

    expect(sent).toHaveLength(3);
    expect(strategist).toHaveBeenCalledTimes(1);
    expect(craftsman).toHaveBeenCalledTimes(1);
    expect(producer).toHaveBeenCalledTimes(1);
  });

  it('broadcast skips the sender', () => {
    const strategist = vi.fn();
    const craftsman = vi.fn();
    bus.subscribe('resume:strategist', strategist);
    bus.subscribe('resume:craftsman', craftsman);

    const sent = bus.sendBroadcast('resume', {
      from: 'strategist',
      domain: 'resume',
      type: 'notification',
      payload: {},
    });

    expect(sent).toHaveLength(1);
    expect(strategist).not.toHaveBeenCalled();
    expect(craftsman).toHaveBeenCalledTimes(1);
  });

  it('broadcast does not affect agents in other domains', () => {
    const resumeAgent = vi.fn();
    const salesAgent = vi.fn();
    bus.subscribe('resume:craftsman', resumeAgent);
    bus.subscribe('sales:writer', salesAgent);

    bus.sendBroadcast('resume', {
      from: 'coordinator',
      domain: 'resume',
      type: 'notification',
      payload: {},
    });

    expect(resumeAgent).toHaveBeenCalledTimes(1);
    expect(salesAgent).not.toHaveBeenCalled();
  });

  // ─── listSubscribers ───────────────────────────────────────────

  it('lists all subscribers when no domain filter', () => {
    bus.subscribe('resume:strategist', vi.fn());
    bus.subscribe('resume:craftsman', vi.fn());
    bus.subscribe('sales:writer', vi.fn());
    bus.subscribe('coordinator', vi.fn());

    const subs = bus.listSubscribers();
    expect(subs).toHaveLength(4);
    expect(subs).toContain('resume:strategist');
    expect(subs).toContain('resume:craftsman');
    expect(subs).toContain('sales:writer');
    expect(subs).toContain('coordinator');
  });

  it('filters subscribers by domain', () => {
    bus.subscribe('resume:strategist', vi.fn());
    bus.subscribe('resume:craftsman', vi.fn());
    bus.subscribe('sales:writer', vi.fn());

    const resumeSubs = bus.listSubscribers('resume');
    expect(resumeSubs).toHaveLength(2);
    expect(resumeSubs).toContain('resume:strategist');
    expect(resumeSubs).toContain('resume:craftsman');
  });

  it('returns empty array for unknown domain', () => {
    bus.subscribe('resume:strategist', vi.fn());
    expect(bus.listSubscribers('unknown')).toHaveLength(0);
  });

  // ─── Message Log ────────────────────────────────────────────────

  it('logs broadcast messages individually', () => {
    bus.subscribe('resume:strategist', vi.fn());
    bus.subscribe('resume:craftsman', vi.fn());

    bus.sendBroadcast('resume', {
      from: 'coordinator',
      domain: 'resume',
      type: 'notification',
      payload: {},
    });

    const log = bus.getLog();
    expect(log).toHaveLength(2);
    expect(log[0].to).toBe('strategist');
    expect(log[1].to).toBe('craftsman');
  });

  // ─── Existing behavior preserved ───────────────────────────────

  it('generates unique IDs and timestamps for each message', () => {
    bus.subscribe('resume:craftsman', vi.fn());

    const msg = bus.send({
      from: 'producer',
      to: 'craftsman',
      domain: 'resume',
      type: 'request',
      payload: {},
    });

    expect(msg.id).toBeDefined();
    expect(msg.timestamp).toBeDefined();
  });

  it('reset clears handlers and log', () => {
    bus.subscribe('resume:craftsman', vi.fn());
    bus.send({
      from: 'producer',
      to: 'craftsman',
      domain: 'resume',
      type: 'request',
      payload: {},
    });

    bus.reset();

    expect(bus.getLog()).toHaveLength(0);
    expect(bus.listSubscribers()).toHaveLength(0);
  });
});
