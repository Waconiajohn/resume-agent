/**
 * Company Name Normalization — 4-step cascade
 *
 * 1. Rule-based cleaning (strip suffixes, collapse whitespace)
 * 2. Exact match against company_directory
 * 3. Fuzzy match against company_directory name_variants
 * 4. LLM batch matching for remaining unknowns
 *
 * After resolution, creates new company_directory entries for unknowns
 * and updates client_connections.company_id for resolved names.
 */

import { supabaseAdmin } from '../supabase.js';
import { llm, getModelForTier } from '../llm.js';
import { repairJSON } from '../json-repair.js';
import logger from '../logger.js';
import type {
  NormalizationResult,
  NormalizationBatchResult,
  CompanyDirectoryRow,
} from './types.js';

// ─── Step 1: Rule-based cleaning ──────────────────────────────────────────────

const SUFFIX_PATTERN = /\s*[,.]?\s*\b(Inc|LLC|Ltd|Corp|Co|PLC|GmbH|SA|BV|Pty|Limited|Incorporated|Corporation|Company)\.?\s*$/i;

/**
 * Strip common corporate suffixes and normalize whitespace.
 */
export function normalizeCompanyName(raw: string): string {
  if (!raw) return '';
  let cleaned = raw.trim();
  // Iteratively strip suffixes (handles "Acme Inc. LLC")
  let prev = '';
  while (prev !== cleaned) {
    prev = cleaned;
    cleaned = cleaned.replace(SUFFIX_PATTERN, '').trim();
  }
  // Collapse whitespace
  cleaned = cleaned.replace(/\s+/g, ' ');
  return cleaned;
}

// ─── Step 2: Exact match ──────────────────────────────────────────────────────

/**
 * Look up normalized names in company_directory by exact match on name_normalized.
 */
export async function matchExact(
  names: string[],
): Promise<Map<string, CompanyDirectoryRow>> {
  const result = new Map<string, CompanyDirectoryRow>();
  if (names.length === 0) return result;

  try {
    const { data, error } = await supabaseAdmin
      .from('company_directory')
      .select('*')
      .in('name_normalized', names.map((n) => n.toLowerCase()));

    if (error) {
      logger.error({ error: error.message }, 'matchExact: query failed');
      return result;
    }

    for (const row of (data ?? []) as CompanyDirectoryRow[]) {
      result.set(row.name_normalized, row);
    }
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      'matchExact: unexpected error',
    );
  }

  return result;
}

// ─── Step 3: Fuzzy match (variant array) ──────────────────────────────────────

/**
 * Look up names in company_directory by checking name_variants array overlap.
 * Uses the GIN index on name_variants for efficient lookup.
 */
export async function matchFuzzy(
  names: string[],
): Promise<Map<string, CompanyDirectoryRow>> {
  const result = new Map<string, CompanyDirectoryRow>();
  if (names.length === 0) return result;

  try {
    const lowerNames = names.map((n) => n.toLowerCase());
    const { data, error } = await supabaseAdmin
      .from('company_directory')
      .select('*')
      .overlaps('name_variants', lowerNames);

    if (error) {
      logger.error({ error: error.message }, 'matchFuzzy: query failed');
      return result;
    }

    // Map each input name to the company row whose variants include it
    for (const row of (data ?? []) as CompanyDirectoryRow[]) {
      const lowerVariants = row.name_variants.map((v) => v.toLowerCase());
      for (const name of lowerNames) {
        if (lowerVariants.includes(name)) {
          result.set(name, row);
        }
      }
    }
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      'matchFuzzy: unexpected error',
    );
  }

  return result;
}

// ─── Step 4: LLM batch matching ───────────────────────────────────────────────

const LLM_BATCH_SIZE = 50;

/**
 * Use the LLM to match unknown company names against known companies.
 * Returns a map of rawName → canonicalName for names that matched.
 * Names that don't match any known company return null (they're truly new).
 */
export async function matchViaLlm(
  unknownNames: string[],
  knownCompanies: string[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (unknownNames.length === 0) return result;

  const model = getModelForTier('light');

  for (let i = 0; i < unknownNames.length; i += LLM_BATCH_SIZE) {
    const batch = unknownNames.slice(i, i + LLM_BATCH_SIZE);

    try {
      const response = await llm.chat({
        model,
        system: `You are a company name matcher. Given a list of company names and a list of known canonical company names, match each unknown name to its canonical form if it's the same company (just a different spelling, abbreviation, or variant). Return a JSON object where keys are the unknown names and values are the matching canonical name or null if no match exists. Only return the JSON object, nothing else.`,
        messages: [
          {
            role: 'user',
            content: `Unknown company names:\n${JSON.stringify(batch)}\n\nKnown canonical names:\n${JSON.stringify(knownCompanies.slice(0, 200))}`,
          },
        ],
        max_tokens: 4096,
      });

      const parsed = repairJSON<Record<string, string | null>>(response.text);
      if (parsed && typeof parsed === 'object') {
        for (const [key, value] of Object.entries(parsed)) {
          result.set(key, typeof value === 'string' ? value : null);
        }
      } else {
        // If JSON parsing fails, mark all as unmatched
        for (const name of batch) {
          result.set(name, null);
        }
      }
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), batchStart: i },
        'matchViaLlm: LLM call failed, marking batch as unmatched',
      );
      for (const name of batch) {
        result.set(name, null);
      }
    }
  }

  return result;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Normalize a batch of raw company names through the 4-step cascade:
 * rule-based → exact match → fuzzy match → LLM → create new entries.
 *
 * Also updates client_connections.company_id for resolved names.
 */
