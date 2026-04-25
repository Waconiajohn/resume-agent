/**
 * Application Events Routes — /api/job-applications/:applicationId/events
 *
 * Phase 1 of the pursuit timeline. Append-only ledger of discrete moments
 * (applied / interview_happened / offer_received / interview_scheduled) per
 * application.
 *
 * Mounted as a sub-router under `jobApplicationsRoutes`. The parent route
 * already enforces authMiddleware + the FF_APPLICATION_PIPELINE feature
 * flag; this file just adds the two handlers and the Zod discriminated
 * union over event metadata.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';

// ─── Schemas ─────────────────────────────────────────────────────────────

const APPLIED_VIA_VALUES = ['manual', 'extension', 'imported'] as const;
const INTERVIEW_TYPE_VALUES = ['phone', 'video', 'onsite'] as const;
const EVENT_TYPE_VALUES = [
  'applied',
  'interview_happened',
  'offer_received',
  'interview_scheduled',
] as const;
type EventType = (typeof EVENT_TYPE_VALUES)[number];

/** Discriminated union over per-type event metadata. Server enforces shape. */
const appliedMetaSchema = z.object({
  type: z.literal('applied'),
  resume_session_id: z.string().uuid().optional(),
  cover_letter_session_id: z.string().uuid().optional(),
  applied_via: z.enum(APPLIED_VIA_VALUES),
});

const interviewHappenedMetaSchema = z.object({
  type: z.literal('interview_happened'),
  interview_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  interview_type: z.enum(INTERVIEW_TYPE_VALUES),
  interviewer_names: z.array(z.string().min(1).max(200)).max(20).optional(),
});

const offerReceivedMetaSchema = z.object({
  type: z.literal('offer_received'),
  amount: z.number().nonnegative().optional(),
  currency: z.string().min(1).max(10).optional(),
  offer_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  role_title: z.string().min(1).max(500).optional(),
});

const interviewScheduledMetaSchema = z.object({
  type: z.literal('interview_scheduled'),
  scheduled_date: z.string().datetime(),
  interview_type: z.enum(INTERVIEW_TYPE_VALUES),
  round: z.string().min(1).max(100).optional(),
  with_whom: z.array(z.string().min(1).max(200)).max(20).optional(),
});

const eventMetadataSchema = z.discriminatedUnion('type', [
  appliedMetaSchema,
  interviewHappenedMetaSchema,
  offerReceivedMetaSchema,
  interviewScheduledMetaSchema,
]);

const createEventSchema = z.object({
  type: z.enum(EVENT_TYPE_VALUES),
  occurred_at: z.string().datetime().optional(),
  metadata: eventMetadataSchema,
}).refine(
  (data) => data.type === data.metadata.type,
  { message: 'metadata.type must match top-level type', path: ['metadata', 'type'] },
);

// ─── Idempotency windows (per type) ──────────────────────────────────────

const IDEMPOTENCY_WINDOW_MS: Record<EventType, number> = {
  applied: 5 * 60 * 1000, // users will fumble this one
  interview_happened: 60 * 1000,
  offer_received: 60 * 1000,
  interview_scheduled: 60 * 1000,
};

// ─── DB row type ─────────────────────────────────────────────────────────

interface ApplicationEventRow {
  id: string;
  user_id: string;
  job_application_id: string;
  type: EventType;
  occurred_at: string;
  metadata: unknown;
  created_at: string;
}

// ─── Server-side recorder (also called from extension /apply-status) ─────

/**
 * Record an event idempotently. Used by the route handler AND by the
 * extension's /apply-status endpoint (which fires `applied` events
 * out-of-band). Returns the existing event row when within the
 * idempotency window for `(application, type)`, otherwise inserts.
 *
 * For `interview_scheduled`, the dedup key is
 * `(application, type, scheduled_date)` so multi-round interviews don't
 * collapse into one event. Other types dedup on `(application, type)`.
 *
 * Throws on DB error; callers should wrap in try/catch and decide whether
 * the parent operation should fail or log-and-continue.
 */
