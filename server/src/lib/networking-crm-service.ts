/**
 * Networking CRM Service — touchpoint lifecycle orchestration.
 *
 * Extracts the "Four-Touch Follow-Up Discipline" business logic from the
 * networking-contacts route into a testable service layer.
 *
 * Methodology (from Coaching Bible):
 * - 1st touch: follow up in 4 days
 * - 2nd and 3rd touches: follow up in 6 days
 * - 4th+ touch: sequence complete, clear next follow-up date
 * - Relationship strength milestones: bump at touch 2 (→ strength 2) and touch 4 (→ strength 3)
 *
 * This module is pure logic — no HTTP, no Hono.
 */

import { supabaseAdmin } from './supabase.js';
import logger from './logger.js';
import type { OutreachMessage } from '../agents/networking-outreach/types.js';

// ─── Four-Touch constants ─────────────────────────────────────────────────────

/** Days until next follow-up after the 1st touch. */
const FIRST_TOUCH_FOLLOWUP_DAYS = 4;

/** Days until next follow-up after the 2nd or 3rd touch. */
const MID_TOUCH_FOLLOWUP_DAYS = 6;

/** Touch counts at which relationship_strength is bumped. */
const STRENGTH_MILESTONES: Record<number, number> = {
  2: 2,
  4: 3,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TouchpointRow {
  id: string;
  user_id: string;
  contact_id: string;
  type: string;
  notes: string | null;
  created_at: string;
}

export interface NetworkingContact {
  id: string;
  user_id: string;
  name: string;
  title: string | null;
  company: string | null;
  email: string | null;
  linkedin_url: string | null;
  phone: string | null;
  relationship_type: string;
  relationship_strength: number;
  tags: string[];
  notes: string | null;
  last_contact_date: string | null;
  next_followup_at: string | null;
  application_id: string | null;
  contact_role: string | null;
  ni_connection_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactWithHistory {
  contact: NetworkingContact;
  touchpoints: TouchpointRow[];
  outreachHistory: OutreachMessage[];
}

export interface ProcessNewTouchpointInput {
  userId: string;
  contactId: string;
  type: string;
  notes?: string | null;
}

export interface ProcessNewTouchpointResult {
  touchpoint: TouchpointRow;
}

// ─── computeNextFollowupDate ──────────────────────────────────────────────────

/**
 * Returns the ISO date string for the next follow-up based on the total
 * number of touchpoints after the current insert, or null when the
 * four-touch sequence is complete (4th touch or beyond).
 *
 * Touch count thresholds:
 *   total <= 1  →  +4 days  (first touch)
 *   total <= 3  →  +6 days  (second or third touch)
 *   total >= 4  →  null     (sequence complete)
 */
function computeNextFollowupDate(totalTouchpoints: number): string | null {
  if (totalTouchpoints <= 1) {
    return new Date(Date.now() + FIRST_TOUCH_FOLLOWUP_DAYS * 24 * 60 * 60 * 1000).toISOString();
  }
  if (totalTouchpoints <= 3) {
    return new Date(Date.now() + MID_TOUCH_FOLLOWUP_DAYS * 24 * 60 * 60 * 1000).toISOString();
  }
  return null;
}

// ─── processNewTouchpoint ─────────────────────────────────────────────────────

/**
 * Full touchpoint lifecycle:
 *   1. Insert the touchpoint row
 *   2. Count total touchpoints for this contact (post-insert)
 *   3. Compute next follow-up date per Four-Touch Discipline
 *   4. Bump relationship_strength at milestone touch counts (2nd → 2, 4th → 3)
 *   5. Update contact: last_contact_date, next_followup_at, [relationship_strength]
 *
 * Returns the created touchpoint. Contact update failure is non-fatal (logged
 * as warn) — the touchpoint itself is the primary write.
 *
 * Throws if the touchpoint insert fails.
 */
export async function processNewTouchpoint(
  input: ProcessNewTouchpointInput,
): Promise<ProcessNewTouchpointResult> {
  const { userId, contactId, type, notes } = input;

  const now = new Date().toISOString();

  // Step 1: Insert touchpoint
  const { data: touchpoint, error: touchpointError } = await supabaseAdmin
    .from('contact_touchpoints')
    .insert({
      user_id: userId,
      contact_id: contactId,
      type,
      notes: notes ?? null,
    })
    .select('*')
    .single();

  if (touchpointError || !touchpoint) {
    throw Object.assign(
      new Error(touchpointError?.message ?? 'Touchpoint insert returned no data'),
      { cause: touchpointError },
    );
  }

  // Step 2: Count total touchpoints after insert
  const { count: touchpointCount } = await supabaseAdmin
    .from('contact_touchpoints')
    .select('id', { count: 'exact', head: true })
    .eq('contact_id', contactId)
    .eq('user_id', userId);

  const total = touchpointCount ?? 0;

  // Step 3: Compute next follow-up date
  const nextFollowup = computeNextFollowupDate(total);

  // Step 4 + 5: Build contact update and apply
  const contactUpdate: Record<string, unknown> = {
    last_contact_date: now,
    next_followup_at: nextFollowup,
  };

  const strengthBump = STRENGTH_MILESTONES[total];
  if (strengthBump !== undefined) {
    contactUpdate.relationship_strength = strengthBump;
  }

  const { error: updateError } = await supabaseAdmin
    .from('networking_contacts')
    .update(contactUpdate)
    .eq('id', contactId)
    .eq('user_id', userId);

  if (updateError) {
    logger.warn(
      { error: updateError.message, contactId, userId },
      'processNewTouchpoint: contact update failed (non-fatal)',
    );
  }

  return { touchpoint: touchpoint as TouchpointRow };
}

// ─── getContactWithHistory ────────────────────────────────────────────────────

/**
 * Load a CRM contact along with its full touchpoint history and any previously
 * generated outreach messages (stored in networking_outreach_reports).
 *
 * Returns null when the contact does not exist or does not belong to the user.
 * All sub-queries are non-fatal on failure — partial results are returned with
 * empty arrays rather than throwing.
 */
export async function getContactWithHistory(
  contactId: string,
  userId: string,
): Promise<ContactWithHistory | null> {
  // Load contact — ownership enforced by user_id filter
  const { data: contact, error: contactError } = await supabaseAdmin
    .from('networking_contacts')
    .select('*')
    .eq('id', contactId)
    .eq('user_id', userId)
    .single();

  if (contactError || !contact) {
    return null;
  }

  // Load touchpoints — most recent first
  const { data: touchpoints, error: touchpointsError } = await supabaseAdmin
    .from('contact_touchpoints')
    .select('*')
    .eq('contact_id', contactId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (touchpointsError) {
    logger.warn(
      { error: touchpointsError.message, contactId, userId },
      'getContactWithHistory: touchpoints query failed (non-fatal)',
    );
  }

  // Load previously generated outreach messages from reports
  // A report is linked to this contact when target_name + target_company match
  // OR when the report was explicitly tagged with the contact (future: add contact_id FK).
  // For now we match on target_name to surface any prior work.
  let outreachHistory: OutreachMessage[] = [];
  const contactName = (contact as NetworkingContact).name;
  if (contactName) {
    const { data: reports, error: reportsError } = await supabaseAdmin
      .from('networking_outreach_reports')
      .select('messages, created_at')
      .eq('user_id', userId)
      .eq('target_name', contactName)
      .order('created_at', { ascending: false })
      .limit(3);

    if (reportsError) {
      logger.warn(
        { error: reportsError.message, contactId, userId },
        'getContactWithHistory: outreach reports query failed (non-fatal)',
      );
    } else if (reports && reports.length > 0) {
      // Flatten messages from all matching reports
      for (const report of reports) {
        const msgs = report.messages;
        if (Array.isArray(msgs)) {
          outreachHistory = outreachHistory.concat(msgs as OutreachMessage[]);
        }
      }
    }
  }

  return {
    contact: contact as NetworkingContact,
    touchpoints: (touchpoints ?? []) as TouchpointRow[],
    outreachHistory,
  };
}
