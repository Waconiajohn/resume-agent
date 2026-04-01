/**
 * Network Intelligence — TypeScript types
 *
 * All server-side interfaces for CSV parsing, company normalization,
 * and database row types for the 6 NI tables.
 */

// ─── CSV Parsing ──────────────────────────────────────────────────────────────

export interface ParsedConnection {
  firstName: string;
  lastName: string;
  email: string | null;
  companyRaw: string;
  position: string | null;
  connectedOn: Date | null;
}

export interface CsvParseError {
  row: number;
  message: string;
}

export interface CsvParseResult {
  connections: ParsedConnection[];
  totalRows: number;
  validRows: number;
  skippedRows: number;
  duplicatesRemoved: number;
  uniqueCompanies: number;
  errors: CsvParseError[];
}

// ─── Company Normalization ────────────────────────────────────────────────────

export interface NormalizationResult {
  rawName: string;
  normalizedName: string;
  companyId: string | null;
  matchMethod: 'exact' | 'fuzzy' | 'llm' | 'new';
}

export interface NormalizationBatchResult {
  results: NormalizationResult[];
  newCompaniesCreated: number;
  cacheHits: number;
  llmCallsMade: number;
}

// ─── API Response ─────────────────────────────────────────────────────────────

export interface CsvUploadResponse {
  success: boolean;
  totalRows: number;
  validRows: number;
  skippedRows: number;
  duplicatesRemoved: number;
  uniqueCompanies: number;
  errors: CsvParseError[];
}

// ─── Database Row Types ───────────────────────────────────────────────────────

export type ATSPlatform = 'greenhouse' | 'lever' | 'workday' | 'ashby' | 'icims';

export interface CompanyDirectoryRow {
  id: string;
  name_normalized: string;
  name_display: string;
  name_variants: string[];
  domain: string | null;
  industry: string | null;
  employee_count: string | null;
  headquarters: string | null;
  description: string | null;
  ats_platform: ATSPlatform | null;
  ats_slug: string | null;
  ats_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ReferralBonusProgramRow {
  id: string;
  company_id: string;
  bonus_amount: string | null;
  bonus_currency: string | null;
  bonus_entry: string | null;
  bonus_mid: string | null;
  bonus_senior: string | null;
  bonus_executive: string | null;
  payout_structure: string | null;
  diversity_multiplier: string | null;
  special_programs: Record<string, unknown> | null;
  confidence: 'high' | 'medium' | 'low' | null;
  data_source: string | null;
  last_verified_at: string | null;
  program_url: string | null;
  notes: string | null;
  verified_at: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientConnectionRow {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  company_raw: string;
  company_id: string | null;
  position: string | null;
  connected_on: string | null;
  import_batch: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EnrichedConnectionRow extends ClientConnectionRow {
  company_display_name: string | null;
}

export interface CompanySummaryRow {
  companyRaw: string;
  companyDisplayName: string | null;
  companyId: string | null;
  connectionCount: number;
  topPositions: string[];
}

export interface ClientTargetTitleRow {
  id: string;
  user_id: string;
  title: string;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface JobMatchRow {
  id: string;
  user_id: string;
  company_id: string;
  title: string;
  url: string | null;
  location: string | null;
  salary_range: string | null;
  description_snippet: string | null;
  match_score: number | null;
  referral_available: boolean;
  connection_count: number;
  status: 'new' | 'applied' | 'referred' | 'interviewing' | 'rejected' | 'archived';
  scraped_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type NiSearchContext = 'network_connections' | 'bonus_search';

export interface ScrapeLogRow {
  id: string;
  user_id: string;
  operation: 'csv_import' | 'job_scrape' | 'company_enrich' | 'normalization';
  status: 'pending' | 'running' | 'completed' | 'failed';
  input_summary: Record<string, unknown>;
  output_summary: Record<string, unknown>;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

// ─── Boolean Search ───────────────────────────────────────────────────────────

export interface BooleanSearchResult {
  linkedin: string;
  indeed: string;
  google: string;
  recommendedTitles: string[];
  extractedTerms: {
    skills: string[];
    titles: string[];
    industries: string[];
  };
  generatedAt: string;
}

// ─── Referral Cross-Reference ─────────────────────────────────────────────────

export interface ReferralOpportunity {
  job_match_id: string;
  job_title: string;
  job_url: string | null;
  job_location: string | null;
  match_score: number | null;
  company_id: string;
  company_name: string;
  bonus_amount: string | null;
  bonus_currency: string | null;
  program_url: string | null;
  connections: { first_name: string; last_name: string; position: string | null }[];
  connection_count: number;
}

export interface BonusCompanySearchResult {
  company_id: string;
  company_name: string;
  domain: string | null;
  headquarters: string | null;
  industry: string | null;
  bonus_display: string | null;
  bonus_currency: string | null;
  bonus_amount_min: number | null;
  bonus_amount_max: number | null;
  confidence: 'high' | 'medium' | 'low' | null;
  program_url: string | null;
}

// ─── Career Page Scraper ──────────────────────────────────────────────────────

export interface CompanyInfo {
  id: string;
  name: string;
  domain: string | null;
  ats_platform?: ATSPlatform | null;
  ats_slug?: string | null;
}

export type ScrapeSource = 'lever' | 'greenhouse' | 'workday' | 'ashby' | 'icims' | 'serper';

export interface ATSJob {
  title: string;
  url: string | null;
  location: string | null;
  salaryRange: string | null;
  descriptionSnippet: string | null;
  source: ScrapeSource;
}

export interface ScrapeResult {
  companiesScanned: number;
  jobsFound: number;
  matchingJobs: number;
  referralAvailable: number;
  errors: { company: string; error: string }[];
  /** Per-company breakdown of which source found jobs. */
  sourceBreakdown: Record<ScrapeSource, number>;
}

/**
 * Career Page Scraper Interface — pluggable scraper for raw URL -> jobs extraction.
 *
 * Tier 3 of the scanning strategy. Not implemented yet — this interface
 * defines the contract so a Firecrawl (or Playwright, or Puppeteer) adapter
 * can be plugged in later without changing the career scraper orchestration.
 */
export interface CareerPageScraper {
  /** Unique identifier for this scraper implementation */
  readonly name: string;

  /**
   * Scrape a company's career page URL and extract job listings.
   * @param careerPageUrl - The URL to scrape (e.g., "https://acme.com/careers")
   * @param targetTitles - Optional title filters to apply during extraction
   * @returns Normalized job listings found on the page
   */
  scrapeCareerPage(
    careerPageUrl: string,
    targetTitles?: string[],
  ): Promise<ATSJob[]>;

  /** Check if this scraper can handle the given URL. */
  canHandle(url: string): boolean;
}
