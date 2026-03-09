/**
 * NI Cross-Reference — matches job listings to the user's Network Intelligence contacts.
 *
 * Queries client_connections (the NI table) for the user's contacts and cross-references
 * them against a set of job company names using case-insensitive matching.
 *
 * Returns a Map<external_id, NetworkContact[]> — only jobs that have at least one
 * matching contact are included in the map.
 */

import { supabaseAdmin } from '../supabase.js';
import logger from '../logger.js';

export interface NetworkContact {
  id: string;
  name: string;
  title: string | null;
  company: string;
}

/**
 * Cross-references job results with the user's network intelligence connections.
 * Returns a map of external_id -> contacts at that company.
 *
 * Returns an empty map on any error — this is always a non-blocking enrichment.
 */
export async function crossReferenceWithNetwork(
  userId: string,
  jobs: Array<{ external_id: string; company: string }>,
): Promise<Map<string, NetworkContact[]>> {
  const result = new Map<string, NetworkContact[]>();

  if (jobs.length === 0) return result;

  // Build company -> [external_ids] map using normalized keys
  const companyMap = new Map<string, string[]>(); // normalized company -> external_ids
  for (const job of jobs) {
    const normalized = job.company.toLowerCase().trim();
    if (!normalized) continue;
    const existing = companyMap.get(normalized) ?? [];
    existing.push(job.external_id);
    companyMap.set(normalized, existing);
  }

  if (companyMap.size === 0) return result;

  try {
    // Fetch all connections for this user from the client_connections table.
    // We filter client-side to avoid pushing large IN() arrays to the DB and to
    // support fuzzy/partial name matching in the future.
    const { data: connections, error } = await supabaseAdmin
      .from('client_connections')
      .select('id, first_name, last_name, position, company_raw')
      .eq('user_id', userId);

    if (error) {
      logger.warn({ userId, error: error.message }, 'ni-crossref: query failed');
      return result;
    }

    if (!connections || connections.length === 0) return result;

    // Build company_raw (normalized) -> contacts map
    type ConnectionRow = {
      id: string;
      first_name: string;
      last_name: string;
      position: string | null;
      company_raw: string;
    };

    const contactsByCompany = new Map<string, NetworkContact[]>();
    for (const conn of connections as ConnectionRow[]) {
      const normalized = (conn.company_raw ?? '').toLowerCase().trim();
      if (!normalized) continue;

      const contact: NetworkContact = {
        id: conn.id,
        name: `${conn.first_name} ${conn.last_name}`.trim() || 'Unknown',
        title: conn.position ?? null,
        company: conn.company_raw ?? '',
      };

      const existing = contactsByCompany.get(normalized) ?? [];
      existing.push(contact);
      contactsByCompany.set(normalized, existing);
    }

    // Map contacts back to job external_ids
    for (const [normalizedCompany, externalIds] of companyMap) {
      const contacts = contactsByCompany.get(normalizedCompany);
      if (contacts && contacts.length > 0) {
        for (const extId of externalIds) {
          result.set(extId, contacts);
        }
      }
    }

    logger.info(
      { userId, jobCount: jobs.length, matchedJobs: result.size },
      'ni-crossref: complete',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ userId, error: message }, 'ni-crossref: unexpected error');
  }

  return result;
}
