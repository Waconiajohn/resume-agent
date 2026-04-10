/**
 * B2B Admin Routes — /api/b2b/*
 *
 * Story 7-2: Organization, contract, seat, and cohort management endpoints.
 * Story 7-3: Reporting Dashboard API (aggregate metrics only — no personal content).
 * Story 7-4: User-facing branding endpoint used by the frontend `useB2BBranding` hook.
 *
 * Endpoints:
 *   POST   /orgs                           — Create organization
 *   GET    /orgs/:orgId                    — Get organization by ID
 *   GET    /orgs/slug/:slug                — Get organization by slug
 *   PATCH  /orgs/:orgId                    — Update org branding/settings
 *   POST   /orgs/:orgId/contracts          — Create contract
 *   GET    /orgs/:orgId/contracts/active   — Get active contract
 *   POST   /orgs/:orgId/seats              — Provision seats
 *   GET    /orgs/:orgId/seats              — List seats (optional status filter)
 *   POST   /seats/:seatId/activate         — Activate a seat
 *   POST   /orgs/:orgId/cohorts            — Create cohort
 *   GET    /orgs/:orgId/cohorts            — List cohorts
 *   GET    /orgs/:orgId/metrics            — Aggregate engagement metrics
 *   GET    /orgs/:orgId/report             — Full reporting dashboard
 *   GET    /user/branding                  — Org branding for authenticated user
 *
 * Feature-flagged via FF_B2B_OUTPLACEMENT.
 * Mounted at /api/b2b by server/src/index.ts.
 *
 * Privacy boundary: admins see engagement metrics and seat status only.
 * No personal resume content, session transcripts, or AI output is ever returned.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { FF_B2B_OUTPLACEMENT } from '../lib/feature-flags.js';
import {
  createOrganization,
  getOrganization,
  getOrganizationBySlug,
  updateOrganization,
  createContract,
  getActiveContract,
  provisionSeats,
  getOrgSeats,
  activateSeat,
  createCohort,
  getOrgCohorts,
  getOrgEngagementMetrics,
} from '../lib/b2b.js';
import type { SeatStatus, ContractTier, B2BOrganization } from '../lib/b2b.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrgResource {
  title: string;
  url: string;
  description: string;
}

interface OrgRow {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  custom_welcome_message: string | null;
  custom_resources: OrgResource[] | null;
  is_active: boolean;
}

interface SeatRow {
  org_id: string;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CONTRACT_TIERS = ['standard', 'plus', 'concierge'] as const satisfies readonly ContractTier[];
const SEAT_STATUSES = ['provisioned', 'active', 'completed', 'expired'] as const satisfies readonly SeatStatus[];
const RESERVED_SLUGS = new Set(['admin', 'api', 'www', 'app', 'b2b']);

const createOrgSchema = z.object({
  name: z.string().min(1).max(500),
  slug: z.string().min(1).max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only')
    .refine((s) => !RESERVED_SLUGS.has(s), 'This slug is reserved'),
  admin_email: z.string().email().max(500),
  admin_name: z.string().min(1).max(500),
  logo_url: z.string().url().max(2000).refine((url) => url.startsWith('https://'), 'Must be HTTPS').optional(),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color').optional(),
  secondary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color').optional(),
  custom_welcome_message: z.string().max(5000).transform((s) => s.replace(/<[^>]*>/g, '')).optional(),
});

const updateOrgSchema = z.object({
  // logo_url and custom_welcome_message are nullable in the DB; primary/secondary colors are not.
  logo_url: z.string().url().max(2000).nullable().optional().refine((url) => url === null || url === undefined || url.startsWith('https://'), 'Must be HTTPS'),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color').optional(),
  secondary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color').optional(),
  custom_welcome_message: z.string().max(5000).nullable().optional().transform((s) => s ? s.replace(/<[^>]*>/g, '') : s),
  custom_resources: z.array(z.object({
    title: z.string().min(1).max(200),
    url: z.string().url().max(2000),
    description: z.string().max(500),
  })).max(20).optional(),
  is_active: z.boolean().optional(),
});

const createContractSchema = z.object({
  tier: z.enum(CONTRACT_TIERS),
  price_per_seat_cents: z.number().int().min(0).max(10_000_000),
  total_seats: z.number().int().min(1).max(50_000),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  sla_response_hours: z.number().int().min(1).max(168).optional(),
  includes_human_coach: z.boolean().optional(),
});

const seatItemSchema = z.object({
  email: z.string().email().max(500),
  name: z.string().max(500).optional(),
  cohort_id: z.string().uuid().optional(),
});

const provisionSeatsSchema = z.object({
  contract_id: z.string().uuid(),
  seats: z.array(seatItemSchema).min(1).max(500),
});

const seatStatusQuerySchema = z.object({
  status: z.enum(SEAT_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const activateSeatBodySchema = z.object({
  user_id: z.string().uuid(),
});

const createCohortSchema = z.object({
  name: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
});

// ─── Org admin authorization helper ──────────────────────────────────────────

/**
 * Verifies the authenticated user is the org admin. Returns the org on success.
 * Throws an HTTP response (403/404) on failure — callers should use early return.
 */
