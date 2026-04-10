/**
 * Serper Google Jobs Adapter — structured job data from all major boards via one API.
 *
 * Calls Serper's /jobs endpoint which aggregates Indeed, LinkedIn, Glassdoor,
 * ZipRecruiter, and others into a single structured response.
 *
 * Auth: X-API-KEY header with SERPER_API_KEY env var.
 * Returns empty array on missing key or any error (graceful degradation).
 */

import { createHash } from 'node:crypto';
import logger from '../../logger.js';
import { classifyWorkMode } from '../work-mode-classifier.js';
import type { SearchAdapter, SearchFilters, JobResult } from '../types.js';

const SERPER_JOBS_URL = 'https://google.serper.dev/jobs';
const REQUEST_TIMEOUT_MS = 15_000;

// ─── Serper response shape ────────────────────────────────────────────────────

interface SerperJob {
  title?: string;
  companyName?: string;
  location?: string;
  source?: string;
  date?: string;
  snippet?: string;
  link?: string;
  extensions?: string[];
}

interface SerperJobsResponse {
  jobs?: SerperJob[];
}

// ─── Freshness filter mapping ─────────────────────────────────────────────────

/**
 * Map our SearchFilters.datePosted values to Google's tbs (time-based search) param.
 * Added as a query parameter on the POST body.
 */
function tbsForDatePosted(
  datePosted: SearchFilters['datePosted'],
): string | null {
  switch (datePosted) {
    case '24h':
      return 'qdr:d';
    case '3d':
      return 'qdr:d3';
    case '7d':
      return 'qdr:w';
    case '14d':
      return 'qdr:d14';
    case '30d':
      return 'qdr:m';
    case 'any':
    default:
      return null;
  }
}

// ─── Date parsing ─────────────────────────────────────────────────────────────

/**
 * Parse Serper's relative date strings ("1 day ago", "3 days ago", etc.)
 * into an ISO 8601 timestamp string. Returns null if unparseable.
 */
function parseRelativeDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const match = dateStr.match(/(\d+)\s*(day|hour|minute|week|month)s?\s*ago/i);
  if (!match) return null;
  const [, num, unit] = match;
  const n = parseInt(num, 10);
  const now = new Date();
  switch ((unit).toLowerCase()) {
    case 'minute':
      return new Date(now.getTime() - n * 60 * 1000);
    case 'hour':
      return new Date(now.getTime() - n * 60 * 60 * 1000);
    case 'day':
      return new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
    case 'week':
      return new Date(now.getTime() - n * 7 * 24 * 60 * 60 * 1000);
    case 'month':
      return new Date(now.getTime() - n * 30 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

// ─── Salary extraction ────────────────────────────────────────────────────────

const SALARY_PATTERN =
  /\$\s*([\d,]+)\s*[kK]?\s*[-–—]\s*\$\s*([\d,]+)\s*[kK]?|\$\s*([\d,]+)\s*[kK]/;

/**
 * Attempt to extract min/max salary values (in whole dollars) from extensions.
 * Handles both "$120K–$180K" range and "$120K" single-value formats.
 */
function extractSalary(
  extensions: string[],
): { salary_min: number | null; salary_max: number | null } {
  for (const ext of extensions) {
    const match = SALARY_PATTERN.exec(ext);
    if (!match) continue;

    const parseValue = (raw: string): number => {
      const cleaned = raw.replace(/,/g, '');
      const n = parseFloat(cleaned);
      // Values < 1000 are assumed to be "K" shorthand
      return n < 1000 ? n * 1000 : n;
    };

    if (match[1] && match[2]) {
      // Range: "$120K–$180K"
      return {
        salary_min: parseValue(match[1]),
        salary_max: parseValue(match[2]),
      };
    }
    if (match[3]) {
      // Single: "$120K"
      const val = parseValue(match[3]);
      return { salary_min: val, salary_max: null };
    }
  }
  return { salary_min: null, salary_max: null };
}

// ─── Employment type extraction ───────────────────────────────────────────────

function extractEmploymentType(extensions: string[]): string | null {
  for (const ext of extensions) {
    const lower = ext.toLowerCase().trim();
    if (lower === 'full-time' || lower === 'full time') return 'full-time';
    if (lower === 'part-time' || lower === 'part time') return 'part-time';
    if (lower === 'contract') return 'contract';
    if (lower === 'internship') return 'internship';
    if (lower === 'temporary') return 'temporary';
  }
  return null;
}

// ─── Stable external ID ───────────────────────────────────────────────────────

function buildStableExternalId(
  title: string,
  company: string,
  link: string | undefined,
): string {
  const identity = [
    (link ?? '').trim().toLowerCase(),
    title.trim().toLowerCase(),
    company.trim().toLowerCase(),
  ].join('|');
  const digest = createHash('sha1').update(identity).digest('hex').slice(0, 16);
  return `serper_${digest}`;
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export class SerperJobsAdapter implements SearchAdapter {
  readonly name = 'serper';

  async search(
    query: string,
    location: string,
    filters: SearchFilters,
  ): Promise<JobResult[]> {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) {
      logger.warn(
        { adapter: this.name },
        'SERPER_API_KEY not set — skipping Serper Jobs adapter',
      );
      return [];
    }

    const requestBody: Record<string, unknown> = {
      q: query,
      gl: 'us',
      num: 20,
    };

    if (location) {
      requestBody.location = location;
    }

    const tbs = tbsForDatePosted(filters.datePosted);
    if (tbs) {
      requestBody.tbs = tbs;
    }

    try {
      const response = await fetch(SERPER_JOBS_URL, {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        logger.warn(
          { adapter: this.name, status: response.status, query },
          'Serper Jobs API returned non-OK status',
        );
        return [];
      }

      const data = (await response.json()) as SerperJobsResponse;
      const jobs = data.jobs ?? [];

      logger.info(
        { adapter: this.name, query, location, jobCount: jobs.length },
        'Serper Jobs adapter returned results',
      );

      return jobs
        .filter((job): job is Required<Pick<SerperJob, 'title'>> & SerperJob =>
          Boolean(job.title),
        )
        .map((job): JobResult => {
          const title = job.title ?? 'Unknown Title';
          const company = job.companyName ?? 'Unknown Company';
          const extensions = job.extensions ?? [];
          const { salary_min, salary_max } = extractSalary(extensions);
          const postedDate = job.date ? parseRelativeDate(job.date) : null;
          const workMode = classifyWorkMode(
            title,
            job.snippet ?? '',
            job.location ?? undefined,
            extensions,
          );

          return {
            external_id: buildStableExternalId(title, company, job.link),
            title,
            company,
            location: job.location ?? null,
            salary_min,
            salary_max,
            description: job.snippet ?? null,
            posted_date: postedDate ? postedDate.toISOString() : null,
            apply_url: job.link ?? null,
            source: job.source ? `serper:${job.source.toLowerCase()}` : this.name,
            remote_type: workMode === 'unknown' ? null : workMode,
            employment_type: extractEmploymentType(extensions),
            required_skills: null,
          };
        });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        { adapter: this.name, error: message, query },
        'Serper Jobs adapter error',
      );
      return [];
    }
  }
}
