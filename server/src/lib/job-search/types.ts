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
  /** Source-prefixed unique ID, e.g. "firecrawl_1234567890_0" */
  external_id: string;
  title: string;
  company: string;
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  description: string | null;
  posted_date: string;
  apply_url: string | null;
  source: string;
  remote_type: string | null;
  employment_type: string | null;
  required_skills: string[] | null;
}

export interface SearchAdapter {
  name: string;
  search(query: string, location: string, filters: SearchFilters): Promise<JobResult[]>;
}

export interface SearchResponse {
  jobs: JobResult[];
  executionTimeMs: number;
  sources_queried: string[];
}
