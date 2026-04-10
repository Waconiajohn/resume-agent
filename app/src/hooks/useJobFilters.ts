import { useState, useEffect, useCallback } from 'react';

export type PostedWithin = '24h' | '3d' | '7d' | '14d';

export interface WorkModes {
  remote: boolean;
  hybrid: boolean;
  onsite: boolean;
}

export interface JobFilters {
  location: string;
  radiusMiles: number;
  workModes: WorkModes;
  postedWithin: PostedWithin;
}

const DEFAULT_FILTERS: JobFilters = {
  location: '',
  radiusMiles: 25,
  workModes: { remote: true, hybrid: true, onsite: false },
  postedWithin: '7d',
};

function isPostingWithin(value: unknown): value is PostedWithin {
  return value === '24h' || value === '3d' || value === '7d' || value === '14d';
}

function loadFromStorage(key: string): JobFilters {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return DEFAULT_FILTERS;
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const location = typeof parsed.location === 'string' ? parsed.location : DEFAULT_FILTERS.location;

    const radiusRaw = parsed.radiusMiles;
    const radiusMiles =
      typeof radiusRaw === 'number' && [10, 25, 50, 100].includes(radiusRaw)
        ? radiusRaw
        : DEFAULT_FILTERS.radiusMiles;

    const modesRaw = parsed.workModes;
    const workModes: WorkModes =
      modesRaw && typeof modesRaw === 'object' && !Array.isArray(modesRaw)
        ? {
            remote: (modesRaw as Record<string, unknown>).remote === true,
            hybrid: (modesRaw as Record<string, unknown>).hybrid === true,
            onsite: (modesRaw as Record<string, unknown>).onsite === true,
          }
        : { ...DEFAULT_FILTERS.workModes };

    const postedWithin = isPostingWithin(parsed.postedWithin)
      ? parsed.postedWithin
      : DEFAULT_FILTERS.postedWithin;

    return { location, radiusMiles, workModes, postedWithin };
  } catch {
    return DEFAULT_FILTERS;
  }
}

export function useJobFilters(storageKey = 'job-filters') {
  const [filters, setFilters] = useState<JobFilters>(() => loadFromStorage(storageKey));

  // Persist on every change
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(filters));
    } catch {
      // Storage may be unavailable in some contexts — fail silently
    }
  }, [filters, storageKey]);

  const setLocation = useCallback((location: string) => {
    setFilters((prev) => ({ ...prev, location }));
  }, []);

  const setRadiusMiles = useCallback((radiusMiles: number) => {
    setFilters((prev) => ({ ...prev, radiusMiles }));
  }, []);

  const setWorkModes = useCallback((workModes: WorkModes) => {
    setFilters((prev) => ({ ...prev, workModes }));
  }, []);

  const setPostedWithin = useCallback((postedWithin: PostedWithin) => {
    setFilters((prev) => ({ ...prev, postedWithin }));
  }, []);

  return {
    filters,
    setLocation,
    setRadiusMiles,
    setWorkModes,
    setPostedWithin,
  };
}
