/**
 * Connections Store — Supabase CRUD for client_connections table.
 *
 * All functions use supabaseAdmin (service key, bypasses RLS).
 * Follows platform-context.ts patterns.
 */

import { supabaseAdmin } from '../supabase.js';
import logger from '../logger.js';
import type { ParsedConnection, ClientConnectionRow, EnrichedConnectionRow, CompanySummaryRow } from './types.js';

// ─── Insert Connections ───────────────────────────────────────────────────────

/**
 * Bulk insert parsed connections for a user. Chunks at 500 rows to stay
 * within Supabase's payload limits.
 */
export async function insertConnections(
  userId: string,
  connections: ParsedConnection[],
  importBatch?: string,
): Promise<number> {
  if (connections.length === 0) return 0;

  const CHUNK_SIZE = 500;
  let inserted = 0;

  for (let i = 0; i < connections.length; i += CHUNK_SIZE) {
    const chunk = connections.slice(i, i + CHUNK_SIZE);
    const rows = chunk.map((c) => ({
      user_id: userId,
      first_name: c.firstName,
      last_name: c.lastName,
      email: c.email,
      company_raw: c.companyRaw,
      position: c.position,
      connected_on: c.connectedOn ? c.connectedOn.toISOString() : null,
      import_batch: importBatch ?? null,
      linkedin_url: c.linkedinUrl ?? null,
    }));

    try {
      const { error } = await supabaseAdmin
        .from('client_connections')
        .insert(rows);

      if (error) {
        logger.error(
          { error: error.message, userId, chunkStart: i, chunkSize: chunk.length },
          'insertConnections: chunk insert failed',
        );
        continue;
      }

      inserted += chunk.length;
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), userId, chunkStart: i },
        'insertConnections: unexpected error',
      );
    }
  }

  return inserted;
}

// ─── Delete Connections ───────────────────────────────────────────────────────

/**
 * Wipe all connections for a user (used before re-importing).
 */
export async function deleteConnectionsByUser(userId: string): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from('client_connections')
      .delete()
      .eq('user_id', userId);

    if (error) {
      logger.error({ error: error.message, userId }, 'deleteConnectionsByUser: failed');
      return false;
    }

    return true;
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), userId },
      'deleteConnectionsByUser: unexpected error',
    );
    return false;
  }
}

// ─── Get Connections ──────────────────────────────────────────────────────────

/**
 * Paginated query for a user's connections.
 */
export async function getConnectionsByUser(
  userId: string,
  limit = 100,
  offset = 0,
): Promise<ClientConnectionRow[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('client_connections')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error({ error: error.message, userId }, 'getConnectionsByUser: query failed');
      return [];
    }

    return (data ?? []) as ClientConnectionRow[];
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), userId },
      'getConnectionsByUser: unexpected error',
    );
    return [];
  }
}

// ─── Enriched Connections ─────────────────────────────────────────────────────

/**
 * Paginated query with joined company_directory.name_display.
 */
export async function getEnrichedConnectionsByUser(
  userId: string,
  limit = 100,
  offset = 0,
): Promise<EnrichedConnectionRow[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('client_connections')
      .select('*, company_directory(name_display)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error({ error: error.message, userId }, 'getEnrichedConnectionsByUser: query failed');
      return [];
    }

    return (data ?? []).map((row: Record<string, unknown>) => {
      const company = row.company_directory as { name_display: string } | null;
      const { company_directory: _cd, ...rest } = row;
      return {
        ...rest,
        company_display_name: company?.name_display ?? null,
      } as EnrichedConnectionRow;
    });
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), userId },
      'getEnrichedConnectionsByUser: unexpected error',
    );
    return [];
  }
}

// ─── Connection Count ────────────────────────────────────────────────────────

/**
 * Fast count of a user's connections (head-only query).
 */
export async function getConnectionCount(userId: string): Promise<number> {
  try {
    const { count, error } = await supabaseAdmin
      .from('client_connections')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      logger.error({ error: error.message, userId }, 'getConnectionCount: query failed');
      return 0;
    }

    return count ?? 0;
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), userId },
      'getConnectionCount: unexpected error',
    );
    return 0;
  }
}

// ─── Connections by Company ──────────────────────────────────────────────────

