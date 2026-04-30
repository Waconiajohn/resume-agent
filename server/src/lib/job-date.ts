import type { SearchFilters } from './job-search/types.js';

export const FRESHNESS_DAYS_BY_FILTER = {
  '24h': 1,
  '3d': 3,
  '7d': 7,
  '14d': 14,
  '30d': 30,
} as const;

export type FreshnessFilter = keyof typeof FRESHNESS_DAYS_BY_FILTER;

const DAY_MS = 24 * 60 * 60 * 1000;

export function freshnessDaysForDatePosted(
  datePosted: SearchFilters['datePosted'] | FreshnessFilter | 'any' | undefined,
): number | null {
  if (!datePosted) return FRESHNESS_DAYS_BY_FILTER['7d'];
  if (datePosted === 'any') return FRESHNESS_DAYS_BY_FILTER['30d'];
  return FRESHNESS_DAYS_BY_FILTER[datePosted] ?? FRESHNESS_DAYS_BY_FILTER['7d'];
}

export function googleTbsForFreshnessDays(days: number | null | undefined): string | null {
  if (!days || days <= 0) return null;
  if (days <= 1) return 'qdr:d';
  if (days <= 7) return 'qdr:w';
  if (days <= 30) return 'qdr:m';
  return null;
}

export function normalizeJobPostedDate(value: unknown, now = new Date()): Date | null {
  if (value == null) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value !== 'string') return null;

  const raw = value.trim();
  if (!raw) return null;

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;

  const lower = raw.toLowerCase();
  if (/^(just posted|today|posted today|new)$/i.test(raw)) {
    return new Date(now);
  }
  if (/^(yesterday|posted yesterday)$/i.test(raw)) {
    return new Date(now.getTime() - DAY_MS);
  }

  const relative = lower.match(
    /(?:posted\s*)?(?:about\s*)?(\d+)\s*(minute|hour|day|week|month)s?\s*(?:ago|old)?/,
  );
  if (!relative) return null;

  const amount = Number(relative[1]);
  const unit = relative[2];
  if (!Number.isFinite(amount)) return null;

  const multiplier =
    unit === 'minute'
      ? 60 * 1000
      : unit === 'hour'
        ? 60 * 60 * 1000
        : unit === 'day'
          ? DAY_MS
          : unit === 'week'
            ? 7 * DAY_MS
            : unit === 'month'
              ? 30 * DAY_MS
              : null;

  return multiplier ? new Date(now.getTime() - amount * multiplier) : null;
}

export function isWithinFreshnessWindow(
  postedAt: unknown,
  maxDaysOld: number | null | undefined,
  now = new Date(),
): boolean {
  if (!maxDaysOld || maxDaysOld <= 0) return true;
  const postedDate = normalizeJobPostedDate(postedAt, now);
  if (!postedDate) return false;
  return postedDate.getTime() >= now.getTime() - maxDaysOld * DAY_MS;
}

export function findPostedDateText(value: string | null | undefined): string | null {
  if (!value) return null;
  const patterns = [
    /\b(?:just posted|posted today|today|yesterday)\b/i,
    /\b(?:posted\s*)?(?:about\s*)?\d+\s*(?:minute|hour|day|week|month)s?\s*(?:ago|old)\b/i,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[0]) return match[0];
  }
  return null;
}
