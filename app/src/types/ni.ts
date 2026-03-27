/**
 * Network Intelligence — Frontend types
 */

export interface CsvUploadSummary {
  totalRows: number;
  validRows: number;
  skippedRows: number;
  duplicatesRemoved: number;
  uniqueCompanies: number;
  errors: Array<{ row: number; message: string }>;
}

export interface ConnectionItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  companyRaw: string;
  companyNormalized: string | null;
  position: string | null;
  connectedOn: string | null;
}

export interface CompanySummary {
  companyRaw: string;
  companyDisplayName: string | null;
  companyId: string | null;
  connectionCount: number;
  topPositions: string[];
}

export interface TargetTitle {
  id: string;
  title: string;
  priority: number;
  createdAt: string;
}

export interface BonusCompanySearchItem {
  companyId: string;
  companyName: string;
  domain: string | null;
  headquarters: string | null;
  industry: string | null;
  bonusDisplay: string | null;
  bonusCurrency: string | null;
  bonusAmountMin: number | null;
  bonusAmountMax: number | null;
  confidence: 'high' | 'medium' | 'low' | null;
  programUrl: string | null;
}

export type JobMatchSearchContext = 'network_connections' | 'bonus_search';

export type JobMatchStatus = 'new' | 'applied' | 'referred' | 'interviewing' | 'rejected' | 'archived';

export interface JobMatch {
  id: string;
  companyId: string;
  title: string;
  url: string | null;
  location: string | null;
  salaryRange: string | null;
  descriptionSnippet: string | null;
  matchScore: number | null;
  referralAvailable: boolean;
  connectionCount: number;
  searchContext: JobMatchSearchContext | null;
  status: JobMatchStatus;
  scrapedAt: string | null;
  createdAt: string;
}
