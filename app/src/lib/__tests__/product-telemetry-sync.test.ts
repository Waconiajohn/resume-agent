// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushProductTelemetryEvents } from '../product-telemetry-sync';
import { clearProductTelemetryEvents, readProductTelemetryEvents, trackProductEvent } from '../product-telemetry';

describe('product-telemetry-sync', () => {
  beforeEach(() => {
    clearProductTelemetryEvents();
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    window.history.replaceState({}, '', '/workspace?room=jobs');
  });

  it('flushes pending events and removes only the flushed batch', async () => {
    trackProductEvent('job_board_search_run', {
      query: 'VP Marketing',
      location: 'Chicago',
      date_posted: 'any',
      remote_type: 'any',
      source: 'manual',
    });
    trackProductEvent('job_shortlist_opened', {
      entry_point: 'overview_cta',
      shortlist_count: 2,
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ accepted: 2, schema_version: 1 }), { status: 200 }),
    );

    const result = await flushProductTelemetryEvents('token-123');

    expect(result).toEqual({ flushed: 2, remaining: 0 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(readProductTelemetryEvents()).toHaveLength(0);
  });

  it('keeps events in storage when ingestion fails', async () => {
    trackProductEvent('smart_referrals_path_selected', {
      path: 'network',
      source: 'user',
      has_connections: true,
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('server error', { status: 500 }),
    );

    await expect(flushProductTelemetryEvents('token-123')).rejects.toThrow(
      'Telemetry flush failed (500)',
    );
    expect(readProductTelemetryEvents()).toHaveLength(1);
  });
});
