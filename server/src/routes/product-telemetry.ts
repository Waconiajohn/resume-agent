import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';

const eventSchema = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  timestamp: z.string().datetime(),
  path: z.string().trim().min(1).max(2000),
  payload: z.record(z.string(), z.unknown()),
});

const ingestSchema = z.object({
  schema_version: z.literal(1).default(1),
  events: z.array(eventSchema).min(1).max(100),
});

export const productTelemetryRoutes = new Hono();

productTelemetryRoutes.use('*', authMiddleware);

productTelemetryRoutes.post(
  '/ingest',
  rateLimitMiddleware(60, 60_000),
  async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => null);
    const parsed = ingestSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid telemetry payload', details: parsed.error.flatten() }, 400);
    }

    const rows = parsed.data.events.map((event) => ({
      user_id: user.id,
      client_event_id: event.id,
      schema_version: parsed.data.schema_version,
      event_name: event.name,
      occurred_at: event.timestamp,
      path: event.path,
      payload: event.payload,
    }));

    const { error } = await supabaseAdmin
      .from('product_telemetry_events')
      .upsert(rows, {
        onConflict: 'user_id,client_event_id',
        ignoreDuplicates: true,
      });

    if (error) {
      logger.error({ err: error, userId: user.id, eventCount: rows.length }, 'product telemetry ingest failed');
      return c.json({ error: 'Failed to ingest telemetry events' }, 500);
    }

    return c.json({
      accepted: rows.length,
      schema_version: parsed.data.schema_version,
    });
  },
);
