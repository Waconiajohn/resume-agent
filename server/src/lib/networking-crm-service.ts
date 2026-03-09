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
