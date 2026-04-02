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

    let query = supabaseAdmin
      .from('job_matches')
      .select('*, company_directory(name_display)')
      .eq('user_id', userId)
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

    return (data ?? []) as JobMatchRow[];
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), userId },
      'getJobMatchesByUser: unexpected error',
    );
    return [];
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
