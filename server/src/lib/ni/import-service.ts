/**
 * NI Import Service — pipeline logic extracted from routes/ni.ts
 *
 * Provides two pipeline functions:
 *  - runCsvImportPipeline: parses CSV, persists connections, fires background normalization
 *  - runCareerScrape: fetches company records and scrapes career pages in background
 */

import { parseCsv } from './csv-parser.js';
import {
  deleteConnectionsByUser,
  insertConnections,
  createScrapeLogEntry,
  completeScrapeLogEntry,
} from './connections-store.js';
import { normalizeCompanyBatch } from './company-normalizer.js';
import { scrapeCareerPages } from './career-scraper.js';
import { supabaseAdmin } from '../supabase.js';
import logger from '../logger.js';
import type { CsvParseResult, CsvUploadResponse, NiSearchContext } from './types.js';

// ─── CSV Import Pipeline ──────────────────────────────────────────────────────

/**
 * Parse a LinkedIn CSV export, replace the user's existing connections,
 * complete the scrape log entry, and fire background company normalization.
 *
 * Returns a CsvUploadResponse describing the outcome. On parse failure
 * (zero valid rows) the response has success=false and no DB writes are made.
 */
export async function runCsvImportPipeline(
  userId: string,
  csvText: string,
  fileName?: string,
): Promise<CsvUploadResponse> {
  const result: CsvParseResult = parseCsv(csvText);

  if (result.connections.length === 0) {
    return {
      success: false,
      totalRows: result.totalRows,
      validRows: 0,
      skippedRows: result.skippedRows,
      duplicatesRemoved: result.duplicatesRemoved,
      uniqueCompanies: 0,
      errors: result.errors,
    };
  }

  const logId = await createScrapeLogEntry(userId, 'csv_import', {
    file_name: fileName ?? 'unknown',
    total_rows: result.totalRows,
    valid_rows: result.validRows,
  });

  try {
    // Wipe previous upload, then insert new connections
    await deleteConnectionsByUser(userId);
    const batchId = fileName ?? new Date().toISOString();
    const inserted = await insertConnections(userId, result.connections, batchId);

    if (logId) {
      await completeScrapeLogEntry(logId, 'completed', {
        inserted,
        unique_companies: result.uniqueCompanies,
        duplicates_removed: result.duplicatesRemoved,
      });
    }

    logger.info(
      { userId, inserted, uniqueCompanies: result.uniqueCompanies },
      'CSV import completed',
    );

    // Fire-and-forget: normalize company names in background
    const uniqueCompanyNames = [...new Set(result.connections.map((c) => c.companyRaw))];
    void normalizeCompanyBatch(userId, uniqueCompanyNames).catch((normErr) => {
      logger.error(
        { error: normErr instanceof Error ? normErr.message : String(normErr), userId },
        'Background company normalization failed',
      );
    });

    return {
      success: true,
      totalRows: result.totalRows,
      validRows: result.validRows,
      skippedRows: result.skippedRows,
      duplicatesRemoved: result.duplicatesRemoved,
      uniqueCompanies: result.uniqueCompanies,
      errors: result.errors,
    };
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), userId },
      'CSV import failed',
    );

    if (logId) {
      await completeScrapeLogEntry(
        logId,
        'failed',
        {},
        err instanceof Error ? err.message : 'Unknown error',
      );
    }

    throw err;
  }
}

// ─── Career Scrape Pipeline ───────────────────────────────────────────────────

/**
 * Fetch company records from the database then scrape their career pages.
 * Updates the scrape log entry on completion or failure.
 *
 * When useApiFallback=true (default), companies that return zero regex results
 * will be retried via Firecrawl search.
 *
 * This is designed to be called as a background task. The caller (route handler)
 * should fire-and-forget: `void runCareerScrape(userId, logId, companyIds, targetTitles)`.
 * Errors are caught internally and reflected in the scrape log rather than thrown.
 */
export async function runCareerScrape(
  userId: string,
  scrapeLogId: string,
  companyIds: string[],
  targetTitles: string[],
  useApiFallback = true,
  searchContext: NiSearchContext = 'network_connections',
): Promise<void> {
  try {
    const { data: companies, error } = await supabaseAdmin
      .from('company_directory')
      .select('id, name_display, domain')
      .in('id', companyIds);

    if (error || !companies) {
      await completeScrapeLogEntry(scrapeLogId, 'failed', {}, 'Failed to fetch company records');
      return;
    }

    const companyInfos = companies.map(
      (row: { id: string; name_display: string; domain: string | null }) => ({
        id: row.id,
        name: row.name_display,
        domain: row.domain,
      }),
    );

    const result = await scrapeCareerPages(companyInfos, targetTitles, userId, useApiFallback, searchContext);

    await completeScrapeLogEntry(scrapeLogId, 'completed', {
      companies_scanned: result.companiesScanned,
      jobs_found: result.jobsFound,
      matching_jobs: result.matchingJobs,
      referral_available: result.referralAvailable,
      error_count: result.errors.length,
      source_breakdown: result.sourceBreakdown,
    });

    logger.info({ userId, scrapeLogId, ...result }, 'career-scraper: scrape completed');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ error: msg, userId, scrapeLogId }, 'career-scraper: scrape failed');
    await completeScrapeLogEntry(scrapeLogId, 'failed', {}, msg);
  }
}
