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
      trackProductEvent('route_viewed', {
        view: `workspace-${index}`,
        room: null,
      });
    }

    const events = readProductTelemetryEvents();
    expect(events).toHaveLength(200);
    expect(events[0]).toMatchObject({
      name: 'route_viewed',
      payload: { view: 'workspace-5' },
    });
    expect(events.at(-1)).toMatchObject({
      name: 'route_viewed',
      payload: { view: 'workspace-204' },
    });
  });

  it('stores the new job-search funnel events', () => {
    trackProductEvent('job_shortlist_opened', {
      entry_point: 'overview_cta',
      shortlist_count: 3,
    });

    const events = readProductTelemetryEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      name: 'job_shortlist_opened',
      payload: {
        entry_point: 'overview_cta',
        shortlist_count: 3,
      },
    });
  });
});