export async function recordApplicationEvent(input: {
  userId: string;
  jobApplicationId: string;
  type: EventType;
  occurredAt?: string; // ISO datetime
  metadata: z.infer<typeof eventMetadataSchema>;
}): Promise<{ event: ApplicationEventRow; deduplicated: boolean }> {
  const { userId, jobApplicationId, type, occurredAt, metadata } = input;

  // Idempotency check — same (application, type) within the window.
  // For interview_scheduled, additionally key on scheduled_date so reschedules
  // and multi-round interviews remain distinct events.
  const windowMs = IDEMPOTENCY_WINDOW_MS[type];
  const since = new Date(Date.now() - windowMs).toISOString();

  let recentQuery = supabaseAdmin
    .from('application_events')
    .select('*')
    .eq('user_id', userId)
    .eq('job_application_id', jobApplicationId)
    .eq('type', type)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1);

  if (type === 'interview_scheduled' && metadata.type === 'interview_scheduled') {
    recentQuery = recentQuery.eq('metadata->>scheduled_date', metadata.scheduled_date);
  }

  const { data: recent } = await recentQuery.maybeSingle();

  if (recent) {
    return { event: recent as ApplicationEventRow, deduplicated: true };
  }

  const { data: inserted, error } = await supabaseAdmin
    .from('application_events')
    .insert({
      user_id: userId,
      job_application_id: jobApplicationId,
      type,
      occurred_at: occurredAt ?? new Date().toISOString(),
      metadata,
    })
    .select('*')
    .single();

  if (error || !inserted) {
    throw new Error(error?.message ?? 'application_events insert returned no row');
  }
  return { event: inserted as ApplicationEventRow, deduplicated: false };
}

// ─── Sub-router ──────────────────────────────────────────────────────────

export const applicationEventsRoutes = new Hono();

// POST /:applicationId/events — record an event.
applicationEventsRoutes.post(
  '/:applicationId/events',
  rateLimitMiddleware(60, 60_000),
  async (c) => {
    const user = c.get('user');
    const applicationId = c.req.param('applicationId') ?? '';
    if (!z.string().uuid().safeParse(applicationId).success) {
      return c.json({ error: 'Invalid application id' }, 400);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = createEventSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        400,
      );
    }

    const { type, occurred_at, metadata } = parsed.data;

    // Forward-date guard for interview_happened — past or now only.
    if (type === 'interview_happened' && occurred_at) {
      if (Date.parse(occurred_at) > Date.now()) {
        return c.json(
          { error: 'interview_happened occurred_at cannot be in the future' },
          400,
        );
      }
    }

    // Verify ownership of the application.
    const { data: app, error: appError } = await supabaseAdmin
      .from('job_applications')
      .select('id')
      .eq('id', applicationId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (appError) {
      logger.error(
        { error: appError.message, userId: user.id, applicationId },
        'application-events: ownership check failed',
      );
      return c.json({ error: 'Failed to verify application' }, 500);
    }
    if (!app) return c.json({ error: 'Application not found' }, 404);

    try {
      const { event, deduplicated } = await recordApplicationEvent({
        userId: user.id,
        jobApplicationId: applicationId,
        type,
        occurredAt: occurred_at,
        metadata,
      });
      return c.json({ event, deduplicated }, deduplicated ? 200 : 201);
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), userId: user.id, applicationId, type },
        'application-events: insert failed',
      );
      return c.json({ error: 'Failed to record event' }, 500);
    }
  },
);

// GET /:applicationId/events — list events for an application, newest first.
applicationEventsRoutes.get(
  '/:applicationId/events',
  rateLimitMiddleware(120, 60_000),
  async (c) => {
    const user = c.get('user');
    const applicationId = c.req.param('applicationId') ?? '';
    if (!z.string().uuid().safeParse(applicationId).success) {
      return c.json({ error: 'Invalid application id' }, 400);
    }

    const { data, error } = await supabaseAdmin
      .from('application_events')
      .select('*')
      .eq('user_id', user.id)
      .eq('job_application_id', applicationId)
      .order('occurred_at', { ascending: false });

    if (error) {
      logger.error(
        { error: error.message, userId: user.id, applicationId },
        'application-events: list failed',
      );
      return c.json({ error: 'Failed to list events' }, 500);
    }

    return c.json({ events: data ?? [], count: data?.length ?? 0 });
  },
);