async function requireOrgAdmin(
  c: { get: (key: string) => Record<string, unknown>; json: (data: unknown, status: number) => Response },
  orgId: string,
): Promise<{ org: B2BOrganization } | Response> {
  const org = await getOrganization(orgId);
  if (!org) {
    return c.json({ error: 'Organization not found' }, 404);
  }
  const user = c.get('user') as { id: string; email: string };
  if (org.admin_email !== user.email) {
    return c.json({ error: 'Forbidden: not the organization admin' }, 403);
  }
  return { org };
}

// Type guard for requireOrgAdmin result
function isOrgResult(result: { org: B2BOrganization } | Response): result is { org: B2BOrganization } {
  return 'org' in result;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const b2bAdminRoutes = new Hono();

// Auth required for all routes
b2bAdminRoutes.use('*', authMiddleware);

// Feature flag guard — return 403 so callers can distinguish "off" from "not found"
b2bAdminRoutes.use('*', async (c, next) => {
  if (!FF_B2B_OUTPLACEMENT) {
    return c.json({ error: 'Feature not enabled' }, 403);
  }
  await next();
});

// ─── Organization Management (Story 7-2) ─────────────────────────────────────

// POST /orgs — Create organization
b2bAdminRoutes.post(
  '/orgs',
  rateLimitMiddleware(10, 60_000),
  async (c) => {
    const body = await c.req.json().catch(() => null);

    const parsed = createOrgSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, 400);
    }

    try {
      const org = await createOrganization(parsed.data);
      if (!org) {
        return c.json({ error: 'Failed to create organization. The slug may already be taken.' }, 409);
      }
      return c.json({ organization: org }, 201);
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        'POST /api/b2b/orgs: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// GET /orgs/:orgId — Get organization by ID
b2bAdminRoutes.get(
  '/orgs/:orgId',
  rateLimitMiddleware(60, 60_000),
  async (c) => {
    const orgId = c.req.param('orgId') ?? '';

    try {
      const authResult = await requireOrgAdmin(c, orgId);
      if (!isOrgResult(authResult)) return authResult;

      return c.json({ organization: authResult.org });
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), orgId },
        'GET /api/b2b/orgs/:orgId: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// GET /orgs/slug/:slug — Get organization by slug
b2bAdminRoutes.get(
  '/orgs/slug/:slug',
  rateLimitMiddleware(60, 60_000),
  async (c) => {
    const slug = c.req.param('slug') ?? '';

    try {
      const org = await getOrganizationBySlug(slug);
      if (!org) {
        return c.json({ error: 'Organization not found' }, 404);
      }
      return c.json({ organization: org });
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), slug },
        'GET /api/b2b/orgs/slug/:slug: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// PATCH /orgs/:orgId — Update organization branding and settings
b2bAdminRoutes.patch(
  '/orgs/:orgId',
  rateLimitMiddleware(20, 60_000),
  async (c) => {
    const orgId = c.req.param('orgId') ?? '';
    const body = await c.req.json().catch(() => null);

    const parsed = updateOrgSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, 400);
    }

    if (Object.keys(parsed.data).length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    try {
      const authResult = await requireOrgAdmin(c, orgId);
      if (!isOrgResult(authResult)) return authResult;

      const org = await updateOrganization(orgId, parsed.data);
      if (!org) {
        return c.json({ error: 'Failed to update organization' }, 500);
      }
      return c.json({ organization: org });
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), orgId },
        'PATCH /api/b2b/orgs/:orgId: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── Contract Management (Story 7-2) ─────────────────────────────────────────

// POST /orgs/:orgId/contracts — Create contract
b2bAdminRoutes.post(
  '/orgs/:orgId/contracts',
  rateLimitMiddleware(10, 60_000),
  async (c) => {
    const orgId = c.req.param('orgId') ?? '';
    const body = await c.req.json().catch(() => null);

    const parsed = createContractSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, 400);
    }

    try {
      const authResult = await requireOrgAdmin(c, orgId);
      if (!isOrgResult(authResult)) return authResult;

      const contract = await createContract({
        org_id: orgId,
        tier: parsed.data.tier,
        price_per_seat_cents: parsed.data.price_per_seat_cents,
        total_seats: parsed.data.total_seats,
        start_date: parsed.data.start_date,
        end_date: parsed.data.end_date,
        sla_response_hours: parsed.data.sla_response_hours,
        includes_human_coach: parsed.data.includes_human_coach,
      });

      if (!contract) {
        return c.json({ error: 'Failed to create contract' }, 500);
      }
      return c.json({ contract }, 201);
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), orgId },
        'POST /api/b2b/orgs/:orgId/contracts: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// GET /orgs/:orgId/contracts/active — Get active contract
b2bAdminRoutes.get(
  '/orgs/:orgId/contracts/active',
  rateLimitMiddleware(60, 60_000),
  async (c) => {
    const orgId = c.req.param('orgId') ?? '';

    try {
      const authResult = await requireOrgAdmin(c, orgId);
      if (!isOrgResult(authResult)) return authResult;

      const contract = await getActiveContract(orgId);
      if (!contract) {
        return c.json({ error: 'No active contract found' }, 404);
      }
      return c.json({ contract });
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), orgId },
        'GET /api/b2b/orgs/:orgId/contracts/active: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── Seat Management (Story 7-2) ──────────────────────────────────────────────

// POST /orgs/:orgId/seats — Provision seats (requires an active contract_id in body)
b2bAdminRoutes.post(
  '/orgs/:orgId/seats',
  rateLimitMiddleware(10, 60_000),
  async (c) => {
    const orgId = c.req.param('orgId') ?? '';
    const body = await c.req.json().catch(() => null);

    const parsed = provisionSeatsSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, 400);
    }

    try {
      const authResult = await requireOrgAdmin(c, orgId);
      if (!isOrgResult(authResult)) return authResult;

      const result = await provisionSeats(orgId, parsed.data.contract_id, parsed.data.seats);
      if ('error' in result) {
        const statusCode = result.status as 400 | 403 | 404;
        return c.json({ error: result.error }, statusCode);
      }
      return c.json({ provisioned: result.provisioned, errors: result.errors }, 201);
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), orgId },
        'POST /api/b2b/orgs/:orgId/seats: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// GET /orgs/:orgId/seats — List seats (optional ?status= filter)
b2bAdminRoutes.get(
  '/orgs/:orgId/seats',
  rateLimitMiddleware(60, 60_000),
  async (c) => {
    const orgId = c.req.param('orgId') ?? '';

    const queryParsed = seatStatusQuerySchema.safeParse({
      status: c.req.query('status'),
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
    });
    if (!queryParsed.success) {
      return c.json({ error: 'Invalid query parameters', details: queryParsed.error.flatten().fieldErrors }, 400);
    }

    try {
      const authResult = await requireOrgAdmin(c, orgId);
      if (!isOrgResult(authResult)) return authResult;

      const { limit, offset } = queryParsed.data;
      const seats = await getOrgSeats(orgId, queryParsed.data.status, limit, offset);
      return c.json({ seats, count: seats.length, limit, offset });
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), orgId },
        'GET /api/b2b/orgs/:orgId/seats: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// POST /seats/:seatId/activate — Activate a seat (link to a platform user_id)
b2bAdminRoutes.post(
  '/seats/:seatId/activate',
  rateLimitMiddleware(30, 60_000),
  async (c) => {
    const seatId = c.req.param('seatId') ?? '';
    const body = await c.req.json().catch(() => null);

    const parsed = activateSeatBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, 400);
    }

    try {
      // Look up the seat's org_id and verify the caller is an admin of that org
      const { data: seatRow, error: seatLookupError } = await supabaseAdmin
        .from('b2b_seats')
        .select('org_id')
        .eq('id', seatId)
        .maybeSingle() as { data: SeatRow | null; error: unknown };

      if (seatLookupError || !seatRow) {
        return c.json({ error: 'Seat not found' }, 404);
      }

      const authResult = await requireOrgAdmin(c, seatRow.org_id);
      if (!isOrgResult(authResult)) return authResult;

      const result = await activateSeat(seatId, parsed.data.user_id);
      if (result === 'not_found') {
        return c.json({ error: 'Seat not found' }, 404);
      }
      if (result === 'wrong_status') {
        return c.json({ error: 'Seat cannot be activated. Only provisioned seats can be activated.' }, 409);
      }
      return c.json({ success: true, seat_id: seatId, user_id: parsed.data.user_id });
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), seatId },
        'POST /api/b2b/seats/:seatId/activate: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── Cohort Management (Story 7-2) ────────────────────────────────────────────

// POST /orgs/:orgId/cohorts — Create cohort
b2bAdminRoutes.post(
  '/orgs/:orgId/cohorts',
  rateLimitMiddleware(20, 60_000),
  async (c) => {
    const orgId = c.req.param('orgId') ?? '';
    const body = await c.req.json().catch(() => null);

    const parsed = createCohortSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, 400);
    }

    try {
      const authResult = await requireOrgAdmin(c, orgId);
      if (!isOrgResult(authResult)) return authResult;

      const cohort = await createCohort({
        org_id: orgId,
        name: parsed.data.name,
        description: parsed.data.description,
      });

      if (!cohort) {
        return c.json({ error: 'Failed to create cohort' }, 500);
      }
      return c.json({ cohort }, 201);
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), orgId },
        'POST /api/b2b/orgs/:orgId/cohorts: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// GET /orgs/:orgId/cohorts — List cohorts
b2bAdminRoutes.get(
  '/orgs/:orgId/cohorts',
  rateLimitMiddleware(60, 60_000),
  async (c) => {
    const orgId = c.req.param('orgId') ?? '';

    try {
      const authResult = await requireOrgAdmin(c, orgId);
      if (!isOrgResult(authResult)) return authResult;

      const cohorts = await getOrgCohorts(orgId);
      return c.json({ cohorts, count: cohorts.length });
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), orgId },
        'GET /api/b2b/orgs/:orgId/cohorts: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── Reporting Dashboard (Story 7-3) ──────────────────────────────────────────

// GET /orgs/:orgId/metrics — Aggregate engagement metrics (no personal content)
b2bAdminRoutes.get(
  '/orgs/:orgId/metrics',
  rateLimitMiddleware(30, 60_000),
  async (c) => {
    const orgId = c.req.param('orgId') ?? '';

    try {
      const authResult = await requireOrgAdmin(c, orgId);
      if (!isOrgResult(authResult)) return authResult;

      const metrics = await getOrgEngagementMetrics(orgId);
      return c.json({ metrics });
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), orgId },
        'GET /api/b2b/orgs/:orgId/metrics: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// GET /orgs/:orgId/report — Full reporting dashboard (aggregate only — no personal content)
b2bAdminRoutes.get(
  '/orgs/:orgId/report',
  rateLimitMiddleware(20, 60_000),
  async (c) => {
    const orgId = c.req.param('orgId') ?? '';

    try {
      const authResult = await requireOrgAdmin(c, orgId);
      if (!isOrgResult(authResult)) return authResult;

      const [contract, metrics, cohorts, allSeats] = await Promise.all([
        getActiveContract(orgId),
        getOrgEngagementMetrics(orgId),
        getOrgCohorts(orgId),
        getOrgSeats(orgId),
      ]);

      const org = authResult.org;

      // Aggregate seat counts by status — individual seat details are never returned
      const seatsByStatus = allSeats.reduce<Record<string, number>>((acc, seat) => {
        acc[seat.status] = (acc[seat.status] ?? 0) + 1;
        return acc;
      }, {});

      const report = {
        organization: org,
        contract,
        engagement: metrics,
        cohorts,
        seat_summary: {
          total: allSeats.length,
          by_status: seatsByStatus,
        },
      };

      return c.json({ report });
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), orgId },
        'GET /api/b2b/orgs/:orgId/report: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── User Branding (Story 7-4) ────────────────────────────────────────────────

// GET /user/branding ───────────────────────────────────────────────────────────

/**
 * Returns branding data for the authenticated user's organization.
 *
 * Flow:
 *   1. Look up an active seat for this user in `b2b_seats`
 *   2. If no seat found → return { branding: null }
 *   3. Load the org from `b2b_organizations`
 *   4. If org not found or not active → return { branding: null }
 *   5. Return filtered branding fields (no contract/billing data)
 */
b2bAdminRoutes.get('/user/branding', async (c) => {
  const user = c.get('user');

  try {
    // Step 1: find active seat for this user
    const { data: seat, error: seatError } = await supabaseAdmin
      .from('b2b_seats')
      .select('org_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle() as { data: SeatRow | null; error: unknown };

    if (seatError) {
      logger.warn({ error: seatError, userId: user.id }, 'b2b/user/branding: seat lookup error');
      return c.json({ branding: null });
    }

    if (!seat) {
      return c.json({ branding: null });
    }

    // Step 2: load the org
    const { data: org, error: orgError } = await supabaseAdmin
      .from('b2b_organizations')
      .select(
        'id, name, logo_url, primary_color, secondary_color, custom_welcome_message, custom_resources, is_active',
      )
      .eq('id', seat.org_id)
      .maybeSingle() as { data: OrgRow | null; error: unknown };

    if (orgError) {
      logger.warn({ error: orgError, orgId: seat.org_id }, 'b2b/user/branding: org lookup error');
      return c.json({ branding: null });
    }

    if (!org || !org.is_active) {
      return c.json({ branding: null });
    }

    return c.json({
      branding: {
        org_id: org.id,
        org_name: org.name,
        logo_url: org.logo_url,
        primary_color: org.primary_color,
        secondary_color: org.secondary_color,
        custom_welcome_message: org.custom_welcome_message,
        custom_resources: org.custom_resources ?? [],
      },
    });
  } catch (err) {
    logger.error({ err, userId: user.id }, 'b2b/user/branding: unexpected error');
    return c.json({ branding: null });
  }
});
