/**
 * Shared ATS search targets used by Broad Search and Network Intelligence.
 *
 * Direct ATS clients only exist for a subset of platforms, but public search can
 * still discover job pages hosted on wider ATS/career systems.
 */

export interface ATSSearchTarget {
  label: string;
  domains: string[];
  siteClause: string;
  directClient: boolean;
}

export const ATS_SEARCH_TARGETS: ATSSearchTarget[] = [
  {
    label: 'Greenhouse',
    domains: ['boards.greenhouse.io', 'greenhouse.io'],
    siteClause: 'site:boards.greenhouse.io',
    directClient: true,
  },
  {
    label: 'Lever',
    domains: ['jobs.lever.co', 'lever.co'],
    siteClause: 'site:jobs.lever.co',
    directClient: true,
  },
  {
    label: 'Workday',
    domains: ['myworkdayjobs.com', 'workdayjobs.com', 'workday.com'],
    siteClause: 'site:myworkdayjobs.com',
    directClient: true,
  },
  {
    label: 'Ashby',
    domains: ['jobs.ashbyhq.com', 'ashbyhq.com'],
    siteClause: 'site:jobs.ashbyhq.com',
    directClient: true,
  },
  {
    label: 'iCIMS',
    domains: ['icims.com'],
    siteClause: 'site:icims.com',
    directClient: true,
  },
  {
    label: 'Recruitee',
    domains: ['recruitee.com'],
    siteClause: 'site:recruitee.com',
    directClient: true,
  },
  {
    label: 'Workable',
    domains: ['apply.workable.com', 'workable.com'],
    siteClause: 'site:apply.workable.com',
    directClient: true,
  },
  {
    label: 'Personio',
    domains: ['jobs.personio.de', 'jobs.personio.com', 'personio.de', 'personio.com'],
    siteClause: 'site:jobs.personio.de OR site:jobs.personio.com',
    directClient: true,
  },
  {
    label: 'SmartRecruiters',
    domains: ['jobs.smartrecruiters.com', 'smartrecruiters.com'],
    siteClause: 'site:jobs.smartrecruiters.com',
    directClient: false,
  },
  {
    label: 'BambooHR',
    domains: ['bamboohr.com'],
    siteClause: 'site:bamboohr.com',
    directClient: false,
  },
  {
    label: 'Jobvite',
    domains: ['jobvite.com'],
    siteClause: 'site:jobvite.com',
    directClient: false,
  },
  {
    label: 'Oracle Cloud Recruiting',
    domains: ['oraclecloud.com'],
    siteClause: 'site:oraclecloud.com',
    directClient: false,
  },
  {
    label: 'SAP SuccessFactors',
    domains: ['successfactors.com'],
    siteClause: 'site:successfactors.com',
    directClient: false,
  },
];

export const PUBLIC_ATS_SITE_QUERY = ATS_SEARCH_TARGETS
  .map((target) => target.siteClause)
  .join(' OR ');

export const DIRECT_ATS_SITE_QUERY = ATS_SEARCH_TARGETS
  .filter((target) => target.directClient)
  .map((target) => target.siteClause)
  .join(' OR ');

export const ATS_DOMAINS = ATS_SEARCH_TARGETS.flatMap((target) => target.domains);

export function isKnownATSUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return ATS_DOMAINS.some((domain) => hostname.includes(domain));
  } catch {
    return false;
  }
}
