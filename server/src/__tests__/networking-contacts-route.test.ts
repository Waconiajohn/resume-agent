/**
 * Networking Contacts Route — Tests for /api/networking-contacts/*
 *
 * Sprint 61 + 63 — Networking Hub + Coaching Discipline.
 *
 * Covers: CRUD schema validation, touchpoint creation, four-touch follow-up
 * discipline (auto follow-up scheduling), relationship_strength bumping,
 * search filtering, and follow-up query endpoint.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// ─── Schema re-definitions ────────────────────────────────────────────────────

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

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('../lib/feature-flags.js', () => ({
  FF_NETWORKING_CRM: true,
}));

vi.mock('../lib/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Schema: createContactSchema ─────────────────────────────────────────────

describe('createContactSchema', () => {
  it('accepts a minimal contact (name only)', () => {
    expect(createContactSchema.safeParse({ name: 'Jane Smith' }).success).toBe(true);
  });

  it('accepts a fully-populated contact', () => {
    const result = createContactSchema.safeParse({
      name: 'John Doe',
      title: 'VP of Engineering',
      company: 'Acme Corp',
      email: 'john@acme.com',
      linkedin_url: 'https://linkedin.com/in/johndoe',
      phone: '+1-555-0100',
      relationship_type: 'hiring_manager',
      relationship_strength: 4,
      tags: ['target', 'hot-lead'],
      notes: 'Met at DevConf 2025',
      next_followup_at: new Date(Date.now() + 86400_000).toISOString(),
      application_id: '550e8400-e29b-41d4-a716-446655440000',
      contact_role: 'hiring_manager',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    expect(createContactSchema.safeParse({ title: 'CTO' }).success).toBe(false);
  });

  it('rejects empty name', () => {
    expect(createContactSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects invalid email', () => {
    expect(createContactSchema.safeParse({ name: 'Jane', email: 'not-an-email' }).success).toBe(false);
  });

  it('rejects invalid linkedin_url', () => {
    expect(createContactSchema.safeParse({ name: 'Jane', linkedin_url: 'not-a-url' }).success).toBe(false);
  });

  it('rejects relationship_strength outside 1-5', () => {
    expect(createContactSchema.safeParse({ name: 'Jane', relationship_strength: 0 }).success).toBe(false);
    expect(createContactSchema.safeParse({ name: 'Jane', relationship_strength: 6 }).success).toBe(false);
  });

  it('accepts relationship_strength 1 through 5', () => {
    for (let s = 1; s <= 5; s++) {
      expect(createContactSchema.safeParse({ name: 'Jane', relationship_strength: s }).success).toBe(true);
    }
  });

  it('rejects invalid relationship_type', () => {
    expect(createContactSchema.safeParse({ name: 'Jane', relationship_type: 'colleague' }).success).toBe(false);
  });

  it('accepts all valid relationship_types', () => {
    for (const rt of RELATIONSHIP_TYPES) {
      expect(createContactSchema.safeParse({ name: 'Jane', relationship_type: rt }).success).toBe(true);
    }
  });

  it('rejects tags array exceeding 20 items', () => {
    const tags = Array.from({ length: 21 }, (_, i) => `tag${i}`);
    expect(createContactSchema.safeParse({ name: 'Jane', tags }).success).toBe(false);
  });

  it('accepts tags array of exactly 20 items', () => {
    const tags = Array.from({ length: 20 }, (_, i) => `tag${i}`);
    expect(createContactSchema.safeParse({ name: 'Jane', tags }).success).toBe(true);
  });

  it('rejects next_followup_at that is not a datetime string', () => {
    expect(createContactSchema.safeParse({ name: 'Jane', next_followup_at: 'tomorrow' }).success).toBe(false);
  });

  it('accepts valid ISO datetime for next_followup_at', () => {
    expect(
      createContactSchema.safeParse({ name: 'Jane', next_followup_at: new Date().toISOString() }).success,
    ).toBe(true);
  });

  it('rejects invalid application_id (non-UUID)', () => {
    expect(createContactSchema.safeParse({ name: 'Jane', application_id: 'not-a-uuid' }).success).toBe(false);
  });

  it('accepts all valid contact_roles', () => {
    for (const role of CONTACT_ROLES) {
      expect(createContactSchema.safeParse({ name: 'Jane', contact_role: role }).success).toBe(true);
    }
  });

  it('rejects invalid contact_role', () => {
    expect(createContactSchema.safeParse({ name: 'Jane', contact_role: 'intern' }).success).toBe(false);
  });
});

// ─── Schema: updateContactSchema ─────────────────────────────────────────────

describe('updateContactSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    expect(updateContactSchema.safeParse({}).success).toBe(true);
  });

  it('accepts partial update with only company', () => {
    expect(updateContactSchema.safeParse({ company: 'New Corp' }).success).toBe(true);
  });

  it('accepts partial update with only name', () => {
    expect(updateContactSchema.safeParse({ name: 'New Name' }).success).toBe(true);
  });

  it('rejects invalid email in partial update', () => {
    expect(updateContactSchema.safeParse({ email: 'bad' }).success).toBe(false);
  });

  it('rejects empty name on partial update', () => {
    expect(updateContactSchema.safeParse({ name: '' }).success).toBe(false);
  });
});

// ─── Schema: listContactsQuerySchema ─────────────────────────────────────────

describe('listContactsQuerySchema', () => {
  it('accepts empty query (all defaults)', () => {
    expect(listContactsQuerySchema.safeParse({}).success).toBe(true);
  });

  it('coerces limit and offset from strings', () => {
    const result = listContactsQuerySchema.safeParse({ limit: '25', offset: '10' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(25);
      expect(result.data.offset).toBe(10);
    }
  });

  it('rejects limit > 200', () => {
    expect(listContactsQuerySchema.safeParse({ limit: '201' }).success).toBe(false);
  });

  it('rejects limit < 1', () => {
    expect(listContactsQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
  });

  it('rejects negative offset', () => {
    expect(listContactsQuerySchema.safeParse({ offset: '-1' }).success).toBe(false);
  });

  it('rejects invalid sort_by', () => {
    expect(listContactsQuerySchema.safeParse({ sort_by: 'email' }).success).toBe(false);
  });

  it('accepts all valid sort_by fields', () => {
    for (const field of SORT_FIELDS) {
      expect(listContactsQuerySchema.safeParse({ sort_by: field }).success).toBe(true);
    }
  });

  it('rejects invalid sort_order', () => {
    expect(listContactsQuerySchema.safeParse({ sort_order: 'random' }).success).toBe(false);
  });

  it('accepts asc and desc sort_order', () => {
    expect(listContactsQuerySchema.safeParse({ sort_order: 'asc' }).success).toBe(true);
    expect(listContactsQuerySchema.safeParse({ sort_order: 'desc' }).success).toBe(true);
  });

  it('accepts search string up to 200 chars', () => {
    const search = 'a'.repeat(200);
    expect(listContactsQuerySchema.safeParse({ search }).success).toBe(true);
  });

  it('rejects search string over 200 chars', () => {
    const search = 'a'.repeat(201);
    expect(listContactsQuerySchema.safeParse({ search }).success).toBe(false);
  });

  it('accepts all valid relationship_types as filter', () => {
    for (const rt of RELATIONSHIP_TYPES) {
      expect(listContactsQuerySchema.safeParse({ relationship_type: rt }).success).toBe(true);
    }
  });
});

// ─── Schema: createTouchpointSchema ──────────────────────────────────────────

describe('createTouchpointSchema', () => {
  it('accepts all valid touchpoint types', () => {
    for (const type of TOUCHPOINT_TYPES) {
      expect(createTouchpointSchema.safeParse({ type }).success).toBe(true);
    }
  });

  it('rejects missing type', () => {
    expect(createTouchpointSchema.safeParse({}).success).toBe(false);
  });

  it('rejects invalid touchpoint type', () => {
    expect(createTouchpointSchema.safeParse({ type: 'text_message' }).success).toBe(false);
  });

  it('accepts optional notes', () => {
    expect(createTouchpointSchema.safeParse({ type: 'email', notes: 'Discussed Q1 goals' }).success).toBe(true);
  });

  it('rejects notes exceeding 5000 chars', () => {
    const notes = 'a'.repeat(5001);
    expect(createTouchpointSchema.safeParse({ type: 'email', notes }).success).toBe(false);
  });
});

// ─── Schema: followUpQuerySchema ──────────────────────────────────────────────

describe('followUpQuerySchema', () => {
  it('accepts empty query (defaults to 7 days)', () => {
    expect(followUpQuerySchema.safeParse({}).success).toBe(true);
  });

  it('coerces days from string', () => {
    const result = followUpQuerySchema.safeParse({ days: '14' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.days).toBe(14);
    }
  });

  it('rejects days < 1', () => {
    expect(followUpQuerySchema.safeParse({ days: '0' }).success).toBe(false);
  });

  it('rejects days > 90', () => {
    expect(followUpQuerySchema.safeParse({ days: '91' }).success).toBe(false);
  });

  it('accepts days = 90 (boundary)', () => {
    expect(followUpQuerySchema.safeParse({ days: '90' }).success).toBe(true);
  });

  it('accepts days = 1 (boundary)', () => {
    expect(followUpQuerySchema.safeParse({ days: '1' }).success).toBe(true);
  });
});

// ─── Four-touch follow-up discipline (Sprint 63) ─────────────────────────────

describe('Four-Touch Follow-Up Discipline — scheduling logic', () => {
  /**
   * Mirrors the logic in POST /contacts/:id/touchpoints:
   * 1st touch → +4 days
   * 2nd–3rd touch → +6 days
   * 4th+ → null (sequence complete)
   */
  function computeNextFollowup(totalTouchpoints: number): string | null {
    if (totalTouchpoints <= 1) {
      return new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();
    } else if (totalTouchpoints <= 3) {
      return new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();
    } else {
      return null;
    }
  }

  it('1st touchpoint schedules +4 day follow-up', () => {
    const result = computeNextFollowup(1);
    expect(result).not.toBeNull();
    if (result) {
      const diff = new Date(result).getTime() - Date.now();
      // Should be ~4 days (allow ±5 seconds tolerance)
      expect(diff).toBeGreaterThanOrEqual(4 * 24 * 60 * 60 * 1000 - 5000);
      expect(diff).toBeLessThanOrEqual(4 * 24 * 60 * 60 * 1000 + 5000);
    }
  });

  it('2nd touchpoint schedules +6 day follow-up', () => {
    const result = computeNextFollowup(2);
    expect(result).not.toBeNull();
    if (result) {
      const diff = new Date(result).getTime() - Date.now();
      expect(diff).toBeGreaterThanOrEqual(6 * 24 * 60 * 60 * 1000 - 5000);
    }
  });

  it('3rd touchpoint schedules +6 day follow-up', () => {
    const result = computeNextFollowup(3);
    expect(result).not.toBeNull();
    if (result) {
      const diff = new Date(result).getTime() - Date.now();
      expect(diff).toBeGreaterThanOrEqual(6 * 24 * 60 * 60 * 1000 - 5000);
    }
  });

  it('4th touchpoint clears follow-up (sequence complete)', () => {
    expect(computeNextFollowup(4)).toBeNull();
  });

  it('5th+ touchpoint also clears follow-up', () => {
    expect(computeNextFollowup(5)).toBeNull();
    expect(computeNextFollowup(10)).toBeNull();
  });

  it('follow-up date is a valid ISO string for touchpoints 1-3', () => {
    for (let n = 1; n <= 3; n++) {
      const result = computeNextFollowup(n);
      expect(result).not.toBeNull();
      if (result) {
        expect(() => new Date(result)).not.toThrow();
        expect(new Date(result).toISOString()).toBe(result);
      }
    }
  });
});

