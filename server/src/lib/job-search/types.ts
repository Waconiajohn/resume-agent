/**
 * Job Search Types — shared interfaces for job search adapters and results.
 *
 * All adapters implement SearchAdapter and return JobResult[].
 * searchAllSources() in index.ts fans out to all registered adapters.
 */

export interface SearchFilters {
  datePosted: '24h' | '3d' | '7d' | '14d' | '30d' | 'any';
  remoteType?: 'remote' | 'hybrid' | 'onsite' | 'any';
  employmentType?: 'full-time' | 'contract' | 'freelance' | 'any';
  salaryMin?: number;
  salaryMax?: number;
}

export interface JobResult {
  /** Stable source-prefixed unique ID for deduping and persistence */
  external_id: string;
  title: string;
  company: string;
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  description: string | null;
  posted_date: string | null;
  apply_url: string | null;
  source: string;
  remote_type: string | null;
  employment_type: string | null;
  required_skills: string[] | null;
}

export interface SearchAdapter {
  name: string;
  /**
   * Most legacy web-search adapters do better with a single title extracted
   * from boolean strings. Structured providers can opt into the full query.
   */
  queryMode?: 'primary' | 'raw';
  search(query: string, location: string, filters: SearchFilters): Promise<JobResult[]>;
  getDiagnostics?(): SearchProviderDiagnostic[];
}

export interface SearchProviderDiagnostic {
  provider: string;
  status: 'ok' | 'missing_key' | 'http_error' | 'network_error' | 'error';
  message: string;
  jobs_returned?: number;
  http_status?: number;
}

export interface SearchFilterStats {
  raw_returned: number;
  filtered_by_work_mode: number;
  filtered_by_freshness: number;
  deduped: number;
  adapter_failures: number;
  provider_diagnostics?: SearchProviderDiagnostic[];
}

export interface SearchResponse {
  jobs: JobResult[];
  executionTimeMs: number;
  sources_queried: string[];
  empty_reason?: string;
  filter_stats?: SearchFilterStats;
}
