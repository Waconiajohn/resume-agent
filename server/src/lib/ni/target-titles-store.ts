/**
 * Target Titles Store — Supabase CRUD for client_target_titles table.
 *
 * All functions use the server-only Supabase admin client.
 * Follows connections-store.ts patterns.
 */

import { supabaseAdmin } from '../supabase.js';
import logger from '../logger.js';
import type { ClientTargetTitleRow } from './types.js';

// ─── Insert ──────────────────────────────────────────────────────────────────

export async function insertTargetTitle(
  userId: string,
  title: string,
  priority?: number,
): Promise<ClientTargetTitleRow | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('client_target_titles')
      .insert({
        user_id: userId,
        title,
        priority: priority ?? 1,
      })
      .select('*')
      .single();

    if (error) {
      logger.error({ error: error.message, userId }, 'insertTargetTitle: failed');
      return null;
    }

    return data as ClientTargetTitleRow;
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), userId },
      'insertTargetTitle: unexpected error',
    );
    return null;
  }
}

// ─── Get by User ─────────────────────────────────────────────────────────────

export async function getTargetTitlesByUser(
  userId: string,
): Promise<ClientTargetTitleRow[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('client_target_titles')
      .select('*')
      .eq('user_id', userId)
      .order('priority', { ascending: true });

    if (error) {
      logger.error({ error: error.message, userId }, 'getTargetTitlesByUser: query failed');
      return [];
    }

    return (data ?? []) as ClientTargetTitleRow[];
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), userId },
      'getTargetTitlesByUser: unexpected error',
    );
    return [];
  }
}

// ─── Delete ──────────────────────────────────────────────────────────────────

export async function deleteTargetTitle(
  userId: string,
  titleId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from('client_target_titles')
      .delete()
      .eq('id', titleId)
      .eq('user_id', userId)
      .select('id');

    if (error) {
      logger.error({ error: error.message, userId, titleId }, 'deleteTargetTitle: failed');
      return false;
    }

    // If no rows were deleted, the title doesn't exist or doesn't belong to the user
    return (data ?? []).length > 0;
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), userId, titleId },
      'deleteTargetTitle: unexpected error',
    );
    return false;
  }
}
