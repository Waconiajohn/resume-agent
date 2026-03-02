/**
 * Platform Context — shared user context store
 *
 * Persists positioning strategy, evidence items, career narratives, and target
 * roles produced by any product so that future products can access them without
 * re-running discovery.
 *
 * All functions use the admin Supabase client (service key, bypasses RLS).
 */

import { supabaseAdmin } from './supabase.js';
import logger from './logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContextType =
  | 'positioning_strategy'
  | 'evidence_item'
  | 'career_narrative'
  | 'target_role';

export interface PlatformContextRow {
  id: string;
  user_id: string;
  context_type: ContextType;
  content: Record<string, unknown>;
  source_product: string;
  source_session_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

// ─── getUserContext ───────────────────────────────────────────────────────────

/**
 * Returns all platform context rows for a given user and context type.
 */
export async function getUserContext(
  userId: string,
  contextType: ContextType,
): Promise<PlatformContextRow[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('user_platform_context')
      .select('*')
      .eq('user_id', userId)
      .eq('context_type', contextType)
      .order('updated_at', { ascending: false });

    if (error) {
      logger.error({ error: error.message, userId, contextType }, 'getUserContext: query failed');
      return [];
    }

    return (data ?? []) as PlatformContextRow[];
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), userId, contextType },
      'getUserContext: unexpected error',
    );
    return [];
  }
}

// ─── upsertUserContext ────────────────────────────────────────────────────────

/**
 * Upserts a platform context row keyed by (user_id, context_type, source_product).
 * If a row with that combination already exists it will be updated (version incremented).
 * If not, a new row is inserted.
 *
 * Returns the upserted row, or null on failure.
 */
export async function upsertUserContext(
  userId: string,
  contextType: ContextType,
  content: Record<string, unknown>,
  sourceProduct: string,
  sourceSessionId?: string,
): Promise<PlatformContextRow | null> {
  try {
    // Check for an existing row to increment version
    const { data: existing } = await supabaseAdmin
      .from('user_platform_context')
      .select('id, version')
      .eq('user_id', userId)
      .eq('context_type', contextType)
      .eq('source_product', sourceProduct)
      .maybeSingle();

    if (existing) {
      const existingRow = existing as { id: string; version: number };
      const { data, error } = await supabaseAdmin
        .from('user_platform_context')
        .update({
          content,
          source_session_id: sourceSessionId ?? null,
          version: existingRow.version + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingRow.id)
        .select('*')
        .single();

      if (error) {
        logger.error({ error: error.message, userId, contextType }, 'upsertUserContext: update failed');
        return null;
      }

      return data as PlatformContextRow;
    }

    const { data, error } = await supabaseAdmin
      .from('user_platform_context')
      .insert({
        user_id: userId,
        context_type: contextType,
        content,
        source_product: sourceProduct,
        source_session_id: sourceSessionId ?? null,
        version: 1,
      })
      .select('*')
      .single();

    if (error) {
      logger.error({ error: error.message, userId, contextType }, 'upsertUserContext: insert failed');
      return null;
    }

    return data as PlatformContextRow;
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), userId, contextType },
      'upsertUserContext: unexpected error',
    );
    return null;
  }
}

// ─── listUserContextByType ────────────────────────────────────────────────────

/**
 * Returns all platform context rows for a user, optionally filtered by a list
 * of context types. When `types` is omitted, all rows for the user are returned.
 *
 * Results are ordered by updated_at descending.
 */
export async function listUserContextByType(
  userId: string,
  types?: ContextType[],
): Promise<PlatformContextRow[]> {
  try {
    let query = supabaseAdmin
      .from('user_platform_context')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (types && types.length > 0) {
      query = query.in('context_type', types);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ error: error.message, userId, types }, 'listUserContextByType: query failed');
      return [];
    }

    return (data ?? []) as PlatformContextRow[];
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), userId },
      'listUserContextByType: unexpected error',
    );
    return [];
  }
}
