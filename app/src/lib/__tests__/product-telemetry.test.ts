// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearProductTelemetryEvents,
  readProductTelemetryEvents,
  trackProductEvent,
} from '../product-telemetry';

describe('product-telemetry', () => {
  beforeEach(() => {
    clearProductTelemetryEvents();
    window.history.replaceState({}, '', '/workspace?room=resume');
  });

  it('stores events with route context', () => {
    trackProductEvent('resume_builder_opened', { surface: 'workspace' });

    const events = readProductTelemetryEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      name: 'resume_builder_opened',
      path: '/workspace?room=resume',
      payload: { surface: 'workspace' },
    });
  });

  it('keeps only the newest events when the buffer grows', () => {
    for (let index = 0; index < 205; index += 1) {
      trackProductEvent('route_viewed', { index });
    }

    const events = readProductTelemetryEvents();
    expect(events).toHaveLength(200);
    expect(events[0].payload.index).toBe(5);
    expect(events.at(-1)?.payload.index).toBe(204);
  });
});