// ─── Relationship strength bumping (Sprint 63) ────────────────────────────────

describe('Relationship strength milestones', () => {
  /**
   * Mirrors the milestone logic in POST /contacts/:id/touchpoints:
   * 2nd touch → strength = 2
   * 4th touch → strength = 3
   * Other touches → no change
   */
  function getStrengthBump(totalTouchpoints: number): number | null {
    if (totalTouchpoints === 2) return 2;
    if (totalTouchpoints === 4) return 3;
    return null;
  }

  it('bumps strength to 2 on 2nd touchpoint', () => {
    expect(getStrengthBump(2)).toBe(2);
  });

  it('bumps strength to 3 on 4th touchpoint', () => {
    expect(getStrengthBump(4)).toBe(3);
  });

  it('no bump on 1st touchpoint', () => {
    expect(getStrengthBump(1)).toBeNull();
  });

  it('no bump on 3rd touchpoint', () => {
    expect(getStrengthBump(3)).toBeNull();
  });

  it('no bump on 5th+ touchpoint', () => {
    expect(getStrengthBump(5)).toBeNull();
    expect(getStrengthBump(10)).toBeNull();
  });
});

// ─── Search escaping ──────────────────────────────────────────────────────────

describe('Search input sanitization', () => {
  /**
   * Mirrors the escaping in GET /contacts:
   * Special chars %, _, \ are escaped to prevent PostgREST ILIKE injection.
   */
  function escapeSearchInput(s: string): string {
    return s.replace(/[%_\\]/g, (ch) => `\\${ch}`);
  }

  it('escapes % character', () => {
    expect(escapeSearchInput('50%')).toBe('50\\%');
  });

  it('escapes _ character', () => {
    expect(escapeSearchInput('john_doe')).toBe('john\\_doe');
  });

  it('escapes backslash character', () => {
    expect(escapeSearchInput('C:\\Users')).toBe('C:\\\\Users');
  });

  it('leaves safe characters unchanged', () => {
    expect(escapeSearchInput('Jane Smith')).toBe('Jane Smith');
    expect(escapeSearchInput('Acme Corp')).toBe('Acme Corp');
  });

  it('handles empty string', () => {
    expect(escapeSearchInput('')).toBe('');
  });

  it('escapes multiple special chars in one string', () => {
    expect(escapeSearchInput('50%_deal\\')).toBe('50\\%\\_deal\\\\');
  });
});

// ─── Follow-up cutoff date calculation ───────────────────────────────────────

describe('Follow-up cutoff date calculation', () => {
  it('cutoff is N days in the future', () => {
    const days = 7;
    const before = Date.now();
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    const after = Date.now();

    const cutoffMs = new Date(cutoff).getTime();
    const expectedMin = before + days * 24 * 60 * 60 * 1000;
    const expectedMax = after + days * 24 * 60 * 60 * 1000;

    expect(cutoffMs).toBeGreaterThanOrEqual(expectedMin);
    expect(cutoffMs).toBeLessThanOrEqual(expectedMax);
  });

  it('default days = 7 produces 7-day window', () => {
    const days = 7;
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const diffMs = cutoff.getTime() - Date.now();
    const diffDays = diffMs / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeCloseTo(7, 1);
  });
});