export async function normalizeCompanyBatch(
  userId: string,
  rawNames: string[],
): Promise<NormalizationBatchResult> {
  const results: NormalizationResult[] = [];
  let newCompaniesCreated = 0;
  let cacheHits = 0;
  let llmCallsMade = 0;

  if (rawNames.length === 0) {
    return { results, newCompaniesCreated, cacheHits, llmCallsMade };
  }

  // Step 1: Rule-based normalization
  const cleanedMap = new Map<string, string>(); // rawName → cleanedName
  for (const raw of rawNames) {
    cleanedMap.set(raw, normalizeCompanyName(raw));
  }

  const uniqueCleaned = [...new Set(cleanedMap.values())].filter(Boolean);

  // Step 2: Exact match
  const exactMatches = await matchExact(uniqueCleaned);
  const unmatched: string[] = [];

  for (const cleaned of uniqueCleaned) {
    const match = exactMatches.get(cleaned.toLowerCase());
    if (match) {
      cacheHits++;
      results.push({
        rawName: cleaned,
        normalizedName: match.name_display,
        companyId: match.id,
        matchMethod: 'exact',
      });
    } else {
      unmatched.push(cleaned);
    }
  }

  // Step 3: Fuzzy match on remaining
  if (unmatched.length > 0) {
    const fuzzyMatches = await matchFuzzy(unmatched);
    const stillUnmatched: string[] = [];

    for (const name of unmatched) {
      const match = fuzzyMatches.get(name.toLowerCase());
      if (match) {
        cacheHits++;
        results.push({
          rawName: name,
          normalizedName: match.name_display,
          companyId: match.id,
          matchMethod: 'fuzzy',
        });
      } else {
        stillUnmatched.push(name);
      }
    }

    // Step 4: LLM batch for remaining unknowns
    if (stillUnmatched.length > 0) {
      // Get known company names for LLM context
      const knownNames = [...exactMatches.values(), ...fuzzyMatches.values()]
        .map((r) => r.name_display);

      // Also fetch some existing companies for better matching
      try {
        const { data: existingCompanies } = await supabaseAdmin
          .from('company_directory')
          .select('name_display')
          .limit(200);

        if (existingCompanies) {
          for (const row of existingCompanies as Array<{ name_display: string }>) {
            if (!knownNames.includes(row.name_display)) {
              knownNames.push(row.name_display);
            }
          }
        }
      } catch {
        // Non-fatal — proceed with what we have
      }

      llmCallsMade = Math.ceil(stillUnmatched.length / LLM_BATCH_SIZE);
      const llmMatches = await matchViaLlm(stillUnmatched, knownNames);

      for (const name of stillUnmatched) {
        const canonicalName = llmMatches.get(name);
        if (canonicalName) {
          // LLM matched to a known company — find its ID
          const knownRow = [...exactMatches.values(), ...fuzzyMatches.values()]
            .find((r) => r.name_display.toLowerCase() === canonicalName.toLowerCase());

          if (knownRow) {
            results.push({
              rawName: name,
              normalizedName: knownRow.name_display,
              companyId: knownRow.id,
              matchMethod: 'llm',
            });
            continue;
          }
        }

        // Truly new company — create entry
        const newId = await createCompanyEntry(name);
        if (newId) {
          newCompaniesCreated++;
          results.push({
            rawName: name,
            normalizedName: name,
            companyId: newId,
            matchMethod: 'new',
          });
        } else {
          results.push({
            rawName: name,
            normalizedName: name,
            companyId: null,
            matchMethod: 'new',
          });
        }
      }
    }
  }

  // Update client_connections.company_id for resolved names
  await updateConnectionCompanyIds(userId, results, cleanedMap);

  return { results, newCompaniesCreated, cacheHits, llmCallsMade };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createCompanyEntry(name: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('company_directory')
      .insert({
        name_normalized: name.toLowerCase(),
        name_display: name,
        name_variants: [name.toLowerCase()],
      })
      .select('id')
      .single();

    if (error) {
      // Unique constraint violation = already exists (race condition)
      if (error.code === '23505') {
        const { data: existing } = await supabaseAdmin
          .from('company_directory')
          .select('id')
          .eq('name_normalized', name.toLowerCase())
          .single();
        return (existing as { id: string } | null)?.id ?? null;
      }
      logger.error({ error: error.message, name }, 'createCompanyEntry: insert failed');
      return null;
    }

    return (data as { id: string }).id;
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), name },
      'createCompanyEntry: unexpected error',
    );
    return null;
  }
}

async function updateConnectionCompanyIds(
  userId: string,
  results: NormalizationResult[],
  cleanedMap: Map<string, string>,
): Promise<void> {
  // Build reverse map: cleanedName → companyId
  const nameToId = new Map<string, string>();
  for (const r of results) {
    if (r.companyId) {
      nameToId.set(r.rawName.toLowerCase(), r.companyId);
    }
  }

  // Build rawCompanyName → companyId map
  const rawToId = new Map<string, string>();
  for (const [raw, cleaned] of cleanedMap) {
    const companyId = nameToId.get(cleaned.toLowerCase());
    if (companyId) {
      rawToId.set(raw, companyId);
    }
  }

  // Batch update connections
  for (const [companyRaw, companyId] of rawToId) {
    try {
      await supabaseAdmin
        .from('client_connections')
        .update({ company_id: companyId })
        .eq('user_id', userId)
        .eq('company_raw', companyRaw);
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), companyRaw },
        'updateConnectionCompanyIds: update failed for company',
      );
    }
  }
}
