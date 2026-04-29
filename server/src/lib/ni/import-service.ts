/**
 * NI Import Service — pipeline logic extracted from routes/ni.ts
 *
 * Provides two pipeline functions:
 *  - runCsvImportPipeline: parses CSV, persists connections, fires background normalization
 *  - runCareerScrape: fetches company records and checks public job pages in background
 */

import { parseCsv } from './csv-parser.js';
import {
  deleteConnectionsByUser,
  insertConnections,
  createScrapeLogEntry,
  completeScrapeLogEntry,
  updateScrapeLogProgress,
} from './connections-store.js';
import { normalizeCompanyBatch } from './company-normalizer.js';
import { runBulkEnrichment } from './ats-enrichment.js';
import { scrapeCareerPages } from './career-scraper.js';
import { supabaseAdmin } from '../supabase.js';
import logger from '../logger.js';
import type { CsvParseResult, CsvUploadResponse, NiSearchContext, NiScrapeFilters } from './types.js';

// ─── CSV Import Pipeline ──────────────────────────────────────────────────────

/**
 * Parse a LinkedIn CSV export, replace the user's existing connections,
 * complete the import log entry, and fire background company normalization.
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

    // Fire-and-forget: normalize company names, then enrich ATS slugs.
    // Enrichment runs after normalization so company_directory records exist.
    const uniqueCompanyNames = [...new Set(result.connections.map((c) => c.companyRaw))];
    void normalizeCompanyBatch(userId, uniqueCompanyNames)
      .then(() => runBulkEnrichment(userId))
      .catch((bgErr: unknown) => {
        logger.error(
          { error: bgErr instanceof Error ? bgErr.message : String(bgErr), userId },
          'Background normalization or ATS enrichment failed',
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

// ─── Public Company Job Discovery Pipeline ────────────────────────────────────

/**
 * Fetch company records from the database then check their public job pages.
 * Uses a public-source strategy: supported ATS endpoints -> Serper fallback.
 * Results are stored in job_matches and reflected in the discovery log.
 *
 * This is designed to be called as a background task. The caller (route handler)
 * should fire-and-forget: `void runCareerScrape(userId, logId, companyIds, targetTitles)`.
 * Errors are caught internally and reflected in the discovery log rather than thrown.
 */
export async function runCareerScrape(
  userId: string,
  scrapeLogId: string,
  companyIds: string[],
  targetTitles: string[],
  searchContext: NiSearchContext = 'network_connections',
  filters?: NiScrapeFilters,
): Promise<void> {
  try {
    const { data: companies, error } = await supabaseAdmin
      .from('company_directory')
      .select('id, name_display, domain, ats_platform, ats_slug')
      .in('id', companyIds);

    if (error || !companies) {
      await completeScrapeLogEntry(scrapeLogId, 'failed', {}, 'Failed to fetch company records');
      return;
    }

    const companyInfos = companies.map(
      (row: { id: string; name_display: string; domain: string | null; ats_platform: string | null; ats_slug: string | null }) => ({
        id: row.id,
        name: row.name_display,
        domain: row.domain,
        ats_platform: row.ats_platform as import('./types.js').ATSPlatform | null,
        ats_slug: row.ats_slug,
      }),
    );

    const result = await scrapeCareerPages(
      companyInfos,
      targetTitles,
      userId,
      searchContext,
      (progress) => updateScrapeLogProgress(scrapeLogId, progress),
      filters,
    );

    await completeScrapeLogEntry(scrapeLogId, 'completed', {
      companies_scanned: result.companiesScanned,
      raw_jobs_found: result.rawJobsFound ?? result.jobsFound,
      jobs_found: result.jobsFound,
      matching_jobs: result.matchingJobs,
      referral_available: result.referralAvailable,
      error_count: result.errors.length,
      source_breakdown: result.sourceBreakdown,
      serper_configured: Boolean(process.env.SERPER_API_KEY),
      filters: filters ?? null,
    });

    logger.info({ userId, scrapeLogId, ...result }, 'company-job-discovery: completed');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ error: msg, userId, scrapeLogId }, 'company-job-discovery: failed');
    await completeScrapeLogEntry(scrapeLogId, 'failed', {}, msg);
  }
}
