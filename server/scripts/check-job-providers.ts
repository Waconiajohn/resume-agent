#!/usr/bin/env tsx
/**
 * Live job-provider smoke check.
 *
 * This intentionally runs one conservative SerpApi Google Jobs query and never
 * prints API keys. It is not part of the default gate because it consumes a
 * live provider request when the query is not served from SerpApi cache.
 */

import { SerpApiGoogleJobsAdapter } from '../src/lib/job-search/adapters/serpapi-google-jobs.js';

function envString(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

async function main() {
  const query = envString('JOB_PROVIDER_CHECK_QUERY', 'Cloud Operations Manager');
  const location = envString('JOB_PROVIDER_CHECK_LOCATION', '');
  const remoteType = envString('JOB_PROVIDER_CHECK_REMOTE_TYPE', 'remote') as 'remote' | 'hybrid' | 'onsite' | 'any';
  const datePosted = envString('JOB_PROVIDER_CHECK_DATE_POSTED', '30d') as '24h' | '3d' | '7d' | '14d' | '30d' | 'any';

  const adapter = new SerpApiGoogleJobsAdapter();
  const jobs = await adapter.search(query, location, { datePosted, remoteType });
  const diagnostics = adapter.getDiagnostics();

  const payload = {
    ok: jobs.length > 0,
    provider: adapter.name,
    query,
    location: location || null,
    filters: { datePosted, remoteType },
    returned: jobs.length,
    diagnostics,
    samples: jobs.slice(0, 5).map((job) => ({
      title: job.title,
      company: job.company,
      location: job.location,
      posted_date: job.posted_date,
      remote_type: job.remote_type,
      source: job.source,
      has_apply_url: Boolean(job.apply_url),
    })),
  };

  const missingKey = diagnostics.some((diagnostic) => diagnostic.status === 'missing_key');
  if (jobs.length === 0) {
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
