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

interface ProviderCheckConfig {
  name: string;
  query: string;
  location: string;
  remoteType: RemoteType;
  datePosted: DatePosted;
  insiderCompanyName: string;
  insiderCompanyDomain: string;
  insiderLocation: string;
  insiderRemoteType: RemoteType;
  insiderDatePosted: DatePosted;
  insiderTitles: string[];
}

const PERSONA_CHECKS: ProviderCheckConfig[] = [
  {
    name: 'vp_ops_manufacturing_to_coo',
    query: 'COO manufacturing',
    location: '',
    remoteType: 'any',
    datePosted: '30d',
    insiderCompanyName: 'GE',
    insiderCompanyDomain: 'ge.com',
    insiderLocation: '',
    insiderRemoteType: 'any',
    insiderDatePosted: '30d',
    insiderTitles: ['COO', 'VP Operations', 'Manufacturing Operations'],
  },
  {
    name: 'product_owner_to_director_product',
    query: 'Director of Product',
    location: '',
    remoteType: 'remote',
    datePosted: '30d',
    insiderCompanyName: 'Salesforce',
    insiderCompanyDomain: 'salesforce.com',
    insiderLocation: '',
    insiderRemoteType: 'any',
    insiderDatePosted: '30d',
    insiderTitles: ['Director of Product', 'Product Owner'],
  },
  {
    name: 'saas_ops_to_cloud_operations',
    query: 'Cloud Operations Manager',
    location: '',
    remoteType: 'remote',
    datePosted: '30d',
    insiderCompanyName: 'ADT',
    insiderCompanyDomain: 'adt.com',
    insiderLocation: '',
    insiderRemoteType: 'any',
    insiderDatePosted: '30d',
    insiderTitles: ['Cloud Operations Manager', 'SaaS Operations', 'Technical Support Manager'],
  },
];

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

function envCheckConfig(): ProviderCheckConfig {
  const query = envString('JOB_PROVIDER_CHECK_QUERY', 'Cloud Operations Manager');
  const location = envString('JOB_PROVIDER_CHECK_LOCATION', '');
  const remoteType = envRemoteType('JOB_PROVIDER_CHECK_REMOTE_TYPE', 'remote');
  const datePosted = envDatePosted('JOB_PROVIDER_CHECK_DATE_POSTED', '30d');
  return {
    name: 'default',
    query,
    location,
    remoteType,
    datePosted,
    insiderCompanyName: envString('JOB_PROVIDER_CHECK_INSIDER_COMPANY', 'Starbucks'),
    insiderCompanyDomain: envString('JOB_PROVIDER_CHECK_INSIDER_DOMAIN', 'starbucks.com'),
    insiderLocation: envString('JOB_PROVIDER_CHECK_INSIDER_LOCATION', location),
    insiderRemoteType: envRemoteType('JOB_PROVIDER_CHECK_INSIDER_REMOTE_TYPE', 'any'),
    insiderDatePosted: envDatePosted('JOB_PROVIDER_CHECK_INSIDER_DATE_POSTED', datePosted),
    insiderTitles: envStringList('JOB_PROVIDER_CHECK_INSIDER_TITLES', ['Barista']),
  };
}

async function runCheck(config: ProviderCheckConfig) {
  const adapter = new SerpApiGoogleJobsAdapter();
  const broadResult = await searchAllSources(
    config.query,
    config.location,
    { datePosted: config.datePosted, remoteType: config.remoteType },
    [adapter],
  );
  const broadJobs = broadResult.jobs;
  const diagnostics = broadResult.filter_stats?.provider_diagnostics ?? adapter.getDiagnostics();
  const insiderCompany: CompanyInfo = {
    id: 'provider-check-company',
    name: config.insiderCompanyName,
    domain: config.insiderCompanyDomain,
    ats_platform: null,
    ats_slug: null,
  };
  const insiderJobs = await searchCompanyJobsViaSerpApi(
    insiderCompany,
    config.insiderTitles,
    {
      location: config.insiderLocation,
      remote_only: config.insiderRemoteType === 'remote',
      work_modes: workModesForRemoteType(config.insiderRemoteType),
      max_days_old: daysForDatePosted(config.insiderDatePosted),
    },
  );
  const broadApplyUrlCount = broadJobs.filter((job) => Boolean(job.apply_url)).length;
  const insiderApplyUrlCount = insiderJobs.filter((job) => Boolean(job.url)).length;

  const checks = [
    {
      name: 'broad_search',
      ok: broadJobs.length > 0 && broadApplyUrlCount > 0,
      query: config.query,
      location: config.location || null,
      filters: { datePosted: config.datePosted, remoteType: config.remoteType },
      returned: broadJobs.length,
      apply_url_count: broadApplyUrlCount,
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
      ok: insiderJobs.length > 0 && insiderApplyUrlCount > 0,
      company: config.insiderCompanyName,
      domain: config.insiderCompanyDomain,
      target_titles: config.insiderTitles,
      location: config.insiderLocation || null,
      filters: { datePosted: config.insiderDatePosted, remoteType: config.insiderRemoteType },
      returned: insiderJobs.length,
      apply_url_count: insiderApplyUrlCount,
      samples: insiderJobs.slice(0, 5).map((job) => ({
        title: job.title,
        location: job.location,
        posted_on: job.postedOn,
        source: job.source,
        has_apply_url: Boolean(job.url),
      })),
    },
  ];

  return {
    name: config.name,
    ok: checks.every((check) => check.ok),
    checks,
    missingKey: diagnostics.some((diagnostic) => diagnostic.status === 'missing_key'),
  };
}

async function main() {
  const runPersonaMatrix =
    process.argv.includes('--personas')
    || process.env.JOB_PROVIDER_CHECK_PERSONAS === '1'
    || process.env.JOB_PROVIDER_CHECK_PERSONAS === 'true';

  const results = [];
  const configs = runPersonaMatrix ? PERSONA_CHECKS : [envCheckConfig()];
  for (const config of configs) {
    results.push(await runCheck(config));
  }

  const payload = {
    ok: results.every((result) => result.ok),
    provider: 'serpapi_google_jobs',
    mode: runPersonaMatrix ? 'persona_matrix' : 'single',
    results,
  };

  if (!payload.ok) {
    console.error(JSON.stringify(payload, null, 2));
    process.exit(results.some((result) => result.missingKey) ? 2 : 1);
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
