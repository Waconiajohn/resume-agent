/**
 * Job Matches Store — Supabase CRUD for job_matches table.
 *
 * All functions use supabaseAdmin (service key, bypasses RLS).
 * Follows connections-store.ts patterns.
 */

import { supabaseAdmin } from '../supabase.js';
import logger from '../logger.js';
import type { JobMatchRow } from './types.js';

// ─── Insert ──────────────────────────────────────────────────────────────────

export interface InsertJobMatch {
  company_id: string;
  title: string;
  url?: string;
  location?: string;
  salary_range?: string;
  description_snippet?: string;
  match_score?: number;
  referral_available?: boolean;
  connection_count?: number;
  status?: JobMatchRow['status'];
  posted_on?: string;
  scraped_at?: string;
  metadata?: Record<string, unknown>;
}

export async function insertJobMatch(
  userId: string,
  match: InsertJobMatch,
): Promise<JobMatchRow | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('job_matches')
      .insert({
        user_id: userId,
        company_id: match.company_id,
        title: match.title,
        url: match.url ?? null,
        location: match.location ?? null,
        salary_range: match.salary_range ?? null,
        description_snippet: match.description_snippet ?? null,
        match_score: match.match_score ?? null,
        referral_available: match.referral_available ?? false,
        connection_count: match.connection_count ?? 0,
        status: match.status ?? 'new',
        posted_on: match.posted_on ?? null,
        scraped_at: match.scraped_at ?? null,
        metadata: match.metadata ?? {},
      })
      .select('*')
      .single();

    if (error) {
      logger.error({ error: error.message, userId }, 'insertJobMatch: failed');
      return null;
    }

    return data as JobMatchRow;
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), userId },
      'insertJobMatch: unexpected error',
    );
    return null;
  }
}

// ─── Get by User ─────────────────────────────────────────────────────────────

export interface JobMatchFilters {
  status?: JobMatchRow['status'];
  limit?: number;
  offset?: number;
}

export async function getJobMatchesByUser(
  userId: string,
  filters: JobMatchFilters = {},
): Promise<JobMatchRow[]> {
  try {
    const limit = Math.min(filters.limit ?? 50, 200);
    const offset = filters.offset ?? 0;

    // Auto-expire: exclude rows older than 30 days that have not been saved/actioned.
    // This keeps the matches list fresh without deleting data.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    let query = supabaseAdmin
      .from('job_matches')
      .select('*, company_directory(name_display)')
      .eq('user_id', userId)
      // Staleness guard: drop matches older than 30 days unless saved/actioned
      .or(
        `created_at.gt.${thirtyDaysAgo},status.in.(applied,referred,interviewing,saved)`,
      )
      // New-first: rows without first_seen_at sort to the top, then by created_at desc
      .order('first_seen_at', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ error: error.message, userId }, 'getJobMatchesByUser: query failed');
      return [];
    }

    // Mark first_seen_at for unseen matches (fire-and-forget)
    const unseenIds = (data ?? [])
      .filter((m) => !(m as unknown as Record<string, unknown>).first_seen_at)
      .map((m) => m.id)
      .filter(Boolean);
    if (unseenIds.length > 0) {
      void (async () => {
        const { error: markError } = await supabaseAdmin
          .from('job_matches')
          .update({ first_seen_at: new Date().toISOString() })
          .in('id', unseenIds);
        if (markError) {
          logger.warn({ userId, count: unseenIds.length, error: markError.message }, 'getJobMatchesByUser: failed to mark first_seen_at');
        }
      })();
    }

    return (data ?? []) as JobMatchRow[];
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), userId },
      'getJobMatchesByUser: unexpected error',
    );
    return [];
  }
}

// ─── Update Metadata ─────────────────────────────────────────────────────────

/**
 * Merge additional fields into a job match's metadata JSONB column.
 *
 * Used by the feedback loop instrumentation layer to record which resume session,
 * role profile, positioning frame, and hiring manager objections were associated
 * with a specific application. Merges shallowly — existing metadata keys are
 * preserved unless overwritten by the new fields.
 */
export async function mergeJobMatchMetadata(
  userId: string,
  matchId: string,
  newMetadata: Record<string, unknown>,
): Promise<boolean> {
  try {
    // Atomic JSONB merge using Postgres || operator via raw SQL.
    // Avoids the read-modify-write race condition of a client-side merge.
    const { error } = await supabaseAdmin.rpc('exec_sql', {
      query: `UPDATE job_matches
              SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
              WHERE id = $2 AND user_id = $3`,
      params: [JSON.stringify(newMetadata), matchId, userId],
    }).single();

    // Fallback: if the RPC doesn't exist, do a direct update (overwrites metadata).
    if (error) {
      logger.warn({ error: error.message, matchId }, 'mergeJobMatchMetadata: atomic merge RPC unavailable, falling back to direct update');
      const { error: updateError } = await supabaseAdmin
        .from('job_matches')
        .update({ metadata: newMetadata })
        .eq('id', matchId)
        .eq('user_id', userId);

      if (updateError) {
        logger.error({ error: updateError.message, userId, matchId }, 'mergeJobMatchMetadata: fallback update failed');
        return false;
      }
    }

    return true;
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), userId, matchId },
      'mergeJobMatchMetadata: unexpected error',
    );
    return false;
  }
}

// ─── Update Status ───────────────────────────────────────────────────────────

export async function updateJobMatchStatus(
  userId: string,
  matchId: string,
  status: JobMatchRow['status'],
): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from('job_matches')
      .update({ status })
      .eq('id', matchId)
      .eq('user_id', userId)
      .select('id');

    if (error) {
      logger.error({ error: error.message, userId, matchId }, 'updateJobMatchStatus: failed');
      return false;
    }

    return (data ?? []).length > 0;
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), userId, matchId },
      'updateJobMatchStatus: unexpected error',
    );
    return false;
  }
}