export interface CompanyConnectionRow {
  id: string;
  first_name: string;
  last_name: string;
  position: string | null;
  linkedin_url: string | null;
}

export async function getConnectionsByCompanyRaw(
  userId: string,
  companyRaw: string,
): Promise<CompanyConnectionRow[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('client_connections')
      .select('id, first_name, last_name, position, linkedin_url')
      .eq('user_id', userId)
      .eq('company_raw', companyRaw)
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true });

    if (error) {
      logger.error({ error: error.message, userId, companyRaw }, 'getConnectionsByCompanyRaw: query failed');
      return [];
    }

    return (data ?? []) as CompanyConnectionRow[];
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), userId },
      'getConnectionsByCompanyRaw: unexpected error',
    );
    return [];
  }
}

// ─── Company Summary ─────────────────────────────────────────────────────────

/**
 * Aggregate connections by company for a user. Groups in-memory since
 * LinkedIn exports cap at ~5K connections.
 */
export async function getCompanySummary(userId: string): Promise<CompanySummaryRow[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('client_connections')
      .select('company_raw, company_id, position, company_directory(name_display)')
      .eq('user_id', userId);

    if (error) {
      logger.error({ error: error.message, userId }, 'getCompanySummary: query failed');
      return [];
    }

    const grouped = new Map<string, {
      companyRaw: string;
      companyDisplayName: string | null;
      companyId: string | null;
      count: number;
      positions: Map<string, number>;
    }>();

    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const companyRaw = row.company_raw as string;
      const companyId = row.company_id as string | null;
      const position = row.position as string | null;
      const company = row.company_directory as { name_display: string } | null;

      const existing = grouped.get(companyRaw);
      if (existing) {
        existing.count++;
        if (position) {
          existing.positions.set(position, (existing.positions.get(position) ?? 0) + 1);
        }
      } else {
        const positions = new Map<string, number>();
        if (position) positions.set(position, 1);
        grouped.set(companyRaw, {
          companyRaw,
          companyDisplayName: company?.name_display ?? null,
          companyId,
          count: 1,
          positions,
        });
      }
    }

    return Array.from(grouped.values())
      .sort((a, b) => b.count - a.count)
      .map((g) => ({
        companyRaw: g.companyRaw,
        companyDisplayName: g.companyDisplayName,
        companyId: g.companyId,
        connectionCount: g.count,
        topPositions: Array.from(g.positions.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([title]) => title),
      }));
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), userId },
      'getCompanySummary: unexpected error',
    );
    return [];
  }
}

// ─── Scrape Log ───────────────────────────────────────────────────────────────

/**
 * Create a scrape log entry for tracking import operations.
 */
export async function createScrapeLogEntry(
  userId: string,
  operation: 'csv_import' | 'job_scrape' | 'company_enrich' | 'normalization',
  inputSummary: Record<string, unknown>,
): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('scrape_log')
      .insert({
        user_id: userId,
        operation,
        status: 'running',
        input_summary: inputSummary,
      })
      .select('id')
      .single();

    if (error) {
      logger.error({ error: error.message, userId, operation }, 'createScrapeLogEntry: failed');
      return null;
    }

    return (data as { id: string }).id;
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), userId },
      'createScrapeLogEntry: unexpected error',
    );
    return null;
  }
}

/**
 * Update scrape log progress mid-scan (non-blocking).
 */
export async function updateScrapeLogProgress(
  logId: string,
  outputSummary: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('scrape_log')
      .update({ output_summary: outputSummary })
      .eq('id', logId);

    if (error) {
      logger.debug({ error: error.message, logId }, 'updateScrapeLogProgress: failed');
    }
  } catch {
    // Non-blocking — progress update failures should not interrupt scanning
  }
}

/**
 * Update a scrape log entry on completion or failure.
 */
export async function completeScrapeLogEntry(
  logId: string,
  status: 'completed' | 'failed',
  outputSummary: Record<string, unknown>,
  errorMessage?: string,
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('scrape_log')
      .update({
        status,
        output_summary: outputSummary,
        error_message: errorMessage ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', logId);

    if (error) {
      logger.error({ error: error.message, logId }, 'completeScrapeLogEntry: failed');
    }
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), logId },
      'completeScrapeLogEntry: unexpected error',
    );
  }
}
