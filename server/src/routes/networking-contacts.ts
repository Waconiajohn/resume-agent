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
import { FF_NETWORKING_CRM } from '../lib/feature-flags.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { processNewTouchpoint } from '../lib/networking-crm-service.js';
import logger from '../lib/logger.js';

export const networkingContacts = new Hono();

// Auth required for all routes
networkingContacts.use('*', authMiddleware);

// Feature flag guard
networkingContacts.use('*', async (c, next) => {
  if (!FF_NETWORKING_CRM) {
    return c.json({ error: 'Not found' }, 404);
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
    const contactId = c.req.param('id');

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
    const contactId = c.req.param('id');
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
    const contactId = c.req.param('id');

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
    const contactId = c.req.param('id');
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
    const contactId = c.req.param('id');

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
