/**
 * Networking CRM Routes — /api/networking-contacts/*
 *
 * Plain CRUD routes (not an agent pipeline) for managing networking contacts
 * and interaction touchpoints. Feature-flagged via FF_NETWORKING_CRM.
 *
 * Mounted at /api/networking-contacts by server/src/index.ts.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { FF_NETWORKING_CRM, FF_NETWORKING_OUTREACH } from '../lib/feature-flags.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { processNewTouchpoint, getContactWithHistory } from '../lib/networking-crm-service.js';
import logger from '../lib/logger.js';
import { loadAgentContextBundle } from '../lib/career-profile-context.js';
import { applySharedContextOverride } from '../contracts/shared-context-adapter.js';

export const networkingContacts = new Hono();

// Auth required for all routes
networkingContacts.use('*', authMiddleware);

// Feature flag guard
networkingContacts.use('*', async (c, next) => {
  if (!FF_NETWORKING_CRM) {
    return c.json({ data: null, feature_disabled: true }, 200);
  }
  await next();
});

// ─── Schemas ──────────────────────────────────────────────────────────────────

const RELATIONSHIP_TYPES = ['recruiter', 'hiring_manager', 'peer', 'referral', 'mentor', 'other'] as const;
const TOUCHPOINT_TYPES = ['call', 'email', 'inmail', 'meeting', 'event', 'other'] as const;
const SORT_FIELDS = ['name', 'company', 'last_contact_date', 'next_followup_at'] as const;

const CONTACT_ROLES = ['hiring_manager', 'team_leader', 'peer', 'hr_recruiter'] as const;

const createContactSchema = z.object({
  name: z.string().min(1).max(300),
  title: z.string().max(300).optional(),
  company: z.string().max(300).optional(),
  email: z.string().email().max(300).optional(),
  linkedin_url: z.string().url().max(500).optional(),
  phone: z.string().max(50).optional(),
  relationship_type: z.enum(RELATIONSHIP_TYPES).optional(),
  relationship_strength: z.number().int().min(1).max(5).optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
  notes: z.string().max(5000).optional(),
  next_followup_at: z.string().datetime().optional(),
  application_id: z.string().uuid().optional(),
  contact_role: z.enum(CONTACT_ROLES).optional(),
});

const updateContactSchema = createContactSchema.partial();

const listContactsQuerySchema = z.object({
  relationship_type: z.enum(RELATIONSHIP_TYPES).optional(),
  search: z.string().max(200).optional(),
  sort_by: z.enum(SORT_FIELDS).optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const createTouchpointSchema = z.object({
  type: z.enum(TOUCHPOINT_TYPES),
  notes: z.string().max(5000).optional(),
});

const followUpQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).optional(),
});

// ─── POST /contacts — Create a contact ───────────────────────────────────────

networkingContacts.post(
  '/contacts',
  rateLimitMiddleware(30, 60_000),
  async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => null);

    const parsed = createContactSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.issues }, 400);
    }

    const data = parsed.data;

    try {
      const { data: contact, error } = await supabaseAdmin
        .from('networking_contacts')
        .insert({
          user_id: user.id,
          name: data.name,
          title: data.title ?? null,
          company: data.company ?? null,
          email: data.email ?? null,
          linkedin_url: data.linkedin_url ?? null,
          phone: data.phone ?? null,
          relationship_type: data.relationship_type ?? 'other',
          relationship_strength: data.relationship_strength ?? 1,
          tags: data.tags ?? [],
          notes: data.notes ?? null,
          next_followup_at: data.next_followup_at ?? null,
          application_id: data.application_id ?? null,
          contact_role: data.contact_role ?? null,
        })
        .select('*')
        .single();

      if (error) {
        logger.error({ error: error.message, userId: user.id }, 'POST /contacts: insert failed');
        return c.json({ error: 'Failed to create contact' }, 500);
      }

      return c.json({ contact }, 201);
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), userId: user.id },
        'POST /contacts: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── GET /contacts — List contacts ───────────────────────────────────────────

networkingContacts.get(
  '/contacts',
  rateLimitMiddleware(60, 60_000),
  async (c) => {
    const user = c.get('user');

    const queryParsed = listContactsQuerySchema.safeParse({
      relationship_type: c.req.query('relationship_type'),
      search: c.req.query('search'),
      sort_by: c.req.query('sort_by'),
      sort_order: c.req.query('sort_order'),
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
    });

    if (!queryParsed.success) {
      return c.json({ error: 'Invalid query parameters', details: queryParsed.error.issues }, 400);
    }

    const {
      relationship_type,
      search,
      sort_by = 'name',
      sort_order = 'asc',
      limit = 50,
      offset = 0,
    } = queryParsed.data;

    try {
      let query = supabaseAdmin
        .from('networking_contacts')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order(sort_by, { ascending: sort_order === 'asc' })
        .range(offset, offset + limit - 1);

      if (relationship_type) {
        query = query.eq('relationship_type', relationship_type);
      }

      if (search) {
        // Escape PostgREST ILIKE special characters to prevent filter injection
        const safe = search.replace(/[%_\\]/g, (ch) => `\\${ch}`);
        query = query.or(
          `name.ilike.%${safe}%,company.ilike.%${safe}%,title.ilike.%${safe}%`,
        );
      }

      const { data: contacts, error, count } = await query;

      if (error) {
        logger.error({ error: error.message, userId: user.id }, 'GET /contacts: query failed');
        return c.json({ error: 'Failed to fetch contacts' }, 500);
      }

      return c.json({ contacts: contacts ?? [], count: count ?? 0 });
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), userId: user.id },
        'GET /contacts: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── GET /contacts/:id — Get a single contact with touchpoints ────────────────

networkingContacts.get(
  '/contacts/:id',
  rateLimitMiddleware(60, 60_000),
  async (c) => {
    const user = c.get('user');
    const contactId = c.req.param('id') ?? '';

    try {
      const { data: contact, error: contactError } = await supabaseAdmin
        .from('networking_contacts')
        .select('*')
        .eq('id', contactId)
        .eq('user_id', user.id)
        .single();

      if (contactError || !contact) {
        return c.json({ error: 'Contact not found' }, 404);
      }

      const { data: touchpoints, error: touchpointError } = await supabaseAdmin
        .from('contact_touchpoints')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (touchpointError) {
        logger.error(
          { error: touchpointError.message, contactId, userId: user.id },
          'GET /contacts/:id: touchpoints query failed',
        );
      }

      return c.json({ contact, touchpoints: touchpoints ?? [] });
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), userId: user.id },
        'GET /contacts/:id: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── PATCH /contacts/:id — Update a contact ──────────────────────────────────

networkingContacts.patch(
  '/contacts/:id',
  rateLimitMiddleware(30, 60_000),
  async (c) => {
    const user = c.get('user');
    const contactId = c.req.param('id') ?? '';
    const body = await c.req.json().catch(() => null);

    const parsed = updateContactSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.issues }, 400);
    }

    if (Object.keys(parsed.data).length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    try {
      // Verify ownership first
      const { data: existing, error: findError } = await supabaseAdmin
        .from('networking_contacts')
        .select('id')
        .eq('id', contactId)
        .eq('user_id', user.id)
        .single();

      if (findError || !existing) {
        return c.json({ error: 'Contact not found' }, 404);
      }

      const updateData: Record<string, unknown> = {};
      const d = parsed.data;
      if (d.name !== undefined) updateData.name = d.name;
      if (d.title !== undefined) updateData.title = d.title;
      if (d.company !== undefined) updateData.company = d.company;
      if (d.email !== undefined) updateData.email = d.email;
      if (d.linkedin_url !== undefined) updateData.linkedin_url = d.linkedin_url;
      if (d.phone !== undefined) updateData.phone = d.phone;
      if (d.relationship_type !== undefined) updateData.relationship_type = d.relationship_type;
      if (d.relationship_strength !== undefined) updateData.relationship_strength = d.relationship_strength;
      if (d.tags !== undefined) updateData.tags = d.tags;
      if (d.notes !== undefined) updateData.notes = d.notes;
      if (d.next_followup_at !== undefined) updateData.next_followup_at = d.next_followup_at;
      if (d.application_id !== undefined) updateData.application_id = d.application_id;
      if (d.contact_role !== undefined) updateData.contact_role = d.contact_role;

      const { data: contact, error } = await supabaseAdmin
        .from('networking_contacts')
        .update(updateData)
        .eq('id', contactId)
        .eq('user_id', user.id)
        .select('*')
        .single();

      if (error) {
        logger.error({ error: error.message, contactId, userId: user.id }, 'PATCH /contacts/:id: update failed');
        return c.json({ error: 'Failed to update contact' }, 500);
      }

      return c.json({ contact });
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), userId: user.id },
        'PATCH /contacts/:id: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── DELETE /contacts/:id — Delete a contact ──────────────────────────────────

networkingContacts.delete(
  '/contacts/:id',
  rateLimitMiddleware(30, 60_000),
  async (c) => {
    const user = c.get('user');
    const contactId = c.req.param('id') ?? '';

    try {
      const { data: existing, error: findError } = await supabaseAdmin
        .from('networking_contacts')
        .select('id')
        .eq('id', contactId)
        .eq('user_id', user.id)
        .single();

      if (findError || !existing) {
        return c.json({ error: 'Contact not found' }, 404);
      }

      const { error } = await supabaseAdmin
        .from('networking_contacts')
        .delete()
        .eq('id', contactId)
        .eq('user_id', user.id);

      if (error) {
        logger.error({ error: error.message, contactId, userId: user.id }, 'DELETE /contacts/:id: delete failed');
        return c.json({ error: 'Failed to delete contact' }, 500);
      }

      return new Response(null, { status: 204 });
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), userId: user.id },
        'DELETE /contacts/:id: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── POST /contacts/:id/touchpoints — Log a touchpoint ───────────────────────

networkingContacts.post(
  '/contacts/:id/touchpoints',
  rateLimitMiddleware(30, 60_000),
  async (c) => {
    const user = c.get('user');
    const contactId = c.req.param('id') ?? '';
    const body = await c.req.json().catch(() => null);

    const parsed = createTouchpointSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.issues }, 400);
    }

    try {
      // Verify contact ownership
      const { data: existing, error: findError } = await supabaseAdmin
        .from('networking_contacts')
        .select('id')
        .eq('id', contactId)
        .eq('user_id', user.id)
        .single();

      if (findError || !existing) {
        return c.json({ error: 'Contact not found' }, 404);
      }

      let result;
      try {
        result = await processNewTouchpoint({
          userId: user.id,
          contactId,
          type: parsed.data.type,
          notes: parsed.data.notes,
        });
      } catch (insertErr) {
        logger.error(
          { error: insertErr instanceof Error ? insertErr.message : String(insertErr), contactId, userId: user.id },
          'POST /contacts/:id/touchpoints: insert failed',
        );
        return c.json({ error: 'Failed to create touchpoint' }, 500);
      }

      return c.json({ touchpoint: result.touchpoint }, 201);
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), userId: user.id },
        'POST /contacts/:id/touchpoints: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── GET /contacts/:id/touchpoints — List touchpoints ────────────────────────

networkingContacts.get(
  '/contacts/:id/touchpoints',
  rateLimitMiddleware(60, 60_000),
  async (c) => {
    const user = c.get('user');
    const contactId = c.req.param('id') ?? '';

    try {
      // Verify contact ownership
      const { data: existing, error: findError } = await supabaseAdmin
        .from('networking_contacts')
        .select('id')
        .eq('id', contactId)
        .eq('user_id', user.id)
        .single();

      if (findError || !existing) {
        return c.json({ error: 'Contact not found' }, 404);
      }

      const { data: touchpoints, error } = await supabaseAdmin
        .from('contact_touchpoints')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        logger.error(
          { error: error.message, contactId, userId: user.id },
          'GET /contacts/:id/touchpoints: query failed',
        );
        return c.json({ error: 'Failed to fetch touchpoints' }, 500);
      }

      return c.json({ touchpoints: touchpoints ?? [] });
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), userId: user.id },
        'GET /contacts/:id/touchpoints: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── GET /follow-ups — Contacts with upcoming follow-ups ─────────────────────

networkingContacts.get(
  '/follow-ups',
  rateLimitMiddleware(60, 60_000),
  async (c) => {
    const user = c.get('user');

    const queryParsed = followUpQuerySchema.safeParse({
      days: c.req.query('days'),
    });

    if (!queryParsed.success) {
      return c.json({ error: 'Invalid query parameters', details: queryParsed.error.issues }, 400);
    }

    const days = queryParsed.data.days ?? 7;
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    try {
      const { data: contacts, error } = await supabaseAdmin
        .from('networking_contacts')
        .select('*')
        .eq('user_id', user.id)
        .not('next_followup_at', 'is', null)
        .lte('next_followup_at', cutoff)
        .order('next_followup_at', { ascending: true });

      if (error) {
        logger.error({ error: error.message, userId: user.id }, 'GET /follow-ups: query failed');
        return c.json({ error: 'Failed to fetch follow-ups' }, 500);
      }

      return c.json({ contacts: contacts ?? [], days_ahead: days });
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), userId: user.id },
        'GET /follow-ups: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── GET /overdue — Contacts past their follow-up date ───────────────────────

networkingContacts.get(
  '/overdue',
  rateLimitMiddleware(60, 60_000),
  async (c) => {
    const user = c.get('user');
    const now = new Date().toISOString();

    try {
      const { data: contacts, error } = await supabaseAdmin
        .from('networking_contacts')
        .select('*')
        .eq('user_id', user.id)
        .not('next_followup_at', 'is', null)
        .lt('next_followup_at', now)
        .order('next_followup_at', { ascending: true });

      if (error) {
        logger.error({ error: error.message, userId: user.id }, 'GET /overdue: query failed');
        return c.json({ error: 'Failed to fetch overdue contacts' }, 500);
      }

      return c.json({ contacts: contacts ?? [], count: contacts?.length ?? 0 });
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), userId: user.id },
        'GET /overdue: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── POST /ni-import — Import contacts from Network Intelligence ──────────────
// Fetches the user's client_connections from NI and creates/updates
// networking_contacts with source deduplication on email or linkedin_url.

networkingContacts.post(
  '/ni-import',
  rateLimitMiddleware(5, 60_000),
  async (c) => {
    const user = c.get('user');

    try {
      // Fetch all NI connections for this user
      const { data: niConnections, error: niError } = await supabaseAdmin
        .from('client_connections')
        .select('id, first_name, last_name, email, company_raw, position')
        .eq('user_id', user.id)
        .limit(500);

      if (niError) {
        logger.error({ error: niError.message, userId: user.id }, 'POST /ni-import: NI query failed');
        return c.json({ error: 'Failed to fetch Network Intelligence connections' }, 500);
      }

      if (!niConnections || niConnections.length === 0) {
        return c.json({ imported: 0, skipped: 0, message: 'No Network Intelligence connections found.' });
      }

      // Fetch existing contacts for deduplication (email + ni_connection_id)
      const { data: existingContacts, error: existingError } = await supabaseAdmin
        .from('networking_contacts')
        .select('id, email, ni_connection_id')
        .eq('user_id', user.id);

      if (existingError) {
        logger.error({ error: existingError.message, userId: user.id }, 'POST /ni-import: existing contacts query failed');
        return c.json({ error: 'Failed to check existing contacts' }, 500);
      }

      const existingEmails = new Set(
        (existingContacts ?? []).map((c) => c.email?.toLowerCase()).filter(Boolean),
      );
      const existingNiIds = new Set(
        (existingContacts ?? []).map((c) => c.ni_connection_id).filter(Boolean),
      );

      const toInsert: Array<Record<string, unknown>> = [];

      for (const conn of niConnections) {
        // Skip if already imported by NI ID
        if (existingNiIds.has(conn.id)) continue;

        // Skip if email already exists in contacts
        if (conn.email && existingEmails.has(conn.email.toLowerCase())) continue;

        toInsert.push({
          user_id: user.id,
          name: `${conn.first_name} ${conn.last_name}`.trim(),
          title: conn.position ?? null,
          company: conn.company_raw ?? null,
          email: conn.email ?? null,
          relationship_type: 'other',
          relationship_strength: 1,
          tags: [],
          ni_connection_id: conn.id,
        });
      }

      if (toInsert.length === 0) {
        return c.json({
          imported: 0,
          skipped: niConnections.length,
          message: 'All connections are already in your CRM.',
        });
      }

      const { error: insertError } = await supabaseAdmin
        .from('networking_contacts')
        .insert(toInsert);

      if (insertError) {
        logger.error({ error: insertError.message, userId: user.id }, 'POST /ni-import: bulk insert failed');
        return c.json({ error: 'Failed to import contacts' }, 500);
      }

      logger.info(
        { imported: toInsert.length, skipped: niConnections.length - toInsert.length, userId: user.id },
        'POST /ni-import: import complete',
      );

      return c.json({
        imported: toInsert.length,
        skipped: niConnections.length - toInsert.length,
        message: `Imported ${toInsert.length} new contact${toInsert.length !== 1 ? 's' : ''} from Network Intelligence.`,
      });
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), userId: user.id },
        'POST /ni-import: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// ─── POST /contacts/:contactId/prepare-outreach ───────────────────────────────
// Returns a prepared input object the frontend can use to launch the Outreach
// agent pipeline for an existing CRM contact. Loads contact data, touchpoint
// history, and the user's shared career context in one round-trip.
//
// Both FF_NETWORKING_CRM and FF_NETWORKING_OUTREACH must be active.

const prepareOutreachSchema = z.object({
  messaging_method: z.enum(['group_message', 'connection_request', 'inmail']).optional(),
  context_notes: z.string().max(2000).optional(),
});

networkingContacts.post(
  '/contacts/:contactId/prepare-outreach',
  rateLimitMiddleware(20, 60_000),
  async (c) => {
    const user = c.get('user');
    const contactId = c.req.param('contactId') ?? '';

    // Both feature flags must be active
    if (!FF_NETWORKING_OUTREACH) {
      return c.json({ error: 'Networking outreach feature is not enabled' }, 403);
    }

    const body = await c.req.json().catch(() => ({}));
    const parsed = prepareOutreachSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.issues }, 400);
    }

    try {
      // Load the CRM contact and its history
      const history = await getContactWithHistory(contactId, user.id);
      if (!history) {
        return c.json({ error: 'Contact not found' }, 404);
      }

      const { contact } = history;

      // Load user's shared career context (same bundle as the outreach pipeline)
      let sharedContext: Record<string, unknown> | undefined;
      let platformContext: Record<string, unknown> | undefined;
      try {
        const bundle = await loadAgentContextBundle(user.id, {
          includeCareerProfile: true,
          includePositioningStrategy: true,
          includeEvidenceItems: true,
          includeCareerNarrative: true,
          includeWhyMeStory: true,
          includeClientProfile: true,
          includeEmotionalBaseline: false,
        });
        sharedContext = applySharedContextOverride(bundle.sharedContext, {
          artifactTarget: {
            artifactType: 'networking_outreach',
            artifactGoal: 'draft a networking outreach sequence',
            targetAudience: 'target contact',
            successCriteria: [
              'sound personal and credible',
              'use supported common ground',
              'avoid overclaiming',
            ],
          },
          workflowState: {
            room: 'networking',
            stage: 'context_loaded',
            activeTask: 'shape outreach from shared positioning and confirmed evidence',
          },
        }) as unknown as Record<string, unknown>;
        if (Object.keys(bundle.platformContext).length > 0) {
          platformContext = bundle.platformContext;
        }
      } catch (ctxErr) {
        logger.warn(
          { error: ctxErr instanceof Error ? ctxErr.message : String(ctxErr), userId: user.id },
          'POST /contacts/:contactId/prepare-outreach: career context load failed (continuing without it)',
        );
      }

      // Assemble the prepared outreach input
      const preparedInput: Record<string, unknown> = {
        crm_contact_id: contactId,
        messaging_method: parsed.data.messaging_method ?? 'group_message',
        target_input: {
          target_name: contact.name,
          target_title: contact.title ?? '',
          target_company: contact.company ?? '',
          target_linkedin_url: contact.linkedin_url ?? undefined,
          context_notes: parsed.data.context_notes ?? contact.notes ?? undefined,
        },
      };

      if (sharedContext) preparedInput.shared_context = sharedContext;
      if (platformContext) preparedInput.platform_context = platformContext;

      return c.json({
        prepared_input: preparedInput,
        contact_summary: {
          id: contact.id,
          name: contact.name,
          title: contact.title,
          company: contact.company,
          relationship_strength: contact.relationship_strength,
          last_contact_date: contact.last_contact_date,
          touchpoint_count: history.touchpoints.length,
          prior_outreach_count: history.outreachHistory.length,
        },
      });
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), userId: user.id, contactId },
        'POST /contacts/:contactId/prepare-outreach: unexpected error',
      );
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);
