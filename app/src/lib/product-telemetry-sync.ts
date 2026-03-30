import { API_BASE } from '@/lib/api';
import {
  PRODUCT_TELEMETRY_SCHEMA_VERSION,
  readProductTelemetryEvents,
  removeProductTelemetryEvents,
} from '@/lib/product-telemetry';

const MAX_BATCH_SIZE = 50;

export async function flushProductTelemetryEvents(
  accessToken: string,
): Promise<{ flushed: number; remaining: number }> {
  const pendingEvents = readProductTelemetryEvents();
  if (!accessToken || pendingEvents.length === 0) {
    return {
      flushed: 0,
      remaining: pendingEvents.length,
    };
  }

  const batch = pendingEvents.slice(0, MAX_BATCH_SIZE);
  const response = await fetch(`${API_BASE}/product-telemetry/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      schema_version: PRODUCT_TELEMETRY_SCHEMA_VERSION,
      events: batch,
    }),
    keepalive: true,
  });

  if (!response.ok) {
    throw new Error(`Telemetry flush failed (${response.status})`);
  }

  removeProductTelemetryEvents(batch.map((event) => event.id));

  return {
    flushed: batch.length,
    remaining: Math.max(0, pendingEvents.length - batch.length),
  };
}
