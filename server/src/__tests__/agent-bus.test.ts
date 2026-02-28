import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentBus } from '../agents/runtime/agent-bus.js';
import type { AgentMessage } from '../agents/runtime/agent-protocol.js';

function makeMessage(
  overrides?: Partial<Omit<AgentMessage, 'id' | 'timestamp'>>,
): Omit<AgentMessage, 'id' | 'timestamp'> {
  return {
    from: 'strategist',
    to: 'craftsman',
    type: 'handoff',
    domain: 'resume',
    payload: { key: 'value' },
    ...overrides,
  };
}

describe('AgentBus', () => {
  let bus: AgentBus;

  beforeEach(() => {
    bus = new AgentBus();
  });

  it('routes a message to a subscribed handler', () => {
    const handler = vi.fn();
    bus.subscribe('craftsman', handler);

    bus.send(makeMessage({ to: 'craftsman' }));

    expect(handler).toHaveBeenCalledOnce();
    const received = handler.mock.calls[0][0] as AgentMessage;
    expect(received.from).toBe('strategist');
    expect(received.to).toBe('craftsman');
    expect(received.type).toBe('handoff');
    expect(received.domain).toBe('resume');
    expect(received.id).toBeDefined();
    expect(received.timestamp).toBeDefined();
  });

  it('does not call handler after unsubscribe', () => {
    const handler = vi.fn();
    bus.subscribe('craftsman', handler);
    bus.unsubscribe('craftsman');

    bus.send(makeMessage({ to: 'craftsman' }));

    expect(handler).not.toHaveBeenCalled();
  });

  it('does not throw when sending to an agent with no registered handler', () => {
    // No handler registered for 'producer'
    expect(() => {
      bus.send(makeMessage({ to: 'producer' }));
    }).not.toThrow();
  });

  it('getLog returns all sent messages', () => {
    bus.send(makeMessage({ from: 'strategist', to: 'craftsman' }));
    bus.send(makeMessage({ from: 'craftsman', to: 'producer' }));
    bus.send(makeMessage({ from: 'producer', to: 'craftsman', type: 'request' }));

    const log = bus.getLog();

    expect(log).toHaveLength(3);
    expect(log[0].from).toBe('strategist');
    expect(log[1].from).toBe('craftsman');
    expect(log[2].from).toBe('producer');
  });

  it('caps message log at 500 entries after 600 sends', () => {
    // Send 600 messages, triggering the > 500 cap
    for (let i = 0; i < 600; i++) {
      bus.send(makeMessage({ payload: { index: i } }));
    }

    const log = bus.getLog();

    // The cap slices to last 250 when length exceeds 500
    expect(log.length).toBeLessThanOrEqual(500);
    // All retained entries should have indices from the tail of the send sequence
    // (the last 250 sends have indices 350-599)
    const lastEntry = log[log.length - 1];
    expect((lastEntry.payload as { index: number }).index).toBe(599);
  });

  it('reset clears all handlers and the message log', () => {
    const handler = vi.fn();
    bus.subscribe('craftsman', handler);
    bus.send(makeMessage({ to: 'craftsman' }));
    expect(bus.getLog()).toHaveLength(1);

    bus.reset();

    // Log is empty
    expect(bus.getLog()).toHaveLength(0);

    // Handler is gone — sending again should not invoke it
    bus.send(makeMessage({ to: 'craftsman' }));
    expect(handler).toHaveBeenCalledOnce(); // only the pre-reset call
    expect(bus.getLog()).toHaveLength(1); // post-reset message logged but handler not called
  });

  it('send returns the completed AgentMessage with generated id and timestamp', () => {
    const partial = makeMessage({ from: 'strategist', to: 'craftsman' });
    const result = bus.send(partial);

    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(result.timestamp).toBeTruthy();
    expect(new Date(result.timestamp).getTime()).toBeGreaterThan(0);
  });

  it('isolates handlers — only the addressed agent receives the message', () => {
    const craftsmanHandler = vi.fn();
    const producerHandler = vi.fn();

    bus.subscribe('craftsman', craftsmanHandler);
    bus.subscribe('producer', producerHandler);

    bus.send(makeMessage({ to: 'craftsman' }));

    expect(craftsmanHandler).toHaveBeenCalledOnce();
    expect(producerHandler).not.toHaveBeenCalled();
  });
});
