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

// ─── WhyMeContext ─────────────────────────────────────────────────────────────

export interface WhyMeContext {
  colleaguesCameForWhat: string;
  knownForWhat: string;
  whyNotMe: string;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContextType =
  | 'positioning_strategy'
  | 'evidence_item'
  | 'career_narrative'
  | 'target_role'
  | 'client_profile'
  | 'positioning_foundation'
  | 'benchmark_candidate'
  | 'gap_analysis'
  | 'industry_research'
  | 'job_discovery_results'
  | 'content_post'
  | 'retirement_readiness'
  | 'emotional_baseline';

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

// ─── getLatestUserContext ──────────────────────────────────────────────────────

/**
 * Convenience wrapper: returns the single most recent platform context row
 * for a user and context type, or null if none exists.
 */
export async function getLatestUserContext(
  userId: string,
  contextType: ContextType,
): Promise<PlatformContextRow | null> {
  const rows = await getUserContext(userId, contextType);
  return rows[0] ?? null;
}

// ─── upsertUserContext ────────────────────────────────────────────────────────

/**
 * Upserts a platform context row keyed by (user_id, context_type, source_product).
 * If a row with that combination already exists it will be updated (version incremented).
 * If not, a new row is inserted.
 *
 * Uses the `upsert_platform_context` Postgres function for an atomic version
 * increment — no read-then-write race condition.
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
    const { data, error } = await supabaseAdmin.rpc('upsert_platform_context', {
      p_user_id: userId,
      p_context_type: contextType,
      p_source_product: sourceProduct,
      p_content: content,
      p_source_session_id: sourceSessionId ?? null,
    });

    if (error) {
      logger.error({ error: error.message, userId, contextType }, 'upsertUserContext: RPC failed');
      return null;
    }

    // RPC returns an array (RETURNS SETOF); take the first row
    const row = Array.isArray(data) ? data[0] : data;
    return (row as PlatformContextRow) ?? null;
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), userId, contextType },
      'upsertUserContext: unexpected error',
    );
    return null;
  }
}

// ─── deleteUserContext ──────────────────────────────────────────────────────

/**
 * Deletes platform context rows for a given user and context type.
 * Optionally scoped to a specific source product.
 */
export async function deleteUserContext(
  userId: string,
  contextType: ContextType,
  sourceProduct?: string,
): Promise<void> {
  let query = supabaseAdmin
    .from('user_platform_context')
    .delete()
    .eq('user_id', userId)
    .eq('context_type', contextType);

  if (sourceProduct) {
    query = query.eq('source_product', sourceProduct);
  }

  const { error } = await query;
  if (error) {
    throw new Error(`Failed to delete context: ${error.message}`);
  }
}

// ─── getWhyMeContext ──────────────────────────────────────────────────────────

/**
 * Unified why-me story loader. Tries two sources in priority order:
 *   1. `user_platform_context` rows with context_type = 'career_narrative'
 *      (structured as `{ why_me_story: { colleaguesCameForWhat, knownForWhat, whyNotMe } }`)
 *   2. Direct query of the `why_me_stories` table
 *
 * Returns null if neither source has data.
 */
export async function getWhyMeContext(userId: string): Promise<WhyMeContext | null> {
  // Source 1: platform context career_narrative
  try {
    const narrativeRows = await getUserContext(userId, 'career_narrative');
    if (narrativeRows.length > 0) {
      const content = narrativeRows[0].content;
      const nested = (content as Record<string, unknown>).why_me_story;
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        const n = nested as Record<string, unknown>;
        const result: WhyMeContext = {
          colleaguesCameForWhat: typeof n.colleaguesCameForWhat === 'string' ? n.colleaguesCameForWhat : '',
          knownForWhat: typeof n.knownForWhat === 'string' ? n.knownForWhat : '',
          whyNotMe: typeof n.whyNotMe === 'string' ? n.whyNotMe : '',
        };
        if (result.colleaguesCameForWhat || result.knownForWhat || result.whyNotMe) {
          return result;
        }
      }
    }
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err), userId },
      'getWhyMeContext: career_narrative lookup failed, trying why_me_stories table',
    );
  }

  // Source 2: why_me_stories table (direct)
  try {
    const { data, error } = await supabaseAdmin
      .from('why_me_stories')
      .select('colleagues_came_for_what, known_for_what, why_not_me')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      logger.warn({ error: error.message, userId }, 'getWhyMeContext: why_me_stories query failed');
      return null;
    }

    if (!data) return null;

    return {
      colleaguesCameForWhat: data.colleagues_came_for_what ?? '',
      knownForWhat: data.known_for_what ?? '',
      whyNotMe: data.why_not_me ?? '',
    };
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err), userId },
      'getWhyMeContext: unexpected error',
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
    // Empty array means "no types of interest" — return nothing
    if (types !== undefined && types.length === 0) return [];

    let query = supabaseAdmin
      .from('user_platform_context')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(500);

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
