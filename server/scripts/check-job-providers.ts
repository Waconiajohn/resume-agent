#!/usr/bin/env tsx
/**
 * Live job-provider smoke check.
 *
 * This intentionally runs one conservative SerpApi Google Jobs query and never
 * prints API keys. It is not part of the default gate because it consumes a
 * live provider request when the query is not served from SerpApi cache.
 */

import { SerpApiGoogleJobsAdapter } from '../src/lib/job-search/adapters/serpapi-google-jobs.js';
import { searchAllSources } from '../src/lib/job-search/index.js';
import { searchCompanyJobsViaSerpApi } from '../src/lib/ni/serpapi-job-search.js';
import type { CompanyInfo } from '../src/lib/ni/types.js';
import type { SearchFilters } from '../src/lib/job-search/types.js';

type DatePosted = SearchFilters['datePosted'];
type RemoteType = NonNullable<SearchFilters['remoteType']>;

const VALID_DATE_POSTED = new Set<DatePosted>(['24h', '3d', '7d', '14d', '30d']);
const VALID_REMOTE_TYPES = new Set<RemoteType>(['remote', 'hybrid', 'onsite', 'any']);

function envString(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

function envStringList(name: string, fallback: string[]): string[] {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  const parsed = value.split(',').map((item) => item.trim()).filter(Boolean);
  return parsed.length ? parsed : fallback;
}

function envDatePosted(name: string, fallback: DatePosted): DatePosted {
  const value = process.env[name]?.trim();
  if (value === 'any') return '30d';
  return value && VALID_DATE_POSTED.has(value as DatePosted) ? value as DatePosted : fallback;
}

function envRemoteType(name: string, fallback: RemoteType): RemoteType {
  const value = process.env[name]?.trim();
  return value && VALID_REMOTE_TYPES.has(value as RemoteType) ? value as RemoteType : fallback;
}

function workModesForRemoteType(remoteType: RemoteType) {
  if (remoteType === 'remote' || remoteType === 'hybrid' || remoteType === 'onsite') return [remoteType];
  return [];
}

function daysForDatePosted(datePosted: DatePosted): number {
  if (datePosted === '24h') return 1;
  return Number.parseInt(datePosted, 10);
}

async function main() {
  const query = envString('JOB_PROVIDER_CHECK_QUERY', 'Cloud Operations Manager');
  const location = envString('JOB_PROVIDER_CHECK_LOCATION', '');
  const remoteType = envRemoteType('JOB_PROVIDER_CHECK_REMOTE_TYPE', 'remote');
  const datePosted = envDatePosted('JOB_PROVIDER_CHECK_DATE_POSTED', '30d');
  const insiderCompanyName = envString('JOB_PROVIDER_CHECK_INSIDER_COMPANY', 'Starbucks');
  const insiderCompanyDomain = envString('JOB_PROVIDER_CHECK_INSIDER_DOMAIN', 'starbucks.com');
  const insiderLocation = envString('JOB_PROVIDER_CHECK_INSIDER_LOCATION', location);
  const insiderRemoteType = envRemoteType('JOB_PROVIDER_CHECK_INSIDER_REMOTE_TYPE', 'any');
  const insiderDatePosted = envDatePosted('JOB_PROVIDER_CHECK_INSIDER_DATE_POSTED', datePosted);
  const insiderTitles = envStringList('JOB_PROVIDER_CHECK_INSIDER_TITLES', ['Barista']);

  const adapter = new SerpApiGoogleJobsAdapter();
  const broadResult = await searchAllSources(query, location, { datePosted, remoteType }, [adapter]);
  const broadJobs = broadResult.jobs;
  const diagnostics = broadResult.filter_stats?.provider_diagnostics ?? adapter.getDiagnostics();
  const insiderCompany: CompanyInfo = {
    id: 'provider-check-company',
    name: insiderCompanyName,
    domain: insiderCompanyDomain,
    ats_platform: null,
    ats_slug: null,
  };
  const insiderJobs = await searchCompanyJobsViaSerpApi(
    insiderCompany,
    insiderTitles,
    {
      location: insiderLocation,
      remote_only: insiderRemoteType === 'remote',
      work_modes: workModesForRemoteType(insiderRemoteType),
      max_days_old: daysForDatePosted(insiderDatePosted),
    },
  );

  const checks = [
    {
      name: 'broad_search',
      ok: broadJobs.length > 0,
      query,
      location: location || null,
      filters: { datePosted, remoteType },
      returned: broadJobs.length,
      filter_stats: broadResult.filter_stats,
      empty_reason: broadResult.empty_reason ?? null,
      diagnostics,
      samples: broadJobs.slice(0, 5).map((job) => ({
        title: job.title,
        company: job.company,
        location: job.location,
        posted_date: job.posted_date,
        remote_type: job.remote_type,
        source: job.source,
        has_apply_url: Boolean(job.apply_url),
      })),
    },
    {
      name: 'insider_jobs',
      ok: insiderJobs.length > 0,
      company: insiderCompanyName,
      domain: insiderCompanyDomain,
      target_titles: insiderTitles,
      location: insiderLocation || null,
      filters: { datePosted: insiderDatePosted, remoteType: insiderRemoteType },
      returned: insiderJobs.length,
      samples: insiderJobs.slice(0, 5).map((job) => ({
        title: job.title,
        location: job.location,
        posted_on: job.postedOn,
        source: job.source,
        has_apply_url: Boolean(job.url),
      })),
    },
  ];

  const payload = {
    ok: checks.every((check) => check.ok),
    provider: adapter.name,
    checks,
  };

  const missingKey = diagnostics.some((diagnostic) => diagnostic.status === 'missing_key');
  if (!payload.ok) {
    console.error(JSON.stringify(payload, null, 2));
    process.exit(missingKey ? 2 : 1);
  }

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    provider: 'serpapi_google_jobs',
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
});
